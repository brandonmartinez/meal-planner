/**
 * Tests for the /mcp Express router.
 *
 * The `createMcpCoreHandler` factory from @meal-planner/mcp is mocked in its
 * entirety so these tests cover only the route wiring:
 *   - POST "/" calls the core handler with (req, res, req.body)
 *   - Errors thrown by the core handler are forwarded to `next`
 *   - Non-POST methods receive a 405 JSON response from the fallback handler
 *
 * The core handler's auth/transport behaviour is covered by
 * packages/mcp/src/httpServer.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildReq, buildRes, buildNext } from "../../tests/helpers/express.js";

// Hoist the mock function so it is available inside the vi.mock factory.
const mockCoreHandlerFn = vi.hoisted(() =>
  vi.fn<[unknown, unknown, unknown], Promise<void>>(() => Promise.resolve()),
);

// Mock the MCP package BEFORE the router module is imported so the router
// receives the controlled mock when it calls createMcpCoreHandler at module
// load time.
vi.mock("@meal-planner/mcp/httpServer", () => ({
  createMcpCoreHandler: vi.fn(() => mockCoreHandlerFn),
}));

// Stub out config so the module can load without a real environment.
vi.mock("../config/index.js", () => ({
  config: { port: 3001 },
}));

const { mcpRouter } = await import("./mcp.js");

type Handler = (
  req: ReturnType<typeof buildReq>,
  res: ReturnType<typeof buildRes>,
  next?: (err?: unknown) => void,
) => unknown;

interface RouteLayer {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: { handle: Handler }[];
  };
}

/**
 * Return the innermost handler for the POST "/" route.
 * The POST route is always the first layer registered by the router.
 */
function getPostHandler(): Handler {
  const stack = (mcpRouter as unknown as { stack: RouteLayer[] }).stack;
  const layer = stack.find((l) => l.route?.methods?.post);
  if (!layer?.route)
    throw new Error("POST / layer not found in mcpRouter.stack");
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

/**
 * Return the innermost handler for the ALL "/" fallback (405) route.
 * This is the second layer registered by the router.
 */
function getFallbackHandler(): Handler {
  const stack = (mcpRouter as unknown as { stack: RouteLayer[] }).stack;
  // router.all registers an entry whose `methods` does NOT have `post`
  const layer = stack.find(
    (l) => l.route?.path === "/" && !l.route?.methods?.post,
  );
  if (!layer?.route)
    throw new Error("ALL / fallback layer not found in mcpRouter.stack");
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

// ─────────────────────────────────────────────────────────────────────────────

describe("mcpRouter POST /", () => {
  beforeEach(() => {
    mockCoreHandlerFn.mockReset();
    mockCoreHandlerFn.mockResolvedValue(undefined);
  });

  it("calls the core handler with (req, res, req.body)", async () => {
    const body = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {},
    };
    const req = buildReq({ body, headers: { "x-agent-key": "test-key" } });
    const res = buildRes();
    const next = buildNext();

    const handler = getPostHandler();
    await handler(req, res, next);

    expect(mockCoreHandlerFn).toHaveBeenCalledOnce();
    expect(mockCoreHandlerFn).toHaveBeenCalledWith(req, res, body);
    expect(next).not.toHaveBeenCalled();
  });

  it("passes req.body (already parsed by express.json) not the raw stream", async () => {
    const body = { jsonrpc: "2.0", id: 2, method: "resources/list" };
    const req = buildReq({ body });
    const res = buildRes();
    const next = buildNext();

    await getPostHandler()(req, res, next);

    // The third argument must be the already-parsed body object, NOT the req
    // stream — confirming express.json() pre-parsed it before our handler ran.
    const [, , receivedBody] = mockCoreHandlerFn.mock.calls[0]!;
    expect(receivedBody).toBe(body);
  });

  it("forwards errors thrown by the core handler to next()", async () => {
    const boom = new Error("transport exploded");
    mockCoreHandlerFn.mockRejectedValue(boom);

    const req = buildReq({ headers: { "x-agent-key": "bad-key" } });
    const res = buildRes();
    const next = buildNext();

    await getPostHandler()(req, res, next);

    expect(next).toHaveBeenCalledWith(boom);
  });

  it("does not call next when the core handler resolves successfully", async () => {
    mockCoreHandlerFn.mockResolvedValue(undefined);

    const req = buildReq({
      body: { jsonrpc: "2.0", id: 3, method: "tools/call" },
    });
    const res = buildRes();
    const next = buildNext();

    await getPostHandler()(req, res, next);

    expect(next).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("requestTimeoutMs NaN guard", () => {
  it("falls back to 15_000 when MCP_REQUEST_TIMEOUT_MS is a non-numeric string", async () => {
    const prev = process.env.MCP_REQUEST_TIMEOUT_MS;
    process.env.MCP_REQUEST_TIMEOUT_MS = "not-a-number";

    vi.resetModules();

    // Re-import after the module registry is cleared so requestTimeoutMs is
    // re-computed with the poisoned env var.
    const { createMcpCoreHandler: freshFactory } = (await import(
      "@meal-planner/mcp/httpServer"
    )) as { createMcpCoreHandler: ReturnType<typeof vi.fn> };

    await import("./mcp.js");

    expect(freshFactory).toHaveBeenCalledWith(
      expect.objectContaining({ requestTimeoutMs: 15_000 }),
    );

    // Restore env and module registry so subsequent test files are unaffected.
    if (prev === undefined) delete process.env.MCP_REQUEST_TIMEOUT_MS;
    else process.env.MCP_REQUEST_TIMEOUT_MS = prev;
    vi.resetModules();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("mcpRouter ALL / (405 fallback)", () => {
  it("returns 405 with a JSON error body for non-POST methods", () => {
    const req = buildReq();
    const res = buildRes();

    getFallbackHandler()(req, res);

    expect(res.statusCode).toBe(405);
    expect(res.body).toEqual({ error: "Method not allowed" });
  });
});
