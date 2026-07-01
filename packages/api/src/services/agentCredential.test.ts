import { describe, it, expect, vi } from "vitest";
import crypto from "crypto";
import { prismaMock } from "../../tests/helpers/prisma.js";

vi.mock("../config/database.js", () => ({ default: prismaMock }));

const {
  createAgentCredential,
  listAgentCredentials,
  rotateAgentCredential,
  revokeAgentCredential,
  authenticateAgentCredential,
  recordAgentAudit,
  safeRecordAgentAudit,
  hasScope,
  isAgentScope,
  AGENT_SCOPES,
} = await import("./agentCredential.js");

function sha256(s: string) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

describe("agentCredential service", () => {
  describe("scope helpers", () => {
    it("recognizes only the three known scopes", () => {
      expect(isAgentScope("meal_plan:read")).toBe(true);
      expect(isAgentScope("meal_plan:schedule")).toBe(true);
      expect(isAgentScope("meal_plan:approve")).toBe(true);
      expect(isAgentScope("members:write")).toBe(false);
      expect(isAgentScope("meal_plan:delete")).toBe(false);
    });

    it("hasScope checks membership", () => {
      expect(hasScope(["meal_plan:read"], AGENT_SCOPES.READ)).toBe(true);
      expect(hasScope(["meal_plan:read"], AGENT_SCOPES.APPROVE)).toBe(false);
    });
  });

  describe("createAgentCredential", () => {
    it("returns the raw key once and stores only the hash + scopes", async () => {
      const stored: {
        hashedKey?: string;
        scopes?: string[];
        familyId?: string;
        createdBy?: string;
      } = {};
      prismaMock.agentCredential.create.mockImplementation(
        async (args: unknown) => {
          const a = args as {
            data: {
              hashedKey: string;
              scopes: string[];
              familyId: string;
              createdBy: string;
              name: string;
            };
          };
          stored.hashedKey = a.data.hashedKey;
          stored.scopes = a.data.scopes;
          stored.familyId = a.data.familyId;
          stored.createdBy = a.data.createdBy;
          return {
            id: "cred-1",
            name: a.data.name,
            scopes: a.data.scopes,
            expiresAt: null,
            createdAt: new Date("2026-06-30T00:00:00Z"),
          } as never;
        },
      );

      const result = await createAgentCredential(
        "fam-1",
        "parent-1",
        "Planner Bot",
        [AGENT_SCOPES.READ, AGENT_SCOPES.SCHEDULE],
      );

      expect(result.key).toMatch(/^[a-f0-9]{64}$/);
      expect(stored.hashedKey).toBe(sha256(result.key));
      expect(stored.hashedKey).not.toBe(result.key);
      expect(stored.scopes).toEqual(["meal_plan:read", "meal_plan:schedule"]);
      expect(stored.familyId).toBe("fam-1");
      expect(stored.createdBy).toBe("parent-1");
    });
  });

  describe("listAgentCredentials", () => {
    it("scopes by familyId and never selects the hashed key", async () => {
      prismaMock.agentCredential.findMany.mockResolvedValue([] as never);
      await listAgentCredentials("fam-1");
      const arg = prismaMock.agentCredential.findMany.mock.calls[0][0] as {
        select: Record<string, boolean>;
        orderBy: { createdAt: string };
        where: { familyId: string };
      };
      expect(arg.where).toEqual({ familyId: "fam-1" });
      expect(arg.orderBy).toEqual({ createdAt: "desc" });
      expect(arg.select.hashedKey).toBeUndefined();
    });
  });

  describe("rotateAgentCredential", () => {
    it("issues a new raw key and replaces the stored hash", async () => {
      prismaMock.agentCredential.findFirst.mockResolvedValue({
        id: "cred-1",
        revokedAt: null,
      } as never);
      let updatedHash: string | undefined;
      prismaMock.agentCredential.update.mockImplementation(
        async (args: unknown) => {
          const a = args as { data: { hashedKey: string } };
          updatedHash = a.data.hashedKey;
          return {
            id: "cred-1",
            name: "Planner Bot",
            scopes: ["meal_plan:read"],
            expiresAt: null,
            createdAt: new Date("2026-06-30T00:00:00Z"),
          } as never;
        },
      );

      const result = await rotateAgentCredential("cred-1", "fam-1");

      expect(result).not.toBeNull();
      expect(result!.key).toMatch(/^[a-f0-9]{64}$/);
      expect(updatedHash).toBe(sha256(result!.key));
    });

    it("refuses to rotate a revoked credential", async () => {
      prismaMock.agentCredential.findFirst.mockResolvedValue({
        id: "cred-1",
        revokedAt: new Date("2026-01-01"),
      } as never);
      const result = await rotateAgentCredential("cred-1", "fam-1");
      expect(result).toBeNull();
      expect(prismaMock.agentCredential.update).not.toHaveBeenCalled();
    });

    it("refuses to rotate a credential from another family", async () => {
      prismaMock.agentCredential.findFirst.mockResolvedValue(null);
      const result = await rotateAgentCredential("cred-1", "fam-OTHER");
      expect(result).toBeNull();
      // The lookup is family-scoped.
      const arg = prismaMock.agentCredential.findFirst.mock.calls[0][0] as {
        where: { id: string; familyId: string };
      };
      expect(arg.where).toEqual({ id: "cred-1", familyId: "fam-OTHER" });
    });
  });

  describe("revokeAgentCredential", () => {
    it("stamps revokedAt when in family", async () => {
      prismaMock.agentCredential.findFirst.mockResolvedValue({
        id: "cred-1",
        revokedAt: null,
      } as never);
      prismaMock.agentCredential.update.mockResolvedValue({
        id: "cred-1",
        revokedAt: new Date("2026-06-30T01:00:00Z"),
      } as never);

      const out = await revokeAgentCredential("cred-1", "fam-1");
      expect(out?.id).toBe("cred-1");
      expect(prismaMock.agentCredential.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "cred-1" },
          data: { revokedAt: expect.any(Date) },
        }),
      );
    });

    it("is idempotent for an already-revoked credential (no second write)", async () => {
      const when = new Date("2026-01-01");
      prismaMock.agentCredential.findFirst.mockResolvedValue({
        id: "cred-1",
        revokedAt: when,
      } as never);
      const out = await revokeAgentCredential("cred-1", "fam-1");
      expect(out).toEqual({ id: "cred-1", revokedAt: when });
      expect(prismaMock.agentCredential.update).not.toHaveBeenCalled();
    });

    it("returns null for a credential from another family", async () => {
      prismaMock.agentCredential.findFirst.mockResolvedValue(null);
      const out = await revokeAgentCredential("cred-1", "fam-OTHER");
      expect(out).toBeNull();
      expect(prismaMock.agentCredential.update).not.toHaveBeenCalled();
    });
  });

  describe("authenticateAgentCredential", () => {
    it("returns unknown for an unrecognized key (no lastUsed bump)", async () => {
      prismaMock.agentCredential.findUnique.mockResolvedValue(null);
      const out = await authenticateAgentCredential("nope");
      expect(out).toEqual({ ok: false, reason: "unknown" });
      expect(prismaMock.agentCredential.update).not.toHaveBeenCalled();
    });

    it("returns revoked for a revoked key (no lastUsed bump)", async () => {
      prismaMock.agentCredential.findUnique.mockResolvedValue({
        id: "cred-1",
        familyId: "fam-1",
        scopes: ["meal_plan:read"],
        createdBy: "parent-1",
        revokedAt: new Date("2026-01-01"),
        expiresAt: null,
      } as never);
      const out = await authenticateAgentCredential("rawkey");
      expect(out).toEqual({ ok: false, reason: "revoked" });
      expect(prismaMock.agentCredential.update).not.toHaveBeenCalled();
    });

    it("returns expired for an expired key (no lastUsed bump)", async () => {
      prismaMock.agentCredential.findUnique.mockResolvedValue({
        id: "cred-1",
        familyId: "fam-1",
        scopes: ["meal_plan:read"],
        createdBy: "parent-1",
        revokedAt: null,
        expiresAt: new Date("2000-01-01"),
      } as never);
      const out = await authenticateAgentCredential("rawkey");
      expect(out).toEqual({ ok: false, reason: "expired" });
      expect(prismaMock.agentCredential.update).not.toHaveBeenCalled();
    });

    it("hashes the presented key, returns scope/family, and bumps lastUsed", async () => {
      prismaMock.agentCredential.findUnique.mockResolvedValue({
        id: "cred-1",
        familyId: "fam-1",
        scopes: ["meal_plan:read", "meal_plan:approve"],
        createdBy: "parent-1",
        revokedAt: null,
        expiresAt: null,
      } as never);
      prismaMock.agentCredential.update.mockResolvedValue({} as never);

      const out = await authenticateAgentCredential("rawkey");

      expect(out).toEqual({
        ok: true,
        credential: {
          id: "cred-1",
          familyId: "fam-1",
          scopes: ["meal_plan:read", "meal_plan:approve"],
          createdBy: "parent-1",
        },
      });
      const lookup = prismaMock.agentCredential.findUnique.mock.calls[0][0] as {
        where: { hashedKey: string };
      };
      expect(lookup.where.hashedKey).toBe(sha256("rawkey"));
      expect(prismaMock.agentCredential.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "cred-1" },
          data: { lastUsed: expect.any(Date) },
        }),
      );
    });
  });

  describe("recordAgentAudit", () => {
    it("defaults actorType to agent and records who/what/outcome/target", async () => {
      prismaMock.agentAuditLog.create.mockResolvedValue({} as never);
      await recordAgentAudit({
        credentialId: "cred-1",
        familyId: "fam-1",
        action: "meal_plan:approve",
        outcome: "allowed",
        targetType: "mealSuggestion",
        targetIds: ["s-1"],
      });
      expect(prismaMock.agentAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actorType: "agent",
          credentialId: "cred-1",
          familyId: "fam-1",
          action: "meal_plan:approve",
          outcome: "allowed",
          targetType: "mealSuggestion",
          targetIds: ["s-1"],
          reason: null,
        }),
      });
    });
  });

  describe("safeRecordAgentAudit", () => {
    it("writes through to recordAgentAudit and does not log on success", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      prismaMock.agentAuditLog.create.mockResolvedValue({} as never);

      await safeRecordAgentAudit({
        credentialId: "cred-1",
        familyId: "fam-1",
        action: "meal_plan:read",
        outcome: "allowed",
      });

      expect(prismaMock.agentAuditLog.create).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it("swallows the error but surfaces a structured [audit] log when the write fails", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      prismaMock.agentAuditLog.create.mockRejectedValue(
        new Error("audit db unreachable"),
      );

      // Must resolve (never throw) — auditing must not break the caller.
      await expect(
        safeRecordAgentAudit({
          credentialId: "cred-9",
          familyId: "fam-9",
          action: "meal_plan:schedule",
          outcome: "allowed",
          reason: null,
        }),
      ).resolves.toBeUndefined();

      // The drop is observable with enough context to investigate.
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const [message, context] = consoleErrorSpy.mock.calls[0];
      expect(message).toContain("[audit]");
      expect(context).toEqual({
        action: "meal_plan:schedule",
        outcome: "allowed",
        familyId: "fam-9",
        credentialId: "cred-9",
        reason: null,
        error: "audit db unreachable",
      });

      // Only the credential id is ever logged — never a raw key/secret. The
      // logged context carries exactly the fields above and nothing more.
      expect(Object.keys(context as object).sort()).toEqual([
        "action",
        "credentialId",
        "error",
        "familyId",
        "outcome",
        "reason",
      ]);

      consoleErrorSpy.mockRestore();
    });
  });
});
