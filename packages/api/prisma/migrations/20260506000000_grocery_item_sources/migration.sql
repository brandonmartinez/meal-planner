-- AlterTable
ALTER TABLE "GroceryItem" ADD COLUMN "sources" TEXT[] DEFAULT ARRAY[]::TEXT[];
