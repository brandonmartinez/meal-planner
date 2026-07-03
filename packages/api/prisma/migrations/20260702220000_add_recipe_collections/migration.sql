-- CreateTable
CREATE TABLE "RecipeCollection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameNormalized" TEXT NOT NULL,
    "description" TEXT,
    "familyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecipeCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealRecipeCollection" (
    "mealId" TEXT NOT NULL,
    "recipeCollectionId" TEXT NOT NULL,

    CONSTRAINT "MealRecipeCollection_pkey" PRIMARY KEY ("mealId","recipeCollectionId")
);

-- CreateIndex
CREATE INDEX "RecipeCollection_familyId_idx" ON "RecipeCollection"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeCollection_familyId_nameNormalized_key" ON "RecipeCollection"("familyId", "nameNormalized");

-- CreateIndex
CREATE INDEX "MealRecipeCollection_recipeCollectionId_idx" ON "MealRecipeCollection"("recipeCollectionId");

-- AddForeignKey
ALTER TABLE "RecipeCollection" ADD CONSTRAINT "RecipeCollection_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealRecipeCollection" ADD CONSTRAINT "MealRecipeCollection_mealId_fkey" FOREIGN KEY ("mealId") REFERENCES "Meal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealRecipeCollection" ADD CONSTRAINT "MealRecipeCollection_recipeCollectionId_fkey" FOREIGN KEY ("recipeCollectionId") REFERENCES "RecipeCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
