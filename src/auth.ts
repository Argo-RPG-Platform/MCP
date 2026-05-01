/**
 * Token management for the Argo MCP server.
 *
 * Two modes:
 *
 *  stdio  — one user, one token for the lifetime of the process. The token is
 *            loaded from OAUTH_TOKEN / REFRESH_TOKEN env vars at startup via
 *            loadToken(). getToken() reads the global.
 *
 *  HTTP   — many concurrent users, each request carries its own token in the
 *            Authorization header. runWithToken() stores it in AsyncLocalStorage
 *            so getToken() / getRefreshToken() / setToken() are automatically
 *            scoped to the current request's async call chain with no changes
 *            needed in the tool files.
 */

import { AsyncLocalStorage } from "node:async_hooks";

interface TokenCtx {
  token: string;
  refreshToken: string | null;
}

const _httpCtx = new AsyncLocalStorage<TokenCtx>();

// stdio-mode globals
let _token: string | null = null;
let _refreshToken: string | null = null;

/**
 * Load tokens from environment variables (stdio mode only).
 * OAUTH_TOKEN is required; REFRESH_TOKEN is optional.
 */
export function loadToken(): void {
  const token = process.env.OAUTH_TOKEN;
  if (!token) {
    throw new Error(
      "OAUTH_TOKEN environment variable is not set. " +
        "Obtain a token via the Argo OAuth2 consent flow and set it before starting."
    );
  }
  _token = token;
  _refreshToken = process.env.REFRESH_TOKEN ?? null;
}

/**
 * Run fn with a per-request token context (HTTP mode).
 * All async calls within fn — including tool handlers — see this token.
 */
export function runWithToken<T>(
  token: string,
  refreshToken: string | null,
  fn: () => T
): T {
  return _httpCtx.run({ token, refreshToken }, fn);
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
}
