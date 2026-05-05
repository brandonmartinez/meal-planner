import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useFamily } from './useFamily';

const mockUser = {
    current: null as null | {
        memberships: { familyId: string; family: { id: string; name: string } }[];
    },
};

vi.mock('../context/AuthContext', () => ({
    useAuth: () => ({ user: mockUser.current, loading: false }),
}));

function wrapper({ children }: { children: ReactNode }) {
    return <>{children}</>;
}

function setUser(memberships: { familyId: string; family: { id: string; name: string } }[]) {
    mockUser.current = { memberships };
}

describe('useFamily', () => {
    it('returns nulls when user has no memberships', () => {
        setUser([]);
        const { result } = renderHook(() => useFamily(), { wrapper });
        expect(result.current.familyId).toBeNull();
        expect(result.current.family).toBeNull();
        expect(result.current.hasFamilies).toBe(false);
    });

    it('defaults to the first membership when nothing is stored', async () => {
        setUser([
            { familyId: 'f-1', family: { id: 'f-1', name: 'A' } },
            { familyId: 'f-2', family: { id: 'f-2', name: 'B' } },
        ]);
        const { result } = renderHook(() => useFamily(), { wrapper });
        expect(result.current.familyId).toBe('f-1');
        await waitFor(() =>
            expect(window.localStorage.getItem('meal-planner-selected-family')).toBe('f-1'),
        );
    });

    it('honors a valid stored selection', () => {
        window.localStorage.setItem('meal-planner-selected-family', 'f-2');
        setUser([
            { familyId: 'f-1', family: { id: 'f-1', name: 'A' } },
            { familyId: 'f-2', family: { id: 'f-2', name: 'B' } },
        ]);
        const { result } = renderHook(() => useFamily(), { wrapper });
        expect(result.current.familyId).toBe('f-2');
        expect(result.current.family?.name).toBe('B');
    });

    it('falls back to the first membership when the stored selection is no longer a member', () => {
        window.localStorage.setItem('meal-planner-selected-family', 'f-stale');
        setUser([{ familyId: 'f-1', family: { id: 'f-1', name: 'A' } }]);
        const { result } = renderHook(() => useFamily(), { wrapper });
        expect(result.current.familyId).toBe('f-1');
    });

    it('switchFamily updates state and persists', () => {
        setUser([
            { familyId: 'f-1', family: { id: 'f-1', name: 'A' } },
            { familyId: 'f-2', family: { id: 'f-2', name: 'B' } },
        ]);
        const { result } = renderHook(() => useFamily(), { wrapper });
        act(() => result.current.switchFamily('f-2'));
        expect(result.current.familyId).toBe('f-2');
        expect(window.localStorage.getItem('meal-planner-selected-family')).toBe('f-2');
    });
});
