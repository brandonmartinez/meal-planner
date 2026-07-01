import { request } from './client';

const API_BASE = '/api/auth';

/**
 * Feature flags reported by `GET /api/auth/config`. Reveals only which sign-in
 * options the backend offers — never any secret. The login page uses these to
 * decide which buttons to render (e.g. the dev pass-through only appears when
 * `devLoginEnabled` is true, which the backend hard-gates off in production).
 */
export interface AuthConfig {
  devLoginEnabled: boolean;
  googleEnabled: boolean;
}

/** Fetch the sign-in capability flags for the current environment. */
export function getAuthConfig() {
  return request<AuthConfig>(`${API_BASE}/config`);
}
