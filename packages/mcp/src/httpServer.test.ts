import { describe, it, expect, vi } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createRequestHandler, MCP_PATH } from "./httpServer.js";
import type { HttpMcpConfig } from "./config.js";

const CONFIG: HttpMcpConfig = {
  apiBaseUrl: "http://localhost:3001",
  port: 3100,
  requestTimeoutMs: 1000,
};

const AGENT_KEY = "secret-agent-key";

/** A minimal mock of the request fields the handler reads BEFORE the transport
 *  takes over (method, url, headers). The auth gate returns before the MCP
 *  transport for every case these unit tests cover, so no socket is needed. */
function mockReq(
  method: string,
  url: string,
  headers: Record<string, string> = {},
): IncomingMessage {
  return { method, url, headers } as unknown as IncomingMessage;
}

/** Captures the status + parsed JSON body written via writeHead/end. */
function mockRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    headersSent: false,
    writeHead(status: number) {
      this.statusCode = status;
      this.headersSent = true;
      return this;
    },
    end(payload?: string) {
      if (payload) this.body = JSON.parse(payload);
    },
    on() {
      return this;
    },
  };
  return res as unknown as ServerResponse & {
    statusCode: number;
    body: unknown;
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("createRequestHandler — auth gate", () => {
  it("answers the /health liveness probe without a key", async () => {
    const fetchFn = vi.fn();
    const handler = createRequestHandler(CONFIG, {
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const res = mockRes();
    await handler(mockReq("GET", "/health"), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ status: "ok" });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("returns 404 for a non-MCP path", async () => {
    const handler = createRequestHandler(CONFIG);
    const res = mockRes();
    await handler(mockReq("GET", "/nope"), res);
    expect(res.statusCode).toBe(404);
  });

  it("returns 405 for GET on the MCP path (stateless: POST only)", async () => {
    const handler = createRequestHandler(CONFIG);
    const res = mockRes();
    await handler(mockReq("GET", MCP_PATH), res);
    expect(res.statusCode).toBe(405);
  });

  it("rejects a request with no x-agent-key (401) before calling the API", async () => {
    const fetchFn = vi.fn();
    const handler = createRequestHandler(CONFIG, {
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const res = mockRes();
    await handler(mockReq("POST", MCP_PATH), res);

    expect(res.statusCode).toBe(401);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("resolves the family from the key via GET /api/agent/me", async () => {
    // 403 short-circuits before the transport, but still proves the handler
    // authenticated the presented key against /api/agent/me first.
    const fetchFn = vi.fn(async () =>
      jsonResponse({ error: "Insufficient scope" }, 403),
    );
    const handler = createRequestHandler(CONFIG, {
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const res = mockRes();
    await handler(
      mockReq("POST", MCP_PATH, { "x-agent-key": AGENT_KEY }),
      res,
    );

    const [url, init] = fetchFn.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("http://localhost:3001/api/agent/me");
    expect((init.headers as Record<string, string>)["x-agent-key"]).toBe(
      AGENT_KEY,
    );
    expect(res.statusCode).toBe(403);
  });

  it("surfaces an unknown/revoked key uniformly as 401", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({ error: "Invalid agent credential" }, 401),
    );
    const handler = createRequestHandler(CONFIG, {
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const res = mockRes();
    await handler(
      mockReq("POST", MCP_PATH, { "x-agent-key": "revoked" }),
      res,
    );
    expect(res.statusCode).toBe(401);
  });

  it("maps an API transport failure to 502", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    const handler = createRequestHandler(CONFIG, {
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const res = mockRes();
    await handler(
      mockReq("POST", MCP_PATH, { "x-agent-key": AGENT_KEY }),
      res,
    );
    expect(res.statusCode).toBe(502);
  });

  it("never echoes the agent key in an error body", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({ error: "Insufficient scope" }, 403),
    );
    const handler = createRequestHandler(CONFIG, {
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const res = mockRes();
    await handler(
      mockReq("POST", MCP_PATH, { "x-agent-key": AGENT_KEY }),
      res,
    );
    expect(JSON.stringify(res.body)).not.toContain(AGENT_KEY);
  });
});
