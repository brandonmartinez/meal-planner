import { describe, it, expect, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { prismaMock } from "../../tests/helpers/prisma.js";

vi.mock("../config/database.js", () => ({ default: prismaMock }));

const {
  getMondayOfWeek,
  getOrCreateWeekPlan,
  getWeekPlan,
  addSuggestion,
  approveSuggestion,
  removeSuggestion,
  moveSuggestion,
  MoveSuggestionError,
  getApprovedMealsForRange,
} = await import("./weekPlan.js");

describe("getMondayOfWeek", () => {
  it.each([
    ["2026-05-04", "2026-05-04"], // Monday → same Monday
    ["2026-05-05", "2026-05-04"], // Tuesday → previous Monday
    ["2026-05-09", "2026-05-04"], // Saturday → previous Monday
    ["2026-05-10", "2026-05-04"], // Sunday → previous Monday
    ["2026-01-01", "2025-12-29"], // year boundary, Thursday
  ])("returns Monday for %s", (input, expected) => {
    const date = new Date(`${input}T12:34:56Z`);
    const monday = getMondayOfWeek(date);
    expect(monday.toISOString().slice(0, 10)).toBe(expected);
    expect(monday.getUTCHours()).toBe(0);
    expect(monday.getUTCMinutes()).toBe(0);
    expect(monday.getUTCDay()).toBe(1);
  });

  it("does not mutate the input date", () => {
    const input = new Date("2026-05-05T12:00:00Z");
    const before = input.getTime();
    getMondayOfWeek(input);
    expect(input.getTime()).toBe(before);
  });
});

describe("getOrCreateWeekPlan", () => {
  it("throws if weekStart is not a Monday", async () => {
    await expect(
      getOrCreateWeekPlan("fam-1", new Date("2026-05-05T00:00:00Z")),
    ).rejects.toThrow(/Monday/);
  });

  it("returns existing plan when found", async () => {
    const existing = { id: "wp-1" };
    prismaMock.weekPlan.findFirst.mockResolvedValue(existing as never);

    const result = await getOrCreateWeekPlan(
      "fam-1",
      new Date("2026-05-04T00:00:00Z"),
    );
    expect(result).toBe(existing);
    expect(prismaMock.weekPlan.create).not.toHaveBeenCalled();
  });

  it("creates a new plan with 7 days when none exists", async () => {
    prismaMock.weekPlan.findFirst.mockResolvedValue(null);
    const created = { id: "wp-new" };
    prismaMock.weekPlan.create.mockResolvedValue(created as never);

    const result = await getOrCreateWeekPlan(
      "fam-1",
      new Date("2026-05-04T00:00:00Z"),
    );

    expect(result).toBe(created);
    const arg = prismaMock.weekPlan.create.mock.calls[0][0] as {
      data: { days: { create: { date: Date }[] } };
    };
    expect(arg.data.days.create).toHaveLength(7);
    expect(arg.data.days.create[0].date.toISOString().slice(0, 10)).toBe(
      "2026-05-04",
    );
    expect(arg.data.days.create[6].date.toISOString().slice(0, 10)).toBe(
      "2026-05-10",
    );
  });

  it("falls back to findFirst on a P2002 race-condition error", async () => {
    prismaMock.weekPlan.findFirst.mockResolvedValueOnce(null);
    const p2002 = new Prisma.PrismaClientKnownRequestError("unique", {
      code: "P2002",
      clientVersion: "test",
    });
    prismaMock.weekPlan.create.mockRejectedValue(p2002);
    const raced = { id: "wp-raced" };
    prismaMock.weekPlan.findFirst.mockResolvedValueOnce(raced as never);

    const result = await getOrCreateWeekPlan(
      "fam-1",
      new Date("2026-05-04T00:00:00Z"),
    );
    expect(result).toBe(raced);
  });

  it("rethrows non-P2002 errors", async () => {
    prismaMock.weekPlan.findFirst.mockResolvedValue(null);
    prismaMock.weekPlan.create.mockRejectedValue(new Error("disk full"));
    await expect(
      getOrCreateWeekPlan("fam-1", new Date("2026-05-04T00:00:00Z")),
    ).rejects.toThrow("disk full");
  });
});

describe("getWeekPlan", () => {
  it("normalizes weekStart to UTC midnight", async () => {
    prismaMock.weekPlan.findFirst.mockResolvedValue(null);
    await getWeekPlan("fam-1", new Date("2026-05-04T15:00:00Z"));
    const arg = prismaMock.weekPlan.findFirst.mock.calls[0][0] as {
      where: { weekStart: Date };
    };
    expect(arg.where.weekStart.getUTCHours()).toBe(0);
  });
});

describe("suggestions", () => {
  it("addSuggestion creates with approved=false", async () => {
    prismaMock.mealSuggestion.create.mockResolvedValue({} as never);
    await addSuggestion("day-1", "meal-1", "user-1");
    const arg = prismaMock.mealSuggestion.create.mock.calls[0][0] as {
      data: {
        dayPlanId: string;
        mealId: string;
        userId: string;
        approved: boolean;
      };
    };
    expect(arg.data).toEqual({
      dayPlanId: "day-1",
      mealId: "meal-1",
      userId: "user-1",
      approved: false,
    });
  });

  it("approveSuggestion flips approved to true", async () => {
    prismaMock.mealSuggestion.update.mockResolvedValue({} as never);
    await approveSuggestion("s-1");
    expect(prismaMock.mealSuggestion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "s-1" },
        data: { approved: true },
      }),
    );
  });

  it("removeSuggestion deletes by id", async () => {
    prismaMock.mealSuggestion.delete.mockResolvedValue({} as never);
    await removeSuggestion("s-1");
    expect(prismaMock.mealSuggestion.delete).toHaveBeenCalledWith({
      where: { id: "s-1" },
    });
  });
});

describe("moveSuggestion", () => {
  const baseSuggestion = {
    id: "s-1",
    userId: "user-1",
    approved: false,
    dayPlanId: "day-1",
    dayPlan: { weekPlanId: "wp-1" },
  };

  it("moves to a new day in the same week when actor is the suggester", async () => {
    prismaMock.mealSuggestion.findUnique.mockResolvedValueOnce(
      baseSuggestion as never,
    );
    prismaMock.dayPlan.findUnique.mockResolvedValueOnce({
      id: "day-2",
      weekPlanId: "wp-1",
    } as never);
    prismaMock.mealSuggestion.update.mockResolvedValueOnce({
      id: "s-1",
      dayPlanId: "day-2",
    } as never);

    const result = await moveSuggestion("s-1", "day-2", {
      id: "user-1",
      isParent: false,
    });

    expect(prismaMock.mealSuggestion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "s-1" },
        data: { dayPlanId: "day-2" },
      }),
    );
    expect(result).toEqual(expect.objectContaining({ dayPlanId: "day-2" }));
  });

  it("allows a parent to move someone else's suggestion", async () => {
    prismaMock.mealSuggestion.findUnique.mockResolvedValueOnce(
      baseSuggestion as never,
    );
    prismaMock.dayPlan.findUnique.mockResolvedValueOnce({
      id: "day-2",
      weekPlanId: "wp-1",
    } as never);
    prismaMock.mealSuggestion.update.mockResolvedValueOnce({} as never);

    await expect(
      moveSuggestion("s-1", "day-2", { id: "other-user", isParent: true }),
    ).resolves.toBeDefined();
  });

  it("forbids non-parent moving someone else's suggestion", async () => {
    prismaMock.mealSuggestion.findUnique.mockResolvedValueOnce(
      baseSuggestion as never,
    );
    await expect(
      moveSuggestion("s-1", "day-2", { id: "other-user", isParent: false }),
    ).rejects.toMatchObject({
      name: "MoveSuggestionError",
      status: 403,
    });
    expect(prismaMock.mealSuggestion.update).not.toHaveBeenCalled();
  });

  it("rejects moving an approved suggestion", async () => {
    prismaMock.mealSuggestion.findUnique.mockResolvedValueOnce({
      ...baseSuggestion,
      approved: true,
    } as never);
    await expect(
      moveSuggestion("s-1", "day-2", { id: "user-1", isParent: true }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects target day in a different week plan", async () => {
    prismaMock.mealSuggestion.findUnique.mockResolvedValueOnce(
      baseSuggestion as never,
    );
    prismaMock.dayPlan.findUnique.mockResolvedValueOnce({
      id: "day-2",
      weekPlanId: "wp-OTHER",
    } as never);
    await expect(
      moveSuggestion("s-1", "day-2", { id: "user-1", isParent: false }),
    ).rejects.toMatchObject({ status: 400 });
    expect(prismaMock.mealSuggestion.update).not.toHaveBeenCalled();
  });

  it("returns 404 when the suggestion is missing", async () => {
    prismaMock.mealSuggestion.findUnique.mockResolvedValueOnce(null);
    await expect(
      moveSuggestion("missing", "day-2", { id: "user-1", isParent: true }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("returns 404 when the target day is missing", async () => {
    prismaMock.mealSuggestion.findUnique.mockResolvedValueOnce(
      baseSuggestion as never,
    );
    prismaMock.dayPlan.findUnique.mockResolvedValueOnce(null);
    await expect(
      moveSuggestion("s-1", "missing", { id: "user-1", isParent: true }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("is a no-op when the target day matches the current day", async () => {
    prismaMock.mealSuggestion.findUnique.mockResolvedValueOnce(
      baseSuggestion as never,
    );
    prismaMock.mealSuggestion.findUnique.mockResolvedValueOnce({
      id: "s-1",
      dayPlanId: "day-1",
    } as never);
    const result = await moveSuggestion("s-1", "day-1", {
      id: "user-1",
      isParent: false,
    });
    expect(prismaMock.mealSuggestion.update).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ dayPlanId: "day-1" }));
  });

  it("exports MoveSuggestionError as a class", () => {
    expect(new MoveSuggestionError(400, "x")).toBeInstanceOf(Error);
  });
});

describe("getApprovedMealsForRange", () => {
  it("returns date-keyed approved meals", async () => {
    prismaMock.dayPlan.findMany.mockResolvedValue([
      {
        date: new Date("2026-05-04T00:00:00Z"),
        suggestions: [
          {
            meal: {
              id: "m-1",
              name: "Tacos",
              description: null,
              placeholderKind: null,
            },
          },
        ],
      },
    ] as never);

    const result = await getApprovedMealsForRange(
      "fam-1",
      new Date("2026-05-04T00:00:00Z"),
      new Date("2026-05-10T00:00:00Z"),
    );

    expect(result).toEqual([
      {
        date: "2026-05-04",
        meals: [
          {
            id: "m-1",
            name: "Tacos",
            description: null,
            placeholderKind: null,
          },
        ],
      },
    ]);
  });

  it("queries with start at 00:00 and end at 23:59:59.999", async () => {
    prismaMock.dayPlan.findMany.mockResolvedValue([] as never);
    await getApprovedMealsForRange(
      "fam-1",
      new Date("2026-05-04T15:00:00Z"),
      new Date("2026-05-10T01:00:00Z"),
    );
    const arg = prismaMock.dayPlan.findMany.mock.calls[0][0] as {
      where: { date: { gte: Date; lte: Date } };
    };
    expect(arg.where.date.gte.toISOString()).toBe("2026-05-04T00:00:00.000Z");
    expect(arg.where.date.lte.toISOString()).toBe("2026-05-10T23:59:59.999Z");
  });
});
