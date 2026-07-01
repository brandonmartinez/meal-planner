#!/bin/bash
set -euo pipefail

# Deploy Meal Planner to k3s using an immutable image tag, running database
# migrations once (before the app rollout) via a dedicated Job.
#
# Usage:
#   ./k8s/deploy.sh                 # deploy the tag pinned in kustomization.yaml
#   ./k8s/deploy.sh v1.0.42         # deploy a specific immutable tag (ad-hoc / rollback)
#   IMAGE_TAG=<sha> ./k8s/deploy.sh # same, via env var
#   RUN_MIGRATIONS=1 ./k8s/deploy.sh v1.0.42   # force migrations on an override deploy
#
# The pinned tag in k8s/kustomization.yaml is the source of truth (kept current
# by CI's pin-deploy-image job). Passing a tag here overrides it for this apply
# only and does NOT mutate tracked files -- handy for rollbacks without a commit.
#
# Ordering (issue #26): schema migrations run in the dedicated
# `meal-planner-migrate` Job BEFORE the Deployment is rolled forward, never
# inside each app replica's startup (that raced across replicas). The rollout is
# blocked until the Job completes; a failed/timed-out migration aborts the deploy
# so broken schema never reaches the new replicas.

cd "$(dirname "$0")"

IMAGE_NAME="ghcr.io/brandonmartinez/meal-planner"
IMAGE_TAG="${IMAGE_TAG:-${1:-}}"

if [ "$IMAGE_TAG" = "latest" ]; then
  echo "ERROR: refusing to deploy the mutable tag 'latest'." >&2
  echo "       Provide an immutable tag (vX.Y.Z or a commit SHA)." >&2
  exit 1
fi

# --- Helpers -----------------------------------------------------------------
# Select or drop the migrate Job from a `kubectl kustomize .` render. We render
# through kustomize so the Job inherits images[].newTag (the SAME pin as the
# Deployment) rather than the literal tag in migrate-job.yaml. Documents are
# separated by lines containing only `---`.
#   filter_docs keep  -> emit only the Job document
#   filter_docs drop  -> emit every document except the Job
filter_docs() {
  awk -v mode="$1" '
    function emit() {
      if (doc == "") return
      isjob = (doc ~ /(^|\n)kind: Job[ \t]*\n/)
      if ((mode == "keep" && isjob) || (mode == "drop" && !isjob)) printf("---\n%s", doc)
      doc = ""
    }
    /^---[ \t]*$/ { emit(); next }
    { doc = doc $0 "\n" }
    END { emit() }
  '
}

echo "Deploying Meal Planner to k3s..."

# Apply secrets (must be created manually first)
# kubectl apply -f k8s/secrets.yaml

# --- Rollback guard: decide whether to run migrations ------------------------
# `prisma migrate deploy` is FORWARD-ONLY -- it cannot undo a schema change. On
# a normal deploy (no override) we run migrations first, at the pinned tag. On an
# override deploy (IMAGE_TAG / $1 -- typically a rollback to an OLDER tag) we SKIP
# the migrate Job by default, because replaying forward migrations during a
# rollback is wrong and can corrupt a schema the older code cannot serve. Set
# RUN_MIGRATIONS=1 to force them (you accept they are forward-only).
run_migrations="true"
if [ -n "$IMAGE_TAG" ]; then
  if [ "${RUN_MIGRATIONS:-0}" = "1" ]; then
    echo "WARNING: override deploy of '${IMAGE_TAG}' with RUN_MIGRATIONS=1." >&2
    echo "         Applying FORWARD-ONLY migrations; prisma cannot roll a schema" >&2
    echo "         backward. Proceed only if the target image's schema is compatible." >&2
    run_migrations="true"
  else
    echo "NOTE: override tag '${IMAGE_TAG}' set -- skipping migrate Job (rollback-safe)."
    echo "      Migrations are forward-only; set RUN_MIGRATIONS=1 to force them."
    run_migrations="false"
  fi
fi

# --- Database migrations (issue #26) -----------------------------------------
if [ "$run_migrations" = "true" ]; then
  echo "Running database migrations (meal-planner-migrate Job) at the pinned image..."
  # Job pod templates are immutable, so clear any prior run before re-applying.
  kubectl delete job meal-planner-migrate --ignore-not-found
  # Apply ONLY the Job, rendered through kustomize so it carries images[].newTag
  # (identical to the Deployment's pin) -- not migrate-job.yaml's literal tag.
  kubectl kustomize . | filter_docs keep | kubectl apply -f -

  echo "Waiting for migration job to finish..."
  migrate_deadline=$((SECONDS + 180))
  while true; do
    complete=$(kubectl get job meal-planner-migrate \
      -o jsonpath='{.status.conditions[?(@.type=="Complete")].status}' 2>/dev/null || true)
    failed=$(kubectl get job meal-planner-migrate \
      -o jsonpath='{.status.conditions[?(@.type=="Failed")].status}' 2>/dev/null || true)

    if [ "$complete" = "True" ]; then
      echo "Migrations applied successfully."
      break
    fi
    if [ "$failed" = "True" ]; then
      echo "ERROR: migration job failed -- aborting rollout." >&2
      kubectl logs job/meal-planner-migrate --tail=100 || true
      exit 1
    fi
    if [ "$SECONDS" -ge "$migrate_deadline" ]; then
      echo "ERROR: timed out waiting for migration job -- aborting rollout." >&2
      kubectl logs job/meal-planner-migrate --tail=100 || true
      exit 1
    fi
    sleep 3
  done
fi

# --- Application rollout ------------------------------------------------------
if [ "$run_migrations" = "true" ]; then
  # Normal deploy: apply the full kustomize set. The migrate Job we just applied
  # is Complete, so re-applying the identical rendered spec is a harmless no-op
  # (ttlSecondsAfterFinished later reaps it).
  kubectl apply -k .
else
  # Override/rollback deploy: roll the app but EXCLUDE the migrate Job, so
  # `apply` never (re)creates it and triggers forward migrations during a
  # rollback. The Deployment image is repinned below via `kubectl set image`.
  kubectl kustomize . | filter_docs drop | kubectl apply -f -
fi

# Optional ad-hoc / rollback override: repin the running Deployment to an
# explicit immutable tag for this deploy only (does not mutate tracked files).
if [ -n "$IMAGE_TAG" ]; then
  echo "Overriding image tag for this deploy: ${IMAGE_NAME}:${IMAGE_TAG}"
  kubectl set image deployment/meal-planner "meal-planner=${IMAGE_NAME}:${IMAGE_TAG}"
fi

# Wait for rollout
kubectl rollout status deployment/meal-planner --timeout=120s

# Report the exact image now running so the deployed build is always identifiable.
DEPLOYED_IMAGE=$(kubectl get deployment/meal-planner \
  -o jsonpath='{.spec.template.spec.containers[0].image}')
echo "Deployment complete!"
echo "Deployed image: ${DEPLOYED_IMAGE}"
echo "App available at: https://meals.themartinez.cloud"
