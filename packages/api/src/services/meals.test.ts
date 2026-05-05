import { describe, it, expect, vi } from "vitest";
import { prismaMock } from "../../tests/helpers/prisma.js";

vi.mock("../config/database.js", () => ({ default: prismaMock }));

const {
  listMeals,
  getMealById,
  createMeal,
  updateMeal,
  deleteMeal,
  importMeals,
} = await import("./meals.js");

// Helper: emulate prisma.$transaction(fn) by invoking fn with prismaMock as tx.
function stubTransaction() {
  prismaMock.$transaction.mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (cb: any) => Promise.resolve(cb(prismaMock)),
  );
}

describe("meals service", () => {
  describe("listMeals", () => {
    it("returns all meals when no search filter is given", async () => {
      prismaMock.meal.findMany.mockResolvedValue([] as never);
      await listMeals("fam-1");
      expect(prismaMock.meal.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { familyId: "fam-1" },
          orderBy: { name: "asc" },
        }),
      );
    });

    it("applies a case-insensitive contains filter on name when search is given", async () => {
      prismaMock.meal.findMany.mockResolvedValue([] as never);
      await listMeals("fam-1", { search: "pizza" });
      const arg = prismaMock.meal.findMany.mock.calls[0][0] as {
        where: { name?: unknown };
      };
      expect(arg.where.name).toEqual({
        contains: "pizza",
        mode: "insensitive",
      });
    });
  });

  describe("getMealById", () => {
    it("looks up by id + familyId", async () => {
      prismaMock.meal.findFirst.mockResolvedValue(null);
      await getMealById("m-1", "fam-1");
      expect(prismaMock.meal.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "m-1", familyId: "fam-1" } }),
      );
    });
  });

  describe("createMeal", () => {
    it("creates a meal with nested ingredients in a transaction", async () => {
      stubTransaction();
      const created = { id: "m-1", name: "Tacos" };
      prismaMock.meal.create.mockResolvedValue(created as never);

      const result = await createMeal("fam-1", {
        name: "Tacos",
        ingredients: [{ name: "tortilla", quantity: "6" }],
      });

      expect(result).toBe(created);
      const arg = prismaMock.meal.create.mock.calls[0][0] as {
        data: {
          name: string;
          familyId: string;
          ingredients?: { create: unknown[] };
        };
      };
      expect(arg.data.familyId).toBe("fam-1");
      expect(arg.data.ingredients?.create).toHaveLength(1);
    });

    it("omits the ingredients clause when none are provided", async () => {
      stubTransaction();
      prismaMock.meal.create.mockResolvedValue({ id: "m-2" } as never);
      await createMeal("fam-1", { name: "Plain" });
      const arg = prismaMock.meal.create.mock.calls[0][0] as {
        data: { ingredients?: unknown };
      };
      expect(arg.data.ingredients).toBeUndefined();
    });
  });

  describe("updateMeal", () => {
    it("refuses to modify a placeholder meal", async () => {
      stubTransaction();
      prismaMock.meal.findFirst.mockResolvedValue({
        id: "m-1",
        placeholderKind: "FREE_DAY",
      } as never);

      await expect(updateMeal("m-1", "fam-1", { name: "x" })).rejects.toThrow(
        /Cannot modify placeholder/,
      );
    });

    it("throws if the meal does not belong to the family", async () => {
      stubTransaction();
      prismaMock.meal.findFirst.mockResolvedValue(null);
      await expect(updateMeal("m-1", "fam-1", { name: "x" })).rejects.toThrow(
        /Meal not found/,
      );
    });

    it("replaces ingredients when ingredients is provided", async () => {
      stubTransaction();
      prismaMock.meal.findFirst.mockResolvedValue({
        id: "m-1",
        placeholderKind: null,
      } as never);
      prismaMock.mealIngredient.deleteMany.mockResolvedValue({
        count: 2,
      } as never);
      prismaMock.meal.update.mockResolvedValue({ id: "m-1" } as never);

      await updateMeal("m-1", "fam-1", {
        name: "Updated",
        ingredients: [{ name: "a" }],
      });

      expect(prismaMock.mealIngredient.deleteMany).toHaveBeenCalledWith({
        where: { mealId: "m-1" },
      });
      const arg = prismaMock.meal.update.mock.calls[0][0] as {
        data: { ingredients?: { create: unknown[] } };
      };
      expect(arg.data.ingredients?.create).toHaveLength(1);
    });

    it("leaves ingredients untouched when ingredients is undefined", async () => {
      stubTransaction();
      prismaMock.meal.findFirst.mockResolvedValue({
        id: "m-1",
        placeholderKind: null,
      } as never);
      prismaMock.meal.update.mockResolvedValue({ id: "m-1" } as never);

      await updateMeal("m-1", "fam-1", { name: "NewName" });

      expect(prismaMock.mealIngredient.deleteMany).not.toHaveBeenCalled();
      const arg = prismaMock.meal.update.mock.calls[0][0] as {
        data: { ingredients?: unknown };
      };
      expect(arg.data.ingredients).toBeUndefined();
    });
  });

  describe("deleteMeal", () => {
    it("refuses to delete a placeholder meal", async () => {
      prismaMock.meal.findFirst.mockResolvedValue({
        id: "m-1",
        placeholderKind: "FREE_DAY",
      } as never);
      await expect(deleteMeal("m-1", "fam-1")).rejects.toThrow(
        /Cannot delete placeholder/,
      );
    });

    it("refuses to delete when approved future suggestions exist", async () => {
      prismaMock.meal.findFirst.mockResolvedValue({
        id: "m-1",
        placeholderKind: null,
      } as never);
      prismaMock.mealSuggestion.findFirst.mockResolvedValue({
        id: "s",
      } as never);
      await expect(deleteMeal("m-1", "fam-1")).rejects.toThrow(
        /approved suggestions in future weeks/,
      );
    });

    it("deletes when no future approved suggestions exist", async () => {
      prismaMock.meal.findFirst.mockResolvedValue({
        id: "m-1",
        placeholderKind: null,
      } as never);
      prismaMock.mealSuggestion.findFirst.mockResolvedValue(null);
      prismaMock.meal.delete.mockResolvedValue({} as never);
      await deleteMeal("m-1", "fam-1");
      expect(prismaMock.meal.delete).toHaveBeenCalledWith({
        where: { id: "m-1" },
      });
    });
  });

  describe("importMeals", () => {
    it("skips meals whose names conflict with placeholders", async () => {
      const result = await importMeals("fam-1", [
        { name: "Free Day" },
        { name: "Takeout / Delivery" },
      ]);
      expect(result.errors).toHaveLength(2);
      expect(result.created).toBe(0);
      // No transactions needed — short-circuits before DB.
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it("creates a new meal when no existing match (skip mode)", async () => {
      stubTransaction();
      prismaMock.meal.findFirst.mockResolvedValue(null);
      prismaMock.meal.create.mockResolvedValue({ id: "m-new" } as never);

      const result = await importMeals("fam-1", [{ name: "Tacos" }]);
      expect(result.created).toBe(1);
      expect(result.skipped).toBe(0);
    });

    it("skips an existing meal in skip mode", async () => {
      stubTransaction();
      prismaMock.meal.findFirst.mockResolvedValue({ id: "m-old" } as never);

      const result = await importMeals("fam-1", [{ name: "Tacos" }], {
        mode: "skip",
      });
      expect(result.skipped).toBe(1);
      expect(result.created).toBe(0);
      expect(prismaMock.meal.update).not.toHaveBeenCalled();
    });

    it("replaces ingredients on an existing meal in replace mode", async () => {
      stubTransaction();
      prismaMock.meal.findFirst.mockResolvedValue({ id: "m-old" } as never);
      prismaMock.mealIngredient.deleteMany.mockResolvedValue({
        count: 0,
      } as never);
      prismaMock.meal.update.mockResolvedValue({ id: "m-old" } as never);

      const result = await importMeals(
        "fam-1",
        [{ name: "Tacos", ingredients: [{ name: "salsa" }] }],
        { mode: "replace" },
      );

      expect(result.updated).toBe(1);
      expect(prismaMock.mealIngredient.deleteMany).toHaveBeenCalledWith({
        where: { mealId: "m-old" },
      });
    });

    it("reports per-meal errors without aborting subsequent meals", async () => {
      stubTransaction();
      prismaMock.meal.findFirst.mockResolvedValueOnce(null);
      prismaMock.meal.create.mockRejectedValueOnce(new Error("boom"));
      prismaMock.meal.findFirst.mockResolvedValueOnce(null);
      prismaMock.meal.create.mockResolvedValueOnce({ id: "ok" } as never);

      const result = await importMeals("fam-1", [{ name: "A" }, { name: "B" }]);
      expect(result.created).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].name).toBe("A");
    });
  });
});
