# Kubernetes deployment (k3s)

Manifests for deploying Meal Planner. Deploy with `./deploy.sh` (run from the
repo root or `k8s/`), which expects `kubectl` configured against the target
cluster and the `meal-planner-secrets` Secret already created (see
`secrets.yaml.example`).

## Database migrations (issue #26)

Production migrations run as a **dedicated step**, not inside the app
container's per-replica startup. This avoids multiple replicas racing on
`prisma migrate deploy` during a rollout and decouples app startup from schema
migration.

How it works:

- **`migrate-job.yaml`** — a one-shot Kubernetes `Job` (`meal-planner-migrate`)
  that runs `prisma migrate deploy` exactly once per deploy. It uses the same
  image as the Deployment but overrides the command to run migrations directly,
  bypassing `docker-entrypoint.sh`.
- **`deploy.sh`** applies the Job **before** the Deployment, then waits for it:
  - On success → proceeds to roll out the app.
  - On failure or timeout → prints the Job logs and **aborts the rollout**, so
    a broken migration never reaches the new replicas.
- **`deployment.yaml`** sets `SKIP_MIGRATIONS=1` on the app container, so app
  pods never run migrations on startup.

`SKIP_MIGRATIONS=1` remains supported by `docker-entrypoint.sh` for app
containers and debugging. Keep the image tag in `migrate-job.yaml` in lockstep
with `deployment.yaml` so the schema applied matches the code being rolled.

### Manual / break-glass

Run migrations on their own without a full deploy:

```bash
kubectl delete job meal-planner-migrate --ignore-not-found
kubectl apply -f k8s/migrate-job.yaml
kubectl wait --for=condition=complete job/meal-planner-migrate --timeout=180s
kubectl logs job/meal-planner-migrate
```

## Local / dev migrations (unchanged)

Local and dev migration workflows are unaffected — run them in the devcontainer:

```bash
scripts/dc-exec.sh pnpm db:migrate      # apply (prisma migrate deploy)
scripts/dc-exec.sh pnpm db:migrate:dev  # create + apply a new migration
```
