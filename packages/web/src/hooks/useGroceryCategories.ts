import { useState, useEffect, useCallback } from 'react';
import { INGREDIENT_CATEGORIES } from '@meal-planner/shared';
import { listGroceryCategories } from '../api/groceryCategories';

interface UseGroceryCategoriesResult {
  /** Effective grocery categories (defaults ∪ custom). Falls back to the shared
   *  INGREDIENT_CATEGORIES defaults while loading, with no family, or on error. */
  categories: string[];
  loading: boolean;
  error: string | null;
  /** Re-fetch (e.g. after a custom category is added elsewhere). */
  reload: () => void;
}

/**
 * Loads a family's effective grocery categories (#119) for ingredient/grocery
 * category selects. Fails soft: category selection is a progressive enhancement,
 * so an error or missing family yields the shared INGREDIENT_CATEGORIES defaults
 * instead of an empty list — legacy behavior is always preserved.
 */
export function useGroceryCategories(
  familyId: string | null,
): UseGroceryCategoriesResult {
  const [categories, setCategories] = useState<string[]>([
    ...INGREDIENT_CATEGORIES,
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!familyId) {
      setCategories([...INGREDIENT_CATEGORIES]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const cats = await listGroceryCategories(familyId);
      setCategories(cats.length > 0 ? cats : [...INGREDIENT_CATEGORIES]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load grocery categories',
      );
      setCategories([...INGREDIENT_CATEGORIES]);
    } finally {
      setLoading(false);
    }
  }, [familyId]);

  useEffect(() => {
    load();
  }, [load]);

  return { categories, loading, error, reload: load };
}
