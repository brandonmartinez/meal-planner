import { Router, Request, Response } from "express";
import { z } from "zod";
import { authenticateJWT, requireRole } from "../middleware/auth.js";
import { requireMembership } from "../middleware/membership.js";
import { inviteJoinLimiter } from "../middleware/rateLimit.js";
import * as familyService from "../services/family.js";
import * as apiKeyService from "../services/apiKey.js";
import * as agentCredentialService from "../services/agentCredential.js";
import { AGENT_SCOPES } from "../services/agentCredential.js";
import { isValidTimezone } from "../services/weekPlan.js";

export const familyRouter = Router();

interface AuthUser {
  id: string;
  memberships?: { familyId: string; role: string }[];
}

const createFamilySchema = z.object({
  name: z.string().min(1).max(100),
});

const inviteSchema = z.object({
  role: z.enum(["PARENT", "CHILD"]),
});

const joinSchema = z.object({
  token: z.string().min(1),
});

const updateRoleSchema = z.object({
  role: z.enum(["PARENT", "CHILD"]),
});

const updateFamilySchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    timezone: z
      .string()
      .min(1)
      .max(64)
      .refine((v) => isValidTimezone(v), {
        message: "Unknown IANA timezone",
      })
      .optional(),
  })
  .refine((v) => v.name !== undefined || v.timezone !== undefined, {
    message: "At least one field is required",
  });

const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
});

// Agent-credential management (parent-facing). Scopes are validated against the
// three known agent scopes; an unknown scope is a 400, never silently dropped.
// `expiresAt` is optional and, when present, must be in the future.
const agentScopeSchema = z.nativeEnum(AGENT_SCOPES);

const createAgentCredentialSchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(agentScopeSchema).min(1),
  expiresAt: z.coerce
    .date()
    .refine((d) => d.getTime() > Date.now(), {
      message: "expiresAt must be in the future",
    })
    .nullish(),
});

function paramStr(val: string | string[] | undefined): string {
  return Array.isArray(val) ? val[0] : val || "";
}

// Create family
familyRouter.post("/", authenticateJWT, async (req: Request, res: Response) => {
  try {
    const { name } = createFamilySchema.parse(req.body);
    const user = req.user as unknown as AuthUser;
    const family = await familyService.createFamily(user.id, name);
    res.status(201).json(family);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res
        .status(400)
        .json({ error: "Validation failed", details: error.errors });
      return;
    }
    res.status(500).json({ error: "Failed to create family" });
  }
});

// List user's families
familyRouter.get("/", authenticateJWT, async (req: Request, res: Response) => {
  try {
    const user = req.user as unknown as AuthUser;
    const families = await familyService.getUserFamilies(user.id);
    res.json(families);
  } catch {
    res.status(500).json({ error: "Failed to fetch families" });
  }
});

// Get family details
familyRouter.get(
  "/:familyId",
  authenticateJWT,
  requireMembership,
  async (req: Request, res: Response) => {
    try {
      const family = await familyService.getFamilyById(
        paramStr(req.params.familyId),
      );
      if (!family) {
        res.status(404).json({ error: "Family not found" });
        return;
      }
      res.json(family);
    } catch {
      res.status(500).json({ error: "Failed to fetch family" });
    }
  },
);

// List members
familyRouter.get(
  "/:familyId/members",
  authenticateJWT,
  requireMembership,
  async (req: Request, res: Response) => {
    try {
      const members = await familyService.getMembers(
        paramStr(req.params.familyId),
      );
      res.json(members);
    } catch {
      res.status(500).json({ error: "Failed to fetch members" });
    }
  },
);

// Generate invite
familyRouter.post(
  "/:familyId/invite",
  inviteJoinLimiter,
  authenticateJWT,
  requireMembership,
  requireRole("PARENT"),
  async (req: Request, res: Response) => {
    try {
      const { role } = inviteSchema.parse(req.body);
      const token = familyService.generateInviteToken(
        paramStr(req.params.familyId),
        role,
      );
      res.json({ token });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res
          .status(400)
          .json({ error: "Validation failed", details: error.errors });
        return;
      }
      res.status(500).json({ error: "Failed to generate invite" });
    }
  },
);

// Join family via invite token
familyRouter.post(
  "/:familyId/join",
  inviteJoinLimiter,
  authenticateJWT,
  async (req: Request, res: Response) => {
    try {
      const { token } = joinSchema.parse(req.body);
      const user = req.user as unknown as AuthUser;
      const membership = await familyService.joinFamily(user.id, token);
      res.status(201).json(membership);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res
          .status(400)
          .json({ error: "Validation failed", details: error.errors });
        return;
      }
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: "Failed to join family" });
    }
  },
);

// Update family (name, timezone) — PARENT only
familyRouter.patch(
  "/:familyId",
  authenticateJWT,
  requireMembership,
  requireRole("PARENT"),
  async (req: Request, res: Response) => {
    try {
      const data = updateFamilySchema.parse(req.body);
      const family = await familyService.updateFamily(
        paramStr(req.params.familyId),
        data,
      );
      res.json(family);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res
          .status(400)
          .json({ error: "Validation failed", details: error.errors });
        return;
      }
      res.status(500).json({ error: "Failed to update family" });
    }
  },
);

// Update member role
familyRouter.patch(
  "/:familyId/members/:memberId",
  authenticateJWT,
  requireMembership,
  requireRole("PARENT"),
  async (req: Request, res: Response) => {
    try {
      const { role } = updateRoleSchema.parse(req.body);
      const member = await familyService.updateMemberRole(
        paramStr(req.params.familyId),
        paramStr(req.params.memberId),
        role,
      );
      res.json(member);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res
          .status(400)
          .json({ error: "Validation failed", details: error.errors });
        return;
      }
      res.status(500).json({ error: "Failed to update member role" });
    }
  },
);

// Remove member
familyRouter.delete(
  "/:familyId/members/:memberId",
  authenticateJWT,
  requireMembership,
  requireRole("PARENT"),
  async (req: Request, res: Response) => {
    try {
      await familyService.removeMember(
        paramStr(req.params.familyId),
        paramStr(req.params.memberId),
      );
      res.status(204).send();
    } catch {
      res.status(500).json({ error: "Failed to remove member" });
    }
  },
);

// Create API key
familyRouter.post(
  "/:familyId/api-keys",
  authenticateJWT,
  requireMembership,
  requireRole("PARENT"),
  async (req: Request, res: Response) => {
    try {
      const { name } = createApiKeySchema.parse(req.body);
      const user = req.user as unknown as AuthUser;
      const key = await apiKeyService.createApiKey(
        paramStr(req.params.familyId),
        user.id,
        name,
      );
      res.status(201).json(key);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res
          .status(400)
          .json({ error: "Validation failed", details: error.errors });
        return;
      }
      res.status(500).json({ error: "Failed to create API key" });
    }
  },
);

// List API keys
familyRouter.get(
  "/:familyId/api-keys",
  authenticateJWT,
  requireMembership,
  requireRole("PARENT"),
  async (req: Request, res: Response) => {
    try {
      const keys = await apiKeyService.listApiKeys(
        paramStr(req.params.familyId),
      );
      res.json(keys);
    } catch {
      res.status(500).json({ error: "Failed to fetch API keys" });
    }
  },
);

// Revoke API key
familyRouter.delete(
  "/:familyId/api-keys/:keyId",
  authenticateJWT,
  requireMembership,
  requireRole("PARENT"),
  async (req: Request, res: Response) => {
    try {
      await apiKeyService.revokeApiKey(
        paramStr(req.params.keyId),
        paramStr(req.params.familyId),
      );
      res.status(204).send();
    } catch {
      res.status(500).json({ error: "Failed to revoke API key" });
    }
  },
);

// ── Agent-credential management (scoped MCP credentials) ────────────────────
// Parent-facing surface for provisioning the scoped agent credentials consumed
// by `/api/agent`. Same auth chain as every other family sub-resource:
// authenticateJWT → requireMembership → requireRole(PARENT). Non-parents and
// cross-family callers are rejected by that chain before a handler runs.
//
// Secret handling: the raw key is returned exactly once (create + rotate) and
// is NEVER logged or echoed on reads. List returns metadata only — the service
// `select` omits the stored hash. Every mutation (create/rotate/revoke) is
// written to the agent audit trail with actorType "parent".

// Create agent credential — returns the raw key ONCE.
familyRouter.post(
  "/:familyId/agent-credentials",
  authenticateJWT,
  requireMembership,
  requireRole("PARENT"),
  async (req: Request, res: Response) => {
    const familyId = paramStr(req.params.familyId);
    try {
      const { name, scopes, expiresAt } = createAgentCredentialSchema.parse(
        req.body,
      );
      const user = req.user as unknown as AuthUser;
      const credential = await agentCredentialService.createAgentCredential(
        familyId,
        user.id,
        name,
        scopes,
        expiresAt ?? null,
      );
      await agentCredentialService.recordAgentAudit({
        actorType: "parent",
        credentialId: credential.id,
        familyId,
        action: "credential:create",
        outcome: "allowed",
        targetType: "agentCredential",
        targetIds: [credential.id],
      });
      // `credential.key` is the one-time raw key. This is the only response that
      // ever carries it.
      res.status(201).json(credential);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res
          .status(400)
          .json({ error: "Validation failed", details: error.errors });
        return;
      }
      res.status(500).json({ error: "Failed to create agent credential" });
    }
  },
);

// List agent credentials — metadata only, never hashes or raw keys.
familyRouter.get(
  "/:familyId/agent-credentials",
  authenticateJWT,
  requireMembership,
  requireRole("PARENT"),
  async (req: Request, res: Response) => {
    try {
      const credentials = await agentCredentialService.listAgentCredentials(
        paramStr(req.params.familyId),
      );
      res.json(credentials);
    } catch {
      res.status(500).json({ error: "Failed to fetch agent credentials" });
    }
  },
);

// Rotate agent credential — issues a new raw key ONCE, invalidates the old one.
familyRouter.post(
  "/:familyId/agent-credentials/:credentialId/rotate",
  authenticateJWT,
  requireMembership,
  requireRole("PARENT"),
  async (req: Request, res: Response) => {
    const familyId = paramStr(req.params.familyId);
    const credentialId = paramStr(req.params.credentialId);
    try {
      const rotated = await agentCredentialService.rotateAgentCredential(
        credentialId,
        familyId,
      );
      if (!rotated) {
        // Not found, revoked, or belongs to another family — uniform 404, no
        // existence/ownership leak.
        res.status(404).json({ error: "Agent credential not found" });
        return;
      }
      await agentCredentialService.recordAgentAudit({
        actorType: "parent",
        credentialId: rotated.id,
        familyId,
        action: "credential:rotate",
        outcome: "allowed",
        targetType: "agentCredential",
        targetIds: [rotated.id],
      });
      res.json(rotated);
    } catch {
      res.status(500).json({ error: "Failed to rotate agent credential" });
    }
  },
);

// Revoke agent credential — soft-revoke (stamps revokedAt). Idempotent.
familyRouter.delete(
  "/:familyId/agent-credentials/:credentialId",
  authenticateJWT,
  requireMembership,
  requireRole("PARENT"),
  async (req: Request, res: Response) => {
    const familyId = paramStr(req.params.familyId);
    const credentialId = paramStr(req.params.credentialId);
    try {
      const revoked = await agentCredentialService.revokeAgentCredential(
        credentialId,
        familyId,
      );
      if (!revoked) {
        res.status(404).json({ error: "Agent credential not found" });
        return;
      }
      await agentCredentialService.recordAgentAudit({
        actorType: "parent",
        credentialId: revoked.id,
        familyId,
        action: "credential:revoke",
        outcome: "allowed",
        targetType: "agentCredential",
        targetIds: [revoked.id],
      });
      res.json(revoked);
    } catch {
      res.status(500).json({ error: "Failed to revoke agent credential" });
    }
  },
);
