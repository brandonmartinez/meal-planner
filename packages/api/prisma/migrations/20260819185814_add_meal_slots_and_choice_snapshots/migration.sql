-- AddMealSlots: meal-owned slot/option/option-ingredient schema +
-- immutable per-MealSuggestion choice snapshot schema (issue #226).
--
-- Purely additive: no existing tables or columns are altered.
-- Existing Meal and MealSuggestion rows remain valid without backfill.

-- MealSlot: a configurable choice point on a Meal (e.g. "Protein", "Sauce").
-- Cascade-deleted with its parent Meal.
CREATE TABLE "MealSlot" (
    "id"        TEXT NOT NULL,
    "mealId"    TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "position"  INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealSlot_pkey" PRIMARY KEY ("id")
);

-- MealSlotOption: one selectable choice within a MealSlot.
-- Contributes additive ingredients only (v1). Cascade-deleted with its slot.
CREATE TABLE "MealSlotOption" (
    "id"        TEXT NOT NULL,
    "slotId"    TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "position"  INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealSlotOption_pkey" PRIMARY KEY ("id")
);

-- MealSlotOptionIngredient: additive ingredient contributed by a MealSlotOption.
-- Mirrors MealIngredient field shape. Cascade-deleted with its option.
CREATE TABLE "MealSlotOptionIngredient" (
    "id"       TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "name"     TEXT NOT NULL,
    "quantity" TEXT,
    "unit"     TEXT,
    "category" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MealSlotOptionIngredient_pkey" PRIMARY KEY ("id")
);

-- SuggestionChoiceSnapshot: immutable snapshot of the option chosen for one
-- MealSlot when a MealSuggestion was scheduled. slotId / optionId are plain
-- nullable text columns (NOT foreign keys) so recipe edits/deletions cannot
-- corrupt planning history. Cascade-deleted with its MealSuggestion.
CREATE TABLE "SuggestionChoiceSnapshot" (
    "id"           TEXT NOT NULL,
    "suggestionId" TEXT NOT NULL,
    "slotId"       TEXT,
    "optionId"     TEXT,
    "slotName"     TEXT NOT NULL,
    "optionName"   TEXT NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuggestionChoiceSnapshot_pkey" PRIMARY KEY ("id")
);

-- SuggestionChoiceIngredientSnapshot: immutable additive ingredient snapshot
-- within a SuggestionChoiceSnapshot. Cascade-deleted with its parent snapshot.
CREATE TABLE "SuggestionChoiceIngredientSnapshot" (
    "id"       TEXT NOT NULL,
    "choiceId" TEXT NOT NULL,
    "name"     TEXT NOT NULL,
    "quantity" TEXT,
    "unit"     TEXT,
    "category" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SuggestionChoiceIngredientSnapshot_pkey" PRIMARY KEY ("id")
);

-- Foreign keys ----------------------------------------------------------------

-- MealSlot → Meal (cascade)
ALTER TABLE "MealSlot" ADD CONSTRAINT "MealSlot_mealId_fkey"
    FOREIGN KEY ("mealId") REFERENCES "Meal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- MealSlotOption → MealSlot (cascade)
ALTER TABLE "MealSlotOption" ADD CONSTRAINT "MealSlotOption_slotId_fkey"
    FOREIGN KEY ("slotId") REFERENCES "MealSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- MealSlotOptionIngredient → MealSlotOption (cascade)
ALTER TABLE "MealSlotOptionIngredient" ADD CONSTRAINT "MealSlotOptionIngredient_optionId_fkey"
    FOREIGN KEY ("optionId") REFERENCES "MealSlotOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SuggestionChoiceSnapshot → MealSuggestion (cascade).
-- slotId / optionId are intentionally NOT foreign keys (plain text columns).
ALTER TABLE "SuggestionChoiceSnapshot" ADD CONSTRAINT "SuggestionChoiceSnapshot_suggestionId_fkey"
    FOREIGN KEY ("suggestionId") REFERENCES "MealSuggestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SuggestionChoiceIngredientSnapshot → SuggestionChoiceSnapshot (cascade)
ALTER TABLE "SuggestionChoiceIngredientSnapshot" ADD CONSTRAINT "SuggestionChoiceIngredientSnapshot_choiceId_fkey"
    FOREIGN KEY ("choiceId") REFERENCES "SuggestionChoiceSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Indexes ---------------------------------------------------------------------

CREATE INDEX "MealSlot_mealId_idx" ON "MealSlot"("mealId");
CREATE INDEX "MealSlotOption_slotId_idx" ON "MealSlotOption"("slotId");
CREATE INDEX "MealSlotOptionIngredient_optionId_idx" ON "MealSlotOptionIngredient"("optionId");
CREATE INDEX "SuggestionChoiceSnapshot_suggestionId_idx" ON "SuggestionChoiceSnapshot"("suggestionId");
CREATE INDEX "SuggestionChoiceIngredientSnapshot_choiceId_idx" ON "SuggestionChoiceIngredientSnapshot"("choiceId");
