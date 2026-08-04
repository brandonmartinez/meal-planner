-- Additive migration for the tabular ("Grid") recipe view (Phase 1).
--
-- Adds durable authored-layout columns alongside a derive-at-read fallback:
--   * MealIngredient.position   — dense, 0-based row order (the ONLY layout
--                                 column written before the Phase-2 editor).
--   * MealIngredient.groupLabel — authored group pill; NULL => derive at read.
--   * MealInstruction.kind      — SETUP/PROCESS/FINISH band (defaults PROCESS).
--   * MealInstruction.subLabel/column/spanFrom/spanTo — authored layout;
--                                 NULL => derive at read.
--
-- Every new column is nullable or defaulted, so the DDL invalidates no existing
-- row. Only `position` is backfilled below; the authored layout columns
-- (groupLabel, subLabel, column, spanFrom, spanTo) are DELIBERATELY left NULL —
-- NULL means "derive this at read time", and persisting derived state is exactly
-- the staleness bug we are avoiding (see the grocery-provenance lesson in
-- .squad/decisions.md). Do NOT backfill them.

-- CreateEnum
CREATE TYPE "InstructionKind" AS ENUM ('SETUP', 'PROCESS', 'FINISH');

-- AlterTable
ALTER TABLE "MealIngredient" ADD COLUMN     "groupLabel" TEXT,
ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "MealInstruction" ADD COLUMN     "column" INTEGER,
ADD COLUMN     "kind" "InstructionKind" NOT NULL DEFAULT 'PROCESS',
ADD COLUMN     "spanFrom" INTEGER,
ADD COLUMN     "spanTo" INTEGER,
ADD COLUMN     "subLabel" TEXT;

-- Backfill MealIngredient.position with a dense, 0-based sequence per meal.
-- Matches the 0-based convention MealInstruction.position already uses
-- (services/meals.ts `mapInstructionCreates`), so ingredients and instructions
-- share the same row-index basis the matrix spans reference.
--
-- Ordering signal: `ctid` (physical row location) is the best available proxy
-- for original insertion order — the primary key `id` is a random UUID and
-- carries no ordering. Pre-migration insertion order is imperfect (VACUUM FULL /
-- row rewrites could in principle reorder ctid) but it is stable and the closest
-- signal we have; the Phase-2 editor is where users correct any order that
-- matters. The ADD COLUMN above seeds every row with 0; this overwrites it with
-- the per-meal sequence.
WITH "ordered" AS (
  SELECT
    "id",
    (row_number() OVER (PARTITION BY "mealId" ORDER BY "ctid") - 1) AS "pos"
  FROM "MealIngredient"
)
UPDATE "MealIngredient" AS "mi"
SET "position" = "ordered"."pos"
FROM "ordered"
WHERE "mi"."id" = "ordered"."id";
