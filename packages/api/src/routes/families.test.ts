import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../../tests/helpers/prisma.js";
import { buildReq, buildNext } from "../../tests/helpers/express.js";
import { getRouteHandler, buildFullRes } from "../../tests/helpers/router.js";

vi.mock("../config/database.js", () => ({ default: prismaMock }));
vi.mock("../services/family.js", () => ({
  createFamily: vi.fn(),
  getUserFamilies: vi.fn(),
  getFamilyById: vi.fn(),
  getMembers: vi.fn(),
  generateInviteToken: vi.fn(),
  joinFamily: vi.fn(),
  updateFamily: vi.fn(),
  updateMemberRole: vi.fn(),
  removeMember: vi.fn(),
}));
vi.mock("../services/apiKey.js", () => ({
  createApiKey: vi.fn(),
  listApiKeys: vi.fn(),
  revokeApiKey: vi.fn(),
}));

const { familyRouter } = await import("./families.js");
const familyService = await import("../services/family.js");
const apiKeyService = await import("../services/apiKey.js");

const FAMILY_ID = "fam-1";
const USER = { id: "user-1" };

function req(over: Record<string, unknown> = {}) {
  return buildReq({ user: USER as never, ...over });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/families (create)", () => {
  const handler = getRouteHandler(familyRouter, "post", "/");

  it("201s with the created family", async () => {
    vi.mocked(familyService.createFamily).mockResolvedValue({
      id: FAMILY_ID,
      name: "Martinez",
    } as never);
    const res = buildFullRes();
    await handler(req({ body: { name: "Martinez" } }), res, buildNext());

    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({ id: FAMILY_ID, name: "Martinez" });
    expect(familyService.createFamily).toHaveBeenCalledWith(USER.id, "Martinez");
  });

  it("400s on Zod failure (empty name)", async () => {
    const res = buildFullRes();
    await handler(req({ body: { name: "" } }), res, buildNext());

    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toBe("Validation failed");
    expect(familyService.createFamily).not.toHaveBeenCalled();
  });

  it("500s when the service throws", async () => {
    vi.mocked(familyService.createFamily).mockRejectedValue(new Error("db"));
    const res = buildFullRes();
    await handler(req({ body: { name: "Martinez" } }), res, buildNext());

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: "Failed to create family" });
  });
});

describe("GET /api/families (list)", () => {
  const handler = getRouteHandler(familyRouter, "get", "/");

  it("200s with the user's families", async () => {
    vi.mocked(familyService.getUserFamilies).mockResolvedValue([] as never);
    const res = buildFullRes();
    await handler(req(), res, buildNext());
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("500s when the service throws", async () => {
    vi.mocked(familyService.getUserFamilies).mockRejectedValue(new Error("db"));
    const res = buildFullRes();
    await handler(req(), res, buildNext());
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: "Failed to fetch families" });
  });
});

describe("GET /api/families/:familyId (detail)", () => {
  const handler = getRouteHandler(familyRouter, "get", "/:familyId");

  it("200s with the family", async () => {
    vi.mocked(familyService.getFamilyById).mockResolvedValue({
      id: FAMILY_ID,
    } as never);
    const res = buildFullRes();
    await handler(req({ params: { familyId: FAMILY_ID } }), res, buildNext());
    expect(res.statusCode).toBe(200);
  });

  it("404s when the family is not found", async () => {
    vi.mocked(familyService.getFamilyById).mockResolvedValue(null as never);
    const res = buildFullRes();
    await handler(req({ params: { familyId: FAMILY_ID } }), res, buildNext());
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: "Family not found" });
  });

  it("500s when the service throws", async () => {
    vi.mocked(familyService.getFamilyById).mockRejectedValue(new Error("db"));
    const res = buildFullRes();
    await handler(req({ params: { familyId: FAMILY_ID } }), res, buildNext());
    expect(res.statusCode).toBe(500);
  });
});

describe("POST /api/families/:familyId/invite", () => {
  const handler = getRouteHandler(familyRouter, "post", "/:familyId/invite");

  it("returns a token for a valid role", async () => {
    vi.mocked(familyService.generateInviteToken).mockReturnValue("tok-123");
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID }, body: { role: "PARENT" } }),
      res,
      buildNext(),
    );
    expect(res.body).toEqual({ token: "tok-123" });
  });

  it("400s on an invalid role enum", async () => {
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID }, body: { role: "WIZARD" } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(400);
    expect(familyService.generateInviteToken).not.toHaveBeenCalled();
  });
});

describe("POST /api/families/:familyId/join", () => {
  const handler = getRouteHandler(familyRouter, "post", "/:familyId/join");

  it("201s with the new membership", async () => {
    vi.mocked(familyService.joinFamily).mockResolvedValue({
      id: "mem-1",
    } as never);
    const res = buildFullRes();
    await handler(req({ body: { token: "tok" } }), res, buildNext());
    expect(res.statusCode).toBe(201);
  });

  it("400s on Zod failure (missing token)", async () => {
    const res = buildFullRes();
    await handler(req({ body: {} }), res, buildNext());
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toBe("Validation failed");
  });

  it("400s with the service error message for an invalid/expired token", async () => {
    vi.mocked(familyService.joinFamily).mockRejectedValue(
      new Error("Invalid invite token"),
    );
    const res = buildFullRes();
    await handler(req({ body: { token: "bad" } }), res, buildNext());
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "Invalid invite token" });
  });

  it("500s on a non-Error rejection", async () => {
    vi.mocked(familyService.joinFamily).mockRejectedValue("weird");
    const res = buildFullRes();
    await handler(req({ body: { token: "x" } }), res, buildNext());
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: "Failed to join family" });
  });
});

describe("PATCH /api/families/:familyId (update)", () => {
  const handler = getRouteHandler(familyRouter, "patch", "/:familyId");

  it("200s when updating the name", async () => {
    vi.mocked(familyService.updateFamily).mockResolvedValue({
      id: FAMILY_ID,
      name: "New",
    } as never);
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID }, body: { name: "New" } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(200);
  });

  it("400s when no updatable field is supplied (refine)", async () => {
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID }, body: {} }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(400);
    expect(familyService.updateFamily).not.toHaveBeenCalled();
  });

  it("400s on an unknown timezone", async () => {
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID }, body: { timezone: "Not/Real" } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(400);
  });

  it("500s when the service throws", async () => {
    vi.mocked(familyService.updateFamily).mockRejectedValue(new Error("db"));
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID }, body: { name: "New" } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(500);
  });
});

describe("PATCH /api/families/:familyId/members/:memberId (role)", () => {
  const handler = getRouteHandler(
    familyRouter,
    "patch",
    "/:familyId/members/:memberId",
  );

  it("200s on a valid role change", async () => {
    vi.mocked(familyService.updateMemberRole).mockResolvedValue({
      id: "mem-1",
      role: "CHILD",
    } as never);
    const res = buildFullRes();
    await handler(
      req({
        params: { familyId: FAMILY_ID, memberId: "mem-1" },
        body: { role: "CHILD" },
      }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(200);
  });

  it("400s on an invalid role", async () => {
    const res = buildFullRes();
    await handler(
      req({
        params: { familyId: FAMILY_ID, memberId: "mem-1" },
        body: { role: "BOSS" },
      }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(400);
  });
});

describe("DELETE /api/families/:familyId/members/:memberId", () => {
  const handler = getRouteHandler(
    familyRouter,
    "delete",
    "/:familyId/members/:memberId",
  );

  it("204s on success", async () => {
    vi.mocked(familyService.removeMember).mockResolvedValue(undefined as never);
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID, memberId: "mem-1" } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(204);
  });

  it("500s when the service throws", async () => {
    vi.mocked(familyService.removeMember).mockRejectedValue(new Error("db"));
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID, memberId: "mem-1" } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(500);
  });
});

describe("POST /api/families/:familyId/api-keys", () => {
  const handler = getRouteHandler(familyRouter, "post", "/:familyId/api-keys");

  it("201s with the created key", async () => {
    vi.mocked(apiKeyService.createApiKey).mockResolvedValue({
      id: "key-1",
      rawKey: "secret",
    } as never);
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID }, body: { name: "Mirror" } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(201);
    expect(apiKeyService.createApiKey).toHaveBeenCalledWith(
      FAMILY_ID,
      USER.id,
      "Mirror",
    );
  });

  it("400s on Zod failure (empty name)", async () => {
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID }, body: { name: "" } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(400);
    expect(apiKeyService.createApiKey).not.toHaveBeenCalled();
  });

  it("500s when the service throws", async () => {
    vi.mocked(apiKeyService.createApiKey).mockRejectedValue(new Error("db"));
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID }, body: { name: "Mirror" } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(500);
  });
});

describe("DELETE /api/families/:familyId/api-keys/:keyId", () => {
  const handler = getRouteHandler(
    familyRouter,
    "delete",
    "/:familyId/api-keys/:keyId",
  );

  it("204s on success and passes keyId + familyId in order", async () => {
    vi.mocked(apiKeyService.revokeApiKey).mockResolvedValue(undefined as never);
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID, keyId: "key-1" } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(204);
    expect(apiKeyService.revokeApiKey).toHaveBeenCalledWith("key-1", FAMILY_ID);
  });

  it("500s when the service throws", async () => {
    vi.mocked(apiKeyService.revokeApiKey).mockRejectedValue(new Error("db"));
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID, keyId: "key-1" } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(500);
  });
});
