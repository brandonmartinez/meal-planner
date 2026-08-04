import { useEffect, useState } from 'react';

/**
 * Subscribe to a CSS media query and report whether it currently matches.
 * SSR-guarded (returns `false` when `window`/`matchMedia` is unavailable) and
 * kept in sync via a `change` listener. Used by the recipe reader to degrade the
 * rowspan Grid to List below the `sm` breakpoint (spec §8).
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mql = window.matchMedia(query);
    const handler = (event: MediaQueryListEvent) => setMatches(event.matches);
    // Re-sync in case the query changed between render and effect.
    setMatches(mql.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return matches;
}
