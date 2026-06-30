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

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->
