import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../../tests/helpers/prisma.js";

vi.mock("../config/database.js", () => ({ default: prismaMock }));

// `SuggestionError` is a REAL class (fillWeek throws it and tests assert on
// `.status`); only the week read/refetch path is mocked so the fill orchestrator
// can be driven with controlled week fixtures. `buildCandidateWhere` and
// `filterAvoidRecent` are left REAL (imported from randomPlan.js) so the reused
// #113 eligibility + recency semantics are exercised over a mocked prisma.
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
  return { SuggestionError, getOrCreateWeekPlan: vi.fn() };
});

const { fillWeek } = await import("./weekFill.js");
const weekPlanService = await import("./weekPlan.js");
const { SuggestionError } = weekPlanService;
const getOrCreateWeekPlan = weekPlanService.getOrCreateWeekPlan as unknown as ReturnType<
  typeof vi.fn
>;

const FAMILY = "fam-1";
const USER = "user-1";
const MONDAY = "2026-07-06"; // a Monday
const REF = new Date(`${MONDAY}T00:00:00.000Z`);

/** A single DayPlan row shaped like `weekPlanInclude` returns it. */
function day(offset: number, suggestions: unknown[] = []) {
  const d = new Date(REF);
  d.setUTCDate(d.getUTCDate() + offset);
  return { id: `day-${offset}`, date: d, suggestions };
}

/** A 7-day week (Mon..Sun). `overrides[offset]` seeds a day's suggestions. */
function buildWeek(overrides: Record<number, unknown[]> = {}) {
  const days = [];
  for (let i = 0; i < 7; i++) days.push(day(i, overrides[i] ?? []));
  return { id: "wp-1", weekStart: new Date(REF), familyId: FAMILY, days };
}

/** Shape a candidate id list into the `{ id }[]` prisma.meal.findMany returns. */
function candidates(...ids: string[]) {
  return ids.map((id) => ({ id })) as never;
}

/** Shape approved cook history into what getLastCookedMap selects. */
function cookedRows(rows: Array<{ mealId: string; date: string }>) {
  return rows.map((r) => ({
    mealId: r.mealId,
    dayPlan: { date: new Date(`${r.date}T00:00:00.000Z`) },
  })) as never;
}

// Emulate prisma.$transaction(fn) by invoking fn with prismaMock as tx.
function stubTransaction() {
  prismaMock.$transaction.mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (cb: any) => Promise.resolve(cb(prismaMock)),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  stubTransaction();
  // Default: no cook history unless a test overrides it (avoid-recent path).
  prismaMock.mealSuggestion.findMany.mockResolvedValue([] as never);
  prismaMock.mealSuggestion.createMany.mockResolvedValue({ count: 0 } as never);
  prismaMock.mealSuggestion.deleteMany.mockResolvedValue({ count: 0 } as never);
});

describe("fillWeek — validation", () => {
  it("rejects a non-Monday weekStart with 400 and writes nothing", async () => {
    await expect(
      fillWeek({
        familyId: FAMILY,
        weekStart: new Date("2026-07-07T00:00:00.000Z"), // Tuesday
        userId: USER,
        filters: {},
      }),
    ).rejects.toBeInstanceOf(SuggestionError);
    await expect(
      fillWeek({
        familyId: FAMILY,
        weekStart: new Date("2026-07-07T00:00:00.000Z"),
        userId: USER,
        filters: {},
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(getOrCreateWeekPlan).not.toHaveBeenCalled();
    expect(prismaMock.mealSuggestion.createMany).not.toHaveBeenCalled();
  });
});

describe("fillWeek — existingMode policy", () => {
  it("defaults to 'error': a week with any suggestion is a 409, non-destructive", async () => {
    getOrCreateWeekPlan.mockResolvedValue(
      buildWeek({ 2: [{ id: "s-existing" }] }) as never,
    );
    prismaMock.meal.findMany.mockResolvedValue(candidates("a", "b"));

    await expect(
      fillWeek({ familyId: FAMILY, weekStart: REF, userId: USER, filters: {} }),
    ).rejects.toMatchObject({ status: 409 });
    expect(prismaMock.mealSuggestion.createMany).not.toHaveBeenCalled();
    expect(prismaMock.mealSuggestion.deleteMany).not.toHaveBeenCalled();
  });

  it("'error' on a fully-empty week fills all 7 days with distinct meals, unapproved", async () => {
    getOrCreateWeekPlan.mockResolvedValue(buildWeek() as never);
    prismaMock.meal.findMany.mockResolvedValue(
      candidates("a", "b", "c", "d", "e", "f", "g"),
    );

    await fillWeek({
      familyId: FAMILY,
      weekStart: REF,
      userId: USER,
      filters: {},
      rng: () => 0, // draw index 0 each time → id-asc assignment Mon..Sun
    });

    expect(prismaMock.mealSuggestion.deleteMany).not.toHaveBeenCalled();
    const arg = prismaMock.mealSuggestion.createMany.mock.calls[0][0] as {
      data: Array<{ dayPlanId: string; mealId: string; approved: boolean; userId: string }>;
    };
    expect(arg.data).toEqual([
      { dayPlanId: "day-0", mealId: "a", userId: USER, approved: false },
      { dayPlanId: "day-1", mealId: "b", userId: USER, approved: false },
      { dayPlanId: "day-2", mealId: "c", userId: USER, approved: false },
      { dayPlanId: "day-3", mealId: "d", userId: USER, approved: false },
      { dayPlanId: "day-4", mealId: "e", userId: USER, approved: false },
      { dayPlanId: "day-5", mealId: "f", userId: USER, approved: false },
      { dayPlanId: "day-6", mealId: "g", userId: USER, approved: false },
    ]);
    // Every created row is UNAPPROVED.
    expect(arg.data.every((r) => r.approved === false)).toBe(true);
  });

  it("'skip' fills only the empty days, leaving occupied days untouched", async () => {
    // Days 1 and 4 already have a suggestion; only 0,2,3,5,6 should be filled.
    getOrCreateWeekPlan.mockResolvedValue(
      buildWeek({ 1: [{ id: "s1" }], 4: [{ id: "s4" }] }) as never,
    );
    prismaMock.meal.findMany.mockResolvedValue(
      candidates("a", "b", "c", "d", "e", "f", "g"),
    );

    await fillWeek({
      familyId: FAMILY,
      weekStart: REF,
      userId: USER,
      filters: {},
      existingMode: "skip",
      rng: () => 0,
    });

    expect(prismaMock.mealSuggestion.deleteMany).not.toHaveBeenCalled();
    const arg = prismaMock.mealSuggestion.createMany.mock.calls[0][0] as {
      data: Array<{ dayPlanId: string; mealId: string }>;
    };
    expect(arg.data.map((r) => r.dayPlanId)).toEqual([
      "day-0",
      "day-2",
      "day-3",
      "day-5",
      "day-6",
    ]);
  });

  it("'replace' deletes existing target-week suggestions then fills all 7 days", async () => {
    getOrCreateWeekPlan.mockResolvedValue(
      buildWeek({ 0: [{ id: "old0" }], 3: [{ id: "old3" }] }) as never,
    );
    prismaMock.meal.findMany.mockResolvedValue(
      candidates("a", "b", "c", "d", "e", "f", "g"),
    );

    await fillWeek({
      familyId: FAMILY,
      weekStart: REF,
      userId: USER,
      filters: {},
      existingMode: "replace",
      rng: () => 0,
    });

    expect(prismaMock.mealSuggestion.deleteMany).toHaveBeenCalledWith({
      where: {
        dayPlanId: {
          in: ["day-0", "day-1", "day-2", "day-3", "day-4", "day-5", "day-6"],
        },
      },
    });
    const arg = prismaMock.mealSuggestion.createMany.mock.calls[0][0] as {
      data: Array<{ dayPlanId: string }>;
    };
    expect(arg.data).toHaveLength(7);
  });
});

describe("fillWeek — eligibility filters (reused #113 semantics)", () => {
  it("threads categories/collections/difficulty/favorite into the family-scoped where", async () => {
    getOrCreateWeekPlan.mockResolvedValue(buildWeek() as never);
    prismaMock.meal.findMany.mockResolvedValue(candidates("a"));

    await fillWeek({
      familyId: FAMILY,
      weekStart: REF,
      userId: USER,
      filters: {
        categories: ["Dinner"],
        collections: ["Weeknights"],
        difficulty: ["EASY"],
        favorite: true,
      },
      rng: () => 0,
    });

    const where = prismaMock.meal.findMany.mock.calls[0][0]?.where;
    expect(where).toMatchObject({
      familyId: FAMILY,
      placeholderKind: null,
      favorite: true,
      difficulty: { in: ["EASY"] },
      categories: {
        some: { category: { nameNormalized: { in: ["dinner"] } } },
      },
      collections: {
        some: { recipeCollection: { nameNormalized: { in: ["weeknights"] } } },
      },
    });
  });

  it("avoid-recent excludes meals cooked within the window (kept meals fill days)", async () => {
    getOrCreateWeekPlan.mockResolvedValue(buildWeek() as never);
    prismaMock.meal.findMany.mockResolvedValue(candidates("a", "b", "c"));
    // "a" cooked 3 days before the week → excluded by a 7-day window.
    // "b" cooked 10 days before → kept. "c" never cooked → kept.
    prismaMock.mealSuggestion.findMany.mockResolvedValue(
      cookedRows([
        { mealId: "a", date: "2026-07-03" },
        { mealId: "b", date: "2026-06-26" },
      ]),
    );

    await fillWeek({
      familyId: FAMILY,
      weekStart: REF,
      userId: USER,
      filters: { avoidRecentDays: 7 },
      rng: () => 0,
    });

    const arg = prismaMock.mealSuggestion.createMany.mock.calls[0][0] as {
      data: Array<{ mealId: string }>;
    };
    const chosen = arg.data.map((r) => r.mealId);
    expect(chosen).not.toContain("a");
    expect(chosen).toEqual(expect.arrayContaining(["b", "c"]));
  });
});

describe("fillWeek — insufficient eligible meals", () => {
  it("throws 422 when no meal matches the filters (empty pool)", async () => {
    getOrCreateWeekPlan.mockResolvedValue(buildWeek() as never);
    prismaMock.meal.findMany.mockResolvedValue(candidates());

    await expect(
      fillWeek({
        familyId: FAMILY,
        weekStart: REF,
        userId: USER,
        filters: { categories: ["nonexistent"] },
      }),
    ).rejects.toMatchObject({ status: 422 });
    expect(prismaMock.mealSuggestion.createMany).not.toHaveBeenCalled();
  });

  it("allowPartial:false throws 422 when the pool is smaller than the open-day count", async () => {
    getOrCreateWeekPlan.mockResolvedValue(buildWeek() as never);
    prismaMock.meal.findMany.mockResolvedValue(candidates("a", "b", "c"));

    await expect(
      fillWeek({
        familyId: FAMILY,
        weekStart: REF,
        userId: USER,
        filters: {},
        allowPartial: false,
      }),
    ).rejects.toMatchObject({ status: 422 });
    expect(prismaMock.mealSuggestion.createMany).not.toHaveBeenCalled();
  });

  it("allowPartial:true (default) fills as many days as the pool allows, then stops", async () => {
    getOrCreateWeekPlan.mockResolvedValue(buildWeek() as never);
    prismaMock.meal.findMany.mockResolvedValue(candidates("a", "b", "c"));

    await fillWeek({
      familyId: FAMILY,
      weekStart: REF,
      userId: USER,
      filters: {},
      rng: () => 0,
    });

    const arg = prismaMock.mealSuggestion.createMany.mock.calls[0][0] as {
      data: Array<{ dayPlanId: string; mealId: string }>;
    };
    // Only 3 candidates → only the first 3 open days (Mon,Tue,Wed) are filled.
    expect(arg.data).toEqual([
      { dayPlanId: "day-0", mealId: "a", userId: USER, approved: false },
      { dayPlanId: "day-1", mealId: "b", userId: USER, approved: false },
      { dayPlanId: "day-2", mealId: "c", userId: USER, approved: false },
    ]);
  });
});

describe("fillWeek — result", () => {
  it("returns the refetched target week", async () => {
    const week = buildWeek();
    getOrCreateWeekPlan.mockResolvedValue(week as never);
    prismaMock.meal.findMany.mockResolvedValue(candidates("a", "b"));

    const result = await fillWeek({
      familyId: FAMILY,
      weekStart: REF,
      userId: USER,
      filters: {},
      rng: () => 0,
    });

    expect(result).toBe(week);
    // getOrCreateWeekPlan is called twice: initial read + final refetch.
    expect(getOrCreateWeekPlan).toHaveBeenCalledTimes(2);
    expect(getOrCreateWeekPlan).toHaveBeenCalledWith(FAMILY, expect.any(Date));
  });
});
