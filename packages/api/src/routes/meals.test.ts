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
vi.mock("../services/taxonomy.js", () => ({
  listTags: vi.fn(),
  createTag: vi.fn(),
  deleteTag: vi.fn(),
  listCategories: vi.fn(),
  createCategory: vi.fn(),
  deleteCategory: vi.fn(),
}));
vi.mock("../services/recipeCollections.js", () => ({
  listCollections: vi.fn(),
  createCollection: vi.fn(),
  getCollection: vi.fn(),
  updateCollection: vi.fn(),
  deleteCollection: vi.fn(),
  setCollectionMeals: vi.fn(),
}));

const { mealsRouter } = await import("./meals.js");
const mealService = await import("../services/meals.js");
const taxonomyService = await import("../services/taxonomy.js");
const collectionService = await import("../services/recipeCollections.js");

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

  it("200s and returns envelope shape, forwarding the optional search filter", async () => {
    const envelope = {
      items: [{ id: MEAL_ID, name: "Tacos", _count: { ingredients: 0 }, recentlyScheduled: false, lastScheduledOn: null, lastCookedOn: null }],
      total: 1,
      limit: 25,
      offset: 0,
      hasMore: false,
    };
    vi.mocked(mealService.listMeals).mockResolvedValue(envelope as never);
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID }, query: { search: "taco" } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(200);
    expect(mealService.listMeals).toHaveBeenCalledWith(FAMILY_ID, {
      search: "taco",
      sort: "name",
      order: "asc",
      limit: 25,
      offset: 0,
    });
    const body = res.body as typeof envelope;
    expect(body.items).toHaveLength(1);
    expect(body.total).toBe(1);
    expect(body.hasMore).toBe(false);
  });

  it("forwards the recent-scheduling and cook-history fields in the response body", async () => {
    vi.mocked(mealService.listMeals).mockResolvedValue({
      items: [
        {
          id: MEAL_ID,
          name: "Tacos",
          _count: { ingredients: 2 },
          recentlyScheduled: true,
          lastScheduledOn: "2026-06-30",
          lastCookedOn: "2026-06-15",
          timesCooked: 4,
        },
      ],
      total: 1,
      limit: 25,
      offset: 0,
      hasMore: false,
    } as never);
    const res = buildFullRes();
    await handler(req({ params: { familyId: FAMILY_ID } }), res, buildNext());
    expect(res.statusCode).toBe(200);
    const body = res.body as {
      items: Array<{
        recentlyScheduled: boolean;
        lastScheduledOn: string | null;
        lastCookedOn: string | null;
        timesCooked: number;
      }>;
    };
    expect(body.items[0].recentlyScheduled).toBe(true);
    expect(body.items[0].lastScheduledOn).toBe("2026-06-30");
    expect(body.items[0].lastCookedOn).toBe("2026-06-15");
    expect(body.items[0].timesCooked).toBe(4);
  });

  it("400s when limit exceeds 100", async () => {
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID }, query: { limit: "999" } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(400);
    expect(mealService.listMeals).not.toHaveBeenCalled();
  });

  it("400s when offset is negative", async () => {
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID }, query: { offset: "-1" } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(400);
    expect(mealService.listMeals).not.toHaveBeenCalled();
  });

  it("forwards tag/category filters through to the service", async () => {
    const envelope = {
      items: [],
      total: 0,
      limit: 25,
      offset: 0,
      hasMore: false,
    };
    vi.mocked(mealService.listMeals).mockResolvedValue(envelope as never);
    const res = buildFullRes();
    await handler(
      req({
        params: { familyId: FAMILY_ID },
        query: { tags: ["Quick", "Vegetarian"], categories: ["Dinner"] },
      }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(200);
    expect(mealService.listMeals).toHaveBeenCalledWith(
      FAMILY_ID,
      expect.objectContaining({
        tags: ["Quick", "Vegetarian"],
        categories: ["Dinner"],
      }),
    );
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

  it("forwards core metadata through to the service", async () => {
    vi.mocked(mealService.createMeal).mockResolvedValue({
      id: MEAL_ID,
    } as never);
    const res = buildFullRes();
    await handler(
      req({
        params: { familyId: FAMILY_ID },
        body: {
          name: "Tacos",
          prepTimeMinutes: 10,
          cookTimeMinutes: 20,
          servings: 4,
          sourceUrl: "https://example.com/tacos",
          notes: "Use fresh cilantro",
        },
      }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(201);
    expect(mealService.createMeal).toHaveBeenCalledWith(
      FAMILY_ID,
      expect.objectContaining({
        prepTimeMinutes: 10,
        cookTimeMinutes: 20,
        servings: 4,
        sourceUrl: "https://example.com/tacos",
        notes: "Use fresh cilantro",
      }),
    );
  });

  it("forwards tag/category name lists through to the service", async () => {
    vi.mocked(mealService.createMeal).mockResolvedValue({
      id: MEAL_ID,
    } as never);
    const res = buildFullRes();
    await handler(
      req({
        params: { familyId: FAMILY_ID },
        body: {
          name: "Tacos",
          tags: ["Quick", "Vegetarian"],
          categories: ["Dinner"],
        },
      }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(201);
    expect(mealService.createMeal).toHaveBeenCalledWith(
      FAMILY_ID,
      expect.objectContaining({
        tags: ["Quick", "Vegetarian"],
        categories: ["Dinner"],
      }),
    );
  });

  it("forwards ordered instructions through to the service (#100)", async () => {
    vi.mocked(mealService.createMeal).mockResolvedValue({
      id: MEAL_ID,
    } as never);
    const res = buildFullRes();
    await handler(
      req({
        params: { familyId: FAMILY_ID },
        body: {
          name: "Tacos",
          instructions: [
            { text: "Warm the tortillas" },
            { text: "Assemble", timerMinutes: 2 },
          ],
        },
      }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(201);
    expect(mealService.createMeal).toHaveBeenCalledWith(
      FAMILY_ID,
      expect.objectContaining({
        instructions: [
          { text: "Warm the tortillas" },
          { text: "Assemble", timerMinutes: 2 },
        ],
      }),
    );
  });

  it("400s on an instruction step with empty text (#100)", async () => {
    const res = buildFullRes();
    await handler(
      req({
        params: { familyId: FAMILY_ID },
        body: { name: "Tacos", instructions: [{ text: "" }] },
      }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(400);
    expect(mealService.createMeal).not.toHaveBeenCalled();
  });

  it("400s on an invalid sourceUrl", async () => {
    const res = buildFullRes();
    await handler(
      req({
        params: { familyId: FAMILY_ID },
        body: { name: "Tacos", sourceUrl: "not-a-url" },
      }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(400);
    expect(mealService.createMeal).not.toHaveBeenCalled();
  });

  it("400s on a negative servings value", async () => {
    const res = buildFullRes();
    await handler(
      req({
        params: { familyId: FAMILY_ID },
        body: { name: "Tacos", servings: 0 },
      }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(400);
    expect(mealService.createMeal).not.toHaveBeenCalled();
  });

  it("forwards favorite and rating through to the service", async () => {
    vi.mocked(mealService.createMeal).mockResolvedValue({
      id: MEAL_ID,
    } as never);
    const res = buildFullRes();
    await handler(
      req({
        params: { familyId: FAMILY_ID },
        body: { name: "Tacos", favorite: true, rating: 5 },
      }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(201);
    expect(mealService.createMeal).toHaveBeenCalledWith(
      FAMILY_ID,
      expect.objectContaining({ favorite: true, rating: 5 }),
    );
  });

  it("400s on an out-of-range rating", async () => {
    const res = buildFullRes();
    await handler(
      req({
        params: { familyId: FAMILY_ID },
        body: { name: "Tacos", rating: 6 },
      }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(400);
    expect(mealService.createMeal).not.toHaveBeenCalled();
  });

  it("forwards a valid https imageUrl through to the service (#103)", async () => {
    vi.mocked(mealService.createMeal).mockResolvedValue({
      id: MEAL_ID,
    } as never);
    const res = buildFullRes();
    await handler(
      req({
        params: { familyId: FAMILY_ID },
        body: { name: "Tacos", imageUrl: "https://cdn.example.com/tacos.jpg" },
      }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(201);
    expect(mealService.createMeal).toHaveBeenCalledWith(
      FAMILY_ID,
      expect.objectContaining({ imageUrl: "https://cdn.example.com/tacos.jpg" }),
    );
  });

  it("400s on a non-http(s) imageUrl scheme (#103)", async () => {
    const res = buildFullRes();
    await handler(
      req({
        params: { familyId: FAMILY_ID },
        body: { name: "Tacos", imageUrl: "javascript:alert(1)" },
      }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(400);
    expect(mealService.createMeal).not.toHaveBeenCalled();
  });

  it("400s on a malformed imageUrl (#103)", async () => {
    const res = buildFullRes();
    await handler(
      req({
        params: { familyId: FAMILY_ID },
        body: { name: "Tacos", imageUrl: "not-a-url" },
      }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(400);
    expect(mealService.createMeal).not.toHaveBeenCalled();
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

  it("forwards a valid imageUrl through to the service (#103)", async () => {
    vi.mocked(mealService.importMeals).mockResolvedValue({
      created: 1,
    } as never);
    const res = buildFullRes();
    await handler(
      req({
        params: { familyId: FAMILY_ID },
        body: {
          meals: [
            { name: "Tacos", imageUrl: "https://cdn.example.com/tacos.jpg" },
          ],
        },
      }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(200);
    expect(mealService.importMeals).toHaveBeenCalledWith(
      FAMILY_ID,
      [{ name: "Tacos", imageUrl: "https://cdn.example.com/tacos.jpg" }],
      { mode: undefined },
    );
  });

  it("400s on a non-http(s) imageUrl in a meal row (#103)", async () => {
    const res = buildFullRes();
    await handler(
      req({
        params: { familyId: FAMILY_ID },
        body: { meals: [{ name: "Tacos", imageUrl: "file:///etc/passwd" }] },
      }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(400);
    expect(mealService.importMeals).not.toHaveBeenCalled();
  });

  it("forwards ordered instructions in a meal row through to the service (#100)", async () => {
    vi.mocked(mealService.importMeals).mockResolvedValue({
      created: 1,
    } as never);
    const res = buildFullRes();
    await handler(
      req({
        params: { familyId: FAMILY_ID },
        body: {
          meals: [
            {
              name: "Tacos",
              instructions: [{ text: "Warm" }, { text: "Assemble" }],
            },
          ],
        },
      }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(200);
    expect(mealService.importMeals).toHaveBeenCalledWith(
      FAMILY_ID,
      [
        {
          name: "Tacos",
          instructions: [{ text: "Warm" }, { text: "Assemble" }],
        },
      ],
      { mode: undefined },
    );
  });

  it("400s on an instruction step with empty text in a meal row (#100)", async () => {
    const res = buildFullRes();
    await handler(
      req({
        params: { familyId: FAMILY_ID },
        body: { meals: [{ name: "Tacos", instructions: [{ text: "" }] }] },
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

  it("forwards core metadata and null-clearing through to the service", async () => {
    vi.mocked(mealService.updateMeal).mockResolvedValue({
      id: MEAL_ID,
    } as never);
    const res = buildFullRes();
    await handler(
      req({
        params,
        body: {
          prepTimeMinutes: 15,
          cookTimeMinutes: null,
          servings: 6,
          sourceUrl: "https://example.com/stew",
          notes: null,
        },
      }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(200);
    expect(mealService.updateMeal).toHaveBeenCalledWith(
      MEAL_ID,
      FAMILY_ID,
      expect.objectContaining({
        prepTimeMinutes: 15,
        cookTimeMinutes: null,
        servings: 6,
        sourceUrl: "https://example.com/stew",
        notes: null,
      }),
    );
  });

  it("400s on a malformed sourceUrl", async () => {
    const res = buildFullRes();
    await handler(
      req({ params, body: { sourceUrl: "not-a-url" } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(400);
    expect(mealService.updateMeal).not.toHaveBeenCalled();
  });

  it("forwards favorite and null-clears rating through to the service", async () => {
    vi.mocked(mealService.updateMeal).mockResolvedValue({
      id: MEAL_ID,
    } as never);
    const res = buildFullRes();
    await handler(
      req({ params, body: { favorite: false, rating: null } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(200);
    expect(mealService.updateMeal).toHaveBeenCalledWith(
      MEAL_ID,
      FAMILY_ID,
      expect.objectContaining({ favorite: false, rating: null }),
    );
  });

  it("forwards tag/category name lists through to the service", async () => {
    vi.mocked(mealService.updateMeal).mockResolvedValue({
      id: MEAL_ID,
    } as never);
    const res = buildFullRes();
    await handler(
      req({
        params,
        body: { tags: ["Quick"], categories: [] },
      }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(200);
    expect(mealService.updateMeal).toHaveBeenCalledWith(
      MEAL_ID,
      FAMILY_ID,
      expect.objectContaining({ tags: ["Quick"], categories: [] }),
    );
  });

  it("forwards a replacement instruction list through to the service (#100)", async () => {
    vi.mocked(mealService.updateMeal).mockResolvedValue({
      id: MEAL_ID,
    } as never);
    const res = buildFullRes();
    await handler(
      req({
        params,
        body: {
          instructions: [
            { text: "First" },
            { text: "Second", timerMinutes: 5 },
          ],
        },
      }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(200);
    expect(mealService.updateMeal).toHaveBeenCalledWith(
      MEAL_ID,
      FAMILY_ID,
      expect.objectContaining({
        instructions: [
          { text: "First" },
          { text: "Second", timerMinutes: 5 },
        ],
      }),
    );
  });

  it("forwards an empty instruction list to clear all steps (#100)", async () => {
    vi.mocked(mealService.updateMeal).mockResolvedValue({
      id: MEAL_ID,
    } as never);
    const res = buildFullRes();
    await handler(
      req({ params, body: { instructions: [] } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(200);
    expect(mealService.updateMeal).toHaveBeenCalledWith(
      MEAL_ID,
      FAMILY_ID,
      expect.objectContaining({ instructions: [] }),
    );
  });

  it("400s on an instruction step with empty text (#100)", async () => {
    const res = buildFullRes();
    await handler(
      req({ params, body: { instructions: [{ text: "" }] } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(400);
    expect(mealService.updateMeal).not.toHaveBeenCalled();
  });

  it("400s on a rating below the minimum", async () => {
    const res = buildFullRes();
    await handler(
      req({ params, body: { rating: 0 } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(400);
    expect(mealService.updateMeal).not.toHaveBeenCalled();
  });

  it("forwards imageUrl and null-clearing through to the service (#103)", async () => {
    vi.mocked(mealService.updateMeal).mockResolvedValue({
      id: MEAL_ID,
    } as never);
    const res = buildFullRes();
    await handler(
      req({ params, body: { imageUrl: "https://cdn.example.com/stew.png" } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(200);
    expect(mealService.updateMeal).toHaveBeenCalledWith(
      MEAL_ID,
      FAMILY_ID,
      expect.objectContaining({ imageUrl: "https://cdn.example.com/stew.png" }),
    );

    vi.mocked(mealService.updateMeal).mockClear();
    const res2 = buildFullRes();
    await handler(
      req({ params, body: { imageUrl: null } }),
      res2,
      buildNext(),
    );
    expect(res2.statusCode).toBe(200);
    expect(mealService.updateMeal).toHaveBeenCalledWith(
      MEAL_ID,
      FAMILY_ID,
      expect.objectContaining({ imageUrl: null }),
    );
  });

  it("400s on a non-http(s) imageUrl scheme (#103)", async () => {
    const res = buildFullRes();
    await handler(
      req({ params, body: { imageUrl: "ftp://example.com/x.png" } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(400);
    expect(mealService.updateMeal).not.toHaveBeenCalled();
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

// ---------------------------------------------------------------------------
// Taxonomy routes (tags + categories). Family-scoped: every handler must pass
// the path :familyId straight through to the service so one family can never
// read or mutate another's taxonomy (IDOR / #9).
// ---------------------------------------------------------------------------

describe("GET /:familyId/tags (list)", () => {
  const handler = getRouteHandler(mealsRouter, "get", "/:familyId/tags");

  it("200s with the family's tags, scoped by :familyId", async () => {
    vi.mocked(taxonomyService.listTags).mockResolvedValue([
      { id: "t-1", name: "Quick", familyId: FAMILY_ID },
    ] as never);
    const res = buildFullRes();
    await handler(req({ params: { familyId: FAMILY_ID } }), res, buildNext());
    expect(res.statusCode).toBe(200);
    expect(taxonomyService.listTags).toHaveBeenCalledWith(FAMILY_ID);
    expect((res.body as { tags: unknown[] }).tags).toHaveLength(1);
  });

  it("500s when the service throws", async () => {
    vi.mocked(taxonomyService.listTags).mockRejectedValue(new Error("db"));
    const res = buildFullRes();
    await handler(req({ params: { familyId: FAMILY_ID } }), res, buildNext());
    expect(res.statusCode).toBe(500);
  });
});

describe("POST /:familyId/tags (create)", () => {
  const handler = getRouteHandler(mealsRouter, "post", "/:familyId/tags");

  it("201s and creates the tag scoped to :familyId", async () => {
    vi.mocked(taxonomyService.createTag).mockResolvedValue({
      id: "t-1",
      name: "Quick",
      familyId: FAMILY_ID,
    } as never);
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID }, body: { name: "Quick" } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(201);
    expect(taxonomyService.createTag).toHaveBeenCalledWith(FAMILY_ID, "Quick");
  });

  it("400s on an empty name (Zod)", async () => {
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID }, body: { name: "   " } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(400);
    expect(taxonomyService.createTag).not.toHaveBeenCalled();
  });

  it("500s when the service throws", async () => {
    vi.mocked(taxonomyService.createTag).mockRejectedValue(new Error("db"));
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID }, body: { name: "Quick" } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(500);
  });
});

describe("DELETE /:familyId/tags/:tagId", () => {
  const handler = getRouteHandler(
    mealsRouter,
    "delete",
    "/:familyId/tags/:tagId",
  );

  it("204s and deletes the tag scoped to :familyId (IDOR guard)", async () => {
    vi.mocked(taxonomyService.deleteTag).mockResolvedValue(undefined as never);
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID, tagId: "t-1" } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(204);
    expect(taxonomyService.deleteTag).toHaveBeenCalledWith(FAMILY_ID, "t-1");
  });

  it("404s when the tag is not found in this family", async () => {
    vi.mocked(taxonomyService.deleteTag).mockRejectedValue(
      new Error("Tag not found"),
    );
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID, tagId: "t-x" } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: "Tag not found" });
  });
});

describe("GET /:familyId/categories (list)", () => {
  const handler = getRouteHandler(mealsRouter, "get", "/:familyId/categories");

  it("200s with the family's categories, scoped by :familyId", async () => {
    vi.mocked(taxonomyService.listCategories).mockResolvedValue([
      { id: "c-1", name: "Dinner", familyId: FAMILY_ID },
    ] as never);
    const res = buildFullRes();
    await handler(req({ params: { familyId: FAMILY_ID } }), res, buildNext());
    expect(res.statusCode).toBe(200);
    expect(taxonomyService.listCategories).toHaveBeenCalledWith(FAMILY_ID);
    expect((res.body as { categories: unknown[] }).categories).toHaveLength(1);
  });
});

describe("POST /:familyId/categories (create)", () => {
  const handler = getRouteHandler(mealsRouter, "post", "/:familyId/categories");

  it("201s and creates the category scoped to :familyId", async () => {
    vi.mocked(taxonomyService.createCategory).mockResolvedValue({
      id: "c-1",
      name: "Dinner",
      familyId: FAMILY_ID,
    } as never);
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID }, body: { name: "Dinner" } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(201);
    expect(taxonomyService.createCategory).toHaveBeenCalledWith(
      FAMILY_ID,
      "Dinner",
    );
  });

  it("400s on an empty name (Zod)", async () => {
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID }, body: { name: "" } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(400);
    expect(taxonomyService.createCategory).not.toHaveBeenCalled();
  });
});

describe("DELETE /:familyId/categories/:categoryId", () => {
  const handler = getRouteHandler(
    mealsRouter,
    "delete",
    "/:familyId/categories/:categoryId",
  );

  it("204s and deletes the category scoped to :familyId (IDOR guard)", async () => {
    vi.mocked(taxonomyService.deleteCategory).mockResolvedValue(
      undefined as never,
    );
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID, categoryId: "c-1" } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(204);
    expect(taxonomyService.deleteCategory).toHaveBeenCalledWith(
      FAMILY_ID,
      "c-1",
    );
  });

  it("404s when the category is not found in this family", async () => {
    vi.mocked(taxonomyService.deleteCategory).mockRejectedValue(
      new Error("Category not found"),
    );
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID, categoryId: "c-x" } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: "Category not found" });
  });
});

// Recipe collections (issue #109). Curated, family-scoped lists. These route
// tests mirror the tags/categories suite above but add explicit cross-family
// (IDOR) coverage: a member of Family A must never read, mutate, or delete a
// collection owned by Family B — the service resolves such attempts to a 404.
describe("GET /:familyId/collections (list)", () => {
  const handler = getRouteHandler(mealsRouter, "get", "/:familyId/collections");

  it("200s with the family's collections, scoped by :familyId", async () => {
    vi.mocked(collectionService.listCollections).mockResolvedValue([
      { id: "col-1", name: "Weeknight Dinners", familyId: FAMILY_ID },
    ] as never);
    const res = buildFullRes();
    await handler(req({ params: { familyId: FAMILY_ID } }), res, buildNext());
    expect(res.statusCode).toBe(200);
    expect(collectionService.listCollections).toHaveBeenCalledWith(FAMILY_ID);
    expect((res.body as { collections: unknown[] }).collections).toHaveLength(1);
  });

  it("500s when the service throws", async () => {
    vi.mocked(collectionService.listCollections).mockRejectedValue(
      new Error("db"),
    );
    const res = buildFullRes();
    await handler(req({ params: { familyId: FAMILY_ID } }), res, buildNext());
    expect(res.statusCode).toBe(500);
  });
});

describe("POST /:familyId/collections (create)", () => {
  const handler = getRouteHandler(
    mealsRouter,
    "post",
    "/:familyId/collections",
  );

  it("201s and creates the collection scoped to :familyId", async () => {
    vi.mocked(collectionService.createCollection).mockResolvedValue({
      id: "col-1",
      name: "Weeknight Dinners",
      familyId: FAMILY_ID,
    } as never);
    const res = buildFullRes();
    await handler(
      req({
        params: { familyId: FAMILY_ID },
        body: { name: "Weeknight Dinners", description: "Fast meals" },
      }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(201);
    expect(collectionService.createCollection).toHaveBeenCalledWith(
      FAMILY_ID,
      "Weeknight Dinners",
      "Fast meals",
    );
  });

  it("201s with description omitted (optional)", async () => {
    vi.mocked(collectionService.createCollection).mockResolvedValue({
      id: "col-1",
      name: "Weeknight Dinners",
      familyId: FAMILY_ID,
    } as never);
    const res = buildFullRes();
    await handler(
      req({
        params: { familyId: FAMILY_ID },
        body: { name: "Weeknight Dinners" },
      }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(201);
    expect(collectionService.createCollection).toHaveBeenCalledWith(
      FAMILY_ID,
      "Weeknight Dinners",
      undefined,
    );
  });

  it("400s on an empty name (Zod)", async () => {
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID }, body: { name: "   " } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(400);
    expect(collectionService.createCollection).not.toHaveBeenCalled();
  });

  it("201s when mealIds is provided (creates + sets membership)", async () => {
    vi.mocked(collectionService.createCollection).mockResolvedValue({
      id: "col-1",
      name: "Weeknight Dinners",
      familyId: FAMILY_ID,
    } as never);
    vi.mocked(collectionService.setCollectionMeals).mockResolvedValue(
      undefined,
    );
    const res = buildFullRes();
    await handler(
      req({
        params: { familyId: FAMILY_ID },
        body: { name: "Weeknight Dinners", mealIds: ["meal-1", "meal-2"] },
      }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(201);
    expect(collectionService.setCollectionMeals).toHaveBeenCalledWith(
      FAMILY_ID,
      "col-1",
      ["meal-1", "meal-2"],
    );
  });

  it("422s when a mealId belongs to another family", async () => {
    vi.mocked(collectionService.createCollection).mockResolvedValue({
      id: "col-1",
      name: "Weeknight Dinners",
      familyId: FAMILY_ID,
    } as never);
    vi.mocked(collectionService.setCollectionMeals).mockRejectedValue(
      new Error("One or more meals do not belong to this family"),
    );
    const res = buildFullRes();
    await handler(
      req({
        params: { familyId: FAMILY_ID },
        body: { name: "Weeknight Dinners", mealIds: ["foreign-meal"] },
      }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(422);
  });

  it("500s when the service throws", async () => {
    vi.mocked(collectionService.createCollection).mockRejectedValue(
      new Error("db"),
    );
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID }, body: { name: "Weeknight" } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(500);
  });
});

describe("GET /:familyId/collections/:collectionId (detail)", () => {
  const handler = getRouteHandler(
    mealsRouter,
    "get",
    "/:familyId/collections/:collectionId",
  );

  it("200s with the collection when it belongs to the family", async () => {
    vi.mocked(collectionService.getCollection).mockResolvedValue({
      id: "col-1",
      name: "Weeknight Dinners",
      familyId: FAMILY_ID,
    } as never);
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID, collectionId: "col-1" } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(200);
    expect(collectionService.getCollection).toHaveBeenCalledWith(
      FAMILY_ID,
      "col-1",
    );
  });

  it("404s when the collection belongs to another family (IDOR guard)", async () => {
    // Service returns null for a cross-family id → route maps to 404, so a
    // missing collection and another family's collection are indistinguishable.
    vi.mocked(collectionService.getCollection).mockResolvedValue(
      null as never,
    );
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID, collectionId: "col-owned-by-B" } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: "Collection not found" });
  });
});

describe("PATCH /:familyId/collections/:collectionId (update)", () => {
  const handler = getRouteHandler(
    mealsRouter,
    "patch",
    "/:familyId/collections/:collectionId",
  );

  it("200s and updates the collection scoped to :familyId", async () => {
    vi.mocked(collectionService.updateCollection).mockResolvedValue({
      id: "col-1",
      name: "Holiday Baking",
      familyId: FAMILY_ID,
    } as never);
    const res = buildFullRes();
    await handler(
      req({
        params: { familyId: FAMILY_ID, collectionId: "col-1" },
        body: { name: "Holiday Baking" },
      }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(200);
    expect(collectionService.updateCollection).toHaveBeenCalledWith(
      FAMILY_ID,
      "col-1",
      { name: "Holiday Baking" },
    );
  });

  it("400s when neither name nor description is provided (Zod refine)", async () => {
    const res = buildFullRes();
    await handler(
      req({
        params: { familyId: FAMILY_ID, collectionId: "col-1" },
        body: {},
      }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(400);
    expect(collectionService.updateCollection).not.toHaveBeenCalled();
  });

  it("200s when only mealIds is provided (mealIds-only update)", async () => {
    vi.mocked(collectionService.updateCollection).mockResolvedValue({
      id: "col-1",
      name: "Weeknight Dinners",
      familyId: FAMILY_ID,
    } as never);
    vi.mocked(collectionService.setCollectionMeals).mockResolvedValue(
      undefined,
    );
    const res = buildFullRes();
    await handler(
      req({
        params: { familyId: FAMILY_ID, collectionId: "col-1" },
        body: { mealIds: ["meal-1"] },
      }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(200);
    expect(collectionService.setCollectionMeals).toHaveBeenCalledWith(
      FAMILY_ID,
      "col-1",
      ["meal-1"],
    );
  });

  it("200s when mealIds is provided alongside name", async () => {
    vi.mocked(collectionService.updateCollection).mockResolvedValue({
      id: "col-1",
      name: "Renamed",
      familyId: FAMILY_ID,
    } as never);
    vi.mocked(collectionService.setCollectionMeals).mockResolvedValue(
      undefined,
    );
    const res = buildFullRes();
    await handler(
      req({
        params: { familyId: FAMILY_ID, collectionId: "col-1" },
        body: { name: "Renamed", mealIds: ["meal-1", "meal-2"] },
      }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(200);
    expect(collectionService.updateCollection).toHaveBeenCalledWith(
      FAMILY_ID,
      "col-1",
      { name: "Renamed" },
    );
    expect(collectionService.setCollectionMeals).toHaveBeenCalledWith(
      FAMILY_ID,
      "col-1",
      ["meal-1", "meal-2"],
    );
  });

  it("422s when a mealId belongs to another family", async () => {
    vi.mocked(collectionService.updateCollection).mockResolvedValue({
      id: "col-1",
      name: "Weeknight",
      familyId: FAMILY_ID,
    } as never);
    vi.mocked(collectionService.setCollectionMeals).mockRejectedValue(
      new Error("One or more meals do not belong to this family"),
    );
    const res = buildFullRes();
    await handler(
      req({
        params: { familyId: FAMILY_ID, collectionId: "col-1" },
        body: { mealIds: ["foreign-meal"] },
      }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(422);
  });

  it("404s when the collection belongs to another family (IDOR guard)", async () => {
    vi.mocked(collectionService.updateCollection).mockRejectedValue(
      new Error("Collection not found"),
    );
    const res = buildFullRes();
    await handler(
      req({
        params: { familyId: FAMILY_ID, collectionId: "col-owned-by-B" },
        body: { name: "Hijack" },
      }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: "Collection not found" });
  });
});

describe("DELETE /:familyId/collections/:collectionId (parents only)", () => {
  const handler = getRouteHandler(
    mealsRouter,
    "delete",
    "/:familyId/collections/:collectionId",
  );

  it("204s and deletes the collection scoped to :familyId (IDOR guard)", async () => {
    vi.mocked(collectionService.deleteCollection).mockResolvedValue(
      undefined as never,
    );
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID, collectionId: "col-1" } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(204);
    expect(collectionService.deleteCollection).toHaveBeenCalledWith(
      FAMILY_ID,
      "col-1",
    );
  });

  it("404s when the collection belongs to another family", async () => {
    vi.mocked(collectionService.deleteCollection).mockRejectedValue(
      new Error("Collection not found"),
    );
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID, collectionId: "col-owned-by-B" } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: "Collection not found" });
  });
});
