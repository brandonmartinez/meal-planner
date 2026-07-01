import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import { getAuthConfig } from '../api/auth';
import LoadingSpinner from '../components/LoadingSpinner';

export default function LoginPage() {
  const { user, loading, login, devLogin } = useAuth();
  const navigate = useNavigate();
  // Whether the backend advertises the dev pass-through login. Defaults to
  // false so the button stays hidden unless the capability probe explicitly
  // reports it on (and it is hard-gated off in production server-side).
  const [devLoginEnabled, setDevLoginEnabled] = useState(false);
  const [devLoginPending, setDevLoginPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Probe the backend for available sign-in options. If the probe fails for
    // any reason, we simply leave the dev button hidden — never block the page
    // or surface an error, since Google sign-in always works regardless.
    getAuthConfig()
      .then((cfg) => {
        if (!cancelled) setDevLoginEnabled(cfg.devLoginEnabled);
      })
      .catch(() => {
        if (!cancelled) setDevLoginEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!loading && user) {
      let target = '/';
      try {
        const stored = sessionStorage.getItem('postLoginRedirect');
        sessionStorage.removeItem('postLoginRedirect');
        // Only honor safe relative paths (open-redirect protection).
        if (stored && stored.startsWith('/') && !stored.startsWith('//')) {
          target = stored;
        }
      } catch {
        // ignore storage errors
      }
      navigate(target, { replace: true });
    }
  }, [user, loading, navigate]);

  const handleDevLogin = async () => {
    setDevLoginPending(true);
    try {
      await devLogin();
    } catch {
      // The dev button is a local-only convenience; on failure just re-enable
      // it so the user can retry. Google sign-in remains available regardless.
      setDevLoginPending(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner message="Loading…" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 text-center">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">🍽️ Meal Planner</h1>
        <p className="text-gray-600 dark:text-gray-300 mb-8">Plan your family meals for the week ahead.</p>
        <button
          onClick={login}
          className="w-full flex items-center justify-center gap-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-6 py-3 text-gray-700 dark:text-gray-100 font-medium hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Sign in with Google
        </button>

        {devLoginEnabled && (
          <div className="mt-6">
            <div className="relative mb-4">
              <div className="absolute inset-0 flex items-center" aria-hidden="true">
                <div className="w-full border-t border-gray-200 dark:border-gray-700" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-white dark:bg-gray-800 px-3 text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  For local development
                </span>
              </div>
            </div>
            <button
              onClick={handleDevLogin}
              disabled={devLoginPending}
              className="w-full rounded-lg border border-dashed border-gray-300 dark:border-gray-600 px-6 py-2.5 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {devLoginPending ? 'Signing in…' : 'Dev sign-in (demo)'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
