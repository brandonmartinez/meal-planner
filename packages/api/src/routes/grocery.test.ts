import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../../tests/helpers/prisma.js";
import { buildReq, buildNext } from "../../tests/helpers/express.js";
import { getRouteHandler, buildFullRes } from "../../tests/helpers/router.js";

vi.mock("../config/database.js", () => ({ default: prismaMock }));
vi.mock("../services/grocery.js", () => {
  class GroceryError extends Error {
    constructor(
      public readonly status: number,
      message: string,
    ) {
      super(message);
      this.name = "GroceryError";
    }
  }
  return {
    GroceryError,
    generateGroceryList: vi.fn(),
    getGroceryList: vi.fn(),
    getGroceryListByWeek: vi.fn(),
    toggleItem: vi.fn(),
    addCustomItem: vi.fn(),
    removeItem: vi.fn(),
  };
});

const { groceryRouter } = await import("./grocery.js");
const groceryService = await import("../services/grocery.js");
const { GroceryError } = groceryService;

const FAMILY_ID = "fam-1";
const WEEK = "2026-05-04";
const LIST_ID = "list-1";
const ITEM_ID = "item-1";

function req(over: Record<string, unknown> = {}) {
  return buildReq({ user: { id: "user-1" } as never, ...over });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /:familyId/weeks/:weekStart/grocery (generate)", () => {
  const handler = getRouteHandler(
    groceryRouter,
    "post",
    "/:familyId/weeks/:weekStart/grocery",
  );

  it("201s with the generated list", async () => {
    vi.mocked(groceryService.generateGroceryList).mockResolvedValue({
      id: LIST_ID,
    } as never);
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID, weekStart: WEEK } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(201);
  });

  it("500s when the service throws", async () => {
    vi.mocked(groceryService.generateGroceryList).mockRejectedValue(
      new Error("db"),
    );
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID, weekStart: WEEK } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: "Failed to generate grocery list" });
  });
});

describe("GET /:familyId/weeks/:weekStart/grocery (by week)", () => {
  const handler = getRouteHandler(
    groceryRouter,
    "get",
    "/:familyId/weeks/:weekStart/grocery",
  );

  it("200s with the list", async () => {
    vi.mocked(groceryService.getGroceryListByWeek).mockResolvedValue({
      id: LIST_ID,
    } as never);
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID, weekStart: WEEK } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(200);
  });

  it("404s when there is no list for the week", async () => {
    vi.mocked(groceryService.getGroceryListByWeek).mockResolvedValue(
      null as never,
    );
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID, weekStart: WEEK } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: "Grocery list not found" });
  });

  it("500s when the service throws", async () => {
    vi.mocked(groceryService.getGroceryListByWeek).mockRejectedValue(
      new Error("db"),
    );
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID, weekStart: WEEK } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(500);
  });
});

describe("GET /:familyId/grocery/:listId (by id)", () => {
  const handler = getRouteHandler(
    groceryRouter,
    "get",
    "/:familyId/grocery/:listId",
  );

  it("404s when the list is not found", async () => {
    vi.mocked(groceryService.getGroceryList).mockResolvedValue(null as never);
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID, listId: LIST_ID } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(404);
  });

  it("200s with the list", async () => {
    vi.mocked(groceryService.getGroceryList).mockResolvedValue({
      id: LIST_ID,
    } as never);
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID, listId: LIST_ID } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(200);
  });
});

describe("PATCH /:familyId/grocery/:listId/items/:itemId (toggle)", () => {
  const handler = getRouteHandler(
    groceryRouter,
    "patch",
    "/:familyId/grocery/:listId/items/:itemId",
  );

  const params = { familyId: FAMILY_ID, listId: LIST_ID, itemId: ITEM_ID };

  it("200s and forwards the checked flag", async () => {
    vi.mocked(groceryService.toggleItem).mockResolvedValue({
      id: ITEM_ID,
      checked: true,
    } as never);
    const res = buildFullRes();
    await handler(req({ params, body: { checked: true } }), res, buildNext());
    expect(res.statusCode).toBe(200);
    expect(groceryService.toggleItem).toHaveBeenCalledWith(
      FAMILY_ID,
      LIST_ID,
      ITEM_ID,
      true,
    );
  });

  it("400s when `checked` is not a boolean", async () => {
    const res = buildFullRes();
    await handler(
      req({ params, body: { checked: "yes" } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(400);
    expect(groceryService.toggleItem).not.toHaveBeenCalled();
  });

  it("maps a GroceryError to its own status code", async () => {
    vi.mocked(groceryService.toggleItem).mockRejectedValue(
      new GroceryError(404, "Item not found"),
    );
    const res = buildFullRes();
    await handler(req({ params, body: { checked: true } }), res, buildNext());
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: "Item not found" });
  });

  it("500s on an unexpected error", async () => {
    vi.mocked(groceryService.toggleItem).mockRejectedValue(new Error("db"));
    const res = buildFullRes();
    await handler(req({ params, body: { checked: true } }), res, buildNext());
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: "Failed to toggle item" });
  });
});

describe("POST /:familyId/grocery/:listId/items (add custom)", () => {
  const handler = getRouteHandler(
    groceryRouter,
    "post",
    "/:familyId/grocery/:listId/items",
  );

  const params = { familyId: FAMILY_ID, listId: LIST_ID };

  it("201s with the created item", async () => {
    vi.mocked(groceryService.addCustomItem).mockResolvedValue({
      id: ITEM_ID,
    } as never);
    const res = buildFullRes();
    await handler(
      req({ params, body: { name: "Milk" } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(201);
  });

  it("400s on Zod failure (missing name)", async () => {
    const res = buildFullRes();
    await handler(req({ params, body: {} }), res, buildNext());
    expect(res.statusCode).toBe(400);
    expect(groceryService.addCustomItem).not.toHaveBeenCalled();
  });

  it("maps a GroceryError to its own status code", async () => {
    vi.mocked(groceryService.addCustomItem).mockRejectedValue(
      new GroceryError(404, "List not found"),
    );
    const res = buildFullRes();
    await handler(req({ params, body: { name: "Milk" } }), res, buildNext());
    expect(res.statusCode).toBe(404);
  });
});

describe("DELETE /:familyId/grocery/:listId/items/:itemId (remove)", () => {
  const handler = getRouteHandler(
    groceryRouter,
    "delete",
    "/:familyId/grocery/:listId/items/:itemId",
  );

  const params = { familyId: FAMILY_ID, listId: LIST_ID, itemId: ITEM_ID };

  it("204s on success", async () => {
    vi.mocked(groceryService.removeItem).mockResolvedValue(undefined as never);
    const res = buildFullRes();
    await handler(req({ params }), res, buildNext());
    expect(res.statusCode).toBe(204);
  });

  it("maps a GroceryError to its own status code", async () => {
    vi.mocked(groceryService.removeItem).mockRejectedValue(
      new GroceryError(404, "Item not found"),
    );
    const res = buildFullRes();
    await handler(req({ params }), res, buildNext());
    expect(res.statusCode).toBe(404);
  });

  it("500s on an unexpected error", async () => {
    vi.mocked(groceryService.removeItem).mockRejectedValue(new Error("db"));
    const res = buildFullRes();
    await handler(req({ params }), res, buildNext());
    expect(res.statusCode).toBe(500);
  });
});
