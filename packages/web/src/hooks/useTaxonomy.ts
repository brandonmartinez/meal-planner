import { useState, useEffect, useCallback } from 'react';
import { listTags } from '../api/taxonomy';
import type { Tag } from '../api/taxonomy';

interface UseTaxonomyResult {
  tags: Tag[];
  loading: boolean;
  error: string | null;
  /** Re-fetch the tag list (e.g. after a create-on-assign save adds new names). */
  reload: () => void;
}

/**
 * Loads a family's tags once per family. Shared by MealsPage,
 * MealPicker, and MealFormPage so the taxonomy GET lives in one code path.
 * Fails soft: taxonomy is a progressive-enhancement (filters/suggestions), so
 * an error never blocks the meal list — it just yields an empty list.
 */
export function useTaxonomy(familyId: string | null): UseTaxonomyResult {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!familyId) {
      setTags([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const t = await listTags(familyId);
      setTags(t);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load taxonomy');
    } finally {
      setLoading(false);
    }
  }, [familyId]);

  useEffect(() => {
    load();
  }, [load]);

  return { tags, loading, error, reload: load };
}
