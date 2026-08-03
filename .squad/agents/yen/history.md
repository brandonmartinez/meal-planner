# Project Context

- **Owner:** Brandon Martinez
- **Project:** meal-planner — family meal planning app with a public Magic Mirror display
- **Stack:** pnpm monorepo (Node 20+, pnpm 9). `packages/api`: Express 5 + Prisma 6 + PostgreSQL (Google OAuth via Passport, JWT in httpOnly cookies, hashed API keys, Zod, Helmet/CORS/rate-limit/Morgan). `packages/web`: React 19 + Vite 6 + React Router v7 + Tailwind v4 (MSW in tests). `packages/shared`: pure TS types/constants (`@meal-planner/shared`). TypeScript strict + ESM (`.js` suffix on api runtime imports). Vitest (api `globals:false` + prismaMock; web `globals:true` + MSW). Docker + `k8s/` + CI (Postgres 16 service).
- **Created:** 2026-06-30

## Core Context

Tester / QA. Owns test coverage across all packages. API tests: `globals: false` + `prismaMock` helper (no real PrismaClient). Web tests: `globals: true` + MSW handlers. Tests colocated with source. The `test-author` agent shares these patterns.

## Recent Updates

📌 Team initialized on 2026-06-30 (Ocean's Eleven cast).

📌 Recent update (2026-06-30T15:08:40-04:00): Test-coverage review filed #18 (route tests), #19 (page tests), and #20 (component tests).

📌 Sprint 2 batch (2026-06-30T18:32:22-04:00): Landed all three coverage issues. #20 `PR #45` — component tests for ImportMealsDialog/Layout/Navigation/ThemeToggle/WeekSelector. #18 `PR #46` — route-handler tests for auth/families/grocery/health/meals/weekPlan via a new `getRouteHandler` helper, service layer mocked. #19 `PR #48` — page-level tests for Login/CreateFamily/FamilySettings/GroceryList/WeekPlan (Meals/MealForm excluded — covered by #44). CI surfaced two real bugs the coordinator fixed: an ambiguous `/load example/i` query (also matched "Download example template") → anchored to `/^load example$/i`; and #19 error-banner tests assuming a fallback string when pages actually surface `ApiError.message` → MSW error bodies aligned. All CLOSED.

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->
📌 Team update (2026-07-01T17-12-00Z): #87/#88 MCP bearer auth tests added for bearer/x-agent-key compatibility and regressions. — decided by Yen
📌 Team update (2026-07-02T19:53:00Z): Wave 3 shipped PR #129 v0.4.0 test matrix docs with committed path Option A, live per-cell status markers, and CSV-portability callouts — logged by Scribe.
📌 Team update (2026-07-05T12:57:39-0400): Livingston picked up #180 MCP meal:image upload; Yen may be pulled in after PR for API/MCP test review around base64 payload validation, decoded-size rejection, and `meal:image` scope coverage. — logged by Scribe

### 2026-07-28T10:15:00-04:00 — #218 grocery grouping coverage audit

Audited the new grocery grouping behavior for #218, independently re-ran the suite, and added 7 edge-case tests in commit `5e214ec`. Verdict: PASS, with 588 tests passing and no bugs found in the audited grouping coverage.

### 2026-08-03T11:00:32-04:00 — Phase-1 tabular "Grid" recipe view integration verification

Verified the three-agent parallel landing (Saul schema, Livingston shared/api/mcp, Linus web) integrates. Real results: build PASS, lint PASS (0 errors; 6 pre-existing unrelated `any` warnings), test PASS **1807** (added 15 of mine). No integration bugs found. Ran offline via corepack pnpm cache (`~/.cache/node/corepack/v1/pnpm/9.15.4`) + node v22.14.0.

Contract seams checked, not trusted: DTO shape is a single shared type (`TabularRecipeMealDTO`) → compile-time parity; `InstructionKind` byte-identical to shared `INSTRUCTION_KINDS`; ingredient ordering defended at every layer (Prisma `orderBy position`, api `applyRecipeMatrix` re-sort, web `buildTabularRecipe` re-sort). Added regression guards: export/CSV-round-trip ordering (`mealsExportOrdering.test.ts`), enum drift (`instructionKindParity.test.ts`), untested `useMediaQuery` hook, and an end-to-end derive→serve→render pipeline test (`TabularRecipeView.pipeline.test.tsx`) using the po'boy.

Flagged one latent Phase-2 landmine (authored spanFrom is a `position` but web treats it as an array index — safe only while positions stay dense 0-based, which Phase 1 guarantees). Judged Livingston's 3 heuristic weaknesses: none blocks Phase 1 (List view is the lossless backstop); (b) min..max token-span is the highest Phase-2 priority. Captured 4 real-component screenshots (desktop/tablet × light/dark) to session-state `files/`. **Verdict: SHIP Phase 1.**
