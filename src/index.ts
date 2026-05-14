/**
 * Argo MCP Server — entry point
 *
 * Detects the runtime mode from environment variables and argv:
 *
 *   CLI command      — `argo-mcp auth login | auth logout | auth status | help`
 *                      Interactive commands; never start the MCP server.
 *
 *   HTTP             — for the hosted service at https://mcp.argo.games.
 *                      Activated when PORT is set (Cloud Run sets it automatically).
 *                      Token arrives per-request in the Authorization header.
 *
 *   stdio (default)  — for local use with Claude Code / Claude Desktop / Codex.
 *                      Tokens resolved from OAUTH_TOKEN env or the local store
 *                      written by `argo-mcp auth login`. If neither is present,
 *                      a friendly onboarding message is printed to stderr.
 */

import dotenv from "dotenv";
dotenv.config();

const cliExit = await (await import("./cli.js")).runCli(process.argv);
if (cliExit !== null) {
  process.exit(cliExit);
}

if (process.env.PORT) {
  const { startHttpServer } = await import("./http.js");
  await startHttpServer();
} else {
  const { loadToken, AuthRequiredError } = await import("./auth.js");
  try {
    loadToken();
  } catch (err) {
    if (err instanceof AuthRequiredError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
  const { createServer } = await import("./server.js");
  const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Argo MCP server started on stdio transport.");
}
