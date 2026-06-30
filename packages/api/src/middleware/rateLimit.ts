import rateLimit, { type Options } from "express-rate-limit";
import type { Request } from "express";
import crypto from "crypto";

/**
 * Scoped rate limiting for the API.
 *
 * These limiters add narrowly-scoped throttling on the surfaces an attacker
 * would target — the public Magic Mirror display endpoint, the auth/OAuth
 * routes, and invite/join-token submission — without weakening normal app
 * usage. They are mounted at the route-prefix level in `index.ts` (and inline
 * on the invite/join routes) so the global middleware order — Helmet, CORS,
 * Morgan, JSON/cookie parsing, Passport — is preserved.
 *
 * Security invariants:
 *  - Raw API keys are NEVER used as (or embedded in) a rate-limit key, and are
 *    never logged or persisted. The display limiter buckets by client IP plus a
 *    *hash* of the presented key (see {@link displayKeyGenerator}).
 *  - 429 response bodies are a generic message that reveals nothing about
 *    whether a key, account, or invite token exists — they do not widen the
 *    information already exposed by the existing 401 behavior.
 */

const MINUTE = 60 * 1000;

/** Strict per-key budget for the public display surface. */
export const DISPLAY_LIMIT = 30;
export const DISPLAY_WINDOW_MS = MINUTE;

/** Stricter budget for the unauthenticated/auth surface (OAuth start + callback, logout, session check). */
export const AUTH_LIMIT = 30;
export const AUTH_WINDOW_MS = 15 * MINUTE;

/** Tight budget for invite/join-token submission to blunt token enumeration. */
export const INVITE_JOIN_LIMIT = 15;
export const INVITE_JOIN_WINDOW_MS = 15 * MINUTE;

/** Reasonable budget for general authenticated app routes. */
export const GENERAL_LIMIT = 300;
export const GENERAL_WINDOW_MS = 15 * MINUTE;

/**
 * Budget for authenticated MCP agent routes. Deliberately DISTINCT from the
 * display limiter and the browser/JWT `generalLimiter` so an agent's traffic
 * is throttled in its own bucket and can never borrow from (or starve) the
 * human surfaces. Keyed by IP + a hash of the agent key.
 */
export const AGENT_LIMIT = 120;
export const AGENT_WINDOW_MS = 15 * MINUTE;

/**
 * Shared defaults: standardized `RateLimit-*` headers (draft-7), no legacy
 * `X-RateLimit-*` headers, and a generic JSON 429 body. The message is
 * deliberately uninformative so a throttled response cannot be used to probe
 * for the existence of a key, account, or invite token.
 */
const baseOptions: Partial<Options> = {
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
};

/** Build a limiter that inherits the shared, security-conscious defaults. */
export function createRateLimiter(options: Partial<Options>) {
  return rateLimit({ ...baseOptions, ...options });
}

/**
 * Hash an API key for use inside a rate-limit bucket key.
 *
 * Uses the same SHA-256 approach the codebase uses to store keys at rest
 * (`services/apiKey.ts`), then keeps a short prefix so the bucket key stays
 * compact. The raw key never appears in the returned value — so it can never
 * leak into limiter state, store keys, or logs.
 */
function apiKeyFingerprint(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

/**
 * Bucket key for the display limiter: client IP combined with a hash of the
 * presented `x-api-key` (when present). This throttles a single abusive key (or
 * a single device) independently of other clients, and — critically — never
 * uses the raw key itself as the limiter key.
 */
export function displayKeyGenerator(req: Request): string {
  const ip = req.ip ?? "ip-unknown";
  const raw = req.headers["x-api-key"];
  if (typeof raw === "string" && raw.length > 0) {
    return `${ip}:${apiKeyFingerprint(raw)}`;
  }
  return ip;
}

/**
 * Strict limiter for `/api/display/*`. Mounted BEFORE `authenticateApiKey` so
 * floods are rejected before any key lookup / DB fan-out work.
 */
export const displayLimiter = createRateLimiter({
  windowMs: DISPLAY_WINDOW_MS,
  limit: DISPLAY_LIMIT,
  keyGenerator: displayKeyGenerator,
});

/**
 * Stricter limiter for `/api/auth/*` (OAuth start + callback, logout, session
 * check). Keyed by IP via the library default — there is no credential to
 * fingerprint on these routes.
 */
export const authLimiter = createRateLimiter({
  windowMs: AUTH_WINDOW_MS,
  limit: AUTH_LIMIT,
});

/** Limiter for invite generation and join-token submission. Keyed by IP. */
export const inviteJoinLimiter = createRateLimiter({
  windowMs: INVITE_JOIN_WINDOW_MS,
  limit: INVITE_JOIN_LIMIT,
});

/**
 * Bucket key for the agent limiter: client IP combined with a hash of the
 * presented `x-agent-key` (when present). Mirrors {@link displayKeyGenerator}
 * but reads the agent-credential header — the raw key never appears in the
 * returned bucket key.
 *
 * Note: express-rate-limit v7.5.1 does not export `ipKeyGenerator`, so we
 * build the IP portion directly (matching the display limiter's approach).
 */
export function agentKeyGenerator(req: Request): string {
  const ip = req.ip ?? "ip-unknown";
  const raw = req.headers["x-agent-key"];
  if (typeof raw === "string" && raw.length > 0) {
    return `${ip}:${apiKeyFingerprint(raw)}`;
  }
  return ip;
}

/** Reasonable general limiter for authenticated routes. Keyed by IP. */
export const generalLimiter = createRateLimiter({
  windowMs: GENERAL_WINDOW_MS,
  limit: GENERAL_LIMIT,
});

/**
 * Limiter for the MCP agent surface (`/api/agent/*`). Mounted BEFORE
 * `authenticateAgent` so credential floods are rejected before any hash
 * lookup / DB fan-out. Distinct bucket from display and JWT routes.
 */
export const agentLimiter = createRateLimiter({
  windowMs: AGENT_WINDOW_MS,
  limit: AGENT_LIMIT,
  keyGenerator: agentKeyGenerator,
});
