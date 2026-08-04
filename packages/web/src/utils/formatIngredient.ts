/** The minimal shape needed to render an ingredient as a single line. Both the
 *  persisted `MealIngredient` and the tabular-recipe `TabularRecipeIngredientDTO`
 *  satisfy it (their nullable `quantity`/`unit` are accepted). */
export interface FormattableIngredient {
  quantity?: string | null;
  unit?: string | null;
  name: string;
}

/** Format an ingredient row into a single readable line (e.g. "2 cups flour"),
 *  dropping blank/whitespace-only quantity or unit parts. Lifted out of
 *  `CookingModePage` so the List and Grid views share one implementation. */
export function formatIngredient(ingredient: FormattableIngredient): string {
  return [ingredient.quantity, ingredient.unit, ingredient.name]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');
}
