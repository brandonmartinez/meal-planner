# Project Context

- **Owner:** Brandon Martinez
- **Project:** meal-planner — family meal planning app with a public Magic Mirror display
- **Stack:** pnpm monorepo (Node 20+, pnpm 9). `packages/api`: Express 5 + Prisma 6 + PostgreSQL (Google OAuth via Passport, JWT in httpOnly cookies, hashed API keys, Zod, Helmet/CORS/rate-limit/Morgan). `packages/web`: React 19 + Vite 6 + React Router v7 + Tailwind v4 (MSW in tests). `packages/shared`: pure TS types/constants (`@meal-planner/shared`). TypeScript strict + ESM (`.js` suffix on api runtime imports). Vitest (api `globals:false` + prismaMock; web `globals:true` + MSW). Docker + `k8s/` + CI (Postgres 16 service).
- **Created:** 2026-06-30

## Core Context

Frontend Dev. Owns `packages/web`. Use the `request<T>()` pattern and MSW handlers (see `.github/instructions/web.instructions.md`). Web tests run Vitest with `globals: true`.

## Recent Updates

📌 Team initialized on 2026-06-30 (Ocean's Eleven cast).

📌 Recent update (2026-06-30T15:08:40-04:00): Frontend review filed #14 (request<T>), #15 (a11y forms), #16 (a11y modals), and #17 (API key UX).

📌 Recent update (2026-06-30T15:28:32-04:00): #27 includes web acceptance for a "Recent" badge on meals browse plus difficulty display from #8.

📌 Sprint 2 batch (2026-06-30T18:32:22-04:00): Two PRs. (1) #14 `PR #39` — centralized all `packages/web` API calls through a typed `request<T>()` + `ApiError` client (`packages/web/src/api/client.ts`) and removed raw `fetch` (the OAuth redirect stays a documented exception). (2) #8 web UI `PR #44` — surfaced the nullable meal difficulty: a `DifficultyBadge` for display plus a form select to set/clear EASY/MEDIUM/HARD, on top of Livingston's backend/shared work. Both CLOSED.

📌 Sprint 3 batch (2026-06-30T21:57:00-04:00): A11y + UX sweep across `packages/web`, all merged & closed. #16 — accessible modals (MealPicker, ImportMealsDialog); a11y gate PASSED. #6 web UI — agent-credential management surface (Frank owned the backend). #27 web — recent-meal badge on meals browse (Livingston backend). #17 — API key copy + last-used display. #15 (PR #62, last to merge) — accessible names + loading-status across web pages; a11y gate PASSED; de-raced 3 loading-status a11y tests before merge.

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

- 2026-07-01: #70 Meal Library UI (PR #73) — MealPicker Recent/Difficulty badges + MealsPage zoned card layout (impeccable layout pass). a11y gate APPROVE. Merged.
📌 Team update (2026-07-02T10:16:59-0400): Eight epic #91 recipe-management issues were filed under Linus ownership for future frontend planning. — logged by Scribe
📌 Team update (2026-07-02T19:53:00Z): Wave 3 shipped #101 recipe detail page in PR #130; MealPicker linking deferred to avoid nested-interactive a11y risk. Wave 4 launched #103 imageUrl wiring from green main 67c4f42 with CSV lockstep + Helmet CSP review — logged by Scribe.

📌 Team update (2026-07-02T19:16:33-04:00): Sprint 2 Waves 4–6 complete. #103 (external recipe imageUrl) shipped PR #133 SHA ba7b628 with shared MealThumbnail component, scheme allowlist, minimal CSP broadening (img-src: "https:"), graceful degradation, full REST + agent + MCP parity, CSV round-trip. #108 (tags/categories UI) shipped PR #135 SHA b16810d with TokenField (native datalist + pills), MealTagList (compact display, capped + overflow), useTaxonomy hook (DRY, fails soft), filter controls (OR-within-facet, AND-across-facets), 327 web tests green, lint 0 errors. v0.4.0 recipe-metadata vertical complete. — logged by Scribe

- 2026-07-02: #102 Local cooking mode (PR pending) — immersive `/meals/:mealId/cook` route + "Start cooking" CTA on MealDetailPage. Large-text steps, ingredient checklist, per-step completion, per-step countdown timers. ALL client-side (React useState, in-memory) — no backend/localStorage/server progress. New: `pages/CookingModePage.tsx`, `components/CookTimer.tsx`, `hooks/useCountdown.ts` + colocated tests. Web gate green: 356 tests (42 files), lint clean. a11y: native checkboxes/labels, aria-labelled timer buttons, single role="alert" on completion (no per-tick spam), 44×44 targets. CSP intact (bundled React, no inline). **Reusable learning:** userEvent v14 clicks DEADLOCK under vi.useFakeTimers() (0-delay setTimeout never reached by advanceTimersByTime(0)) → use fireEvent.click (sync, auto-act) for clicks in fake-timer tests, reserve act() for advanceTimersByTime. Web lane only.

📌 Team update (2026-07-02T21:37:00-0400): Sprint 3 Wave 1 complete. Linus shipped #102 local cooking mode (frontend-only `/meals/:mealId/cook` + timers); Basher shipped #104 image asset backend; Livingston shipped #114 repeat previous week planning. Merges: #104 PR #137 SHA a9a5df5; #102 PR #138 SHA 6acf0d0; #114 PR #139 SHA 68b6637. — logged by Scribe

📌 Team update (2026-07-03T01:15:59-0400): Sprint 3 Wave 2 complete. #105 meal image upload UI merged via PR #143 (9bb530d): MealImageField link/upload mode, web image API + MSW handlers, unified imageUrl, and thumbnails. — logged by Scribe

## 2026-07-03T02:23:57-0400 — Wave 3 shipped

- Shipped #110 collections UI; PR #145 squash `e3b2651` merged after Saul #116 and Livingston #120. State reconciled by Scribe.

## 2026-07-03T03:07:00-0400 — Wave 4 shipped

- Shipped #117 planning templates UI; PR #147 squash `ed355be` merged. Added `/templates` management and WeekPlan apply flow with `existingMode:error` first, 409 confirmation, skip/replace choices, and parent-gated destructive actions.

📌 Team update (2026-07-03T17:14:44Z): Merged UI wave (PR #157 unapprove toggle + photo stamp, PR #159 responsive toolbar, PR #160 photo stamp label fix + 5 additional design decisions: password manager suppression, collections redesign, meal form polish, repeat-week modal, template modal pagination) — Linus

📌 Team update (2026-07-03T17:36:35-0400): PR #161 DayCard stamp hotfix Round 2 merged to main (f5e2662). Fixed invisible-stamp regression from #160 by using `size-16 sm:size-20` shorthand (both dimensions definite 64px/80px, no wrapper, no absolute positioning). Tests assert size-16, object-cover, no absolute. Web lint 0, tests 527/527. — logged by Scribe

📌 Team update (2026-07-04T10:57:00-04:00): Meal Library UI epic #168 shipped across 4 merged PRs. Linus delivered: PR #169 standardized Select control + page-width foundations (shared component, 12 replacements, 9 pages normalized to max-w-7xl); PR #170 Meal Library density + filtering (card/table toggle with persistence, TagMultiSelect, hide-built-ins); PR #173 meal detail modal navigation (title clicks open MealDetailModal, `/meals/:id` deep-link preserves modal on cooking-mode exit). Decision records reconciled by Scribe.
📌 Team update (2026-07-05T17:05:41-04:00): #184 steps/instructions editor shipped by Linus and merged via PR #185 (commit 65d302b); web meal create/edit now supports ordered instructions with timers, closing the UI gap after #100.

📌 Team update (2026-07-06T14:09:24-04:00): Delivered MMM-meal-planner server-side image proxy (MMM #5, PR #6). `node_helper` now fetches relative `/api/display/images/{id}` URLs as arraybuffer via axios with `X-API-Key`, base64-encodes them to data URIs, and caches per URL with ETag + `If-None-Match` conditional GET (304 → reuse). Per-image errors are isolated so one bad asset can't drop the whole payload. Added `thumbnailHeight` config (default `6rem`) → `--mmp-thumb-height` CSS custom property for per-install image sizing. Clarified `days` semantics in README (today + next days−1). Images are now fully visible on the MagicMirror display end-to-end. Issue MMM #5 closed. — logged by Scribe

📌 Team update (2026-07-09T01:11:01-0400): Wave 1 v0.6.0 grocery & meal-picker assignment — #208 meal-picker modal UX, frontend-only. Read `MealPicker.tsx`; produce UX changes, tests, and PR. — logged by Scribe

📌 Team update (2026-07-09T01:55:00-04:00): Wave 1 v0.6.0 shipped #208 meal-picker modal UX; PR #209 merged (`5b02eca`). Search now covers names/tags, difficulty uses a single Select, advanced facets are collapsed by default, and descriptions show two lines. — logged by Scribe

### 2026-07-28T10:15:00-04:00 — #218 grocery grouping rejection lesson

Rusty rejected Linus's commit `21be592` on two counts: pantry-staple separation was made category-mode-only, which regressed the #205 contract that managed pantry staples remain separated mode-independently; and meal grouping inferred provenance from `sources`, which the API can leave stale when a MANUAL orphan is promoted. Linus was locked out of the revision under the Reviewer Rejection Protocol; Virgil owned the follow-up fix.

### 2026-07-28T13:00:00-04:00 — #220 Week Plan header action row

Moved the Week Plan header actions (Grocery List, Repeat a previous week, Apply a template) into a dedicated action row below the title/date cluster. Removed the obsolete desktop spacer. The row renders only for non-past weeks, stacks full-width on mobile, and omits itself entirely on past weeks; tests cover parent, child/partial, and past-week/no-row cases. Web validation green: `pnpm --filter @meal-planner/web run test` (593 passed), lint, build.

### 2026-07-28T13:55:00-04:00 — Week Plan header action row edge cases

Week Plan title/date now own the first header row, while Grocery List and parent actions live in a dedicated `role="group"` Week actions row below. Past weeks omit the row entirely; non-parent viewers still get Grocery List only. Tests should assert row membership and the absence of the action-row heading in omitted cases.

### 2026-08-03T11:00:32-04:00 — Tabular "Grid" recipe view (P1-6/7/8)

Shipped the visible half of the Cooking-for-Engineers Grid mode, web-only, against Livingston's pinned `@meal-planner/shared` DTOs (`TabularRecipeMealDTO`).
- `useRecipeViewMode` hook — `localStorage['recipeViewMode']` (`'list'|'grid'`, default `'list'`), SSR-guarded + try/catch, mirrors `ThemeContext`.
- `useMediaQuery` hook — powers the sub-`sm` degrade-to-List (§8).
- `utils/buildTabularRecipe.ts` — presentation layout (ported `buildColumnCells` + gap compression). **Column assignment = cascade:** each PROCESS step (position order) sits one column right of the right-most EARLIER step whose row range it overlaps; non-overlapping steps share col 0. Proven to reproduce the prototype's cookies/aglio/po'boy columns exactly and to leave no empty columns.
- `TabularRecipeView` — real `<table>` with `<caption>`, `<th scope="row">` sticky ingredient column, SETUP `<th scope="colgroup">` bands, rowspan step `<td>`s `headers`-linked to their column + spanned ingredient rows, gap cells `aria-hidden`, group pills once per contiguous `groupLabel` run (rotating border colours), FINISH note below. Tailwind tokens (blue accent + gray surfaces), not the prototype's raw `--cp-*`.
- `RecipeViewToggle` — labelled button group with `aria-pressed`, controlled by the page.
- Wired into `CookingModePage`: List (existing checklist) vs Grid, toggle in header, degrade hint on phones. Lifted `formatIngredient` to `utils/`. Switched the page's load to a new `getTabularMeal()` client (same meal-detail endpoint, wider DTO).

Verify: web build ✓, lint 0 ✓, tests 623 ✓ (37 new across 5 files).
Stub note: `getTabularMeal` casts the meal-detail response to `TabularRecipeMealDTO`; when Livingston's derive-on-read path isn't yet serving the new fields the Grid degrades gracefully (List always correct). Tests drive the real shape via MSW fixtures.

### 2026-08-03T12:16:22-04:00 — Grid content-shaping follow-ups (Rusty findings 1 & 2)

Rusty APPROVED the web layer (`4d23572`) with two content-shaping follow-ups; fixed together, web-only, presentation-only (no DTO field, no `packages/shared`/`packages/api` edits — `text` stays the single semantic source).
- New `utils/shortStepLabel.ts`: `shortStepLabel(text)` derives a terse Grid label — leading clause up to first comma, else ~6-word cap; strips a trailing "to/for <detail>" tail; falls back to trimmed original if emptied. `isRedundantSubLabel(sub, label)` = case-insensitive substring test.
- `TabularRecipeView`: PROCESS cells now render the short label with the **full text in `title`** (hover); subLabel suppressed when it's a substring of the displayed label (belt-and-suspenders for finding 1). SETUP bands also suppress a redundant subLabel. List view untouched → still lossless.
- Examples: "Whisk the flour, cornstarch, cornmeal, …" → **"Whisk the flour"**; "Heat the frying oil to 350°F" → **"Heat the frying oil"** + additive "350°F"; "Chill 30 min" (sub "30 min") → "Chill 30 min" with the dup sub suppressed; "whisk" → "whisk".
- **No-groups degrade path** (Livingston removed shared's `?? ing.category` fallback, so derived `groupLabel` is now all-null — the common case on real data): verified no pills, no coloured borders, consistent transparent 4px left accent (no layout shift). Updated my own `TabularRecipeView.pipeline.test.tsx` (from `e5765fc`) which had asserted the old category-pill behavior.

Verify: web build ✓, lint 0 ✓, tests 650 ✓ (shortStepLabel 13, +4 renderer, +1 page integration; pipeline test updated to new contract).

### 2026-08-03T12:24:12-04:00 — Short-label heuristic: principled to/for strip

Rusty follow-up: the positional "to/for tail" strip was misfiring ("Bring to a boil" → "Bring", "Reduce to a simmer" → "Reduce") — meaningless in a cooking app. Made the rule principled (web-only, `utils/shortStepLabel.ts`):
- Strip a trailing `to|for <tail>` ONLY when the tail contains a **temperature or duration** (the exact fragments `extractSubLabel` re-shows) — tied to the redundancy it exists to remove.
- **2-word floor:** never strip down to a bare verb. "Cook to 165°F" stays whole (its dup "165°F" subLabel is then dropped by `isRedundantSubLabel`); "Bring to a boil"/"Sear to a deep crust" keep their tails (no measurement).
- Word cap now trims a trailing dangling connective (and/with/the/until/…) so a truncated label never ends mid-phrase.
- Guiding principle codified in the module doc: the short label must be *abbreviated*, never *wrong*; when in doubt keep more text (title + List carry the rest).

Verify: web build ✓, lint 0 ✓, tests 653 ✓ (shortStepLabel now 16).

### 2026-08-03T12:43:32-04:00 — Short-label: three "misleading not abbreviated" defects

Yen found two adversarially, Brandon a third off the shipping screenshot — all the same principle violation. Fixed web-side in `utils/shortStepLabel.ts`; converted Yen's `it.fails` in `shortStepLabel.adversarial.test.ts` to passing and extended.
- **D1 adverbial opener promoted to the whole label** ("Meanwhile, cook the pasta" → "Meanwhile"). Now split on commas and pick the first clause that ISN'T a recognized opener (meanwhile/once/after/before/while/when/carefully/gently/using/if/as/then/next/…), so the imperative survives → "cook the pasta".
- **D2 6-word cap truncated mid-phrase** ("Dredge the shrimp in the seasoned flour" → "…the seasoned"). Root cause was the aggressive cap; raised the runaway guard to 9 words (a complete 7–8-word phrase beats a fragment — "err long"), and the cap trims trailing glue words so it never ends on an article/prep/conjunction.
- **D3 seconds/days stripped but never re-shown.** Verified shared's `extractSubLabel` only emits min/hr/° (deriveRecipeMatrix.ts:96–109). Narrowed the strip to temperature + minutes/hours ONLY, so "Blanch the beans for 90 seconds" / "Cure the salmon for 2 days" keep the timing in-label (it'd otherwise be invisible on a no-hover touch tablet).
- Codified the unifying rule in the module doc: never emit a label a cook reads as a DIFFERENT or INCOMPLETE instruction; abbreviate only by dropping redundant detail (bracket/subLabel already convey it); when in doubt, KEEP MORE TEXT.
- My own extra probe (assume a 4th): trailing "…and let" / determiner+adjective run-ons — covered by keeping moderate clauses whole + the glue-word trim; added a family asserting no label ends on a dangling article/prep/conjunction and always starts with the original verb.

Verify: web build ✓, lint 0 ✓, tests 670 ✓ (shortStepLabel 19, adversarial 14).

### 2026-08-03T13:00:10-04:00 — Short-label FIFTH family: prepositional/numeric openers

Yen's sweep on d467f29 found the D1 root cause one layer deeper: `isOpenerClause` enumerated adverbial *words* and only saw the first token, so a leading clause that was a PREPOSITIONAL phrase ("In a large bowl, whisk the eggs" → "In a large bowl") or a NUMERIC/timing phrase ("2 minutes before serving, stir…" → "2 minutes before serving") was promoted to the label and the imperative dropped — misleading, not terse.
- **Structural rewrite, not five more words.** Replaced the `OPENERS` word list with the inverse rule: a leading clause is an opener when it is NOT headed by a verb. `NON_VERB_HEADS` names closed grammatical classes (prepositions, conjunctions, determiners, temporal/manner adverbs); a `/^[\d…]/` head catches numeric/timing openers; and `isParticipleHead` treats an `-ing` head as a manner/means adjunct ("Using a slotted spoon,", "Working in batches,").
- **The one trap in the participle rule:** base-form verbs that end in -ing ("Bring to a boil", "String the beans") are real imperatives. `ING_BASE_VERBS` exempts them so the imperative is never skipped for a later clause — guarded by an explicit "Bring to a boil, then add the pasta" → "Bring to a boil" test.
- Converted Yen's 6 `it.fails` → passing; added a self-adversarial sixth-family guard (participles beyond "using", the -ing base-verb exception, no-comma prepositional phrase → keep full text, all-opener → keep full text, consecutive openers). All-opener/no-comma cases fall back to full text (err long, never misleading), per the module's unifying rule.

Verify: web build ✓, lint 0 ✓, tests 682 ✓ (shortStepLabel 19, adversarial 26).

### 2026-08-03T13:07:07-04:00 — Short-label: dangling-verb fragments + opener capitalization

Brandon reversed the earlier "…to make" err-long call after seeing two cells end mid-phrase on a bare verb in one screenshot ("…together to make", "…and sauté"). Same D2 fragment principle, reaching trailing VERBS the glue-word trim didn't catch. Plus a cosmetic: opener-stripped labels rendered lowercase against a capitalized column.
- **Dangling-verb trim (structural, no POS tagging).** The runaway cap now backs off past a severed "<connective> <head>" tail: after the existing weak-ending pop, if the second-to-last token is a phrase-introducing connective (`to/and/or/but/nor/then/plus`) it drops both that connective and its objectless head, then loops. Keyed on POSITION: a COMPLETE "to a boil" leaves "to" at n-2 (safe), a severed "to make" leaves "to" at n-1 (stripped) — so it distinguishes them without knowing parts of speech. Floored at MIN_LABEL_WORDS.
- **Capitalization.** `skippedOpener` = the chosen instruction clause isn't `clauses[0]`; when true, sentence-case the first char ("cook the pasta" → "Cook the pasta"). Non-opener clauses keep the author's original casing, so terse-verb/lowercase-authored labels are untouched.
- **Self-adversarial probe (seventh family):** coordinated verbs ("…and season and then sear"), triple-and run-ons, and a complete "…bring it to a boil" that must NOT be over-trimmed. All land on a complete word and still start with the original imperative.
- Left ℃/℉ glyphs and "1½" alone per Brandon (genuinely out of scope).

Verify: web build ✓, lint 0 ✓, tests 688 ✓ (shortStepLabel 21, adversarial 30).
