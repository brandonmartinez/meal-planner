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
  // Meal image assets (issue #105). Default handlers so image upload/preview UX
  // doesn't trip `onUnhandledRequest: "error"`. Tests that assert on validation
  // failures (413/400) override POST per-case via server.use(...).
  http.post("/api/families/:id/images", () =>
    HttpResponse.json(
      {
        id: "asset-default",
        mealId: null,
        contentType: "image/png",
        byteSize: 128,
        createdAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
      },
      { status: 201 },
    ),
  ),
  http.delete("/api/families/:id/images/:assetId", () =>
    new HttpResponse(null, { status: 204 }),
  ),
  // 1x1 transparent PNG so jsdom `<img>` GETs resolve during preview assertions.
  http.get("/api/families/:id/images/:assetId", () =>
    new HttpResponse(
      Uint8Array.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]),
      { status: 200, headers: { "Content-Type": "image/png" } },
    ),
  ),
];
