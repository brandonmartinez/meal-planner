import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { prismaMock } from "../../tests/helpers/prisma.js";

vi.mock("../config/database.js", () => ({ default: prismaMock }));

const {
  listMeals,
  getLastCookedMap,
  getMealById,
  createMeal,
  updateMeal,
  deleteMeal,
  importMeals,
  exportMeals,
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
      // Default: no recent approved suggestions (used by both getRecentlyScheduledMap
      // and getLastCookedMap). Tests that need specific data use mockResolvedValueOnce.
      prismaMock.mealSuggestion.findMany.mockResolvedValue([] as never);
      // Default count + transaction for the name/created DB-sort path. Tests that
      // need specific meal data override $transaction in their own body.
      prismaMock.meal.count.mockResolvedValue(0 as never);
      prismaMock.$transaction.mockResolvedValue([0, []] as never);
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

    it("returns a MealListResponseDTO envelope with items/total/limit/offset/hasMore", async () => {
      prismaMock.$transaction.mockResolvedValue([
        2,
        [
          { id: "m-1", name: "Tacos", _count: { ingredients: 2 } },
          { id: "m-2", name: "Pizza", _count: { ingredients: 0 } },
        ],
      ] as never);

      const result = await listMeals("fam-1");

      expect(result).toMatchObject({
        items: expect.any(Array),
        total: 2,
        limit: 25,
        offset: 0,
        hasMore: false,
      });
      expect(result.items).toHaveLength(2);
    });

    it("hasMore is true when there are more records beyond the current page", async () => {
      prismaMock.$transaction.mockResolvedValue([
        30,
        Array.from({ length: 25 }, (_, i) => ({
          id: `m-${i}`,
          name: `Meal ${i}`,
          _count: { ingredients: 0 },
        })),
      ] as never);

      const result = await listMeals("fam-1");

      expect(result.total).toBe(30);
      expect(result.hasMore).toBe(true);
    });

    it("uses an OR clause covering name, description, tag name, and collection name when search is given", async () => {
      prismaMock.meal.findMany.mockResolvedValue([] as never);
      await listMeals("fam-1", { search: "pizza" });
      const arg = prismaMock.meal.findMany.mock.calls[0][0] as {
        where: { OR?: unknown[] };
      };
      expect(arg.where.OR).toEqual([
        { name: { contains: "pizza", mode: "insensitive" } },
        { description: { contains: "pizza", mode: "insensitive" } },
        {
          tags: {
            some: {
              tag: { name: { contains: "pizza", mode: "insensitive" } },
            },
          },
        },
        {
          collections: {
            some: {
              recipeCollection: {
                name: { contains: "pizza", mode: "insensitive" },
              },
            },
          },
        },
      ]);
    });

    it("search: matches via tag name (OR arm present in query)", async () => {
      prismaMock.meal.findMany.mockResolvedValue([] as never);
      await listMeals("fam-1", { search: "italian" });
      const arg = prismaMock.meal.findMany.mock.calls[0][0] as {
        where: { OR?: Array<{ tags?: unknown }> };
      };
      const tagArm = arg.where.OR?.find((c) => "tags" in c);
      expect(tagArm).toEqual({
        tags: {
          some: {
            tag: { name: { contains: "italian", mode: "insensitive" } },
          },
        },
      });
    });

    it("search: matches via collection name (OR arm present in query)", async () => {
      prismaMock.meal.findMany.mockResolvedValue([] as never);
      await listMeals("fam-1", { search: "weeknight" });
      const arg = prismaMock.meal.findMany.mock.calls[0][0] as {
        where: { OR?: Array<{ collections?: unknown }> };
      };
      const collArm = arg.where.OR?.find((c) => "collections" in c);
      expect(collArm).toEqual({
        collections: {
          some: {
            recipeCollection: {
              name: { contains: "weeknight", mode: "insensitive" },
            },
          },
        },
      });
    });

    it("search: matches via description (OR arm present in query)", async () => {
      prismaMock.meal.findMany.mockResolvedValue([] as never);
      await listMeals("fam-1", { search: "hearty" });
      const arg = prismaMock.meal.findMany.mock.calls[0][0] as {
        where: { OR?: Array<{ description?: unknown }> };
      };
      const descArm = arg.where.OR?.find((c) => "description" in c);
      expect(descArm).toEqual({
        description: { contains: "hearty", mode: "insensitive" },
      });
    });

    it("search: no OR clause when search is absent (name-only regression guard)", async () => {
      prismaMock.meal.findMany.mockResolvedValue([] as never);
      await listMeals("fam-1");
      const arg = prismaMock.meal.findMany.mock.calls[0][0] as {
        where: { OR?: unknown };
      };
      expect(arg.where).not.toHaveProperty("OR");
    });

    it("flags a meal scheduled this week as recent with its lastScheduledOn", async () => {
      prismaMock.$transaction.mockResolvedValue([
        1,
        [{ id: "m-1", name: "Tacos", _count: { ingredients: 0 } }],
      ] as never);
      prismaMock.mealSuggestion.findMany.mockResolvedValue([
        suggestion("m-1", "2026-06-30"),
      ] as never);

      const result = await listMeals("fam-1");
      expect(result.items[0].recentlyScheduled).toBe(true);
      expect(result.items[0].lastScheduledOn).toBe("2026-06-30");
    });

    it("flags a meal scheduled in the previous week as recent", async () => {
      prismaMock.$transaction.mockResolvedValue([
        1,
        [{ id: "m-1", name: "Tacos", _count: { ingredients: 0 } }],
      ] as never);
      prismaMock.mealSuggestion.findMany.mockResolvedValue([
        suggestion("m-1", "2026-06-24"),
      ] as never);

      const result = await listMeals("fam-1");
      expect(result.items[0].recentlyScheduled).toBe(true);
      expect(result.items[0].lastScheduledOn).toBe("2026-06-24");
    });

    it("uses the most recent approved date when a meal has multiple in-window suggestions", async () => {
      prismaMock.$transaction.mockResolvedValue([
        1,
        [{ id: "m-1", name: "Tacos", _count: { ingredients: 0 } }],
      ] as never);
      // Deliberately out of order: last week then this week.
      prismaMock.mealSuggestion.findMany.mockResolvedValue([
        suggestion("m-1", "2026-06-24"),
        suggestion("m-1", "2026-06-30"),
      ] as never);

      const result = await listMeals("fam-1");
      expect(result.items[0].lastScheduledOn).toBe("2026-06-30");
    });

    it("marks meals with no approved in-window suggestions as not recent", async () => {
      prismaMock.$transaction.mockResolvedValue([
        2,
        [
          { id: "m-1", name: "Tacos", _count: { ingredients: 0 } },
          { id: "m-2", name: "Pizza", _count: { ingredients: 0 } },
        ],
      ] as never);
      prismaMock.mealSuggestion.findMany.mockResolvedValue([
        suggestion("m-1", "2026-06-30"),
      ] as never);

      const result = await listMeals("fam-1");
      const m2 = result.items.find((m) => m.id === "m-2")!;
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
      const meals = [
        { id: "m-1", name: "A", _count: { ingredients: 0 } },
        { id: "m-2", name: "B", _count: { ingredients: 0 } },
        { id: "m-3", name: "C", _count: { ingredients: 0 } },
      ];
      prismaMock.$transaction.mockResolvedValue([3, meals] as never);
      prismaMock.meal.findMany.mockResolvedValue(meals as never);

      await listMeals("fam-1");
      // One $transaction (count + findMany) + two windowed suggestion queries
      // (getRecentlyScheduledMap + getLastCookedMap) — not per-meal.
      expect(prismaMock.meal.findMany).toHaveBeenCalledTimes(1);
      expect(prismaMock.mealSuggestion.findMany).toHaveBeenCalledTimes(2);
    });

    it("populates lastCookedOn from the most recent approved suggestion for the meal", async () => {
      prismaMock.$transaction.mockResolvedValue([
        1,
        [{ id: "m-1", name: "Tacos", _count: { ingredients: 0 } }],
      ] as never);
      // Call 1 (getRecentlyScheduledMap): no recently-scheduled suggestions.
      // Call 2 (getLastCookedMap): meal was last cooked 2026-05-15.
      prismaMock.mealSuggestion.findMany
        .mockResolvedValueOnce([] as never)
        .mockResolvedValueOnce([
          {
            mealId: "m-1",
            dayPlan: { date: new Date("2026-05-15T00:00:00.000Z") },
          },
        ] as never);

      const result = await listMeals("fam-1");
      expect(result.items[0].lastCookedOn).toBe("2026-05-15");
      expect(result.items[0].timesCooked).toBe(1);
    });

    it("populates timesCooked from the count of approved suggestions for the meal", async () => {
      prismaMock.$transaction.mockResolvedValue([
        1,
        [{ id: "m-1", name: "Tacos", _count: { ingredients: 0 } }],
      ] as never);
      // Call 1 (getRecentlyScheduledMap): none. Call 2 (getLastCookedMap):
      // meal cooked three times.
      prismaMock.mealSuggestion.findMany
        .mockResolvedValueOnce([] as never)
        .mockResolvedValueOnce([
          {
            mealId: "m-1",
            dayPlan: { date: new Date("2026-05-15T00:00:00.000Z") },
          },
          {
            mealId: "m-1",
            dayPlan: { date: new Date("2026-03-02T00:00:00.000Z") },
          },
          {
            mealId: "m-1",
            dayPlan: { date: new Date("2026-01-10T00:00:00.000Z") },
          },
        ] as never);

      const result = await listMeals("fam-1");
      expect(result.items[0].timesCooked).toBe(3);
      expect(result.items[0].lastCookedOn).toBe("2026-05-15");
    });

    it("sets lastCookedOn to null when the meal has never been approved", async () => {
      prismaMock.$transaction.mockResolvedValue([
        1,
        [{ id: "m-1", name: "Tacos", _count: { ingredients: 0 } }],
      ] as never);
      // Both calls return [] → no lastCookedOn.
      const result = await listMeals("fam-1");
      expect(result.items[0].lastCookedOn).toBeNull();
      expect(result.items[0].timesCooked).toBe(0);
    });

    it("excludes placeholder meals when search is active", async () => {
      prismaMock.meal.findMany.mockResolvedValue([] as never);
      await listMeals("fam-1", { search: "pizza" } as never);
      const arg = prismaMock.meal.findMany.mock.calls[0][0] as {
        where: { placeholderKind?: unknown };
      };
      expect(arg.where.placeholderKind).toBeNull();
    });

    it("excludes placeholder meals when a difficulty filter is active", async () => {
      prismaMock.meal.findMany.mockResolvedValue([] as never);
      await listMeals("fam-1", { difficulty: ["EASY"] } as never);
      const arg = prismaMock.meal.findMany.mock.calls[0][0] as {
        where: { placeholderKind?: unknown };
      };
      expect(arg.where.placeholderKind).toBeNull();
    });

    it("does not exclude placeholders when no search or difficulty filter is active", async () => {
      prismaMock.meal.findMany.mockResolvedValue([] as never);
      await listMeals("fam-1");
      const arg = prismaMock.meal.findMany.mock.calls[0][0] as {
        where: { placeholderKind?: unknown; familyId: string };
      };
      // The `placeholderKind` key must be absent from the where clause.
      expect(arg.where).not.toHaveProperty("placeholderKind");
    });

    it("filters by favorite when the favorite flag is set", async () => {
      prismaMock.meal.findMany.mockResolvedValue([] as never);
      await listMeals("fam-1", { favorite: true } as never);
      const arg = prismaMock.meal.findMany.mock.calls[0][0] as {
        where: { favorite?: unknown; placeholderKind?: unknown };
      };
      expect(arg.where.favorite).toBe(true);
      // Filtering excludes placeholders.
      expect(arg.where.placeholderKind).toBeNull();
    });

    it("filters out favorites when favorite is false", async () => {
      prismaMock.meal.findMany.mockResolvedValue([] as never);
      await listMeals("fam-1", { favorite: false } as never);
      const arg = prismaMock.meal.findMany.mock.calls[0][0] as {
        where: { favorite?: unknown };
      };
      expect(arg.where.favorite).toBe(false);
    });

    it("filters by minRating as a gte threshold (excludes unrated meals)", async () => {
      prismaMock.meal.findMany.mockResolvedValue([] as never);
      await listMeals("fam-1", { minRating: 4 } as never);
      const arg = prismaMock.meal.findMany.mock.calls[0][0] as {
        where: { rating?: unknown; placeholderKind?: unknown };
      };
      expect(arg.where.rating).toEqual({ gte: 4 });
      expect(arg.where.placeholderKind).toBeNull();
    });

    it("filters by tags (OR-within-facet, normalized to lowercase)", async () => {
      prismaMock.meal.findMany.mockResolvedValue([] as never);
      await listMeals("fam-1", { tags: ["Quick", "VEGETARIAN"] } as never);
      const arg = prismaMock.meal.findMany.mock.calls[0][0] as {
        where: {
          tags?: { some?: { tag?: { nameNormalized?: { in?: string[] } } } };
          placeholderKind?: unknown;
        };
      };
      // OR-within-facet: any of the supplied tag names matches, normalized.
      expect(arg.where.tags?.some?.tag?.nameNormalized?.in).toEqual([
        "quick",
        "vegetarian",
      ]);
      // Filtering excludes placeholders.
      expect(arg.where.placeholderKind).toBeNull();
    });

    it("excludes placeholders when only a tag filter is active", async () => {
      prismaMock.meal.findMany.mockResolvedValue([] as never);
      await listMeals("fam-1", { tags: ["quick"] } as never);
      const arg = prismaMock.meal.findMany.mock.calls[0][0] as {
        where: { placeholderKind?: unknown };
      };
      expect(arg.where.placeholderKind).toBeNull();
    });

    it("ignores blank/whitespace-only tag names (no tag filter applied)", async () => {
      prismaMock.meal.findMany.mockResolvedValue([] as never);
      await listMeals("fam-1", { tags: ["  ", ""] } as never);
      const arg = prismaMock.meal.findMany.mock.calls[0][0] as {
        where: { tags?: unknown; placeholderKind?: unknown };
      };
      // All names blank → no tag filter, and no filter means placeholders stay.
      expect(arg.where).not.toHaveProperty("tags");
      expect(arg.where).not.toHaveProperty("placeholderKind");
    });

    // #109: collections are a third filter facet, independent of tags.
    it("filters by collections (OR-within-facet, normalized to lowercase)", async () => {
      prismaMock.meal.findMany.mockResolvedValue([] as never);
      await listMeals("fam-1", {
        collections: ["Weeknight Dinners", "HOLIDAY BAKING"],
      } as never);
      const arg = prismaMock.meal.findMany.mock.calls[0][0] as {
        where: {
          collections?: {
            some?: { recipeCollection?: { nameNormalized?: { in?: string[] } } };
          };
          placeholderKind?: unknown;
        };
      };
      expect(
        arg.where.collections?.some?.recipeCollection?.nameNormalized?.in,
      ).toEqual(["weeknight dinners", "holiday baking"]);
      // Filtering excludes placeholders.
      expect(arg.where.placeholderKind).toBeNull();
    });

    it("AND-across-facets: collection AND tag filters both applied to where", async () => {
      prismaMock.meal.findMany.mockResolvedValue([] as never);
      await listMeals("fam-1", {
        collections: ["weeknight"],
        tags: ["quick"],
      } as never);
      const arg = prismaMock.meal.findMany.mock.calls[0][0] as {
        where: {
          collections?: {
            some?: { recipeCollection?: { nameNormalized?: { in?: string[] } } };
          };
          tags?: { some?: { tag?: { nameNormalized?: { in?: string[] } } } };
        };
      };
      expect(
        arg.where.collections?.some?.recipeCollection?.nameNormalized?.in,
      ).toEqual(["weeknight"]);
      expect(arg.where.tags?.some?.tag?.nameNormalized?.in).toEqual(["quick"]);
    });

    it("ignores blank/whitespace-only collection names (no collection filter applied)", async () => {
      prismaMock.meal.findMany.mockResolvedValue([] as never);
      await listMeals("fam-1", { collections: ["  ", ""] } as never);
      const arg = prismaMock.meal.findMany.mock.calls[0][0] as {
        where: { collections?: unknown; placeholderKind?: unknown };
      };
      expect(arg.where).not.toHaveProperty("collections");
      expect(arg.where).not.toHaveProperty("placeholderKind");
    });

    it("lastCooked sort: fetches all via findMany (not $transaction), sorts nulls-last tiebreak name asc", async () => {
      prismaMock.meal.findMany.mockResolvedValue([
        { id: "m-c", name: "Zucchini soup", _count: { ingredients: 0 } },
        { id: "m-a", name: "Apple pie", _count: { ingredients: 0 } },
        { id: "m-b", name: "Banana bread", _count: { ingredients: 0 } },
      ] as never);
      // No suggestions → all lastCookedOn = null → sort by name asc (tiebreak).

      const result = await listMeals("fam-1", {
        sort: "lastCooked",
        order: "asc",
        limit: 25,
        offset: 0,
      } as never);

      expect(result.items.map((m) => m.name)).toEqual([
        "Apple pie",
        "Banana bread",
        "Zucchini soup",
      ]);
      expect(result.items.every((m) => m.lastCookedOn === null)).toBe(true);
      // lastCooked sort does NOT use $transaction.
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it("lastCooked sort: meals with a lastCookedOn date sort before null entries (asc)", async () => {
      prismaMock.meal.findMany.mockResolvedValue([
        { id: "m-1", name: "Never cooked", _count: { ingredients: 0 } },
        { id: "m-2", name: "Often cooked", _count: { ingredients: 0 } },
      ] as never);
      prismaMock.mealSuggestion.findMany
        .mockResolvedValueOnce([] as never) // getRecentlyScheduledMap
        .mockResolvedValueOnce([
          {
            mealId: "m-2",
            dayPlan: { date: new Date("2026-05-01T00:00:00.000Z") },
          },
        ] as never); // getLastCookedMap

      const result = await listMeals("fam-1", {
        sort: "lastCooked",
        order: "asc",
        limit: 25,
        offset: 0,
      } as never);

      expect(result.items[0].name).toBe("Often cooked");
      expect(result.items[1].name).toBe("Never cooked");
    });

    it("lastCooked sort desc: most recently cooked first, nulls still last", async () => {
      prismaMock.meal.findMany.mockResolvedValue([
        { id: "m-1", name: "Old cook", _count: { ingredients: 0 } },
        { id: "m-2", name: "New cook", _count: { ingredients: 0 } },
        { id: "m-3", name: "Never", _count: { ingredients: 0 } },
      ] as never);
      prismaMock.mealSuggestion.findMany
        .mockResolvedValueOnce([] as never) // getRecentlyScheduledMap
        .mockResolvedValueOnce([
          {
            mealId: "m-1",
            dayPlan: { date: new Date("2026-03-01T00:00:00.000Z") },
          },
          {
            mealId: "m-2",
            dayPlan: { date: new Date("2026-06-01T00:00:00.000Z") },
          },
        ] as never); // getLastCookedMap

      const result = await listMeals("fam-1", {
        sort: "lastCooked",
        order: "desc",
        limit: 25,
        offset: 0,
      } as never);

      expect(result.items.map((m) => m.name)).toEqual([
        "New cook",
        "Old cook",
        "Never",
      ]);
      // timesCooked is threaded through the lastCooked-sort projection path too.
      const byName = new Map(result.items.map((m) => [m.name, m]));
      expect(byName.get("New cook")?.timesCooked).toBe(1);
      expect(byName.get("Old cook")?.timesCooked).toBe(1);
      expect(byName.get("Never")?.timesCooked).toBe(0);
      expect(byName.get("Never")?.lastCookedOn).toBeNull();
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

    // #100: instructions are included, ordered by position ascending.
    it("includes instructions ordered by position asc", async () => {
      prismaMock.meal.findFirst.mockResolvedValue({
        id: "m-1",
        ingredients: [],
        instructions: [
          { position: 0, text: "Chop", timerMinutes: null },
          { position: 1, text: "Cook", timerMinutes: 5 },
        ],
        tags: [],
      } as never);

      const result = await getMealById("m-1", "fam-1");

      const arg = prismaMock.meal.findFirst.mock.calls[0][0] as {
        include: { instructions: { orderBy: { position: string } } };
      };
      expect(arg.include.instructions).toEqual({
        orderBy: { position: "asc" },
      });
      expect(
        (result as { instructions: { text: string }[] }).instructions.map(
          (s) => s.text,
        ),
      ).toEqual(["Chop", "Cook"]);
    });

    // #100: cross-family isolation — a meal in another family is not found and
    // no instructions leak. Family scoping is enforced through the Meal lookup.
    it("returns null when the meal belongs to another family (no leak)", async () => {
      prismaMock.meal.findFirst.mockResolvedValue(null);
      const result = await getMealById("m-1", "other-fam");
      expect(result).toBeNull();
      expect(prismaMock.meal.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "m-1", familyId: "other-fam" },
        }),
      );
    });
  });

  // The tabular ("Grid") recipe read path (spec §3.3/§3.4). getMealById enriches
  // every detail read with the derived-or-authored matrix via deriveRecipeMatrix.
  // The anti-staleness contract is load-bearing here: derive ONLY when nothing is
  // authored, pass an authored layout through untouched, and NEVER write it back.
  describe("tabular recipe matrix (Grid read path)", () => {
    // A persisted ingredient row as MEAL_DETAIL_INCLUDE returns it (groupLabel is
    // the authored override; null → derive from category at read time).
    function ingredientRow(
      position: number,
      name: string,
      category: string | null,
      groupLabel: string | null = null,
    ) {
      return {
        id: `ing-${position}`,
        mealId: "m-1",
        name,
        quantity: null,
        unit: null,
        category,
        position,
        groupLabel,
      };
    }

    // A persisted instruction row. kind defaults to PROCESS; the authored layout
    // overrides (subLabel/spanFrom/spanTo) are null unless a meal was authored.
    function instructionRow(
      position: number,
      text: string,
      overrides: {
        kind?: "SETUP" | "PROCESS" | "FINISH";
        subLabel?: string | null;
        spanFrom?: number | null;
        spanTo?: number | null;
      } = {},
    ) {
      return {
        id: `ins-${position}`,
        mealId: "m-1",
        position,
        text,
        timerMinutes: null,
        kind: overrides.kind ?? "PROCESS",
        subLabel: overrides.subLabel ?? null,
        spanFrom: overrides.spanFrom ?? null,
        spanTo: overrides.spanTo ?? null,
      };
    }

    it("derives the matrix on read for an unauthored meal (matrixSource='derived')", async () => {
      prismaMock.meal.findFirst.mockResolvedValue({
        id: "m-1",
        ingredients: [
          ingredientRow(0, "flour", "pantry"),
          ingredientRow(1, "sugar", "pantry"),
          ingredientRow(2, "butter", "dairy"),
        ],
        instructions: [
          instructionRow(0, "Preheat oven to 350°F"),
          instructionRow(1, "Mix flour and sugar"),
          instructionRow(2, "Cream the butter for 5 min"),
          instructionRow(3, "Serve warm"),
        ],
        tags: [],
      } as never);

      const result = (await getMealById("m-1", "fam-1")) as unknown as {
        matrixSource: string;
        ingredients: { position: number; groupLabel: string | null }[];
        instructions: {
          kind: string;
          subLabel: string | null;
          spanFrom: number | null;
          spanTo: number | null;
        }[];
      };

      expect(result.matrixSource).toBe("derived");
      // Effective group label = authored groupLabel (none) ?? category. Contiguous
      // equal categories form one group: rows 0–1 "pantry", row 2 "dairy".
      expect(result.ingredients.map((i) => i.groupLabel)).toEqual([
        "pantry",
        "pantry",
        "dairy",
      ]);
      // Leading setup verb naming no ingredient → SETUP band, temp subLabel.
      expect(result.instructions[0]).toMatchObject({
        kind: "SETUP",
        subLabel: "350°F",
        spanFrom: null,
        spanTo: null,
      });
      // "Mix flour and sugar" spans rows 0–1; "Cream the butter" spans row 2.
      expect(result.instructions[1]).toMatchObject({
        kind: "PROCESS",
        spanFrom: 0,
        spanTo: 1,
      });
      expect(result.instructions[2]).toMatchObject({
        kind: "PROCESS",
        spanFrom: 2,
        spanTo: 2,
        subLabel: "5 min",
      });
      // Trailing finish verb naming no ingredient → FINISH note.
      expect(result.instructions[3]).toMatchObject({
        kind: "FINISH",
        spanFrom: null,
        spanTo: null,
      });
    });

    it("passes an authored layout through untouched and NEVER clobbers it (matrixSource='authored')", async () => {
      // One instruction carries an authored span → the whole meal is authored.
      // The authored SETUP kind on step 1 must survive even though its text
      // ("Combine flour") would otherwise derive to PROCESS — editing step text
      // must never re-derive over an authored layout.
      prismaMock.meal.findFirst.mockResolvedValue({
        id: "m-1",
        ingredients: [
          ingredientRow(0, "flour", "pantry", "Dry"),
          ingredientRow(1, "butter", "dairy"),
        ],
        instructions: [
          instructionRow(0, "Combine flour", {
            kind: "SETUP",
            subLabel: "authored-note",
            spanFrom: null,
            spanTo: null,
          }),
          instructionRow(1, "Blend everything", {
            kind: "PROCESS",
            spanFrom: 0,
            spanTo: 1,
          }),
        ],
        tags: [],
      } as never);

      const result = (await getMealById("m-1", "fam-1")) as unknown as {
        matrixSource: string;
        ingredients: { groupLabel: string | null }[];
        instructions: {
          kind: string;
          subLabel: string | null;
          spanFrom: number | null;
          spanTo: number | null;
        }[];
      };

      expect(result.matrixSource).toBe("authored");
      // Authored groupLabel wins over category ("Dry", not "pantry").
      expect(result.ingredients.map((i) => i.groupLabel)).toEqual([
        "Dry",
        "dairy",
      ]);
      // Authored fields pass through verbatim — no re-derivation.
      expect(result.instructions[0]).toMatchObject({
        kind: "SETUP",
        subLabel: "authored-note",
        spanFrom: null,
        spanTo: null,
      });
      expect(result.instructions[1]).toMatchObject({
        kind: "PROCESS",
        spanFrom: 0,
        spanTo: 1,
      });
    });

    it("returns ingredients ordered by position, so spanFrom/spanTo index correctly even when rows arrive unordered", async () => {
      // Simulate rows arriving out of position order; applyRecipeMatrix must sort
      // by position before indexing. "cheese" is row 2 after sorting.
      prismaMock.meal.findFirst.mockResolvedValue({
        id: "m-1",
        ingredients: [
          ingredientRow(2, "cheese", "dairy"),
          ingredientRow(0, "pasta", "pantry"),
          ingredientRow(1, "tomato", "produce"),
        ],
        instructions: [instructionRow(0, "Top the pasta with cheese")],
        tags: [],
      } as never);

      const result = (await getMealById("m-1", "fam-1")) as unknown as {
        ingredients: { position: number; name: string }[];
        instructions: { spanFrom: number | null; spanTo: number | null }[];
      };

      expect(result.ingredients.map((i) => i.name)).toEqual([
        "pasta",
        "tomato",
        "cheese",
      ]);
      // pasta = row 0, cheese = row 2 → span 0..2.
      expect(result.instructions[0]).toMatchObject({ spanFrom: 0, spanTo: 2 });
    });

    it("spans ALL rows for a PROCESS step that names no ingredient (intentional degenerate case)", async () => {
      prismaMock.meal.findFirst.mockResolvedValue({
        id: "m-1",
        ingredients: [
          ingredientRow(0, "flour", "pantry"),
          ingredientRow(1, "butter", "dairy"),
        ],
        instructions: [instructionRow(0, "Stir until combined")],
        tags: [],
      } as never);

      const result = (await getMealById("m-1", "fam-1")) as unknown as {
        matrixSource: string;
        instructions: { spanFrom: number | null; spanTo: number | null }[];
      };

      expect(result.matrixSource).toBe("derived");
      expect(result.instructions[0]).toMatchObject({ spanFrom: 0, spanTo: 1 });
    });
  });

  describe("createMeal", () => {
    beforeEach(() => {
      // createMeal re-fetches the meal with taxonomy joins after mutating.
      // Default to an empty-taxonomy row so tests that don't care about
      // tags don't have to wire the re-fetch themselves.
      prismaMock.meal.findUniqueOrThrow.mockResolvedValue({
        id: "m-1",
        ingredients: [],
        instructions: [],
        tags: [],
      } as never);
    });

    it("creates a meal with nested ingredients in a transaction", async () => {
      stubTransaction();
      const created = { id: "m-1", name: "Tacos" };
      prismaMock.meal.create.mockResolvedValue(created as never);

      const result = await createMeal("fam-1", {
        name: "Tacos",
        ingredients: [{ name: "tortilla", quantity: "6" }],
      });

      expect(result).toMatchObject({ id: "m-1", tags: [] });
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

    it("persists core metadata fields when provided", async () => {
      stubTransaction();
      prismaMock.meal.create.mockResolvedValue({ id: "m-6" } as never);
      await createMeal("fam-1", {
        name: "Tacos",
        prepTimeMinutes: 10,
        cookTimeMinutes: 20,
        servings: 4,
        sourceUrl: "https://example.com/tacos",
        imageUrl: "https://cdn.example.com/tacos.jpg",
        notes: "Use fresh cilantro",
      });
      const arg = prismaMock.meal.create.mock.calls[0][0] as {
        data: {
          prepTimeMinutes?: unknown;
          cookTimeMinutes?: unknown;
          servings?: unknown;
          sourceUrl?: unknown;
          imageUrl?: unknown;
          notes?: unknown;
        };
      };
      expect(arg.data.prepTimeMinutes).toBe(10);
      expect(arg.data.cookTimeMinutes).toBe(20);
      expect(arg.data.servings).toBe(4);
      expect(arg.data.sourceUrl).toBe("https://example.com/tacos");
      expect(arg.data.imageUrl).toBe("https://cdn.example.com/tacos.jpg");
      expect(arg.data.notes).toBe("Use fresh cilantro");
    });

    it("passes through null metadata fields (clearing on create)", async () => {
      stubTransaction();
      prismaMock.meal.create.mockResolvedValue({ id: "m-7" } as never);
      await createMeal("fam-1", {
        name: "Soup",
        prepTimeMinutes: null,
        sourceUrl: null,
        imageUrl: null,
        notes: null,
      });
      const arg = prismaMock.meal.create.mock.calls[0][0] as {
        data: {
          prepTimeMinutes?: unknown;
          sourceUrl?: unknown;
          imageUrl?: unknown;
          notes?: unknown;
        };
      };
      expect(arg.data.prepTimeMinutes).toBeNull();
      expect(arg.data.sourceUrl).toBeNull();
      expect(arg.data.imageUrl).toBeNull();
      expect(arg.data.notes).toBeNull();
    });

    it("persists favorite and rating when provided", async () => {
      stubTransaction();
      prismaMock.meal.create.mockResolvedValue({ id: "m-8" } as never);
      await createMeal("fam-1", { name: "Tacos", favorite: true, rating: 5 });
      const arg = prismaMock.meal.create.mock.calls[0][0] as {
        data: { favorite?: unknown; rating?: unknown };
      };
      expect(arg.data.favorite).toBe(true);
      expect(arg.data.rating).toBe(5);
    });

    it("passes through null rating (clearing on create)", async () => {
      stubTransaction();
      prismaMock.meal.create.mockResolvedValue({ id: "m-9" } as never);
      await createMeal("fam-1", { name: "Soup", rating: null });
      const arg = prismaMock.meal.create.mock.calls[0][0] as {
        data: { rating?: unknown };
      };
      expect(arg.data.rating).toBeNull();
    });

    it("assigns tags by name within the family transaction", async () => {
      stubTransaction();
      prismaMock.meal.create.mockResolvedValue({ id: "m-1" } as never);
      prismaMock.tag.upsert.mockResolvedValue({ id: "t-1" } as never);
      prismaMock.mealTag.deleteMany.mockResolvedValue({ count: 0 } as never);
      prismaMock.mealTag.createMany.mockResolvedValue({ count: 1 } as never);

      await createMeal("fam-1", {
        name: "Tacos",
        tags: ["Quick"],
      } as never);

      // Tag resolved via family-scoped upsert, then joined to the new meal.
      const tagUpsert = prismaMock.tag.upsert.mock.calls[0][0] as {
        where: { familyId_nameNormalized: unknown };
      };
      expect(tagUpsert.where.familyId_nameNormalized).toEqual({
        familyId: "fam-1",
        nameNormalized: "quick",
      });
      expect(prismaMock.mealTag.createMany).toHaveBeenCalledWith({
        data: [{ mealId: "m-1", tagId: "t-1" }],
        skipDuplicates: true,
      });
    });

    it("does not touch taxonomy joins when tags are omitted", async () => {
      stubTransaction();
      prismaMock.meal.create.mockResolvedValue({ id: "m-1" } as never);
      await createMeal("fam-1", { name: "Plain" });
      expect(prismaMock.tag.upsert).not.toHaveBeenCalled();
      expect(prismaMock.mealTag.deleteMany).not.toHaveBeenCalled();
    });

    // #109: collections assign by name inside the same family transaction,
    // upsert-by-(family, normalized name), then replace-set the join rows.
    it("assigns collections by name within the family transaction", async () => {
      stubTransaction();
      prismaMock.meal.create.mockResolvedValue({ id: "m-1" } as never);
      prismaMock.recipeCollection.upsert.mockResolvedValue({
        id: "col-1",
      } as never);
      prismaMock.mealRecipeCollection.deleteMany.mockResolvedValue({
        count: 0,
      } as never);
      prismaMock.mealRecipeCollection.createMany.mockResolvedValue({
        count: 1,
      } as never);

      await createMeal("fam-1", {
        name: "Tacos",
        collections: ["Weeknight Dinners"],
      } as never);

      const upsert = prismaMock.recipeCollection.upsert.mock.calls[0][0] as {
        where: { familyId_nameNormalized: unknown };
      };
      expect(upsert.where.familyId_nameNormalized).toEqual({
        familyId: "fam-1",
        nameNormalized: "weeknight dinners",
      });
      expect(prismaMock.mealRecipeCollection.createMany).toHaveBeenCalledWith({
        data: [{ mealId: "m-1", recipeCollectionId: "col-1" }],
        skipDuplicates: true,
      });
    });

    it("does not touch collection joins when collections are omitted", async () => {
      stubTransaction();
      prismaMock.meal.create.mockResolvedValue({ id: "m-1" } as never);
      await createMeal("fam-1", { name: "Plain" });
      expect(prismaMock.recipeCollection.upsert).not.toHaveBeenCalled();
      expect(
        prismaMock.mealRecipeCollection.deleteMany,
      ).not.toHaveBeenCalled();
    });

    // #100: instructions are nested-created with a dense 0-based position that
    // preserves input order.
    it("nested-creates instructions with 0-based position in input order", async () => {
      stubTransaction();
      prismaMock.meal.create.mockResolvedValue({ id: "m-1" } as never);

      await createMeal("fam-1", {
        name: "Tacos",
        instructions: [
          { text: "Warm tortillas" },
          { text: "Simmer 10 min", timerMinutes: 10 },
          { text: "Assemble" },
        ],
      });

      const arg = prismaMock.meal.create.mock.calls[0][0] as {
        data: {
          instructions?: {
            create: { text: string; timerMinutes: number | null; position: number }[];
          };
        };
      };
      expect(arg.data.instructions?.create).toEqual([
        { text: "Warm tortillas", timerMinutes: null, position: 0 },
        { text: "Simmer 10 min", timerMinutes: 10, position: 1 },
        { text: "Assemble", timerMinutes: null, position: 2 },
      ]);
    });

    // Tabular Grid: ingredients are nested-created with a dense 0-based position
    // from input array order (spec §3.2 — order already conveys row order, so no
    // new input field), exactly mirroring the instruction position contract.
    it("nested-creates ingredients with 0-based position in input order", async () => {
      stubTransaction();
      prismaMock.meal.create.mockResolvedValue({ id: "m-1" } as never);

      await createMeal("fam-1", {
        name: "Cake",
        ingredients: [
          { name: "flour", quantity: "2", unit: "cups" },
          { name: "sugar" },
          { name: "butter" },
        ],
      });

      const arg = prismaMock.meal.create.mock.calls[0][0] as {
        data: {
          ingredients?: { create: { name: string; position: number }[] };
        };
      };
      expect(
        arg.data.ingredients?.create.map((c) => ({
          name: c.name,
          position: c.position,
        })),
      ).toEqual([
        { name: "flour", position: 0 },
        { name: "sugar", position: 1 },
        { name: "butter", position: 2 },
      ]);
    });

    it("omits the instructions clause when none are provided", async () => {
      stubTransaction();
      prismaMock.meal.create.mockResolvedValue({ id: "m-1" } as never);
      await createMeal("fam-1", { name: "Plain" });
      const arg = prismaMock.meal.create.mock.calls[0][0] as {
        data: { instructions?: unknown };
      };
      expect(arg.data.instructions).toBeUndefined();
    });

    it("omits the instructions clause for an empty array", async () => {
      stubTransaction();
      prismaMock.meal.create.mockResolvedValue({ id: "m-1" } as never);
      await createMeal("fam-1", { name: "Plain", instructions: [] });
      const arg = prismaMock.meal.create.mock.calls[0][0] as {
        data: { instructions?: unknown };
      };
      expect(arg.data.instructions).toBeUndefined();
    });
  });

  describe("updateMeal", () => {
    beforeEach(() => {
      // updateMeal re-fetches the meal with taxonomy joins after mutating.
      prismaMock.meal.findUniqueOrThrow.mockResolvedValue({
        id: "m-1",
        ingredients: [],
        instructions: [],
        tags: [],
      } as never);
    });

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

    // Tabular Grid: the replace path re-assigns a dense 0-based position from the
    // new input array order, so a re-authored ingredient list keeps stable row
    // indices for spanFrom/spanTo. Mirrors the instruction replace contract.
    it("replace-sets ingredient position from input order", async () => {
      stubTransaction();
      prismaMock.meal.findFirst.mockResolvedValue({
        id: "m-1",
        placeholderKind: null,
      } as never);
      prismaMock.mealIngredient.deleteMany.mockResolvedValue({
        count: 3,
      } as never);
      prismaMock.meal.update.mockResolvedValue({ id: "m-1" } as never);

      await updateMeal("m-1", "fam-1", {
        name: "Updated",
        ingredients: [{ name: "eggs" }, { name: "milk" }, { name: "flour" }],
      });

      const arg = prismaMock.meal.update.mock.calls[0][0] as {
        data: {
          ingredients?: { create: { name: string; position: number }[] };
        };
      };
      expect(
        arg.data.ingredients?.create.map((c) => [c.position, c.name]),
      ).toEqual([
        [0, "eggs"],
        [1, "milk"],
        [2, "flour"],
      ]);
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

    it("persists core metadata fields when provided", async () => {
      stubTransaction();
      prismaMock.meal.findFirst.mockResolvedValue({
        id: "m-1",
        placeholderKind: null,
      } as never);
      prismaMock.meal.update.mockResolvedValue({ id: "m-1" } as never);

      await updateMeal("m-1", "fam-1", {
        prepTimeMinutes: 15,
        cookTimeMinutes: 30,
        servings: 6,
        sourceUrl: "https://example.com/stew",
        imageUrl: "https://cdn.example.com/stew.png",
        notes: "Simmer low and slow",
      });

      const arg = prismaMock.meal.update.mock.calls[0][0] as {
        data: {
          prepTimeMinutes?: unknown;
          cookTimeMinutes?: unknown;
          servings?: unknown;
          sourceUrl?: unknown;
          imageUrl?: unknown;
          notes?: unknown;
        };
      };
      expect(arg.data.prepTimeMinutes).toBe(15);
      expect(arg.data.cookTimeMinutes).toBe(30);
      expect(arg.data.servings).toBe(6);
      expect(arg.data.sourceUrl).toBe("https://example.com/stew");
      expect(arg.data.imageUrl).toBe("https://cdn.example.com/stew.png");
      expect(arg.data.notes).toBe("Simmer low and slow");
    });

    it("clears metadata fields to null when null", async () => {
      stubTransaction();
      prismaMock.meal.findFirst.mockResolvedValue({
        id: "m-1",
        placeholderKind: null,
      } as never);
      prismaMock.meal.update.mockResolvedValue({ id: "m-1" } as never);

      await updateMeal("m-1", "fam-1", {
        prepTimeMinutes: null,
        cookTimeMinutes: null,
        servings: null,
        sourceUrl: null,
        imageUrl: null,
        notes: null,
      });

      const arg = prismaMock.meal.update.mock.calls[0][0] as {
        data: {
          prepTimeMinutes?: unknown;
          cookTimeMinutes?: unknown;
          servings?: unknown;
          sourceUrl?: unknown;
          imageUrl?: unknown;
          notes?: unknown;
        };
      };
      expect(arg.data.prepTimeMinutes).toBeNull();
      expect(arg.data.cookTimeMinutes).toBeNull();
      expect(arg.data.servings).toBeNull();
      expect(arg.data.sourceUrl).toBeNull();
      expect(arg.data.imageUrl).toBeNull();
      expect(arg.data.notes).toBeNull();
    });

    it("leaves metadata fields untouched when omitted", async () => {
      stubTransaction();
      prismaMock.meal.findFirst.mockResolvedValue({
        id: "m-1",
        placeholderKind: null,
      } as never);
      prismaMock.meal.update.mockResolvedValue({ id: "m-1" } as never);

      await updateMeal("m-1", "fam-1", { name: "Renamed" });

      const arg = prismaMock.meal.update.mock.calls[0][0] as {
        data: {
          prepTimeMinutes?: unknown;
          sourceUrl?: unknown;
          imageUrl?: unknown;
          notes?: unknown;
        };
      };
      expect(arg.data.prepTimeMinutes).toBeUndefined();
      expect(arg.data.sourceUrl).toBeUndefined();
      expect(arg.data.imageUrl).toBeUndefined();
      expect(arg.data.notes).toBeUndefined();
    });

    it("persists favorite and rating, and clears rating to null", async () => {
      stubTransaction();
      prismaMock.meal.findFirst.mockResolvedValue({
        id: "m-1",
        placeholderKind: null,
      } as never);
      prismaMock.meal.update.mockResolvedValue({ id: "m-1" } as never);

      await updateMeal("m-1", "fam-1", { favorite: false, rating: null });

      const arg = prismaMock.meal.update.mock.calls[0][0] as {
        data: { favorite?: unknown; rating?: unknown };
      };
      expect(arg.data.favorite).toBe(false);
      expect(arg.data.rating).toBeNull();
    });

    it("leaves favorite and rating untouched when omitted", async () => {
      stubTransaction();
      prismaMock.meal.findFirst.mockResolvedValue({
        id: "m-1",
        placeholderKind: null,
      } as never);
      prismaMock.meal.update.mockResolvedValue({ id: "m-1" } as never);

      await updateMeal("m-1", "fam-1", { name: "Renamed" });

      const arg = prismaMock.meal.update.mock.calls[0][0] as {
        data: { favorite?: unknown; rating?: unknown };
      };
      expect(arg.data.favorite).toBeUndefined();
      expect(arg.data.rating).toBeUndefined();
    });

    it("replace-sets tags when tags is provided (clears then re-creates)", async () => {
      stubTransaction();
      prismaMock.meal.findFirst.mockResolvedValue({
        id: "m-1",
        placeholderKind: null,
      } as never);
      prismaMock.meal.update.mockResolvedValue({ id: "m-1" } as never);
      prismaMock.tag.upsert.mockResolvedValue({ id: "t-9" } as never);
      prismaMock.mealTag.deleteMany.mockResolvedValue({ count: 1 } as never);
      prismaMock.mealTag.createMany.mockResolvedValue({ count: 1 } as never);

      await updateMeal("m-1", "fam-1", { tags: ["Weeknight"] } as never);

      // Existing joins cleared before the new set is written.
      expect(prismaMock.mealTag.deleteMany).toHaveBeenCalledWith({
        where: { mealId: "m-1" },
      });
      const tagUpsert = prismaMock.tag.upsert.mock.calls[0][0] as {
        where: { familyId_nameNormalized: unknown };
      };
      expect(tagUpsert.where.familyId_nameNormalized).toEqual({
        familyId: "fam-1",
        nameNormalized: "weeknight",
      });
      expect(prismaMock.mealTag.createMany).toHaveBeenCalledWith({
        data: [{ mealId: "m-1", tagId: "t-9" }],
        skipDuplicates: true,
      });
    });

    it("clears all tags when tags is an empty array (delete, no create)", async () => {
      stubTransaction();
      prismaMock.meal.findFirst.mockResolvedValue({
        id: "m-1",
        placeholderKind: null,
      } as never);
      prismaMock.meal.update.mockResolvedValue({ id: "m-1" } as never);
      prismaMock.mealTag.deleteMany.mockResolvedValue({ count: 2 } as never);

      await updateMeal("m-1", "fam-1", { tags: [] } as never);

      expect(prismaMock.mealTag.deleteMany).toHaveBeenCalledWith({
        where: { mealId: "m-1" },
      });
      expect(prismaMock.mealTag.createMany).not.toHaveBeenCalled();
      expect(prismaMock.tag.upsert).not.toHaveBeenCalled();
    });

    it("leaves taxonomy joins untouched when tags are omitted", async () => {
      stubTransaction();
      prismaMock.meal.findFirst.mockResolvedValue({
        id: "m-1",
        placeholderKind: null,
      } as never);
      prismaMock.meal.update.mockResolvedValue({ id: "m-1" } as never);

      await updateMeal("m-1", "fam-1", { name: "Renamed" });

      expect(prismaMock.mealTag.deleteMany).not.toHaveBeenCalled();
      expect(prismaMock.tag.upsert).not.toHaveBeenCalled();
    });

    it("does not assign taxonomy to a placeholder meal (guard runs first)", async () => {
      stubTransaction();
      prismaMock.meal.findFirst.mockResolvedValue({
        id: "m-1",
        placeholderKind: "FREE_DAY",
      } as never);

      await expect(
        updateMeal("m-1", "fam-1", { tags: ["Quick"] } as never),
      ).rejects.toThrow(/Cannot modify placeholder/);
      // Guard rejects before any taxonomy mutation.
      expect(prismaMock.mealTag.deleteMany).not.toHaveBeenCalled();
      expect(prismaMock.tag.upsert).not.toHaveBeenCalled();
    });

    // #100: replace-all-on-update — passing instructions deletes the existing
    // ordered steps and recreates them from the input array (reindexed).
    it("replace-alls instructions when instructions is provided", async () => {
      stubTransaction();
      prismaMock.meal.findFirst.mockResolvedValue({
        id: "m-1",
        placeholderKind: null,
      } as never);
      prismaMock.mealInstruction.deleteMany.mockResolvedValue({
        count: 3,
      } as never);
      prismaMock.meal.update.mockResolvedValue({ id: "m-1" } as never);

      await updateMeal("m-1", "fam-1", {
        instructions: [{ text: "New step 1" }, { text: "New step 2" }],
      } as never);

      // Existing steps cleared before the new set is written.
      expect(prismaMock.mealInstruction.deleteMany).toHaveBeenCalledWith({
        where: { mealId: "m-1" },
      });
      const arg = prismaMock.meal.update.mock.calls[0][0] as {
        data: {
          instructions?: {
            create: { text: string; timerMinutes: number | null; position: number }[];
          };
        };
      };
      expect(arg.data.instructions?.create).toEqual([
        { text: "New step 1", timerMinutes: null, position: 0 },
        { text: "New step 2", timerMinutes: null, position: 1 },
      ]);
    });

    it("clears all instructions when instructions is an empty array (delete, no create)", async () => {
      stubTransaction();
      prismaMock.meal.findFirst.mockResolvedValue({
        id: "m-1",
        placeholderKind: null,
      } as never);
      prismaMock.mealInstruction.deleteMany.mockResolvedValue({
        count: 2,
      } as never);
      prismaMock.meal.update.mockResolvedValue({ id: "m-1" } as never);

      await updateMeal("m-1", "fam-1", { instructions: [] } as never);

      expect(prismaMock.mealInstruction.deleteMany).toHaveBeenCalledWith({
        where: { mealId: "m-1" },
      });
      const arg = prismaMock.meal.update.mock.calls[0][0] as {
        data: { instructions?: { create: unknown[] } };
      };
      // Empty array clears: deleteMany runs, but no rows are recreated.
      expect(arg.data.instructions?.create).toEqual([]);
    });

    it("leaves instructions untouched when instructions is omitted", async () => {
      stubTransaction();
      prismaMock.meal.findFirst.mockResolvedValue({
        id: "m-1",
        placeholderKind: null,
      } as never);
      prismaMock.meal.update.mockResolvedValue({ id: "m-1" } as never);

      await updateMeal("m-1", "fam-1", { name: "Renamed" });

      expect(prismaMock.mealInstruction.deleteMany).not.toHaveBeenCalled();
      const arg = prismaMock.meal.update.mock.calls[0][0] as {
        data: { instructions?: unknown };
      };
      expect(arg.data.instructions).toBeUndefined();
    });

    it("rejects instructions on a placeholder meal (guard runs first)", async () => {
      stubTransaction();
      prismaMock.meal.findFirst.mockResolvedValue({
        id: "m-1",
        placeholderKind: "LEFTOVERS",
      } as never);

      await expect(
        updateMeal("m-1", "fam-1", {
          instructions: [{ text: "Nope" }],
        } as never),
      ).rejects.toThrow(/Cannot modify placeholder/);
      expect(prismaMock.mealInstruction.deleteMany).not.toHaveBeenCalled();
    });

    it("rejects instruction updates for a meal in another family (no leak)", async () => {
      stubTransaction();
      prismaMock.meal.findFirst.mockResolvedValue(null);

      await expect(
        updateMeal("m-1", "other-fam", {
          instructions: [{ text: "Nope" }],
        } as never),
      ).rejects.toThrow(/Meal not found/);
      expect(prismaMock.mealInstruction.deleteMany).not.toHaveBeenCalled();
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

    it("persists difficulty on a newly created meal", async () => {
      stubTransaction();
      prismaMock.meal.findFirst.mockResolvedValue(null);
      prismaMock.meal.create.mockResolvedValue({ id: "m-new" } as never);

      await importMeals("fam-1", [{ name: "Tacos", difficulty: "HARD" }]);
      const arg = prismaMock.meal.create.mock.calls[0][0] as {
        data: { difficulty?: unknown };
      };
      expect(arg.data.difficulty).toBe("HARD");
    });

    it("persists core metadata on a newly created meal", async () => {
      stubTransaction();
      prismaMock.meal.findFirst.mockResolvedValue(null);
      prismaMock.meal.create.mockResolvedValue({ id: "m-new" } as never);

      await importMeals("fam-1", [
        {
          name: "Tacos",
          prepTimeMinutes: 10,
          cookTimeMinutes: 20,
          servings: 4,
          sourceUrl: "https://example.com/tacos",
          imageUrl: "https://cdn.example.com/tacos.jpg",
          notes: "Weeknight favorite",
        },
      ]);
      const arg = prismaMock.meal.create.mock.calls[0][0] as {
        data: {
          prepTimeMinutes?: unknown;
          cookTimeMinutes?: unknown;
          servings?: unknown;
          sourceUrl?: unknown;
          imageUrl?: unknown;
          notes?: unknown;
        };
      };
      expect(arg.data.prepTimeMinutes).toBe(10);
      expect(arg.data.cookTimeMinutes).toBe(20);
      expect(arg.data.servings).toBe(4);
      expect(arg.data.sourceUrl).toBe("https://example.com/tacos");
      expect(arg.data.imageUrl).toBe("https://cdn.example.com/tacos.jpg");
      expect(arg.data.notes).toBe("Weeknight favorite");
    });

    it("persists core metadata when replacing an existing meal", async () => {
      stubTransaction();
      prismaMock.meal.findFirst.mockResolvedValue({ id: "m-old" } as never);
      prismaMock.mealIngredient.deleteMany.mockResolvedValue({
        count: 0,
      } as never);
      prismaMock.meal.update.mockResolvedValue({ id: "m-old" } as never);

      await importMeals(
        "fam-1",
        [{ name: "Tacos", prepTimeMinutes: 5, servings: 2 }],
        { mode: "replace" },
      );
      const arg = prismaMock.meal.update.mock.calls[0][0] as {
        data: { prepTimeMinutes?: unknown; servings?: unknown };
      };
      expect(arg.data.prepTimeMinutes).toBe(5);
      expect(arg.data.servings).toBe(2);
    });

    it("persists favorite and rating on import", async () => {
      stubTransaction();
      prismaMock.meal.findFirst.mockResolvedValue(null);
      prismaMock.meal.create.mockResolvedValue({ id: "m-new" } as never);

      await importMeals("fam-1", [
        { name: "Tacos", favorite: true, rating: 5 },
      ]);
      const arg = prismaMock.meal.create.mock.calls[0][0] as {
        data: { favorite?: unknown; rating?: unknown };
      };
      expect(arg.data.favorite).toBe(true);
      expect(arg.data.rating).toBe(5);
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

    it("persists difficulty when replacing an existing meal", async () => {
      stubTransaction();
      prismaMock.meal.findFirst.mockResolvedValue({ id: "m-old" } as never);
      prismaMock.mealIngredient.deleteMany.mockResolvedValue({
        count: 0,
      } as never);
      prismaMock.meal.update.mockResolvedValue({ id: "m-old" } as never);

      await importMeals("fam-1", [{ name: "Tacos", difficulty: "MEDIUM" }], {
        mode: "replace",
      });
      const arg = prismaMock.meal.update.mock.calls[0][0] as {
        data: { difficulty?: unknown };
      };
      expect(arg.data.difficulty).toBe("MEDIUM");
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

    it("resolves and assigns tags by name on a newly created meal", async () => {
      stubTransaction();
      prismaMock.meal.findFirst.mockResolvedValue(null);
      prismaMock.meal.create.mockResolvedValue({ id: "m-new" } as never);
      prismaMock.tag.upsert.mockResolvedValue({ id: "t-1" } as never);
      prismaMock.mealTag.deleteMany.mockResolvedValue({ count: 0 } as never);
      prismaMock.mealTag.createMany.mockResolvedValue({ count: 1 } as never);

      const result = await importMeals("fam-1", [
        { name: "Tacos", tags: ["Quick"] },
      ]);

      expect(result.created).toBe(1);
      const tagUpsert = prismaMock.tag.upsert.mock.calls[0][0] as {
        where: { familyId_nameNormalized: unknown };
      };
      expect(tagUpsert.where.familyId_nameNormalized).toEqual({
        familyId: "fam-1",
        nameNormalized: "quick",
      });
      expect(prismaMock.mealTag.createMany).toHaveBeenCalledWith({
        data: [{ mealId: "m-new", tagId: "t-1" }],
        skipDuplicates: true,
      });
    });

    it("re-syncs tags when replacing an existing meal", async () => {
      stubTransaction();
      prismaMock.meal.findFirst.mockResolvedValue({ id: "m-old" } as never);
      prismaMock.mealIngredient.deleteMany.mockResolvedValue({
        count: 0,
      } as never);
      prismaMock.meal.update.mockResolvedValue({ id: "m-old" } as never);
      prismaMock.tag.upsert.mockResolvedValue({ id: "t-2" } as never);
      prismaMock.mealTag.deleteMany.mockResolvedValue({ count: 1 } as never);
      prismaMock.mealTag.createMany.mockResolvedValue({ count: 1 } as never);

      await importMeals("fam-1", [{ name: "Tacos", tags: ["Weeknight"] }], {
        mode: "replace",
      });

      expect(prismaMock.mealTag.deleteMany).toHaveBeenCalledWith({
        where: { mealId: "m-old" },
      });
      expect(prismaMock.mealTag.createMany).toHaveBeenCalledWith({
        data: [{ mealId: "m-old", tagId: "t-2" }],
        skipDuplicates: true,
      });
    });

    // #100: imported instructions keep their file order on a newly created meal.
    it("imports instructions in order on a newly created meal", async () => {
      stubTransaction();
      prismaMock.meal.findFirst.mockResolvedValue(null);
      prismaMock.meal.create.mockResolvedValue({ id: "m-new" } as never);

      const result = await importMeals("fam-1", [
        {
          name: "Tacos",
          instructions: [{ text: "Step one" }, { text: "Step two" }],
        },
      ]);

      expect(result.created).toBe(1);
      const arg = prismaMock.meal.create.mock.calls[0][0] as {
        data: {
          instructions?: {
            create: { text: string; position: number }[];
          };
        };
      };
      expect(
        arg.data.instructions?.create.map((s) => [s.position, s.text]),
      ).toEqual([
        [0, "Step one"],
        [1, "Step two"],
      ]);
    });

    // #100: import-replace drops the existing ordered steps and recreates them.
    it("replace-alls instructions in order when replacing an existing meal", async () => {
      stubTransaction();
      prismaMock.meal.findFirst.mockResolvedValue({ id: "m-old" } as never);
      prismaMock.mealIngredient.deleteMany.mockResolvedValue({
        count: 0,
      } as never);
      prismaMock.mealInstruction.deleteMany.mockResolvedValue({
        count: 2,
      } as never);
      prismaMock.meal.update.mockResolvedValue({ id: "m-old" } as never);

      await importMeals(
        "fam-1",
        [
          {
            name: "Tacos",
            instructions: [{ text: "A" }, { text: "B" }, { text: "C" }],
          },
        ],
        { mode: "replace" },
      );

      expect(prismaMock.mealInstruction.deleteMany).toHaveBeenCalledWith({
        where: { mealId: "m-old" },
      });
      const arg = prismaMock.meal.update.mock.calls[0][0] as {
        data: {
          instructions?: {
            create: { text: string; position: number }[];
          };
        };
      };
      expect(
        arg.data.instructions?.create.map((s) => [s.position, s.text]),
      ).toEqual([
        [0, "A"],
        [1, "B"],
        [2, "C"],
      ]);
    });

    it("rejects a meal whose name conflicts with a reserved placeholder", async () => {
      const result = await importMeals("fam-1", [
        { name: "Leftovers", instructions: [{ text: "x" }] },
      ]);
      expect(result.errors).toEqual([
        {
          name: "Leftovers",
          error: "Name conflicts with a reserved placeholder meal",
        },
      ]);
      expect(prismaMock.meal.create).not.toHaveBeenCalled();
    });
  });

  describe("exportMeals", () => {
    it("returns only non-placeholder meals mapped to the export shape", async () => {
      prismaMock.meal.findMany.mockResolvedValue([
        {
          name: "Tacos",
          description: "Yum",
          difficulty: "EASY",
          prepTimeMinutes: 10,
          cookTimeMinutes: 20,
          servings: 4,
          sourceUrl: "https://example.com/tacos",
          imageUrl: "https://cdn.example.com/tacos.jpg",
          notes: "Use fresh cilantro",
          favorite: true,
          rating: 4,
          ingredients: [
            {
              name: "salsa",
              quantity: "1",
              unit: "cup",
              category: "condiments",
            },
          ],
          tags: [],
        },
      ] as never);

      const result = await exportMeals("fam-1");

      expect(prismaMock.meal.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { familyId: "fam-1", placeholderKind: null },
          orderBy: { name: "asc" },
        }),
      );
      expect(result).toEqual([
        {
          name: "Tacos",
          description: "Yum",
          difficulty: "EASY",
          prepTimeMinutes: 10,
          cookTimeMinutes: 20,
          servings: 4,
          sourceUrl: "https://example.com/tacos",
          imageUrl: "https://cdn.example.com/tacos.jpg",
          notes: "Use fresh cilantro",
          favorite: true,
          rating: 4,
          ingredients: [
            {
              name: "salsa",
              quantity: "1",
              unit: "cup",
              category: "condiments",
            },
          ],
          tags: [],
          collections: [],
        },
      ]);
    });

    it("flattens tag join rows to name lists for the CSV round trip", async () => {
      prismaMock.meal.findMany.mockResolvedValue([
        {
          name: "Tacos",
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
          ingredients: [],
          tags: [{ tag: { name: "Quick" } }, { tag: { name: "Vegetarian" } }],
        },
      ] as never);

      const result = await exportMeals("fam-1");

      expect(result[0].tags).toEqual(["Quick", "Vegetarian"]);
      // Export must pull the join rows scoped to the family with only the
      // display name selected (no nameNormalized leakage).
      expect(prismaMock.meal.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            tags: { include: { tag: { select: { name: true } } } },
          }),
        }),
      );
    });
  });

  describe("getLastCookedMap", () => {
    it("returns an empty Map immediately when given no meal ids (no DB call)", async () => {
      const result = await getLastCookedMap("fam-1", []);
      expect(result.size).toBe(0);
      expect(prismaMock.mealSuggestion.findMany).not.toHaveBeenCalled();
    });

    it("scopes the lookup on both sides: meal.familyId AND dayPlan.weekPlan.familyId", async () => {
      prismaMock.mealSuggestion.findMany.mockResolvedValue([] as never);
      await getLastCookedMap("fam-1", ["m-1"]);
      const arg = prismaMock.mealSuggestion.findMany.mock.calls[0][0] as {
        where: {
          meal?: { familyId?: string };
          dayPlan?: { weekPlan?: { familyId?: string } };
        };
      };
      expect(arg.where.meal?.familyId).toBe("fam-1");
      expect(arg.where.dayPlan?.weekPlan?.familyId).toBe("fam-1");
    });

    it("returns only the most-recent approved date per meal when multiple suggestions exist", async () => {
      prismaMock.mealSuggestion.findMany.mockResolvedValue([
        {
          mealId: "m-1",
          dayPlan: { date: new Date("2026-03-01T00:00:00.000Z") },
        },
        {
          mealId: "m-1",
          dayPlan: { date: new Date("2026-06-15T00:00:00.000Z") },
        },
        {
          mealId: "m-1",
          dayPlan: { date: new Date("2026-01-20T00:00:00.000Z") },
        },
      ] as never);

      const result = await getLastCookedMap("fam-1", ["m-1"]);
      expect(result.get("m-1")).toEqual({
        lastCookedOn: "2026-06-15",
        timesCooked: 3,
      });
    });

    it("returns separate entries for multiple meals", async () => {
      prismaMock.mealSuggestion.findMany.mockResolvedValue([
        {
          mealId: "m-1",
          dayPlan: { date: new Date("2026-04-10T00:00:00.000Z") },
        },
        {
          mealId: "m-2",
          dayPlan: { date: new Date("2026-05-20T00:00:00.000Z") },
        },
      ] as never);

      const result = await getLastCookedMap("fam-1", ["m-1", "m-2"]);
      expect(result.get("m-1")).toEqual({
        lastCookedOn: "2026-04-10",
        timesCooked: 1,
      });
      expect(result.get("m-2")).toEqual({
        lastCookedOn: "2026-05-20",
        timesCooked: 1,
      });
    });

    it("counts all approved suggestions per meal into timesCooked (all-time, no window)", async () => {
      prismaMock.mealSuggestion.findMany.mockResolvedValue([
        {
          mealId: "m-1",
          dayPlan: { date: new Date("2026-03-01T00:00:00.000Z") },
        },
        {
          mealId: "m-1",
          dayPlan: { date: new Date("2026-06-15T00:00:00.000Z") },
        },
        {
          mealId: "m-2",
          dayPlan: { date: new Date("2026-05-20T00:00:00.000Z") },
        },
      ] as never);

      const result = await getLastCookedMap("fam-1", ["m-1", "m-2"]);
      expect(result.get("m-1")?.timesCooked).toBe(2);
      expect(result.get("m-2")?.timesCooked).toBe(1);
    });

    it("derives lastCookedOn and timesCooked from the SAME family-scoped query (cross-family leak impossible)", async () => {
      // The query filters on BOTH meal.familyId AND dayPlan.weekPlan.familyId,
      // so every counted row belongs to fam-1. A family B suggestion for the
      // same meal id can never enter this result set.
      prismaMock.mealSuggestion.findMany.mockResolvedValue([
        {
          mealId: "m-1",
          dayPlan: { date: new Date("2026-04-10T00:00:00.000Z") },
        },
      ] as never);

      const result = await getLastCookedMap("fam-1", ["m-1"]);
      const arg = prismaMock.mealSuggestion.findMany.mock.calls[0][0] as {
        where: {
          approved?: boolean;
          meal?: { familyId?: string };
          dayPlan?: { weekPlan?: { familyId?: string } };
        };
      };
      expect(arg.where.approved).toBe(true);
      expect(arg.where.meal?.familyId).toBe("fam-1");
      expect(arg.where.dayPlan?.weekPlan?.familyId).toBe("fam-1");
      // Only the single fam-1 row is counted.
      expect(result.get("m-1")).toEqual({
        lastCookedOn: "2026-04-10",
        timesCooked: 1,
      });
    });

    it("does not include meals that have never been approved onto a week plan", async () => {
      prismaMock.mealSuggestion.findMany.mockResolvedValue([] as never);
      const result = await getLastCookedMap("fam-1", ["m-unknown"]);
      expect(result.size).toBe(0);
      expect(result.has("m-unknown")).toBe(false);
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

describe("meal core metadata route validation", () => {
  describe("createMealSchema", () => {
    it("accepts valid integer + string metadata", () => {
      const parsed = createMealSchema.parse({
        name: "Tacos",
        prepTimeMinutes: 10,
        cookTimeMinutes: 20,
        servings: 4,
        sourceUrl: "https://example.com/tacos",
        notes: "Use fresh cilantro",
      });
      expect(parsed).toMatchObject({
        prepTimeMinutes: 10,
        cookTimeMinutes: 20,
        servings: 4,
        sourceUrl: "https://example.com/tacos",
        notes: "Use fresh cilantro",
      });
    });

    it("accepts explicit null metadata", () => {
      const parsed = createMealSchema.parse({
        name: "Soup",
        prepTimeMinutes: null,
        sourceUrl: null,
        notes: null,
      });
      expect(parsed.prepTimeMinutes).toBeNull();
      expect(parsed.sourceUrl).toBeNull();
      expect(parsed.notes).toBeNull();
    });

    it("accepts omitted metadata", () => {
      const parsed = createMealSchema.parse({ name: "Salad" });
      expect(parsed.prepTimeMinutes).toBeUndefined();
      expect(parsed.servings).toBeUndefined();
      expect(parsed.sourceUrl).toBeUndefined();
    });

    it("rejects a negative prep time", () => {
      expect(() =>
        createMealSchema.parse({ name: "Tacos", prepTimeMinutes: -1 }),
      ).toThrow();
    });

    it("rejects a non-integer cook time", () => {
      expect(() =>
        createMealSchema.parse({ name: "Tacos", cookTimeMinutes: 1.5 }),
      ).toThrow();
    });

    it("rejects servings below 1", () => {
      expect(() =>
        createMealSchema.parse({ name: "Tacos", servings: 0 }),
      ).toThrow();
    });

    it("rejects a malformed sourceUrl (SSRF-safe: validated but never fetched)", () => {
      expect(() =>
        createMealSchema.parse({ name: "Tacos", sourceUrl: "not-a-url" }),
      ).toThrow();
    });

    it("accepts a valid https imageUrl (#103)", () => {
      const parsed = createMealSchema.parse({
        name: "Tacos",
        imageUrl: "https://cdn.example.com/tacos.jpg",
      });
      expect(parsed.imageUrl).toBe("https://cdn.example.com/tacos.jpg");
    });

    it("accepts an explicit null imageUrl (#103)", () => {
      const parsed = createMealSchema.parse({ name: "Soup", imageUrl: null });
      expect(parsed.imageUrl).toBeNull();
    });

    it("rejects a malformed imageUrl (#103)", () => {
      expect(() =>
        createMealSchema.parse({ name: "Tacos", imageUrl: "not-a-url" }),
      ).toThrow();
    });

    it("rejects a non-http(s) imageUrl scheme (#103)", () => {
      expect(() =>
        createMealSchema.parse({
          name: "Tacos",
          imageUrl: "javascript:alert(1)",
        }),
      ).toThrow();
    });

    it("accepts a same-origin uploaded-asset imageUrl path (#186)", () => {
      const assetPath =
        "/api/families/8365a7fa-1c2d-4e5f-9a0b-1c2d3e4f5a6b/images/abcd1234-5678-4abc-9def-0123456789ab";
      const parsed = createMealSchema.parse({ name: "Tacos", imageUrl: assetPath });
      expect(parsed.imageUrl).toBe(assetPath);
    });

    it("rejects a path-traversal imageUrl (#186)", () => {
      expect(() =>
        createMealSchema.parse({
          name: "Tacos",
          imageUrl: "/api/families/../images/x",
        }),
      ).toThrow();
      expect(() =>
        createMealSchema.parse({
          name: "Tacos",
          imageUrl: "/api/families/../../etc/passwd",
        }),
      ).toThrow();
    });

    it("rejects a protocol-relative imageUrl (#186)", () => {
      expect(() =>
        createMealSchema.parse({
          name: "Tacos",
          imageUrl: "//evil.com/api/families/x/images/y",
        }),
      ).toThrow();
    });

    it("rejects an unrelated same-origin path as imageUrl (#186)", () => {
      expect(() =>
        createMealSchema.parse({
          name: "Tacos",
          imageUrl: "/api/families/x/images/y/extra",
        }),
      ).toThrow();
      expect(() =>
        createMealSchema.parse({ name: "Tacos", imageUrl: "/etc/passwd" }),
      ).toThrow();
    });
  });

  describe("updateMealSchema", () => {
    it("accepts valid metadata", () => {
      const parsed = updateMealSchema.parse({
        prepTimeMinutes: 15,
        cookTimeMinutes: 30,
        servings: 6,
        sourceUrl: "https://example.com/stew",
        notes: "Simmer low",
      });
      expect(parsed).toMatchObject({
        prepTimeMinutes: 15,
        cookTimeMinutes: 30,
        servings: 6,
        sourceUrl: "https://example.com/stew",
        notes: "Simmer low",
      });
    });

    it("accepts explicit null metadata (clearing)", () => {
      const parsed = updateMealSchema.parse({
        prepTimeMinutes: null,
        servings: null,
        sourceUrl: null,
        notes: null,
      });
      expect(parsed.prepTimeMinutes).toBeNull();
      expect(parsed.servings).toBeNull();
      expect(parsed.sourceUrl).toBeNull();
      expect(parsed.notes).toBeNull();
    });

    it("rejects a negative servings value", () => {
      expect(() => updateMealSchema.parse({ servings: -2 })).toThrow();
    });

    it("rejects a malformed sourceUrl", () => {
      expect(() => updateMealSchema.parse({ sourceUrl: "not a url" })).toThrow();
    });

    it("accepts a valid https imageUrl (#103)", () => {
      const parsed = updateMealSchema.parse({
        imageUrl: "https://cdn.example.com/stew.png",
      });
      expect(parsed.imageUrl).toBe("https://cdn.example.com/stew.png");
    });

    it("accepts an explicit null imageUrl (clearing) (#103)", () => {
      const parsed = updateMealSchema.parse({ imageUrl: null });
      expect(parsed.imageUrl).toBeNull();
    });

    it("rejects a non-http(s) imageUrl scheme (#103)", () => {
      expect(() =>
        updateMealSchema.parse({ imageUrl: "ftp://example.com/x.png" }),
      ).toThrow();
    });

    it("accepts a same-origin uploaded-asset imageUrl path (#186)", () => {
      const assetPath =
        "/api/families/8365a7fa-1c2d-4e5f-9a0b-1c2d3e4f5a6b/images/abcd1234-5678-4abc-9def-0123456789ab";
      const parsed = updateMealSchema.parse({ imageUrl: assetPath });
      expect(parsed.imageUrl).toBe(assetPath);
    });

    it("rejects traversal / protocol-relative / bad-scheme imageUrl values (#186)", () => {
      for (const bad of [
        "/api/families/../images/x",
        "/api/families/../../etc/passwd",
        "//evil.com/api/families/x/images/y",
        "/api/families/x/images/y/extra",
        "data:text/html,<script>alert(1)</script>",
        "file:///etc/passwd",
      ]) {
        expect(() => updateMealSchema.parse({ imageUrl: bad })).toThrow();
      }
    });
  });
});

describe("meal favorite/rating route validation", () => {
  describe("createMealSchema", () => {
    it("accepts favorite and a valid rating", () => {
      const parsed = createMealSchema.parse({
        name: "Tacos",
        favorite: true,
        rating: 5,
      });
      expect(parsed.favorite).toBe(true);
      expect(parsed.rating).toBe(5);
    });

    it("accepts a null rating", () => {
      const parsed = createMealSchema.parse({ name: "Soup", rating: null });
      expect(parsed.rating).toBeNull();
    });

    it("accepts omitted favorite and rating", () => {
      const parsed = createMealSchema.parse({ name: "Salad" });
      expect(parsed.favorite).toBeUndefined();
      expect(parsed.rating).toBeUndefined();
    });

    it("rejects a rating below 1", () => {
      expect(() =>
        createMealSchema.parse({ name: "Tacos", rating: 0 }),
      ).toThrow();
    });

    it("rejects a rating above 5", () => {
      expect(() =>
        createMealSchema.parse({ name: "Tacos", rating: 6 }),
      ).toThrow();
    });

    it("rejects a non-integer rating", () => {
      expect(() =>
        createMealSchema.parse({ name: "Tacos", rating: 3.5 }),
      ).toThrow();
    });
  });

  describe("updateMealSchema", () => {
    it("accepts favorite and a valid rating", () => {
      const parsed = updateMealSchema.parse({ favorite: false, rating: 3 });
      expect(parsed.favorite).toBe(false);
      expect(parsed.rating).toBe(3);
    });

    it("accepts a null rating (clearing)", () => {
      const parsed = updateMealSchema.parse({ rating: null });
      expect(parsed.rating).toBeNull();
    });

    it("rejects an out-of-range rating", () => {
      expect(() => updateMealSchema.parse({ rating: 6 })).toThrow();
    });
  });
});
