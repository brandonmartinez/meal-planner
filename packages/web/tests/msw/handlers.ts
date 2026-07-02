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
  // Family taxonomy lists (issue #107) — MealsPage, MealPicker, and MealFormPage
  // load these via useTaxonomy on mount to populate filter/assign controls.
  // Default to empty so existing meal tests that don't exercise tags/categories
  // don't trip the `onUnhandledRequest: "error"` guard. Tests that assert on the
  // taxonomy UI override these with populated lists.
  http.get("/api/families/:id/tags", () => HttpResponse.json({ tags: [] })),
  http.get("/api/families/:id/categories", () =>
    HttpResponse.json({ categories: [] }),
  ),
];
