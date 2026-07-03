-- CreateTable
CREATE TABLE "PlanningTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameNormalized" TEXT NOT NULL,
    "description" TEXT,
    "familyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanningTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanningTemplateEntry" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "mealId" TEXT NOT NULL,

    CONSTRAINT "PlanningTemplateEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlanningTemplate_familyId_idx" ON "PlanningTemplate"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanningTemplate_familyId_nameNormalized_key" ON "PlanningTemplate"("familyId", "nameNormalized");

-- CreateIndex
CREATE INDEX "PlanningTemplateEntry_templateId_idx" ON "PlanningTemplateEntry"("templateId");

-- CreateIndex
CREATE INDEX "PlanningTemplateEntry_mealId_idx" ON "PlanningTemplateEntry"("mealId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanningTemplateEntry_templateId_dayOfWeek_mealId_key" ON "PlanningTemplateEntry"("templateId", "dayOfWeek", "mealId");

-- AddForeignKey
ALTER TABLE "PlanningTemplate" ADD CONSTRAINT "PlanningTemplate_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanningTemplateEntry" ADD CONSTRAINT "PlanningTemplateEntry_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "PlanningTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanningTemplateEntry" ADD CONSTRAINT "PlanningTemplateEntry_mealId_fkey" FOREIGN KEY ("mealId") REFERENCES "Meal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
