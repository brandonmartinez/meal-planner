import { describe, it, expect } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { http, HttpResponse } from 'msw';
import { server } from '../../tests/msw/server';
import { AuthProvider, useAuth } from './AuthContext';

function wrapper({ children }: { children: ReactNode }) {
    return <AuthProvider>{children}</AuthProvider>;
}

describe('AuthContext', () => {
    it('starts in loading state and resolves to null when /api/auth/me returns 401', async () => {
        server.use(http.get('/api/auth/me', () => HttpResponse.json(null, { status: 401 })));
        const { result } = renderHook(() => useAuth(), { wrapper });
        expect(result.current.loading).toBe(true);
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.user).toBeNull();
    });

    it('populates user when /api/auth/me succeeds', async () => {
        const fakeUser = {
            id: 'u-1',
            email: 'a@b.com',
            name: 'Alice',
            avatarUrl: null,
            memberships: [],
        };
        server.use(http.get('/api/auth/me', () => HttpResponse.json(fakeUser)));

        const { result } = renderHook(() => useAuth(), { wrapper });
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.user).toEqual(fakeUser);
    });

    it('logout clears the user', async () => {
        const fakeUser = {
            id: 'u-1',
            email: 'a@b.com',
            name: 'Alice',
            avatarUrl: null,
            memberships: [],
        };
        server.use(
            http.get('/api/auth/me', () => HttpResponse.json(fakeUser)),
            http.post('/api/auth/logout', () => HttpResponse.json({ ok: true })),
        );

        const { result } = renderHook(() => useAuth(), { wrapper });
        await waitFor(() => expect(result.current.user).not.toBeNull());

        await act(async () => {
            await result.current.logout();
        });
        expect(result.current.user).toBeNull();
    });

    it('refresh re-fetches the current user', async () => {
        let call = 0;
        server.use(
            http.get('/api/auth/me', () => {
                call += 1;
                if (call === 1) return HttpResponse.json(null, { status: 401 });
                return HttpResponse.json({
                    id: 'u-2',
                    email: 'b@b.com',
                    name: 'Bob',
                    avatarUrl: null,
                    memberships: [],
                });
            }),
        );

        const { result } = renderHook(() => useAuth(), { wrapper });
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.user).toBeNull();

        await act(async () => {
            await result.current.refresh();
        });
        expect(result.current.user?.id).toBe('u-2');
    });

    it('devLogin POSTs to the dev-login endpoint then loads the demo user', async () => {
        const demoUser = {
            id: 'demo-1',
            email: 'demo@mealplanner.local',
            name: 'Jamie Rivera',
            avatarUrl: null,
            memberships: [],
        };
        let devLoginCalled = false;
        let signedIn = false;
        server.use(
            http.post('/api/auth/dev-login', () => {
                devLoginCalled = true;
                signedIn = true;
                return HttpResponse.json(demoUser);
            }),
            http.get('/api/auth/me', () =>
                signedIn ? HttpResponse.json(demoUser) : HttpResponse.json(null, { status: 401 }),
            ),
        );

        const { result } = renderHook(() => useAuth(), { wrapper });
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.user).toBeNull();

        await act(async () => {
            await result.current.devLogin();
        });

        expect(devLoginCalled).toBe(true);
        expect(result.current.user).toEqual(demoUser);
    });
});
