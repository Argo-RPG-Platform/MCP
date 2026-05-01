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
 *   Authorization: Bearer <access_token>   (required on first request)
 *   X-Refresh-Token: <refresh_token>       (optional — enables auto-renewal)
 *
 * Session token caching: the token from the first request is cached against
 * the session ID so that MCP clients that omit the Authorization header on
 * subsequent requests (a known Claude Code behaviour) continue to work.
 */

import express from "express";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { runWithToken } from "./auth.js";
import { createServer } from "./server.js";

interface SessionTokens {
  token: string;
  refreshToken: string | null;
}

function extractTokens(req: express.Request): SessionTokens {
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
  const sessionTokens = new Map<string, SessionTokens>();

  function resolveTokens(req: express.Request, sessionId?: string): SessionTokens {
    try {
      const tokens = extractTokens(req);
      // Always update the cache when the header is present
      if (sessionId) sessionTokens.set(sessionId, tokens);
      return tokens;
    } catch {
      // Header absent — fall back to session-cached token (Claude Code omits
      // headers on requests after the first one in a session)
      if (sessionId) {
        const cached = sessionTokens.get(sessionId);
        if (cached) return cached;
      }
      throw new Error(
        "Missing Authorization header. " +
          "Get a token at https://app.argo.games/oauth2/mcp-connect"
      );
    }
  }

  // POST /mcp — initialize session or handle subsequent requests
  app.post("/mcp", async (req, res) => {
    try {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      const tokens = resolveTokens(req, sessionId);
      let transport = sessionId ? sessions.get(sessionId) : undefined;

      if (!transport) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (id: string) => {
            sessions.set(id, transport!);
            sessionTokens.set(id, tokens);
          },
        });
        const server = createServer();
        await server.connect(transport);
      }

      const t = transport;
      await runWithToken(tokens.token, tokens.refreshToken, () =>
        t.handleRequest(req, res, req.body)
      );
    } catch (err) {
      if (!res.headersSent) {
        res.status(401).json({ error: (err as Error).message });
      }
    }
  });

  // GET /mcp — server-sent events stream for an existing session
  app.get("/mcp", async (req, res) => {
    try {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      const tokens = resolveTokens(req, sessionId);
      const transport = sessionId ? sessions.get(sessionId) : undefined;
      if (!transport) {
        res.status(404).json({ error: "Session not found. Send a POST /mcp request first." });
        return;
      }
      await runWithToken(tokens.token, tokens.refreshToken, () =>
        transport.handleRequest(req, res)
      );
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
        sessionTokens.delete(sessionId);
      }
    }
    res.status(204).send();
  });

  // Health check for Cloud Run / load balancers
  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  const port = parseInt(process.env.PORT ?? "8080", 10);
  app.listen(port, () => console.error(`Argo MCP HTTP server listening on port ${port}`));
}
