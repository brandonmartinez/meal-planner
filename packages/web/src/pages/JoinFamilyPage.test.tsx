import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../../tests/msw/server';
import { AuthProvider } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';
import { ToastProvider } from '../context/ToastContext';
import { WeekProvider } from '../context/WeekContext';
import JoinFamilyPage from './JoinFamilyPage';

function makeToken(payload: object): string {
    return `h.${btoa(JSON.stringify(payload))}.s`;
}

function renderJoinAt(path: string) {
    return render(
        <MemoryRouter initialEntries={[path]}>
            <ThemeProvider>
                <AuthProvider>
                    <ToastProvider>
                        <WeekProvider>
                            <Routes>
                                <Route path="/family/join/:token" element={<JoinFamilyPage />} />
                                <Route path="/" element={<div>HOME</div>} />
                                <Route path="/family/create" element={<div>CREATE</div>} />
                            </Routes>
                        </WeekProvider>
                    </ToastProvider>
                </AuthProvider>
            </ThemeProvider>
        </MemoryRouter>,
    );
}

describe('JoinFamilyPage', () => {
    beforeEach(() => {
        sessionStorage.clear();
        localStorage.clear();
    });

    it('refreshes auth and waits for the new family before navigating to /', async () => {
        const familyId = 'fam-1';
        const token = makeToken({ familyId, role: 'PARENT' });

        const baseUser = {
            id: 'u-1',
            email: 'a@b.com',
            name: 'Alice',
            avatarUrl: null,
        };
        let meCalls = 0;
        server.use(
            http.get('/api/auth/me', () => {
                meCalls += 1;
                // First call (initial AuthProvider mount): no memberships yet.
                // Subsequent calls (after refresh()): includes the new family.
                if (meCalls === 1) {
                    return HttpResponse.json({ ...baseUser, memberships: [] });
                }
                return HttpResponse.json({
                    ...baseUser,
                    memberships: [
                        {
                            id: 'm-1',
                            role: 'PARENT',
                            familyId,
                            userId: baseUser.id,
                            family: { id: familyId, name: 'Smiths' },
                        },
                    ],
                });
            }),
            http.post(`/api/families/${familyId}/join`, () =>
                HttpResponse.json({
                    id: 'm-1',
                    role: 'PARENT',
                    familyId,
                    userId: baseUser.id,
                    user: baseUser,
                }),
            ),
        );

        renderJoinAt(`/family/join/${token}`);

        const button = await screen.findByRole('button', { name: /join family/i });
        await userEvent.click(button);

        await waitFor(() => expect(screen.getByText('HOME')).toBeInTheDocument());
        // Critical: must NOT have landed on /family/create due to stale memberships.
        expect(screen.queryByText('CREATE')).not.toBeInTheDocument();
        expect(meCalls).toBeGreaterThanOrEqual(2);
    });

    it('shows an error and remains on the page when the join request fails', async () => {
        const familyId = 'fam-1';
        const token = makeToken({ familyId, role: 'PARENT' });

        server.use(
            http.get('/api/auth/me', () =>
                HttpResponse.json({
                    id: 'u-1',
                    email: 'a@b.com',
                    name: 'Alice',
                    avatarUrl: null,
                    memberships: [],
                }),
            ),
            http.post(`/api/families/${familyId}/join`, () =>
                HttpResponse.json({ error: 'Invalid invite' }, { status: 400 }),
            ),
        );

        renderJoinAt(`/family/join/${token}`);

        const button = await screen.findByRole('button', { name: /join family/i });
        await userEvent.click(button);

        await waitFor(() => expect(screen.getByText(/invalid invite/i)).toBeInTheDocument());
        expect(screen.queryByText('HOME')).not.toBeInTheDocument();
    });

    it('shows "Invalid invite link" for a malformed token', async () => {
        server.use(
            http.get('/api/auth/me', () => HttpResponse.json(null, { status: 401 })),
        );
        renderJoinAt('/family/join/not-a-jwt');
        await waitFor(() =>
            expect(screen.getByText(/invalid invite link/i)).toBeInTheDocument(),
        );
    });

    // Suppress unused-import warning for the spy import we're not using.
    void vi;
});
