import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import type { AuthUser } from '@meal-planner/shared';
import { request } from '../api/client';

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: () => void;
  devLogin: () => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    try {
      // request<T> throws on non-OK (e.g. 401 when signed out) — treat any
      // failure as "no current user".
      setUser(await request<AuthUser>('/api/auth/me'));
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUser(); }, [fetchUser]);

  const login = () => {
    // Google OAuth is a full-page redirect, not an XHR/fetch — this is the one
    // documented exception to routing auth calls through request<T>().
    window.location.href = '/api/auth/google';
  };

  const devLogin = useCallback(async () => {
    // Pass-through login for local dev/demo. Sets the auth cookie server-side,
    // then re-fetches the current user so the app transitions to signed-in.
    await request('/api/auth/dev-login', { method: 'POST' });
    await fetchUser();
  }, [fetchUser]);

  const logout = async () => {
    try {
      await request<void>('/api/auth/logout', { method: 'POST' });
    } finally {
      // Always clear local auth state, even if the server call fails.
      setUser(null);
    }
  };

  const refresh = async () => {
    await fetchUser();
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, devLogin, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
