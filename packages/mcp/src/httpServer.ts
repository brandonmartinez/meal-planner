import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { HttpMcpConfig } from "./config.js";
import { MealPlannerApiClient } from "./apiClient.js";
import { createServer, SERVER_NAME, SERVER_VERSION } from "./server.js";
import { ApiError, ApiTransportError } from "./errors.js";

/** Header carrying the raw scoped agent key — matches the API middleware and
 *  the stdio client. Treated as a secret: never logged. */
const AGENT_KEY_HEADER = "x-agent-key";

/** The MCP endpoint path. Kept as a constant so tests and docs stay in sync. */
export const MCP_PATH = "/mcp";

export interface HttpMcpServerDeps {
  /** Injectable fetch, primarily for tests. Defaults to global `fetch`. */
  fetchFn?: typeof fetch;
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Read and JSON-parse a request body. Returns `undefined` for an empty body. */
async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return undefined;
  const raw = Buffer.concat(chunks).toString("utf8");
  if (raw.trim().length === 0) return undefined;
  return JSON.parse(raw) as unknown;
}

function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

/**
 * Builds the per-request handler for the hosted MCP server. Each POST to
 * {@link MCP_PATH} is authenticated and served in isolation:
 *
 *  1. Read the raw agent key from the `x-agent-key` header. Missing → 401.
 *  2. Resolve `{ familyId, scopes }` for that key via `GET /api/agent/me`.
 *     The API rejects unknown/revoked/expired keys uniformly (401) and scope
 *     issues (403); we surface those statuses without ever echoing the key.
 *  3. Build a per-request API client (bound to the presented key) and an MCP
 *     server whose tool handlers are bound to the RESOLVED family. A request
 *     carrying family A's key can only ever operate on family A.
 *  4. Serve the request through a fresh stateless Streamable HTTP transport,
 *     then tear the server + transport down.
 *
 * There is no ambient/shared credential and no cross-request session state —
 * every call re-authenticates from the key it presents.
 */
export function createRequestHandler(
  config: HttpMcpConfig,
  deps: HttpMcpServerDeps = {},
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    const method = req.method ?? "GET";
    const path = (req.url ?? "").split("?")[0];

    // Lightweight, unauthenticated liveness probe for hosting platforms.
    if (method === "GET" && (path === "/health" || path === "/healthz")) {
      sendJson(res, 200, { status: "ok", server: SERVER_NAME });
      return;
    }

    if (path !== MCP_PATH) {
      sendJson(res, 404, { error: "Not found" });
      return;
    }

    // Stateless mode: only POST carries JSON-RPC. GET (SSE) is not supported.
    if (method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    const rawKey = firstHeader(req.headers[AGENT_KEY_HEADER]);
    if (!rawKey) {
      sendJson(res, 401, { error: "Agent credential required" });
      return;
    }

    const client = new MealPlannerApiClient({
      baseUrl: config.apiBaseUrl,
      agentKey: rawKey,
      fetchFn: deps.fetchFn,
      timeoutMs: config.requestTimeoutMs,
    });

    // Resolve the family from the key BEFORE serving any tool call. This is the
    // per-request authentication gate for the hosted transport.
    let familyId: string;
    try {
      const identity = await client.getAgentMe();
      familyId = identity.familyId;
    } catch (err) {
      if (err instanceof ApiError) {
        // Map the API's auth/scope status through (401/403/…). The key is never
        // part of an ApiError, so nothing sensitive is echoed.
        sendJson(res, err.status, { error: err.message });
        return;
      }
      if (err instanceof ApiTransportError) {
        sendJson(res, 502, { error: `API unreachable: ${err.message}` });
        return;
      }
      sendJson(res, 500, { error: "Agent authentication failed" });
      return;
    }

    // Parse the JSON-RPC body ourselves (raw Node http has no body parser) and
    // hand it to the transport pre-parsed.
    let body: unknown;
    try {
      body = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    const server = createServer(client, familyId);
    const transport = new StreamableHTTPServerTransport({
      // Stateless: no session id is issued or validated. Each request stands
      // alone and re-authenticates from its own key.
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    // Tear down per-request resources once the response is done.
    res.on("close", () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (err) {
      // Never surface transport internals or the key.
      if (!res.headersSent) {
        sendJson(res, 500, {
          error: `MCP request failed: ${
            err instanceof Error ? err.message : "unknown error"
          }`,
        });
      }
    }
  };
}

/**
 * Creates (but does not start) the hosted MCP HTTP server. Call `.listen()` on
 * the returned server. The agent credential is never logged; diagnostics carry
 * only method + path + status.
 */
export function createHttpMcpServer(
  config: HttpMcpConfig,
  deps: HttpMcpServerDeps = {},
): http.Server {
  const handler = createRequestHandler(config, deps);
  return http.createServer((req, res) => {
    void handler(req, res).catch((err: unknown) => {
      if (!res.headersSent) {
        sendJson(res, 500, {
          error: `Internal error: ${
            err instanceof Error ? err.message : "unknown error"
          }`,
        });
      }
    });
  });
}

export { SERVER_NAME, SERVER_VERSION };
