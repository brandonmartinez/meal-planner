import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../../tests/helpers/prisma.js";
import { buildReq, buildRes } from "../../tests/helpers/express.js";

// Prisma is mocked so the real `agentCredential` service (credential lookup +
// audit) runs against the mock. The domain services are mocked so these tests
// exercise ONLY the new agent route wiring (auth → scope → service → audit),
// not the deep Prisma behaviour already covered by the service unit tests.
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
    addSuggestion: vi.fn(),
    approveSuggestion: vi.fn(),
    getCurrentWeekPlan: vi.fn(),
    getPreviousWeekPlans: vi.fn(),
    scheduleMealByDate: vi.fn(),
  };
});
vi.mock("../services/meals.js", () => ({
  listMeals: vi.fn(),
}));

const { agentRouter } = await import("./agent.js");
const weekPlanService = await import("../services/weekPlan.js");
const mealService = await import("../services/meals.js");
const { SuggestionError } = weekPlanService;

type Handler = (req: any, res: any, next: (err?: unknown) => void) => unknown;

interface RouteLayer {
  route?: {
    path: string;
    stack: { handle: Handler }[];
  };
}

/** Find a route's middleware stack by its (unique) path. */
function findStack(path: string): Handler[] {
  const stack = (agentRouter as unknown as { stack: RouteLayer[] }).stack;
  const layer = stack.find((l) => l.route?.path === path);
  if (!layer?.route) throw new Error(`route not found: ${path}`);
  return layer.route.stack.map((s) => s.handle);
}

async function runStack(
  handlers: Handler[],
  req: ReturnType<typeof buildReq>,
  res: ReturnType<typeof buildRes>,
) {
  for (const handle of handlers) {
    let nexted = false;
    const next = () => {
      nexted = true;
    };
    await handle(req, res, next);
    if (!nexted) return;
  }
}

function agentReq(
  params: Record<string, string>,
  extra: { body?: Record<string, unknown>; query?: Record<string, unknown> } = {},
) {
  return buildReq({
    params,
    body: extra.body ?? {},
    query: extra.query ?? {},
    headers: { "x-agent-key": "rawkey" },
  });
}

function mockCredential(scopes: string[]) {
  prismaMock.agentCredential.findUnique.mockResolvedValue({
    id: "cred-1",
    familyId: "fam-1",
    scopes,
    createdBy: "parent-1",
    revokedAt: null,
    expiresAt: null,
  } as never);
  prismaMock.agentCredential.update.mockResolvedValue({} as never);
  prismaMock.agentAuditLog.create.mockResolvedValue({} as never);
}

describe("agent MCP routes (meals / current / previous / schedule-by-date)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("list_meals: GET /meals returns meals and audits an allowed read", async () => {
    mockCredential(["meal_plan:read"]);
    vi.mocked(mealService.listMeals).mockResolvedValue([
      { id: "meal-1" },
      { id: "meal-2" },
    ] as never);

    const handlers = findStack("/:familyId/meals");
    const req = agentReq({ familyId: "fam-1" }, { query: { search: "taco" } });
    const res = buildRes();
    await runStack(handlers, req, res);

    expect(res.statusCode).toBe(200);
    expect(mealService.listMeals).toHaveBeenCalledWith("fam-1", {
      search: "taco",
    });
    expect(Array.isArray(res.body)).toBe(true);
    expect(prismaMock.agentAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "meal_plan:read",
        outcome: "allowed",
        targetType: "meal",
        targetIds: ["meal-1", "meal-2"],
      }),
    });
  });

  it("get_current_week_plan: GET /weeks/current returns the plan and audits read", async () => {
    mockCredential(["meal_plan:read"]);
    vi.mocked(weekPlanService.getCurrentWeekPlan).mockResolvedValue({
      id: "wp-current",
    } as never);

    const handlers = findStack("/:familyId/weeks/current");
    const req = agentReq({ familyId: "fam-1" });
    const res = buildRes();
    await runStack(handlers, req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ id: "wp-current" });
    expect(weekPlanService.getCurrentWeekPlan).toHaveBeenCalledWith("fam-1");
    expect(prismaMock.agentAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "meal_plan:read",
        outcome: "allowed",
        targetIds: ["wp-current"],
      }),
    });
  });

  it("get_previous_week_plans: GET /weeks parses before/limit and returns weeks", async () => {
    mockCredential(["meal_plan:read"]);
    vi.mocked(weekPlanService.getPreviousWeekPlans).mockResolvedValue([
      { id: "wp-a" },
      { id: "wp-b" },
    ] as never);

    const handlers = findStack("/:familyId/weeks");
    const req = agentReq(
      { familyId: "fam-1" },
      { query: { before: "2026-06-29", limit: "5" } },
    );
    const res = buildRes();
    await runStack(handlers, req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ weeks: [{ id: "wp-a" }, { id: "wp-b" }] });
    const call = vi.mocked(weekPlanService.getPreviousWeekPlans).mock
      .calls[0];
    expect(call[0]).toBe("fam-1");
    expect(call[1]?.limit).toBe(5);
    expect(call[1]?.before).toBeInstanceOf(Date);
  });

  it("get_previous_week_plans: rejects a malformed `before` with 400", async () => {
    mockCredential(["meal_plan:read"]);

    const handlers = findStack("/:familyId/weeks");
    const req = agentReq(
      { familyId: "fam-1" },
      { query: { before: "not-a-date" } },
    );
    const res = buildRes();
    await runStack(handlers, req, res);

    expect(res.statusCode).toBe(400);
    expect(weekPlanService.getPreviousWeekPlans).not.toHaveBeenCalled();
  });

  it("schedule_meal: POST /schedule schedules by date and audits an allowed schedule", async () => {
    mockCredential(["meal_plan:schedule"]);
    vi.mocked(weekPlanService.scheduleMealByDate).mockResolvedValue({
      id: "s-1",
    } as never);

    const handlers = findStack("/:familyId/schedule");
    const req = agentReq(
      { familyId: "fam-1" },
      { body: { mealId: "meal-1", date: "2026-06-30" } },
    );
    const res = buildRes();
    await runStack(handlers, req, res);

    expect(res.statusCode).toBe(201);
    const call = vi.mocked(weekPlanService.scheduleMealByDate).mock.calls[0];
    expect(call[0]).toBe("fam-1");
    expect(call[1]).toBe("meal-1");
    expect(call[2]).toBeInstanceOf(Date);
    // suggestedBy is attributed to the provisioning parent, not the agent id.
    expect(call[3]).toBe("parent-1");
    expect(prismaMock.agentAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "meal_plan:schedule",
        outcome: "allowed",
        targetType: "mealSuggestion",
        targetIds: ["s-1", "meal-1"],
      }),
    });
  });

  it("schedule_meal: a read-only credential cannot schedule (403, no write)", async () => {
    mockCredential(["meal_plan:read"]);

    const handlers = findStack("/:familyId/schedule");
    const req = agentReq(
      { familyId: "fam-1" },
      { body: { mealId: "meal-1", date: "2026-06-30" } },
    );
    const res = buildRes();
    await runStack(handlers, req, res);

    expect(res.statusCode).toBe(403);
    expect(weekPlanService.scheduleMealByDate).not.toHaveBeenCalled();
    expect(prismaMock.agentAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        outcome: "denied",
        reason: "missing_scope",
      }),
    });
  });

  it("schedule_meal: a rejected date maps the SuggestionError status and audits denied", async () => {
    mockCredential(["meal_plan:schedule"]);
    vi.mocked(weekPlanService.scheduleMealByDate).mockRejectedValue(
      new SuggestionError(404, "Meal not found"),
    );

    const handlers = findStack("/:familyId/schedule");
    const req = agentReq(
      { familyId: "fam-1" },
      { body: { mealId: "missing", date: "2026-06-30" } },
    );
    const res = buildRes();
    await runStack(handlers, req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ error: "Meal not found" });
    expect(prismaMock.agentAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "meal_plan:schedule",
        outcome: "denied",
        reason: "error_404",
      }),
    });
  });

  it("cross-family: a valid credential for another family is denied (403)", async () => {
    mockCredential(["meal_plan:read"]);

    const handlers = findStack("/:familyId/meals");
    const req = agentReq({ familyId: "fam-OTHER" });
    const res = buildRes();
    await runStack(handlers, req, res);

    expect(res.statusCode).toBe(403);
    expect(mealService.listMeals).not.toHaveBeenCalled();
  });

  it("missing credential: no x-agent-key is rejected with 401", async () => {
    const handlers = findStack("/:familyId/meals");
    const req = buildReq({ params: { familyId: "fam-1" }, headers: {} });
    const res = buildRes();
    await runStack(handlers, req, res);

    expect(res.statusCode).toBe(401);
    expect(mealService.listMeals).not.toHaveBeenCalled();
  });
});
