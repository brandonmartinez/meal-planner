# Kubernetes deployment (k3s)

Manifests for running Meal Planner on k3s. Apply everything with Kustomize via
the deploy script:

```bash
./k8s/deploy.sh
```

`deploy.sh` expects `kubectl` configured against the target cluster and the
`meal-planner-secrets` Secret already created (see `secrets.yaml.example`).

## Image tagging & immutability

CI (`.github/workflows/ci.yml`) builds and pushes three tags on every merge to
`main`:

| Tag | Mutable? | Purpose |
| --- | --- | --- |
| `:latest` | yes | convenience only — **never** deployed to production |
| `:<git-sha>` | no | immutable, traceable to an exact commit |
| `:v<version>` | no | immutable, `version = <VERSION file>.<run number>` (e.g. `v1.0.42`) |

Production **must** reference an immutable tag. The pin lives in
[`kustomization.yaml`](./kustomization.yaml) under `images[].newTag` and is the
**single source of truth** for what is deployed. Because both the Deployment
(`deployment.yaml`) and the migration Job (`migrate-job.yaml`) reference the same
image name (`ghcr.io/brandonmartinez/meal-planner`), that one `newTag` entry pins
**both** — the schema migration always runs at the exact tag the app rolls out.

### How the pin stays current

After a successful `build-and-push`, the CI `pin-deploy-image` job rewrites
`newTag` to the freshly built `v<version>` and commits it back to `main`
(`build: pin k8s deployment to v… [skip ci]`). The committed manifest therefore
always names the exact build running in production, so the deployed
commit/version is identifiable straight from git history.

## Database migrations (issue #26)

Production migrations run as a **dedicated step**, not inside the app
container's per-replica startup. This avoids multiple replicas racing on
`prisma migrate deploy` during a rollout and decouples app startup from schema
migration.

How it works:

- **`migrate-job.yaml`** — a one-shot Kubernetes `Job` (`meal-planner-migrate`)
  that runs `prisma migrate deploy` exactly once per deploy. It uses the same
  image as the Deployment (same pinned tag — see above) but overrides the command
  to run migrations directly, bypassing `docker-entrypoint.sh`.
- **`deploy.sh`** renders the Job through kustomize (so it inherits the pinned
  tag), applies it **before** the Deployment, then waits for it:
  - On success → proceeds to roll out the app with `kubectl apply -k .`.
  - On failure or timeout → prints the Job logs and **aborts the rollout**, so
    a broken migration never reaches the new replicas.
- **`deployment.yaml`** sets `SKIP_MIGRATIONS=1` on the app container, so app
  pods never run migrations on startup. `SKIP_MIGRATIONS=1` remains supported by
  `docker-entrypoint.sh` for app containers and debugging.

### ⚠️ Migrate-before-rollout is only safe for backward-compatible migrations

Because migrations apply **before** the new replicas start — and while the old
replicas are still serving — the schema change must be compatible with **both**
the old and new code at once. Use the **expand/contract** pattern:

1. **Expand:** add new columns/tables (nullable or defaulted), keep old ones.
   Deploy code that writes both / reads new-or-old.
2. **Contract:** in a *later* deploy, once no running code depends on the old
   shape, drop the obsolete columns/tables.

A destructive migration (dropping/renaming a column the currently-running code
still uses) will break the old replicas the moment it applies — do not ship one
in a single step.

### Rollback caveat — migrations are forward-only

`prisma migrate deploy` **cannot roll a schema backward.** To make this safe,
`deploy.sh` **skips the migrate Job on override/rollback deploys** (any
`IMAGE_TAG=…` / positional-tag invocation) by default, since replaying forward
migrations against older code is wrong. If you genuinely need migrations during
an override deploy, force them explicitly:

```bash
RUN_MIGRATIONS=1 IMAGE_TAG=v1.0.41 ./k8s/deploy.sh   # you accept: forward-only
```

To actually revert a schema you must roll forward with a new corrective
migration — you cannot "un-apply" one via rollback.

## Deploying

```bash
# Deploy the tag currently pinned in kustomization.yaml (runs migrations first)
./k8s/deploy.sh

# Deploy / roll back to a specific immutable tag without editing tracked files
# (migrations SKIPPED by default — see the rollback caveat above)
IMAGE_TAG=v1.0.41 ./k8s/deploy.sh
./k8s/deploy.sh 1a2b3c4            # commit SHA also works
```

`deploy.sh` refuses to deploy the mutable `latest` tag and prints the exact
image running after rollout completes. `imagePullPolicy: IfNotPresent` is used
because immutable tags are content-stable, so a tag already cached on the node
never needs re-pulling.

### Manual / break-glass migrations

Run migrations on their own (at the pinned tag) without a full deploy:

```bash
kubectl delete job meal-planner-migrate --ignore-not-found
kubectl kustomize k8s | \
  awk 'BEGIN{d=""} /^---[ \t]*$/{if(d~/(^|\n)kind: Job[ \t]*\n/)printf"---\n%s",d;d="";next}{d=d$0"\n"}END{if(d~/(^|\n)kind: Job[ \t]*\n/)printf"---\n%s",d}' | \
  kubectl apply -f -
kubectl wait --for=condition=complete job/meal-planner-migrate --timeout=180s
kubectl logs job/meal-planner-migrate
```

## Rolling back

Either:

- **Ad-hoc:** `IMAGE_TAG=<previous-immutable-tag> ./k8s/deploy.sh` (migrations
  skipped by default — forward-only, see caveat), or
- **Durable (GitOps):** revert `newTag` in `kustomization.yaml` to a previous
  value, commit, and run `./k8s/deploy.sh`.

## Local / dev migrations (unchanged)

Local and dev migration workflows are unaffected — run them in the devcontainer:

```bash
scripts/dc-exec.sh pnpm db:migrate      # apply (prisma migrate deploy)
scripts/dc-exec.sh pnpm db:migrate:dev  # create + apply a new migration
```
