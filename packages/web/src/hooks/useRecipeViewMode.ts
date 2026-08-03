import { useCallback, useState } from 'react';

/** The two poles of the recipe reader: the step-at-a-time checklist ("List")
 *  and the Cooking-for-Engineers tabular grid ("Grid"). Users see "List"/"Grid";
 *  the persisted value is this union (spec §6/§7). */
export type RecipeViewMode = 'list' | 'grid';

const STORAGE_KEY = 'recipeViewMode';
const DEFAULT_MODE: RecipeViewMode = 'list';

function isRecipeViewMode(value: unknown): value is RecipeViewMode {
  return value === 'list' || value === 'grid';
}

/** Read the persisted view mode, guarding SSR (no `window`) and any
 *  localStorage failure (private mode, quota), and falling back to the default
 *  on a missing or malformed value. Mirrors `ThemeContext`'s read pattern. */
function readStoredViewMode(): RecipeViewMode {
  if (typeof window === 'undefined') return DEFAULT_MODE;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isRecipeViewMode(stored) ? stored : DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
}

/**
 * Per-user, per-device recipe view mode over `localStorage['recipeViewMode']`,
 * defaulting to `'list'` so existing behavior is preserved (spec §7). This is a
 * global preference — not per-meal and not server-persisted. Follows the
 * `ThemeContext` persistence pattern: SSR-guarded reads and try/catch writes.
 */
export function useRecipeViewMode(): {
  viewMode: RecipeViewMode;
  setViewMode: (mode: RecipeViewMode) => void;
} {
  const [viewMode, setViewModeState] = useState<RecipeViewMode>(() =>
    readStoredViewMode(),
  );

  const setViewMode = useCallback((next: RecipeViewMode) => {
    setViewModeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ignore write failures (private mode, quota, SSR) — the in-memory state
      // still updates so the current session behaves correctly.
    }
  }, []);

  return { viewMode, setViewMode };
}
