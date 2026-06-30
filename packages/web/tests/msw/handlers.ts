import { http, HttpResponse } from "msw";

// Default handlers — most tests override per-test via server.use(...).
export const handlers = [
  http.get("/api/auth/me", () => HttpResponse.json(null, { status: 401 })),
  // Agent credentials list (issue #6) — FamilySettingsPage loads this for any
  // parent during initial data load. Default to empty so existing parent tests
  // that don't exercise the agent-credential UI don't trip the
  // `onUnhandledRequest: "error"` guard. Tests that assert on it override here.
  http.get("/api/families/:id/agent-credentials", () => HttpResponse.json([])),
];
