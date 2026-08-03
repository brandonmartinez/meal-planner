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

📌 Sprint 2 batch (2026-06-30T18:32:22-04:00): Landed all three coverage issues (#20 PR #45, #18 PR #46, #19 PR #48). CI surfaced two real bugs the coordinator fixed. All CLOSED.

📌 Team update (2026-07-01T17-12-00Z): #87/#88 MCP bearer auth tests added. — decided by Yen

📌 Team update (2026-07-02T19:53:00Z): Wave 3 shipped PR #129 v0.4.0 test matrix docs. — logged by Scribe

📌 Team update (2026-07-05T12:57:39-0400): Livingston picked up #180 MCP meal:image upload. — logged by Scribe

## Learnings

### 2026-07-28T10:15:00-04:00 — #218 grocery grouping coverage audit

Audited the new grocery grouping behavior for #218, independently re-ran the suite, and added 7 edge-case tests in commit `5e214ec`. Verdict: PASS, with 588 tests passing and no bugs found in the audited grouping coverage.

### 2026-08-03 (AM) — Grid view integration verification and adversarial testing (summary)

- **Phase-1 integration verification (`e5765fc`):** verified three-agent parallel landing (Saul schema, Livingston shared/api/mcp, Linus web). Build PASS, lint PASS, tests PASS 1807 (+15 mine). Added regression guards: export ordering, `InstructionKind` enum drift, `useMediaQuery`, and an end-to-end derive→serve→render pipeline test (`TabularRecipeView.pipeline.test.tsx`) using the po'boy fixture.
- **FINAL verify AM (`421c25d`):** post `07c21b2`/`0a90fdb`/`118370c`. Tests PASS 1840. Confirmed Linus corrected (not weakened) the pipeline test: now asserts `Array(n).fill(null)` groups and NO grocery-aisle pills. **Found 2 adversarial label defects** documented as `it.fails`: D1 (adverbial opener returned as whole label: "Meanwhile, cook the pasta"→"Meanwhile") and D2 (`to/for` strip removing seconds/days that `extractSubLabel` never re-shows).
- **Post `d467f29`:** confirmed Linus converted both `it.fails` to passing with exact assertions. Tests PASS 1845 (web 670). Found 5th-family defects (prepositional/numeric openers: "In a large bowl," / "For the sauce," / "2 minutes before serving,"). Documented as 6 new `it.fails`. Verdict: SHIP Phase 1.
- **Post `c46855b`+`c358937` last confirm:** Tests PASS 1863 (web 688). Confirmed Linus converted 6 fifth-family `it.fails` to passing. No genuine eighth family. Verdict: SHIP Phase 1. Captured `final-{desktop,tablet}-light.png`.

### 2026-08-03 — REAL-DATA verdict (first end-to-end pass against Brandon's live dev DB)

Docker Postgres 16 (`saul-mealdb`, localhost:5432) up with Brandon's actual data: **74 meals / 365 ingredients / 61 instructions**. Real API (tsx :3001) + web (vite :5199); headless Edge over CDP — real network responses.

**Real stack works.** Grid `<table>` renders real meal data; Grid↔List toggle persists to `localStorage` across reload. Loading spinner + 404 error state both observed.

**THE MEASUREMENT (all 74 meals; replica matcher cross-validated 0 failures vs real `dist/deriveRecipeMatrix.js`):**
- All 74 meals DERIVED; all `groupLabel` null (categories are grocery aisles).
- **58/74 meals (78%) have ZERO instructions** → Grid = ingredient column, empty right side.
- Of 16 instruction-bearing meals: **1 clean (Miso-Glazed Cod), 15 over-bracket (94%).**
- **61 PROCESS steps → 26 over-inclusive (43%), 3 degenerate full-span.**
- Severity: 7/15 over-meals bracket >half the list. Worst: Birria 0.63.

**Recommendation:** SHIP Phase 1 with List as the default. Derived Grid is structurally sound but low-value on real data: 78% empty, 94% of the rest over-bracket. Root cause = shopping-order ingredients. Routing to coordinator for product call.

Added `deriveRecipeMatrix.realdata.test.ts` (5 PASSING characterization tests: Birria over-bracket, Miso-Cod clean, no-instruction shape). Commit `19fb67c`.

Finding: `/api/auth/*` 15-min in-memory rate limit → 429 under reload burst → /login bounce. Not a Grid defect; noted for middleware owner.

### 2026-08-03 (PM) — FINAL real-data measurement after use-ordering + matcher hardening

Re-ran the full 74-meal real-DB measurement after: use-ordering (`ad63eb8`/`d325227`), matcher hardening (`a008feb`/`09eb5b4`), seed revamp (`bf9fa90`/`db75522`), boundary-cut labels (`f8a87f3`). Imported the REAL compiled `deriveRecipeMatrix` + a verbatim copy of matcher internals; cross-validated — **0 mismatches on all 94 meals** (74 real + 20 seed).

**Build/test/lint:** `pnpm -r build` ✓. Tests **1903 PASS, 0 fail** (shared 53, mcp 121, web 706, api 1023). Lint 0 errors, 6 pre-existing `no-explicit-any` warnings.

**Over-bracketing delta (directly comparable to the baseline):**
| metric | baseline | after PM batch | delta |
|---|---|---|---|
| Clean instruction-bearing meals | 1/16 | **9/16** | +8 |
| Over-bracketing meals | 15/16 | **7/16** | −8 |
| Over-inclusive PROCESS steps | 26/61 | **9/61** | −17 (−65%) |

Use-ordering eliminated the "scattered mise-en-place" over-bracket cause. The 9 residual over-steps are all assembly/serve/fold steps reusing an earlier-used ingredient — the **intrinsic cross-step-reuse / DAG-vs-tree residual**. Only Phase-2 authored spans close it. Max stray 4 ingredients. Birria's braise now strays only **white onion** (baseline swept corn tortillas + oaxaca cheese).

**New seed (20 meals) independently confirmed:** Saul's "11/11 derived clean" cross-validated — 0 over-steps across all derived seed recipes. The 3 authored: identity permutation ✓, all spans in range ✓, render SETUP/PROCESS/FINISH cascades with group pills + timer sub-labels as intended.

**Ordering mechanism audited:** `ingredients` stays canonical position order in API response — only `buildTabularRecipe.ts` walks displayOrder — List/Grocery/checklist/MealDetailModal all read `ingredients`. Authored ⇒ identity permutation. `ingredientDisplayOrder` a valid permutation of `0..n-1` on all 94 meals. a11y: `<th scope=row id=…row-k>` in DISPLAY order; braise `<td headers>` references `row-0..row-4` (contiguous display span) — verified in real browser DOM.

My `deriveRecipeMatrix.realdata.test.ts` (`19fb67c`) was correctly re-baselined by Livingston in `ad63eb8`/`a008feb` — strengthened with exact displayOrder assertions and explicit pinning of the residual as "intrinsic, not a bug".

**6 `decision-*.png` captured** (real app + server + DB, light 1440): Birria after use-ordering (braise strays only onion), Korean over-bracket (serve/assembly residual), no-instruction shape, derived Bolognese (no group pills), partially-authored Chili (derived + authored `groupLabel`), fully-authored Lasagna (the Phase-2 target). Session files dir.

**VERDICT: SHIP.** Derived Grid is now structurally trustworthy for well-formed, use-ordered recipes. Two honest caveats: (1) 78% of the current library has no instructions → empty Grid (a data-entry gap, not a code defect; List is the lossless default). (2) ~15% residual over-bracket on assembly/reuse steps is intrinsic and only Phase-2 authored spans fully close it. Highest-value next investment: Phase-2 authoring editor + encouraging instruction entry — NOT further matcher tuning (hardening impact: 1+0 steps — diminishing returns). Commits `983b21a`, `afe721f`.
