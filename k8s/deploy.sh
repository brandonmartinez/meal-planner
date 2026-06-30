#!/bin/bash
set -euo pipefail

echo "Deploying Meal Planner to k3s..."

# Apply secrets (must be created manually first)
# kubectl apply -f k8s/secrets.yaml

# --- Database migrations (issue #26) -----------------------------------------
# Run schema migrations ONCE, before rolling the app, via a dedicated Job —
# not inside each app replica's startup. The rollout is blocked until the Job
# completes successfully; a failed migration aborts the deploy so broken schema
# never reaches the new replicas.
echo "Running database migrations (meal-planner-migrate Job)..."
# Job specs are largely immutable, so clear any prior run before re-applying.
kubectl delete job meal-planner-migrate --ignore-not-found
kubectl apply -f k8s/migrate-job.yaml

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
    echo "ERROR: migration job failed — aborting rollout." >&2
    kubectl logs job/meal-planner-migrate --tail=100 || true
    exit 1
  fi
  if [ "$SECONDS" -ge "$migrate_deadline" ]; then
    echo "ERROR: timed out waiting for migration job — aborting rollout." >&2
    kubectl logs job/meal-planner-migrate --tail=100 || true
    exit 1
  fi
  sleep 3
done

# --- Application rollout ------------------------------------------------------
# Apply manifests
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml

# Wait for rollout
kubectl rollout status deployment/meal-planner --timeout=120s

echo "Deployment complete!"
echo "App available at: https://meals.themartinez.cloud"
