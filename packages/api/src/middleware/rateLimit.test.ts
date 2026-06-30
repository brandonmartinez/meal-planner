import { describe, it, expect } from "vitest";
import express, { type RequestHandler } from "express";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import crypto from "crypto";
import type { Request } from "express";
import {
  createRateLimiter,
  displayKeyGenerator,
  displayLimiter,
  authLimiter,
  agentKeyGenerator,
  agentLimiter,
  DISPLAY_LIMIT,
  AUTH_LIMIT,
  AGENT_LIMIT,
} from "./rateLimit.js";

/**
 * Boot an ephemeral Express server that runs `mw` then a trivial 200 handler.
 * Returns the base URL and a closer. No new test dependencies — uses the Node
 * http server plus the global `fetch` so 429 behavior is exercised end-to-end.
 */
async function harness(mw: RequestHandler, mountPath = "/t") {
  const app = express();
  app.use(mountPath, mw, (_req, res) => {
    res.json({ ok: true });
  });
  const server: Server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}${mountPath}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        // Global fetch (undici) pools keep-alive sockets; tear them down so
        // server.close() resolves promptly instead of waiting on the pool.
        server.closeAllConnections();
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

describe("displayKeyGenerator", () => {
  it("hashes the api key and never embeds the raw key in the bucket key", () => {
    const raw = "super-secret-raw-key";
    const req = {
      ip: "203.0.113.7",
      headers: { "x-api-key": raw },
    } as unknown as Request;

    const key = displayKeyGenerator(req);
    const fingerprint = crypto
      .createHash("sha256")
      .update(raw)
      .digest("hex")
      .slice(0, 16);

    expect(key).toBe(`203.0.113.7:${fingerprint}`);
    // The raw key must never appear in the limiter key (it must not be logged
    // or persisted via limiter state).
    expect(key).not.toContain(raw);
  });

  it("falls back to IP only when no api key is present", () => {
    const req = { ip: "203.0.113.7", headers: {} } as unknown as Request;
    expect(displayKeyGenerator(req)).toBe("203.0.113.7");
  });

  it("ignores a non-string x-api-key header", () => {
    const req = {
      ip: "203.0.113.7",
      headers: { "x-api-key": ["a", "b"] },
    } as unknown as Request;
    expect(displayKeyGenerator(req)).toBe("203.0.113.7");
  });
});

describe("createRateLimiter", () => {
  it("returns a generic 429 once the limit is exceeded", async () => {
    const limiter = createRateLimiter({ windowMs: 60_000, limit: 2 });
    const { url, close } = await harness(limiter);
    try {
      expect((await fetch(url)).status).toBe(200);
      expect((await fetch(url)).status).toBe(200);

      const blocked = await fetch(url);
      expect(blocked.status).toBe(429);

      const body = await blocked.json();
      expect(body).toEqual({ error: expect.any(String) });
      // The 429 body must not leak whether a key/account/token exists.
      expect(JSON.stringify(body)).not.toMatch(/key|token|exist|account/i);
    } finally {
      await close();
    }
  });

  it("emits standardized RateLimit headers and no legacy headers", async () => {
    const limiter = createRateLimiter({ windowMs: 60_000, limit: 5 });
    const { url, close } = await harness(limiter);
    try {
      const res = await fetch(url);
      // draft-7 emits a combined `RateLimit` header (+ `RateLimit-Policy`)
      // rather than separate RateLimit-Limit fields.
      const standard =
        res.headers.get("ratelimit") ?? res.headers.get("ratelimit-policy");
      expect(standard).toBeTruthy();
      // Legacy X-RateLimit-* headers are disabled.
      expect(res.headers.get("x-ratelimit-limit")).toBeNull();
    } finally {
      await close();
    }
  });
});

describe("display rate limiter", () => {
  it("buckets independently per api-key fingerprint", async () => {
    const limiter = createRateLimiter({
      windowMs: 60_000,
      limit: 1,
      keyGenerator: displayKeyGenerator,
    });
    const { url, close } = await harness(limiter);
    try {
      // Key A: first request ok, second over its budget -> 429.
      expect(
        (await fetch(url, { headers: { "x-api-key": "AAA" } })).status,
      ).toBe(200);
      expect(
        (await fetch(url, { headers: { "x-api-key": "AAA" } })).status,
      ).toBe(429);

      // Key B has its own bucket and is unaffected by Key A's exhaustion.
      expect(
        (await fetch(url, { headers: { "x-api-key": "BBB" } })).status,
      ).toBe(200);
    } finally {
      await close();
    }
  });

  it("real displayLimiter returns 429 after exceeding the display limit", async () => {
    const { url, close } = await harness(displayLimiter);
    try {
      let lastStatus = 0;
      for (let i = 0; i < DISPLAY_LIMIT + 1; i++) {
        const res = await fetch(url, { headers: { "x-api-key": "same-key" } });
        lastStatus = res.status;
      }
      expect(lastStatus).toBe(429);
    } finally {
      await close();
    }
  });
});

describe("auth rate limiter", () => {
  it("real authLimiter returns 429 after exceeding the auth limit", async () => {
    const { url, close } = await harness(authLimiter);
    try {
      let lastStatus = 0;
      for (let i = 0; i < AUTH_LIMIT + 1; i++) {
        lastStatus = (await fetch(url)).status;
      }
      expect(lastStatus).toBe(429);

      const blocked = await fetch(url);
      const body = await blocked.json();
      // Throttling the auth surface must not reveal anything about credentials.
      expect(JSON.stringify(body)).not.toMatch(/key|token|exist|account/i);
    } finally {
      await close();
    }
  });
});

describe("agentKeyGenerator", () => {
  it("hashes the agent key and never embeds the raw key in the bucket key", () => {
    const raw = "super-secret-agent-key";
    const req = {
      ip: "203.0.113.9",
      headers: { "x-agent-key": raw },
    } as unknown as Request;

    const key = agentKeyGenerator(req);
    const fingerprint = crypto
      .createHash("sha256")
      .update(raw)
      .digest("hex")
      .slice(0, 16);

    expect(key).toBe(`203.0.113.9:${fingerprint}`);
    expect(key).not.toContain(raw);
  });

  it("falls back to IP only when no agent key is present", () => {
    const req = { ip: "203.0.113.9", headers: {} } as unknown as Request;
    expect(agentKeyGenerator(req)).toBe("203.0.113.9");
  });
});

describe("agent rate limiter", () => {
  it("buckets independently per agent-key fingerprint", async () => {
    const limiter = createRateLimiter({
      windowMs: 60_000,
      limit: 1,
      keyGenerator: agentKeyGenerator,
    });
    const { url, close } = await harness(limiter);
    try {
      expect(
        (await fetch(url, { headers: { "x-agent-key": "AAA" } })).status,
      ).toBe(200);
      expect(
        (await fetch(url, { headers: { "x-agent-key": "AAA" } })).status,
      ).toBe(429);
      // A different agent key has its own bucket.
      expect(
        (await fetch(url, { headers: { "x-agent-key": "BBB" } })).status,
      ).toBe(200);
    } finally {
      await close();
    }
  });

  it("real agentLimiter returns a generic 429 after exceeding its limit", async () => {
    const { url, close } = await harness(agentLimiter);
    try {
      let lastStatus = 0;
      for (let i = 0; i < AGENT_LIMIT + 1; i++) {
        const res = await fetch(url, { headers: { "x-agent-key": "same-key" } });
        lastStatus = res.status;
      }
      expect(lastStatus).toBe(429);

      const blocked = await fetch(url, {
        headers: { "x-agent-key": "same-key" },
      });
      const body = await blocked.json();
      expect(JSON.stringify(body)).not.toMatch(/key|token|exist|account/i);
    } finally {
      await close();
    }
  });
});
