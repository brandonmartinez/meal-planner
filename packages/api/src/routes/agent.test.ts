import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../../tests/helpers/prisma.js";
import { buildReq, buildRes } from "../../tests/helpers/express.js";

vi.mock("../config/database.js", () => ({ default: prismaMock }));

const { agentRouter } = await import("./agent.js");

type Handler = (req: any, res: any, next: (err?: unknown) => void) => unknown;

interface RouteLayer {
  route?: {
    path: string;
    stack: { handle: Handler }[];
  };
}

/** Find a route's full middleware stack by its (unique) path. */
function findStack(path: string): Handler[] {
  const stack = (agentRouter as unknown as { stack: RouteLayer[] }).stack;
  const layer = stack.find((l) => l.route?.path === path);
  if (!layer?.route) throw new Error(`route not found: ${path}`);
  return layer.route.stack.map((s) => s.handle);
}

/** Run a route stack in order, stopping when a handler doesn't call next(). */
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
  body: Record<string, unknown> = {},
) {
  return buildReq({
    params,
    body,
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

describe("agent routes (end-to-end middleware chain)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("read-only: GET weeks returns the plan and audits an allowed read", async () => {
    mockCredential(["meal_plan:read"]);
    prismaMock.weekPlan.findFirst.mockResolvedValue({ id: "wp-1" } as never);

    const handlers = findStack("/:familyId/weeks/:weekStart");
    const req = agentReq({ familyId: "fam-1", weekStart: "2026-06-29" });
    const res = buildRes();
    await runStack(handlers, req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ id: "wp-1" });
    expect(prismaMock.agentAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "meal_plan:read",
        outcome: "allowed",
        targetIds: ["wp-1"],
      }),
    });
  });

  it("schedule: POST suggestion attributes suggestedBy to the provisioning parent", async () => {
    mockCredential(["meal_plan:schedule"]);
    prismaMock.dayPlan.findFirst.mockResolvedValue({ id: "day-1" } as never);
    prismaMock.meal.findFirst.mockResolvedValue({ id: "meal-1" } as never);
    prismaMock.mealSuggestion.create.mockResolvedValue({
      id: "s-1",
    } as never);

    const handlers = findStack("/:familyId/days/:dayPlanId/suggestions");
    const req = agentReq(
      { familyId: "fam-1", dayPlanId: "day-1" },
      { mealId: "meal-1" },
    );
    const res = buildRes();
    await runStack(handlers, req, res);

    expect(res.statusCode).toBe(201);
    const createArg = prismaMock.mealSuggestion.create.mock.calls[0][0] as {
      data: { userId: string };
    };
    expect(createArg.data.userId).toBe("parent-1");
    expect(prismaMock.agentAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "meal_plan:schedule",
        outcome: "allowed",
      }),
    });
  });

  it("approve: PATCH approve records the agent as the approving actor", async () => {
    mockCredential(["meal_plan:approve"]);
    prismaMock.mealSuggestion.findFirst.mockResolvedValue({
      id: "s-1",
    } as never);
    prismaMock.mealSuggestion.update.mockResolvedValue({ id: "s-1" } as never);

    const handlers = findStack("/:familyId/suggestions/:suggestionId/approve");
    const req = agentReq({ familyId: "fam-1", suggestionId: "s-1" });
    const res = buildRes();
    await runStack(handlers, req, res);

    expect(res.statusCode).toBe(200);
    const updateArg = prismaMock.mealSuggestion.update.mock.calls[0][0] as {
      data: { approvedByActorType: string; approvedById: string };
    };
    expect(updateArg.data.approvedByActorType).toBe("agent");
    expect(updateArg.data.approvedById).toBe("cred-1");
    expect(prismaMock.agentAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "meal_plan:approve",
        outcome: "allowed",
        targetIds: ["s-1"],
      }),
    });
  });

  it("denied out-of-scope: a read-only credential cannot approve (403, no write)", async () => {
    mockCredential(["meal_plan:read"]);

    const handlers = findStack("/:familyId/suggestions/:suggestionId/approve");
    const req = agentReq({ familyId: "fam-1", suggestionId: "s-1" });
    const res = buildRes();
    await runStack(handlers, req, res);

    expect(res.statusCode).toBe(403);
    expect(prismaMock.mealSuggestion.update).not.toHaveBeenCalled();
    expect(prismaMock.agentAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        outcome: "denied",
        reason: "missing_scope",
      }),
    });
  });

  it("cross-family: a valid credential for another family is denied (403)", async () => {
    mockCredential(["meal_plan:read"]);

    const handlers = findStack("/:familyId/weeks/:weekStart");
    const req = agentReq({ familyId: "fam-OTHER", weekStart: "2026-06-29" });
    const res = buildRes();
    await runStack(handlers, req, res);

    expect(res.statusCode).toBe(403);
    expect(prismaMock.weekPlan.findFirst).not.toHaveBeenCalled();
  });
});
