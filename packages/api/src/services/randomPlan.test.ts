import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../../tests/helpers/prisma.js";

vi.mock("../config/database.js", () => ({ default: prismaMock }));

// Mock only the weekPlan write path so the orchestrator can be asserted in
// isolation. `SuggestionError` is a REAL class (selectRandomMeal throws it and
// tests assert on `.status`). `getLastCookedMap` is intentionally NOT mocked —
// avoid-recent tests exercise the real family-scoped recency derivation with a
// mocked prisma underneath.
vi.mock("./weekPlan.js", () => {
  class SuggestionError extends Error {
    constructor(
      public readonly status: number,
      message: string,
    ) {
      super(message);
      this.name = "SuggestionError";
    }
  }
  return { SuggestionError, scheduleMealByDate: vi.fn() };
});

const { selectRandomMeal, scheduleRandomMeal } = await import(
  "./randomPlan.js"
);
const weekPlanService = await import("./weekPlan.js");
const { SuggestionError } = weekPlanService;

const FAMILY_ID = "fam-1";
const REF_DATE = new Date("2026-05-20T00:00:00Z");

// Shape a candidate id list into the `{ id }[]` prisma.meal.findMany returns.
function candidates(...ids: string[]) {
  return ids.map((id) => ({ id })) as never;
}

// Shape an approved-suggestion list into what getLastCookedMap selects
// (`{ mealId, dayPlan: { date } }[]`).
function cookedRows(rows: Array<{ mealId: string; date: string }>) {
  return rows.map((r) => ({
    mealId: r.mealId,
    dayPlan: { date: new Date(`${r.date}T00:00:00.000Z`) },
  })) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no cook history unless a test overrides it.
  prismaMock.mealSuggestion.findMany.mockResolvedValue([] as never);
});

describe("selectRandomMeal — auditable core", () => {
  it("is deterministic given an injected rng (first / last / middle)", async () => {
    prismaMock.meal.findMany.mockResolvedValue(candidates("a", "b", "c"));

    const first = await selectRandomMeal(FAMILY_ID, {}, REF_DATE, () => 0);
    expect(first).toEqual({ mealId: "a", candidateCount: 3 });

    prismaMock.meal.findMany.mockResolvedValue(candidates("a", "b", "c"));
    const last = await selectRandomMeal(FAMILY_ID, {}, REF_DATE, () => 0.999);
    expect(last).toEqual({ mealId: "c", candidateCount: 3 });

    prismaMock.meal.findMany.mockResolvedValue(candidates("a", "b", "c"));
    const mid = await selectRandomMeal(FAMILY_ID, {}, REF_DATE, () => 0.5);
    expect(mid).toEqual({ mealId: "b", candidateCount: 3 });
  });

  it("clamps a defensive rng() === 1 to the last candidate (no out-of-range)", async () => {
    prismaMock.meal.findMany.mockResolvedValue(candidates("a", "b"));
    const picked = await selectRandomMeal(FAMILY_ID, {}, REF_DATE, () => 1);
    expect(picked.mealId).toBe("b");
  });

  it("family-scopes the candidate query and always excludes placeholders", async () => {
    prismaMock.meal.findMany.mockResolvedValue(candidates("a"));
    await selectRandomMeal(FAMILY_ID, {}, REF_DATE, () => 0);

    const where = prismaMock.meal.findMany.mock.calls[0][0]!
      .where as Record<string, unknown>;
    expect(where.familyId).toBe(FAMILY_ID);
    expect(where.placeholderKind).toBeNull();
    // Stable ordering makes a seeded rng reproducible.
    expect(prismaMock.meal.findMany.mock.calls[0][0]!.orderBy).toEqual({
      id: "asc",
    });
  });

  it("narrows by difficulty (OR-within facet)", async () => {
    prismaMock.meal.findMany.mockResolvedValue(candidates("a"));
    await selectRandomMeal(
      FAMILY_ID,
      { difficulty: ["EASY", "MEDIUM"] },
      REF_DATE,
      () => 0,
    );
    const where = prismaMock.meal.findMany.mock.calls[0][0]!
      .where as Record<string, unknown>;
    expect(where.difficulty).toEqual({ in: ["EASY", "MEDIUM"] });
  });

  it("narrows by favorite", async () => {
    prismaMock.meal.findMany.mockResolvedValue(candidates("a"));
    await selectRandomMeal(FAMILY_ID, { favorite: true }, REF_DATE, () => 0);
    const where = prismaMock.meal.findMany.mock.calls[0][0]!
      .where as Record<string, unknown>;
    expect(where.favorite).toBe(true);
  });

  it("narrows by tags on nameNormalized (trimmed + lowercased)", async () => {
    prismaMock.meal.findMany.mockResolvedValue(candidates("a"));
    await selectRandomMeal(
      FAMILY_ID,
      { tags: ["  Quick ", "VEGAN"] },
      REF_DATE,
      () => 0,
    );
    const where = prismaMock.meal.findMany.mock.calls[0][0]!
      .where as Record<string, unknown>;
    expect(where.tags).toEqual({
      some: { tag: { nameNormalized: { in: ["quick", "vegan"] } } },
    });
  });

  it("narrows by categories on nameNormalized", async () => {
    prismaMock.meal.findMany.mockResolvedValue(candidates("a"));
    await selectRandomMeal(
      FAMILY_ID,
      { categories: ["Dinner"] },
      REF_DATE,
      () => 0,
    );
    const where = prismaMock.meal.findMany.mock.calls[0][0]!
      .where as Record<string, unknown>;
    expect(where.categories).toEqual({
      some: { category: { nameNormalized: { in: ["dinner"] } } },
    });
  });

  it("ignores blank tag/category names after normalization", async () => {
    prismaMock.meal.findMany.mockResolvedValue(candidates("a"));
    await selectRandomMeal(
      FAMILY_ID,
      { tags: ["   ", ""], categories: [" "] },
      REF_DATE,
      () => 0,
    );
    const where = prismaMock.meal.findMany.mock.calls[0][0]!
      .where as Record<string, unknown>;
    expect(where.tags).toBeUndefined();
    expect(where.categories).toBeUndefined();
  });

  it("throws 422 when no meal matches the filters", async () => {
    prismaMock.meal.findMany.mockResolvedValue(candidates());
    await expect(
      selectRandomMeal(FAMILY_ID, {}, REF_DATE, () => 0),
    ).rejects.toMatchObject({ status: 422 });
  });

  describe("avoid-recent", () => {
    it("excludes a meal cooked within the window; keeps never-cooked", async () => {
      prismaMock.meal.findMany.mockResolvedValue(candidates("recent", "never"));
      // "recent" cooked 3 days before the reference date; window = 7 days.
      prismaMock.mealSuggestion.findMany.mockResolvedValue(
        cookedRows([{ mealId: "recent", date: "2026-05-17" }]),
      );
      const picked = await selectRandomMeal(
        FAMILY_ID,
        { avoidRecentDays: 7 },
        REF_DATE,
        () => 0,
      );
      expect(picked).toEqual({ mealId: "never", candidateCount: 1 });
    });

    it("keeps a meal cooked exactly avoidRecentDays before (boundary is inclusive-eligible)", async () => {
      prismaMock.meal.findMany.mockResolvedValue(candidates("boundary"));
      // Cooked exactly 7 days before 2026-05-20 → 2026-05-13, on the cutoff.
      prismaMock.mealSuggestion.findMany.mockResolvedValue(
        cookedRows([{ mealId: "boundary", date: "2026-05-13" }]),
      );
      const picked = await selectRandomMeal(
        FAMILY_ID,
        { avoidRecentDays: 7 },
        REF_DATE,
        () => 0,
      );
      expect(picked.mealId).toBe("boundary");
    });

    it("keeps a meal cooked before the window", async () => {
      prismaMock.meal.findMany.mockResolvedValue(candidates("old"));
      prismaMock.mealSuggestion.findMany.mockResolvedValue(
        cookedRows([{ mealId: "old", date: "2026-05-01" }]),
      );
      const picked = await selectRandomMeal(
        FAMILY_ID,
        { avoidRecentDays: 7 },
        REF_DATE,
        () => 0,
      );
      expect(picked.mealId).toBe("old");
    });

    it("throws 422 when the recency window excludes every candidate", async () => {
      prismaMock.meal.findMany.mockResolvedValue(candidates("recent"));
      prismaMock.mealSuggestion.findMany.mockResolvedValue(
        cookedRows([{ mealId: "recent", date: "2026-05-19" }]),
      );
      await expect(
        selectRandomMeal(FAMILY_ID, { avoidRecentDays: 7 }, REF_DATE, () => 0),
      ).rejects.toMatchObject({ status: 422 });
    });

    it("skips the recency query when avoidRecentDays is 0 / undefined", async () => {
      prismaMock.meal.findMany.mockResolvedValue(candidates("a"));
      await selectRandomMeal(
        FAMILY_ID,
        { avoidRecentDays: 0 },
        REF_DATE,
        () => 0,
      );
      expect(prismaMock.mealSuggestion.findMany).not.toHaveBeenCalled();
    });

    it("family-scopes the recency derivation to the requesting family", async () => {
      prismaMock.meal.findMany.mockResolvedValue(candidates("a"));
      await selectRandomMeal(
        FAMILY_ID,
        { avoidRecentDays: 7 },
        REF_DATE,
        () => 0,
      );
      const where = prismaMock.mealSuggestion.findMany.mock.calls[0][0]!
        .where as Record<string, unknown>;
      expect(where.meal).toEqual({ familyId: FAMILY_ID });
      expect(where.dayPlan).toEqual({ weekPlan: { familyId: FAMILY_ID } });
      expect(where.approved).toBe(true);
    });
  });
});

describe("scheduleRandomMeal — orchestrator", () => {
  it("selects then schedules via the family-scoped write path", async () => {
    prismaMock.meal.findMany.mockResolvedValue(candidates("a", "b", "c"));
    const created = { id: "sug-1", mealId: "b", approved: false };
    vi.mocked(weekPlanService.scheduleMealByDate).mockResolvedValue(
      created as never,
    );

    const date = new Date("2026-05-20T00:00:00Z");
    const result = await scheduleRandomMeal({
      familyId: FAMILY_ID,
      date,
      userId: "user-1",
      filters: {},
      rng: () => 0.5, // picks index 1 → "b"
    });

    expect(weekPlanService.scheduleMealByDate).toHaveBeenCalledWith(
      FAMILY_ID,
      "b",
      date,
      "user-1",
    );
    expect(result).toBe(created);
  });

  it("uses the target schedule date as the avoid-recent reference point", async () => {
    prismaMock.meal.findMany.mockResolvedValue(candidates("recent", "ok"));
    // "recent" cooked 2026-05-18; scheduling for 2026-05-20 with a 7-day window
    // must exclude it (reference = the target date, not 'now').
    prismaMock.mealSuggestion.findMany.mockResolvedValue(
      cookedRows([{ mealId: "recent", date: "2026-05-18" }]),
    );
    vi.mocked(weekPlanService.scheduleMealByDate).mockResolvedValue({
      id: "sug-2",
    } as never);

    await scheduleRandomMeal({
      familyId: FAMILY_ID,
      date: new Date("2026-05-20T00:00:00Z"),
      userId: "user-1",
      filters: { avoidRecentDays: 7 },
      rng: () => 0,
    });

    expect(weekPlanService.scheduleMealByDate).toHaveBeenCalledWith(
      FAMILY_ID,
      "ok",
      expect.any(Date),
      "user-1",
    );
  });

  it("propagates a cross-family 404 from the write path (no suggestion created)", async () => {
    prismaMock.meal.findMany.mockResolvedValue(candidates("a"));
    vi.mocked(weekPlanService.scheduleMealByDate).mockRejectedValue(
      new SuggestionError(404, "Meal not found"),
    );
    await expect(
      scheduleRandomMeal({
        familyId: FAMILY_ID,
        date: new Date("2026-05-20T00:00:00Z"),
        userId: "user-1",
        filters: {},
        rng: () => 0,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("does not schedule when selection finds no eligible meal (422)", async () => {
    prismaMock.meal.findMany.mockResolvedValue(candidates());
    await expect(
      scheduleRandomMeal({
        familyId: FAMILY_ID,
        date: new Date("2026-05-20T00:00:00Z"),
        userId: "user-1",
        filters: {},
        rng: () => 0,
      }),
    ).rejects.toMatchObject({ status: 422 });
    expect(weekPlanService.scheduleMealByDate).not.toHaveBeenCalled();
  });
});
