import { describe, it, expect, vi } from "vitest";
import { prismaMock } from "../../tests/helpers/prisma.js";

vi.mock("../config/database.js", () => ({ default: prismaMock }));

const {
  generateGroceryList,
  getGroceryList,
  getGroceryListByWeek,
  toggleItem,
  addCustomItem,
  removeItem,
} = await import("./grocery.js");

describe("generateGroceryList", () => {
  it("aggregates ingredients across approved suggestions and dedupes by name+unit", async () => {
    prismaMock.mealSuggestion.findMany.mockResolvedValue([
      {
        meal: {
          ingredients: [
            { name: "Onion", quantity: "1", unit: "", category: "produce" },
            { name: "Salt", quantity: "", unit: "tsp", category: "pantry" },
          ],
        },
      },
      {
        meal: {
          ingredients: [
            // same name+unit -> merged numerically
            { name: "onion", quantity: "2", unit: "", category: "produce" },
            // different unit -> separate entry
            { name: "Onion", quantity: "1", unit: "cup", category: "produce" },
            // empty quantity stays empty
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
    // Onion (no unit), Salt (tsp), Onion (cup), Pepper (tsp)
    expect(items).toHaveLength(4);
    const merged = items.find(
      (i) => i.name === "Onion" && (i.unit === null || i.unit === ""),
    );
    expect(merged?.quantity).toBe("3"); // 1 + 2 numeric merge
  });

  it("deletes any existing list for the same week before creating a new one", async () => {
    prismaMock.mealSuggestion.findMany.mockResolvedValue([] as never);
    prismaMock.groceryList.findFirst.mockResolvedValue({ id: "old" } as never);
    prismaMock.groceryList.delete.mockResolvedValue({} as never);
    prismaMock.groceryList.create.mockResolvedValue({ id: "new" } as never);

    await generateGroceryList("fam-1", new Date("2026-05-04T00:00:00Z"));

    expect(prismaMock.groceryList.delete).toHaveBeenCalledWith({
      where: { id: "old" },
    });
  });

  it("falls back to string concatenation when quantities are not both numeric", async () => {
    prismaMock.mealSuggestion.findMany.mockResolvedValue([
      {
        meal: {
          ingredients: [
            {
              name: "Lemon",
              quantity: "a pinch",
              unit: "",
              category: "produce",
            },
          ],
        },
      },
      {
        meal: {
          ingredients: [
            { name: "Lemon", quantity: "2", unit: "", category: "produce" },
          ],
        },
      },
    ] as never);
    prismaMock.groceryList.findFirst.mockResolvedValue(null);
    prismaMock.groceryList.create.mockResolvedValue({ id: "gl" } as never);

    await generateGroceryList("fam-1", new Date("2026-05-04T00:00:00Z"));
    const arg = prismaMock.groceryList.create.mock.calls[0][0] as {
      data: { items: { create: { name: string; quantity: string | null }[] } };
    };
    const lemon = arg.data.items.create.find((i) => i.name === "Lemon");
    expect(lemon?.quantity).toBe("a pinch + 2");
  });

  it("tracks the source meal names for each ingredient", async () => {
    prismaMock.mealSuggestion.findMany.mockResolvedValue([
      {
        meal: {
          name: "Tacos",
          ingredients: [
            { name: "Onion", quantity: "1", unit: "", category: "produce" },
          ],
        },
      },
      {
        meal: {
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
      data: { items: { create: { name: string; sources: string[] }[] } };
    };
    const onion = arg.data.items.create.find(
      (i) => i.name.toLowerCase() === "onion",
    );
    const carrot = arg.data.items.create.find((i) => i.name === "Carrot");
    expect(onion?.sources).toEqual(["Soup", "Tacos"]);
    expect(carrot?.sources).toEqual(["Soup"]);
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
  it("toggleItem updates checked", async () => {
    prismaMock.groceryItem.update.mockResolvedValue({} as never);
    await toggleItem("item-1", true);
    expect(prismaMock.groceryItem.update).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: { checked: true },
    });
  });

  it('addCustomItem defaults category to "other" and checked to false', async () => {
    prismaMock.groceryItem.create.mockResolvedValue({} as never);
    await addCustomItem("list-1", { name: "Bananas" });
    const arg = prismaMock.groceryItem.create.mock.calls[0][0] as {
      data: {
        category: string;
        checked: boolean;
        quantity: string | null;
        unit: string | null;
      };
    };
    expect(arg.data).toMatchObject({
      category: "other",
      checked: false,
      quantity: null,
      unit: null,
    });
  });

  it("removeItem deletes by id", async () => {
    prismaMock.groceryItem.delete.mockResolvedValue({} as never);
    await removeItem("item-1");
    expect(prismaMock.groceryItem.delete).toHaveBeenCalledWith({
      where: { id: "item-1" },
    });
  });
});
