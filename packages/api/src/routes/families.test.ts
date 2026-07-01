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
vi.mock("../services/agentCredential.js", () => ({
  // Real scope values so the route module's `z.nativeEnum(AGENT_SCOPES)` schema
  // builds correctly at import time.
  AGENT_SCOPES: {
    READ: "meal_plan:read",
    SCHEDULE: "meal_plan:schedule",
    APPROVE: "meal_plan:approve",
  },
  createAgentCredential: vi.fn(),
  listAgentCredentials: vi.fn(),
  rotateAgentCredential: vi.fn(),
  revokeAgentCredential: vi.fn(),
  recordAgentAudit: vi.fn(),
  safeRecordAgentAudit: vi.fn(),
}));

const { familyRouter } = await import("./families.js");
const familyService = await import("../services/family.js");
const apiKeyService = await import("../services/apiKey.js");
const agentCredentialService = await import("../services/agentCredential.js");
// Real middleware (NOT mocked) — used to prove non-parent / cross-family denial
// on the agent-credential management surface.
const { requireRole } = await import("../middleware/auth.js");
const { requireMembership } = await import("../middleware/membership.js");

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

// ── Agent-credential management ─────────────────────────────────────────────

const SCOPES = {
  READ: "meal_plan:read",
  SCHEDULE: "meal_plan:schedule",
  APPROVE: "meal_plan:approve",
};

describe("POST /api/families/:familyId/agent-credentials (create)", () => {
  const handler = getRouteHandler(
    familyRouter,
    "post",
    "/:familyId/agent-credentials",
  );

  it("201s and reveals the raw key exactly once, then audits the create", async () => {
    vi.mocked(agentCredentialService.createAgentCredential).mockResolvedValue({
      id: "cred-1",
      name: "Planner Bot",
      scopes: [SCOPES.READ],
      key: "RAW-KEY-ONCE",
      expiresAt: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
    } as never);
    const res = buildFullRes();
    await handler(
      req({
        params: { familyId: FAMILY_ID },
        body: { name: "Planner Bot", scopes: [SCOPES.READ] },
      }),
      res,
      buildNext(),
    );

    expect(res.statusCode).toBe(201);
    // Raw key present on the create response (the one-time reveal).
    expect((res.body as { key: string }).key).toBe("RAW-KEY-ONCE");
    expect(agentCredentialService.createAgentCredential).toHaveBeenCalledWith(
      FAMILY_ID,
      USER.id,
      "Planner Bot",
      [SCOPES.READ],
      null,
    );
    // Management action audited with parent actor + concrete target.
    expect(agentCredentialService.safeRecordAgentAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: "parent",
        credentialId: "cred-1",
        familyId: FAMILY_ID,
        action: "credential:create",
        outcome: "allowed",
      }),
    );
  });

  it("passes a future expiresAt through to the service", async () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    vi.mocked(agentCredentialService.createAgentCredential).mockResolvedValue({
      id: "cred-2",
      name: "Temp",
      scopes: [SCOPES.READ],
      key: "k",
      expiresAt: future,
      createdAt: new Date(),
    } as never);
    const res = buildFullRes();
    await handler(
      req({
        params: { familyId: FAMILY_ID },
        body: {
          name: "Temp",
          scopes: [SCOPES.READ],
          expiresAt: future.toISOString(),
        },
      }),
      res,
      buildNext(),
    );

    expect(res.statusCode).toBe(201);
    const call = vi.mocked(agentCredentialService.createAgentCredential).mock
      .calls[0];
    expect((call[4] as Date).getTime()).toBe(future.getTime());
  });

  it("400s on an unknown scope and never calls the service", async () => {
    const res = buildFullRes();
    await handler(
      req({
        params: { familyId: FAMILY_ID },
        body: { name: "Bad", scopes: ["meal_plan:delete"] },
      }),
      res,
      buildNext(),
    );

    expect(res.statusCode).toBe(400);
    expect(agentCredentialService.createAgentCredential).not.toHaveBeenCalled();
  });

  it("400s on empty scopes array", async () => {
    const res = buildFullRes();
    await handler(
      req({
        params: { familyId: FAMILY_ID },
        body: { name: "NoScopes", scopes: [] },
      }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(400);
    expect(agentCredentialService.createAgentCredential).not.toHaveBeenCalled();
  });

  it("400s when expiresAt is in the past", async () => {
    const res = buildFullRes();
    await handler(
      req({
        params: { familyId: FAMILY_ID },
        body: {
          name: "Expired",
          scopes: [SCOPES.READ],
          expiresAt: "2000-01-01T00:00:00Z",
        },
      }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(400);
    expect(agentCredentialService.createAgentCredential).not.toHaveBeenCalled();
  });

  it("500s when the service throws", async () => {
    vi.mocked(agentCredentialService.createAgentCredential).mockRejectedValue(
      new Error("db"),
    );
    const res = buildFullRes();
    await handler(
      req({
        params: { familyId: FAMILY_ID },
        body: { name: "Planner Bot", scopes: [SCOPES.READ] },
      }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(500);
  });
});

describe("GET /api/families/:familyId/agent-credentials (list)", () => {
  const handler = getRouteHandler(
    familyRouter,
    "get",
    "/:familyId/agent-credentials",
  );

  it("200s with metadata only — no hash, no raw key", async () => {
    const metadata = [
      {
        id: "cred-1",
        name: "Planner Bot",
        scopes: [SCOPES.READ],
        createdBy: USER.id,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        expiresAt: null,
        lastUsed: null,
        revokedAt: null,
      },
    ];
    vi.mocked(agentCredentialService.listAgentCredentials).mockResolvedValue(
      metadata as never,
    );
    const res = buildFullRes();
    await handler(req({ params: { familyId: FAMILY_ID } }), res, buildNext());

    expect(res.statusCode).toBe(200);
    expect(agentCredentialService.listAgentCredentials).toHaveBeenCalledWith(
      FAMILY_ID,
    );
    // Guard against secret leakage in the serialized payload.
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toMatch(/hashedKey/i);
    expect(serialized).not.toMatch(/"key"/);
    expect(res.body).toEqual(metadata);
  });

  it("500s when the service throws", async () => {
    vi.mocked(agentCredentialService.listAgentCredentials).mockRejectedValue(
      new Error("db"),
    );
    const res = buildFullRes();
    await handler(req({ params: { familyId: FAMILY_ID } }), res, buildNext());
    expect(res.statusCode).toBe(500);
  });
});

describe("POST /api/families/:familyId/agent-credentials/:credentialId/rotate", () => {
  const handler = getRouteHandler(
    familyRouter,
    "post",
    "/:familyId/agent-credentials/:credentialId/rotate",
  );

  it("200s with a new raw key once and audits the rotate", async () => {
    vi.mocked(agentCredentialService.rotateAgentCredential).mockResolvedValue({
      id: "cred-1",
      name: "Planner Bot",
      scopes: [SCOPES.READ],
      key: "NEW-RAW-KEY",
      expiresAt: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
    } as never);
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID, credentialId: "cred-1" } }),
      res,
      buildNext(),
    );

    expect(res.statusCode).toBe(200);
    expect((res.body as { key: string }).key).toBe("NEW-RAW-KEY");
    expect(agentCredentialService.rotateAgentCredential).toHaveBeenCalledWith(
      "cred-1",
      FAMILY_ID,
    );
    expect(agentCredentialService.safeRecordAgentAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: "parent",
        action: "credential:rotate",
        outcome: "allowed",
        credentialId: "cred-1",
        familyId: FAMILY_ID,
      }),
    );
  });

  it("404s (no audit) when the credential is absent / revoked / cross-family", async () => {
    vi.mocked(agentCredentialService.rotateAgentCredential).mockResolvedValue(
      null as never,
    );
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID, credentialId: "nope" } }),
      res,
      buildNext(),
    );

    expect(res.statusCode).toBe(404);
    expect(agentCredentialService.safeRecordAgentAudit).not.toHaveBeenCalled();
  });

  it("500s when the service throws", async () => {
    vi.mocked(agentCredentialService.rotateAgentCredential).mockRejectedValue(
      new Error("db"),
    );
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID, credentialId: "cred-1" } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(500);
  });
});

describe("DELETE /api/families/:familyId/agent-credentials/:credentialId (revoke)", () => {
  const handler = getRouteHandler(
    familyRouter,
    "delete",
    "/:familyId/agent-credentials/:credentialId",
  );

  it("200s with revokedAt and audits the revoke", async () => {
    const revokedAt = new Date("2026-06-01T00:00:00Z");
    vi.mocked(agentCredentialService.revokeAgentCredential).mockResolvedValue({
      id: "cred-1",
      revokedAt,
    } as never);
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID, credentialId: "cred-1" } }),
      res,
      buildNext(),
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ id: "cred-1", revokedAt });
    expect(agentCredentialService.revokeAgentCredential).toHaveBeenCalledWith(
      "cred-1",
      FAMILY_ID,
    );
    expect(agentCredentialService.safeRecordAgentAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: "parent",
        action: "credential:revoke",
        outcome: "allowed",
        credentialId: "cred-1",
        familyId: FAMILY_ID,
      }),
    );
  });

  it("404s (no audit) when the credential is absent / cross-family", async () => {
    vi.mocked(agentCredentialService.revokeAgentCredential).mockResolvedValue(
      null as never,
    );
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID, credentialId: "nope" } }),
      res,
      buildNext(),
    );

    expect(res.statusCode).toBe(404);
    expect(agentCredentialService.safeRecordAgentAudit).not.toHaveBeenCalled();
  });

  it("500s when the service throws", async () => {
    vi.mocked(agentCredentialService.revokeAgentCredential).mockRejectedValue(
      new Error("db"),
    );
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_ID, credentialId: "cred-1" } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(500);
  });
});

describe("agent-credential management — auth chain enforcement", () => {
  // The management routes are gated by authenticateJWT → requireMembership →
  // requireRole(PARENT). getRouteHandler bypasses middleware, so these tests
  // exercise the real middleware directly to prove non-parent and cross-family
  // callers are rejected before any handler runs.

  it("requireRole(PARENT) returns 403 for a CHILD member (non-parent denial)", () => {
    const child = {
      id: "child-1",
      memberships: [{ familyId: FAMILY_ID, role: "CHILD" }],
    };
    const res = buildFullRes();
    const next = buildNext();
    requireRole("PARENT")(
      req({ params: { familyId: FAMILY_ID }, user: child as never }),
      res,
      next,
    );
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("requireMembership returns 403 when the user is not in the route family (cross-family denial)", () => {
    const outsider = {
      id: "user-9",
      memberships: [{ familyId: "other-fam", role: "PARENT" }],
    };
    const res = buildFullRes();
    const next = buildNext();
    requireMembership(
      req({ params: { familyId: FAMILY_ID }, user: outsider as never }),
      res,
      next,
    );
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("requireRole(PARENT) allows a PARENT member through", () => {
    const parent = {
      id: USER.id,
      memberships: [{ familyId: FAMILY_ID, role: "PARENT" }],
    };
    const res = buildFullRes();
    const next = buildNext();
    requireRole("PARENT")(
      req({ params: { familyId: FAMILY_ID }, user: parent as never }),
      res,
      next,
    );
    expect(next).toHaveBeenCalled();
  });
});
