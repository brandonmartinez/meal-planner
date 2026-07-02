-- CreateTable
CREATE TABLE "MealInstruction" (
    "id" TEXT NOT NULL,
    "mealId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "timerMinutes" INTEGER,

    CONSTRAINT "MealInstruction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MealInstruction_mealId_idx" ON "MealInstruction"("mealId");

-- AddForeignKey
ALTER TABLE "MealInstruction" ADD CONSTRAINT "MealInstruction_mealId_fkey" FOREIGN KEY ("mealId") REFERENCES "Meal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
