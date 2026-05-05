#!/bin/bash
set -e

echo "Deploying Meal Planner to k3s..."

# Apply secrets (must be created manually first)
# kubectl apply -f k8s/secrets.yaml

# Apply manifests
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml

# Wait for rollout
kubectl rollout status deployment/meal-planner --timeout=120s

echo "Deployment complete!"
echo "App available at: https://meals.themartinez.cloud"
