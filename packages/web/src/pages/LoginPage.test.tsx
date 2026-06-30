import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse, delay } from 'msw';
import userEvent from '@testing-library/user-event';
import { server } from '../../tests/msw/server';
import { renderWithProviders, screen } from '../test-utils/render';
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
});
