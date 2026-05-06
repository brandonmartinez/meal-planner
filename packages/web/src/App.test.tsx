import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { http, HttpResponse } from 'msw';
import { server } from '../tests/msw/server';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { WeekProvider } from './context/WeekContext';
import LoginPage from './pages/LoginPage';
import LoadingSpinner from './components/LoadingSpinner';

// Local copy of the production ProtectedRoute logic — kept in sync with App.tsx.
function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const { user, loading } = useAuth();
    const location = useLocation();
    if (loading) return <LoadingSpinner />;
    if (!user) {
        const target = `${location.pathname}${location.search}`;
        if (target && target !== '/' && target.startsWith('/') && !target.startsWith('//')) {
            try {
                sessionStorage.setItem('postLoginRedirect', target);
            } catch {
                /* noop */
            }
        }
        return <Navigate to="/login" replace />;
    }
    return <>{children}</>;
}

function ProtectedDummy() {
    return <div>PROTECTED</div>;
}

function renderApp(initial: string) {
    return render(
        <MemoryRouter initialEntries={[initial]}>
            <ThemeProvider>
                <AuthProvider>
                    <ToastProvider>
                        <WeekProvider>
                            <Routes>
                                <Route path="/login" element={<LoginPage />} />
                                <Route
                                    path="/family/join/:token"
                                    element={
                                        <ProtectedRoute>
                                            <ProtectedDummy />
                                        </ProtectedRoute>
                                    }
                                />
                            </Routes>
                        </WeekProvider>
                    </ToastProvider>
                </AuthProvider>
            </ThemeProvider>
        </MemoryRouter>,
    );
}

describe('post-login redirect', () => {
    beforeEach(() => {
        sessionStorage.clear();
    });

    it('stashes the requested path in sessionStorage when redirecting unauthenticated users to /login', async () => {
        server.use(http.get('/api/auth/me', () => HttpResponse.json(null, { status: 401 })));

        renderApp('/family/join/abc.def.ghi');

        // Should land on the login page
        await screen.findByRole('button', { name: /sign in with google/i });
        expect(sessionStorage.getItem('postLoginRedirect')).toBe('/family/join/abc.def.ghi');
    });

    it('does not stash "/" when the user hits the home route unauthenticated', async () => {
        server.use(http.get('/api/auth/me', () => HttpResponse.json(null, { status: 401 })));

        render(
            <MemoryRouter initialEntries={['/']}>
                <ThemeProvider>
                    <AuthProvider>
                        <ToastProvider>
                            <WeekProvider>
                                <Routes>
                                    <Route path="/login" element={<LoginPage />} />
                                    <Route
                                        path="/"
                                        element={
                                            <ProtectedRoute>
                                                <ProtectedDummy />
                                            </ProtectedRoute>
                                        }
                                    />
                                </Routes>
                            </WeekProvider>
                        </ToastProvider>
                    </AuthProvider>
                </ThemeProvider>
            </MemoryRouter>,
        );

        await screen.findByRole('button', { name: /sign in with google/i });
        expect(sessionStorage.getItem('postLoginRedirect')).toBeNull();
    });

    it('LoginPage navigates to the stored redirect path once the user resolves and clears it', async () => {
        sessionStorage.setItem('postLoginRedirect', '/family/join/abc.def.ghi');
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
        );

        render(
            <MemoryRouter initialEntries={['/login']}>
                <ThemeProvider>
                    <AuthProvider>
                        <ToastProvider>
                            <WeekProvider>
                                <Routes>
                                    <Route path="/login" element={<LoginPage />} />
                                    <Route
                                        path="/family/join/:token"
                                        element={<div>JOIN</div>}
                                    />
                                </Routes>
                            </WeekProvider>
                        </ToastProvider>
                    </AuthProvider>
                </ThemeProvider>
            </MemoryRouter>,
        );

        await waitFor(() => expect(screen.getByText('JOIN')).toBeInTheDocument());
        expect(sessionStorage.getItem('postLoginRedirect')).toBeNull();
    });

    it('LoginPage ignores unsafe stored redirect values and falls back to /', async () => {
        sessionStorage.setItem('postLoginRedirect', 'https://evil.example/');
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
        );

        render(
            <MemoryRouter initialEntries={['/login']}>
                <ThemeProvider>
                    <AuthProvider>
                        <ToastProvider>
                            <WeekProvider>
                                <Routes>
                                    <Route path="/login" element={<LoginPage />} />
                                    <Route path="/" element={<div>HOME</div>} />
                                </Routes>
                            </WeekProvider>
                        </ToastProvider>
                    </AuthProvider>
                </ThemeProvider>
            </MemoryRouter>,
        );

        await waitFor(() => expect(screen.getByText('HOME')).toBeInTheDocument());
        expect(sessionStorage.getItem('postLoginRedirect')).toBeNull();
    });

    // unused-import guard
    void useEffect;
});
