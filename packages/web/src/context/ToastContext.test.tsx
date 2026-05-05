import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ToastProvider, useToast } from './ToastContext';

function wrapper({ children }: { children: ReactNode }) {
    return <ToastProvider>{children}</ToastProvider>;
}

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe('ToastContext', () => {
    it('shows a toast and auto-dismisses after 3s', () => {
        const { result } = renderHook(() => useToast(), { wrapper });
        expect(result.current.toasts).toHaveLength(0);

        act(() => result.current.showToast('hello', 'success'));
        expect(result.current.toasts).toHaveLength(1);
        expect(result.current.toasts[0]).toMatchObject({ message: 'hello', type: 'success' });

        act(() => {
            vi.advanceTimersByTime(3000);
        });
        expect(result.current.toasts).toHaveLength(0);
    });

    it('removeToast removes a toast by id immediately', () => {
        const { result } = renderHook(() => useToast(), { wrapper });
        act(() => result.current.showToast('a'));
        const id = result.current.toasts[0].id;
        act(() => result.current.removeToast(id));
        expect(result.current.toasts).toHaveLength(0);
    });

    it('defaults type to info', () => {
        const { result } = renderHook(() => useToast(), { wrapper });
        act(() => result.current.showToast('msg'));
        expect(result.current.toasts[0].type).toBe('info');
    });

    it('supports multiple concurrent toasts', () => {
        const { result } = renderHook(() => useToast(), { wrapper });
        act(() => {
            result.current.showToast('a');
            result.current.showToast('b');
            result.current.showToast('c');
        });
        expect(result.current.toasts.map((t) => t.message)).toEqual(['a', 'b', 'c']);
    });
});
