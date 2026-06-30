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
  };
});

const { weekPlanRouter } = await import("./weekPlan.js");
const weekPlanService = await import("../services/weekPlan.js");
const { SuggestionError, MoveSuggestionError } = weekPlanService;

const FAMILY_ID = "fam-1";
const WEEK = "2026-05-04";
const USER_ID = "user-1";

// Build a req with a membership role so isParentReq() resolves correctly.
// `membership` is not an augmented Express.Request property, so attach it via
// post-build mutation (matching the existing middleware tests).
function req(role: "PARENT" | "CHILD", over: Record<string, unknown> = {}) {
  const r = buildReq({ user: { id: USER_ID } as never, ...over });
  (r as unknown as { membership: { role: string } }).membership = { role };
  return r;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /:familyId/weeks/:weekStart", () => {
  const handler = getRouteHandler(
    weekPlanRouter,
    "get",
    "/:familyId/weeks/:weekStart",
  );

  it("200s with the plan", async () => {
    vi.mocked(weekPlanService.getWeekPlan).mockResolvedValue({
      id: "wp-1",
    } as never);
    const res = buildFullRes();
    await handler(
      req("CHILD", { params: { familyId: FAMILY_ID, weekStart: WEEK } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(200);
  });

  it("404s when no plan exists for the week", async () => {
    vi.mocked(weekPlanService.getWeekPlan).mockResolvedValue(null as never);
    const res = buildFullRes();
    await handler(
      req("CHILD", { params: { familyId: FAMILY_ID, weekStart: WEEK } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: "Week plan not found" });
  });

  it("500s when the service throws", async () => {
    vi.mocked(weekPlanService.getWeekPlan).mockRejectedValue(new Error("db"));
    const res = buildFullRes();
    await handler(
      req("CHILD", { params: { familyId: FAMILY_ID, weekStart: WEEK } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(500);
  });
});

describe("POST /:familyId/weeks/:weekStart (get-or-create)", () => {
  const handler = getRouteHandler(
    weekPlanRouter,
    "post",
    "/:familyId/weeks/:weekStart",
  );

  it("200s with the plan", async () => {
    vi.mocked(weekPlanService.getOrCreateWeekPlan).mockResolvedValue({
      id: "wp-1",
    } as never);
    const res = buildFullRes();
    await handler(
      req("PARENT", { params: { familyId: FAMILY_ID, weekStart: WEEK } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(200);
  });

  it("400s when weekStart is not a Monday", async () => {
    vi.mocked(weekPlanService.getOrCreateWeekPlan).mockRejectedValue(
      new Error("weekStart must be a Monday"),
    );
    const res = buildFullRes();
    await handler(
      req("PARENT", { params: { familyId: FAMILY_ID, weekStart: WEEK } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "weekStart must be a Monday" });
  });

  it("500s on an unexpected error", async () => {
    vi.mocked(weekPlanService.getOrCreateWeekPlan).mockRejectedValue(
      new Error("db"),
    );
    const res = buildFullRes();
    await handler(
      req("PARENT", { params: { familyId: FAMILY_ID, weekStart: WEEK } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(500);
  });
});

describe("POST /:familyId/days/:dayPlanId/suggestions", () => {
  const handler = getRouteHandler(
    weekPlanRouter,
    "post",
    "/:familyId/days/:dayPlanId/suggestions",
  );

  const params = { familyId: FAMILY_ID, dayPlanId: "dp-1" };

  it("201s with the created suggestion", async () => {
    vi.mocked(weekPlanService.addSuggestion).mockResolvedValue({
      id: "sug-1",
    } as never);
    const res = buildFullRes();
    await handler(
      req("CHILD", { params, body: { mealId: "meal-1" } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(201);
    expect(weekPlanService.addSuggestion).toHaveBeenCalledWith(
      FAMILY_ID,
      "dp-1",
      "meal-1",
      USER_ID,
    );
  });

  it("400s on Zod failure (missing mealId)", async () => {
    const res = buildFullRes();
    await handler(req("CHILD", { params, body: {} }), res, buildNext());
    expect(res.statusCode).toBe(400);
    expect(weekPlanService.addSuggestion).not.toHaveBeenCalled();
  });

  it("maps a SuggestionError to its own status code", async () => {
    vi.mocked(weekPlanService.addSuggestion).mockRejectedValue(
      new SuggestionError(404, "Day plan not found"),
    );
    const res = buildFullRes();
    await handler(
      req("CHILD", { params, body: { mealId: "meal-1" } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: "Day plan not found" });
  });

  it("500s on an unexpected error", async () => {
    vi.mocked(weekPlanService.addSuggestion).mockRejectedValue(new Error("db"));
    const res = buildFullRes();
    await handler(
      req("CHILD", { params, body: { mealId: "meal-1" } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(500);
  });
});

describe("PATCH /:familyId/suggestions/:suggestionId/approve", () => {
  const handler = getRouteHandler(
    weekPlanRouter,
    "patch",
    "/:familyId/suggestions/:suggestionId/approve",
  );

  const params = { familyId: FAMILY_ID, suggestionId: "sug-1" };

  it("200s with the approved suggestion", async () => {
    vi.mocked(weekPlanService.approveSuggestion).mockResolvedValue({
      id: "sug-1",
      approved: true,
    } as never);
    const res = buildFullRes();
    await handler(req("PARENT", { params }), res, buildNext());
    expect(res.statusCode).toBe(200);
    expect(weekPlanService.approveSuggestion).toHaveBeenCalledWith(
      FAMILY_ID,
      "sug-1",
    );
  });

  it("maps a SuggestionError to its own status code", async () => {
    vi.mocked(weekPlanService.approveSuggestion).mockRejectedValue(
      new SuggestionError(404, "Suggestion not found"),
    );
    const res = buildFullRes();
    await handler(req("PARENT", { params }), res, buildNext());
    expect(res.statusCode).toBe(404);
  });

  it("500s on an unexpected error", async () => {
    vi.mocked(weekPlanService.approveSuggestion).mockRejectedValue(
      new Error("db"),
    );
    const res = buildFullRes();
    await handler(req("PARENT", { params }), res, buildNext());
    expect(res.statusCode).toBe(500);
  });
});

describe("DELETE /:familyId/suggestions/:suggestionId (remove)", () => {
  const handler = getRouteHandler(
    weekPlanRouter,
    "delete",
    "/:familyId/suggestions/:suggestionId",
  );

  const params = { familyId: FAMILY_ID, suggestionId: "sug-1" };

  it("204s and passes isParent=true for a PARENT member", async () => {
    vi.mocked(weekPlanService.removeSuggestion).mockResolvedValue(
      undefined as never,
    );
    const res = buildFullRes();
    await handler(req("PARENT", { params }), res, buildNext());
    expect(res.statusCode).toBe(204);
    expect(weekPlanService.removeSuggestion).toHaveBeenCalledWith(
      FAMILY_ID,
      "sug-1",
      { id: USER_ID, isParent: true },
    );
  });

  it("passes isParent=false for a CHILD member", async () => {
    vi.mocked(weekPlanService.removeSuggestion).mockResolvedValue(
      undefined as never,
    );
    const res = buildFullRes();
    await handler(req("CHILD", { params }), res, buildNext());
    expect(weekPlanService.removeSuggestion).toHaveBeenCalledWith(
      FAMILY_ID,
      "sug-1",
      { id: USER_ID, isParent: false },
    );
  });

  it("maps a SuggestionError to its own status code (e.g. 403)", async () => {
    vi.mocked(weekPlanService.removeSuggestion).mockRejectedValue(
      new SuggestionError(403, "Not allowed"),
    );
    const res = buildFullRes();
    await handler(req("CHILD", { params }), res, buildNext());
    expect(res.statusCode).toBe(403);
  });

  it("500s on an unexpected error", async () => {
    vi.mocked(weekPlanService.removeSuggestion).mockRejectedValue(
      new Error("db"),
    );
    const res = buildFullRes();
    await handler(req("PARENT", { params }), res, buildNext());
    expect(res.statusCode).toBe(500);
  });
});

describe("PATCH /:familyId/suggestions/:suggestionId/move", () => {
  const handler = getRouteHandler(
    weekPlanRouter,
    "patch",
    "/:familyId/suggestions/:suggestionId/move",
  );

  const params = { familyId: FAMILY_ID, suggestionId: "sug-1" };

  it("200s and forwards the actor (isParent derived from membership)", async () => {
    vi.mocked(weekPlanService.moveSuggestion).mockResolvedValue({
      id: "sug-1",
    } as never);
    const res = buildFullRes();
    await handler(
      req("PARENT", { params, body: { dayPlanId: "dp-2" } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(200);
    expect(weekPlanService.moveSuggestion).toHaveBeenCalledWith(
      FAMILY_ID,
      "sug-1",
      "dp-2",
      { id: USER_ID, isParent: true },
    );
  });

  it("400s on Zod failure (missing dayPlanId)", async () => {
    const res = buildFullRes();
    await handler(req("CHILD", { params, body: {} }), res, buildNext());
    expect(res.statusCode).toBe(400);
    expect(weekPlanService.moveSuggestion).not.toHaveBeenCalled();
  });

  it("maps a MoveSuggestionError to its own status code", async () => {
    vi.mocked(weekPlanService.moveSuggestion).mockRejectedValue(
      new MoveSuggestionError(409, "Target day occupied"),
    );
    const res = buildFullRes();
    await handler(
      req("CHILD", { params, body: { dayPlanId: "dp-2" } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ error: "Target day occupied" });
  });

  it("500s on an unexpected error", async () => {
    vi.mocked(weekPlanService.moveSuggestion).mockRejectedValue(
      new Error("db"),
    );
    const res = buildFullRes();
    await handler(
      req("CHILD", { params, body: { dayPlanId: "dp-2" } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(500);
  });
});
