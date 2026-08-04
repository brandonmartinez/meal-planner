import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../../tests/helpers/prisma.js";

vi.mock("../config/database.js", () => ({ default: prismaMock }));

const { exportMeals } = await import("./meals.js");

/**
 * Ingredient-ordering regression guard for the CSV export path (Yen, Grid
 * verification). The tabular "Grid" view is order-sensitive: `spanFrom`/`spanTo`
 * are inclusive 0-based indices into the position-sorted ingredients array. If
 * export ever emits ingredients in an order other than ascending `position`, a
 * CSV round-trip (export → import → re-import assigns position from row order)
 * silently reorders the recipe, and the Grid then brackets the WRONG rows — no
 * error, no crash, just an incorrect recipe.
 *
 * The existing `exportMeals` tests assert `orderBy: { name: "asc" }` at the meal
 * level and the tag/collection flattening, but NONE of them pins the nested
 * `ingredients.orderBy: { position: "asc" }`. This file closes that hole so the
 * ordering contract can't be dropped without a red test.
 */
describe("exportMeals ingredient ordering (Grid round-trip guard)", () => {
  beforeEach(() => {
    prismaMock.meal.findMany.mockResolvedValue([] as never);
  });

  it("requests ingredients ordered by ascending position", async () => {
    await exportMeals("fam-1");

    const arg = prismaMock.meal.findMany.mock.calls[0][0] as {
      include: {
        ingredients: { orderBy: { position: "asc" | "desc" } };
      };
    };

    expect(arg.include.ingredients.orderBy).toEqual({ position: "asc" });
  });

  it("requests instructions ordered by ascending position", async () => {
    await exportMeals("fam-1");

    const arg = prismaMock.meal.findMany.mock.calls[0][0] as {
      include: {
        instructions: { orderBy: { position: "asc" | "desc" } };
      };
    };

    expect(arg.include.instructions.orderBy).toEqual({ position: "asc" });
  });

  it("preserves the position-sorted ingredient order Prisma returns", async () => {
    // Prisma applies the orderBy; simulate rows arriving already sorted and
    // assert exportMeals does not reshuffle them, so the emitted CSV row order
    // equals ascending position (the durable Grid row order).
    prismaMock.meal.findMany.mockResolvedValue([
      {
        name: "Layered Dip",
        description: null,
        imageUrl: null,
        difficulty: null,
        prepTimeMinutes: null,
        cookTimeMinutes: null,
        servings: null,
        sourceUrl: null,
        notes: null,
        favorite: false,
        rating: null,
        ingredients: [
          { name: "beans", quantity: "1", unit: "can", category: "pantry" },
          { name: "cheese", quantity: "2", unit: "cup", category: "dairy" },
          { name: "salsa", quantity: "1", unit: "cup", category: "condiments" },
        ],
        instructions: [],
        tags: [],
        collections: [],
      },
    ] as never);

    const result = await exportMeals("fam-1");

    expect(result[0].ingredients.map((i) => i.name)).toEqual([
      "beans",
      "cheese",
      "salsa",
    ]);
  });
});
