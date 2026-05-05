import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ThemeProvider, useTheme } from './ThemeContext';

function wrapper({ children }: { children: ReactNode }) {
    return <ThemeProvider>{children}</ThemeProvider>;
}

let matchListeners: Array<(e: { matches: boolean }) => void> = [];
let systemDark = false;

beforeEach(() => {
    matchListeners = [];
    systemDark = false;
    Object.defineProperty(window, 'matchMedia', {
        writable: true,
        configurable: true,
        value: (query: string) => ({
            get matches() {
                return systemDark;
            },
            media: query,
            onchange: null,
            addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => {
                matchListeners.push(cb);
            },
            removeEventListener: (_: string, cb: (e: { matches: boolean }) => void) => {
                matchListeners = matchListeners.filter((x) => x !== cb);
            },
            addListener: vi.fn(),
            removeListener: vi.fn(),
            dispatchEvent: vi.fn(),
        }),
    });
});

afterEach(() => {
    document.documentElement.classList.remove('dark');
});

describe('ThemeContext', () => {
    it('defaults to system theme when nothing is stored', () => {
        const { result } = renderHook(() => useTheme(), { wrapper });
        expect(result.current.theme).toBe('system');
        expect(result.current.resolvedTheme).toBe('light');
        expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('reads stored theme from localStorage on mount', () => {
        window.localStorage.setItem('theme', 'dark');
        const { result } = renderHook(() => useTheme(), { wrapper });
        expect(result.current.theme).toBe('dark');
        expect(result.current.resolvedTheme).toBe('dark');
        expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('setTheme persists to localStorage and applies the dark class', () => {
        const { result } = renderHook(() => useTheme(), { wrapper });
        act(() => result.current.setTheme('dark'));
        expect(window.localStorage.getItem('theme')).toBe('dark');
        expect(document.documentElement.classList.contains('dark')).toBe(true);

        act(() => result.current.setTheme('light'));
        expect(window.localStorage.getItem('theme')).toBe('light');
        expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('setTheme(system) removes the storage entry', () => {
        window.localStorage.setItem('theme', 'dark');
        const { result } = renderHook(() => useTheme(), { wrapper });
        act(() => result.current.setTheme('system'));
        expect(window.localStorage.getItem('theme')).toBeNull();
    });

    it('toggleTheme flips between dark and light based on resolvedTheme', () => {
        const { result } = renderHook(() => useTheme(), { wrapper });
        expect(result.current.resolvedTheme).toBe('light');
        act(() => result.current.toggleTheme());
        expect(result.current.resolvedTheme).toBe('dark');
        act(() => result.current.toggleTheme());
        expect(result.current.resolvedTheme).toBe('light');
    });

    it('responds to system preference changes when in system mode', () => {
        const { result } = renderHook(() => useTheme(), { wrapper });
        expect(result.current.theme).toBe('system');
        act(() => {
            systemDark = true;
            matchListeners.forEach((cb) => cb({ matches: true }));
        });
        expect(result.current.resolvedTheme).toBe('dark');
        expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
});
