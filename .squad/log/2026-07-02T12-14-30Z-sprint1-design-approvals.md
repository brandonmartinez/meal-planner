# Sprint 1: Design Gate Approvals

**Date:** 2026-07-02
**Duration:** Design review sprint (all gates concurrent, parallel execution)
**Status:** ✅ COMPLETE

## Sprint 1 Summary

All 5 design gates from Epic #91 approved. Merged PR #122. Issues closed.

### Design Gates (All Approved)

1. **#92 — Recipe Domain Model** (Saul)
   - Meal IS the recipe (no separate Recipe entity)
   - New scalars: prepTime, cookTime, servings, sourceUrl, notes, favorite, rating (per-family 1-5)
   - lastCookedOn derived from approved MealSuggestion
   - Decision record posted

2. **#121/#122 — Triage Workflow Fix** (Basher)
   - PR #122 merged (squash)
   - Issue auto-closed
   - Ready for production

3. **#93 — Image Storage Abstraction** (Basher)
   - MealImageResolver: none/external/asset
   - Pluggable ImageStorage pattern
   - Asset wins over external URL; opaque assetId serving
   - DisplayMealEntry.imageUrl unchanged
   - Prod backend (S3 vs RWX PVC) deferred to #104
   - Decision record posted

4. **#95 — Grocery Regeneration & Source Tracking** (Livingston)
   - Additive origin(GENERATED|MANUAL)/edited/sourceMealIds on GroceryItem
   - Non-destructive ID-preserving merge (name|unit keyed)
   - Backfill heuristic defined
   - PATCH endpoint lands in #118
   - Decision record posted

5. **#94 — Recipe Search & Indexing** (Livingston)
   - Shared listMealsQuerySchema for REST + agent
   - MealListResponseDTO{items,total,limit,offset,hasMore} envelope adopted
   - Offset/limit pagination
   - DB indexes (btree + pg_trgm GIN) reserved for #111
   - lastCookedOn via getLastCookedMap; placeholders excluded
   - Envelope adoption confirmed by Brandon
   - Decision record posted

### Design Rule Enforcement

6. **#96 — API/MCP Parity Rules** (Rusty)
   - 11-row parity checklist standardized
   - Reuse meal:write for all recipe metadata (broadened)
   - meal:image scope deferred to #103/#104 (binary only)
   - Display deny-by-default
   - Placeholders un-editable + excluded
   - **HARD RULE:** UI-only recipe features violate parity
   - **Option A:** Commit .github/instructions/parity.instructions.md as FIRST Sprint 2 task
   - Decision record posted

## Outcomes

- All 5 design gates approved (contracts defined, decision records posted, issues closed)
- PR #122 merged
- Sprint 1 complete
- Ready for Sprint 2 implementation sprint

## Next Steps

- Sprint 2 begins with parity.instructions.md commit (Rusty's Option A)
- Per-domain implementation tasks follow in Sprint 2
