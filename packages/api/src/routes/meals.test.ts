import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../../tests/helpers/prisma.js";
import { buildReq, buildNext } from "../../tests/helpers/express.js";
import { getRouteHandler, buildFullRes } from "../../tests/helpers/router.js";

vi.mock("../config/database.js", () => ({ default: prismaMock }));
vi.mock("../services/meals.js", () => ({
  listMeals: vi.fn(),
  createMeal: vi.fn(),
  importMeals: vi.fn(),
  exportMeals: vi.fn(),
  getMealById: vi.fn(),
  updateMeal: vi.fn(),
  deleteMeal: vi.fn(),
}));

const { mealsRouter } = await import("./meals.js");
const mealService = await import("../services/meals.js");

const FAMILY_ID = "fam-1";
const MEAL_ID = "meal-1";

function req(over: Record<string, unknown> = {}) {
  return buildReq({ user: { id: "user-1" } as never, ...over });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /:familyId/meals (list)", () => {
  const handler = getRouteHandler(mealsRouter, "get", "/:familyId/meals");

  it("200s and forwards the optional search filter", async () => {
    vi.mocked(mealService.listMeals).mockResolvedValue([] as never);
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID }, query: { search: "taco" } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(200);
    expect(mealService.listMeals).toHaveBeenCalledWith(FAMILY_ID, {
      search: "taco",
    });
  });

  it("forwards the recent-scheduling fields in the response body", async () => {
    vi.mocked(mealService.listMeals).mockResolvedValue([
      {
        id: MEAL_ID,
        name: "Tacos",
        _count: { ingredients: 2 },
        recentlyScheduled: true,
        lastScheduledOn: "2026-06-30",
      },
    ] as never);
    const res = buildFullRes();
    await handler(req({ params: { familyId: FAMILY_ID } }), res, buildNext());
    expect(res.statusCode).toBe(200);
    const body = res.body as Array<{
      recentlyScheduled: boolean;
      lastScheduledOn: string | null;
    }>;
    expect(body[0].recentlyScheduled).toBe(true);
    expect(body[0].lastScheduledOn).toBe("2026-06-30");
  });

  it("500s when the service throws", async () => {
    vi.mocked(mealService.listMeals).mockRejectedValue(new Error("db"));
    const res = buildFullRes();
    await handler(req({ params: { familyId: FAMILY_ID } }), res, buildNext());
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: "Failed to fetch meals" });
  });
});

describe("POST /:familyId/meals (create)", () => {
  const handler = getRouteHandler(mealsRouter, "post", "/:familyId/meals");

  it("201s with the created meal", async () => {
    vi.mocked(mealService.createMeal).mockResolvedValue({
      id: MEAL_ID,
    } as never);
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID }, body: { name: "Tacos" } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(201);
  });

  it("400s on Zod failure (missing name)", async () => {
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID }, body: {} }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(400);
    expect(mealService.createMeal).not.toHaveBeenCalled();
  });

  it("400s on an invalid difficulty enum", async () => {
    const res = buildFullRes();
    await handler(
      req({
        params: { familyId: FAMILY_ID },
        body: { name: "Tacos", difficulty: "IMPOSSIBLE" },
      }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(400);
  });

  it("500s when the service throws", async () => {
    vi.mocked(mealService.createMeal).mockRejectedValue(new Error("db"));
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID }, body: { name: "Tacos" } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(500);
  });
});

describe("POST /:familyId/meals/import (bulk)", () => {
  const handler = getRouteHandler(
    mealsRouter,
    "post",
    "/:familyId/meals/import",
  );

  it("200s with the import result", async () => {
    vi.mocked(mealService.importMeals).mockResolvedValue({
      created: 1,
    } as never);
    const res = buildFullRes();
    await handler(
      req({
        params: { familyId: FAMILY_ID },
        body: { meals: [{ name: "Tacos" }] },
      }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(200);
  });

  it("400s on Zod failure (empty meals array)", async () => {
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID }, body: { meals: [] } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(400);
    expect(mealService.importMeals).not.toHaveBeenCalled();
  });

  it("forwards a valid difficulty through to the service", async () => {
    vi.mocked(mealService.importMeals).mockResolvedValue({
      created: 1,
    } as never);
    const res = buildFullRes();
    await handler(
      req({
        params: { familyId: FAMILY_ID },
        body: { meals: [{ name: "Tacos", difficulty: "EASY" }] },
      }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(200);
    expect(mealService.importMeals).toHaveBeenCalledWith(
      FAMILY_ID,
      [{ name: "Tacos", difficulty: "EASY" }],
      { mode: undefined },
    );
  });

  it("400s on an invalid difficulty value in a meal row", async () => {
    const res = buildFullRes();
    await handler(
      req({
        params: { familyId: FAMILY_ID },
        body: { meals: [{ name: "Tacos", difficulty: "IMPOSSIBLE" }] },
      }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(400);
    expect(mealService.importMeals).not.toHaveBeenCalled();
  });

  it("500s when the service throws", async () => {
    vi.mocked(mealService.importMeals).mockRejectedValue(new Error("db"));
    const res = buildFullRes();
    await handler(
      req({
        params: { familyId: FAMILY_ID },
        body: { meals: [{ name: "Tacos" }] },
      }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(500);
  });
});

describe("GET /:familyId/meals/export", () => {
  const handler = getRouteHandler(mealsRouter, "get", "/:familyId/meals/export");

  it("200s with the exported meals wrapped in { meals }", async () => {
    vi.mocked(mealService.exportMeals).mockResolvedValue([
      { name: "Tacos", description: null, difficulty: "EASY", ingredients: [] },
    ] as never);
    const res = buildFullRes();
    await handler(req({ params: { familyId: FAMILY_ID } }), res, buildNext());
    expect(res.statusCode).toBe(200);
    expect(mealService.exportMeals).toHaveBeenCalledWith(FAMILY_ID);
    expect((res.body as { meals: unknown[] }).meals).toHaveLength(1);
  });

  it("500s when the service throws", async () => {
    vi.mocked(mealService.exportMeals).mockRejectedValue(new Error("db"));
    const res = buildFullRes();
    await handler(req({ params: { familyId: FAMILY_ID } }), res, buildNext());
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: "Failed to export meals" });
  });
});

describe("GET /:familyId/meals/:mealId (detail)", () => {
  const handler = getRouteHandler(
    mealsRouter,
    "get",
    "/:familyId/meals/:mealId",
  );

  it("200s with the meal", async () => {
    vi.mocked(mealService.getMealById).mockResolvedValue({
      id: MEAL_ID,
    } as never);
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID, mealId: MEAL_ID } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(200);
  });

  it("404s when the meal is not found", async () => {
    vi.mocked(mealService.getMealById).mockResolvedValue(null as never);
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID, mealId: MEAL_ID } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: "Meal not found" });
  });

  it("500s when the service throws", async () => {
    vi.mocked(mealService.getMealById).mockRejectedValue(new Error("db"));
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID, mealId: MEAL_ID } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(500);
  });
});

describe("PUT /:familyId/meals/:mealId (update)", () => {
  const handler = getRouteHandler(
    mealsRouter,
    "put",
    "/:familyId/meals/:mealId",
  );

  const params = { familyId: FAMILY_ID, mealId: MEAL_ID };

  it("200s with the updated meal", async () => {
    vi.mocked(mealService.updateMeal).mockResolvedValue({
      id: MEAL_ID,
    } as never);
    const res = buildFullRes();
    await handler(req({ params, body: { name: "New" } }), res, buildNext());
    expect(res.statusCode).toBe(200);
  });

  it("400s on Zod failure (empty name)", async () => {
    const res = buildFullRes();
    await handler(req({ params, body: { name: "" } }), res, buildNext());
    expect(res.statusCode).toBe(400);
  });

  it("404s when the service reports the meal is missing", async () => {
    vi.mocked(mealService.updateMeal).mockRejectedValue(
      new Error("Meal not found"),
    );
    const res = buildFullRes();
    await handler(req({ params, body: { name: "New" } }), res, buildNext());
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: "Meal not found" });
  });

  it("500s on an unexpected error", async () => {
    vi.mocked(mealService.updateMeal).mockRejectedValue(new Error("db"));
    const res = buildFullRes();
    await handler(req({ params, body: { name: "New" } }), res, buildNext());
    expect(res.statusCode).toBe(500);
  });
});

describe("DELETE /:familyId/meals/:mealId (parents only)", () => {
  const handler = getRouteHandler(
    mealsRouter,
    "delete",
    "/:familyId/meals/:mealId",
  );

  const params = { familyId: FAMILY_ID, mealId: MEAL_ID };

  it("204s on success", async () => {
    vi.mocked(mealService.deleteMeal).mockResolvedValue(undefined as never);
    const res = buildFullRes();
    await handler(req({ params }), res, buildNext());
    expect(res.statusCode).toBe(204);
  });

  it("404s when the meal is missing", async () => {
    vi.mocked(mealService.deleteMeal).mockRejectedValue(
      new Error("Meal not found"),
    );
    const res = buildFullRes();
    await handler(req({ params }), res, buildNext());
    expect(res.statusCode).toBe(404);
  });

  it("409s when the meal still has approved suggestions", async () => {
    vi.mocked(mealService.deleteMeal).mockRejectedValue(
      new Error("Cannot delete meal with approved suggestions"),
    );
    const res = buildFullRes();
    await handler(req({ params }), res, buildNext());
    expect(res.statusCode).toBe(409);
    expect((res.body as { error: string }).error).toContain(
      "approved suggestions",
    );
  });

  it("500s on an unexpected error", async () => {
    vi.mocked(mealService.deleteMeal).mockRejectedValue(new Error("db"));
    const res = buildFullRes();
    await handler(req({ params }), res, buildNext());
    expect(res.statusCode).toBe(500);
  });
});
