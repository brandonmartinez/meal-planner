import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse, delay } from 'msw';
import userEvent from '@testing-library/user-event';
import { server } from '../../tests/msw/server';
import { renderWithProviders, screen, waitFor } from '../test-utils/render';
import LoginPage from './LoginPage';

// LoginPage's redirect-after-auth behaviour (postLoginRedirect handling) is
// covered in App.test.tsx. These tests focus on the unauthenticated landing UI
// and the Google OAuth hand-off, which App.test does not assert.

describe('LoginPage', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('renders the app heading and Google sign-in button for signed-out users', async () => {
    server.use(http.get('/api/auth/me', () => HttpResponse.json(null, { status: 401 })));

    renderWithProviders(<LoginPage />);

    const button = await screen.findByRole('button', { name: /sign in with google/i });
    expect(button).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /meal planner/i })).toBeInTheDocument();
    expect(screen.getByText(/plan your family meals/i)).toBeInTheDocument();
  });

  it('shows the spinner while auth resolves, then reveals the sign-in button', async () => {
    server.use(
      http.get('/api/auth/me', async () => {
        await delay(30);
        return HttpResponse.json(null, { status: 401 });
      }),
    );

    renderWithProviders(<LoginPage />);

    // While AuthProvider is still resolving, the sign-in button is not rendered.
    expect(screen.queryByRole('button', { name: /sign in with google/i })).not.toBeInTheDocument();

    // Once auth resolves to "signed out", the button appears.
    expect(await screen.findByRole('button', { name: /sign in with google/i })).toBeInTheDocument();
  });

  it('redirects to the Google OAuth endpoint when the sign-in button is clicked', async () => {
    server.use(http.get('/api/auth/me', () => HttpResponse.json(null, { status: 401 })));

    const originalLocation = window.location;
    // Replace location with a plain object so we can observe href assignment
    // without jsdom attempting a real navigation.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href: '' },
    });

    try {
      renderWithProviders(<LoginPage />);
      const button = await screen.findByRole('button', { name: /sign in with google/i });
      await userEvent.click(button);
      expect(window.location.href).toBe('/api/auth/google');
    } finally {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: originalLocation,
      });
    }
  });

  // Dev pass-through login (issue #79). The button only appears when the backend
  // reports it enabled — which it hard-gates off in production — so the UI can
  // never surface a passwordless login where the server would refuse it.
  it('renders the dev sign-in button when the backend reports dev-login enabled', async () => {
    server.use(
      http.get('/api/auth/me', () => HttpResponse.json(null, { status: 401 })),
      http.get('/api/auth/config', () =>
        HttpResponse.json({ devLoginEnabled: true, googleEnabled: true }),
      ),
    );

    renderWithProviders(<LoginPage />);

    // Google stays the primary option; the dev button is an additional one.
    expect(await screen.findByRole('button', { name: /sign in with google/i })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /dev sign-in \(demo\)/i })).toBeInTheDocument();
  });

  it('does not render the dev sign-in button when dev-login is disabled', async () => {
    server.use(
      http.get('/api/auth/me', () => HttpResponse.json(null, { status: 401 })),
      http.get('/api/auth/config', () =>
        HttpResponse.json({ devLoginEnabled: false, googleEnabled: true }),
      ),
    );

    renderWithProviders(<LoginPage />);

    // Wait for the page + config probe to settle before asserting absence.
    await screen.findByRole('button', { name: /sign in with google/i });
    expect(screen.queryByRole('button', { name: /dev sign-in \(demo\)/i })).not.toBeInTheDocument();
  });

  it('hides the dev sign-in button when the config probe fails', async () => {
    server.use(
      http.get('/api/auth/me', () => HttpResponse.json(null, { status: 401 })),
      http.get('/api/auth/config', () =>
        HttpResponse.json({ error: 'boom' }, { status: 500 }),
      ),
    );

    renderWithProviders(<LoginPage />);

    await screen.findByRole('button', { name: /sign in with google/i });
    expect(screen.queryByRole('button', { name: /dev sign-in \(demo\)/i })).not.toBeInTheDocument();
  });

  it('runs the dev-login flow (POST + user refresh) when the dev button is clicked', async () => {
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
      http.get('/api/auth/config', () =>
        HttpResponse.json({ devLoginEnabled: true, googleEnabled: true }),
      ),
      http.post('/api/auth/dev-login', () => {
        devLoginCalled = true;
        signedIn = true;
        return HttpResponse.json(demoUser);
      }),
      // /me returns the demo user only after dev-login has run, so the click
      // both POSTs to dev-login and re-fetches the current user.
      http.get('/api/auth/me', () =>
        signedIn ? HttpResponse.json(demoUser) : HttpResponse.json(null, { status: 401 }),
      ),
    );

    renderWithProviders(<LoginPage />);
    const devButton = await screen.findByRole('button', { name: /dev sign-in \(demo\)/i });
    await userEvent.click(devButton);

    await waitFor(() => expect(devLoginCalled).toBe(true));
  });
});
