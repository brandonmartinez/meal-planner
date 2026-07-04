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
📌 Team update (2026-07-01T17-12-00Z): #87/#88 MCP bearer auth implementation landed; reviewer-lockout remediation handled by Rusty. — decided by Livingston
📌 Team update (2026-07-02T10:16:59-0400): Nine epic #91 recipe-management issues were filed under Livingston ownership for future backend/service planning. — logged by Scribe
📌 Team update (2026-07-02T10:59:35-04:00): Rusty produced a five-sprint recipe-management execution plan; Sprint 1 assigns Livingston #94 (recipe search/indexing) and #95 (grocery regeneration/source tracking). — logged by Scribe
📌 Team update (2026-07-02T12:14:30-04:00): Sprint 1 design gates APPROVED. #95 grocery regeneration/source tracking: additive origin(GENERATED|MANUAL)/edited/sourceMealIds; non-destructive ID-preserving merge (name|unit keyed); PATCH endpoint in #118. #94 recipe search/indexing: shared listMealsQuerySchema for REST+agent; MealListResponseDTO{items,total,limit,offset,hasMore} envelope adopted; offset/limit pagination; indexes reserved for #111; lastCookedOn via getLastCookedMap. Both issues closed, decision records posted. Ready for Sprint 2. — logged by Scribe
📌 Team update (2026-07-02T19:53:00Z): Wave 4 launched #99 from green main 67c4f42; last-cooked is DERIVED/no-migration. #107 tags/categories is held for a solo migration wave next, and #108 remains blocked on #107 — logged by Scribe.

📌 Team update (2026-07-02T19:16:33-04:00): Sprint 2 Waves 4–6 complete. #99 (last-cooked + times-cooked derivation) shipped PR #132 SHA bc6eae9 with single optimized query (both fields from same `mealSuggestion.findMany`), no schema change, family-scoped IDOR-safe. Drift-gate hotfix (pg_trgm GIN index declaration) merged inline to main: schema.prisma now declarative with `postgresqlExtensions` preview + `extensions = [pg_trgm]` + `@@index([name(ops: raw("gin_trgm_ops"))])`, reversing #94, unblocking Wave 6. CI drift gate now GREEN. All 7 recipe-metadata issues merged to main 233597b. v0.4.0 (P2) released. — logged by Scribe

📌 Team update (2026-07-02T21:37:00-0400): Sprint 3 Wave 1 complete. Livingston shipped #114 repeat previous week planning (`repeatWeek`, REST/agent/MCP/web parity); Basher shipped #104 image asset backend; Linus shipped #102 local cooking mode. Merges: #104 PR #137 SHA a9a5df5; #102 PR #138 SHA 6acf0d0; #114 PR #139 SHA 68b6637. — logged by Scribe

📌 Team update (2026-07-03T01:15:59-0400): Sprint 3 Wave 2 complete. #113 random meal selection merged via PR #140 (e95372c): auditable RNG meal selection/scheduling, REST+agent+MCP parity, no schema or CSV changes. — logged by Scribe

## 2026-07-03T02:23:57-0400 — Wave 3 shipped

- Shipped #120 ingredient normalization; PR #144 squash `e604ab3` merged after Saul #116 and before Linus #110. State reconciled by Scribe.

## 2026-07-03T03:07:00-0400 — Wave 4 shipped

- Shipped #115 category/collection week-filling; PR #149 squash `eafed5e` merged. `fillWeek()` creates unapproved suggestions, reuses random-plan filters, supports error/skip/replace, and adds REST/agent/MCP parity without schema changes.

📌 Team update (2026-07-03T17:14:44Z): Merged PR #158 (remove meal taxonomy categories #107, fold into tags + full parity removal) + PR #152 collection-side meal membership endpoint + 2 additional design decisions (collections-membership coordination) — Livingston
