# Kubernetes deployment

Manifests for running Meal Planner on k3s. Apply everything with Kustomize:

```bash
./k8s/deploy.sh
```

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
single source of truth for what is deployed.

### How the pin stays current

After a successful `build-and-push`, the CI `pin-deploy-image` job rewrites
`newTag` to the freshly built `v<version>` and commits it back to `main`
(`build: pin k8s deployment to v… [skip ci]`). The committed manifest therefore
always names the exact build running in production, so the deployed
commit/version is identifiable straight from git history.

## Deploying

```bash
# Deploy the tag currently pinned in kustomization.yaml
./k8s/deploy.sh

# Deploy / roll back to a specific immutable tag without editing tracked files
IMAGE_TAG=v1.0.41 ./k8s/deploy.sh
./k8s/deploy.sh 1a2b3c4            # commit SHA also works
```

`deploy.sh` refuses to deploy the mutable `latest` tag and prints the exact
image running after rollout completes.

## Rolling back

Either:

- **Ad-hoc:** `IMAGE_TAG=<previous-immutable-tag> ./k8s/deploy.sh`, or
- **Durable (GitOps):** revert `newTag` in `kustomization.yaml` to a previous
  value, commit, and run `./k8s/deploy.sh`.

`imagePullPolicy: IfNotPresent` is used because immutable tags are
content-stable, so a tag already cached on the node never needs re-pulling.
