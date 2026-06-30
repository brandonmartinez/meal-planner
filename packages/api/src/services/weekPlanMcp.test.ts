import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../../tests/helpers/prisma.js";

vi.mock("../config/database.js", () => ({ default: prismaMock }));

const {
  getFamilyTimezone,
  getCurrentWeekStart,
  getCurrentWeekPlan,
  getPreviousWeekPlans,
  scheduleMealByDate,
  SuggestionError,
} = await import("./weekPlan.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getFamilyTimezone", () => {
  it("returns the family's timezone when valid", async () => {
    prismaMock.family.findUnique.mockResolvedValue({
      timezone: "America/New_York",
    } as never);
    await expect(getFamilyTimezone("fam-1")).resolves.toBe("America/New_York");
  });

  it("falls back to UTC when the timezone is invalid", async () => {
    prismaMock.family.findUnique.mockResolvedValue({
      timezone: "Not/AZone",
    } as never);
    await expect(getFamilyTimezone("fam-1")).resolves.toBe("UTC");
  });

  it("falls back to UTC when the family is missing", async () => {
    prismaMock.family.findUnique.mockResolvedValue(null);
    await expect(getFamilyTimezone("fam-x")).resolves.toBe("UTC");
  });
});

describe("getCurrentWeekStart", () => {
  it("returns a Monday at UTC midnight and the resolved tz", async () => {
    prismaMock.family.findUnique.mockResolvedValue({
      timezone: "UTC",
    } as never);
    const { tz, monday } = await getCurrentWeekStart("fam-1");
    expect(tz).toBe("UTC");
    expect(monday.getUTCDay()).toBe(1); // Monday
    expect(monday.getUTCHours()).toBe(0);
    expect(monday.getUTCMinutes()).toBe(0);
    expect(monday.getUTCSeconds()).toBe(0);
  });
});

describe("getCurrentWeekPlan", () => {
  it("returns the existing current-week plan without creating", async () => {
    prismaMock.family.findUnique.mockResolvedValue({
      timezone: "UTC",
    } as never);
    const existing = { id: "wp-current", days: [] };
    prismaMock.weekPlan.findFirst.mockResolvedValue(existing as never);

    const result = await getCurrentWeekPlan("fam-1");
    expect(result).toBe(existing);
    expect(prismaMock.weekPlan.create).not.toHaveBeenCalled();
  });

  it("creates the current week when none exists", async () => {
    prismaMock.family.findUnique.mockResolvedValue({
      timezone: "UTC",
    } as never);
    prismaMock.weekPlan.findFirst.mockResolvedValue(null);
    const created = { id: "wp-new", days: [] };
    prismaMock.weekPlan.create.mockResolvedValue(created as never);

    const result = await getCurrentWeekPlan("fam-1");
    expect(result).toBe(created);
    // Seven days are created for the new week.
    const arg = prismaMock.weekPlan.create.mock.calls[0][0] as {
      data: { days: { create: { date: Date }[] } };
    };
    expect(arg.data.days.create).toHaveLength(7);
  });
});

describe("getPreviousWeekPlans", () => {
  it("uses an explicit `before` Monday as an exclusive upper bound", async () => {
    prismaMock.weekPlan.findMany.mockResolvedValue([] as never);
    // 2026-05-06 is a Wednesday; its week's Monday is 2026-05-04.
    await getPreviousWeekPlans("fam-1", {
      before: new Date("2026-05-06T00:00:00Z"),
      limit: 5,
    });

    const arg = prismaMock.weekPlan.findMany.mock.calls[0][0] as {
      where: { familyId: string; weekStart: { lt: Date } };
      orderBy: { weekStart: string };
      take: number;
    };
    expect(arg.where.familyId).toBe("fam-1");
    expect(arg.where.weekStart.lt.toISOString().slice(0, 10)).toBe("2026-05-04");
    expect(arg.orderBy.weekStart).toBe("desc");
    expect(arg.take).toBe(5);
    // No family lookup needed when `before` is supplied.
    expect(prismaMock.family.findUnique).not.toHaveBeenCalled();
  });

  it("defaults the upper bound to the current week when `before` is omitted", async () => {
    prismaMock.family.findUnique.mockResolvedValue({
      timezone: "UTC",
    } as never);
    prismaMock.weekPlan.findMany.mockResolvedValue([] as never);

    await getPreviousWeekPlans("fam-1", {});
    expect(prismaMock.family.findUnique).toHaveBeenCalled();
    const arg = prismaMock.weekPlan.findMany.mock.calls[0][0] as {
      take: number;
    };
    expect(arg.take).toBe(8); // default limit
  });

  it("clamps limit to the 1..52 range", async () => {
    prismaMock.weekPlan.findMany.mockResolvedValue([] as never);
    await getPreviousWeekPlans("fam-1", {
      before: new Date("2026-05-04T00:00:00Z"),
      limit: 999,
    });
    const arg = prismaMock.weekPlan.findMany.mock.calls[0][0] as {
      take: number;
    };
    expect(arg.take).toBe(52);
  });
});

describe("scheduleMealByDate", () => {
  it("resolves the week + day for the date and creates a suggestion", async () => {
    // 2026-05-06 is a Wednesday → week Monday 2026-05-04.
    const week = {
      id: "wp-1",
      days: [
        { id: "day-mon", date: new Date("2026-05-04T00:00:00Z") },
        { id: "day-wed", date: new Date("2026-05-06T00:00:00Z") },
      ],
    };
    // getOrCreateWeekPlan → findFirst returns existing week.
    prismaMock.weekPlan.findFirst.mockResolvedValue(week as never);
    // addSuggestion ownership checks.
    prismaMock.dayPlan.findFirst.mockResolvedValue({ id: "day-wed" } as never);
    prismaMock.meal.findFirst.mockResolvedValue({ id: "meal-1" } as never);
    prismaMock.mealSuggestion.create.mockResolvedValue({
      id: "sug-1",
    } as never);

    const result = await scheduleMealByDate(
      "fam-1",
      "meal-1",
      new Date("2026-05-06T00:00:00Z"),
      "user-1",
    );

    expect(result).toEqual({ id: "sug-1" });
    // The suggestion is created against the Wednesday day plan.
    expect(prismaMock.dayPlan.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "day-wed", weekPlan: { familyId: "fam-1" } },
        select: { id: true },
      }),
    );
    const createArg = prismaMock.mealSuggestion.create.mock.calls[0][0] as {
      data: { dayPlanId: string; mealId: string; userId: string };
    };
    expect(createArg.data.dayPlanId).toBe("day-wed");
    expect(createArg.data.mealId).toBe("meal-1");
    expect(createArg.data.userId).toBe("user-1");
  });

  it("propagates a 404 when the meal is not owned by the family", async () => {
    const week = {
      id: "wp-1",
      days: [{ id: "day-wed", date: new Date("2026-05-06T00:00:00Z") }],
    };
    prismaMock.weekPlan.findFirst.mockResolvedValue(week as never);
    prismaMock.dayPlan.findFirst.mockResolvedValue({ id: "day-wed" } as never);
    prismaMock.meal.findFirst.mockResolvedValue(null); // not owned

    await expect(
      scheduleMealByDate(
        "fam-1",
        "meal-OTHER",
        new Date("2026-05-06T00:00:00Z"),
        "user-1",
      ),
    ).rejects.toBeInstanceOf(SuggestionError);
    expect(prismaMock.mealSuggestion.create).not.toHaveBeenCalled();
  });
});
