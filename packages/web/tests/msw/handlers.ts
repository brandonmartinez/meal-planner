import { http, HttpResponse } from "msw";

// Default handlers — most tests override per-test via server.use(...).
export const handlers = [
  http.get("/api/auth/me", () => HttpResponse.json(null, { status: 401 })),
  // Login capability probe (issue #79). LoginPage loads this on mount to decide
  // which sign-in buttons to render. Default to dev-login OFF so existing tests
  // that render LoginPage don't surface the dev button unless they opt in.
  http.get("/api/auth/config", () =>
    HttpResponse.json({ devLoginEnabled: false, googleEnabled: true }),
  ),
  // Agent credentials list (issue #6) — FamilySettingsPage loads this for any
  // parent during initial data load. Default to empty so existing parent tests
  // that don't exercise the agent-credential UI don't trip the
  // `onUnhandledRequest: "error"` guard. Tests that assert on it override here.
  http.get("/api/families/:id/agent-credentials", () => HttpResponse.json([])),
];
