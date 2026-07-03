import { GrocerySource } from "@prisma/client";
import { describe, it, expect, vi } from "vitest";
import { prismaMock } from "../../tests/helpers/prisma.js";

vi.mock("../config/database.js", () => ({ default: prismaMock }));

const {
  generateGroceryList,
  groceryKey,
  mergeQuantities,
  getGroceryList,
  getGroceryListByWeek,
  toggleItem,
  addCustomItem,
  removeItem,
  editItemFields,
  GroceryError,
} = await import("./grocery.js");

describe("groceryKey", () => {
  it("lowercases name and unit, joins with |", () => {
    expect(groceryKey("Onion", "Cup")).toBe("onion|cup");
    expect(groceryKey("Salt")).toBe("salt|");
  });
});

describe("mergeQuantities", () => {
  it("sums numeric quantities", () => {
    expect(mergeQuantities("1", "2")).toBe("3");
  });

  it("falls back to comma-separated when quantities are not both numeric", async () => {
    expect(mergeQuantities("a pinch", "2")).toBe("a pinch, 2");
  });
});

describe("generateGroceryList", () => {
  it("aggregates ingredients across approved suggestions and dedupes by name+unit", async () => {
    prismaMock.mealSuggestion.findMany.mockResolvedValue([
      {
        meal: {
          id: "meal-1",
          name: "Meal A",
          ingredients: [
            { name: "Onion", quantity: "1", unit: "", category: "produce" },
            { name: "Salt", quantity: "", unit: "tsp", category: "pantry" },
          ],
        },
      },
      {
        meal: {
          id: "meal-2",
          name: "Meal B",
          ingredients: [
            { name: "onion", quantity: "2", unit: "", category: "produce" },
            { name: "Onion", quantity: "1", unit: "cup", category: "produce" },
            { name: "Pepper", quantity: "", unit: "tsp", category: "pantry" },
          ],
        },
      },
    ] as never);
    prismaMock.groceryList.findFirst.mockResolvedValue(null);
    prismaMock.groceryList.create.mockResolvedValue({
      id: "gl-1",
      items: [],
    } as never);

    await generateGroceryList("fam-1", new Date("2026-05-04T00:00:00Z"));

    const arg = prismaMock.groceryList.create.mock.calls[0][0] as {
      data: {
        items: {
          create: {
            name: string;
            quantity: string | null;
            unit: string | null;
          }[];
        };
      };
    };
    const items = arg.data.items.create;
    expect(items).toHaveLength(4);
    const merged = items.find(
      (i) => i.name === "Onion" && (i.unit === null || i.unit === ""),
    );
    expect(merged?.quantity).toBe("3");
  });

  it("creates a fresh list when none exists (no merge needed)", async () => {
    prismaMock.mealSuggestion.findMany.mockResolvedValue([] as never);
    prismaMock.groceryList.findFirst.mockResolvedValue(null);
    prismaMock.groceryList.create.mockResolvedValue({ id: "gl-new", items: [] } as never);

    await generateGroceryList("fam-1", new Date("2026-05-04T00:00:00Z"));

    expect(prismaMock.groceryList.create).toHaveBeenCalled();
    expect(prismaMock.groceryList.delete).not.toHaveBeenCalled();
  });

  it("preserves MANUAL items unchanged during regeneration", async () => {
    prismaMock.mealSuggestion.findMany.mockResolvedValue([] as never);
    prismaMock.groceryList.findFirst.mockResolvedValue({
      id: "gl-1",
      items: [
        {
          id: "item-manual",
          name: "Butter",
          unit: "",
          origin: GrocerySource.MANUAL,
          edited: false,
        },
      ],
    } as never);
    prismaMock.$transaction.mockResolvedValue([]);
    prismaMock.groceryList.findFirst
      .mockResolvedValueOnce({
        id: "gl-1",
        items: [{ id: "item-manual", name: "Butter", unit: "", origin: GrocerySource.MANUAL, edited: false }],
      } as never)
      .mockResolvedValueOnce({ id: "gl-1", items: [] } as never);

    await generateGroceryList("fam-1", new Date("2026-05-04T00:00:00Z"));

    // MANUAL items never appear in transaction ops
    const txOps = prismaMock.$transaction.mock.calls[0][0] as unknown[];
    expect(txOps).toHaveLength(0);
  });

  it("refreshes GENERATED unedited items — keeps ID and checked, updates qty", async () => {
    prismaMock.mealSuggestion.findMany.mockResolvedValue([
      {
        meal: {
          id: "meal-1",
          name: "Tacos",
          ingredients: [{ name: "Beef", quantity: "500", unit: "g", category: "meat" }],
        },
      },
    ] as never);
    prismaMock.groceryList.findFirst
      .mockResolvedValueOnce({
        id: "gl-1",
        items: [
          {
            id: "item-beef",
            name: "Beef",
            unit: "g",
            quantity: "250",
            checked: true,
            origin: GrocerySource.GENERATED,
            edited: false,
          },
        ],
      } as never)
      .mockResolvedValueOnce({ id: "gl-1", items: [] } as never);
    prismaMock.$transaction.mockResolvedValue([]);
    prismaMock.groceryItem.update.mockResolvedValue({} as never);

    await generateGroceryList("fam-1", new Date("2026-05-04T00:00:00Z"));

    const updateCall = prismaMock.groceryItem.update.mock.calls.find(
      (c) => (c[0] as { where: { id: string } }).where.id === "item-beef",
    );
    expect(updateCall).toBeDefined();
    // quantity refreshed; checked NOT in update (preserved via no-touch)
    expect((updateCall![0] as { data: { quantity: string } }).data.quantity).toBe("500");
  });

  it("deletes unedited GENERATED orphaned items", async () => {
    prismaMock.mealSuggestion.findMany.mockResolvedValue([] as never);
    prismaMock.groceryList.findFirst
      .mockResolvedValueOnce({
        id: "gl-1",
        items: [
          {
            id: "item-orphan",
            name: "Flour",
            unit: "cups",
            origin: GrocerySource.GENERATED,
            edited: false,
          },
        ],
      } as never)
      .mockResolvedValueOnce({ id: "gl-1", items: [] } as never);
    prismaMock.$transaction.mockResolvedValue([]);
    prismaMock.groceryItem.delete.mockResolvedValue({} as never);

    await generateGroceryList("fam-1", new Date("2026-05-04T00:00:00Z"));

    expect(prismaMock.groceryItem.delete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "item-orphan" } }),
    );
  });

  it("promotes GENERATED edited orphaned items to MANUAL", async () => {
    prismaMock.mealSuggestion.findMany.mockResolvedValue([] as never);
    prismaMock.groceryList.findFirst
      .mockResolvedValueOnce({
        id: "gl-1",
        items: [
          {
            id: "item-edited",
            name: "Flour",
            unit: "cups",
            origin: GrocerySource.GENERATED,
            edited: true,
          },
        ],
      } as never)
      .mockResolvedValueOnce({ id: "gl-1", items: [] } as never);
    prismaMock.$transaction.mockResolvedValue([]);
    prismaMock.groceryItem.update.mockResolvedValue({} as never);

    await generateGroceryList("fam-1", new Date("2026-05-04T00:00:00Z"));

    expect(prismaMock.groceryItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "item-edited" },
        data: expect.objectContaining({ origin: GrocerySource.MANUAL }),
      }),
    );
  });

  it("never calls groceryList.delete on the existing list", async () => {
    prismaMock.mealSuggestion.findMany.mockResolvedValue([] as never);
    prismaMock.groceryList.findFirst
      .mockResolvedValueOnce({ id: "gl-1", items: [] } as never)
      .mockResolvedValueOnce({ id: "gl-1", items: [] } as never);
    prismaMock.$transaction.mockResolvedValue([]);

    await generateGroceryList("fam-1", new Date("2026-05-04T00:00:00Z"));

    expect(prismaMock.groceryList.delete).not.toHaveBeenCalled();
  });

  it("tracks the source meal names and IDs for each ingredient", async () => {
    prismaMock.mealSuggestion.findMany.mockResolvedValue([
      {
        meal: {
          id: "meal-tacos",
          name: "Tacos",
          ingredients: [
            { name: "Onion", quantity: "1", unit: "", category: "produce" },
          ],
        },
      },
      {
        meal: {
          id: "meal-soup",
          name: "Soup",
          ingredients: [
            { name: "onion", quantity: "2", unit: "", category: "produce" },
            { name: "Carrot", quantity: "3", unit: "", category: "produce" },
          ],
        },
      },
    ] as never);
    prismaMock.groceryList.findFirst.mockResolvedValue(null);
    prismaMock.groceryList.create.mockResolvedValue({ id: "gl" } as never);

    await generateGroceryList("fam-1", new Date("2026-05-04T00:00:00Z"));
    const arg = prismaMock.groceryList.create.mock.calls[0][0] as {
      data: { items: { create: { name: string; sources: string[]; sourceMealIds: string[] }[] } };
    };
    const onion = arg.data.items.create.find(
      (i) => i.name.toLowerCase() === "onion",
    );
    expect(onion?.sources).toContain("Tacos");
    expect(onion?.sources).toContain("Soup");
    expect(onion?.sourceMealIds).toContain("meal-tacos");
    expect(onion?.sourceMealIds).toContain("meal-soup");
  });
});

describe("mergeQuantities — numeric + fraction handling (#120)", () => {
  it("sums decimals and rounds cleanly", () => {
    expect(mergeQuantities("0.1", "0.2")).toBe("0.3");
    expect(mergeQuantities("1.5", "2.25")).toBe("3.75");
  });

  it("sums simple fractions", () => {
    expect(mergeQuantities("1/2", "1/2")).toBe("1");
  });

  it("sums mixed numbers", () => {
    expect(mergeQuantities("1 1/2", "1/2")).toBe("2");
  });

  it("treats a zero denominator as non-numeric (pass-through)", () => {
    expect(mergeQuantities("1/0", "2")).toBe("1/0, 2");
  });

  it("passes non-numeric quantities through without crashing or dropping", () => {
    expect(mergeQuantities("to taste", "1")).toBe("to taste, 1");
  });

  it("collapses identical non-numeric quantities to a single value", () => {
    expect(mergeQuantities("to taste", "to taste")).toBe("to taste");
  });

  it("returns the other operand when one is empty", () => {
    expect(mergeQuantities("", "2")).toBe("2");
    expect(mergeQuantities("3", "")).toBe("3");
  });
});

describe("groceryKey — normalized equivalences (#120)", () => {
  it("folds case and whitespace in names", () => {
    expect(groceryKey("Tomato sauce")).toBe(groceryKey("tomato Sauce"));
    expect(groceryKey("  Olive   Oil ")).toBe(groceryKey("Olive Oil"));
  });

  it("folds unit aliases to a canonical token", () => {
    expect(groceryKey("Flour", "tbsp")).toBe(groceryKey("Flour", "tablespoon"));
    expect(groceryKey("Sugar", "g")).toBe(groceryKey("Sugar", "grams"));
  });

  it("keeps genuinely distinct names apart", () => {
    expect(groceryKey("Tomato")).not.toBe(groceryKey("Tomatoes"));
    expect(groceryKey("Onion")).not.toBe(groceryKey("Garlic"));
  });
});

describe("generateGroceryList — normalization grouping (#120)", () => {
  it("merges case/whitespace name variants into one line, preserving sources", async () => {
    prismaMock.mealSuggestion.findMany.mockResolvedValue([
      {
        meal: {
          id: "meal-a",
          name: "Meal A",
          ingredients: [
            { name: "Tomato sauce", quantity: "1", unit: "can", category: "pantry" },
          ],
        },
      },
      {
        meal: {
          id: "meal-b",
          name: "Meal B",
          ingredients: [
            { name: "tomato Sauce", quantity: "2", unit: "cans", category: "pantry" },
          ],
        },
      },
    ] as never);
    prismaMock.groceryList.findFirst.mockResolvedValue(null);
    prismaMock.groceryList.create.mockResolvedValue({ id: "gl", items: [] } as never);

    await generateGroceryList("fam-1", new Date("2026-05-04T00:00:00Z"));

    const arg = prismaMock.groceryList.create.mock.calls[0][0] as {
      data: {
        items: {
          create: {
            name: string;
            quantity: string | null;
            unit: string | null;
            sources: string[];
            sourceMealIds: string[];
          }[];
        };
      };
    };
    const items = arg.data.items.create;
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("Tomato sauce");
    expect(items[0].unit).toBe("can");
    expect(items[0].quantity).toBe("3");
    expect(items[0].sources).toEqual(expect.arrayContaining(["Meal A", "Meal B"]));
    expect(items[0].sourceMealIds).toEqual(
      expect.arrayContaining(["meal-a", "meal-b"]),
    );
  });

  it("merges unit aliases (tbsp/tablespoon) and sums quantities", async () => {
    prismaMock.mealSuggestion.findMany.mockResolvedValue([
      {
        meal: {
          id: "meal-a",
          name: "Meal A",
          ingredients: [
            { name: "Flour", quantity: "1", unit: "tbsp", category: "pantry" },
          ],
        },
      },
      {
        meal: {
          id: "meal-b",
          name: "Meal B",
          ingredients: [
            { name: "Flour", quantity: "2", unit: "tablespoon", category: "pantry" },
          ],
        },
      },
    ] as never);
    prismaMock.groceryList.findFirst.mockResolvedValue(null);
    prismaMock.groceryList.create.mockResolvedValue({ id: "gl", items: [] } as never);

    await generateGroceryList("fam-1", new Date("2026-05-04T00:00:00Z"));

    const arg = prismaMock.groceryList.create.mock.calls[0][0] as {
      data: { items: { create: { name: string; quantity: string | null; unit: string | null }[] } };
    };
    const items = arg.data.items.create;
    expect(items).toHaveLength(1);
    expect(items[0].unit).toBe("tbsp");
    expect(items[0].quantity).toBe("3");
  });

  it("merges non-numeric quantities without crashing and keeps sources intact", async () => {
    prismaMock.mealSuggestion.findMany.mockResolvedValue([
      {
        meal: {
          id: "meal-a",
          name: "Meal A",
          ingredients: [
            { name: "Salt", quantity: "to taste", unit: "", category: "pantry" },
          ],
        },
      },
      {
        meal: {
          id: "meal-b",
          name: "Meal B",
          ingredients: [
            { name: "salt", quantity: "to taste", unit: "", category: "pantry" },
          ],
        },
      },
    ] as never);
    prismaMock.groceryList.findFirst.mockResolvedValue(null);
    prismaMock.groceryList.create.mockResolvedValue({ id: "gl", items: [] } as never);

    await generateGroceryList("fam-1", new Date("2026-05-04T00:00:00Z"));

    const arg = prismaMock.groceryList.create.mock.calls[0][0] as {
      data: { items: { create: { name: string; quantity: string | null; sources: string[] }[] } };
    };
    const items = arg.data.items.create;
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe("to taste");
    expect(items[0].sources).toEqual(expect.arrayContaining(["Meal A", "Meal B"]));
  });

  it("merges whitespace name variants", async () => {
    prismaMock.mealSuggestion.findMany.mockResolvedValue([
      {
        meal: {
          id: "meal-a",
          name: "Meal A",
          ingredients: [
            { name: "  Olive  Oil ", quantity: "1", unit: "tbsp", category: "pantry" },
          ],
        },
      },
      {
        meal: {
          id: "meal-b",
          name: "Meal B",
          ingredients: [
            { name: "Olive Oil", quantity: "1", unit: "tbsp", category: "pantry" },
          ],
        },
      },
    ] as never);
    prismaMock.groceryList.findFirst.mockResolvedValue(null);
    prismaMock.groceryList.create.mockResolvedValue({ id: "gl", items: [] } as never);

    await generateGroceryList("fam-1", new Date("2026-05-04T00:00:00Z"));

    const arg = prismaMock.groceryList.create.mock.calls[0][0] as {
      data: { items: { create: { name: string; quantity: string | null }[] } };
    };
    const items = arg.data.items.create;
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("Olive Oil");
    expect(items[0].quantity).toBe("2");
  });
});

describe("getGroceryList / getGroceryListByWeek", () => {
  it("getGroceryList scopes by id + familyId", async () => {
    prismaMock.groceryList.findFirst.mockResolvedValue(null);
    await getGroceryList("list-1", "fam-1");
    const arg = prismaMock.groceryList.findFirst.mock.calls[0][0] as {
      where: { id: string; familyId: string };
    };
    expect(arg.where).toEqual({ id: "list-1", familyId: "fam-1" });
  });

  it("getGroceryListByWeek normalizes weekStart to UTC midnight", async () => {
    prismaMock.groceryList.findFirst.mockResolvedValue(null);
    await getGroceryListByWeek("fam-1", new Date("2026-05-04T15:00:00Z"));
    const arg = prismaMock.groceryList.findFirst.mock.calls[0][0] as {
      where: { weekStart: Date };
    };
    expect(arg.where.weekStart.getUTCHours()).toBe(0);
  });
});

describe("item operations", () => {
  it("toggleItem updates checked when item belongs to list and family", async () => {
    prismaMock.groceryItem.findFirst.mockResolvedValue({ id: "item-1" } as never);
    prismaMock.groceryItem.update.mockResolvedValue({} as never);
    await toggleItem("fam-1", "list-1", "item-1", true);
    expect(prismaMock.groceryItem.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "item-1",
          groceryListId: "list-1",
          groceryList: { familyId: "fam-1" },
        },
      }),
    );
    expect(prismaMock.groceryItem.update).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: { checked: true },
    });
  });

  it("toggleItem rejects an item outside the family (404, no update)", async () => {
    prismaMock.groceryItem.findFirst.mockResolvedValue(null);
    await expect(
      toggleItem("fam-1", "list-1", "item-OTHER", true),
    ).rejects.toMatchObject({ name: "GroceryError", status: 404 });
    expect(prismaMock.groceryItem.update).not.toHaveBeenCalled();
  });

  it('addCustomItem defaults category to "other", checked to false, and sets origin=MANUAL', async () => {
    prismaMock.groceryList.findFirst.mockResolvedValue({ id: "list-1" } as never);
    prismaMock.groceryItem.create.mockResolvedValue({} as never);
    await addCustomItem("fam-1", "list-1", { name: "Bananas" });
    expect(prismaMock.groceryList.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "list-1", familyId: "fam-1" } }),
    );
    const arg = prismaMock.groceryItem.create.mock.calls[0][0] as {
      data: {
        category: string;
        checked: boolean;
        quantity: string | null;
        unit: string | null;
        origin: GrocerySource;
      };
    };
    expect(arg.data).toMatchObject({
      category: "other",
      checked: false,
      quantity: null,
      unit: null,
      origin: GrocerySource.MANUAL,
    });
  });

  it("addCustomItem rejects a list outside the family (404, no create)", async () => {
    prismaMock.groceryList.findFirst.mockResolvedValue(null);
    await expect(
      addCustomItem("fam-1", "list-OTHER", { name: "Bananas" }),
    ).rejects.toMatchObject({ name: "GroceryError", status: 404 });
    expect(prismaMock.groceryItem.create).not.toHaveBeenCalled();
  });

  it("removeItem deletes by id when item belongs to list and family", async () => {
    prismaMock.groceryItem.findFirst.mockResolvedValue({ id: "item-1" } as never);
    prismaMock.groceryItem.delete.mockResolvedValue({} as never);
    await removeItem("fam-1", "list-1", "item-1");
    expect(prismaMock.groceryItem.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "item-1",
          groceryListId: "list-1",
          groceryList: { familyId: "fam-1" },
        },
      }),
    );
    expect(prismaMock.groceryItem.delete).toHaveBeenCalledWith({
      where: { id: "item-1" },
    });
  });

  it("removeItem rejects an item outside the family (404, no delete)", async () => {
    prismaMock.groceryItem.findFirst.mockResolvedValue(null);
    await expect(
      removeItem("fam-1", "list-1", "item-OTHER"),
    ).rejects.toMatchObject({ name: "GroceryError", status: 404 });
    expect(prismaMock.groceryItem.delete).not.toHaveBeenCalled();
  });

  it("exports GroceryError as a class", () => {
    expect(new GroceryError(404, "x")).toBeInstanceOf(Error);
  });
});

describe("editItemFields", () => {
  it("sets edited=true for a GENERATED item", async () => {
    prismaMock.groceryItem.findFirst.mockResolvedValue({
      id: "item-1",
      origin: GrocerySource.GENERATED,
    } as never);
    prismaMock.groceryItem.update.mockResolvedValue({} as never);

    await editItemFields("fam-1", "list-1", "item-1", { quantity: "3" });

    expect(prismaMock.groceryItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "item-1" },
        data: expect.objectContaining({ quantity: "3", edited: true }),
      }),
    );
  });

  it("does NOT set edited=true for a MANUAL item", async () => {
    prismaMock.groceryItem.findFirst.mockResolvedValue({
      id: "item-2",
      origin: GrocerySource.MANUAL,
    } as never);
    prismaMock.groceryItem.update.mockResolvedValue({} as never);

    await editItemFields("fam-1", "list-1", "item-2", { quantity: "5" });

    const updateArg = prismaMock.groceryItem.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(updateArg.data.edited).toBeUndefined();
  });

  it("updates only the provided fields (partial patch)", async () => {
    prismaMock.groceryItem.findFirst.mockResolvedValue({
      id: "item-3",
      origin: GrocerySource.GENERATED,
    } as never);
    prismaMock.groceryItem.update.mockResolvedValue({} as never);

    await editItemFields("fam-1", "list-1", "item-3", { unit: "kg" });

    const updateArg = prismaMock.groceryItem.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(updateArg.data.unit).toBe("kg");
    expect(updateArg.data.quantity).toBeUndefined();
    expect(updateArg.data.category).toBeUndefined();
  });

  it("throws GroceryError(404) when item not found", async () => {
    prismaMock.groceryItem.findFirst.mockResolvedValue(null);

    await expect(
      editItemFields("fam-1", "list-1", "item-MISSING", { quantity: "1" }),
    ).rejects.toMatchObject({ name: "GroceryError", status: 404 });
    expect(prismaMock.groceryItem.update).not.toHaveBeenCalled();
  });

  it("enforces family scope in ownership query (IDOR guard)", async () => {
    prismaMock.groceryItem.findFirst.mockResolvedValue({
      id: "item-1",
      origin: GrocerySource.GENERATED,
    } as never);
    prismaMock.groceryItem.update.mockResolvedValue({} as never);

    await editItemFields("fam-999", "list-1", "item-1", { quantity: "2" });

    expect(prismaMock.groceryItem.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          groceryList: expect.objectContaining({ familyId: "fam-999" }),
        }),
      }),
    );
  });
});
