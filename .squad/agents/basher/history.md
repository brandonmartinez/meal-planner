# Project Context

- **Owner:** Brandon Martinez
- **Project:** meal-planner — family meal planning app with a public Magic Mirror display
- **Stack:** pnpm monorepo (Node 20+, pnpm 9). `packages/api`: Express 5 + Prisma 6 + PostgreSQL (Google OAuth via Passport, JWT in httpOnly cookies, hashed API keys, Zod, Helmet/CORS/rate-limit/Morgan). `packages/web`: React 19 + Vite 6 + React Router v7 + Tailwind v4 (MSW in tests). `packages/shared`: pure TS types/constants (`@meal-planner/shared`). TypeScript strict + ESM (`.js` suffix on api runtime imports). Vitest (api `globals:false` + prismaMock; web `globals:true` + MSW). Docker + `k8s/` + CI (Postgres 16 service).
- **Created:** 2026-06-30

## Core Context

DevOps / Platform. Owns Docker, `k8s/`, CI (`.github/workflows/ci.yml`), and the build pipeline. CI order: shared → generate Prisma → api → web → tests (Postgres 16 service). Secrets come from env vars — never committed. `pnpm db:migrate` = deploy; `db:migrate:dev` = create migration.

## Recent Updates

📌 Team initialized on 2026-06-30 (Ocean's Eleven cast).

📌 Recent update (2026-06-30T15:08:40-04:00): Infra review filed #21 (devcontainer SSH), #22 (Docker harden), #23 (CI lint), #24 (compose drift), #25 (k8s immutable tags), and #26 (migrations out of startup).

📌 Sprint 1 batch (2026-06-30T17:04:41-04:00): Shipped three infra issues, each on its own worktree + draft PR off main. (1) #32 `squad/32-devcontainer-default` PR #33 — made the devcontainer the default dev/test/run env; added `scripts/dc-exec.sh`, devcontainer-first READMEs, and a `CONTRIBUTING.md` no-host-runs rule (two approved run paths: devcontainer + CI). (2) #23 `squad/23-ci-lint` PR #35 — added repo-wide `pnpm -r run lint` to the CI `test` job, fail-fast before build/test, build order preserved. (3) #13 `squad/13-align-node-version` PR #36 — aligned the Node engine to `>=22`. All three left draft; CI is verification of record.

📌 Sprint 3 batch (2026-06-30T21:57:00-04:00): Two infra issues, both merged & closed. #22 — hardened the prod Docker image (non-root user, frozen lockfile); security gate PASSED. #24 — fixed compose drift between root and devcontainer configs.

📌 Sprint 4 batch (2026-06-30T21:57:01-04:00): #25 (PR #63) — pinned k8s to immutable image tags; Rusty infra gate APPROVE. #26 (PR #64) — moved prod migrations out of multi-replica startup; Rusty gate first REQUEST-CHANGES (migrate-job hardcoded `:latest`), relaunched to consume #25's single-source pinned tag in `kustomization.yaml`; `deploy.sh` now runs the migrate Job first (fail-fast) then `apply -k`; re-gate APPROVE.

📌 Sprint 5 batch (2026-06-30T21:57:02-04:00): #42 (PR #66) — CI migration validation: `prisma migrate deploy` + `migrate diff --exit-code` drift check in the test job. Rusty infra gate APPROVE. Merged & closed.

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->
