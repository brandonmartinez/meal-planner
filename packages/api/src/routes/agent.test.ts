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
    // createMeal/updateMeal re-fetch the meal with taxonomy joins after
    // mutating. Default to an empty-taxonomy row so write tests that don't
    // care about tags/categories don't have to wire the re-fetch themselves.
    prismaMock.meal.findUniqueOrThrow.mockResolvedValue({
      id: "meal-1",
      ingredients: [],
      tags: [],
      categories: [],
    } as never);
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

  it("read-only: GET collections returns the family's collections and audits the read (#109)", async () => {
    mockCredential(["meal_plan:read"]);
    prismaMock.recipeCollection.findMany.mockResolvedValue([
      { id: "col-1", name: "Weeknight Dinners", familyId: "fam-1" },
      { id: "col-2", name: "Holiday Baking", familyId: "fam-1" },
    ] as never);

    const handlers = findStack("/:familyId/collections");
    const req = agentReq({ familyId: "fam-1" });
    const res = buildRes();
    await runStack(handlers, req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      collections: [
        { id: "col-1", name: "Weeknight Dinners" },
        { id: "col-2", name: "Holiday Baking" },
      ],
    });
    // The service is family-scoped: the query filters by the path familyId.
    expect(prismaMock.recipeCollection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { familyId: "fam-1" } }),
    );
    expect(prismaMock.agentAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "meal_plan:read",
        outcome: "allowed",
        targetIds: ["col-1", "col-2"],
      }),
    });
  });

  it("denied out-of-scope: a schedule-only credential cannot list collections (403, #109)", async () => {
    mockCredential(["meal_plan:schedule"]);

    const handlers = findStack("/:familyId/collections");
    const req = agentReq({ familyId: "fam-1" });
    const res = buildRes();
    await runStack(handlers, req, res);

    expect(res.statusCode).toBe(403);
    expect(prismaMock.recipeCollection.findMany).not.toHaveBeenCalled();
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

  it("write: POST meals forwards core metadata to the service (meal:write)", async () => {
    mockCredential(["meal:write"]);
    prismaMock.$transaction.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (cb: any) => Promise.resolve(cb(prismaMock)),
    );
    prismaMock.meal.create.mockResolvedValue({ id: "meal-1" } as never);

    const handlers = findStack("/meals");
    const req = agentReq(
      {},
      {
        name: "Tacos",
        prepTimeMinutes: 10,
        cookTimeMinutes: 20,
        servings: 4,
        sourceUrl: "https://example.com/tacos",
        imageUrl: "https://cdn.example.com/tacos.jpg",
        notes: "Use fresh cilantro",
      },
    );
    const res = buildRes();
    await runStack(handlers, req, res);

    expect(res.statusCode).toBe(201);
    const createArg = prismaMock.meal.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(createArg.data).toMatchObject({
      prepTimeMinutes: 10,
      cookTimeMinutes: 20,
      servings: 4,
      sourceUrl: "https://example.com/tacos",
      imageUrl: "https://cdn.example.com/tacos.jpg",
      notes: "Use fresh cilantro",
    });
  });

  it("write: POST meals 400s on a malformed sourceUrl (validated, never fetched)", async () => {
    mockCredential(["meal:write"]);

    const handlers = findStack("/meals");
    const req = agentReq({}, { name: "Tacos", sourceUrl: "not-a-url" });
    const res = buildRes();
    await runStack(handlers, req, res);

    expect(res.statusCode).toBe(400);
    expect(prismaMock.meal.create).not.toHaveBeenCalled();
  });

  it("write: POST meals 400s on a non-http(s) imageUrl scheme (#103)", async () => {
    mockCredential(["meal:write"]);

    const handlers = findStack("/meals");
    const req = agentReq(
      {},
      { name: "Tacos", imageUrl: "javascript:alert(1)" },
    );
    const res = buildRes();
    await runStack(handlers, req, res);

    expect(res.statusCode).toBe(400);
    expect(prismaMock.meal.create).not.toHaveBeenCalled();
  });

  it("write: PATCH meals forwards metadata and null-clearing to the service", async () => {
    mockCredential(["meal:write"]);
    prismaMock.$transaction.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (cb: any) => Promise.resolve(cb(prismaMock)),
    );
    prismaMock.meal.findFirst.mockResolvedValue({
      id: "meal-1",
      placeholderKind: null,
    } as never);
    prismaMock.meal.update.mockResolvedValue({ id: "meal-1" } as never);

    const handlers = findStack("/meals/:mealId");
    const req = agentReq(
      { mealId: "meal-1" },
      { prepTimeMinutes: 15, servings: 6, sourceUrl: null, imageUrl: null, notes: null },
    );
    const res = buildRes();
    await runStack(handlers, req, res);

    expect(res.statusCode).toBe(200);
    const updateArg = prismaMock.meal.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(updateArg.data).toMatchObject({
      prepTimeMinutes: 15,
      servings: 6,
      sourceUrl: null,
      imageUrl: null,
      notes: null,
    });
  });

  it("write: POST meals forwards favorite and rating to the service (meal:write)", async () => {
    mockCredential(["meal:write"]);
    prismaMock.$transaction.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (cb: any) => Promise.resolve(cb(prismaMock)),
    );
    prismaMock.meal.create.mockResolvedValue({ id: "meal-1" } as never);

    const handlers = findStack("/meals");
    const req = agentReq({}, { name: "Tacos", favorite: true, rating: 4 });
    const res = buildRes();
    await runStack(handlers, req, res);

    expect(res.statusCode).toBe(201);
    const createArg = prismaMock.meal.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(createArg.data).toMatchObject({ favorite: true, rating: 4 });
  });

  it("write: POST meals 400s on an out-of-range rating", async () => {
    mockCredential(["meal:write"]);

    const handlers = findStack("/meals");
    const req = agentReq({}, { name: "Tacos", rating: 6 });
    const res = buildRes();
    await runStack(handlers, req, res);

    expect(res.statusCode).toBe(400);
    expect(prismaMock.meal.create).not.toHaveBeenCalled();
  });

  it("write: PATCH meals clears rating to null and unsets favorite", async () => {
    mockCredential(["meal:write"]);
    prismaMock.$transaction.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (cb: any) => Promise.resolve(cb(prismaMock)),
    );
    prismaMock.meal.findFirst.mockResolvedValue({
      id: "meal-1",
      placeholderKind: null,
    } as never);
    prismaMock.meal.update.mockResolvedValue({ id: "meal-1" } as never);

    const handlers = findStack("/meals/:mealId");
    const req = agentReq({ mealId: "meal-1" }, { favorite: false, rating: null });
    const res = buildRes();
    await runStack(handlers, req, res);

    expect(res.statusCode).toBe(200);
    const updateArg = prismaMock.meal.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(updateArg.data).toMatchObject({ favorite: false, rating: null });
  });

  // --- #107 tags/categories parity (parity.instructions.md row 4) ---
  // The agent create/update routes share the meal service with REST, so the
  // list-FILTER path is parity-by-construction (identical shared
  // `listMealsQuerySchema` + `mealService.listMeals(familyId, parsed.data)`
  // call; filter where-clause is exhaustively covered in services/meals.test.ts
  // and routes/meals.test.ts). The agent-SPECIFIC risk is the WRITE path: the
  // credential's own `familyId` (never a client-supplied value) must scope the
  // tag/category upsert so an agent key can never resolve or create taxonomy in
  // another family (#9 IDOR). These two tests pin that.

  it("write: POST meals assigns tags/categories scoped to the credential's family (#107, IDOR)", async () => {
    mockCredential(["meal:write"]);
    prismaMock.$transaction.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (cb: any) => Promise.resolve(cb(prismaMock)),
    );
    prismaMock.meal.create.mockResolvedValue({ id: "meal-1" } as never);
    prismaMock.tag.upsert.mockResolvedValue({ id: "tag-1" } as never);
    prismaMock.category.upsert.mockResolvedValue({ id: "cat-1" } as never);
    prismaMock.mealTag.deleteMany.mockResolvedValue({ count: 0 } as never);
    prismaMock.mealTag.createMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.mealCategory.deleteMany.mockResolvedValue({ count: 0 } as never);
    prismaMock.mealCategory.createMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.meal.findUniqueOrThrow.mockResolvedValue({
      id: "meal-1",
      ingredients: [],
      tags: [],
      categories: [],
    } as never);

    const handlers = findStack("/meals");
    const req = agentReq(
      {},
      { name: "Tacos", tags: ["Quick", "Weeknight"], categories: ["Dinner"] },
    );
    const res = buildRes();
    await runStack(handlers, req, res);

    expect(res.statusCode).toBe(201);
    // Family scope (fam-1) comes from the credential, not the request body.
    expect(prismaMock.tag.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          familyId_nameNormalized: { familyId: "fam-1", nameNormalized: "quick" },
        },
        create: { name: "Quick", nameNormalized: "quick", familyId: "fam-1" },
        update: {},
      }),
    );
    expect(prismaMock.category.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          familyId_nameNormalized: {
            familyId: "fam-1",
            nameNormalized: "dinner",
          },
        },
      }),
    );
    // Joins are (re)created for the new meal.
    expect(prismaMock.mealTag.createMany).toHaveBeenCalled();
    expect(prismaMock.mealCategory.createMany).toHaveBeenCalled();
  });

  it("write: PATCH meals replace-sets tags and clears categories with [] (#107)", async () => {
    mockCredential(["meal:write"]);
    prismaMock.$transaction.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (cb: any) => Promise.resolve(cb(prismaMock)),
    );
    prismaMock.meal.findFirst.mockResolvedValue({
      id: "meal-1",
      placeholderKind: null,
    } as never);
    prismaMock.meal.update.mockResolvedValue({ id: "meal-1" } as never);
    prismaMock.tag.upsert.mockResolvedValue({ id: "tag-1" } as never);
    prismaMock.mealTag.deleteMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.mealTag.createMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.mealCategory.deleteMany.mockResolvedValue({ count: 2 } as never);
    prismaMock.meal.findUniqueOrThrow.mockResolvedValue({
      id: "meal-1",
      ingredients: [],
      tags: [],
      categories: [],
    } as never);

    const handlers = findStack("/meals/:mealId");
    const req = agentReq(
      { mealId: "meal-1" },
      { tags: ["Quick"], categories: [] },
    );
    const res = buildRes();
    await runStack(handlers, req, res);

    expect(res.statusCode).toBe(200);
    // Tag upsert is family-scoped to the credential (fam-1).
    expect(prismaMock.tag.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          familyId_nameNormalized: { familyId: "fam-1", nameNormalized: "quick" },
        },
      }),
    );
    // Replace-set: existing tag joins are cleared before re-create.
    expect(prismaMock.mealTag.deleteMany).toHaveBeenCalledWith({
      where: { mealId: "meal-1" },
    });
    // categories: [] clears all category joins and creates none.
    expect(prismaMock.mealCategory.deleteMany).toHaveBeenCalledWith({
      where: { mealId: "meal-1" },
    });
    expect(prismaMock.mealCategory.createMany).not.toHaveBeenCalled();
  });

  // --- #100 instructions parity (parity.instructions.md row 4) ---
  // The agent write path shares mealService.createMeal / updateMeal with REST,
  // so ordering + replace-all are covered exhaustively in services/meals.test.ts.
  // These pin the agent-SPECIFIC surface: the credential's family scopes the
  // write, and a placeholder meal cannot receive instructions (403).

  it("write: POST meals nested-creates ordered instructions (#100, parity row 4)", async () => {
    mockCredential(["meal:write"]);
    prismaMock.$transaction.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (cb: any) => Promise.resolve(cb(prismaMock)),
    );
    prismaMock.meal.create.mockResolvedValue({ id: "meal-1" } as never);

    const handlers = findStack("/meals");
    const req = agentReq(
      {},
      {
        name: "Tacos",
        instructions: [
          { text: "Warm the tortillas" },
          { text: "Assemble", timerMinutes: 2 },
        ],
      },
    );
    const res = buildRes();
    await runStack(handlers, req, res);

    expect(res.statusCode).toBe(201);
    const arg = prismaMock.meal.create.mock.calls[0][0] as {
      data: {
        instructions?: {
          create: { text: string; timerMinutes: number | null; position: number }[];
        };
      };
    };
    expect(arg.data.instructions?.create).toEqual([
      { text: "Warm the tortillas", timerMinutes: null, position: 0 },
      { text: "Assemble", timerMinutes: 2, position: 1 },
    ]);
  });

  it("write: PATCH meals replace-alls instructions in order (#100, parity row 4)", async () => {
    mockCredential(["meal:write"]);
    prismaMock.$transaction.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (cb: any) => Promise.resolve(cb(prismaMock)),
    );
    prismaMock.meal.findFirst.mockResolvedValue({
      id: "meal-1",
      placeholderKind: null,
    } as never);
    prismaMock.mealInstruction.deleteMany.mockResolvedValue({
      count: 3,
    } as never);
    prismaMock.meal.update.mockResolvedValue({ id: "meal-1" } as never);

    const handlers = findStack("/meals/:mealId");
    const req = agentReq(
      { mealId: "meal-1" },
      { instructions: [{ text: "First" }, { text: "Second" }] },
    );
    const res = buildRes();
    await runStack(handlers, req, res);

    expect(res.statusCode).toBe(200);
    // Replace-all: existing steps deleted before recreation.
    expect(prismaMock.mealInstruction.deleteMany).toHaveBeenCalledWith({
      where: { mealId: "meal-1" },
    });
    const arg = prismaMock.meal.update.mock.calls[0][0] as {
      data: {
        instructions?: { create: { text: string; position: number }[] };
      };
    };
    expect(
      arg.data.instructions?.create.map((s) => [s.position, s.text]),
    ).toEqual([
      [0, "First"],
      [1, "Second"],
    ]);
  });

  it("write: PATCH meals rejects instructions on a placeholder meal (#100, 403)", async () => {
    mockCredential(["meal:write"]);
    prismaMock.$transaction.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (cb: any) => Promise.resolve(cb(prismaMock)),
    );
    prismaMock.meal.findFirst.mockResolvedValue({
      id: "meal-1",
      placeholderKind: "LEFTOVERS",
    } as never);

    const handlers = findStack("/meals/:mealId");
    const req = agentReq(
      { mealId: "meal-1" },
      { instructions: [{ text: "Nope" }] },
    );
    const res = buildRes();
    await runStack(handlers, req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ error: "Cannot modify placeholder meal" });
    // Guard fires before any instruction write.
    expect(prismaMock.mealInstruction.deleteMany).not.toHaveBeenCalled();
  });

  it("repeat: copies approved source meals into the target week as unapproved (schedule scope)", async () => {
    mockCredential(["meal_plan:schedule"]);
    prismaMock.$transaction.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (cb: any) => Promise.resolve(cb(prismaMock)),
    );
    // getWeekPlan(source): one approved + one unapproved on the Monday.
    prismaMock.weekPlan.findFirst
      .mockResolvedValueOnce({
        id: "src",
        days: [
          {
            id: "s-mon",
            date: new Date("2026-05-04T00:00:00Z"),
            suggestions: [
              { mealId: "meal-A", approved: true },
              { mealId: "meal-B", approved: false },
            ],
          },
        ],
      } as never)
      // getOrCreateWeekPlan(target): empty target week (7 days seeded).
      .mockResolvedValueOnce({
        id: "tgt",
        days: [
          { id: "t-mon", date: new Date("2026-05-11T00:00:00Z"), suggestions: [] },
        ],
      } as never)
      // Re-fetch after copy.
      .mockResolvedValueOnce({ id: "tgt", days: [] } as never);
    prismaMock.mealSuggestion.createMany.mockResolvedValue({ count: 1 } as never);

    const handlers = findStack("/:familyId/weeks/:weekStart/repeat");
    const req = agentReq(
      { familyId: "fam-1", weekStart: "2026-05-11" },
      { sourceWeekStart: "2026-05-04" },
    );
    const res = buildRes();
    await runStack(handlers, req, res);

    expect(res.statusCode).toBe(201);
    // Only the approved meal is copied, as a new unapproved suggestion.
    const createArg = prismaMock.mealSuggestion.createMany.mock
      .calls[0][0] as { data: { mealId: string; approved: boolean; userId: string }[] };
    expect(createArg.data).toEqual([
      { dayPlanId: "t-mon", mealId: "meal-A", userId: "parent-1", approved: false },
    ]);
    expect(prismaMock.agentAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "meal_plan:schedule",
        outcome: "allowed",
        targetType: "weekPlan",
      }),
    });
  });

  it("repeat: a read-only credential cannot repeat (403, no write, audited denied)", async () => {
    mockCredential(["meal_plan:read"]);

    const handlers = findStack("/:familyId/weeks/:weekStart/repeat");
    const req = agentReq(
      { familyId: "fam-1", weekStart: "2026-05-11" },
      { sourceWeekStart: "2026-05-04" },
    );
    const res = buildRes();
    await runStack(handlers, req, res);

    expect(res.statusCode).toBe(403);
    expect(prismaMock.mealSuggestion.createMany).not.toHaveBeenCalled();
    expect(prismaMock.agentAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        outcome: "denied",
        reason: "missing_scope",
      }),
    });
  });

  it("repeat: a credential for another family is denied (403, no service call)", async () => {
    mockCredential(["meal_plan:schedule"]);

    const handlers = findStack("/:familyId/weeks/:weekStart/repeat");
    const req = agentReq(
      { familyId: "fam-OTHER", weekStart: "2026-05-11" },
      { sourceWeekStart: "2026-05-04" },
    );
    const res = buildRes();
    await runStack(handlers, req, res);

    expect(res.statusCode).toBe(403);
    expect(prismaMock.weekPlan.findFirst).not.toHaveBeenCalled();
  });

  it("random: picks an eligible meal and schedules it unapproved (schedule scope)", async () => {
    mockCredential(["meal_plan:schedule"]);
    // selectRandomMeal candidate query — one eligible meal.
    prismaMock.meal.findMany.mockResolvedValue([{ id: "meal-1" }] as never);
    // scheduleMealByDate → getOrCreateWeekPlan returns an existing week whose
    // day matches the target date label so the write path proceeds.
    prismaMock.weekPlan.findFirst.mockResolvedValue({
      id: "wp-1",
      days: [{ id: "day-1", date: new Date("2026-05-20T00:00:00Z") }],
    } as never);
    // addSuggestion family-scope checks + create.
    prismaMock.dayPlan.findFirst.mockResolvedValue({ id: "day-1" } as never);
    prismaMock.meal.findFirst.mockResolvedValue({ id: "meal-1" } as never);
    prismaMock.mealSuggestion.create.mockResolvedValue({
      id: "s-1",
      mealId: "meal-1",
      approved: false,
    } as never);

    const handlers = findStack("/:familyId/schedule/random");
    const req = agentReq(
      { familyId: "fam-1" },
      { date: "2026-05-20", difficulty: ["EASY"] },
    );
    const res = buildRes();
    await runStack(handlers, req, res);

    expect(res.statusCode).toBe(201);
    const createArg = prismaMock.mealSuggestion.create.mock.calls[0][0] as {
      data: { userId: string; approved: boolean };
    };
    expect(createArg.data.userId).toBe("parent-1");
    expect(createArg.data.approved).toBe(false);
    // Candidate query is family-scoped and excludes placeholders.
    const findManyArg = prismaMock.meal.findMany.mock.calls[0][0] as {
      where: { familyId: string; placeholderKind: null };
    };
    expect(findManyArg.where.familyId).toBe("fam-1");
    expect(findManyArg.where.placeholderKind).toBeNull();
    expect(prismaMock.agentAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "meal_plan:schedule",
        outcome: "allowed",
        targetType: "mealSuggestion",
        targetIds: ["s-1", "meal-1"],
      }),
    });
  });

  it("random: no eligible meal yields 422 and an audited denial (targetIds empty)", async () => {
    mockCredential(["meal_plan:schedule"]);
    prismaMock.meal.findMany.mockResolvedValue([] as never);

    const handlers = findStack("/:familyId/schedule/random");
    const req = agentReq({ familyId: "fam-1" }, { date: "2026-05-20" });
    const res = buildRes();
    await runStack(handlers, req, res);

    expect(res.statusCode).toBe(422);
    expect(prismaMock.mealSuggestion.create).not.toHaveBeenCalled();
    expect(prismaMock.agentAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "meal_plan:schedule",
        outcome: "denied",
        reason: "error_422",
        targetIds: [],
      }),
    });
  });

  it("random: a read-only credential cannot schedule (403, no candidate query)", async () => {
    mockCredential(["meal_plan:read"]);

    const handlers = findStack("/:familyId/schedule/random");
    const req = agentReq({ familyId: "fam-1" }, { date: "2026-05-20" });
    const res = buildRes();
    await runStack(handlers, req, res);

    expect(res.statusCode).toBe(403);
    expect(prismaMock.meal.findMany).not.toHaveBeenCalled();
    expect(prismaMock.agentAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        outcome: "denied",
        reason: "missing_scope",
      }),
    });
  });

  it("random: a credential for another family is denied (403, no candidate query)", async () => {
    mockCredential(["meal_plan:schedule"]);

    const handlers = findStack("/:familyId/schedule/random");
    const req = agentReq({ familyId: "fam-OTHER" }, { date: "2026-05-20" });
    const res = buildRes();
    await runStack(handlers, req, res);

    expect(res.statusCode).toBe(403);
    expect(prismaMock.meal.findMany).not.toHaveBeenCalled();
  });
});
