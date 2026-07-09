// WebSocket handshake hardening primitives (issue #213).
//
// These are the defense-in-depth guards layered in FRONT of the socket auth
// boundary (auth.ts). Each is a small, pure, unit-testable unit so the guard
// logic can be verified without standing up a real socket.io server:
//
//   - isOriginAllowed / parseAllowedOrigins — an explicit WS Origin allowlist.
//     Socket.IO's `cors` option governs the polling transport's CORS response
//     headers but is NOT a hard Origin gate on the WebSocket upgrade, so we
//     re-check the browser-supplied Origin against the SAME source the HTTP CORS
//     layer uses (config.clientUrl) and reject cross-origin handshakes.
//   - resolveClientIp — derive the real client IP from `X-Forwarded-For`,
//     honouring the app's `trust proxy` hop count, exactly like the HTTP
//     rate-limiters (middleware/rateLimit.ts) do — never the proxy address.
//   - createHandshakeThrottle — an IP-keyed fixed-window connection throttle to
//     blunt handshake floods, mirroring the HTTP rate-limit posture.

/** Minimal shape of a socket.io handshake the guards depend on. */
export interface HandshakeLike {
  address?: string;
  headers: Record<string, string | string[] | undefined>;
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Strip a single trailing slash so origins compare regardless of it. */
function normalizeOrigin(origin: string): string {
  return origin.endsWith("/") ? origin.slice(0, -1) : origin;
}

/**
 * Parse the configured allowed origins from the same value that feeds the HTTP
 * CORS layer (`config.clientUrl`). Supports a comma-separated list so a single
 * config value can name more than one browser origin; each entry is trimmed and
 * has any trailing slash removed. Empty entries are dropped.
 */
export function parseAllowedOrigins(clientUrl: string): string[] {
  return clientUrl
    .split(",")
    .map((o) => normalizeOrigin(o.trim()))
    .filter((o) => o.length > 0);
}

/**
 * Whether a handshake's `Origin` is permitted.
 *
 * Null-Origin policy (documented, deliberate): a MISSING/empty Origin header is
 * ALLOWED. Browsers ALWAYS send an Origin on cross-origin WebSocket upgrades, so
 * a browser-based attacker cannot suppress it — the attack surface is a present
 * Origin that does not match. Non-browser / server-to-server clients (health
 * probes, the Magic Mirror device, tests) legitimately send no Origin, so
 * blocking null-Origin would break them without adding security. A present
 * Origin must match the allowlist exactly (after trailing-slash normalisation).
 */
export function isOriginAllowed(
  origin: string | undefined,
  allowed: readonly string[],
): boolean {
  if (origin === undefined || origin === "") return true;
  const candidate = normalizeOrigin(origin);
  return allowed.some((a) => a === candidate);
}

/**
 * Resolve the real client IP for a handshake, honouring the Express-style
 * `trust proxy` hop count so the throttle keys off the client — not the proxy.
 *
 * Mirrors how `req.ip` is derived for the HTTP rate-limiters: with a numeric
 * hop count `n`, the client is `n` entries from the right of
 * `[...X-Forwarded-For, socketAddress]`. With `false`, the socket peer address
 * is used verbatim. With `true` or a preset/subnet string we cannot safely
 * count hops here, so we fall back to the left-most XFF entry (best effort),
 * matching the intent of a permissive trust setting.
 */
export function resolveClientIp(
  handshake: HandshakeLike,
  trustProxy: boolean | number | string,
): string {
  const socketAddr = handshake.address || "ip-unknown";
  const xff = firstHeader(handshake.headers["x-forwarded-for"]);
  const chain = xff
    ? xff
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    : [];

  if (typeof trustProxy === "number" && trustProxy > 0) {
    if (chain.length === 0) return socketAddr;
    const full = [...chain, socketAddr];
    const idx = full.length - 1 - trustProxy;
    return full[idx] ?? full[0];
  }

  if (trustProxy === false) return socketAddr;

  // `true` or a subnet/preset string — permissive trust, best-effort leftmost.
  return chain[0] ?? socketAddr;
}

/** An IP-keyed connection throttle for socket handshakes. */
export interface HandshakeThrottle {
  /** Record an attempt from `ip`; returns true if it is within budget. */
  check(ip: string): boolean;
  /** Stop the internal sweep timer (tests / graceful shutdown). */
  dispose(): void;
}

interface ThrottleBucket {
  count: number;
  resetAt: number;
}

/**
 * Build a fixed-window, per-IP handshake throttle.
 *
 * At most `limit` handshakes per `windowMs` from a single client IP; further
 * attempts within the window are rejected (return false). A `limit` of `0` (or
 * negative) disables throttling entirely — every attempt is allowed — which is
 * useful for a test harness or an operator that wants the guard off.
 *
 * State is in-process only (like express-rate-limit's default MemoryStore): the
 * app runs as a single node behind the ingress, so this is sufficient and adds
 * no dependency. A periodic sweep evicts expired buckets so memory does not grow
 * unbounded under churn; the timer is `unref`'d so it never keeps the process
 * alive.
 */
export function createHandshakeThrottle(opts: {
  windowMs: number;
  limit: number;
  /** Injectable clock for deterministic tests. Defaults to `Date.now`. */
  now?: () => number;
}): HandshakeThrottle {
  const { windowMs, limit } = opts;
  const now = opts.now ?? Date.now;
  const buckets = new Map<string, ThrottleBucket>();

  const enabled = limit > 0 && windowMs > 0;

  // Sweep expired buckets roughly once per window so idle IPs are forgotten.
  let sweepTimer: ReturnType<typeof setInterval> | undefined;
  if (enabled) {
    sweepTimer = setInterval(() => {
      const t = now();
      for (const [ip, bucket] of buckets) {
        if (bucket.resetAt <= t) buckets.delete(ip);
      }
    }, windowMs);
    if (typeof sweepTimer.unref === "function") sweepTimer.unref();
  }

  return {
    check(ip: string): boolean {
      if (!enabled) return true;
      const t = now();
      const bucket = buckets.get(ip);
      if (!bucket || bucket.resetAt <= t) {
        buckets.set(ip, { count: 1, resetAt: t + windowMs });
        return true;
      }
      if (bucket.count >= limit) return false;
      bucket.count += 1;
      return true;
    },
    dispose(): void {
      if (sweepTimer) clearInterval(sweepTimer);
      buckets.clear();
    },
  };
}
