import { describe, it, expect } from "vitest";
import express from "express";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import { config } from "./config/index.js";
import { createRateLimiter, displayKeyGenerator } from "./middleware/rateLimit.js";

/**
 * Boot an ephemeral server wired exactly like the real app's proxy handling:
 * `trust proxy` is taken from the LIVE config value (`config.trustProxy`), then
 * an IP-keyed rate limiter runs, then a handler echoes the resolved `req.ip`.
 *
 * This exercises the same three pieces the production app depends on — the
 * configured trust-proxy setting, express-rate-limit, and `req.ip` resolution
 * from `X-Forwarded-For` — end-to-end over a real socket via global `fetch`.
 * No new test dependencies (mirrors middleware/rateLimit.test.ts).
 */
async function harness(limit = 1) {
  const app = express();
  // Identical to index.ts: trust the configured number of proxy hops so
  // req.ip / rate-limit keys reflect the real client from X-Forwarded-For.
  app.set("trust proxy", config.trustProxy);

  const limiter = createRateLimiter({
    windowMs: 60_000,
    limit,
    keyGenerator: displayKeyGenerator,
  });

  app.get("/t", limiter, (req, res) => {
    res.json({ ip: req.ip });
  });

  const server: Server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/t`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        // undici pools keep-alive sockets; tear them down so close() resolves.
        server.closeAllConnections();
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

describe("trust proxy configuration", () => {
  it("uses a finite hop count, not the insecure blanket `true`", () => {
    // Guards against a regression to `app.set('trust proxy', true)`, which
    // would let any client forge X-Forwarded-For to spoof their IP.
    expect(config.trustProxy).toBe(1);
    expect(config.trustProxy).not.toBe(true);
  });

  it("resolves req.ip from X-Forwarded-For when trust proxy is set", async () => {
    const { url, close } = await harness(100);
    try {
      const res = await fetch(url, {
        headers: { "x-forwarded-for": "203.0.113.5" },
      });
      const body = (await res.json()) as { ip: string };
      // With trust proxy set, the forwarded client address is used instead of
      // the loopback socket address the request actually arrived on.
      expect(body.ip).toBe("203.0.113.5");
    } finally {
      await close();
    }
  });

  it("cannot be spoofed past the trusted hop (uses the proxy-appended IP)", async () => {
    const { url, close } = await harness(100);
    try {
      // Simulate what the single Traefik hop forwards: a client-supplied,
      // potentially forged left entry followed by the address the trusted
      // proxy appended (rightmost). Trusting exactly 1 hop must yield the
      // proxy-appended IP, never the attacker-controlled left value.
      const res = await fetch(url, {
        headers: { "x-forwarded-for": "9.9.9.9, 203.0.113.5" },
      });
      const body = (await res.json()) as { ip: string };
      expect(body.ip).toBe("203.0.113.5");
      expect(body.ip).not.toBe("9.9.9.9");
    } finally {
      await close();
    }
  });

  it("buckets the rate limiter by the real forwarded client IP", async () => {
    // limit = 1 per bucket. If trust proxy were misconfigured, every request
    // would share the proxy's single IP bucket and client B would be throttled
    // by client A's traffic. Correct config gives each XFF client its own
    // bucket.
    const { url, close } = await harness(1);
    try {
      // Client A: first request ok, second over its own budget -> 429.
      expect(
        (await fetch(url, { headers: { "x-forwarded-for": "198.51.100.1" } }))
          .status,
      ).toBe(200);
      expect(
        (await fetch(url, { headers: { "x-forwarded-for": "198.51.100.1" } }))
          .status,
      ).toBe(429);

      // Client B has a distinct IP -> its own bucket, unaffected by A.
      expect(
        (await fetch(url, { headers: { "x-forwarded-for": "198.51.100.2" } }))
          .status,
      ).toBe(200);
    } finally {
      await close();
    }
  });
});
