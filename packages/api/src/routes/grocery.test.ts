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
    editItemFields: vi.fn(),
    addCustomItem: vi.fn(),
    removeItem: vi.fn(),
  };
});
vi.mock("../services/groceryCategories.js", () => ({
  listGroceryCategories: vi.fn(),
  listEffectiveGroceryCategories: vi.fn(),
  createGroceryCategory: vi.fn(),
  renameGroceryCategory: vi.fn(),
  deleteGroceryCategory: vi.fn(),
}));

const { groceryRouter } = await import("./grocery.js");
const groceryService = await import("../services/grocery.js");
const { GroceryError } = groceryService;
const groceryCategoryService = await import("../services/groceryCategories.js");

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
    expect(res.body).toEqual({ error: "Failed to update item" });
  });

  it("200s and calls editItemFields when quantity is provided", async () => {
    vi.mocked(groceryService.editItemFields).mockResolvedValue({
      id: ITEM_ID,
      quantity: "3",
    } as never);
    const res = buildFullRes();
    await handler(
      req({ params, body: { quantity: "3", unit: "cups" } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(200);
    expect(groceryService.editItemFields).toHaveBeenCalledWith(
      FAMILY_ID,
      LIST_ID,
      ITEM_ID,
      { quantity: "3", unit: "cups", category: undefined },
    );
    expect(groceryService.toggleItem).not.toHaveBeenCalled();
  });

  it("400s on empty body (no valid field)", async () => {
    const res = buildFullRes();
    await handler(req({ params, body: {} }), res, buildNext());
    expect(res.statusCode).toBe(400);
    expect(groceryService.editItemFields).not.toHaveBeenCalled();
    expect(groceryService.toggleItem).not.toHaveBeenCalled();
  });

  it("maps a GroceryError from editItemFields to its status code", async () => {
    vi.mocked(groceryService.editItemFields).mockRejectedValue(
      new GroceryError(404, "Item not found"),
    );
    const res = buildFullRes();
    await handler(
      req({ params, body: { quantity: "2" } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: "Item not found" });
  });

  it("500s on an unexpected error from editItemFields", async () => {
    vi.mocked(groceryService.editItemFields).mockRejectedValue(new Error("db"));
    const res = buildFullRes();
    await handler(
      req({ params, body: { quantity: "2" } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(500);
  });

  it("calls both toggleItem and editItemFields when body includes checked + quantity", async () => {
    vi.mocked(groceryService.toggleItem).mockResolvedValue({ id: ITEM_ID, checked: true } as never);
    vi.mocked(groceryService.editItemFields).mockResolvedValue({ id: ITEM_ID, quantity: "5" } as never);
    const res = buildFullRes();
    await handler(
      req({ params, body: { checked: true, quantity: "5" } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(200);
    expect(groceryService.toggleItem).toHaveBeenCalled();
    expect(groceryService.editItemFields).toHaveBeenCalled();
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

describe("GET /:familyId/grocery-categories (effective list, #119)", () => {
  const handler = getRouteHandler(
    groceryRouter,
    "get",
    "/:familyId/grocery-categories",
  );
  const params = { familyId: FAMILY_ID };

  it("200s with the effective categories and the custom rows", async () => {
    vi.mocked(
      groceryCategoryService.listEffectiveGroceryCategories,
    ).mockResolvedValue(["produce", "Bulk Bins"] as never);
    vi.mocked(groceryCategoryService.listGroceryCategories).mockResolvedValue([
      { id: "gc-1", name: "Bulk Bins", familyId: FAMILY_ID },
    ] as never);
    const res = buildFullRes();
    await handler(req({ params }), res, buildNext());
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      categories: ["produce", "Bulk Bins"],
      custom: [{ id: "gc-1", name: "Bulk Bins" }],
    });
  });

  it("500s on an unexpected error", async () => {
    vi.mocked(
      groceryCategoryService.listEffectiveGroceryCategories,
    ).mockRejectedValue(new Error("db"));
    const res = buildFullRes();
    await handler(req({ params }), res, buildNext());
    expect(res.statusCode).toBe(500);
  });
});

describe("POST /:familyId/grocery-categories (create, #119)", () => {
  const handler = getRouteHandler(
    groceryRouter,
    "post",
    "/:familyId/grocery-categories",
  );
  const params = { familyId: FAMILY_ID };

  it("201s with the created custom category", async () => {
    vi.mocked(groceryCategoryService.createGroceryCategory).mockResolvedValue({
      id: "gc-2",
      name: "International",
      familyId: FAMILY_ID,
    } as never);
    const res = buildFullRes();
    await handler(
      req({ params, body: { name: "International" } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(201);
    expect(groceryCategoryService.createGroceryCategory).toHaveBeenCalledWith(
      FAMILY_ID,
      "International",
    );
  });

  it("400s on Zod failure (missing name)", async () => {
    const res = buildFullRes();
    await handler(req({ params, body: {} }), res, buildNext());
    expect(res.statusCode).toBe(400);
    expect(groceryCategoryService.createGroceryCategory).not.toHaveBeenCalled();
  });
});

describe("PATCH /:familyId/grocery-categories/:categoryId (rename, #119)", () => {
  const handler = getRouteHandler(
    groceryRouter,
    "patch",
    "/:familyId/grocery-categories/:categoryId",
  );
  const params = { familyId: FAMILY_ID, categoryId: "gc-1" };

  it("200s with the renamed category", async () => {
    vi.mocked(groceryCategoryService.renameGroceryCategory).mockResolvedValue({
      id: "gc-1",
      name: "Bulk & Bins",
      familyId: FAMILY_ID,
    } as never);
    const res = buildFullRes();
    await handler(
      req({ params, body: { name: "Bulk & Bins" } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(200);
    expect(groceryCategoryService.renameGroceryCategory).toHaveBeenCalledWith(
      FAMILY_ID,
      "gc-1",
      "Bulk & Bins",
    );
  });

  it("400s on Zod failure (empty name)", async () => {
    const res = buildFullRes();
    await handler(req({ params, body: { name: "" } }), res, buildNext());
    expect(res.statusCode).toBe(400);
    expect(groceryCategoryService.renameGroceryCategory).not.toHaveBeenCalled();
  });

  it("404s when the category does not exist", async () => {
    vi.mocked(groceryCategoryService.renameGroceryCategory).mockRejectedValue(
      new Error("Grocery category not found"),
    );
    const res = buildFullRes();
    await handler(req({ params, body: { name: "Nope" } }), res, buildNext());
    expect(res.statusCode).toBe(404);
  });

  it("409s on a unique-constraint collision (P2002)", async () => {
    vi.mocked(groceryCategoryService.renameGroceryCategory).mockRejectedValue(
      Object.assign(new Error("dup"), { code: "P2002" }),
    );
    const res = buildFullRes();
    await handler(req({ params, body: { name: "Produce" } }), res, buildNext());
    expect(res.statusCode).toBe(409);
  });
});

describe("DELETE /:familyId/grocery-categories/:categoryId (delete, #119)", () => {
  const handler = getRouteHandler(
    groceryRouter,
    "delete",
    "/:familyId/grocery-categories/:categoryId",
  );
  const params = { familyId: FAMILY_ID, categoryId: "gc-1" };

  it("204s on success", async () => {
    vi.mocked(groceryCategoryService.deleteGroceryCategory).mockResolvedValue(
      undefined as never,
    );
    const res = buildFullRes();
    await handler(req({ params }), res, buildNext());
    expect(res.statusCode).toBe(204);
    expect(groceryCategoryService.deleteGroceryCategory).toHaveBeenCalledWith(
      FAMILY_ID,
      "gc-1",
    );
  });

  it("404s when the category does not exist", async () => {
    vi.mocked(groceryCategoryService.deleteGroceryCategory).mockRejectedValue(
      new Error("Grocery category not found"),
    );
    const res = buildFullRes();
    await handler(req({ params }), res, buildNext());
    expect(res.statusCode).toBe(404);
  });

  it("500s on an unexpected error", async () => {
    vi.mocked(groceryCategoryService.deleteGroceryCategory).mockRejectedValue(
      new Error("db"),
    );
    const res = buildFullRes();
    await handler(req({ params }), res, buildNext());
    expect(res.statusCode).toBe(500);
  });
});
