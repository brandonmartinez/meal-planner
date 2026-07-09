// Isolated, testable socket handshake authentication for the real-time server
// (issue #207). This deliberately mirrors the HTTP auth chain so a WebSocket
// connection is trusted by exactly the same rules as a REST request:
//   - JWT (httpOnly `token` cookie or `Authorization: Bearer`) for app users
//   - `x-api-key` for the public Magic Mirror display device
// It reuses the existing primitives (`verifyToken`, `findApiKeyByRawKey`) rather
// than duplicating crypto so there is a single source of truth. An
// unauthenticated handshake resolves to `null` and MUST be rejected by the
// caller — never trust a socket that fails this check.
//
// SECURITY REVIEW (Frank): this function is the single trust boundary for the
// socket layer. It returns the exact set of familyIds a connection may join and
// nothing else; the connection handler joins only those rooms server-side, so a
// client can never request another family's room.

import jwt from "jsonwebtoken";
import { verifyToken } from "../utils/jwt.js";
import prisma from "../config/database.js";
import { findApiKeyByRawKey } from "../services/apiKey.js";

/**
 * Minimal shape of a socket.io handshake we depend on. Kept structural so the
 * function is trivially unit-testable without constructing a real socket.
 */
export interface SocketHandshakeLike {
  headers: Record<string, string | string[] | undefined>;
  auth?: Record<string, unknown>;
}

export interface SocketAuthResult {
  /** Which mechanism authenticated the connection. */
  kind: "user" | "apiKey";
  /** Family rooms this connection is allowed to join. Never empty on success. */
  familyIds: string[];
  /** Present only for JWT (app user) connections. */
  userId?: string;
  /**
   * JWT expiry as epoch milliseconds — present ONLY for JWT (app user)
   * connections that carry an `exp` claim. The connection handler uses this to
   * schedule an expiry-driven disconnect (#213) so a long-lived socket cannot
   * outlive its token. API-key connections are not JWTs and have no expiry, so
   * this is undefined for them and no disconnect is scheduled.
   */
  tokenExp?: number;
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Read the `exp` claim (epoch ms) from an already-VERIFIED JWT. We decode
 * (not re-verify) here because `verifyToken` has already validated the
 * signature and expiry a line above; decode only extracts the claim. Returns
 * undefined for a token with no numeric `exp`.
 */
function readTokenExpiryMs(token: string): number | undefined {
  const decoded = jwt.decode(token);
  if (decoded && typeof decoded === "object" && typeof decoded.exp === "number") {
    return decoded.exp * 1000;
  }
  return undefined;
}

/** Tiny cookie-header parser — we only need `token`, so avoid a dependency. */
function parseCookieHeader(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (!key) continue;
    const rawVal = part.slice(idx + 1).trim();
    try {
      out[key] = decodeURIComponent(rawVal);
    } catch {
      out[key] = rawVal;
    }
  }
  return out;
}

/** JWT from socket.io `auth.token`, `Authorization: Bearer`, or `token` cookie. */
function extractToken(handshake: SocketHandshakeLike): string | undefined {
  const authToken = handshake.auth?.token;
  if (typeof authToken === "string" && authToken) return authToken;

  const authHeader = firstHeader(handshake.headers.authorization);
  if (authHeader?.startsWith("Bearer ")) return authHeader.slice(7);

  const cookies = parseCookieHeader(firstHeader(handshake.headers.cookie));
  return cookies.token || undefined;
}

/** API key from socket.io `auth.apiKey` or the `x-api-key` header. */
function extractApiKey(handshake: SocketHandshakeLike): string | undefined {
  const authKey = handshake.auth?.apiKey;
  if (typeof authKey === "string" && authKey) return authKey;
  return firstHeader(handshake.headers["x-api-key"]) || undefined;
}

/**
 * Authenticate a socket handshake using the same mechanisms as HTTP. Tries JWT
 * first (app users), then API key (Magic Mirror). Returns the allowed family
 * rooms, or `null` if neither mechanism authenticates — callers MUST reject on
 * `null`.
 */
export async function authenticateSocket(
  handshake: SocketHandshakeLike,
): Promise<SocketAuthResult | null> {
  // 1. JWT — app users. Mirrors authenticateJWT (cookie or Bearer).
  const token = extractToken(handshake);
  if (token) {
    try {
      const payload = verifyToken(token);
      const user = await prisma.user.findUnique({
        where: { id: payload.id },
        include: {
          memberships: {
            include: { family: { select: { id: true, name: true } } },
          },
        },
      });
      if (user) {
        return {
          kind: "user",
          userId: user.id,
          familyIds: user.memberships.map((m) => m.familyId),
          tokenExp: readTokenExpiryMs(token),
        };
      }
    } catch {
      // Invalid/expired token — fall through to API-key auth.
    }
  }

  // 2. API key — public Magic Mirror display. Mirrors authenticateApiKey,
  // including the expiry check and lastUsed bump.
  const apiKey = extractApiKey(handshake);
  if (apiKey) {
    try {
      const keyRecord = await findApiKeyByRawKey(apiKey);
      const expired =
        keyRecord?.expiresAt != null && keyRecord.expiresAt < new Date();
      if (keyRecord && !expired) {
        await prisma.apiKey.update({
          where: { id: keyRecord.id },
          data: { lastUsed: new Date() },
        });
        return { kind: "apiKey", familyIds: [keyRecord.familyId] };
      }
    } catch {
      // Verification error — reject below.
    }
  }

  return null;
}
