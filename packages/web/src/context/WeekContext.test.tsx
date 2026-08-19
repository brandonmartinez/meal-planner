import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { WeekProvider, useWeek } from './WeekContext';

const STORAGE_KEY = 'meal-planner-selected-week';
const CURRENT_WEEK = '2026-05-04';
const SELECTED_WEEK = '2026-04-27';
const NOW = new Date('2026-05-05T10:00:00').getTime();
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

function wrapper({ children }: { children: ReactNode }) {
    return <WeekProvider>{children}</WeekProvider>;
}

function storedSelection(overrides: Record<string, unknown> = {}) {
    return JSON.stringify({
        version: 1,
        weekStart: SELECTED_WEEK,
        selectedAt: NOW - 60 * 60 * 1000,
        ...overrides,
    });
}

function dispatchStorage(newValue: string | null, key = STORAGE_KEY) {
    window.dispatchEvent(new StorageEvent('storage', { key, newValue }));
}

beforeEach(() => {
    vi.useFakeTimers();
    // Tuesday, May 5 2026.
    vi.setSystemTime(NOW);
    window.localStorage.clear();
});

afterEach(() => {
    vi.useRealTimers();
});

describe('WeekContext', () => {
    it('initializes to the current week (Monday) when nothing is stored', () => {
        const { result } = renderHook(() => useWeek(), { wrapper });

        expect(result.current.weekStart).toBe(CURRENT_WEEK);
        expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('restores a recent non-current week selection', () => {
        const stored = storedSelection();
        window.localStorage.setItem(STORAGE_KEY, stored);

        const { result } = renderHook(() => useWeek(), { wrapper });

        expect(result.current.weekStart).toBe(SELECTED_WEEK);
        expect(window.localStorage.getItem(STORAGE_KEY)).toBe(stored);
    });

    it('expires a selection at the exact two-hour boundary', () => {
        window.localStorage.setItem(
            STORAGE_KEY,
            storedSelection({ selectedAt: NOW - TWO_HOURS_MS }),
        );

        const { result } = renderHook(() => useWeek(), { wrapper });

        expect(result.current.weekStart).toBe(CURRENT_WEEK);
    });

    it('treats a legacy date-only selection as stale', () => {
        window.localStorage.setItem(STORAGE_KEY, SELECTED_WEEK);

        const { result } = renderHook(() => useWeek(), { wrapper });

        expect(result.current.weekStart).toBe(CURRENT_WEEK);
    });

    it.each([
        ['malformed JSON', '{not-json'],
        ['a non-object payload', JSON.stringify([SELECTED_WEEK, NOW])],
        ['partial state', JSON.stringify({ version: 1, weekStart: SELECTED_WEEK })],
        ['an invalid date', storedSelection({ weekStart: '2026-02-30' })],
        ['an invalid timestamp type', storedSelection({ selectedAt: 'recently' })],
        ['a negative timestamp', storedSelection({ selectedAt: -1 })],
        ['a future timestamp', storedSelection({ selectedAt: NOW + 1 })],
        ['an unknown version', storedSelection({ version: 2 })],
    ])('falls back to the current week for %s', (_case, stored) => {
        window.localStorage.setItem(STORAGE_KEY, stored);

        const { result } = renderHook(() => useWeek(), { wrapper });

        expect(result.current.weekStart).toBe(CURRENT_WEEK);
    });

    it('persists a non-current selection as one versioned timestamped value', () => {
        const { result } = renderHook(() => useWeek(), { wrapper });

        act(() => result.current.setWeekStart(SELECTED_WEEK));

        expect(result.current.weekStart).toBe(SELECTED_WEEK);
        expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)).toEqual({
            version: 1,
            weekStart: SELECTED_WEEK,
            selectedAt: NOW,
        });
        expect(window.localStorage).toHaveLength(1);
    });

    it('clears persisted state when the current week is selected', () => {
        const { result } = renderHook(() => useWeek(), { wrapper });
        act(() => result.current.setWeekStart(SELECTED_WEEK));

        act(() => result.current.setWeekStart(CURRENT_WEEK));

        expect(result.current.weekStart).toBe(CURRENT_WEEK);
        expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('goToToday returns to the current week and clears persisted state', () => {
        const { result } = renderHook(() => useWeek(), { wrapper });
        act(() => result.current.setWeekStart(SELECTED_WEEK));

        act(() => result.current.goToToday());

        expect(result.current.weekStart).toBe(CURRENT_WEEK);
        expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('does not refresh selectedAt during ordinary activity', () => {
        const stored = storedSelection();
        window.localStorage.setItem(STORAGE_KEY, stored);
        const { result, rerender, unmount } = renderHook(() => useWeek(), { wrapper });

        rerender();
        expect(result.current.weekStart).toBe(SELECTED_WEEK);
        expect(window.localStorage.getItem(STORAGE_KEY)).toBe(stored);

        unmount();
        vi.setSystemTime(NOW + 61 * 60 * 1000);
        const remounted = renderHook(() => useWeek(), { wrapper });
        expect(remounted.result.current.weekStart).toBe(CURRENT_WEEK);
    });

    it('applies a valid recent cross-tab update', () => {
        const { result } = renderHook(() => useWeek(), { wrapper });

        act(() => dispatchStorage(storedSelection({ selectedAt: NOW })));

        expect(result.current.weekStart).toBe(SELECTED_WEEK);
    });

    it('returns to the current week when another tab removes the selection', () => {
        window.localStorage.setItem(STORAGE_KEY, storedSelection());
        const { result } = renderHook(() => useWeek(), { wrapper });

        act(() => dispatchStorage(null));

        expect(result.current.weekStart).toBe(CURRENT_WEEK);
    });

    it.each([
        ['malformed', '{not-json'],
        ['expired', storedSelection({ selectedAt: NOW - TWO_HOURS_MS })],
    ])('falls back for a %s cross-tab update', (_case, stored) => {
        window.localStorage.setItem(STORAGE_KEY, storedSelection());
        const { result } = renderHook(() => useWeek(), { wrapper });

        act(() => dispatchStorage(stored));

        expect(result.current.weekStart).toBe(CURRENT_WEEK);
    });

    it('ignores storage events for unrelated keys', () => {
        window.localStorage.setItem(STORAGE_KEY, storedSelection());
        const { result } = renderHook(() => useWeek(), { wrapper });

        act(() => dispatchStorage('{not-json', 'unrelated-key'));

        expect(result.current.weekStart).toBe(SELECTED_WEEK);
    });
});
