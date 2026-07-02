-- CreateEnum
CREATE TYPE "GrocerySource" AS ENUM ('GENERATED', 'MANUAL');

-- AlterTable
ALTER TABLE "GroceryItem" ADD COLUMN     "edited" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "origin" "GrocerySource" NOT NULL DEFAULT 'GENERATED',
ADD COLUMN     "sourceMealIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Backfill: rows with empty sources array → MANUAL; GENERATED default handles the rest.
UPDATE "GroceryItem" SET "origin" = 'MANUAL' WHERE array_length(sources, 1) IS NULL;
