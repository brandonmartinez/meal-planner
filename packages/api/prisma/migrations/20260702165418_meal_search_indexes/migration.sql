-- CreateIndex
CREATE INDEX "Meal_familyId_name_idx" ON "Meal"("familyId", "name");

-- CreateIndex
CREATE INDEX "Meal_familyId_difficulty_idx" ON "Meal"("familyId", "difficulty");

-- CreateIndex
CREATE INDEX "Meal_familyId_createdAt_idx" ON "Meal"("familyId", "createdAt");

-- CreateIndex
CREATE INDEX "MealSuggestion_mealId_approved_idx" ON "MealSuggestion"("mealId", "approved");

-- Enable pg_trgm for ILIKE acceleration
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN trigram index on Meal.name for fast ILIKE search
CREATE INDEX "Meal_name_trgm_idx" ON "Meal" USING GIN ("name" gin_trgm_ops);
