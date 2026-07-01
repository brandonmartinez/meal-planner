#!/bin/bash
set -euo pipefail

# Deploy Meal Planner to k3s using an immutable image tag.
#
# Usage:
#   ./k8s/deploy.sh                 # deploy the tag pinned in kustomization.yaml
#   ./k8s/deploy.sh v1.0.42         # deploy a specific immutable tag (ad-hoc / rollback)
#   IMAGE_TAG=<sha> ./k8s/deploy.sh # same, via env var
#
# The pinned tag in k8s/kustomization.yaml is the source of truth (kept current
# by CI). Passing a tag here overrides it for this apply only and does NOT mutate
# tracked files -- handy for rollbacks without a commit.

cd "$(dirname "$0")"

IMAGE_NAME="ghcr.io/brandonmartinez/meal-planner"
IMAGE_TAG="${IMAGE_TAG:-${1:-}}"

if [ "$IMAGE_TAG" = "latest" ]; then
  echo "ERROR: refusing to deploy the mutable tag 'latest'." >&2
  echo "       Provide an immutable tag (vX.Y.Z or a commit SHA)." >&2
  exit 1
fi

echo "Deploying Meal Planner to k3s..."

# Apply secrets (must be created manually first)
# kubectl apply -f k8s/secrets.yaml

# Render and apply all manifests with the pinned image from kustomization.yaml.
kubectl apply -k .

# Optional ad-hoc / rollback override: repin to an explicit immutable tag.
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
