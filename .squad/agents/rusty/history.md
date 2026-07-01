# Project Context

- **Owner:** Brandon Martinez
- **Project:** meal-planner — family meal planning app with a public Magic Mirror display
- **Stack:** pnpm monorepo (Node 20+, pnpm 9). `packages/api`: Express 5 + Prisma 6 + PostgreSQL (Google OAuth via Passport, JWT in httpOnly cookies, hashed API keys, Zod, Helmet/CORS/rate-limit/Morgan). `packages/web`: React 19 + Vite 6 + React Router v7 + Tailwind v4 (MSW in tests). `packages/shared`: pure TS types/constants (`@meal-planner/shared`). TypeScript strict + ESM (`.js` suffix on api runtime imports). Vitest (api `globals:false` + prismaMock; web `globals:true` + MSW). Docker + `k8s/` + CI (Postgres 16 service).
- **Created:** 2026-06-30

## Core Context

Lead / Architect. Owns cross-package contracts, scope, and code review. Build/CI order is shared → generate Prisma → api → web — keep it intact.

## Recent Updates

📌 Team initialized on 2026-06-30 (Ocean's Eleven cast).

📌 Recent update (2026-06-30T15:08:40-04:00): Architecture review filed #5 (MCP epic), #12 (shared DTOs), and #13 (Node version).

📌 Sprint 1 batch (2026-06-30T17:04:41-04:00): Two roles this sprint. (1) Authored #12 `squad/12-shared-dtos` PR #38 (draft) — made `@meal-planner/shared` the single source of truth for serialized API response DTOs (new `src/types/dto.ts`: SerializedUser, FamilyMemberDTO, FamilyDTO, ApiKeyListItemDTO, CreatedApiKeyDTO, ImportMealsResultDTO), removed duplicate web-local interfaces. These DTOs are the wire contract MCP must reuse — the foundational MCP contract surface. Calls: services keep returning Prisma shapes (serialize at `res.json()`), dates are ISO strings, api-key secret-once invariant preserved. (2) Acting as the independent Lead security gate on Frank's #11 (fail-closed secrets) — in review, since Frank can't self-gate.

📌 Sprint 2 batch (2026-06-30T18:32:22-04:00): Ran the independent security gates on Frank's two PRs (author was Frank, so I review since he can't self-gate). #10 `PR #41` (scoped rate limits) → APPROVE. #6 `PR #47` (scoped MCP agent credentials) → APPROVE on all 11 acceptance criteria. Because every agent PR shares author `brandonmartinez`, `gh pr review --approve` is blocked — gate verdicts posted as review comments instead; Squad-layer independence (reviewer ≠ author) still holds. #6 stays OPEN: management endpoints deferred to #50.

📌 Sprint 4 batch (2026-06-30T21:57:01-04:00): Two roles. (1) Authored #5 `PR #65` — the MCP server package `packages/mcp`; Frank's independent security gate APPROVE. Coordinator fixed 2 TS compile errors before merge (`agent.ts` `mealId` scope hoist; mcp `ToolResult` index signature) and regenerated `pnpm-lock.yaml`. (2) Ran the infra gates on Basher's k8s PRs: #25 `PR #63` (immutable image tags) → APPROVE; #26 `PR #64` (migrations out of multi-replica startup) → first REQUEST-CHANGES (migrate-job hardcoded `:latest`), then APPROVE after it consumed #25's single-source pinned tag and moved migrate to a fail-fast Job in `deploy.sh`.

📌 Sprint 5 batch (2026-06-30T21:57:02-04:00): Infra gate on Basher's #42 `PR #66` (CI migration validation — `prisma migrate deploy` + `migrate diff --exit-code` drift check in the test job) → APPROVE. All Sprint 1–5 milestones now closed.

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->
