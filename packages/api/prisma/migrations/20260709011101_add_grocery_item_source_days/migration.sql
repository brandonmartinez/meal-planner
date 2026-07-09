-- AlterTable
ALTER TABLE "GroceryItem" ADD COLUMN     "sourceDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
