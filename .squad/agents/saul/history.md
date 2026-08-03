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
