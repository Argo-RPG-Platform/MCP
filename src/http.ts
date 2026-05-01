/**
 * HTTP transport for the Argo MCP server (hosted mode).
 *
 * Listens on $PORT (default 8080) and exposes a single /mcp endpoint that
 * implements the MCP Streamable HTTP transport. Each user session gets its
 * own transport instance. The user's OAuth2 token is extracted from the
 * Authorization header on every request and scoped to that request's async
 * call chain via AsyncLocalStorage — tool code is unchanged.
 *
 * Token delivery:
 *   Authorization: Bearer <access_token>   (required)
 *   X-Refresh-Token: <refresh_token>       (optional — enables auto-renewal)
 */

import express from "express";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { runWithToken } from "./auth.js";
import { createServer } from "./server.js";

function extractTokens(req: express.Request): { token: string; refreshToken: string | null } {
  const auth = (req.headers["authorization"] ?? "") as string;
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) {
    throw new Error(
      "Missing or invalid Authorization header. " +
        "Get a token at https://app.argo.games/oauth2/mcp-connect and pass it as: Authorization: Bearer <token>"
    );
  }
  const refreshToken = (req.headers["x-refresh-token"] as string | undefined) ?? null;
  return { token, refreshToken };
}

export async function startHttpServer(): Promise<void> {
  const app = express();
  app.use(express.json());

  const sessions = new Map<string, StreamableHTTPServerTransport>();

  // POST /mcp — initialize session or handle subsequent requests
  app.post("/mcp", async (req, res) => {
    try {
      const { token, refreshToken } = extractTokens(req);
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      let transport = sessionId ? sessions.get(sessionId) : undefined;

      if (!transport) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (id: string) => { sessions.set(id, transport!); },
        });
        const server = createServer();
        await server.connect(transport);
      }

      const t = transport;
      await runWithToken(token, refreshToken, () => t.handleRequest(req, res, req.body));
    } catch (err) {
      if (!res.headersSent) {
        res.status(401).json({ error: (err as Error).message });
      }
    }
  });

  // GET /mcp — server-sent events stream for an existing session
  app.get("/mcp", async (req, res) => {
    try {
      const { token, refreshToken } = extractTokens(req);
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      const transport = sessionId ? sessions.get(sessionId) : undefined;
      if (!transport) {
        res.status(404).json({ error: "Session not found. Send a POST /mcp request first." });
        return;
      }
      await runWithToken(token, refreshToken, () => transport.handleRequest(req, res));
    } catch (err) {
      if (!res.headersSent) res.status(401).json({ error: (err as Error).message });
    }
  });

  // DELETE /mcp — explicit session teardown
  app.delete("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (sessionId) {
      const transport = sessions.get(sessionId);
      if (transport) {
        await transport.close();
        sessions.delete(sessionId);
      }
    }
    res.status(204).send();
  });

  // Health check for Cloud Run / load balancers
  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  const port = parseInt(process.env.PORT ?? "8080", 10);
  app.listen(port, () => console.error(`Argo MCP HTTP server listening on port ${port}`));
}
