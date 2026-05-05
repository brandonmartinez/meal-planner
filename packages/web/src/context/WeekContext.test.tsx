import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { WeekProvider, useWeek } from './WeekContext';

function wrapper({ children }: { children: ReactNode }) {
    return <WeekProvider>{children}</WeekProvider>;
}

beforeEach(() => {
    vi.useFakeTimers();
    // Tuesday, May 5 2026.
    vi.setSystemTime(new Date('2026-05-05T10:00:00'));
});

afterEach(() => {
    vi.useRealTimers();
});

describe('WeekContext', () => {
    it('initializes to the current week (Monday) when nothing is stored', () => {
        const { result } = renderHook(() => useWeek(), { wrapper });
        expect(result.current.weekStart).toBe('2026-05-04');
    });

    it('reads a valid stored value', () => {
        window.localStorage.setItem('meal-planner-selected-week', '2026-04-27');
        const { result } = renderHook(() => useWeek(), { wrapper });
        expect(result.current.weekStart).toBe('2026-04-27');
    });

    it('falls back to current week if the stored value is malformed', () => {
        window.localStorage.setItem('meal-planner-selected-week', 'garbage');
        const { result } = renderHook(() => useWeek(), { wrapper });
        expect(result.current.weekStart).toBe('2026-05-04');
    });

    it('setWeekStart updates state and persists to localStorage', () => {
        const { result } = renderHook(() => useWeek(), { wrapper });
        act(() => result.current.setWeekStart('2026-05-11'));
        expect(result.current.weekStart).toBe('2026-05-11');
        expect(window.localStorage.getItem('meal-planner-selected-week')).toBe('2026-05-11');
    });

    it('goToToday resets to the current week start', () => {
        const { result } = renderHook(() => useWeek(), { wrapper });
        act(() => result.current.setWeekStart('2026-04-27'));
        act(() => result.current.goToToday());
        expect(result.current.weekStart).toBe('2026-05-04');
    });
});
