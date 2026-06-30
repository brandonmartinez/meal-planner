import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

// Route-level Zod schemas (validation lives at the route boundary).
const { createMealSchema, updateMealSchema } = await import(
  "../routes/meals.js"
);

// Helper: emulate prisma.$transaction(fn) by invoking fn with prismaMock as tx.
function stubTransaction() {
  prismaMock.$transaction.mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (cb: any) => Promise.resolve(cb(prismaMock)),
  );
}

describe("meals service", () => {
  describe("listMeals", () => {
    // Pin "now" so the current/previous week window is deterministic. Default
    // anchor: Tue 2026-06-30 12:00Z → current week Mon 2026-06-29, previous
    // week Mon 2026-06-22 (in UTC).
    const CURRENT_MONDAY = "2026-06-29T00:00:00.000Z";
    const PREVIOUS_MONDAY = "2026-06-22T00:00:00.000Z";

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-30T12:00:00.000Z"));
      // Default family timezone resolves to UTC unless a test overrides it.
      prismaMock.family.findUnique.mockResolvedValue({
        timezone: "UTC",
      } as never);
      // Default: no recent approved suggestions.
      prismaMock.mealSuggestion.findMany.mockResolvedValue([] as never);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    // A stored DayPlan/WeekPlan date is UTC midnight of the calendar day.
    function suggestion(mealId: string, isoDate: string) {
      return { mealId, dayPlan: { date: new Date(`${isoDate}T00:00:00.000Z`) } };
    }

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

    it("flags a meal scheduled this week as recent with its lastScheduledOn", async () => {
      prismaMock.meal.findMany.mockResolvedValue([
        { id: "m-1", name: "Tacos" },
      ] as never);
      prismaMock.mealSuggestion.findMany.mockResolvedValue([
        suggestion("m-1", "2026-06-30"),
      ] as never);

      const result = await listMeals("fam-1");
      expect(result[0].recentlyScheduled).toBe(true);
      expect(result[0].lastScheduledOn).toBe("2026-06-30");
    });

    it("flags a meal scheduled in the previous week as recent", async () => {
      prismaMock.meal.findMany.mockResolvedValue([
        { id: "m-1", name: "Tacos" },
      ] as never);
      prismaMock.mealSuggestion.findMany.mockResolvedValue([
        suggestion("m-1", "2026-06-24"),
      ] as never);

      const result = await listMeals("fam-1");
      expect(result[0].recentlyScheduled).toBe(true);
      expect(result[0].lastScheduledOn).toBe("2026-06-24");
    });

    it("uses the most recent approved date when a meal has multiple in-window suggestions", async () => {
      prismaMock.meal.findMany.mockResolvedValue([
        { id: "m-1", name: "Tacos" },
      ] as never);
      // Deliberately out of order: last week then this week.
      prismaMock.mealSuggestion.findMany.mockResolvedValue([
        suggestion("m-1", "2026-06-24"),
        suggestion("m-1", "2026-06-30"),
      ] as never);

      const result = await listMeals("fam-1");
      expect(result[0].lastScheduledOn).toBe("2026-06-30");
    });

    it("marks meals with no approved in-window suggestions as not recent", async () => {
      prismaMock.meal.findMany.mockResolvedValue([
        { id: "m-1", name: "Tacos" },
        { id: "m-2", name: "Pizza" },
      ] as never);
      prismaMock.mealSuggestion.findMany.mockResolvedValue([
        suggestion("m-1", "2026-06-30"),
      ] as never);

      const result = await listMeals("fam-1");
      const m2 = result.find((m) => m.id === "m-2")!;
      expect(m2.recentlyScheduled).toBe(false);
      expect(m2.lastScheduledOn).toBeNull();
    });

    it("queries approved suggestions only (unapproved proposals never flag a meal)", async () => {
      prismaMock.meal.findMany.mockResolvedValue([] as never);
      await listMeals("fam-1");
      const arg = prismaMock.mealSuggestion.findMany.mock.calls[0][0] as {
        where: { approved?: unknown };
      };
      expect(arg.where.approved).toBe(true);
    });

    it("scopes the recent lookup to the family on both the meal and the week plan", async () => {
      prismaMock.meal.findMany.mockResolvedValue([] as never);
      await listMeals("fam-1");
      const arg = prismaMock.mealSuggestion.findMany.mock.calls[0][0] as {
        where: {
          meal?: { familyId?: string };
          dayPlan?: { weekPlan?: { familyId?: string } };
        };
      };
      expect(arg.where.meal?.familyId).toBe("fam-1");
      expect(arg.where.dayPlan?.weekPlan?.familyId).toBe("fam-1");
    });

    it("restricts the window to the current and previous week starts (older weeks excluded)", async () => {
      prismaMock.meal.findMany.mockResolvedValue([] as never);
      await listMeals("fam-1");
      const arg = prismaMock.mealSuggestion.findMany.mock.calls[0][0] as {
        where: {
          dayPlan?: { weekPlan?: { weekStart?: { in?: Date[] } } };
        };
      };
      const window = arg.where.dayPlan?.weekPlan?.weekStart?.in ?? [];
      const iso = window.map((d) => d.toISOString()).sort();
      expect(iso).toEqual([PREVIOUS_MONDAY, CURRENT_MONDAY]);
    });

    it("resolves the recent window in the family timezone (boundary correctness)", async () => {
      // 2026-06-29 03:30Z is Monday in UTC, but Sunday 23:30 in America/New_York
      // (EDT, UTC-4). The family-tz week therefore starts a week earlier.
      vi.setSystemTime(new Date("2026-06-29T03:30:00.000Z"));
      prismaMock.family.findUnique.mockResolvedValue({
        timezone: "America/New_York",
      } as never);
      prismaMock.meal.findMany.mockResolvedValue([] as never);

      await listMeals("fam-1");
      const arg = prismaMock.mealSuggestion.findMany.mock.calls[0][0] as {
        where: {
          dayPlan?: { weekPlan?: { weekStart?: { in?: Date[] } } };
        };
      };
      const iso = (arg.where.dayPlan?.weekPlan?.weekStart?.in ?? [])
        .map((d) => d.toISOString())
        .sort();
      // Family-local "now" is Sun 2026-06-28 → current week Mon 2026-06-22,
      // previous week Mon 2026-06-15. (UTC would have given 06-29/06-22.)
      expect(iso).toEqual([
        "2026-06-15T00:00:00.000Z",
        "2026-06-22T00:00:00.000Z",
      ]);
    });

    it("issues a bounded number of queries regardless of meal count (no N+1)", async () => {
      prismaMock.meal.findMany.mockResolvedValue([
        { id: "m-1", name: "A" },
        { id: "m-2", name: "B" },
        { id: "m-3", name: "C" },
      ] as never);
      prismaMock.mealSuggestion.findMany.mockResolvedValue([] as never);

      await listMeals("fam-1");
      // One meal query + exactly one windowed suggestion query — not per-meal.
      expect(prismaMock.meal.findMany).toHaveBeenCalledTimes(1);
      expect(prismaMock.mealSuggestion.findMany).toHaveBeenCalledTimes(1);
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

    it("persists difficulty when provided", async () => {
      stubTransaction();
      prismaMock.meal.create.mockResolvedValue({ id: "m-3" } as never);
      await createMeal("fam-1", { name: "Tacos", difficulty: "MEDIUM" });
      const arg = prismaMock.meal.create.mock.calls[0][0] as {
        data: { difficulty?: unknown };
      };
      expect(arg.data.difficulty).toBe("MEDIUM");
    });

    it("passes through a null difficulty (no difficulty set)", async () => {
      stubTransaction();
      prismaMock.meal.create.mockResolvedValue({ id: "m-4" } as never);
      await createMeal("fam-1", { name: "Soup", difficulty: null });
      const arg = prismaMock.meal.create.mock.calls[0][0] as {
        data: { difficulty?: unknown };
      };
      expect(arg.data.difficulty).toBeNull();
    });

    it("leaves difficulty undefined when omitted", async () => {
      stubTransaction();
      prismaMock.meal.create.mockResolvedValue({ id: "m-5" } as never);
      await createMeal("fam-1", { name: "Salad" });
      const arg = prismaMock.meal.create.mock.calls[0][0] as {
        data: { difficulty?: unknown };
      };
      expect(arg.data.difficulty).toBeUndefined();
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

    it("persists difficulty when provided", async () => {
      stubTransaction();
      prismaMock.meal.findFirst.mockResolvedValue({
        id: "m-1",
        placeholderKind: null,
      } as never);
      prismaMock.meal.update.mockResolvedValue({ id: "m-1" } as never);

      await updateMeal("m-1", "fam-1", { difficulty: "HARD" });

      const arg = prismaMock.meal.update.mock.calls[0][0] as {
        data: { difficulty?: unknown };
      };
      expect(arg.data.difficulty).toBe("HARD");
    });

    it("clears difficulty to null when difficulty is null", async () => {
      stubTransaction();
      prismaMock.meal.findFirst.mockResolvedValue({
        id: "m-1",
        placeholderKind: null,
      } as never);
      prismaMock.meal.update.mockResolvedValue({ id: "m-1" } as never);

      await updateMeal("m-1", "fam-1", { difficulty: null });

      const arg = prismaMock.meal.update.mock.calls[0][0] as {
        data: { difficulty?: unknown };
      };
      expect(arg.data.difficulty).toBeNull();
    });

    it("leaves difficulty untouched when omitted", async () => {
      stubTransaction();
      prismaMock.meal.findFirst.mockResolvedValue({
        id: "m-1",
        placeholderKind: null,
      } as never);
      prismaMock.meal.update.mockResolvedValue({ id: "m-1" } as never);

      await updateMeal("m-1", "fam-1", { name: "Renamed" });

      const arg = prismaMock.meal.update.mock.calls[0][0] as {
        data: { difficulty?: unknown };
      };
      expect(arg.data.difficulty).toBeUndefined();
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

describe("meal difficulty route validation", () => {
  describe("createMealSchema", () => {
    it("accepts a valid difficulty", () => {
      const parsed = createMealSchema.parse({
        name: "Tacos",
        difficulty: "EASY",
      });
      expect(parsed.difficulty).toBe("EASY");
    });

    it("accepts an explicit null difficulty", () => {
      const parsed = createMealSchema.parse({ name: "Tacos", difficulty: null });
      expect(parsed.difficulty).toBeNull();
    });

    it("accepts an omitted difficulty", () => {
      const parsed = createMealSchema.parse({ name: "Tacos" });
      expect(parsed.difficulty).toBeUndefined();
    });

    it("rejects an invalid difficulty value", () => {
      expect(() =>
        createMealSchema.parse({ name: "Tacos", difficulty: "EXTREME" }),
      ).toThrow();
    });

    it("rejects a lowercase difficulty value", () => {
      expect(() =>
        createMealSchema.parse({ name: "Tacos", difficulty: "easy" }),
      ).toThrow();
    });
  });

  describe("updateMealSchema", () => {
    it("accepts each valid difficulty value", () => {
      for (const value of ["EASY", "MEDIUM", "HARD"] as const) {
        expect(updateMealSchema.parse({ difficulty: value }).difficulty).toBe(
          value,
        );
      }
    });

    it("accepts an explicit null difficulty (clearing)", () => {
      expect(updateMealSchema.parse({ difficulty: null }).difficulty).toBeNull();
    });

    it("accepts an omitted difficulty", () => {
      expect(updateMealSchema.parse({ name: "x" }).difficulty).toBeUndefined();
    });

    it("rejects an invalid difficulty value", () => {
      expect(() => updateMealSchema.parse({ difficulty: "HARDISH" })).toThrow();
    });
  });
});
