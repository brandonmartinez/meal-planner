import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../../tests/helpers/prisma.js";
import { buildReq, buildNext } from "../../tests/helpers/express.js";
import { getRouteHandler, buildFullRes } from "../../tests/helpers/router.js";

vi.mock("../config/database.js", () => ({ default: prismaMock }));

// Real TemplateError class so `error instanceof TemplateError` works in the
// route handlers; service methods are stubbed.
class TemplateError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "TemplateError";
    this.status = status;
  }
}

vi.mock("../services/planningTemplates.js", () => ({
  TemplateError,
  listTemplates: vi.fn(),
  getTemplate: vi.fn(),
  createTemplate: vi.fn(),
  updateTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
  applyTemplate: vi.fn(),
}));

const { planningTemplatesRouter } = await import("./planningTemplates.js");
const templateService = await import("../services/planningTemplates.js");
// Real middleware (NOT mocked) — proves the PARENT gate is wired on DELETE.
const { requireRole } = await import("../middleware/auth.js");

const FAMILY_ID = "fam-1";
const USER = { id: "user-1" };

function req(over: Record<string, unknown> = {}) {
  return buildReq({ user: USER as never, ...over });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/families/:familyId/templates (list)", () => {
  const handler = getRouteHandler(
    planningTemplatesRouter,
    "get",
    "/:familyId/templates",
  );

  it("200s with the family's templates", async () => {
    vi.mocked(templateService.listTemplates).mockResolvedValue([
      { id: "tmpl-1" },
    ] as never);
    const res = buildFullRes();
    await handler(req({ params: { familyId: FAMILY_ID } }), res, buildNext());
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ templates: [{ id: "tmpl-1" }] });
    expect(templateService.listTemplates).toHaveBeenCalledWith(FAMILY_ID);
  });

  it("500s when the service throws", async () => {
    vi.mocked(templateService.listTemplates).mockRejectedValue(
      new Error("boom"),
    );
    const res = buildFullRes();
    await handler(req({ params: { familyId: FAMILY_ID } }), res, buildNext());
    expect(res.statusCode).toBe(500);
  });
});

describe("POST /api/families/:familyId/templates (create)", () => {
  const handler = getRouteHandler(
    planningTemplatesRouter,
    "post",
    "/:familyId/templates",
  );

  it("201s with the created template", async () => {
    vi.mocked(templateService.createTemplate).mockResolvedValue({
      id: "tmpl-1",
    } as never);
    const res = buildFullRes();
    await handler(
      req({
        params: { familyId: FAMILY_ID },
        body: { name: "Weeknights", entries: [{ dayOfWeek: 0, mealId: "m-1" }] },
      }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ id: "tmpl-1" });
  });

  it("400s on an invalid body (missing name)", async () => {
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID }, body: { entries: [] } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(400);
    expect(templateService.createTemplate).not.toHaveBeenCalled();
  });

  it("400s on an out-of-range dayOfWeek", async () => {
    const res = buildFullRes();
    await handler(
      req({
        params: { familyId: FAMILY_ID },
        body: { name: "Bad", entries: [{ dayOfWeek: 9, mealId: "m-1" }] },
      }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(400);
  });

  it("propagates a TemplateError status (409 name collision)", async () => {
    vi.mocked(templateService.createTemplate).mockRejectedValue(
      new TemplateError(409, "duplicate"),
    );
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID }, body: { name: "Dupe" } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(409);
  });
});

describe("GET /api/families/:familyId/templates/:templateId (get)", () => {
  const handler = getRouteHandler(
    planningTemplatesRouter,
    "get",
    "/:familyId/templates/:templateId",
  );

  it("404s when the template is missing / cross-family", async () => {
    vi.mocked(templateService.getTemplate).mockResolvedValue(null as never);
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID, templateId: "tmpl-x" } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(404);
  });

  it("200s with the template", async () => {
    vi.mocked(templateService.getTemplate).mockResolvedValue({
      id: "tmpl-1",
    } as never);
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID, templateId: "tmpl-1" } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ id: "tmpl-1" });
  });
});

describe("PATCH /api/families/:familyId/templates/:templateId (update)", () => {
  const handler = getRouteHandler(
    planningTemplatesRouter,
    "patch",
    "/:familyId/templates/:templateId",
  );

  it("400s when no fields are provided", async () => {
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID, templateId: "tmpl-1" }, body: {} }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(400);
    expect(templateService.updateTemplate).not.toHaveBeenCalled();
  });

  it("200s with the updated template", async () => {
    vi.mocked(templateService.updateTemplate).mockResolvedValue({
      id: "tmpl-1",
      name: "Renamed",
    } as never);
    const res = buildFullRes();
    await handler(
      req({
        params: { familyId: FAMILY_ID, templateId: "tmpl-1" },
        body: { name: "Renamed" },
      }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ id: "tmpl-1", name: "Renamed" });
  });

  it("propagates a 404 TemplateError", async () => {
    vi.mocked(templateService.updateTemplate).mockRejectedValue(
      new TemplateError(404, "not found"),
    );
    const res = buildFullRes();
    await handler(
      req({
        params: { familyId: FAMILY_ID, templateId: "tmpl-x" },
        body: { name: "X" },
      }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(404);
  });
});

describe("DELETE /api/families/:familyId/templates/:templateId (parent-gated)", () => {
  const handler = getRouteHandler(
    planningTemplatesRouter,
    "delete",
    "/:familyId/templates/:templateId",
  );

  it("is gated by requireRole('PARENT') in the middleware chain", () => {
    const layer = (
      planningTemplatesRouter as unknown as {
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
        l.route?.path === "/:familyId/templates/:templateId" &&
        l.route.methods.delete === true,
    );
    // requireRole('PARENT') returns a fresh closure; assert one of the composed
    // handlers is the parent gate by matching against a reference instance's
    // name + arity (mirrors the collection-delete convention).
    const gate = requireRole("PARENT");
    const present = layer?.route?.stack.some(
      (s) =>
        typeof s.handle === "function" &&
        (s.handle as (...a: unknown[]) => unknown).length === gate.length,
    );
    expect(present).toBe(true);
  });

  it("204s on a successful delete", async () => {
    vi.mocked(templateService.deleteTemplate).mockResolvedValue(
      undefined as never,
    );
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID, templateId: "tmpl-1" } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(204);
  });

  it("propagates a 404 TemplateError", async () => {
    vi.mocked(templateService.deleteTemplate).mockRejectedValue(
      new TemplateError(404, "not found"),
    );
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID, templateId: "tmpl-x" } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(404);
  });
});

describe("POST /api/families/:familyId/templates/:templateId/apply", () => {
  const handler = getRouteHandler(
    planningTemplatesRouter,
    "post",
    "/:familyId/templates/:templateId/apply",
  );

  it("201s and returns the week plan with the applied (UNAPPROVED) suggestions", async () => {
    vi.mocked(templateService.applyTemplate).mockResolvedValue({
      id: "wp-1",
      days: [
        { id: "d-0", suggestions: [{ id: "s-1", approved: false }] },
      ],
    } as never);
    const res = buildFullRes();
    await handler(
      req({
        params: { familyId: FAMILY_ID, templateId: "tmpl-1" },
        body: { targetWeekStart: "2026-05-11" },
      }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(201);
    expect(templateService.applyTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        familyId: FAMILY_ID,
        templateId: "tmpl-1",
        userId: USER.id,
      }),
    );
    // returned rows are UNAPPROVED
    const body = res.body as {
      days: { suggestions: { approved: boolean }[] }[];
    };
    expect(body.days[0].suggestions[0].approved).toBe(false);
  });

  it("400s when targetWeekStart is missing", async () => {
    const res = buildFullRes();
    await handler(
      req({
        params: { familyId: FAMILY_ID, templateId: "tmpl-1" },
        body: {},
      }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(400);
    expect(templateService.applyTemplate).not.toHaveBeenCalled();
  });

  it("400s on an invalid existingMode", async () => {
    const res = buildFullRes();
    await handler(
      req({
        params: { familyId: FAMILY_ID, templateId: "tmpl-1" },
        body: { targetWeekStart: "2026-05-11", existingMode: "nope" },
      }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(400);
  });

  it("propagates a 409 TemplateError (existing suggestions, default mode)", async () => {
    vi.mocked(templateService.applyTemplate).mockRejectedValue(
      new TemplateError(409, "week not empty"),
    );
    const res = buildFullRes();
    await handler(
      req({
        params: { familyId: FAMILY_ID, templateId: "tmpl-1" },
        body: { targetWeekStart: "2026-05-11" },
      }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(409);
  });

  it("propagates a 422 TemplateError (empty template)", async () => {
    vi.mocked(templateService.applyTemplate).mockRejectedValue(
      new TemplateError(422, "empty template"),
    );
    const res = buildFullRes();
    await handler(
      req({
        params: { familyId: FAMILY_ID, templateId: "tmpl-1" },
        body: { targetWeekStart: "2026-05-11" },
      }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(422);
  });
});
