#!/usr/bin/env bash
#
# dev.sh — one-command dev environment for Meal Planner, no VS Code required.
#
# Brings up the devcontainer (app + Postgres) with plain Docker Compose, makes
# sure dependencies, the Prisma client, and migrations are in place, then runs
# the API (:3001), MCP (:3100), and web (:5173) dev servers *inside the
# container* and streams their logs. This honors the team policy that no project
# code runs on the host — everything executes in the container; the host only
# orchestrates.
#
# Usage:
#   ./dev.sh [--seed] [--fresh] [--no-apps] [--down] [-h|--help]
#
# Options:
#   --seed      Run the database seed (pnpm db:seed) before starting the apps.
#   --fresh     Reinstall dependencies (pnpm install) even if node_modules exist.
#   --no-apps   Set everything up (up, install, migrate, generate) but don't
#               start the dev servers — handy for CI-style bootstrapping.
#   --down      Stop the devcontainer stack and exit (teardown helper).
#   -h, --help  Show this help.
#
# Ports (published to 127.0.0.1 by .devcontainer/docker-compose.dev-ports.yml):
#   http://localhost:5173  → web app
#   http://localhost:3001  → API
#   http://localhost:3100/mcp  → MCP hosted HTTP
#
# Stopping: press Ctrl-C to stop the dev servers (the containers keep running so
# the next start is fast). To stop the whole stack, run `./dev.sh --down`.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${SCRIPT_DIR}"

COMPOSE_FILE="${REPO_ROOT}/.devcontainer/docker-compose.yml"
PORTS_FILE="${REPO_ROOT}/.devcontainer/docker-compose.dev-ports.yml"
SERVICE="app"
DB_SERVICE="db"
USER_NAME="node"
WORKDIR="/workspace"

SEED=false
FRESH=false
NO_APPS=false
DOWN=false

for arg in "$@"; do
  case "$arg" in
    --seed) SEED=true ;;
    --fresh) FRESH=true ;;
    --no-apps) NO_APPS=true ;;
    --down) DOWN=true ;;
    -h|--help)
      sed -n '2,27p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "error: unknown option '$arg' (try --help)" >&2
      exit 2
      ;;
  esac
done

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

if ! docker info >/dev/null 2>&1; then
  echo "error: the Docker daemon isn't reachable. Start Docker and retry." >&2
  exit 1
fi

NPMRC_COMPOSE_FILE="${REPO_ROOT}/.devcontainer/docker-compose.npmrc.yml"

COMPOSE_FILES=(-f "${COMPOSE_FILE}" -f "${PORTS_FILE}")

# If the host has an npm config, mount that exact file read-only at the node
# user's home. The compose fragment is only included when the file exists, so
# contributors without ~/.npmrc do not get an accidental directory bind mount.
if [[ -f "${HOME:-}/.npmrc" ]]; then
  export HOST_NPMRC="${HOME}/.npmrc"
  COMPOSE_FILES+=(-f "${NPMRC_COMPOSE_FILE}")
fi

# Run a command inside the app container as the node user in /workspace.
in_app() {
  "${COMPOSE[@]}" "${COMPOSE_FILES[@]}" exec -T -u "${USER_NAME}" -w "${WORKDIR}" "${SERVICE}" "$@"
}

if [[ "${DOWN}" == true ]]; then
  echo "▶ Stopping the devcontainer stack…"
  "${COMPOSE[@]}" "${COMPOSE_FILES[@]}" down
  echo "✅ Stopped."
  exit 0
fi

echo "▶ Bringing up the devcontainer (app + Postgres)…"
"${COMPOSE[@]}" "${COMPOSE_FILES[@]}" up -d

echo "▶ Waiting for Postgres to accept connections…"
for _ in $(seq 1 60); do
  if "${COMPOSE[@]}" "${COMPOSE_FILES[@]}" exec -T "${DB_SERVICE}" pg_isready -U postgres >/dev/null 2>&1; then
    echo "  Postgres is ready."
    break
  fi
  sleep 1
done

# Ensure pnpm is available inside the container (postCreateCommand only runs
# under VS Code / the devcontainer CLI, not plain `compose up`).
if ! in_app bash -c 'command -v pnpm >/dev/null 2>&1'; then
  echo "▶ Installing pnpm in the container…"
  in_app bash -c 'npm install -g pnpm@9 >/dev/null 2>&1'
fi

if [[ "${FRESH}" == true ]]; then
  echo "▶ Installing dependencies (pnpm install --force)…"
  in_app bash -c 'pnpm install --force'
elif ! in_app bash -c 'test -d node_modules'; then
  echo "▶ Installing dependencies (pnpm install)…"
  in_app bash -c 'pnpm install'
fi

echo "▶ Applying migrations and generating the Prisma client…"
in_app bash -c 'pnpm db:migrate && pnpm db:generate'

echo "▶ Building workspace packages needed by the dev servers…"
in_app bash -c 'pnpm --filter @meal-planner/shared run build && pnpm --filter @meal-planner/mcp run build'

if [[ "${SEED}" == true ]]; then
  echo "▶ Seeding the database (pnpm db:seed)…"
  in_app bash -c 'pnpm db:seed'
fi

if [[ "${NO_APPS}" == true ]]; then
  echo "✅ Environment is ready (dev servers not started; --no-apps)."
  echo "   Start them later with: ./dev.sh"
  exit 0
fi

cat <<'BANNER'

✅ Dev environment is up. Starting API + web + MCP…

   Web app : http://localhost:5173
   API     : http://localhost:3001
   MCP     : http://localhost:3100/mcp

   Press Ctrl-C to stop the dev servers (containers stay up).
   Run './dev.sh --down' to stop the whole stack.

BANNER

# Stream the dev servers in the foreground. Use a TTY when we have one so
# Ctrl-C is forwarded to pnpm. Containers keep running after Ctrl-C.
TTY_FLAGS=(-T)
if [[ -t 0 && -t 1 ]]; then
  TTY_FLAGS=(-it)
fi
exec "${COMPOSE[@]}" "${COMPOSE_FILES[@]}" exec "${TTY_FLAGS[@]}" -u "${USER_NAME}" -w "${WORKDIR}" "${SERVICE}" pnpm dev
