#!/usr/bin/env node
import { loadHttpConfig } from "./config.js";
import {
  createHttpMcpServer,
  MCP_PATH,
  SERVER_NAME,
  SERVER_VERSION,
} from "./httpServer.js";

/**
 * Hosted (Streamable HTTP) entrypoint. Unlike the stdio entry, this server does
 * NOT read an agent key or family id at boot — each request supplies its own
 * key in the `x-agent-key` header and the family is resolved from it. The key
 * is never logged here or anywhere else.
 */
function main(): void {
  const config = loadHttpConfig();
  const server = createHttpMcpServer(config);

  server.listen(config.port, () => {
    // Diagnostics only — no secrets. There is no ambient agent key to leak.
    console.error(
      `${SERVER_NAME} v${SERVER_VERSION} listening on ` +
        `http://0.0.0.0:${config.port}${MCP_PATH} ` +
        `(api=${config.apiBaseUrl}); auth per request via x-agent-key`,
    );
  });
}

main();
