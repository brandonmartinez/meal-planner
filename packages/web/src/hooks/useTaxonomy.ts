import { useState, useEffect, useCallback } from 'react';
import { listTags, listCategories } from '../api/taxonomy';
import type { Tag, Category } from '../api/taxonomy';

interface UseTaxonomyResult {
  tags: Tag[];
  categories: Category[];
  loading: boolean;
  error: string | null;
  /** Re-fetch both lists (e.g. after a create-on-assign save adds new names). */
  reload: () => void;
}

/**
 * Loads a family's tags and categories once per family. Shared by MealsPage,
 * MealPicker, and MealFormPage so the two taxonomy GETs live in one code path.
 * Fails soft: taxonomy is a progressive-enhancement (filters/suggestions), so
 * an error never blocks the meal list — it just yields empty lists.
 */
export function useTaxonomy(familyId: string | null): UseTaxonomyResult {
  const [tags, setTags] = useState<Tag[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!familyId) {
      setTags([]);
      setCategories([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [t, c] = await Promise.all([
        listTags(familyId),
        listCategories(familyId),
      ]);
      setTags(t);
      setCategories(c);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load taxonomy');
    } finally {
      setLoading(false);
    }
  }, [familyId]);

  useEffect(() => {
    load();
  }, [load]);

  return { tags, categories, loading, error, reload: load };
}
