# Devcontainer — the default dev / test / run environment

**Policy: do not run project code on the host.** All `pnpm`, test, lint, build,
Prisma, and `dev` commands run **inside the devcontainer** (or in CI). The host
is for editing files, `git`, and `gh` only. This keeps every developer on the
same Node 22 / pnpm 9 / PostgreSQL 16 toolchain and matches what CI runs.

There are exactly two approved, containerized run paths:

1. **The devcontainer** — for local development (this document).
2. **CI** (`.github/workflows/ci.yml`) — runs on every push / PR.

## Quick start

### Fastest path: `./dev.sh` (no VS Code)

From a plain terminal at the repo root, with Docker running:

```sh
./dev.sh            # up the stack, install, migrate, generate, run API + web
./dev.sh --seed     # same, plus seed the demo dataset first
./dev.sh --fresh    # force a clean `pnpm install`
./dev.sh --no-apps  # bootstrap only (no dev servers) — CI-style
./dev.sh --down     # stop the whole stack
```

It brings up the devcontainer (app + Postgres) with plain Docker Compose,
ensures deps/Prisma client/migrations are in place, then runs the dev servers
**inside the container** and streams their logs:

- Web app: <http://localhost:5173>
- API: <http://localhost:3001>

Press Ctrl-C to stop the dev servers (containers stay up for a fast restart);
`./dev.sh --down` stops everything. The extra host port publishing that makes
this work without VS Code lives in
`.devcontainer/docker-compose.dev-ports.yml` (layered on automatically by
`dev.sh`).

### VS Code

1. **Open in the container.** In VS Code with the Dev Containers extension,
   run **"Dev Containers: Reopen in Container"**. Or from the CLI:

   ```sh
   devcontainer up --workspace-folder .
   # or, with plain compose:
   docker compose -f .devcontainer/docker-compose.yml up -d
   ```

   The first build runs `postCreateCommand`
   (`pnpm install && pnpm db:generate`) automatically.

2. **Run everything in the container.** Two equivalent ways:

   - **From the host**, via the wrapper (no SSH needed):

     ```sh
     scripts/dc-exec.sh pnpm dev
     scripts/dc-exec.sh pnpm -r test
     scripts/dc-exec.sh pnpm -r lint
     scripts/dc-exec.sh pnpm db:migrate
     ```

   - **Over SSH**, for an interactive shell (see below), then run commands
     normally inside `/workspace`.

## The `dc-exec.sh` wrapper

`scripts/dc-exec.sh` execs any command inside the running `app` service via
`docker compose exec`, from the repo's `/workspace` directory, as the `node`
user. Use it from the host for one-shot commands:

```sh
scripts/dc-exec.sh pnpm install      # install deps in-container
scripts/dc-exec.sh pnpm dev          # run API + web dev servers
scripts/dc-exec.sh pnpm -r test      # all workspace tests
scripts/dc-exec.sh pnpm -r lint      # all workspace lints
scripts/dc-exec.sh pnpm db:generate  # regenerate the Prisma client
scripts/dc-exec.sh pnpm db:migrate   # apply migrations (deploy)
scripts/dc-exec.sh pnpm db:seed      # seed the database
scripts/dc-exec.sh bash              # interactive shell in /workspace
```

Environment overrides (rarely needed):

| Variable               | Default      | Purpose                            |
| ---------------------- | ------------ | ---------------------------------- |
| `DEVCONTAINER_SERVICE` | `app`        | compose service to target          |
| `DEVCONTAINER_USER`    | `node`       | user to exec as                    |
| `DEVCONTAINER_WORKDIR` | `/workspace` | working directory in the container |

If the container isn't running, the wrapper prints how to start it and exits
non-zero — it never falls back to running on the host.

## SSH access

The devcontainer also runs an SSH server for local agents and terminals. SSH is
published on `localhost:2222`, uses public-key authentication only, and disables
root login.

### Provide your public key

Create a local, untracked authorized keys file before rebuilding or restarting
the devcontainer:

```sh
mkdir -p .devcontainer/ssh
cp ~/.ssh/id_ed25519.pub .devcontainer/ssh/authorized_keys
chmod 700 .devcontainer/ssh
chmod 600 .devcontainer/ssh/authorized_keys
```

Only public keys belong in `.devcontainer/ssh/authorized_keys`. Never copy
private keys, tokens, `.env*` files, generated host keys, or personal secrets
into the repo. The `.devcontainer/ssh/` directory is gitignored.

### Connect and run the app

Rebuild or restart the devcontainer after adding your key, then connect:

```sh
ssh -p 2222 node@localhost
# now you're inside /workspace — run commands normally:
pnpm dev
pnpm -r test
pnpm -r lint
pnpm db:migrate
```

The default SSH user is `node`. If your image uses a different non-root user,
set `DEVCONTAINER_SSH_USER` for the `app` service before rebuilding.

## Forwarded ports

The forwarded application ports remain available on the host:

- API: `http://localhost:3001`
- Web: `http://localhost:5173`
- PostgreSQL: `localhost:5432`
- SSH: `localhost:2222`
