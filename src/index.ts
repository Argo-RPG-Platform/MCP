/**
 * Argo MCP Server — entry point
 *
 * Detects the runtime mode from environment variables:
 *
 *   stdio (default)  — for local use with Claude Code / Claude Desktop / Codex.
 *                      Set OAUTH_TOKEN (required) and REFRESH_TOKEN (recommended).
 *                      Run via: npx argo-mcp  OR  node dist/index.js
 *
 *   HTTP             — for the hosted service at https://mcp.argo.games.
 *                      Activated when PORT is set (Cloud Run sets it automatically).
 *                      Token arrives per-request in the Authorization header.
 */

import dotenv from "dotenv";
dotenv.config();

if (process.env.PORT) {
  const { startHttpServer } = await import("./http.js");
  await startHttpServer();
} else {
  const { loadToken } = await import("./auth.js");
  loadToken();
  const { createServer } = await import("./server.js");
  const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Argo MCP server started on stdio transport.");
}
