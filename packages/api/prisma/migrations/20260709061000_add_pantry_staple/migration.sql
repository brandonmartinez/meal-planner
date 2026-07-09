-- CreateTable
CREATE TABLE "PantryStaple" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameNormalized" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PantryStaple_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PantryStaple_familyId_idx" ON "PantryStaple"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "PantryStaple_familyId_nameNormalized_key" ON "PantryStaple"("familyId", "nameNormalized");

-- AddForeignKey
ALTER TABLE "PantryStaple" ADD CONSTRAINT "PantryStaple_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

