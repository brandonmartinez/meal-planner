import { describe, it, expect, vi } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import { AGENT_SCOPES } from "@meal-planner/shared";
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
    headers: {} as Record<string, string>,
    headersSent: false,
    writeHead(
      status: number,
      headers:
        | Record<string, number | string | readonly string[] | undefined>
        | undefined = {},
    ) {
      this.statusCode = status;
      this.headersSent = true;
      this.headers = Object.fromEntries(
        Object.entries(headers).flatMap(([key, value]) => {
          if (typeof value === "undefined") return [];
          return [
            [
              key.toLowerCase(),
              Array.isArray(value) ? value.join(", ") : String(value),
            ],
          ];
        }),
      );
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
    headers: Record<string, string>;
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

  it("serves oauth protected resource metadata without auth", async () => {
    const fetchFn = vi.fn();
    const handler = createRequestHandler(CONFIG, {
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const res = mockRes();
    await handler(
      mockReq("GET", "/.well-known/oauth-protected-resource", {
        host: "planner.example.test",
        "x-forwarded-proto": "https",
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      bearer_methods_supported: ["header"],
      scopes_supported: [...AGENT_SCOPES],
    });
    expect((res.body as { resource: string }).resource).toBe(
      "https://planner.example.test/mcp",
    );
    expect((res.body as { resource: string }).resource.endsWith("/mcp")).toBe(
      true,
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("returns 405 for non-GET oauth protected resource requests", async () => {
    const fetchFn = vi.fn();
    const handler = createRequestHandler(CONFIG, {
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const res = mockRes();
    await handler(mockReq("POST", "/.well-known/oauth-protected-resource"), res);
    expect(res.statusCode).toBe(405);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("rejects a request with no credential (401) before calling the API", async () => {
    const fetchFn = vi.fn();
    const handler = createRequestHandler(CONFIG, {
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const res = mockRes();
    await handler(
      mockReq("POST", MCP_PATH, { host: "planner.example.test" }),
      res,
    );

    expect(res.statusCode).toBe(401);
    expect(
      res.headers["www-authenticate"].startsWith(
        'Bearer realm="meal-planner-mcp"',
      ),
    ).toBe(true);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("omits resource_metadata when Host is untrusted in a 401 challenge", async () => {
    const fetchFn = vi.fn();
    const handler = createRequestHandler(CONFIG, {
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const res = mockRes();
    await handler(
      mockReq("POST", MCP_PATH, { host: 'evil.com" attack="1' }),
      res,
    );

    expect(res.statusCode).toBe(401);
    expect(res.headers["www-authenticate"]).toContain(
      'Bearer realm="meal-planner-mcp"',
    );
    expect(res.headers["www-authenticate"]).not.toContain("attack=");
    expect(res.headers["www-authenticate"]).not.toContain("resource_metadata=");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("authenticates from Authorization Bearer and forwards it as x-agent-key", async () => {
    const bearerKey = "bearer-agent-key";
    const fetchFn = vi.fn(async () =>
      jsonResponse({ error: "Insufficient scope" }, 403),
    );
    const handler = createRequestHandler(CONFIG, {
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const res = mockRes();
    await handler(
      mockReq("POST", MCP_PATH, {
        authorization: `Bearer    ${bearerKey}   `,
      }),
      res,
    );

    const [url, init] = fetchFn.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("http://localhost:3001/api/agent/me");
    expect((init.headers as Record<string, string>)["x-agent-key"]).toBe(
      bearerKey,
    );
    expect(res.statusCode).toBe(403);
  });

  it("resolves the family from x-agent-key via GET /api/agent/me", async () => {
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

  it("prefers Bearer credentials over x-agent-key when both are present", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({ error: "Insufficient scope" }, 403),
    );
    const handler = createRequestHandler(CONFIG, {
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const res = mockRes();
    await handler(
      mockReq("POST", MCP_PATH, {
        authorization: "Bearer bearer-key",
        "x-agent-key": "header-key",
      }),
      res,
    );

    const [, init] = fetchFn.mock.calls[0] as [URL, RequestInit];
    expect((init.headers as Record<string, string>)["x-agent-key"]).toBe(
      "bearer-key",
    );
    expect(res.statusCode).toBe(403);
  });

  it("surfaces an unknown/revoked key uniformly as 401", async () => {
    const bearerKey = "revoked-bearer-key";
    const fetchFn = vi.fn(async () =>
      jsonResponse({ error: "Invalid agent credential" }, 401),
    );
    const handler = createRequestHandler(CONFIG, {
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const res = mockRes();
    await handler(mockReq("POST", MCP_PATH, { authorization: `Bearer ${bearerKey}` }), res);
    expect(res.statusCode).toBe(401);
    expect(res.headers["www-authenticate"]).toContain('error="invalid_token"');
    expect(Object.values(res.headers).join(" ")).not.toContain(bearerKey);
  });

  it("includes an insufficient_scope challenge for scope denials", async () => {
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
    expect(res.statusCode).toBe(403);
    expect(res.headers["www-authenticate"]).toContain(
      'error="insufficient_scope"',
    );
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
