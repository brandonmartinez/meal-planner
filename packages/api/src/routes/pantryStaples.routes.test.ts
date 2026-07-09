import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../../tests/helpers/prisma.js";
import { buildReq, buildNext } from "../../tests/helpers/express.js";
import { getRouteHandler, buildFullRes } from "../../tests/helpers/router.js";

vi.mock("../config/database.js", () => ({ default: prismaMock }));

// Real PantryStapleError class so `error instanceof PantryStapleError` works in
// the route handlers; service methods are stubbed.
class PantryStapleError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "PantryStapleError";
    this.status = status;
  }
}

vi.mock("../services/pantryStaples.js", () => ({
  PantryStapleError,
  listPantryStaples: vi.fn(),
  createPantryStaple: vi.fn(),
  deletePantryStaple: vi.fn(),
  getPantryStapleNameSet: vi.fn(),
}));

const { pantryStaplesRouter } = await import("./pantryStaples.js");
const stapleService = await import("../services/pantryStaples.js");
// Real middleware (NOT mocked) — proves the PARENT gate is wired on mutations.
const { requireRole } = await import("../middleware/auth.js");

const FAMILY_ID = "fam-1";
const USER = { id: "user-1" };

function req(over: Record<string, unknown> = {}) {
  return buildReq({ user: USER as never, ...over });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/families/:familyId/pantry-staples (list)", () => {
  const handler = getRouteHandler(
    pantryStaplesRouter,
    "get",
    "/:familyId/pantry-staples",
  );

  it("200s with the family's staples wrapped in { staples }", async () => {
    vi.mocked(stapleService.listPantryStaples).mockResolvedValue([
      { id: "s-1", name: "Salt" },
    ] as never);
    const res = buildFullRes();
    await handler(req({ params: { familyId: FAMILY_ID } }), res, buildNext());
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ staples: [{ id: "s-1", name: "Salt" }] });
    expect(stapleService.listPantryStaples).toHaveBeenCalledWith(FAMILY_ID);
  });

  it("500s when the service throws", async () => {
    vi.mocked(stapleService.listPantryStaples).mockRejectedValue(
      new Error("boom"),
    );
    const res = buildFullRes();
    await handler(req({ params: { familyId: FAMILY_ID } }), res, buildNext());
    expect(res.statusCode).toBe(500);
  });
});

describe("POST /api/families/:familyId/pantry-staples (create, parent-gated)", () => {
  const handler = getRouteHandler(
    pantryStaplesRouter,
    "post",
    "/:familyId/pantry-staples",
  );

  it("is gated by requireRole('PARENT') in the middleware chain", () => {
    const layer = (
      pantryStaplesRouter as unknown as {
        stack: {
          route?: {
            path: string;
            methods: Record<string, boolean>;
            stack: { handle: unknown }[];
          };
        }[];
      }
    ).stack.find(
      (l) =>
        l.route?.path === "/:familyId/pantry-staples" &&
        l.route.methods.post === true,
    );
    const gate = requireRole("PARENT");
    const present = layer?.route?.stack.some(
      (s) =>
        typeof s.handle === "function" &&
        (s.handle as (...a: unknown[]) => unknown).length === gate.length,
    );
    expect(present).toBe(true);
  });

  it("201s with the created staple", async () => {
    vi.mocked(stapleService.createPantryStaple).mockResolvedValue({
      id: "s-1",
      name: "Salt",
    } as never);
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID }, body: { name: "Salt" } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ id: "s-1", name: "Salt" });
    expect(stapleService.createPantryStaple).toHaveBeenCalledWith(
      FAMILY_ID,
      "Salt",
    );
  });

  it("400s on an invalid body (missing name)", async () => {
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID }, body: {} }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(400);
    expect(stapleService.createPantryStaple).not.toHaveBeenCalled();
  });

  it("400s on a blank name", async () => {
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID }, body: { name: "   " } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(400);
    expect(stapleService.createPantryStaple).not.toHaveBeenCalled();
  });

  it("propagates a PantryStapleError status", async () => {
    vi.mocked(stapleService.createPantryStaple).mockRejectedValue(
      new PantryStapleError("nope", 400),
    );
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID }, body: { name: "Salt" } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(400);
  });
});

describe("DELETE /api/families/:familyId/pantry-staples/:stapleId (parent-gated)", () => {
  const handler = getRouteHandler(
    pantryStaplesRouter,
    "delete",
    "/:familyId/pantry-staples/:stapleId",
  );

  it("is gated by requireRole('PARENT') in the middleware chain", () => {
    const layer = (
      pantryStaplesRouter as unknown as {
        stack: {
          route?: {
            path: string;
            methods: Record<string, boolean>;
            stack: { handle: unknown }[];
          };
        }[];
      }
    ).stack.find(
      (l) =>
        l.route?.path === "/:familyId/pantry-staples/:stapleId" &&
        l.route.methods.delete === true,
    );
    const gate = requireRole("PARENT");
    const present = layer?.route?.stack.some(
      (s) =>
        typeof s.handle === "function" &&
        (s.handle as (...a: unknown[]) => unknown).length === gate.length,
    );
    expect(present).toBe(true);
  });

  it("204s on a successful delete", async () => {
    vi.mocked(stapleService.deletePantryStaple).mockResolvedValue(
      undefined as never,
    );
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID, stapleId: "s-1" } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(204);
    expect(stapleService.deletePantryStaple).toHaveBeenCalledWith(
      FAMILY_ID,
      "s-1",
    );
  });

  it("propagates a 404 PantryStapleError", async () => {
    vi.mocked(stapleService.deletePantryStaple).mockRejectedValue(
      new PantryStapleError("not found", 404),
    );
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID, stapleId: "nope" } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(404);
  });
});
