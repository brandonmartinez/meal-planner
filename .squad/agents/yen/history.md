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

### 2026-08-03T11:00:32-04:00 — Phase-1 Grid FINAL verification (post `07c21b2`/`0a90fdb`/`118370c`)

Re-verified after the three follow-up commits. Real results: build PASS, lint PASS (0 errors; same 6 pre-existing `any` warnings), test PASS **1840** (shared 31, mcp 121, web 665, api 1023). My four `e5765fc` tests still green. Confirmed Linus **corrected** (not weakened) my `TabularRecipeView.pipeline.test.tsx`: group assertion now expects `Array(n).fill(null)` and asserts NO `.rounded-full` pill / no aisle text — a stronger assertion of the new no-derived-pills behavior.

Verified the three claims in source + screenshot: (1) `deriveRecipeMatrix` groupLabel is now `ing.groupLabel ?? null` — `?? ing.category` fallback gone; derived meals render pill-less. (2) Renderer degrades cleanly at zero groups — left border is always `border-l-4` with `border-l-transparent` when ungrouped → constant width, no layout shift, no empty gutter (confirmed visually, desktop+tablet, light+dark). (3) Short labels keep the regression family ("Bring to a boil", "Reduce to a simmer", "Sear to a deep crust", "Cook to 165°F" all intact).

**Adversarial pass found TWO real short-label defects** (documented as `it.fails` markers in `shortStepLabel.adversarial.test.ts`, green now / flip red when fixed):
- **DEFECT 1 (moderate, "reads as a different instruction"):** a leading adverbial/conditional clause before the first comma is returned verbatim, DROPPING the imperative. "Meanwhile, cook the pasta"→"Meanwhile"; "After 5 minutes, flip the fish"→"After 5 minutes"; "Carefully, lower the eggs into the water"→"Carefully". Rowspan does not rescue these. Very common recipe prose. Owner: Linus.
- **DEFECT 2 (minor):** the `to/for` strip removes seconds/days durations (its DURATION regex covers seconds/days/[smh]) but shared `extractSubLabel` only recognizes min/hr/°, so the measurement vanishes from the Grid entirely (kept only in hover `title` + List). "Blanch the beans for 90 seconds"→"Blanch the beans". On a touch tablet (no hover) a cook-critical timing is invisible. Fix: align the strip's vocabulary to extractSubLabel's. Owner: Linus.

Captured 6 REPRESENTATIVE screenshots to session-state `files/` with `final-` prefix (real grocery-aisle categories → null groups → no pills; natural sentences; a full-span degenerate recipe that also surfaces DEFECT 1's "Meanwhile"; plus an authored Phase-2 preview labeled not-yet-achievable). Static harness mounting the real `TabularRecipeView`. **Verdict: SHIP Phase 1** — both defects are display-polish on the derived heuristic, List view is the lossless backstop, and neither corrupts data or the rowspan structure. Recommend DEFECT 1 be fixed early in Phase 2 (or as a fast-follow) since adverbial openers are common.

### 2026-08-03T12:52:33-04:00 — Phase-1 Grid fast confirm (post `d467f29`, 3-defect label fix)

Re-ran full monorepo: build PASS, lint PASS (0 errors; same 6 pre-existing `any` warnings), test PASS **1845** (shared 31, mcp 121, web 670, api 1023). Confirmed Linus **converted** my two `it.fails` markers to passing `it(...)` with stronger exact assertions (`.toBe('cook the pasta')`) — not deleted, not weakened. Verified the 6→9 word cap raise did NOT drift the Grid back toward a List: re-captured `final-desktop-light.png` + `final-tablet-light.png` (same fixtures) — labels are longer but still verb-led and terse, columns didn't blow out. Both original defects visibly fixed: Po'Boy reads "Dredge the shrimp in the seasoned flour and fry" (was the "…in the seasoned" fragment); Marinara reads "cook the pasta in well-salted water" (was "Meanwhile").

**Fifth-family break found (predicted).** Same root cause as D1, one layer deeper: `isOpenerClause` only enumerates adverbial *words* and inspects one token, so a leading comma-clause that is a PREPOSITIONAL phrase ("In a large bowl, whisk the eggs"→"In a large bowl"; "For the sauce, melt the butter"→"For the sauce"; "Off the heat, stir in the cheese"→"Off the heat"; "To finish, …") or a NUMERIC/timing phrase ("2 minutes before serving, stir in the butter"→"2 minutes before serving"; "30 seconds later, add the garlic"→"30 seconds later") is promoted to the label, dropping the imperative. These are very common recipe openers. Documented as 6 new `it.fails` markers in `shortStepLabel.adversarial.test.ts` (green now, flip red when fixed). Suggested fix routed to Linus: treat a leading clause as a non-instruction opener when its head is a preposition or a digit/measurement (skip any clause not headed by a verb, fall back to full text if all skipped). Minor cosmetic (non-defect): a long single clause can end on a dangling "…to make"; ℃/℉ glyphs and "1½" fractions aren't matched by the strip (safe direction — errs long).

**Verdict: SHIP Phase 1.** D1/D2/D3 correctly fixed; the fifth family is the same class, still bounded by the lossless List backstop, and worth an early Phase-2 fast-follow (prepositional/numeric openers are common).
