import type { GroceryCategory } from '@meal-planner/shared';
import { request } from './client';

// Re-export the shared DTO so components can import GroceryCategory from this
// resource module. Single source of truth lives in `@meal-planner/shared` (#119).
export type { GroceryCategory } from '@meal-planner/shared';

const BASE = '/api/families';

/**
 * List a family's *effective* grocery categories (#119): the shared
 * INGREDIENT_CATEGORIES defaults unioned with the family's custom categories.
 * The backend wraps the result in a `{ categories, custom }` envelope; this
 * helper unwraps the effective `categories` string list for select inputs.
 */
export async function listGroceryCategories(familyId: string): Promise<string[]> {
  const { categories } = await request<{
    categories: string[];
    custom: GroceryCategory[];
  }>(`${BASE}/${familyId}/grocery-categories`);
  return categories;
}
