# Saul History
📌 Team update (2026-07-02T10:59:35-04:00): Rusty produced a five-sprint recipe-management execution plan; Sprint 1 assigns Saul #92 (recipe domain model), the universal blocker for the critical path. — logged by Scribe

📌 Team update (2026-07-02T12:14:30-04:00): Sprint 1 design gate #92 (recipe domain model) APPROVED. Contract: Meal IS the recipe (no separate Recipe entity); all additive; new scalars prepTime/cookTime/servings/sourceUrl/notes/favorite/rating(per-family 1-5); lastCookedOn derived from approved MealSuggestion. Issue closed, decision record posted. Ready for Sprint 2 schema/migration tasks. — logged by Scribe
📌 Team update (2026-07-02T19:53:00Z): Wave 3 shipped #98 favorite + rating in PR #131 with full web parity B1, REST + agent rating validation, CSV round-trip, and backend favorite/minRating filters; UI filter dropdowns remain deferred with #107 — logged by Scribe.

📌 Team update (2026-07-02T19:16:33-04:00): Sprint 2 Waves 5–6 complete. #107 (family-scoped Tags & Categories backend) shipped PR #134 SHA 49343e7 with full REST + agent + MCP parity, CSV round-trip by name, `nameNormalized` unique per family, taxonomy service + join models, 958 tests green. #100 (rich recipe instructions) shipped PR #136 SHA 233597b with newline-delimited CSV, text + timerMinutes, position-based ordering, replace-all semantics, full parity + deny-by-default. Migration authoring standard established: offline `prisma migrate diff --script`, no shared-DB `migrate dev`. v0.4.0 recipe-metadata vertical complete. — logged by Scribe

📌 Team update (2026-07-03T01:15:59-0400): Sprint 3 Wave 2 complete. #109 recipe collections backend merged via PR #142 (68f57d3): additive RecipeCollection schema/join migration, CSV lockstep, REST/agent/MCP parity, and cross-family coverage. CI lesson: `pnpm -r run lint` runs ALL packages before tests and a single parse error short-circuits the whole job — lint-parse-check new test files locally before pushing. — logged by Scribe

## 2026-07-03T02:23:57-0400 — Wave 3 shipped

- Shipped #116 planning templates backend as the Wave 3 migration keystone; PR #146 squash `e3083fe` merged first. State reconciled by Scribe after Livingston #120 and Linus #110 also merged.

## 2026-07-03T03:07:00-0400 — Wave 4 shipped

- Shipped #119 family-configurable grocery categories; PR #148 squash `edfbda3` merged as Wave 4 migration keystone. Migration `20260703023913_add_grocery_categories` is additive and keeps ingredient category storage as raw strings with a family advisory registry.

📌 Team update (2026-07-09T01:11:01-0400): Wave 1 v0.6.0 grocery & meal-picker assignment — #204 grocery source-day tracking. Add `sourceDays Int[]`, generation support, badge UI, migration, tests, and PR. — logged by Scribe

📌 Team update (2026-07-09T01:55:00-04:00): Wave 1 v0.6.0 shipped #204 grocery source-day annotations; PR #210 merged (`4d03e87`). Added `GroceryItem.sourceDays`, generation union/sort semantics, shared type parity, and inline day annotations. — logged by Scribe

---

## 2026-07-09: Pantry Staples Implementation (#205, PR #214)

**Task:** Implement family-managed pantry staples list with read-time grocery separation per Epic #203 v0.6.0 Wave 2.

**Work:** New `PantryStaple` Prisma model with normalized-name matching (same `normalizeIngredientName` as grocery deduplication). Family-scoped CRUD service with PARENT-only mutations. Read-time derivation via `annotatePantryStaples()` sets `isPantryStaple` flag on grocery items whose normalized name matches a family staple — nothing persisted on `GroceryItem`, guaranteeing staples never pruned. Web: PARENT-only staples management in Family Settings; collapsible "Pantry Staples" section (collapsed by default) in grocery list. Hand-authored additive-only migration via `prisma migrate diff --script`.

**Outcome:** PR #214 merged to origin/main (squash 62b97a2). Full build/test green, lint clean. Decision record in `.squad/decisions.md`, orchestration log in `.squad/orchestration-log/2026-07-09T02-50-00Z-saul.md`.

**Team Notes:** Read-time derivation kept pantry separation orthogonal to #204 sourceDays and #206 preserve-checked orphan logic — zero merge conflicts. `onDelete: Cascade` chosen (vs sibling models' `Restrict`) because staples have no meaning without their family. No MCP parity required (pantry staples are family settings/grocery, not recipe/meal agent surface).

## 2026-08-03T11:00:32-04:00 — Recipe-matrix schema (tabular "Grid" view, P1-1)

**Task:** Additive Phase-1 migration for the Cooking-for-Engineers tabular recipe
view (Rusty's spec §3.1/§3.2). Own the schema half only.

**Work:** `enum InstructionKind {SETUP PROCESS FINISH}` (default PROCESS);
`MealIngredient.position Int @default(0)` + `groupLabel String?`;
`MealInstruction.kind/subLabel/column/spanFrom/spanTo`. All nullable/defaulted →
strictly additive. Migration `20260803110032_add_recipe_matrix_layout` authored
OFFLINE (no Docker/Postgres on host) via schema-to-schema `prisma migrate diff`
— the team's established standard — with a hand-added `position` backfill
(`row_number() over (partition by "mealId" order by "ctid") - 1`, 0-based to
match `MealInstruction.position`). Five authored-layout columns deliberately
left NULL (NULL = derive-at-read; persisting derived state is the
grocery-provenance staleness bug). Load-bearing doc comments per Brandon on
every layout column. Provenance is structural (`some(i.spanFrom != null)`), no
`isDerived` boolean. Seed: `position: i` on ingredient creates, no authored spans.

**Verify:** `pnpm db:generate` green — client exposes all new fields.
`packages/api` build compiles (the only failure was pre-existing unbuilt
`@meal-planner/mcp` dist, unrelated). NOT applied to a real DB — flagged for
Rusty/Livingston to confirm backfill on first `migrate deploy`.

**Left for Livingston:** `deriveRecipeMatrix()` + DTO in shared, service
position-from-index writes, REST/MCP read shaping (outside my fence, untouched).

📌 Team update (2026-08-03T11:00:32-04:00): Rusty reviewed and **APPROVED** P1-1 schema migration (`27e94a3`). Backfill SQL verified correct (0-based, ctid ordering acceptable), strictly additive, doc comments meet Brandon's anti-staleness requirement. Yen gave **SHIP Phase 1** verdict after full integration verification: 1840 tests passing, build/lint clean. Phase 1 complete. — decided by Rusty, Yen

## 2026-08-03T13:30:00-04:00 — Recipe-matrix migration VERIFIED against real data

Docker turned out to be available (PATH quirk: macOS GUI apps launch without
`/usr/local/bin`). Ran the migration the production way (`prisma migrate deploy`)
against Brandon's REAL local dev volume `devcontainer_postgres-data` (74 meals,
365 ingredients, 61 instructions) — which sat exactly one migration behind mine.
pg_dump safety backup taken to `~/saul-scratch/` first (.dump + .sql).

**Empirical backfill result: VERIFIED.**
- `migrate deploy` applied exactly `20260803110032_add_recipe_matrix_layout`; a
  2nd run was a clean no-op; `migrate status` = "up to date". Idempotent.
- `MealIngredient.position` is dense, 0-based, gap-free, dup-free in ALL 68 meals
  with ingredients (range 0..7).
- **Order fidelity: 0/365 mismatches** — position exactly equals the pre-migration
  `ctid` rank captured before the DDL. Because the old service read ingredients
  with NO `orderBy` (heap/ctid order), position now reproduces the EXACT order the
  app always displayed; the Grid introduces no new divergence. Spot-checked meals
  (Birria Tacos, Butternut Squash Risotto, Chicken Alfredo) read as coherent
  human-entered orders (protein/base first).
- Zero content mutation: name/mealId unchanged for every row, 0 rows lost/added.
- All five authored-layout columns NULL; `MealInstruction.kind` = PROCESS for all
  61 rows; instruction `position` untouched. Column nullability/defaults as designed.

`ctid` proxy validated empirically, not just by reasoning. Left Postgres running
on localhost:5432 (container `saul-mealdb`, postgres/postgres, db meal_planner)
for Yen's e2e. No code change needed — backfill required no fix.

## 2026-08-03 — Seed library revamp for tabular Grid
Replaced the 50-recipe ingredients-only demo library with 14 curated recipes that
actually exercise the Grid. Touched only `packages/api/prisma/data/recipes.ts` +
`seed.ts` (added `instructions` create block + `groupLabel` passthrough).

- **11 DERIVED** (use-ordered, no authored spans): SETUP bands, cascading combines,
  FINISH notes, multi-use lime, a long chili (11 ing) and short guac/grilled-cheese.
  Two carry authored `groupLabel`s (pills render on derived meals too).
- **3 AUTHORED** (kind + inclusive 0-based spanFrom/spanTo + column + pills): Fried
  Shrimp (breading cascade + parallel rémoulade), Baked Lasagna (two parallel
  sub-recipes → assembly), Caprese (small). Give Brandon a derived-vs-authored A/B for
  the Phase-2 editor call.

**Clean-span result: 11/11 derived recipes bracket cleanly** (verified with a
throwaway harness re-running the real `deriveRecipeMatrix`; deleted before commit).
Fixed one real over-bracket: "Beef broth" collided with "Ground beef" on the `beef`
token, so first-use reordering swept chili powder/cumin into the broth step →
renamed the ingredient "Broth".

Seeded a scratch DB (`saul-seed-scratch`, :5433, fresh volume) via `migrate deploy` +
`db seed`: 14 recipes; ingredient AND instruction positions dense/0-based; derived
meals persist 0 layout columns; authored spans in range. **`saul-mealdb` (:5432,
Brandon's real 74 meals) was never written to** — left running for Yen.
