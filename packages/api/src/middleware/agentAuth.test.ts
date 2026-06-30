import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../../tests/helpers/prisma.js";
import { buildReq, buildRes, buildNext } from "../../tests/helpers/express.js";

vi.mock("../config/database.js", () => ({ default: prismaMock }));

const { authenticateAgent, requireScope } = await import("./agentAuth.js");
const { AGENT_SCOPES } = await import("../services/agentCredential.js");

function validCredential(overrides: Record<string, unknown> = {}) {
  return {
    id: "cred-1",
    familyId: "fam-1",
    scopes: ["meal_plan:read"],
    createdBy: "parent-1",
    revokedAt: null,
    expiresAt: null,
    ...overrides,
  };
}

describe("authenticateAgent", () => {
  beforeEach(() => {
    prismaMock.agentCredential.update.mockResolvedValue({} as never);
    prismaMock.agentAuditLog.create.mockResolvedValue({} as never);
  });

  it("responds 401 and audits when the x-agent-key header is missing", async () => {
    const req = buildReq({ params: { familyId: "fam-1" } });
    const res = buildRes();
    const next = buildNext();

    await authenticateAgent(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
    expect(prismaMock.agentAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        outcome: "denied",
        reason: "missing_credential",
        familyId: "fam-1",
      }),
    });
  });

  it("responds 401 on an unknown credential", async () => {
    prismaMock.agentCredential.findUnique.mockResolvedValue(null);
    const req = buildReq({
      params: { familyId: "fam-1" },
      headers: { "x-agent-key": "nope" },
    });
    const res = buildRes();
    const next = buildNext();

    await authenticateAgent(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
    expect(prismaMock.agentAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        outcome: "denied",
        reason: "unknown_credential",
      }),
    });
  });

  it("responds 401 on a revoked credential", async () => {
    prismaMock.agentCredential.findUnique.mockResolvedValue(
      validCredential({ revokedAt: new Date("2026-01-01") }) as never,
    );
    const req = buildReq({
      params: { familyId: "fam-1" },
      headers: { "x-agent-key": "rawkey" },
    });
    const res = buildRes();
    const next = buildNext();

    await authenticateAgent(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
    expect(prismaMock.agentAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ reason: "revoked_credential" }),
    });
  });

  it("responds 401 on an expired credential", async () => {
    prismaMock.agentCredential.findUnique.mockResolvedValue(
      validCredential({ expiresAt: new Date("2000-01-01") }) as never,
    );
    const req = buildReq({
      params: { familyId: "fam-1" },
      headers: { "x-agent-key": "rawkey" },
    });
    const res = buildRes();
    const next = buildNext();

    await authenticateAgent(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("attaches req.agent and calls next on a valid credential for the family", async () => {
    prismaMock.agentCredential.findUnique.mockResolvedValue(
      validCredential() as never,
    );
    const req = buildReq({
      params: { familyId: "fam-1" },
      headers: { "x-agent-key": "rawkey" },
    });
    const res = buildRes();
    const next = buildNext();

    await authenticateAgent(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.agent).toEqual({
      id: "cred-1",
      familyId: "fam-1",
      scopes: ["meal_plan:read"],
      createdBy: "parent-1",
    });
  });

  it("denies cross-family access (403) even with a valid credential", async () => {
    prismaMock.agentCredential.findUnique.mockResolvedValue(
      validCredential({ familyId: "fam-1" }) as never,
    );
    const req = buildReq({
      params: { familyId: "fam-OTHER" },
      headers: { "x-agent-key": "rawkey" },
    });
    const res = buildRes();
    const next = buildNext();

    await authenticateAgent(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
    expect(req.agent).toBeUndefined();
    expect(prismaMock.agentAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        outcome: "denied",
        reason: "cross_family",
        credentialId: "cred-1",
        familyId: "fam-1",
        targetIds: ["fam-OTHER"],
      }),
    });
  });
});

describe("requireScope", () => {
  beforeEach(() => {
    prismaMock.agentAuditLog.create.mockResolvedValue({} as never);
  });

  it("responds 401 when no agent is attached", async () => {
    const handler = requireScope(AGENT_SCOPES.READ);
    const req = buildReq();
    const res = buildRes();
    const next = buildNext();
    await handler(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("responds 403 and audits when the scope is missing", async () => {
    const handler = requireScope(AGENT_SCOPES.APPROVE);
    const req = buildReq();
    req.agent = {
      id: "cred-1",
      familyId: "fam-1",
      scopes: ["meal_plan:read"],
      createdBy: "parent-1",
    };
    const res = buildRes();
    const next = buildNext();

    await handler(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
    expect(prismaMock.agentAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        outcome: "denied",
        reason: "missing_scope",
        action: "meal_plan:approve",
      }),
    });
  });

  it("calls next when the scope is granted", async () => {
    const handler = requireScope(AGENT_SCOPES.READ);
    const req = buildReq();
    req.agent = {
      id: "cred-1",
      familyId: "fam-1",
      scopes: ["meal_plan:read"],
      createdBy: "parent-1",
    };
    const res = buildRes();
    const next = buildNext();

    await handler(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
