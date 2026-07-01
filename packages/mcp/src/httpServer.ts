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

/**
 * Minimal config subset used by {@link createMcpCoreHandler}. A full
 * {@link HttpMcpConfig} is also accepted — the extra `port` field is ignored.
 */
export type McpHandlerConfig = Pick<HttpMcpConfig, "apiBaseUrl" | "requestTimeoutMs">;

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
 * Builds the core per-request MCP auth + transport handler.
 *
 * The `parsedBody` argument accepts:
 * - A pre-parsed value (`req.body` from Express) — used when the framework
 *   has already consumed the request stream (e.g. `express.json()` middleware).
 * - A no-arg async function that reads and parses the body lazily — called
 *   only AFTER auth succeeds so a rejected-auth request never reads the stream.
 *   The standalone `createRequestHandler` uses this form.
 *
 * Path and method routing are NOT performed here — the caller is responsible
 * for ensuring only valid `POST /mcp` requests reach this handler.
 *
 *  1. Read the raw agent key from the `x-agent-key` header. Missing → 401.
 *  2. Calls `GET /api/agent/me` to resolve `{ familyId, scopes, name }` from
 *     that key (unknown/revoked/expired → `401`; the key is never echoed).
 *  3. Bind a fresh, per-request API client (bound to the presented key) and an
 *     MCP server whose tool handlers are bound to the RESOLVED family. A
 *     request carrying family A's key can only ever operate on family A.
 *  4. Resolve the body (call the provider if lazy, use the value otherwise).
 *  5. Serve the request through a fresh stateless Streamable HTTP transport,
 *     then tear the server + transport down.
 *
 * There is no ambient/shared credential and no cross-request session state —
 * every call re-authenticates from the key it presents. The raw key is never
 * logged, serialized, or echoed in an error.
 */
export function createMcpCoreHandler(
  config: McpHandlerConfig,
  deps: HttpMcpServerDeps = {},
): (
  req: IncomingMessage,
  res: ServerResponse,
  parsedBody: unknown | (() => Promise<unknown>),
) => Promise<void> {
  return async (req, res, parsedBody) => {
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

    // Resolve the family from the key BEFORE serving any tool call. This is
    // the per-request authentication gate for the hosted transport.
    let familyId: string;
    try {
      const identity = await client.getAgentMe();
      familyId = identity.familyId;
    } catch (err) {
      if (err instanceof ApiError) {
        // Map the API's auth/scope status through (401/403/…). The key is
        // never part of an ApiError, so nothing sensitive is echoed.
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

    // Resolve the body AFTER auth so a rejected-auth request never reads the
    // stream. For the Express path the value is already resolved (req.body);
    // for the standalone path it is a lazy reader function.
    let body: unknown;
    if (typeof parsedBody === "function") {
      try {
        body = await (parsedBody as () => Promise<unknown>)();
      } catch {
        sendJson(res, 400, { error: "Invalid JSON body" });
        return;
      }
    } else {
      body = parsedBody;
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
 * Builds the per-request handler for the standalone hosted MCP HTTP server.
 * Performs path/method routing, reads and parses the raw request body, then
 * delegates to {@link createMcpCoreHandler} for auth + transport.
 *
 * Use {@link createMcpCoreHandler} directly when embedding the handler inside
 * an existing framework that already parses the body (e.g. Express).
 */
export function createRequestHandler(
  config: HttpMcpConfig,
  deps: HttpMcpServerDeps = {},
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const coreHandler = createMcpCoreHandler(config, deps);
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

    // Fast-path key existence check BEFORE body parsing so tests and real
    // callers alike get 401 without needing to consume the request stream.
    // The full credential validation (API round-trip) runs inside coreHandler.
    if (!firstHeader(req.headers["x-agent-key"])) {
      sendJson(res, 401, { error: "Agent credential required" });
      return;
    }

    // Pass the body as a lazy reader: coreHandler calls it only AFTER auth
    // succeeds, so the stream is never consumed for a rejected-auth request.
    await coreHandler(req, res, () => readJsonBody(req));
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

