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

### 2026-08-03 (AM) — Grid view P1-6/7/8 through short-label rounds 1–3 (summary)

- Shipped `TabularRecipeView`, `RecipeViewToggle`, `buildTabularRecipe`, `useRecipeViewMode`, `useMediaQuery` in web. Real `<table>` + ARIA `scope`/`headers`. Column cascade assignment proven sound by induction. Sub-`sm` degrade-to-List safe (persisted `localStorage` preference never overwritten by viewport). Commit `4d23572`. Tests: 623 ✓.
- Three rounds of short-label fixes. After round 3 (`d467f29`): skip leading adverbial/conditional openers (meanwhile/once/after/…) to reach the imperative; strip `to/for <measurement>` ONLY for temperature + minutes/hours (ties to `extractSubLabel`); 9-word cap with glue-word trim (never ends on article/prep/conj); 2-word floor. Full text in `title`; List always lossless. Guiding principle: never emit a label a cook would read as a different or incomplete instruction — abbreviate, never mislead. Yen's `it.fails` markers for all 3 defects converted to passing. Tests: 670 ✓.
- Yen SHIP verdict (AM): 1840 tests PASS, build/lint clean. Phase 1 AM work complete.

### 2026-08-03T13:27:37-04:00 — Short-label: structural boundary rewrite (retire the word cap)

Brandon found "Cook the spaghetti in a large pot of salted" — the D2 fragment class again (8th round). Root cause ruling: truncating natural language at a word count cannot be made safe.

**The boundary rule (`dropTrailingClause`):** never cut mid-phrase. Cut ONLY at a real syntactic boundary — a subordinator (`to`/`until`/`while`/`then`) that introduces a droppable trailing clause — else emit FULL TEXT.
- Guards: ≥2 words floor; subordinator's next word must be a content word (so "to a boil"/"to 165°F" stay whole); head must not end on a glue/connective; `parts[i-2]` must not be a coordinator (blocks "…and fry | until golden" bare-verb strand); scans from the end → drops only outermost clause; trailing comma/`;`/`:` stripped from head.
- **Excluded `and`/`or` from cut boundaries** — ambiguously coordinate nouns vs clauses with no POS signal in-browser; flagged deviation to Rusty.
- Added `isParticipleHead` + `ING_BASE_VERBS` for `-ing`-led pseudo-imperatives; positional connective back-off (`c358937`) for >9-word labels ending with {to,and,or,…} at n−2.
- Deleted: word cap, trailing-glue trim, dangling-verb back-off, `CUT_CONNECTIVES`. Kept untouched: opener-skip + capitalization, `to/for` strip (temp+min/hr only), 2-word floor, `isRedundantSubLabel`.
- Width: `<td>` is `min-w-[6rem]` with no `max-w` / no `whitespace-nowrap`; longer labels wrap vertically, never a horizontal blowout.
- Commits `f8a87f3`, `c46855b`, `c358937`. Tests: 700 ✓.

### 2026-08-03T16:12:04-04:00 — Grid ingredient use-ordering (web half of `ad63eb8`)

Livingston shipped `ad63eb8` (shared/API): new non-nullable `ingredientDisplayOrder: number[]` on `TabularRecipeMealDTO`, a permutation of `0..n-1` where `ingredients[ingredientDisplayOrder[k]]` is the k-th Grid row. `spanFrom`/`spanTo` index into the DISPLAY order, not `position`.

**`buildTabularRecipe.ts`:**
- Deleted the ingredient `position`-sort (now actively wrong). `ingredients` used as-is (canonical coordinate system).
- Added `resolveDisplayOrder(order, n)`: validates a true permutation of `0..n-1`; missing/wrong-length/non-permutation → identity fallback (degrades to position order — covers older API or malformed fixture without dropping rows).
- Row loop walks `displayOrder.map((ingredientIndex, r) => …)`; `rowIndex: r` = consecutive display walk. Spans already in display coords; cascade/rowspan and `headers`/`scope` a11y linkage unchanged.
- Group runs computed over DISPLAY order. Instruction `position`-sort independent.
- Function param widened to `…& { ingredientDisplayOrder?: number[] }` for 10 legacy unit tests + defensive fallback.

**`TabularRecipeView.tsx`:** added small visible note for `matrixSource === 'derived'` — "Ingredients are listed in the order the recipe uses them, so this order can differ from the List view." Authored meals (identity = List order) get no note.

Cross-step reuse over-bracketing is intrinsic (DAG-vs-tree) — NOT tested for zero over-bracketing. Tests: `buildTabularRecipe` +5 (Birria displayOrder walk, identity fallback, malformed fallback, group runs over display order, instruction-position sort), `TabularRecipeView` +2 (use-order note, display-order render + a11y linkage). Total: 706 ✓. Commit `d325227`.

📌 Team update (2026-08-03T16:52:00-04:00): Yen's **SHIP** verdict (PM final pass): 1903 tests PASS (web 706); boundary-cut labels + displayOrder walk verified against real 94-meal DB. The word-cap `it.fails` from Yen's earlier fifth-family pass and all adversarial label families are green. Phase 1 fully complete. — decided by Yen, Rusty
