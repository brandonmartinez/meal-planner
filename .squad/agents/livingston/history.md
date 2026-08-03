# Project Context

- **Owner:** Brandon Martinez
- **Project:** meal-planner — family meal planning app with a public Magic Mirror display
- **Stack:** pnpm monorepo (Node 20+, pnpm 9). `packages/api`: Express 5 + Prisma 6 + PostgreSQL (Google OAuth via Passport, JWT in httpOnly cookies, hashed API keys, Zod, Helmet/CORS/rate-limit/Morgan). `packages/web`: React 19 + Vite 6 + React Router v7 + Tailwind v4 (MSW in tests). `packages/shared`: pure TS types/constants (`@meal-planner/shared`). TypeScript strict + ESM (`.js` suffix on api runtime imports). Vitest (api `globals:false` + prismaMock; web `globals:true` + MSW). Docker + `k8s/` + CI (Postgres 16 service).
- **Created:** 2026-06-30

## Core Context

Backend Dev. Owns `packages/api`. Auth chain: `authenticateJWT` → `requireMembership` → optional `requireRole(Role.PARENT)`; Magic Mirror uses `authenticateApiKey`. API keys stored hashed only. ESM runtime imports use `.js` suffix. Schema changes go through the guarded migration flow.

## History Summary (2026-06-30 through 2026-07-09)

- **Initialization (2026-06-30):** Ocean's Eleven cast. Filed backend reviews #8 (difficulty), #7 (MCP), #9 (IDOR). Sprint 1: #9 PR #37 (IDOR/family-scope mutations, domain error types, Zod schemas, prismaMock tests). Sprint 2: #8 PR #40 (nullable difficulty through stack, hand-authored migration).
- **Sprints 3–5 (2026-06-30):** #7 MCP backend endpoints (week, schedule, approve); #27 recent-meal indicator. Frank-gated PRs: #43/PR #67 (trust-proxy), #49/PR #68 (`safeRecordAgentAudit` 6-field allowlist), #51/PR #69 (peppered HMAC-SHA256 credential hashing with lazy legacy-rehash).
- **MCP bearer auth (2026-07-01):** #87/#88 MCP bearer auth landed; reviewer-lockout remediation by Rusty.
- **Sprint 2 Waves 4–6 (2026-07-02):** #99 PR #132 last-cooked/times-cooked derivation (single `mealSuggestion.findMany`); pg_trgm drift-gate hotfix. #107/#108 tags/categories held. v0.4.0 released.
- **Sprint 3 Waves (2026-07-02/03):** #114 PR #139 (repeat week); #113 PR #140 (random meal, RNG auditable); #120 PR #144 (ingredient normalization); #115 PR #149 (category/collection week-filling, `fillWeek()`).
- **UI polish (2026-07-03):** PR #158 removed meal taxonomy categories (#107, fold-into-tags data migration); PR #152 collection-side membership endpoint.
- **Meal Library backend (2026-07-04):** PR #172 broadened meal search (OR across name/description/tags/collections, server-side, no schema).
- **MCP image upload + image route series (2026-07-05/06):** #180/PR #183 MCP base64 image upload (magic-byte sniffing, decoded-size check, `meal:image` scope); #188/PR #195 UUID-constrained `ASSET_PATH_RE`; #196/PR #197 display image route for API-key auth (ETag/304, `rewriteDisplayImageUrl`); #198/PR #200 `Vary: x-api-key` + storage error logging.
- **v0.6.0 Wave 1 (2026-07-09):** #206 PR #211 grocery regenerate (preserve checked, date-range generate, manual remove-past-days).

## Learnings

### 2026-08-03 (AM) — Grid view Waves 1/2/P1-9 (summary)

- **Wave 1 (P1-2, `7054875`):** Delivered `packages/shared` tabular types: `InstructionKind` enum, `TabularRecipe*` DTOs, `deriveRecipeMatrix()` pure function. Never-persist contract and structural provenance documented in load-bearing module header. 31 colocated tests. `tsc`+vitest+eslint ✓.
- **Wave 2 (P1-3/4/5, `9f62bfc`):** Wired `deriveRecipeMatrix()` into all meal detail reads via `applyRecipeMatrix()` in `services/meals.ts`. `MEAL_DETAIL_INCLUDE` + `exportMeals` now `orderBy: { position: "asc" }`. `mapIngredientCreates()` assigns 0-based position from array index. MCP `apiClient` retyped to `TabularRecipeMealDTO`; tool descriptions updated. +6 api service tests; 1017 total. Rusty APPROVED.
- **P1-9 (`07c21b2`):** Suppressed derived group pills — `groupLabel = ing.groupLabel ?? null` (dropped `?? ing.category` fallback). `category` is grocery-aisle vocabulary, not recipe sections. Spec §3.4 rule 2 rewritten. 1023 api tests ✓. Rusty APPROVED. #96 parity conditional discharged.
- Yen SHIP verdict (AM): 1840 tests PASS, build/lint clean.

### 2026-08-03T11:00:32-0400 — Grid view P1-10: ingredient use-ordering (`ingredientDisplayOrder`)

- Rusty ruling (measured against Brandon's real 74-meal library: 26/61 PROCESS steps (43%) over-bracketed, 15/16 instruction-bearing meals swept in unnamed rows). Root cause: ingredients stored in SHOPPING order, Chu's Grid needs USE order, and min..max spans sweep everything between non-adjacent co-used rows.
- New read field `TabularRecipeMealDTO.ingredientDisplayOrder: number[]` — a permutation of `0..n-1` where `ingredients[ingredientDisplayOrder[k]]` is the k-th Grid row. `ingredients` array STAYS canonical `position` order (untouched — coordinate system for List/Grocery/Cooking-Mode/authored spans). Rusty option (a): derivation emits the order, web never re-sorts/re-derives.
- `spanFrom`/`spanTo` now index into `ingredientDisplayOrder` (DISPLAY rows), so every derived span is contiguous by construction. Derived: `deriveInstructions` computes `firstUse[]` (min matching-step index; unreferenced → sentinel `n`), sorts rows by `(firstUse, position)` (stable — first-use wins, ties/unreferenced by position, unmatched parked at END), builds inverse `displayIndexOf[]`, maps each PROCESS step's matched rows through it → min/max. Authored: identity permutation `[0..n-1]`, spans pass through unchanged (never reordered — same §3.3 invariant).
- Anti-staleness reaffirmed: `ingredientDisplayOrder` computed on read, NEVER persisted, no stored flag, provenance stays structural (`matrixSource` from `spanFrom != null`). Load-bearing module/helper comments updated.
- API: `applyRecipeMatrix()` in `services/meals.ts` passes `ingredientDisplayOrder` straight through; REST serves the service result and MCP `apiClient` returns `TabularRecipeMealDTO`, so both INHERIT the field. Confirmed (not assumed): api tsc + full suite green, mcp tsc + suite green.
- Parity #96: read-only field → shared DTO (added) + REST (inherited) + MCP apiClient (inherited). No write field, no `inputSchema` obligation, Phase-1 read-only posture preserved. Updated `create_meal`/`update_meal` MCP tool descriptions + apiClient doc comments.
- Real-DB sanity check (read-only, `saul-mealdb`): Birria Tacos derives displayOrder `[1,2,3,0,6,4,5,7]`, braise span `0..4` — corn tortillas (display 5) & oaxaca cheese (display 6) pulled OUT; cilantro parked last. Residual: onion still swept (first-used with chiles, chiles reused by braise) — intrinsic cross-step reuse, only Phase-2 authored spans close it.
- Tests: shared +7; api: ordering test + `ingredientDisplayOrder` assertions on derived + authored. Verified: shared 41 ✓; api 1023 ✓; mcp 121 ✓. Committed with pathspec.

## 2026-08-03T11:00:32-0400 — Grid matcher hardening: phrase-specificity (token collisions)

- PROBLEM (found by Saul while authoring the seed): "Ground beef" + "Beef broth" both reduced to `{beef}` (descriptor `ground` was a stop word), so a step mentioning "beef" matched BOTH — corrupting the first-use permutation.
- FIX in `packages/shared/deriveRecipeMatrix.ts` (DERIVED branch only): split `STOP_WORDS` into `QUANTITY_STOP` (removed) and `MODIFIER_WORDS` (kept, tagged `mod` — adds phrase specificity, can never anchor). Replaced any-token matching with **phrase-specificity claiming**: for each ingredient find maximal runs of step tokens all belonging to it AND truly adjacent (whitespace-only; `gapBefore` flag); occurrence specificity = # distinct ingredient core tokens; each step position won by max-specificity; ties → BOTH match.
- True adjacency critical: "chicken in broth" must NOT collapse to "chicken broth"; "ground beef" (whitespace-adjacent) does form a phrase.
- Genuine ambiguity (lone shared token, no distinguishing adjacency) → match both. Never drop a match on a guess.
- MEASURED on real 74-meal library: changed **1 step** (Thai Green Curry false positive). Honest: collision was RARE; ordering was the dominant cause.
- Tests: shared +6 unit + 1 real-data → 48 total. api 1023 ✓. Spec §3.4 rule 5 updated. Committed with pathspec (`packages/shared`).

## 2026-08-03T11:00:32-0400 — Grid matcher hardening: ingredient-side full-consumption (mirror of a008feb)

- PROBLEM (found by Saul in Greek Salad): `Olives` + `Olive oil`, step says bare "olives" → equal step-side specificity → both matched → Olive oil falsely swept.
- FIX: second tiebreak after step-side `spec`. Each occurrence records `fullyConsumed` (= matched run covers ALL of ingredient's CORE tokens). Per position, `hasFull[p]` = any spec-winner is fully consumed; candidate claims p iff it ties winning spec AND either no winner is fully consumed OR it is fully consumed. So "olives" fully consumes `Olives` but leaves `oil` in `Olive oil` → `Olives` wins.
- CRITICAL: full-consumption is BINARY, not a count. A count wrongly evicted `beef chuck roast` in favour of `beef broth` on "braise the beef" — tested and rejected. Only a candidate leaving NOTHING unaccounted-for may evict others.
- No under-matching regression: a lone candidate always matches regardless of leftover core. Eviction only when a co-covering occurrence at the same position is fully consumed.
- MEASURED on real 74-meal library: **0 steps changed, 0 rows dropped, 0 added.** No subset-collision pairs in the whole library. Honest: this collision class is currently ABSENT on real data. Fix is future-proofing.
- Tests: shared +5 → 53 total. api 1023 ✓. mcp 121 ✓. Spec §3.4 rule 5 updated. Committed with pathspec.

📌 Team update (2026-08-03T16:52:00-04:00): Yen's **SHIP** verdict (PM final pass): 1903 tests PASS; Yen independently cross-validated Livingston's `deriveRecipeMatrix` output against 94 meals — 0 mismatches. Matcher hardening impact confirmed as 1 step (`a008feb`) + 0 steps (`09eb5b4`); use-ordering (`ad63eb8`) was 17 steps / the dominant cause. `ingredientDisplayOrder` verified as a valid permutation on all 94 meals; a11y `headers`/`scope` correct in live browser DOM. Phase 1 fully complete. — decided by Yen, Rusty
