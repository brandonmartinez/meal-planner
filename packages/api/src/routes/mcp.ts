/**
 * Express router that mounts the MCP Streamable HTTP handler at `/mcp` inside
 * the existing API process.
 *
 * The global `express.json()` in `index.ts` runs first, so `req.body` is
 * already parsed when the POST handler below is called. We pass it directly to
 * `createMcpCoreHandler` — no body-stream reading here, which avoids the
 * double-consume problem.
 *
 * Rate limiting (`mcpLimiter`) is applied at the `/mcp` prefix in `index.ts`
 * so credential floods are throttled before this router is reached.
 */

import { Router } from "express";
import { createMcpCoreHandler } from "@meal-planner/mcp/httpServer";
import { config } from "../config/index.js";

/**
 * Loopback base URL for MCP's internal API calls. The MCP core handler
 * authenticates each request by calling `GET /api/agent/me` on the API itself
 * over loopback. In production no env var is needed — it defaults to the same
 * port the API is listening on. Override with `MEAL_PLANNER_API_BASE_URL`.
 */
const apiBaseUrl =
  process.env.MEAL_PLANNER_API_BASE_URL ?? `http://localhost:${config.port}`;

/** Default timeout for loopback API calls made by the MCP handler. */
const parsedTimeout = parseInt(process.env.MCP_REQUEST_TIMEOUT_MS ?? "", 10);
const requestTimeoutMs = isNaN(parsedTimeout) ? 15_000 : parsedTimeout;

const mcpCoreHandler = createMcpCoreHandler({ apiBaseUrl, requestTimeoutMs });

const router = Router();

/** JSON-RPC 2.0 over Streamable HTTP — the only method the stateless transport
 *  accepts. `req.body` is pre-parsed by the global `express.json()`. */
router.post("/", (req, res, next) => {
  mcpCoreHandler(req, res, req.body).catch(next);
});

/** All other HTTP methods are not supported on the stateless MCP endpoint. */
router.all("/", (_req, res) => {
  res.status(405).json({ error: "Method not allowed" });
});

export const mcpRouter = router;
