import { Request, Response, NextFunction } from "express";
import {
  authenticateAgentCredential,
  recordAgentAudit,
  hasScope,
  type AgentScope,
} from "../services/agentCredential.js";

/** Header carrying the raw agent key. Distinct from the display `x-api-key`. */
const AGENT_KEY_HEADER = "x-agent-key";

function paramFamilyId(req: Request): string {
  const raw = req.params.familyId;
  return Array.isArray(raw) ? raw[0] : raw || "";
}

/**
 * Authenticates an MCP agent credential and enforces FAMILY scope.
 *
 * Flow:
 *  1. Require an `x-agent-key` header (never the display `x-api-key`).
 *  2. Hash + look up the credential; reject unknown / revoked / expired.
 *  3. Enforce that the credential's family matches the route's `:familyId` —
 *     a valid credential for family A can never act on family B.
 *
 * Every denial is written to the audit trail. On success it attaches
 * `req.agent = { id, familyId, scopes }`; the route handler records the
 * allowed audit entry with the concrete target resource ids.
 */
export async function authenticateAgent(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const headerVal = req.headers[AGENT_KEY_HEADER];
  const rawKey = Array.isArray(headerVal) ? headerVal[0] : headerVal;
  const routeFamilyId = paramFamilyId(req);

  if (!rawKey || typeof rawKey !== "string") {
    await safeAudit({
      credentialId: null,
      familyId: routeFamilyId || "unknown",
      action: "authenticate",
      outcome: "denied",
      reason: "missing_credential",
    });
    res.status(401).json({ error: "Agent credential required" });
    return;
  }

  let result;
  try {
    result = await authenticateAgentCredential(rawKey);
  } catch {
    res.status(500).json({ error: "Agent authentication failed" });
    return;
  }

  if (!result.ok) {
    await safeAudit({
      credentialId: null,
      familyId: routeFamilyId || "unknown",
      action: "authenticate",
      outcome: "denied",
      reason: `${result.reason}_credential`,
    });
    // Uniform 401 for unknown/revoked/expired — do not reveal which.
    res.status(401).json({ error: "Invalid agent credential" });
    return;
  }

  const agent = result.credential;

  // Cross-family denial: a valid credential is still rejected if the route
  // targets a different family than the one it is scoped to.
  if (routeFamilyId && routeFamilyId !== agent.familyId) {
    await safeAudit({
      credentialId: agent.id,
      familyId: agent.familyId,
      action: "authenticate",
      outcome: "denied",
      reason: "cross_family",
      targetType: "family",
      targetIds: [routeFamilyId],
    });
    res.status(403).json({ error: "Credential not valid for this family" });
    return;
  }

  req.agent = agent;
  next();
}

/**
 * Gate a route on a specific agent scope. Must run AFTER `authenticateAgent`.
 * Denials (no agent on request, or missing scope) are audited and answered
 * with 403.
 */
export function requireScope(scope: AgentScope) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const agent = req.agent;
    if (!agent) {
      res.status(401).json({ error: "Agent credential required" });
      return;
    }

    if (!hasScope(agent.scopes, scope)) {
      await safeAudit({
        credentialId: agent.id,
        familyId: agent.familyId,
        action: scope,
        outcome: "denied",
        reason: "missing_scope",
      });
      res.status(403).json({ error: "Insufficient scope" });
      return;
    }

    next();
  };
}

/** Record an audit entry, swallowing storage errors so audit never 500s a
 * request path that has already been decided. */
async function safeAudit(
  entry: Parameters<typeof recordAgentAudit>[0],
): Promise<void> {
  try {
    await recordAgentAudit(entry);
  } catch {
    // Intentionally ignored: an audit-write failure must not change the
    // already-decided auth outcome.
  }
}
