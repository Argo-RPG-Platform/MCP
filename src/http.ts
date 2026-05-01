/**
 * HTTP transport for the Argo MCP server (hosted mode).
 *
 * Supports two MCP transports on the same Express server:
 *
 *   Streamable HTTP  POST/GET/DELETE /mcp
 *     Modern transport used by Claude Code and Codex.
 *
 *   SSE              GET /sse  +  POST /messages
 *     Legacy transport required by ChatGPT connectors.
 *
 * Token delivery (both transports):
 *   Authorization: Bearer <access_token>   (required on first request)
 *   X-Refresh-Token: <refresh_token>       (optional — enables auto-renewal)
 *
 * Session token caching: the Bearer token from the first request is cached
 * per session so MCP clients that omit the Authorization header on subsequent
 * requests (a known Claude Code behaviour) continue to work.
 */

import express from "express";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
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

  // ---------------------------------------------------------------------------
  // Streamable HTTP transport (Claude Code, Codex)
  // ---------------------------------------------------------------------------

  const streamSessions = new Map<string, StreamableHTTPServerTransport>();
  const streamTokens = new Map<string, SessionTokens>();

  function resolveStreamTokens(req: express.Request, sessionId?: string): SessionTokens {
    try {
      const tokens = extractTokens(req);
      if (sessionId) streamTokens.set(sessionId, tokens);
      return tokens;
    } catch {
      if (sessionId) {
        const cached = streamTokens.get(sessionId);
        if (cached) return cached;
      }
      throw new Error(
        "Missing Authorization header. " +
          "Get a token at https://app.argo.games/oauth2/mcp-connect"
      );
    }
  }

  app.post("/mcp", async (req, res) => {
    try {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      const tokens = resolveStreamTokens(req, sessionId);
      let transport = sessionId ? streamSessions.get(sessionId) : undefined;

      if (!transport) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (id: string) => {
            streamSessions.set(id, transport!);
            streamTokens.set(id, tokens);
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
      if (!res.headersSent) res.status(401).json({ error: (err as Error).message });
    }
  });

  app.get("/mcp", async (req, res) => {
    try {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      const tokens = resolveStreamTokens(req, sessionId);
      const transport = sessionId ? streamSessions.get(sessionId) : undefined;
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

  app.delete("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (sessionId) {
      const transport = streamSessions.get(sessionId);
      if (transport) {
        await transport.close();
        streamSessions.delete(sessionId);
        streamTokens.delete(sessionId);
      }
    }
    res.status(204).send();
  });

  // ---------------------------------------------------------------------------
  // SSE transport (ChatGPT)
  // ---------------------------------------------------------------------------

  const sseSessions = new Map<string, SSEServerTransport>();
  const sseTokens = new Map<string, SessionTokens>();

  // GET /sse — ChatGPT connects here; receives the session endpoint URL and
  // then streams server→client messages over the open SSE connection.
  // Keepalive: sends an SSE comment every 30s to prevent Cloud Run and
  // intermediate proxies from closing the idle connection.
  app.get("/sse", async (req, res) => {
    try {
      const tokens = extractTokens(req);
      const transport = new SSEServerTransport("/messages", res);
      sseSessions.set(transport.sessionId, transport);
      sseTokens.set(transport.sessionId, tokens);

      const keepalive = setInterval(() => {
        if (!res.writableEnded) {
          res.write(": ping\n\n");
        } else {
          clearInterval(keepalive);
        }
      }, 30_000);

      transport.onclose = () => {
        clearInterval(keepalive);
        sseSessions.delete(transport.sessionId);
        sseTokens.delete(transport.sessionId);
      };

      const server = createServer();
      await server.connect(transport);
      // The SSE connection stays open until the client disconnects.
    } catch (err) {
      if (!res.headersSent) res.status(401).json({ error: (err as Error).message });
    }
  });

  // POST /messages — ChatGPT sends client→server messages here.
  app.post("/messages", async (req, res) => {
    try {
      const sessionId = req.query["sessionId"] as string | undefined;
      const transport = sessionId ? sseSessions.get(sessionId) : undefined;
      if (!transport) {
        res.status(404).json({ error: "SSE session not found." });
        return;
      }

      // Use cached token from the GET /sse handshake; update if header present.
      let tokens = sseTokens.get(sessionId!) ?? null;
      try {
        const fresh = extractTokens(req);
        sseTokens.set(sessionId!, fresh);
        tokens = fresh;
      } catch { /* no header — use cached */ }

      if (!tokens) {
        res.status(401).json({ error: "No token for this session." });
        return;
      }

      await runWithToken(tokens.token, tokens.refreshToken, () =>
        transport.handlePostMessage(req, res, req.body)
      );
    } catch (err) {
      if (!res.headersSent) res.status(500).json({ error: (err as Error).message });
    }
  });

  // ---------------------------------------------------------------------------
  // OAuth discovery + health
  // ---------------------------------------------------------------------------

  // OAuth 2.0 Authorization Server Metadata (RFC 8414)
  // Claude Code reads this to discover Hydra's auth/token endpoints and
  // initiate the PKCE flow automatically — no manual token copy-paste needed.
  app.get("/.well-known/oauth-authorization-server", (_req, res) => {
    const oauthBase = process.env.ARGO_OAUTH_BASE ?? "https://oauth.argo.games";
    res.json({
      issuer: oauthBase,
      authorization_endpoint: `${oauthBase}/oauth2/auth`,
      token_endpoint: `${oauthBase}/oauth2/token`,
      userinfo_endpoint: `${oauthBase}/userinfo`,
      jwks_uri: `${oauthBase}/.well-known/jwks.json`,
      // OIDC discovery — lets ChatGPT and other clients auto-discover OIDC support
      openid_configuration_url: `${oauthBase}/.well-known/openid-configuration`,
      scopes_supported: ["openid", "offline", "campaign.read", "campaign.write"],
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
      code_challenge_methods_supported: ["S256"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["RS256"],
    });
  });

  // ChatGPT domain verification (set OPENAI_CHALLENGE_TOKEN env var in Cloud Run)
  app.get("/.well-known/openai-apps-challenge", (_req, res) => {
    const token = process.env.OPENAI_CHALLENGE_TOKEN ?? "";
    if (!token) { res.status(404).send("Not configured"); return; }
    res.type("text/plain").send(token);
  });

  // Gemini CLI extension manifest (https://geminicli.com/docs/extensions/)
  // Install: gemini extensions install https://mcp.argo.games
  app.get("/.well-known/gemini-extension.json", (_req, res) => {
    const base = process.env.MCP_BASE_URL ?? "https://mcp.argo.games";
    res.json({
      name: "argo",
      version: "1.0.0",
      description:
        "Access your Argo campaigns from Gemini — read and write campaign lore, " +
        "characters, quests, and locations.",
      mcpServers: {
        argo: {
          httpUrl: `${base}/mcp`,
          headers: {
            Authorization: "Bearer ${ARGO_TOKEN}",
            "X-Refresh-Token": "${ARGO_REFRESH_TOKEN}",
          },
        },
      },
      settings: [
        {
          name: "Argo Access Token",
          description: "Get one at https://app.argo.games/oauth2/mcp-connect",
          envVar: "ARGO_TOKEN",
          sensitive: true,
        },
        {
          name: "Argo Refresh Token",
          description:
            "Optional — enables automatic renewal when the access token expires (~1 hour).",
          envVar: "ARGO_REFRESH_TOKEN",
          sensitive: true,
        },
      ],
    });
  });

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  const port = parseInt(process.env.PORT ?? "8080", 10);
  app.listen(port, () =>
    console.error(`Argo MCP HTTP server listening on port ${port} (Streamable HTTP + SSE)`)
  );
}
