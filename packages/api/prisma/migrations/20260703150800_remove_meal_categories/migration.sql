-- Remove the meal taxonomy category feature (issue #107), folding each meal's
-- category names into its tags first so NO data is lost. Category and Tag are
-- structurally identical (id, name, nameNormalized, familyId, createdAt,
-- updatedAt; per-family unique on nameNormalized) and MealCategory mirrors
-- MealTag, so the preservation is a straight per-family fold.
--
-- ORDER MATTERS: the data-migration statements run BEFORE the DROP TABLEs.
-- Postgres 16 — gen_random_uuid() is available (pgcrypto/core).

-- 1. Ensure a Tag exists for every Category (same family + nameNormalized).
--    Carry over the original display `name` and computed `nameNormalized`.
INSERT INTO "Tag" ("id", "name", "nameNormalized", "familyId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, c."name", c."nameNormalized", c."familyId", now(), now()
FROM "Category" c
WHERE NOT EXISTS (
  SELECT 1 FROM "Tag" t
  WHERE t."familyId" = c."familyId" AND t."nameNormalized" = c."nameNormalized"
);

-- 2. Fold each MealCategory into the matching family Tag as a MealTag.
--    Idempotent: a meal may already carry that tag, so skip conflicts.
INSERT INTO "MealTag" ("mealId", "tagId")
SELECT mc."mealId", t."id"
FROM "MealCategory" mc
JOIN "Category" c ON c."id" = mc."categoryId"
JOIN "Tag" t ON t."familyId" = c."familyId" AND t."nameNormalized" = c."nameNormalized"
ON CONFLICT ("mealId", "tagId") DO NOTHING;

-- 3. Drop the meal-category tables (join first, then parent). DROP TABLE removes
--    the tables' own constraints and indexes automatically.
-- DropTable
DROP TABLE "MealCategory";

-- DropTable
DROP TABLE "Category";
