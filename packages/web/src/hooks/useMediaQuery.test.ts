import { renderHook, act } from '@testing-library/react';
import { useMediaQuery } from './useMediaQuery';

/**
 * Unit coverage for `useMediaQuery` (Yen, Grid verification). The hook is the
 * load-bearing input to the spec §8 "degrade Grid to List below sm" behavior:
 * `CookingModePage` tests exercise the degrade end-to-end, but the hook itself
 * had no direct test of its SSR guard, its `change`-listener subscription, or
 * its re-sync when the query string changes. A regression here silently breaks
 * the mobile fallback.
 */

/** Build a controllable MediaQueryList stand-in and a way to flip its match. */
function installMatchMedia(initial: (query: string) => boolean) {
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  let current = initial;

  const mql = (query: string) => ({
    get matches() {
      return current(query);
    },
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn((_: string, cb: (e: MediaQueryListEvent) => void) =>
      listeners.add(cb),
    ),
    removeEventListener: vi.fn(
      (_: string, cb: (e: MediaQueryListEvent) => void) => listeners.delete(cb),
    ),
    dispatchEvent: vi.fn(),
  });

  window.matchMedia = mql as unknown as typeof window.matchMedia;

  return {
    /** Change the matcher and notify subscribers, as the browser would. */
    emit(next: (query: string) => boolean, matches: boolean) {
      current = next;
      for (const cb of listeners) {
        cb({ matches } as MediaQueryListEvent);
      }
    },
    listenerCount: () => listeners.size,
  };
}

describe('useMediaQuery', () => {
  const original = window.matchMedia;
  afterEach(() => {
    window.matchMedia = original;
  });

  it('returns the initial match state on mount', () => {
    installMatchMedia((q) => q.includes('min-width'));
    const { result } = renderHook(() =>
      useMediaQuery('(min-width: 640px)'),
    );
    expect(result.current).toBe(true);
  });

  it('returns false when the query does not match', () => {
    installMatchMedia(() => false);
    const { result } = renderHook(() =>
      useMediaQuery('(min-width: 640px)'),
    );
    expect(result.current).toBe(false);
  });

  it('updates when the media query fires a change event', () => {
    const ctl = installMatchMedia(() => false);
    const { result } = renderHook(() =>
      useMediaQuery('(min-width: 640px)'),
    );
    expect(result.current).toBe(false);

    act(() => ctl.emit(() => true, true));
    expect(result.current).toBe(true);

    act(() => ctl.emit(() => false, false));
    expect(result.current).toBe(false);
  });

  it('unsubscribes the change listener on unmount', () => {
    const ctl = installMatchMedia(() => true);
    const { unmount } = renderHook(() =>
      useMediaQuery('(min-width: 640px)'),
    );
    expect(ctl.listenerCount()).toBe(1);
    unmount();
    expect(ctl.listenerCount()).toBe(0);
  });

  it('re-syncs when the query string changes between renders', () => {
    // Wide matches, narrow does not; switching the query must re-read matches.
    installMatchMedia((q) => q.includes('min-width: 640px'));
    const { result, rerender } = renderHook(
      ({ q }) => useMediaQuery(q),
      { initialProps: { q: '(min-width: 640px)' } },
    );
    expect(result.current).toBe(true);

    rerender({ q: '(min-width: 9999px)' });
    expect(result.current).toBe(false);
  });

  it('is SSR-safe: returns false when matchMedia is unavailable', () => {
    // Simulate a no-matchMedia environment (SSR / older jsdom).
    (window as unknown as { matchMedia?: unknown }).matchMedia =
      undefined as unknown as typeof window.matchMedia;
    const { result } = renderHook(() =>
      useMediaQuery('(min-width: 640px)'),
    );
    expect(result.current).toBe(false);
  });
});
