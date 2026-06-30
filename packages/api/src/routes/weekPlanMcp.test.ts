import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../../tests/helpers/prisma.js";
import { buildReq, buildNext } from "../../tests/helpers/express.js";
import { getRouteHandler, buildFullRes } from "../../tests/helpers/router.js";

vi.mock("../config/database.js", () => ({ default: prismaMock }));
vi.mock("../services/weekPlan.js", () => {
  class SuggestionError extends Error {
    constructor(
      public readonly status: number,
      message: string,
    ) {
      super(message);
      this.name = "SuggestionError";
    }
  }
  class MoveSuggestionError extends SuggestionError {
    constructor(status: number, message: string) {
      super(status, message);
      this.name = "MoveSuggestionError";
    }
  }
  return {
    SuggestionError,
    MoveSuggestionError,
    getWeekPlan: vi.fn(),
    getOrCreateWeekPlan: vi.fn(),
    addSuggestion: vi.fn(),
    approveSuggestion: vi.fn(),
    removeSuggestion: vi.fn(),
    moveSuggestion: vi.fn(),
    getCurrentWeekPlan: vi.fn(),
    getPreviousWeekPlans: vi.fn(),
    scheduleMealByDate: vi.fn(),
  };
});

const { weekPlanRouter } = await import("./weekPlan.js");
const weekPlanService = await import("../services/weekPlan.js");
const { SuggestionError } = weekPlanService;

const FAMILY_ID = "fam-1";
const USER_ID = "user-1";

function req(role: "PARENT" | "CHILD", over: Record<string, unknown> = {}) {
  const r = buildReq({ user: { id: USER_ID } as never, ...over });
  (r as unknown as { membership: { role: string } }).membership = { role };
  return r;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /:familyId/weeks/current", () => {
  const handler = getRouteHandler(
    weekPlanRouter,
    "get",
    "/:familyId/weeks/current",
  );

  it("200s with the current week plan", async () => {
    vi.mocked(weekPlanService.getCurrentWeekPlan).mockResolvedValue({
      id: "wp-current",
    } as never);
    const res = buildFullRes();
    await handler(
      req("CHILD", { params: { familyId: FAMILY_ID } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ id: "wp-current" });
    expect(weekPlanService.getCurrentWeekPlan).toHaveBeenCalledWith(FAMILY_ID);
  });

  it("500s when the service throws", async () => {
    vi.mocked(weekPlanService.getCurrentWeekPlan).mockRejectedValue(
      new Error("db"),
    );
    const res = buildFullRes();
    await handler(
      req("CHILD", { params: { familyId: FAMILY_ID } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(500);
  });
});

describe("GET /:familyId/weeks", () => {
  const handler = getRouteHandler(weekPlanRouter, "get", "/:familyId/weeks");

  it("200s with the previous weeks list and passes parsed query through", async () => {
    vi.mocked(weekPlanService.getPreviousWeekPlans).mockResolvedValue([
      { id: "wp-1" },
    ] as never);
    const res = buildFullRes();
    await handler(
      req("CHILD", {
        params: { familyId: FAMILY_ID },
        query: { before: "2026-05-04", limit: "3" },
      }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ weeks: [{ id: "wp-1" }] });
    const arg = vi.mocked(weekPlanService.getPreviousWeekPlans).mock
      .calls[0][1] as { before?: Date; limit?: number };
    expect(arg.limit).toBe(3);
    expect(arg.before?.toISOString().slice(0, 10)).toBe("2026-05-04");
  });

  it("200s with no query params (defaults applied by the service)", async () => {
    vi.mocked(weekPlanService.getPreviousWeekPlans).mockResolvedValue(
      [] as never,
    );
    const res = buildFullRes();
    await handler(
      req("CHILD", { params: { familyId: FAMILY_ID }, query: {} }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(200);
    const arg = vi.mocked(weekPlanService.getPreviousWeekPlans).mock
      .calls[0][1] as { before?: Date; limit?: number };
    expect(arg.before).toBeUndefined();
    expect(arg.limit).toBeUndefined();
  });

  it("400s on a malformed `before` date", async () => {
    const res = buildFullRes();
    await handler(
      req("CHILD", {
        params: { familyId: FAMILY_ID },
        query: { before: "05-04-2026" },
      }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(400);
    expect(weekPlanService.getPreviousWeekPlans).not.toHaveBeenCalled();
  });

  it("400s on an out-of-range limit", async () => {
    const res = buildFullRes();
    await handler(
      req("CHILD", {
        params: { familyId: FAMILY_ID },
        query: { limit: "0" },
      }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(400);
  });

  it("500s when the service throws", async () => {
    vi.mocked(weekPlanService.getPreviousWeekPlans).mockRejectedValue(
      new Error("db"),
    );
    const res = buildFullRes();
    await handler(
      req("CHILD", { params: { familyId: FAMILY_ID }, query: {} }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(500);
  });
});

describe("POST /:familyId/schedule", () => {
  const handler = getRouteHandler(weekPlanRouter, "post", "/:familyId/schedule");

  it("201s and schedules the meal by date", async () => {
    vi.mocked(weekPlanService.scheduleMealByDate).mockResolvedValue({
      id: "sug-1",
    } as never);
    const res = buildFullRes();
    await handler(
      req("CHILD", {
        params: { familyId: FAMILY_ID },
        body: { mealId: "meal-1", date: "2026-05-06" },
      }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ id: "sug-1" });
    const [familyId, mealId, date, userId] = vi.mocked(
      weekPlanService.scheduleMealByDate,
    ).mock.calls[0];
    expect(familyId).toBe(FAMILY_ID);
    expect(mealId).toBe("meal-1");
    expect((date as Date).toISOString().slice(0, 10)).toBe("2026-05-06");
    expect(userId).toBe(USER_ID);
  });

  it("400s when the body is missing required fields", async () => {
    const res = buildFullRes();
    await handler(
      req("CHILD", {
        params: { familyId: FAMILY_ID },
        body: { mealId: "meal-1" },
      }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(400);
    expect(weekPlanService.scheduleMealByDate).not.toHaveBeenCalled();
  });

  it("400s when the date is not YYYY-MM-DD", async () => {
    const res = buildFullRes();
    await handler(
      req("CHILD", {
        params: { familyId: FAMILY_ID },
        body: { mealId: "meal-1", date: "2026/05/06" },
      }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(400);
  });

  it("maps a SuggestionError to its status code", async () => {
    vi.mocked(weekPlanService.scheduleMealByDate).mockRejectedValue(
      new SuggestionError(404, "Meal not found"),
    );
    const res = buildFullRes();
    await handler(
      req("CHILD", {
        params: { familyId: FAMILY_ID },
        body: { mealId: "meal-x", date: "2026-05-06" },
      }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: "Meal not found" });
  });

  it("500s on an unexpected error", async () => {
    vi.mocked(weekPlanService.scheduleMealByDate).mockRejectedValue(
      new Error("db"),
    );
    const res = buildFullRes();
    await handler(
      req("CHILD", {
        params: { familyId: FAMILY_ID },
        body: { mealId: "meal-1", date: "2026-05-06" },
      }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(500);
  });
});
