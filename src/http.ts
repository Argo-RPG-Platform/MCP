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
import { isJwtValidationEnabled, JwtValidationError, validateBearer } from "./jwt.js";

interface SessionTokens {
  token: string;
  refreshToken: string | null;
}

class AuthRequiredError extends Error {
  constructor(message: string = "authorization_required") {
    super(message);
    this.name = "AuthRequiredError";
  }
}

// JSON-RPC methods that are part of MCP capability discovery and run without
// auth. Per MCP + RFC 9728 spec guidance: a client must be able to enumerate
// tools (each carrying its own securitySchemes descriptor) before deciding
// which scopes to request.
const PUBLIC_METHODS = new Set<string>([
  "initialize",
  "notifications/initialized",
  "tools/list",
]);

function rpcMethods(body: unknown): string[] {
  if (Array.isArray(body)) {
    return body
      .map((b) => (b && typeof (b as { method?: unknown }).method === "string"
        ? (b as { method: string }).method
        : null))
      .filter((m): m is string => m !== null);
  }
  if (body && typeof body === "object" && typeof (body as { method?: unknown }).method === "string") {
    return [(body as { method: string }).method];
  }
  return [];
}

function isPublicRpc(body: unknown): boolean {
  const methods = rpcMethods(body);
  if (methods.length === 0) return false;
  return methods.every((m) => PUBLIC_METHODS.has(m));
}

function tryExtractTokens(req: express.Request): SessionTokens | null {
  const auth = (req.headers["authorization"] ?? "") as string;
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  const refreshToken = (req.headers["x-refresh-token"] as string | undefined) ?? null;
  return { token, refreshToken };
}

/**
 * Diagnostic logger gated by MCP_DEBUG_AUTH=true. Logs:
 *   - User-Agent, path, method
 *   - Whether Authorization header is present + length + first/last 6 chars
 *   - mcp-session-id presence
 *   - JSON-RPC method (if body is a single RPC call)
 *
 * Token VALUE is never logged in full — only the prefix/suffix to confirm
 * "something tokenish arrived" without leaking the bearer.
 */
function debugAuth(tag: string, req: express.Request, body?: unknown): void {
  if (process.env.MCP_DEBUG_AUTH !== "true") return;
  const auth = (req.headers["authorization"] ?? "") as string;
  const ua = req.headers["user-agent"] ?? "";
  const sid = req.headers["mcp-session-id"] ?? "(none)";
  const method =
    body && typeof body === "object" && typeof (body as { method?: unknown }).method === "string"
      ? (body as { method: string }).method
      : "(no-rpc-method)";
  const tokenInfo = auth.startsWith("Bearer ")
    ? `Bearer len=${auth.length - 7} head='${auth.slice(7, 13)}…' tail='…${auth.slice(-6)}'`
    : auth
      ? `non-bearer scheme: '${auth.slice(0, 12)}…'`
      : "(no auth header)";
  console.log(
    `[debug-auth] tag=${tag} method=${req.method} path=${req.path} ua='${ua}' sid=${sid} rpc=${method} auth=${tokenInfo}`
  );
}

/**
 * Validate the bearer token (Phase 3.7 — defense in depth).
 *
 * Verifies signature against Hydra's JWKS plus iss/aud/exp/nbf claims, so
 * malformed or expired tokens never reach WebAPI. WebAPI is still
 * authoritative for scope / Keto / grant_map decisions; this just rejects
 * obviously-bad tokens early.
 *
 * No-ops when SKIP_JWT_VALIDATION=true (used by the stdio CLI flow where
 * users paste tokens manually).
 */
async function ensureValidToken(t: SessionTokens | null): Promise<void> {
  if (!t) return;
  if (!isJwtValidationEnabled()) return;
  try {
    await validateBearer(t.token);
  } catch (err) {
    if (process.env.MCP_DEBUG_AUTH === "true" && err instanceof JwtValidationError) {
      console.log(`[debug-auth] JWT validation failed: ${err.description}`);
    }
    throw err;
  }
}

// RFC 6750 / RFC 9728 standards-compliant 401 challenge.
function sendAuthChallenge(
  res: express.Response,
  scope: string = "campaign.read",
  errorDescription?: string
): void {
  if (res.headersSent) return;
  const base = process.env.MCP_BASE_URL ?? "https://mcp.argo.games";
  const parts = [
    `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"`,
    `scope="${scope}"`,
  ];
  if (errorDescription) {
    parts.push(`error="invalid_token"`);
    parts.push(`error_description="${errorDescription.replace(/"/g, "'")}"`);
  }
  res.setHeader("WWW-Authenticate", parts.join(", "));
  res.status(401).json({ error: "authorization_required" });
}

export async function startHttpServer(): Promise<void> {
  const app = express();
  app.use(express.json());

  // ---------------------------------------------------------------------------
  // Streamable HTTP transport (Claude Code, Codex)
  // ---------------------------------------------------------------------------

  const streamSessions = new Map<string, StreamableHTTPServerTransport>();
  const streamTokens = new Map<string, SessionTokens>();

  /**
   * Resolve tokens for a Streamable HTTP request.
   *
   * Returns null when the call is a public-discovery RPC (initialize,
   * notifications/initialized, tools/list) AND no Authorization header was
   * supplied — those execute unauthenticated so MCP scanners can read the
   * tool catalog before the user has consented.
   *
   * For any other method, a missing/invalid token is signalled by throwing
   * an AuthRequiredError so the caller can emit a WWW-Authenticate challenge.
   */
  function resolveStreamTokens(
    req: express.Request,
    sessionId: string | undefined,
    body: unknown
  ): SessionTokens | null {
    const fresh = tryExtractTokens(req);
    if (fresh) {
      if (sessionId) streamTokens.set(sessionId, fresh);
      return fresh;
    }
    const cached = sessionId ? streamTokens.get(sessionId) ?? null : null;
    if (cached) return cached;
    if (isPublicRpc(body)) return null;
    throw new AuthRequiredError();
  }

  const handleStreamPost: express.RequestHandler = async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    debugAuth("stream-post", req, req.body);
    let tokens: SessionTokens | null;
    try {
      tokens = resolveStreamTokens(req, sessionId, req.body);
    } catch (err) {
      if (err instanceof AuthRequiredError) return sendAuthChallenge(res);
      if (!res.headersSent) res.status(400).json({ error: (err as Error).message });
      return;
    }

    try {
      await ensureValidToken(tokens);
    } catch (err) {
      if (err instanceof JwtValidationError) {
        // Drop a cached invalid token so the next request can re-auth cleanly.
        if (sessionId) streamTokens.delete(sessionId);
        return sendAuthChallenge(res, "campaign.read", err.description);
      }
      throw err;
    }

    try {
      let transport = sessionId ? streamSessions.get(sessionId) : undefined;
      if (!transport) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (id: string) => {
            streamSessions.set(id, transport!);
            if (tokens) streamTokens.set(id, tokens);
          },
        });
        const server = createServer();
        await server.connect(transport);
      }

      const t = transport;
      const handle = () => t.handleRequest(req, res, req.body);
      if (tokens) {
        await runWithToken(tokens.token, tokens.refreshToken, handle);
      } else {
        await handle();
      }
    } catch (err) {
      if (!res.headersSent) res.status(500).json({ error: (err as Error).message });
    }
  };

  const handleStreamGet: express.RequestHandler = async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    const transport = sessionId ? streamSessions.get(sessionId) : undefined;
    if (!transport) {
      res.status(404).json({ error: "Session not found. Send a POST request first." });
      return;
    }
    // Resume a previously established session — re-use whatever token was
    // cached when the session was opened (may be null if the session was
    // started by an unauthenticated discovery call).
    const tokens = (sessionId && streamTokens.get(sessionId)) || tryExtractTokens(req);
    try {
      await ensureValidToken(tokens);
    } catch (err) {
      if (err instanceof JwtValidationError) {
        if (sessionId) streamTokens.delete(sessionId);
        return sendAuthChallenge(res, "campaign.read", err.description);
      }
      throw err;
    }
    try {
      const handle = () => transport.handleRequest(req, res);
      if (tokens) {
        await runWithToken(tokens.token, tokens.refreshToken, handle);
      } else {
        await handle();
      }
    } catch (err) {
      if (!res.headersSent) res.status(500).json({ error: (err as Error).message });
    }
  };

  const handleStreamDelete: express.RequestHandler = async (req, res) => {
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
  };

  // Streamable HTTP routes. Mirrored at "/" because Claude Desktop posts to
  // the root when the connector URL has no path component.
  app.post("/mcp", handleStreamPost);
  app.get("/mcp", handleStreamGet);
  app.delete("/mcp", handleStreamDelete);
  app.post("/", handleStreamPost);
  app.get("/", handleStreamGet);
  app.delete("/", handleStreamDelete);

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
      // Auth is optional at handshake — the per-message handler below enforces
      // it for non-public RPC methods. ChatGPT often opens /sse before the
      // user has consented, just to do tool discovery.
      const tokens = tryExtractTokens(req);
      const transport = new SSEServerTransport("/messages", res);
      sseSessions.set(transport.sessionId, transport);
      if (tokens) sseTokens.set(transport.sessionId, tokens);

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
      debugAuth("sse-messages", req, req.body);
      const sessionId = req.query["sessionId"] as string | undefined;
      const transport = sessionId ? sseSessions.get(sessionId) : undefined;
      if (!transport) {
        res.status(404).json({ error: "SSE session not found." });
        return;
      }

      // Use cached token from the GET /sse handshake; update if header present.
      const fresh = tryExtractTokens(req);
      if (fresh) sseTokens.set(sessionId!, fresh);
      const tokens = fresh ?? sseTokens.get(sessionId!) ?? null;

      if (!tokens && !isPublicRpc(req.body)) {
        return sendAuthChallenge(res);
      }

      try {
        await ensureValidToken(tokens);
      } catch (err) {
        if (err instanceof JwtValidationError) {
          sseTokens.delete(sessionId!);
          return sendAuthChallenge(res, "campaign.read", err.description);
        }
        throw err;
      }

      const handle = () => transport.handlePostMessage(req, res, req.body);
      if (tokens) {
        await runWithToken(tokens.token, tokens.refreshToken, handle);
      } else {
        await handle();
      }
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
      // RFC 7591 dynamic client registration. ChatGPT (and any other MCP host
      // using DCR) hits this endpoint per-user and gets a fresh PKCE client.
      registration_endpoint: `${process.env.MCP_BASE_URL ?? "https://mcp.argo.games"}/oauth/register`,
      scopes_supported: ["openid", "offline_access", "campaign.read", "campaign.write"],
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
      code_challenge_methods_supported: ["S256"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["RS256"],
    });
  });

  // RFC 7591 Dynamic Client Registration — proxies to WebAPI which calls
  // Hydra's admin /clients endpoint. ChatGPT requires a real DCR flow
  // (no fixed client_id); WebAPI applies all the safety constraints
  // (HTTPS-only redirects, scope allowlist, IP rate limit, public client only).
  app.post("/oauth/register", async (req, res) => {
    // app.argo.games is the WebApp SPA host — Oathkeeper's /api-public/*
    // forward rule is keyed to api.argo.games, so DCR must hit that host.
    const webapiBase = process.env.WEBAPI_BASE ?? "https://api.argo.games";
    const oauthBase = process.env.ARGO_OAUTH_BASE ?? "https://oauth.argo.games";
    try {
      const upstream = await fetch(`${webapiBase}/api-public/hydra/dcr`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Forward client IP so WebAPI's per-IP rate limiter sees the real
          // caller, not the MCP service's egress address.
          "X-Forwarded-For":
            (req.headers["x-forwarded-for"] as string | undefined) ??
            req.socket.remoteAddress ??
            "",
        },
        body: JSON.stringify(req.body ?? {}),
      });
      const payload = (await upstream.json().catch(() => ({}))) as Record<string, unknown>;
      if (!upstream.ok) {
        res.status(upstream.status).json(payload);
        return;
      }
      // Augment the RFC 7591 response with the AS endpoints so naive clients
      // that don't fetch /.well-known/oauth-authorization-server still work.
      res.status(201).json({
        ...payload,
        authorization_endpoint: `${oauthBase}/oauth2/auth`,
        token_endpoint: `${oauthBase}/oauth2/token`,
      });
    } catch (err) {
      console.error("DCR proxy failed:", err);
      res.status(502).json({
        error: "registration_failed",
        error_description: "MCP could not reach the registration endpoint.",
      });
    }
  });

  // OIDC Discovery — proxies Hydra's openid-configuration so ChatGPT (and other
  // clients that scan the MCP server's domain) can auto-discover OIDC support.
  app.get("/.well-known/openid-configuration", (_req, res) => {
    const oauthBase = process.env.ARGO_OAUTH_BASE ?? "https://oauth.argo.games";
    res.redirect(301, `${oauthBase}/.well-known/openid-configuration`);
  });

  // OAuth 2.0 Protected Resource Metadata (RFC 9728).
  // Lets MCP clients (Claude, ChatGPT) discover which authorization server
  // protects this resource and what scopes are valid.
  app.get("/.well-known/oauth-protected-resource", (_req, res) => {
    const oauthBase = process.env.ARGO_OAUTH_BASE ?? "https://oauth.argo.games";
    const base = process.env.MCP_BASE_URL ?? "https://mcp.argo.games";
    // Advertise the MCP host as the authorization server so DCR-capable
    // clients (ChatGPT) fetch our /.well-known/oauth-authorization-server,
    // which republishes Hydra's auth/token endpoints AND adds our
    // registration_endpoint. Hydra's own metadata has no DCR endpoint by
    // design, so pointing clients directly at oauth.argo.games breaks DCR.
    // The `issuer` inside our AS metadata still says oauth.argo.games, so
    // JWT validation against tokens minted by Hydra is unaffected.
    res.json({
      resource: base,
      authorization_servers: [base],
      scopes_supported: ["openid", "offline_access", "campaign.read", "campaign.write"],
      bearer_methods_supported: ["header"],
      resource_documentation: "https://app.argo.games/docs/mcp",
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
