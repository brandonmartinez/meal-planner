#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { MealPlannerApiClient } from "./apiClient.js";
import { createServer, SERVER_NAME, SERVER_VERSION } from "./server.js";

/**
 * stdio entrypoint. The MCP protocol owns stdout, so ALL diagnostics go to
 * stderr. The agent credential is never logged here or anywhere else.
 */
async function main(): Promise<void> {
  const config = loadConfig();

  const client = new MealPlannerApiClient({
    baseUrl: config.apiBaseUrl,
    agentKey: config.agentKey,
    timeoutMs: config.requestTimeoutMs,
  });

  const server = createServer(client, config.familyId);
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Diagnostics to stderr only. Note: no agent key is included.
  console.error(
    `${SERVER_NAME} v${SERVER_VERSION} connected over stdio ` +
      `(api=${config.apiBaseUrl}, family=${config.familyId})`,
  );
}

main().catch((err: unknown) => {
  console.error(
    `${SERVER_NAME} failed to start: ${
      err instanceof Error ? err.message : String(err)
    }`,
  );
  process.exit(1);
});
