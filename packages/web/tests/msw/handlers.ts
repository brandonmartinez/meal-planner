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
  // Family pantry staples (issue #205) — FamilySettingsPage loads these on mount
  // for parents. Default to empty so tests that don't exercise the staples UI
  // don't trip the `onUnhandledRequest: "error"` guard.
  http.get("/api/families/:id/pantry-staples", () =>
    HttpResponse.json({ staples: [] }),
  ),
  // Family taxonomy lists (issue #107) — MealsPage, MealPicker, and MealFormPage
  // load these via useTaxonomy on mount to populate filter/assign controls.
  // Default to empty so existing meal tests that don't exercise tags don't trip
  // the `onUnhandledRequest: "error"` guard. Tests that assert on the taxonomy
  // UI override these with populated lists.
  http.get("/api/families/:id/tags", () => HttpResponse.json({ tags: [] })),
  // Family grocery categories (issue #119) — MealFormPage and GroceryListPage
  // load these via useGroceryCategories on mount to populate ingredient/item
  // category selects. Default to empty so the hook falls back to the shared
  // INGREDIENT_CATEGORIES defaults (its fail-soft behavior) and existing tests
  // that don't exercise custom categories don't trip `onUnhandledRequest:
  // "error"`. Tests that assert on custom categories override this.
  http.get("/api/families/:id/grocery-categories", () =>
    HttpResponse.json({ categories: [], custom: [] }),
  ),
  // Recipe collections (issue #110) — MealsPage, MealPicker, and MealFormPage load
  // these on mount to populate the collection filter/assignment controls. Default
  // to empty so existing meal tests that don't exercise collections don't trip the
  // `onUnhandledRequest: "error"` guard. Tests that assert on the collections UI
  // override this with a populated list.
  http.get("/api/families/:id/collections", () =>
    HttpResponse.json({ collections: [] }),
  ),
  // Family meals (issue #110 collections modal + #152 membership editing) — the
  // CollectionFormModal pages this endpoint to populate the meal picker and, in
  // edit mode, to load the collection's current membership. Default to an empty
  // page so tests that open the modal without exercising the picker don't trip
  // the `onUnhandledRequest: "error"` guard. Tests that assert on meal
  // membership override this with a populated page.
  http.get("/api/families/:id/meals", () =>
    HttpResponse.json({ items: [], total: 0, limit: 100, offset: 0, hasMore: false }),
  ),
  // Planning templates (issue #117) — TemplatesPage and the WeekPlanPage
  // "apply a template" flow load these on mount. Default to empty so tests that
  // don't exercise templates (e.g. WeekPlanPage suggestion tests) don't trip the
  // `onUnhandledRequest: "error"` guard. Tests that assert on the templates UI
  // override this with a populated list.
  http.get("/api/families/:id/templates", () =>
    HttpResponse.json({ templates: [] }),
  ),
  // Suggestion approve / unapprove (week plan). Default 200 so tests that render
  // WeekPlanPage but don't exercise these actions don't trip onUnhandledRequest.
  // Tests that assert on the approve/unapprove outcome override per-case.
  http.patch(
    "/api/families/:id/suggestions/:suggestionId/approve",
    () => new HttpResponse(null, { status: 200 }),
  ),
  http.patch(
    "/api/families/:id/suggestions/:suggestionId/unapprove",
    () => new HttpResponse(null, { status: 200 }),
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
  // Resolve suggestion choices (issue #226). Default 200 so tests that render
  // WeekPlanPage without exercising the choices resolver don't trip
  // `onUnhandledRequest: "error"`. Tests that assert on the resolve outcome
  // override per-case via server.use(...).
  http.patch("/api/families/:id/suggestions/:suggestionId/choices", () =>
    new HttpResponse(null, { status: 200 }),
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
