# Project Context

- **Owner:** Brandon Martinez
- **Project:** meal-planner — family meal planning app with a public Magic Mirror display
- **Stack:** pnpm monorepo (Node 20+, pnpm 9). `packages/api`: Express 5 + Prisma 6 + PostgreSQL (Google OAuth via Passport, JWT in httpOnly cookies, hashed API keys, Zod, Helmet/CORS/rate-limit/Morgan). `packages/web`: React 19 + Vite 6 + React Router v7 + Tailwind v4 (MSW in tests). `packages/shared`: pure TS types/constants (`@meal-planner/shared`). TypeScript strict + ESM (`.js` suffix on api runtime imports). Vitest (api `globals:false` + prismaMock; web `globals:true` + MSW). Docker + `k8s/` + CI (Postgres 16 service).
- **Created:** 2026-06-30

## Core Context

Tester / QA. Owns test coverage across all packages. API tests: `globals: false` + `prismaMock` helper (no real PrismaClient). Web tests: `globals: true` + MSW handlers. Tests colocated with source. The `test-author` agent shares these patterns.

## History Summary (2026-06-30 through 2026-08-03 PM)

- **Sprint 2 (2026-06-30):** Team init. Filed and landed test-coverage PRs #20/#45 (component), #18/#46 (route), #19/#48 (page); CI surfaced two bugs fixed by coordinator. MCP bearer auth tests added (#87/#88). Wave 3: PR #129 v0.4.0 test matrix docs.
- **#218 grocery grouping (2026-07-28):** Audited grouping behavior; added 7 edge-case tests (`5e214ec`); 588 tests PASS.
- **Grid view Phase-1 AM verification (`e5765fc`, `421c25d`):** Verified three-agent parallel landing. Added regression guards: export ordering, `InstructionKind` enum drift, `useMediaQuery`, pipeline end-to-end test. Found 2 adversarial label defects (it.fails D1 adverbial-opener, D2 seconds/days strip); Linus fixed all. Post-d467f29: found 6 fifth-family defects (prepositional/numeric openers); Linus fixed all. Final AM: 1863 tests PASS, SHIP verdict.
- **Grid real-data measurement — initial baseline (`19fb67c`):** Ran against Brandon's real 74-meal DB (Postgres via Docker). Finding: 78% of meals have zero instructions (seed problem); of 16 instruction-bearing: 1 clean, 15 over-bracket (94%); 26/61 PROCESS steps over-inclusive (43%). Root cause: shopping-order ingredients. Added `deriveRecipeMatrix.realdata.test.ts` (5 PASS characterization tests). Recommended: SHIP with List as default; route P1-10 (use-ordering) to Livingston.
- **Grid real-data PM final measurement (`983b21a`, `afe721f`):** After use-ordering + matcher hardening + seed revamp. Cross-validated 0 mismatches on all 94 meals (74 real + 20 seed). Over-bracket steps 26/61 → 9/61 (−65%); clean meals 1/16 → 9/16. Residual 9 over-steps: intrinsic cross-step-reuse DAG-vs-tree; only Phase-2 authored spans close it. `ingredientDisplayOrder` valid permutation on all 94 meals; a11y `headers`/`scope` correct in live browser DOM. 1903 tests PASS. **VERDICT: SHIP Phase 1.**

## 2026-08-04 — Slice 2b: adversarial suite for `validateAuthoredLayout` (pre-implementation)

**Task:** Write `packages/shared/src/validateAuthoredLayout.adversarial.test.ts` against the pinned contract `validateAuthoredLayout(ingredients, instructions) → { ok: true } | { ok: false; code; message }`, BEFORE Livingston's Slice-2b implementation landed. My file, mine alone — he was told not to touch it.

**Approach:** Decoupled from his exact input-type names via `Parameters<typeof validateAuthoredLayout>` + `as unknown as` fixture factories (`ings(n)`, `step(pos, overrides)`). Never hardcoded a `code` value — asserted behaviourally (`ok===false`, non-empty string code + message) and, critically, that semantically different violations yield DIFFERENT codes.

**43 cases, weighted to the two highest-risk invariants:**
- #5 cross-column overlap MUST be accepted — 5 cases (the cascade; a global overlap check would silently break every authored recipe). Highest-value assertions in the suite.
- #3 all-or-nothing — 6 cases (SETUP/FINISH null spans don't trip it; partial PROCESS sets reject).
- #1 range/boundaries 11, #2 pairing 5, #4 per-column non-overlap 7, #6 gaps allowed 3, #7 column int/sparse 3, code-distinctness 3.

**Result:** His impl landed during my poll (working-tree `validateAuthoredLayout.ts`, re-exported from `index.ts`, stable `AUTHORED_LAYOUT_CODES`). `pnpm --filter @meal-planner/shared run test` = **118 passed** (my 43 + his 22 + 53 pre-existing), **0 fail**. All 43 adversarial cases green on first run against his code. He correctly accepts cross-column cascades, allows coverage gaps, and emits one distinct code per invariant — the three most-likely-to-be-wrong behaviours are correct.

**Committed** with explicit pathspec (test file + inbox decision + this history). Reviewer/implementer separation honoured — I did not touch his `validateAuthoredLayout.ts`.

## 2026-08-04 (2) — Slice 2b: lint cleanup + full-branch verification + end-to-end anti-staleness proof

**1. Lint self-fix:** removed an unused `Ingredient` type alias I introduced in `validateAuthoredLayout.adversarial.test.ts` (it added a 7th `no-explicit-any`-class warning; branch baseline is 0 errors / 6 pre-existing). shared lint now clean; 43/43 adversarial still pass.

**2. Full-branch verify (ran it myself, not trusting the report).** Livingston's impl committed at `e3d93c6`.
- `pnpm -r build` ✓ (shared→mcp→web→api all Done).
- `pnpm -r test` = **1982 passed, 0 fail** — shared 118, mcp 124, web 706, api 1034. Confirms Livingston's numbers EXACTLY.
- `pnpm -r lint` = **0 errors, 6 warnings** — all 6 pre-existing `no-explicit-any` in api (auth.ts, membership.ts, agent.mcp.test.ts×2, agent.test.ts×2). My shared warning is gone. Confirms "0 lint errors".

**3. Omit-defaulting anti-staleness — the load-bearing check. VERDICT: CORRECT.**
- Traced the write path: Zod (`routes/meals.ts`) makes `spanFrom/spanTo/column` `.nullable().optional()` (omitted ⇒ undefined). Service `mapInstructionCreates` (`services/meals.ts:63-74`) maps `step.spanFrom ?? null` etc. Used by createMeal (650), updateMeal (764), import/agent (888/916) — uniform. `matrixSource` = `authored` iff any `spanFrom != null` (`deriveRecipeMatrix.ts:196`).
- Livingston's cited test (`meals.test.ts:1147`) is a REAL write-path test (input omits spans; asserts captured Prisma create arg `spanFrom:null`) — NOT tautological. But it only covers createMeal at the mock layer, never a real persist→read round-trip.
- Closed that gap myself: stood up Postgres 16 (Docker `/usr/local/bin/docker`), `prisma migrate deploy` (incl. `add_recipe_matrix_layout`), ran a throwaway tsx script against the REAL service + REAL DB (removed after). Results, all PASS: createMeal w/ instructions & NO spans → `derived`; DB rows spanFrom/spanTo/column all null; **updateMeal w/ instructions & NO spans → `derived`** (the ordinary-edit case Rusty flagged); DB null; CONTROL updateMeal WITH a span → `authored`; CONTROL edit back to NO spans → `derived` (no sticky authoring). The read oracle (`getMealById`→`applyRecipeMatrix`) genuinely flips both ways, so the 'derived' results are meaningful.
- **No defect.** Ordinary meal edits do NOT flip recipes to authored/frozen — the Phase-1 anti-staleness class is not reintroduced.

Committed the lint fix with explicit pathspec. Did not touch any Livingston-owned file.

## 2026-08-04 (3) — Slice 2b BLOCKER FIX (implementer hat): importMeals dangling-span validation

Rusty REJECTED Slice 2b and named me fix agent (Livingston locked out as author). Blocker: `importMeals` is a third replace-all write path that reached Prisma WITHOUT calling `validateAuthoredLayout`. It deletes ingredients unconditionally but RETAINS instructions when that column is omitted — so importing over a previously-authored meal with fewer/omitted ingredients leaves retained authored spans pointing at rows that no longer exist (dangling span; spec P2.5 Range violation). Narrow (needs a pre-existing authored meal, none exist yet) but real the moment Brandon authors his first recipe.

**Fix (services/meals.ts, import replace branch only):** validate the EFFECTIVE resulting pair before any mutation, mirroring updateMeal's precedent. Critical subtlety handled: import wipes ingredients unconditionally, so effective ingredients = the INCOMING list (never persisted); effective instructions = incoming when provided (import steps are always span-free), else the RETAINED rows fetched via `tx.mealInstruction.findMany`. `assertValidLayout` throws `InvalidLayoutError`, which the existing per-row try/catch converts to a row error — the whole import is NOT aborted (fits the per-row model). Mapped incoming arrays to the validator's input shape to avoid weak-type TS errors; guarded the retained findMany with `?? []` (mirrors updateMeal:727) so an omitted-instructions replace never crashes.

**Regression test (services/meals.test.ts) — PROVEN to fail without the fix:** author a meal (retained PROCESS span 0..3), import over it with 1 ingredient + omitted instructions; assert the row errors and NOTHING persists (`updated===0`, `errors.length===1`, `meal.update` not called). `git stash`-ed the service fix and ran it against the broken code: FAILED with `expected 1 to be +0` (broken code persists the dangling span, updated=1). Restored fix. Added a companion test proving no over-rejection (retained span 0..1 within a 2-ingredient import still succeeds).

**Fallout fixed in-scope:** 4 existing replace-mode import tests omit instructions and don't mock `mealInstruction.findMany`; the `?? []` guard keeps them green without editing them.

**Full branch (ran myself):** build ✓ all four packages Done. `pnpm -r test` = **1984 passed, 0 fail** (shared 118, mcp 124, web 706, api 1036 = baseline 1982 + my 2). `pnpm -r lint` = **0 errors, 6 pre-existing warnings**. Scope fence honoured: only importMeals + its tests touched.

📌 Team update (2026-08-04T10:45:00-04:00): Rusty **APPROVED** Slice 2b after Yen's importMeals fix and independent reproduction of the failure. PR #223 open. **Yen AND Livingston both locked out** of this artifact; any further 2b revision → third api specialist. Phase 1 merged to main as PR #222 (`679be0e`). Double-verification standard (stash proof + independent reviewer revert) recorded in decisions.md as the benchmark for REJECT gate closures. — Scribe cross-cut
