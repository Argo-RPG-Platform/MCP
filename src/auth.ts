/**
 * Token management for the Argo MCP server.
 *
 * Two modes:
 *
 *  stdio  — one user, one token for the lifetime of the process. The token is
 *            resolved at startup via loadToken() from (1) OAUTH_TOKEN env or
 *            (2) the local token store written by `argo-mcp auth login`.
 *            getToken() reads the global.
 *
 *  HTTP   — many concurrent users, each request carries its own token in the
 *            Authorization header. runWithToken() stores it in AsyncLocalStorage
 *            so getToken() / getRefreshToken() / setToken() are automatically
 *            scoped to the current request's async call chain with no changes
 *            needed in the tool files.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { loadStoredTokens, saveStoredTokens } from "./tokenStore.js";

export interface TokenCtx {
  token: string;
  refreshToken: string | null;
}

const _httpCtx = new AsyncLocalStorage<TokenCtx>();

// stdio-mode globals
let _token: string | null = null;
let _refreshToken: string | null = null;
// Whether the stdio tokens came from the local token store (vs env vars).
// Refreshed tokens are persisted back only in that case — env-supplied tokens
// are the caller's responsibility.
let _fromStore = false;

export const AUTH_REQUIRED_MESSAGE =
  "Argo MCP is not signed in.\n" +
  "\n" +
  "For local MCP clients:\n" +
  "  Run this once in a terminal:\n" +
  "    npx -y argo-mcp auth login\n" +
  "  Then restart your MCP client.\n" +
  "\n" +
  "For ChatGPT:\n" +
  "  Do not use the local npx package.\n" +
  "  Add the remote MCP endpoint instead:\n" +
  "    https://mcp.argo.games/mcp\n" +
  "\n" +
  "Advanced:\n" +
  "  Set OAUTH_TOKEN (and optional REFRESH_TOKEN) environment variables.";

export class AuthRequiredError extends Error {
  constructor(message: string = AUTH_REQUIRED_MESSAGE) {
    super(message);
    this.name = "AuthRequiredError";
  }
}

/**
 * Load tokens for stdio mode. Resolution order:
 *   1. OAUTH_TOKEN env var (+ optional REFRESH_TOKEN)
 *   2. Locally stored tokens from `argo-mcp auth login`
 *   3. Throw AuthRequiredError with onboarding instructions
 */
export function loadToken(): void {
  const envToken = process.env.OAUTH_TOKEN;
  if (envToken) {
    _token = envToken;
    _refreshToken = process.env.REFRESH_TOKEN ?? null;
    _fromStore = false;
    return;
  }

  const stored = loadStoredTokens();
  if (stored) {
    _token = stored.access;
    _refreshToken = stored.refresh;
    _fromStore = true;
    return;
  }

  throw new AuthRequiredError();
}

/**
 * Test/internal helper — reset the stdio-mode globals.
 */
export function _resetTokenStateForTests(): void {
  _token = null;
  _refreshToken = null;
  _fromStore = false;
}

/**
 * Run fn with a per-request token context (HTTP mode).
 * All async calls within fn — including tool handlers — see this token.
 *
 * The ctx object is stored (not copied), so a mid-request token refresh via
 * setToken() writes through to whatever the caller keeps a reference to —
 * in practice the per-session token cache in http.ts. Without that
 * write-through, a rotated (single-use) refresh token would be consumed on
 * the first 401 and every later request in the session would retry the
 * refresh with the already-spent token and fail.
 */
export function runWithToken<T>(ctx: TokenCtx, fn: () => T): T {
  return _httpCtx.run(ctx, fn);
}

/**
 * Returns the current access token.
 * In HTTP mode reads from AsyncLocalStorage; in stdio mode reads the global.
 */
export function getToken(): string {
  const ctx = _httpCtx.getStore();
  if (ctx) return ctx.token;
  if (_token) return _token;
  throw new Error("Token not loaded. Call loadToken() first.");
}

/**
 * Returns the current refresh token, or null if not configured.
 */
export function getRefreshToken(): string | null {
  const ctx = _httpCtx.getStore();
  if (ctx) return ctx.refreshToken;
  return _refreshToken;
}

/**
 * Updates the in-memory token after a successful refresh.
 * In HTTP mode updates the request-scoped context; in stdio mode updates the global.
 */
export function setToken(newAccessToken: string, newRefreshToken?: string): void {
  const ctx = _httpCtx.getStore();
  if (ctx) {
    ctx.token = newAccessToken;
    if (newRefreshToken) ctx.refreshToken = newRefreshToken;
    return;
  }
  _token = newAccessToken;
  if (newRefreshToken) _refreshToken = newRefreshToken;
  // Persist rotated tokens so the next process start doesn't retry the
  // refresh with an already-consumed refresh token. Env-supplied tokens are
  // never written to disk.
  if (_fromStore) {
    try {
      saveStoredTokens({ access: _token, refresh: _refreshToken });
    } catch {
      // Best-effort — a read-only config dir must not break the live session.
    }
  }
}
