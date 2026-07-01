import crypto from "crypto";
import prisma from "../config/database.js";
import { hashCredential, legacyHashCredential } from "../utils/credentialHash.js";

/**
 * Per-operation scopes an MCP agent credential may be granted. Deliberately
 * narrow: an agent only ever gets the grants a parent explicitly hands it.
 *  - `meal_plan:read`     — read week plans / suggestions for the family.
 *  - `meal_plan:schedule` — add (schedule) meal suggestions onto day plans.
 *  - `meal_plan:approve`  — approve a suggestion (PARENT-equivalent action).
 */
export const AGENT_SCOPES = {
  READ: "meal_plan:read",
  SCHEDULE: "meal_plan:schedule",
  APPROVE: "meal_plan:approve",
} as const;

export type AgentScope = (typeof AGENT_SCOPES)[keyof typeof AGENT_SCOPES];

export const ALL_AGENT_SCOPES: readonly AgentScope[] = Object.values(AGENT_SCOPES);

export function isAgentScope(value: string): value is AgentScope {
  return (ALL_AGENT_SCOPES as readonly string[]).includes(value);
}

/** True iff the credential's granted scopes include `scope`. */
export function hasScope(scopes: readonly string[], scope: AgentScope): boolean {
  return scopes.includes(scope);
}

/**
 * Peppered keyed hash of the raw key. The credential is stored hashed-only —
 * mirrors `services/apiKey.ts`. The raw key is returned exactly once (on
 * creation or rotation) and is never logged or persisted in raw form. See
 * `utils/credentialHash.ts` for why we use a keyed HMAC over a bare SHA-256.
 */
function hashKey(raw: string): string {
  return hashCredential(raw);
}

function generateRawKey(): string {
  return crypto.randomBytes(32).toString("hex");
}

export interface CreatedAgentCredential {
  id: string;
  name: string;
  scopes: string[];
  /** Raw key — returned ONCE. Never retrievable again. */
  key: string;
  expiresAt: Date | null;
  createdAt: Date;
}

/**
 * Creates a scoped agent credential and returns the raw key exactly once.
 * Only the hash is stored.
 */
export async function createAgentCredential(
  familyId: string,
  createdBy: string,
  name: string,
  scopes: AgentScope[],
  expiresAt?: Date | null,
): Promise<CreatedAgentCredential> {
  const rawKey = generateRawKey();
  const hashedKey = hashKey(rawKey);

  const record = await prisma.agentCredential.create({
    data: {
      name,
      hashedKey,
      familyId,
      scopes,
      createdBy,
      expiresAt: expiresAt ?? null,
    },
  });

  return {
    id: record.id,
    name: record.name,
    scopes: record.scopes,
    key: rawKey,
    expiresAt: record.expiresAt,
    createdAt: record.createdAt,
  };
}

/**
 * Lists a family's agent credentials. Never returns the hashed key — only
 * non-sensitive metadata, scoped strictly to `familyId`.
 */
export async function listAgentCredentials(familyId: string) {
  return prisma.agentCredential.findMany({
    where: { familyId },
    select: {
      id: true,
      name: true,
      scopes: true,
      createdBy: true,
      expiresAt: true,
      lastUsed: true,
      revokedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Rotates a credential: issues a brand-new raw key (returned once) and
 * replaces the stored hash. Scoped by `familyId` so one family can never
 * rotate another's credential. A revoked credential cannot be rotated back to
 * life.
 */
export async function rotateAgentCredential(
  credentialId: string,
  familyId: string,
): Promise<CreatedAgentCredential | null> {
  const existing = await prisma.agentCredential.findFirst({
    where: { id: credentialId, familyId },
    select: { id: true, revokedAt: true },
  });
  if (!existing || existing.revokedAt) {
    return null;
  }

  const rawKey = generateRawKey();
  const hashedKey = hashKey(rawKey);

  const record = await prisma.agentCredential.update({
    where: { id: credentialId },
    data: { hashedKey, lastUsed: null },
  });

  return {
    id: record.id,
    name: record.name,
    scopes: record.scopes,
    key: rawKey,
    expiresAt: record.expiresAt,
    createdAt: record.createdAt,
  };
}

/**
 * Revokes a credential by stamping `revokedAt`. Idempotent and scoped by
 * `familyId`. Returns null when the credential does not belong to the family
 * (no cross-family revocation, no existence leak via a thrown error).
 */
export async function revokeAgentCredential(
  credentialId: string,
  familyId: string,
): Promise<{ id: string; revokedAt: Date | null } | null> {
  const existing = await prisma.agentCredential.findFirst({
    where: { id: credentialId, familyId },
    select: { id: true, revokedAt: true },
  });
  if (!existing) {
    return null;
  }
  if (existing.revokedAt) {
    return { id: existing.id, revokedAt: existing.revokedAt };
  }

  const updated = await prisma.agentCredential.update({
    where: { id: credentialId },
    data: { revokedAt: new Date() },
    select: { id: true, revokedAt: true },
  });
  return updated;
}

export interface AuthenticatedAgent {
  id: string;
  familyId: string;
  scopes: string[];
  /** The parent (User.id) who provisioned this credential. Agent-scheduled
   * suggestions are attributed to this user as `suggestedBy`, while the audit
   * trail records the agent credential as the true actor. */
  createdBy: string;
}

export type AgentAuthResult =
  | { ok: true; credential: AuthenticatedAgent }
  | { ok: false; reason: "unknown" | "revoked" | "expired" };

/**
 * Authenticates a raw agent key. Hashes the presented key, looks it up, and
 * rejects unknown / revoked / expired credentials. On success it bumps
 * `lastUsed` and returns the credential's family scope + granted scopes.
 *
 * Backward compatibility (lazy migration): rows created before the pepper hold
 * a legacy unpeppered SHA-256 hash that the HMAC lookup will not match. When
 * the primary (HMAC) lookup misses, we fall back to the legacy SHA-256 hash;
 * on a legacy hit we transparently re-hash to the peppered HMAC and persist it
 * in the SAME write that bumps `lastUsed`, so credentials migrate on next use
 * without ever invalidating a live key. The raw key is never stored.
 *
 * Returns a discriminated result rather than throwing so the middleware can
 * map each failure mode to an audit entry + 401/403 without re-querying.
 */
export async function authenticateAgentCredential(
  rawKey: string,
): Promise<AgentAuthResult> {
  const hashedKey = hashKey(rawKey);
  let record = await prisma.agentCredential.findUnique({
    where: { hashedKey },
  });

  // Legacy fallback: a pre-pepper row is keyed by unpeppered SHA-256.
  let needsRehash = false;
  if (!record) {
    const legacyKey = legacyHashCredential(rawKey);
    record = await prisma.agentCredential.findUnique({
      where: { hashedKey: legacyKey },
    });
    if (record) {
      needsRehash = true;
    }
  }

  if (!record) {
    return { ok: false, reason: "unknown" };
  }
  if (record.revokedAt) {
    return { ok: false, reason: "revoked" };
  }
  if (record.expiresAt && record.expiresAt < new Date()) {
    return { ok: false, reason: "expired" };
  }

  await prisma.agentCredential.update({
    where: { id: record.id },
    // Lazy upgrade the legacy hash alongside the lastUsed bump (single write).
    data: needsRehash
      ? { lastUsed: new Date(), hashedKey }
      : { lastUsed: new Date() },
  });

  return {
    ok: true,
    credential: {
      id: record.id,
      familyId: record.familyId,
      scopes: record.scopes,
      createdBy: record.createdBy,
    },
  };
}

export interface AgentAuditEntry {
  credentialId: string | null;
  familyId: string;
  action: string;
  outcome: "allowed" | "denied";
  targetType?: string | null;
  targetIds?: string[];
  reason?: string | null;
  actorType?: string;
}

/**
 * Appends an entry to the agent audit trail. Every agent authorization
 * decision (allowed or denied) flows through here so there is a who/what/when/
 * outcome/target record for each read and write. Never receives or stores a
 * raw key — only the credential id.
 */
export async function recordAgentAudit(entry: AgentAuditEntry) {
  return prisma.agentAuditLog.create({
    data: {
      actorType: entry.actorType ?? "agent",
      credentialId: entry.credentialId,
      familyId: entry.familyId,
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetIds: entry.targetIds ?? [],
      outcome: entry.outcome,
      reason: entry.reason ?? null,
    },
  });
}

/**
 * Records an audit entry without ever throwing. An audit-write failure must
 * never change an already-decided auth/authz outcome, nor turn an otherwise
 * successful operation into an error — but a dropped write MUST be observable,
 * otherwise audit-trail gaps are silent and invisible to monitoring.
 *
 * On failure we emit a single structured `[audit]` error log carrying enough
 * context to investigate (action, outcome, familyId, credentialId, reason, and
 * the error message). The audit entry only ever carries the credential id —
 * never a raw agent key or secret — so nothing sensitive is logged here.
 *
 * This is the drop-safe wrapper every call site should use. Call
 * `recordAgentAudit` directly only where an audit-write failure genuinely must
 * propagate (there are currently no such sites).
 */
export async function safeRecordAgentAudit(entry: AgentAuditEntry): Promise<void> {
  try {
    await recordAgentAudit(entry);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Structured, single-line context so the drop is greppable in logs and
    // surfaces in monitoring. Never include the raw agent key (it is not part
    // of the audit entry) or any other secret.
    console.error("[audit] dropped agent audit write — audit-trail gap", {
      action: entry.action,
      outcome: entry.outcome,
      familyId: entry.familyId,
      credentialId: entry.credentialId,
      reason: entry.reason ?? null,
      error: message,
    });
  }
}
