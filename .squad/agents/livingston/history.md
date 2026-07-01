# Project Context

- **Owner:** Brandon Martinez
- **Project:** meal-planner — family meal planning app with a public Magic Mirror display
- **Stack:** pnpm monorepo (Node 20+, pnpm 9). `packages/api`: Express 5 + Prisma 6 + PostgreSQL (Google OAuth via Passport, JWT in httpOnly cookies, hashed API keys, Zod, Helmet/CORS/rate-limit/Morgan). `packages/web`: React 19 + Vite 6 + React Router v7 + Tailwind v4 (MSW in tests). `packages/shared`: pure TS types/constants (`@meal-planner/shared`). TypeScript strict + ESM (`.js` suffix on api runtime imports). Vitest (api `globals:false` + prismaMock; web `globals:true` + MSW). Docker + `k8s/` + CI (Postgres 16 service).
- **Created:** 2026-06-30

## Core Context

Backend Dev. Owns `packages/api`. Auth chain: `authenticateJWT` → `requireMembership` → optional `requireRole(Role.PARENT)`; Magic Mirror uses `authenticateApiKey`. API keys stored hashed only. ESM runtime imports use `.js` suffix. Schema changes go through the guarded migration flow.

## Recent Updates

📌 Team initialized on 2026-06-30 (Ocean's Eleven cast).

📌 Recent update (2026-06-30T15:08:40-04:00): Backend review filed #8 (meal difficulty), #7 (MCP backend), and co-sourced #9 (IDOR).

📌 Recent update (2026-06-30T15:28:32-04:00): Drafted #27 for recent indicator on meals browse, depending on #8 for difficulty display.

📌 Sprint 1 batch (2026-06-30T17:04:41-04:00): Shipped #9 (P1 IDOR) on `squad/9-family-scope-mutations`, PR #37. Closed the cross-family authorization gap by threading `familyId` into the suggestion/grocery service signatures and enforcing ownership in the Prisma `where` predicate (non-owned id → 404 before any write). Added domain error types (SuggestionError/MoveSuggestionError/GroceryError) mapped to 400/403/404, Zod schemas on the mutation bodies, and same-family/cross-family prismaMock tests. Frank's security gate APPROVED; PR flipped ready-for-review. HTTP contract unchanged (web client unaffected).

📌 Sprint 2 batch (2026-06-30T18:32:22-04:00): Shipped #8 backend+shared `PR #40` — nullable meal `difficulty` (EASY/MEDIUM/HARD) through the stack: a Prisma enum + nullable column (hand-authored migration, no DB available), the shared type/constant in `@meal-planner/shared`, Zod validation, and service threading. Linus carried the web UI in #44. #8 CLOSED.

📌 Sprint 3 batch (2026-06-30T21:57:00-04:00): #7 — MCP backend endpoints (current/prev week, schedule-by-date, approve-by-family), Zod-validated, returning shared DTOs. #27 backend — recent-meal indicator (Linus carried the web badge). Both merged & closed.

📌 Sprint 5 batch (2026-06-30T21:57:02-04:00): Three backend PRs, all Frank-gated APPROVE, merged & closed. #43 (PR #67) — trust-proxy config: `app.set("trust proxy", config.trustProxy)` default `1`, `TRUST_PROXY` env, `parseTrustProxy()`. #49 (PR #68) — observable audit drops: `safeRecordAgentAudit` wrapper with a 6-field allowlist `console.error`, replaced 18 silent `catch {}` sites, fail-open preserved. #51 (PR #69) — peppered HMAC-SHA256 credential hashing: `utils/credentialHash.ts` (`hashCredential` + `legacyHashCredential`), lazy legacy-rehash on verify, `CREDENTIAL_PEPPER` fail-closed in prod, no schema change; merged after #43/#49 with main synced in.

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->
