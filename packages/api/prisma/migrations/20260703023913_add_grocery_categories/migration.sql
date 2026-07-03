-- CreateTable
CREATE TABLE "GroceryCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameNormalized" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroceryCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GroceryCategory_familyId_idx" ON "GroceryCategory"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "GroceryCategory_familyId_nameNormalized_key" ON "GroceryCategory"("familyId", "nameNormalized");

-- AddForeignKey
ALTER TABLE "GroceryCategory" ADD CONSTRAINT "GroceryCategory_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
