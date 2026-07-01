import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MealPlannerApiClient } from "./apiClient.js";
import { registerTools } from "./tools.js";

export const SERVER_NAME = "meal-planner-mcp";
export const SERVER_VERSION = "0.1.0";

/**
 * Builds the MCP server and registers the meal-planning tool surface. The
 * transport is attached by the caller — stdio (`index.ts`) for a local,
 * single-tenant process, or a per-request Streamable HTTP transport
 * (`httpServer.ts`) for the hosted, multi-tenant server — so this stays
 * unit-testable and transport-agnostic. In hosted mode a fresh server is built
 * per request with `familyId` resolved from the caller's key.
 */
export function createServer(
  client: MealPlannerApiClient,
  familyId: string,
): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  registerTools(server, client, familyId);

  return server;
}
