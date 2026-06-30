#!/usr/bin/env bash
#
# dc-exec.sh — run a command inside the running Meal Planner devcontainer.
#
# Per team policy, NO project code (pnpm / test / lint / Prisma / dev) runs on
# the host. This wrapper execs a command inside the `app` service defined in
# .devcontainer/docker-compose.yml so every normal dev/test workflow happens in
# the container (CI is the other approved, containerized run path).
#
# Usage:
#   scripts/dc-exec.sh <command> [args...]
#
# Examples:
#   scripts/dc-exec.sh pnpm install
#   scripts/dc-exec.sh pnpm dev
#   scripts/dc-exec.sh pnpm -r test
#   scripts/dc-exec.sh pnpm -r lint
#   scripts/dc-exec.sh pnpm db:migrate
#   scripts/dc-exec.sh bash          # interactive shell in /workspace
#
# Environment overrides:
#   DEVCONTAINER_SERVICE   compose service to target   (default: app)
#   DEVCONTAINER_USER      user to exec as             (default: node)
#   DEVCONTAINER_WORKDIR   working directory           (default: /workspace)
#
set -euo pipefail

# Resolve the repo root so the wrapper works from any subdirectory.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

COMPOSE_FILE="${REPO_ROOT}/.devcontainer/docker-compose.yml"
SERVICE="${DEVCONTAINER_SERVICE:-app}"
USER_NAME="${DEVCONTAINER_USER:-node}"
WORKDIR="${DEVCONTAINER_WORKDIR:-/workspace}"

if [[ $# -eq 0 ]]; then
  echo "Usage: scripts/dc-exec.sh <command> [args...]" >&2
  echo "Example: scripts/dc-exec.sh pnpm -r test" >&2
  exit 2
fi

# Pick a Docker Compose invocation: prefer the v2 plugin, fall back to v1.
if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  echo "error: neither 'docker compose' nor 'docker-compose' is available." >&2
  echo "Install Docker Desktop / the Compose plugin, then retry." >&2
  exit 127
fi

# Use a TTY only when we're attached to one (so CI/non-interactive use works).
TTY_FLAGS=()
if [[ -t 0 && -t 1 ]]; then
  TTY_FLAGS=(-it)
fi

# Verify the service container is up; give an actionable hint if it isn't.
if ! "${COMPOSE[@]}" -f "${COMPOSE_FILE}" ps --status running --services 2>/dev/null \
    | grep -qx "${SERVICE}"; then
  echo "error: devcontainer service '${SERVICE}' is not running." >&2
  echo "Start it with one of:" >&2
  echo "  - Open the folder in VS Code → 'Reopen in Container'" >&2
  echo "  - devcontainer up --workspace-folder ." >&2
  echo "  - ${COMPOSE[*]} -f .devcontainer/docker-compose.yml up -d" >&2
  exit 1
fi

exec "${COMPOSE[@]}" -f "${COMPOSE_FILE}" exec \
  "${TTY_FLAGS[@]}" \
  -u "${USER_NAME}" \
  -w "${WORKDIR}" \
  "${SERVICE}" "$@"
