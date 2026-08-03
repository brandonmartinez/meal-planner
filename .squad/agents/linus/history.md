# Project Context

- **Owner:** Brandon Martinez
- **Project:** meal-planner — family meal planning app with a public Magic Mirror display
- **Stack:** pnpm monorepo (Node 20+, pnpm 9). `packages/api`: Express 5 + Prisma 6 + PostgreSQL (Google OAuth via Passport, JWT in httpOnly cookies, hashed API keys, Zod, Helmet/CORS/rate-limit/Morgan). `packages/web`: React 19 + Vite 6 + React Router v7 + Tailwind v4 (MSW in tests). `packages/shared`: pure TS types/constants (`@meal-planner/shared`). TypeScript strict + ESM (`.js` suffix on api runtime imports). Vitest (api `globals:false` + prismaMock; web `globals:true` + MSW). Docker + `k8s/` + CI (Postgres 16 service).
- **Created:** 2026-06-30

## Core Context

Frontend Dev. Owns `packages/web`. Use the `request<T>()` pattern and MSW handlers (see `.github/instructions/web.instructions.md`). Web tests run Vitest with `globals: true`.

## History Summary (2026-06-30 through 2026-07-28)

- **Initialization (2026-06-30):** Ocean's Eleven cast. Filed frontend reviews #14 (request<T>), #15 (a11y forms), #16 (a11y modals), #17 (API key UX).
- **Sprint 1–3 (2026-06-30):** #14 PR #39 (centralized `request<T>()` client, removed raw fetch except OAuth redirect); #8 PR #44 (DifficultyBadge + form select); #16 (accessible modals), #6 web (agent credentials UI), #27 web (recent-meal badge), #17 (API key copy + last-used), #15 PR #62 (accessible names + loading status). Web a11y gates PASSED.
- **Sprint 2 (2026-07-01):** #70 Meal Library UI PR #73 — MealPicker Recent/Difficulty badges + MealsPage zoned card layout.
- **Sprint 2 Waves 4–6 (2026-07-02):** #103 external imageUrl PR #133 (shared MealThumbnail, scheme allowlist, CSP img-src: "https:"); #108 tags UI PR #135 (TokenField, MealTagList, useTaxonomy, filter controls). Web tests 327.
- **Sprint 3 (2026-07-02):** #102 cooking mode PR #138 (immersive `/meals/:id/cook`, per-step timers, 100% client-side). KEY: `userEvent` v14 clicks deadlock under `vi.useFakeTimers()` → use `fireEvent.click` for fake-timer tests.
- **Waves 3–4 (2026-07-03):** #110 collections UI PR #145; #117 templates UI PR #147 (apply flow, existingMode, parent-gated destructive actions).
- **UI polish wave (2026-07-03):** PR #157 (unapprove toggle + photo stamp); PR #159 (responsive toolbar); PR #160 (form polish, repeat-week modal, template modal pagination); PR #161 DayCard stamp hotfix (`size-16 sm:size-20`, no absolute).
- **Meal Library epic #168 (2026-07-04):** PR #169 (standardized Select, max-w-7xl); PR #170 (card/table toggle, TagMultiSelect, hide-built-ins); PR #173 (title→MealDetailModal, `/meals/:id` deep-link). PR #185 instructions editor (ordered steps + timers).
- **MMM image proxy (2026-07-06):** `node_helper` axios arraybuffer + base64 data URI + ETag conditional GET. Images visible on MagicMirror end-to-end.
- **Meal-picker UX #208 (2026-07-09):** PR #209 (search covers names+tags, difficulty Select, advanced facets collapsed, 2-line descriptions). `5b02eca`.
- **#218 grocery grouping rejection lesson (2026-07-28):** Rusty rejected initial commit for two blockers: pantry-staple separation must be mode-independent (regressed #205), and meal grouping must use `sourceMealIds` not stale `sources`. Locked out of revision; Virgil owned the fix.
- **#220 Week Plan header action row (2026-07-28):** Moved header actions to a dedicated row below title/date. Past weeks omit the row; action row renders only for non-past weeks. Web validation: 593 tests, lint, build green.

## Learnings

### 2026-08-03T11:00:32-04:00 — Tabular "Grid" recipe view (P1-6/7/8)

Shipped the visible half of the Cooking-for-Engineers Grid mode against Livingston's pinned `@meal-planner/shared` DTOs.
- `useRecipeViewMode` — `localStorage['recipeViewMode']` (`'list'|'grid'`, default `'list'`), SSR-guarded + try/catch.
- `useMediaQuery` — powers sub-`sm` degrade-to-List.
- `utils/buildTabularRecipe.ts` — pure layout (ported `buildColumnCells` + gap compression). Column cascade: each PROCESS step placed one column right of the right-most earlier step its row range overlaps. Proven: no empty columns, reproduces prototype exactly.
- `TabularRecipeView` — real `<table>` + `<caption>`, `<th scope="row">` sticky ingredient column, SETUP `<th scope="colgroup">` bands, rowspan step `<td>`s `headers`-linked, gap cells `aria-hidden`. Tailwind tokens (blue accent), not prototype raw `--cp-*`.
- `RecipeViewToggle` — `aria-pressed` button group.
- Wired into `CookingModePage`. New `getTabularMeal()` client (same endpoint, wider DTO; other `getMeal` callers undisturbed). Lifted `formatIngredient` to `utils/`.
- Commit `4d23572`. Validated: web build ✓, lint 0 ✓, tests 623 ✓ (37 new).
- Note: `getTabularMeal` casts to `TabularRecipeMealDTO`; Grid degrades gracefully when API path isn't serving new fields yet.

### 2026-08-03T12:16:22-04:00 — Grid content-shaping follow-ups (Rusty findings 1 & 2)

Rusty APPROVED `4d23572` with two content-shaping follow-ups. Fixed together, web-only, presentation-only (`text` stays single semantic source, no #96/MCP impact):
- New `utils/shortStepLabel.ts`: `shortStepLabel(text)` — leading clause up to first comma, ~6-word cap; strips trailing "to/for <detail>" tail; falls back to trimmed original. `isRedundantSubLabel(sub, label)` = case-insensitive substring.
- `TabularRecipeView`: PROCESS cells render short label with full text in `title`; subLabel suppressed when substring of displayed label. SETUP bands also suppress redundant subLabel. List untouched (lossless).
- No-groups degrade path (Livingston removed `?? ing.category`): verified no pills, no coloured borders, consistent transparent 4px left accent.
- Commit `0a90fdb`. Validated: web build ✓, lint 0 ✓, tests 650 ✓.

### 2026-08-03T12:24:12-04:00 — Short-label heuristic: principled to/for strip

Rusty follow-up: positional "to/for tail" strip was misfiring ("Bring to a boil" → "Bring"; "Reduce to a simmer" → "Reduce"). Fixed:
- Strip `to|for <tail>` ONLY when tail contains **temperature or duration** (units `extractSubLabel` re-shows — tied to the redundancy the strip exists to remove).
- **2-word floor:** never strip to a bare verb.
- Word cap trims trailing dangling connectives (and/with/the/until/…).
- Guiding principle: short label must be *abbreviated*, never *wrong*; when in doubt keep more text.
- Commit `118370c`. Validated: web build ✓, lint 0 ✓, tests 653 ✓.

### 2026-08-03T12:43:32-04:00 — Short-label: three "misleading not abbreviated" defects

Yen found 2 adversarial defects; Brandon flagged 1 off the screenshot. All three fixed:
- **D1 (Yen DEFECT 1):** adverbial/conditional opener before first comma returned as whole label ("Meanwhile, cook the pasta" → "Meanwhile"). Fixed: skip clause if recognized opener (meanwhile/once/after/before/while/when/carefully/gently/using/…), use imperative clause → "cook the pasta".
- **D2 (cap):** 6-word cap truncating mid-phrase. Fixed: raised to 9 words + glue-word trim (never ends on article/prep/conjunction).
- **D3 (Yen DEFECT 2):** `to/for` strip removing seconds/days that `extractSubLabel` never re-shows (only emits min/hr/°). Fixed: strip vocabulary narrowed to temperature + minutes/hours ONLY.
- Unified rule: never emit a label a cook reads as a DIFFERENT or INCOMPLETE instruction; abbreviate only by dropping redundant detail; when in doubt, KEEP MORE TEXT.
- `it.fails` in `shortStepLabel.adversarial.test.ts` converted to passing + extended.
- Commit `d467f29`. Validated: web build ✓, lint 0 ✓, tests 670 ✓ (shortStepLabel 19, adversarial 14).

📌 Team update (2026-08-03T11:00:32-04:00): Yen's final **SHIP Phase 1** verdict confirmed after all 3 adversarial short-label defects fixed and `it.fails` converted to passing (commit `d467f29`). 1840 total tests passing (web 665). Phase 1 complete. — decided by Yen

### 2026-08-03T13:27:37-04:00 — Short-label: structural boundary rewrite (retire the word cap)

Brandon found "Cook the spaghetti in a large pot of salted" in the Marinara render — the D2 fragment class AGAIN (8th defect family). Root cause ruling: truncating natural language at a word count cannot be made safe — every trim rule patches the instance and leaves the class. Mandated a **structural** fix.

**The boundary rule (`dropTrailingClause`):** never cut mid-phrase. Cut ONLY at a real syntactic boundary — a subordinator (`to`/`until`/`while`/`then`) that introduces a droppable trailing clause — else emit FULL TEXT. A long label is a layout inconvenience; a fragment is a wrong instruction.
- Guards so a cut can never leave a fragment: keep ≥2 words (floor); the subordinator's next word must be a **content word** (so "to a boil"/"to 165°F"/"to a glaze" — determiner/number complements — are NOT clauses and stay whole); the head must not end on a glue/connective word; and `parts[i-2]` must not be a coordinator (blocks "…and fry | until golden" → bare-verb). Scans from the end → drops only the outermost clause, keeping the most text. Trailing comma/`;`/`:` stripped from a cut head.
- **Excluded `and`/`or` from cut boundaries** (Brandon's example list included them): they ambiguously coordinate nouns vs clauses and can't be POS-disambiguated in-browser, so cutting there risks a fragment or dropping a co-equal action. Steps whose only join is "and"/"or" are emitted whole. **Flagged deviation.**

**Deleted:** the word cap (`MAX_WORDS=9`), the trailing-glue trim, the dangling-verb positional back-off, and `CUT_CONNECTIVES`. **Kept untouched:** opener-skip + `skippedOpener` capitalization (`c46855b`), the redundant-measurement `to/for` strip (mirrors shared `extractSubLabel`: temp + min/hr only), the 2-word floor, `isRedundantSubLabel`.

**Assertions changed (each renders MORE completely or a clean cut — none loosened):**
- unit "…severed to/and <verb>" → split: "Stir…to make the remoulade sauce" still → "Stir the mayonnaise and dill pickles together" (cut at `to make`); "Warm the olive oil…and sauté…" now → **full text** (no `and` cut).
- unit "caps a runaway run-on" → "Mix the flour and… soda together well" now → **full text** (no boundary; was capped ≤9).
- adversarial SEVENTH FAMILY: "and sauté" → full text; "Combine…and bring it to a boil" → **full text** (was truncated "…bring it"); rewrote the invariant test to: output is EITHER verbatim input OR a boundary-cut head ending on a content word.
- adversarial 8th sweep: "or"/"and" lists → full text (were truncated); "Over medium heat until golden" → "Over medium heat" (cut at `until`); mis-detected "Sting the sauce with lime, then taste…" → "Sting the sauce with lime" (then-clause cut, comma cleaned).
- Added a `boundary shortening` unit block (until/while/then cuts; "to <determiner>" no-cut; floor).

**Width check:** process `<td>` is `min-w-[6rem]` with NO `max-w` / NO `whitespace-nowrap`, inside `overflow-x-auto`. Longer full-text labels wrap vertically (taller cell), never a horizontal matrix blowout. Worst realistic case "Cook the spaghetti in a large pot of salted water" wraps to ~3 lines. Acceptable — the err-long cost is a little row height.

Commit `<pending>`. Validated: web build ✓, lint 0 ✓, tests **700** ✓ (shortStepLabel 28 + adversarial 20, whole web suite green).

### 2026-08-03T16:12:04-04:00 — Grid ingredient use-ordering (web half of `ad63eb8`)

Livingston shipped the shared/API half (`ad63eb8`): new **non-nullable** `ingredientDisplayOrder: number[]` on `TabularRecipeMealDTO`, a permutation of `0..n-1` where `ingredients[ingredientDisplayOrder[k]]` is the k-th Grid row. `spanFrom`/`spanTo` now index into the DISPLAY order, not `position`. Motivation: measured against Brandon's real 74-meal library, 43% of PROCESS steps over-bracketed because ingredients are stored in *shopping* order; Chu's format needs *use* order (Birria braise was bracketing tortillas + cheese).

**`buildTabularRecipe.ts`:**
- Deleted the ingredient `position`-sort (now *actively wrong* — it fought the display order). `ingredients` is used as-is: the canonical, `position`-ordered coordinate system shared with List/Grocery/Cooking-Mode/`MealDetailModal`, never re-sorted here.
- Added `resolveDisplayOrder(order, n)`: validates a true permutation of `0..n-1`; missing/wrong-length/non-permutation → identity fallback (degrades to `position` order — covers an older API pre-`ad63eb8` or a malformed fixture without dropping/duplicating rows).
- Row loop walks `displayOrder.map((ingredientIndex, r) => …)` indexing `ingredients[ingredientIndex]`, `rowIndex: r` = the consecutive display walk index. Spans are already display coords, so the cascade/rowspan math AND the view's `headers`/`scope` a11y linkage (`ingRowId(row.rowIndex + i)`) are unchanged — zero renderer logic change.
- Group runs now computed over DISPLAY order (what the cook sees). Instruction `position`-sort kept (PROCESS cascade order is independent of display order).
- Function param widened to `…& { ingredientDisplayOrder?: number[] }` (optional at the boundary for the 10 legacy unit tests + defensive fallback; the required-field DTO stays assignable).

**`TabularRecipeView.tsx` (only change beyond leaving it untouched):** added a small visible note for `matrixSource === 'derived'` — "Ingredients are listed in the order the recipe uses them, so this order can differ from the List view." Rusty ruled the List/Grid order divergence acceptable but wanted it stated; a mid-recipe toggle shouldn't read as "ingredients vanished". Authored meals (identity == List order) get NO note.

**UX call:** shown only for derived meals, muted `text-xs` footnote directly under the grid. Authored = identity = same as List, so no note needed there.

**Cross-step reuse over-bracketing is intrinsic** (a rowspan table renders a tree; genuine reuse is a DAG) — NOT fixed in web, NO test asserts zero over-bracketing (would assert something false). Only Phase-2 authored spans close it.

**Regression confirmation:** all seven short-label defect families still green (`shortStepLabel` 28 + adversarial 35 untouched); column assignment, gap compression, and rowspan `headers`/`scope` a11y wiring intact (new view test asserts rows render in `ingredientDisplayOrder` and a span's `headers` reference consecutive DISPLAY row ids, never position). Pipeline test now wires the real `matrix.ingredientDisplayOrder` end-to-end (po'boy derives to identity, so its render assertions hold).

**Tests:** `buildTabularRecipe.test.ts` +5 (Birria `[1,2,3,0,6,4,5,7]` braise `0..4` walk; identity fallback; malformed-permutation fallback; group runs over display order; instruction-position sort). `TabularRecipeView.test.tsx` +2 (use-order note derived/authored; display-order render + a11y linkage). Fixtures updated for the required DTO field (pipeline `serve()`, `meal()` factory identity default, `CookingModePage` fixture).

Commit `<pending>`. Validated: web build ✓, lint 0 ✓, tests **706** ✓ (was 700; +5 build +2 view −1 obsolete).
