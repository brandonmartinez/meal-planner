-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameNormalized" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameNormalized" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealTag" (
    "mealId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "MealTag_pkey" PRIMARY KEY ("mealId","tagId")
);

-- CreateTable
CREATE TABLE "MealCategory" (
    "mealId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "MealCategory_pkey" PRIMARY KEY ("mealId","categoryId")
);

-- CreateIndex
CREATE INDEX "Tag_familyId_idx" ON "Tag"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_familyId_nameNormalized_key" ON "Tag"("familyId", "nameNormalized");

-- CreateIndex
CREATE INDEX "Category_familyId_idx" ON "Category"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_familyId_nameNormalized_key" ON "Category"("familyId", "nameNormalized");

-- CreateIndex
CREATE INDEX "MealTag_tagId_idx" ON "MealTag"("tagId");

-- CreateIndex
CREATE INDEX "MealCategory_categoryId_idx" ON "MealCategory"("categoryId");

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealTag" ADD CONSTRAINT "MealTag_mealId_fkey" FOREIGN KEY ("mealId") REFERENCES "Meal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealTag" ADD CONSTRAINT "MealTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealCategory" ADD CONSTRAINT "MealCategory_mealId_fkey" FOREIGN KEY ("mealId") REFERENCES "Meal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealCategory" ADD CONSTRAINT "MealCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
