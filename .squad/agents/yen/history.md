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

📌 Team update (2026-08-03T11:00:32-04:00): Linus addressed both adversarial defects you filed plus a third (D1: adverbial opener now skipped to reach imperative; D2: 6-word cap raised to 9 with glue-word trim; D3: seconds/days strip narrowed to temperature+min/hr only so cook-critical timings stay visible). All `it.fails` in `shortStepLabel.adversarial.test.ts` converted to passing assertions in commit `d467f29`. Final test count: 670 shortStepLabel tests (19 unit + 14 adversarial + rest). — decided by Linus

### 2026-08-03T13:20:00-04:00 — Phase-1 Grid LAST confirm (post `c46855b` + `c358937`)

Re-ran full monorepo: build PASS, lint PASS (0 errors; same 6 pre-existing `any` warnings), test PASS **1863** (shared 31, mcp 121, web 688, api 1023). Confirmed Linus **converted** my 6 fifth-family `it.fails` to passing `it(...)` with identical assertion bodies (not weakened) in `c46855b`, and added his own "SIXTH-FAMILY GUARD" block.

Attacked the two new rules per Brandon's request:
- **Positional connective back-off (`c358937`)** — infers a "severed" trailing verb from token position (n−2 ∈ {to,and,or,but,nor,then,plus}) with no POS knowledge. Empirically err-safe: it only fires on already->9-word labels, and its worst case drops a rowspan-shown ingredient or an already-truncated tail word — equivalent to the accepted comma-list abbreviation ("Season with salt, …"→"Season with salt"). Never flips to a different instruction. A determiner-less "and"-list strips to the 2-word floor cleanly; a complete "or <alt>" tail is preserved.
- **`-ing` participle rule (`isParticipleHead` + `ING_BASE_VERBS`)** — an enumeration, but of a genuinely CLOSED, tiny morphological class (base-form English verbs ending -ing). The cooking-relevant members (bring/string/wring) are all exempted; the `length>4` guard covers ring/sing/ping. Could not construct a realistic MISSING cooking imperative; the failure mode for a missing one is safe fallback-to-full-text (or promotion of the next real verb clause, only wrong if the -ing word were a real imperative — none is). Low risk.

**No genuine eighth family.** Added 5 passing characterization tests (not `it.fails`) locking in the err-safe behavior of both rules. One cosmetic err-long observation (NOT a defect, NOT a blocker, inherent to the 9-word cap since it landed): any 10+ word sentence truncates on its 9th word, which can be a non-connective ("Cook the spaghetti in a large pot of salted" — "water" cut). Reads as the SAME instruction (never a different one), full text is in the `title`, and durations re-surface via the timer/subLabel. Possible Phase-2 polish: extend the trailing-glue trim to drop a stranded preposition-phrase head.

Re-captured `final-desktop-light.png` + `final-tablet-light.png` (overwrite, same representative fixtures). Both visibly fixed: Po'Boy remoulade cell now "Whisk the mayonnaise and dill pickles and Creole mustard" (no dangling "…to make"); Po'Boy "Dredge the shrimp in the seasoned flour" (no "…seasoned" fragment); Marinara "Warm the olive oil in a saucepan" (no dangling "…and sauté"); Marinara "Cook the spaghetti…" ("Meanwhile," skipped and sentence-cased, capitalization uniform down the column). Static harness mounting the real `TabularRecipeView` with `deriveRecipeMatrix`. **Verdict: SHIP Phase 1.**

## 2026-08-03 — REAL END-TO-END verification against Brandon's live dev DB (first non-harness pass)

Docker Postgres 16 (`saul-mealdb`, localhost:5432) up with Brandon's actual data: **74 meals / 365 ingredients / 61 instructions**. Stood up the real API (`tsx src/index.ts`:3001, `DATABASE_URL` → live DB) + web (`vite`:5199, proxy `/api`→3001) and drove the Grid in headless Edge over CDP from **real network responses** — every prior pass was a static harness.

**Task 1 — real stack works.** `/api/families/:fam/meals/:id` serves the matrix fields (matrixSource `derived`, all `groupLabel` null, real spans). Grid `<table>` renders real "Braise the beef" cells; toggle Grid↔List flips `aria-pressed` + `localStorage.recipeViewMode` and **persists across reload**. Loading spinner and a clean "Failed to load recipe" error state both observed live.

**Task 2 — THE MEASUREMENT (all 74 meals; replica matcher cross-validated 0 failures vs real `dist/deriveRecipeMatrix.js`):**
- **All 74 meals are DERIVED (0 authored); every `groupLabel` derives null** (categories are grocery aisles).
- **58 / 74 meals (78%) have ZERO instructions** → Grid = ingredient column, empty right side, no crash, but adds nothing over List.
- Of the **16 instruction-bearing meals: 1 clean (Miso-Glazed Cod), 15 over-bracket (94%).**
- **PROCESS steps: 61 total → 32 clean, 26 over-inclusive (43%), 3 degenerate full-span** (name no ingredient).
- Severity: 5 steps sweep 1 stray, 15 sweep 2-3, 6 sweep 4-6 (max 5). **7 of 15 over-meals have a step bracketing >half the list.** Worst: Birria 0.63, Vietnamese Lemongrass Pork 0.63, Butternut Risotto 0.57, White Cheddar Mac 0.57.
- **Correlation:** the whole library is 3-4 terse steps over 6-8 ingredients listed in shopping order, not use-order → min..max span guarantees over-bracketing unless the list happens to be in use-order (only Miso-Cod is). Not a bug — Livingston's flagged weakness (b) manifesting on real data.

**Task 3 — degenerate shapes:** 58 zero-instruction (dominant), 0 one-instruction, 0 instructions-without-ingredients, 2 one-ingredient (test rows). All render without crash; already covered by existing web unit tests (`TabularRecipeView.test.tsx:198`, `buildTabularRecipe.test.ts:236`).

**Task 4 — 6 real screenshots** (real app + real server + real DB), session files dir: `real-birria-overbracketed-{light,dark}.png` (Braise/Shred each bracket 7 of 8 incl. tortillas & cheese), `real-miso-cod-clean-{light,dark}.png` (the lone clean meal), `real-beef-tacos-noinstructions-{light,dark}.png` (the 58/74 empty-Grid shape).

**Task 5 — real-server-only:** API contract matches web's `TabularRecipeMealDTO` exactly; loading + 404 error states clean. **Finding: `/api/auth/*` (incl. `/api/auth/me`) is rate-limited (15-min in-memory window); a reload burst trips 429 → bounce to /login.** Expected middleware behavior, not a Grid defect; noted for whoever tunes limits.

Added `packages/shared/src/deriveRecipeMatrix.realdata.test.ts` — 5 PASSING characterization tests pinning the Birria over-bracket, the Miso-Cod clean case, and the no-instruction empty shape to real-data fixtures (shared 31→36 tests; lint + `tsc` clean). No `it.fails` — over-bracketing is documented derived behavior, not a bug.

**VERDICT: SHIP Phase 1 behind the List default — but derived Grid is NOT trustworthy standalone on Brandon's real library.** Structurally sound (no crashes, List is the lossless backstop, format is correct when data lines up). But on the actual catalog it's low-value/misleading for the vast majority: 78% of meals show an empty Grid, and 94% of the rest over-bracket (7/15 bracket >half the list). **Derived mode alone does not justify relying on the Grid — it needs the Phase-2 authoring editor (or an ingredient use-order pass) before it faithfully represents recipes.** Routing the product call to the coordinator.

## 2026-08-03 (PM) — FINAL measurement pass: use-ordering + matcher hardening + seed revamp

Re-ran the full 74-meal real-DB measurement after the use-ordering batch (`ad63eb8`/`d325227` ingredientDisplayOrder, `a008feb`/`09eb5b4` matcher hardening, `bf9fa90`/`db75522` seed revamp, `f8a87f3` boundary-cut labels). Both Postgres up: `saul-mealdb`:5432 (real 74) + `saul-seed-scratch`:5433 (new 20-meal seed). Methodology: imported the REAL compiled `deriveRecipeMatrix`, plus a VERBATIM copy of the matcher internals to recover each step's matched rows; cross-validated by recomputing spans+displayOrder against the real dist output — **0 mismatches on all 94 meals**, so the copy is exact.

**Build/test/lint:** `pnpm -r build` ✓ (shared→mcp→web→api). Tests **1903 pass, 0 fail** (shared 53, mcp 121, web 706, api 1023). Lint 0 errors, 6 pre-existing `no-explicit-any` warnings (auth/membership + 2 api tests), none Grid-related.

**Task 1 — over-bracketing delta (REAL DB), directly comparable to the baseline:**
| metric | baseline (pre-use-order) | now | delta |
|---|---|---|---|
| zero-instruction meals | 58/74 | 58/74 (52 recipes + 6 placeholders) | unchanged |
| clean instruction-bearing | 1/16 | **9/16** | +8 |
| over-bracketing meals | 15/16 | **7/16** | −8 |
| over-inclusive PROCESS steps | 26/61 | **9/61** | −17 (−65%) |
| degenerate full-span steps | 3 | 3 | unchanged |
Use-ordering ELIMINATED the "scattered mise-en-place" over-bracket cause. The 9 residual over-steps are all **assembly/serve/fold steps that recombine an earlier-used ingredient** (the intrinsic cross-step-reuse / DAG-vs-tree residual the source comments call out; only Phase-2 authored spans close it). Max stray 4 ingredients; per over-step: 2 stray 1, 4 stray 2-3, 3 stray 4. Birria's braise now strays only **white onion** (baseline swept in corn tortillas + oaxaca cheese).

**Task 2 — new seed (20 meals = 6 placeholder + 14 recipes):** composition = 3 fully authored (Baked Lasagna, Fried Shrimp w/ Rémoulade, Caprese Salad), 2 derived-spans-with-authored-group-pills (Vegetable Beef Chili, Teriyaki Chicken Bowl), 9 fully derived. **Saul's "11/11 derived clean" CONFIRMED independently — 0 over-steps across all derived seed recipes** (40 clean PROCESS + 3 deliberate degenerate). The 3 authored: identity permutation ✓, 0 out-of-range spans ✓, render SETUP/PROCESS/FINISH cascades with group pills + timer sub-labels as intended.

**Task 3 — ordering mechanism verified (not just output):** (a) API response keeps `ingredients` in canonical POSITION order — confirmed on Birria (`ingredients` = position order, `ingredientDisplayOrder:[1,2,3,0,6,4,5,7]` carries the permutation); only `buildTabularRecipe.ts` walks displayOrder — List/Grocery/checklist/MealDetailModal all read `ingredients`. (b) authored ⇒ identity permutation (Baked Lasagna `[0..9]`). (c) `ingredientDisplayOrder` a valid permutation of `0..n-1` on **all 74 real + 20 seed meals** (0 bad). (d) a11y: rendered `<th scope=row id=…row-k>` are in DISPLAY order and the braise `<td headers>` references `row-0..row-4` (the contiguous display span) — verified in the real browser DOM. `resolveDisplayOrder` defensively falls back to identity on a malformed/absent order.

**My characterization test** (`deriveRecipeMatrix.realdata.test.ts`, afe721f) was UPDATED by Livingston in `ad63eb8`/`a008feb` — correctly re-baselined to the improved semantics (Birria braise 0→6 became 0→4) and STRENGTHENED with new assertions (exact displayOrder, tortillas/cheese pulled OUT, onion residual "intrinsic, not a bug"). Not a weakening; matches my independent numbers.

**Task 4 — 6 `decision-*.png` (real app+server+DB), light 1440:** `decision-birria-after-light.png` (real; braise strays only onion — before = existing `real-birria-overbracketed-light.png`), `decision-korean-overbracket-light.png` (real; serve/assembly residual), `decision-noinstructions-light.png` (real; the 58/74 empty-Grid shape), `decision-derived-bolognese-light.png` (seed; fully derived, NO group pills — the honest ship appearance, w/ SETUP band + FINISH note), `decision-clean-cascade-light.png` (seed Veg Beef Chili; derived spans + AUTHORED group pills — labelled as partially authored), `decision-authored-lasagna-light.png` (seed; fully authored — groups + timer sub-labels + multi-col cascade, the Phase-2 target).

**Task 5 — real-server:** loading/404/contract all clean (unchanged from prior pass); the `/api/auth/*` 15-min rate-limit is still the only real-server-only wrinkle (not a Grid defect).

**VERDICT: SHIP.** Use-ordering moved derived Grid from "misleading on most instruction-bearing meals" to **structurally trustworthy for well-formed recipes** (over-steps −65%, clean meals 1→9 of 16; seed derived 11/11 clean). Two honest caveats remain, both non-blocking: (1) 78% of Brandon's CURRENT library has no instructions → empty Grid (a data-entry gap, not a code defect; List is the lossless default). (2) The ~15% residual over-bracket on assembly/reuse steps is intrinsic and only Phase-2 authored spans fully close it. Recommend: ship Grid (List remains default), and the highest-value next investment is the Phase-2 authoring editor + encouraging instruction entry — NOT further matcher tuning (hardening's real-library impact was 1 step + 0 steps; diminishing returns).
