# Contributing to Meal Planner

Thanks for contributing! This project has one hard rule about **where** code
runs, plus the usual workflow notes.

## 🚫 No host runs — use the devcontainer or CI

**Do not run project code on your host machine.** All `pnpm`, test, lint, build,
Prisma, and `dev` commands must run **inside the devcontainer** or in **CI** —
never directly on your laptop.

Why:

- Everyone runs the exact same toolchain (Node 22, pnpm 9, PostgreSQL 16) that
  CI uses, so "works on my machine" drift disappears.
- The database, ports, and environment are provisioned by
  `.devcontainer/docker-compose.yml` — no host Postgres or global pnpm needed.

There are exactly two approved, containerized run paths:

1. **The devcontainer** — local development.
2. **CI** (`.github/workflows/ci.yml`) — runs automatically on every push / PR
   and is the verification of record.

What the host **is** for: editing files, `git`, `gh`, and Docker/devcontainer
lifecycle commands. That's it.

### Run commands in the container

Start the container once (VS Code **"Reopen in Container"**, or
`devcontainer up --workspace-folder .`), then run everything through the
wrapper from the host:

```sh
scripts/dc-exec.sh pnpm install      # install deps
scripts/dc-exec.sh pnpm dev          # API + web dev servers
scripts/dc-exec.sh pnpm -r test      # all workspace tests
scripts/dc-exec.sh pnpm -r lint      # all workspace lints
scripts/dc-exec.sh pnpm db:generate  # regenerate the Prisma client
scripts/dc-exec.sh pnpm db:migrate   # apply migrations (deploy)
scripts/dc-exec.sh pnpm db:seed      # seed the database
scripts/dc-exec.sh bash              # interactive shell in /workspace
```

`scripts/dc-exec.sh` execs the command inside the running `app` compose service
(as the `node` user, in `/workspace`). If the container isn't running it tells
you how to start it and **refuses to fall back to the host**.

Prefer an interactive shell? SSH in and run commands normally:

```sh
ssh -p 2222 node@localhost
pnpm -r test
```

See [`.devcontainer/README.md`](.devcontainer/README.md) for SSH key setup,
wrapper overrides, and forwarded ports.

## Before opening a PR

Run the same checks CI runs — **inside the container**:

```sh
scripts/dc-exec.sh pnpm -r lint
scripts/dc-exec.sh pnpm -r test
scripts/dc-exec.sh pnpm -r build
```

CI (`.github/workflows/ci.yml`) builds in order — shared → Prisma generate →
api → web — then runs all tests against a PostgreSQL 16 service. Match that
order if you reproduce a failure locally.

## Commit & branch conventions

- Branch from `main`; keep changes focused.
- Reference the issue you're closing in the PR body (e.g. `Closes #32`).
- Don't commit secrets. `.env*` files and `.devcontainer/ssh/` are gitignored —
  keep it that way.
