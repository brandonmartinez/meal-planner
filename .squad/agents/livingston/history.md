# Project Context

- **Owner:** Brandon Martinez
- **Project:** meal-planner — family meal planning app with a public Magic Mirror display
- **Stack:** pnpm monorepo (Node 20+, pnpm 9). `packages/api`: Express 5 + Prisma 6 + PostgreSQL (Google OAuth via Passport, JWT in httpOnly cookies, hashed API keys, Zod, Helmet/CORS/rate-limit/Morgan). `packages/web`: React 19 + Vite 6 + React Router v7 + Tailwind v4 (MSW in tests). `packages/shared`: pure TS types/constants (`@meal-planner/shared`). TypeScript strict + ESM (`.js` suffix on api runtime imports). Vitest (api `globals:false` + prismaMock; web `globals:true` + MSW). Docker + `k8s/` + CI (Postgres 16 service).
- **Created:** 2026-06-30

## Core Context

Backend Dev. Owns `packages/api`. Auth chain: `authenticateJWT` → `requireMembership` → optional `requireRole(Role.PARENT)`; Magic Mirror uses `authenticateApiKey`. API keys stored hashed only. ESM runtime imports use `.js` suffix. Schema changes go through the guarded migration flow.

## History Summary (2026-06-30 through 2026-07-09)

- **Initialization (2026-06-30):** Ocean's Eleven cast. Filed backend reviews #8 (difficulty), #7 (MCP), #9 (IDOR). Sprint 1: #9 PR #37 (IDOR/family-scope mutations, domain error types, Zod schemas, prismaMock tests). Sprint 2: #8 PR #40 (nullable difficulty through stack, hand-authored migration).
- **Sprints 3–5 (2026-06-30):** #7 MCP backend endpoints (week, schedule, approve); #27 recent-meal indicator. Frank-gated PRs: #43/PR #67 (trust-proxy), #49/PR #68 (observable audit drops — `safeRecordAgentAudit` 6-field allowlist), #51/PR #69 (peppered HMAC-SHA256 credential hashing with lazy legacy-rehash).
- **MCP bearer auth (2026-07-01):** #87/#88 MCP bearer auth landed; reviewer-lockout remediation by Rusty.
- **Sprint 2 Waves 4–6 (2026-07-02):** #99 PR #132 last-cooked/times-cooked derivation (single `mealSuggestion.findMany` query, no schema); pg_trgm drift-gate hotfix inline. #107/#108 tags/categories held until migration wave. v0.4.0 released.
- **Sprint 3 Waves (2026-07-02/03):** #114 PR #139 (repeat previous week, REST/agent/MCP/web parity); #113 PR #140 (random meal selection, RNG auditable); #120 PR #144 (ingredient normalization); #115 PR #149 (category/collection week-filling, `fillWeek()`).
- **UI polish (2026-07-03):** PR #158 removed meal taxonomy categories (#107, fold-into-tags data migration); PR #152 collection-side membership endpoint.
- **Meal Library backend (2026-07-04):** PR #172 broadened meal search (OR across name/description/tags/collections, server-side, no schema).
- **MCP image upload + image route series (2026-07-05/06):** #180/PR #183 MCP base64 image upload (magic-byte sniffing, decoded-size check, `meal:image` scope); #186/PR #187 `imageUrlSchema` same-origin fix; #188/PR #195 UUID-constrained `ASSET_PATH_RE`; #196/PR #197 display image route for API-key auth (ETag/304, `rewriteDisplayImageUrl`); #198/PR #200 `Vary: x-api-key` + storage error logging.
- **v0.6.0 Wave 1 (2026-07-09):** #206 PR #211 grocery regenerate (preserve checked, date-range generate, manual remove-past-days, `903e09d`).

## Learnings

## 2026-08-03T11:00:32-0400 — Grid view Wave 1 (P1-2): shared type contract + deriveRecipeMatrix

- Delivered `packages/shared` for the tabular ("Grid") recipe view (spec §3.3–3.4), unblocking Linus.
- Added `InstructionKind` (`SETUP|PROCESS|FINISH`, mirrors Prisma enum, `PROCESS` default) to `constants/index.ts`.
- New `types/tabularRecipe.ts`: `MatrixSource`, `TabularRecipe{Ingredient,Instruction}Input`, `TabularRecipe{Ingredient,Instruction}Matrix`, `TabularRecipeMatrix`.
- New wire DTOs in `types/dto.ts`: `TabularRecipeIngredientDTO`, `TabularRecipeInstructionDTO`, `TabularRecipeMealDTO` (pinned contract for `buildTabularRecipe`).
- `deriveRecipeMatrix(ingredients, instructions)` — pure, no Prisma. Structural provenance (`spanFrom != null` → authored), never-persist/never-clobber guarantees in a load-bearing module header citing the grocery-provenance staleness lesson. 27 colocated tests.
- Verified: `tsc` build ✓, vitest 31 tests ✓, eslint ✓. Committed with pathspec (packages/shared + my .squad files) — no bare commit (shared worktree with Saul/Linus/Rusty concurrent).
- Handoff: Wave 2 (P1-3/4/5) service+route+MCP read path waits on Saul's P1-1 migration + regenerated Prisma client.

## 2026-08-03T11:00:32-0400 — Grid view Wave 2 (P1-3/4/5): API read path + REST + MCP read parity

- Wired `deriveRecipeMatrix()` into every meal detail read (`getMealById`, `createMeal`, `updateMeal` returns) via a new `applyRecipeMatrix()` projection in `services/meals.ts`. It sorts ingredients+instructions by `position`, derives, and zips effective `groupLabel`/`kind`/`subLabel`/`spanFrom`/`spanTo` + `matrixSource` back onto the persisted rows. Served shape == pinned `TabularRecipe*DTO` contract — ZERO deviation, Linus's types unchanged.
- Anti-staleness enforced end-to-end: derived is computed on every read, NEVER written back; provenance stays structural (`spanFrom != null`); authored layouts pass through untouched (module + helper doc comments cite the grocery-provenance lesson).
- `MEAL_DETAIL_INCLUDE` + `exportMeals` select now `orderBy: { position: "asc" }` for ingredients — the load-bearing ordering so `spanFrom`/`spanTo` index correctly.
- `position` maintenance on write: new `mapIngredientCreates()` assigns 0-based position from input array index across create/update/import(replace+create) paths, mirroring `mapInstructionCreates`. Per spec §3.2 no new *input* field needed (array order already conveys it) — confirmed in code; REST/MCP write parity holds unchanged.
- MCP: `apiClient.createMeal/updateMeal` retyped `Meal` → `TabularRecipeMealDTO`; `create_meal`/`update_meal` tool descriptions now note the returned Grid read fields + that layout authoring is not yet an input (Phase 2). `list_meals` untouched (list DTO carries no matrix).
- Parity #96: schema ✓ / service ✓ / shared DTO ✓ / REST read ✓ / MCP apiClient ✓ / MCP tool descriptions ✓. Agent-write Zod + MCP write inputSchema = documented N/A (Phase 1 ships READ only; no authoring input). Scopes unchanged (`meal:write` writes, existing read scopes reads).
- Tests: +6 api service tests (derive-on-read, authored-passthrough/no-clobber, position ordering, no-match degenerate span, ingredient position on create + replace). Completed 6 pre-existing create/update/agent re-fetch fixtures with `instructions:[]`/`ingredients:[]` (real detail read always includes both).
- Verified: api tsc ✓ + 1017 tests ✓ + eslint 0 errors; mcp tsc ✓ + 121 tests ✓ + eslint 0 errors. Committed with pathspec (`packages/api/src packages/mcp`) — no bare commit (Linus live in web).

## 2026-08-03T12:16:22-0400 — Grid view P1-9 (finish batch): suppress DERIVED group pills

- Rusty ruling (option ii): render group pills/borders ONLY for an authored `groupLabel`; drop the derived `?? category` fallback. In this app `category` is the grocery-aisle vocabulary (produce/dairy/pantry…), so category-derived pills grouped ingredients by shopping aisle instead of recipe section — actively fighting Chu's format. Yen's flattering fixture ("seafood/breading/remoulade") masked it.
- `deriveRecipeMatrix`: effective `groupLabel = ing.groupLabel ?? null` (was `?? ing.category ?? null`). Derived meals now render UNGROUPED (all pills null) — the COMMON case on real data until Phase-2 authoring. Updated the module comment + `TabularRecipe{IngredientInput,IngredientMatrix}` doc comments; kept `category` on the input type (still part of the persisted row, avoids api excess-property churn) but documented that it's intentionally ignored for grouping.
- Tests: rewrote the shared "group runs" describe (derived→null, authored passthrough, per-row authored labels) + the authored-mode group test; 31 shared tests green. Updated 2 api service matrix tests (derive-on-read all-null, authored-passthrough with one null row) — the only api assertions that depended on the old behavior. Full api suite 1023 green.
- Zero-parity-impact CONFIRMED in code: `groupLabel` is display-only and never persisted; no schema/migration change, no DTO shape change, no #96/MCP change. Only the derived fallback was removed.
- Spec §3.4 rule 2 rewritten so code and spec agree; also fixed the 4 other spots that asserted category-derived groups (schema comment, §3.3 DTO bullet, §11 test plan, resolved-options footer).
- Verified: shared tsc+31 tests+eslint ✓; api tsc+1023 tests+eslint (0 errors) ✓. Committed with pathspec (`packages/shared packages/api`) — no bare commit (Linus live in web on the short-label change; his renderer must degrade to null-groups, now the common path).

📌 Team update (2026-08-03T11:00:32-04:00): Rusty **APPROVED** P1-2/3/4/5 (`7054875`, `9f62bfc`) — anti-staleness confirmed end-to-end, ingredient ordering belt-and-suspenders, position-on-write confirmed, #96 N/A standing. Rusty **APPROVED** P1-9 (`07c21b2`) — zero parity/schema impact confirmed. Yen gave **SHIP Phase 1** verdict: 1840 tests passing, build/lint clean. Phase 1 complete. — decided by Rusty, Yen

## 2026-08-03T11:00:32-0400 — Grid view P1-10: ingredient use-ordering (`ingredientDisplayOrder`)

- Rusty ruling (measured against Brandon's real 74-meal library: 26/61 PROCESS steps (43%) over-bracketed, 15/16 instruction-bearing meals swept in unnamed rows). Root cause: ingredients stored in SHOPPING order, Chu's Grid needs USE order, and min..max spans sweep everything between non-adjacent co-used rows.
- New read field `TabularRecipeMealDTO.ingredientDisplayOrder: number[]` — a permutation of `0..n-1` where `ingredients[ingredientDisplayOrder[k]]` is the k-th Grid row. `ingredients` array STAYS canonical `position` order (untouched — coordinate system for List/Grocery/Cooking-Mode/authored spans). Rusty option (a): derivation emits the order, web never re-sorts/re-derives.
- `spanFrom`/`spanTo` now index into `ingredientDisplayOrder` (DISPLAY rows), so every derived span is contiguous by construction. Derived: `deriveInstructions` computes `firstUse[]` (min matching-step index; unreferenced → sentinel `n`), sorts rows by `(firstUse, position)` (stable — first-use wins, ties/unreferenced by position, unmatched parked at END), builds inverse `displayIndexOf[]`, maps each PROCESS step's matched rows through it → min/max. Authored: identity permutation `[0..n-1]`, spans pass through unchanged (never reordered — same §3.3 invariant).
- Anti-staleness reaffirmed: `ingredientDisplayOrder` computed on read, NEVER persisted, no stored flag, provenance stays structural (`matrixSource` from `spanFrom != null`). Load-bearing module/helper comments updated.
- API: `applyRecipeMatrix()` in `services/meals.ts` passes `ingredientDisplayOrder` straight through onto the served object; REST serves the service result and MCP `apiClient` returns `TabularRecipeMealDTO`, so both INHERIT the field with zero source change beyond doc text. Confirmed (not assumed): api tsc + full suite green, mcp tsc + suite green.
- Parity #96: read-only field → shared DTO (added) + REST (inherited) + MCP apiClient (inherited). No write field, no `inputSchema` obligation, Phase-1 read-only posture preserved. Updated `create_meal`/`update_meal` MCP tool descriptions + apiClient doc comments to name the field (honest parity docs).
- Real-DB sanity check (read-only, container `saul-mealdb`): Birria Tacos now derives displayOrder `[1,2,3,0,6,4,5,7]`, braise span `0..4` — corn tortillas (display 5) & oaxaca cheese (display 6) pulled OUT of the bracket; cilantro (named by nothing) parked last. Residual: onion still swept (first-used with chiles in step 0, chiles reused by the braise) — intrinsic cross-step reuse, closes only with Phase-2 authored spans.
- Tests: shared +7 (unmatched-parked-at-end, first-use-wins, tie-by-position, permutation validity, authored identity, spans-index-into-display; rewrote the real-data Birria characterization to pin the win AND the residual). api: rewrote the ordering test to assert canonical array stays position order while span indexes into `ingredientDisplayOrder`; added `ingredientDisplayOrder` assertions to derived + authored tests.
- Verified: shared tsc ✓ + 41 tests ✓ + eslint ✓; api tsc ✓ + 1023 tests ✓ + eslint 0 errors; mcp tsc ✓ + 121 tests ✓ + eslint ✓. Committed with pathspec (`packages/shared packages/api packages/mcp` + my .squad files) — no bare commit (Linus live in web building the renderer against these types).
