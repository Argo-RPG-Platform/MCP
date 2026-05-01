/**
 * Token management for the Argo MCP server.
 *
 * The access token is obtained externally via the Argo Hydra OAuth2 consent
 * flow (the user authorizes the MCP from the Argo WebApp). The token is then
 * supplied to this server via the OAUTH_TOKEN environment variable.
 *
 * The optional REFRESH_TOKEN environment variable enables automatic token
 * renewal: when the access token expires (401), the server calls the Argo
 * refresh endpoint and retries the request once.
 *
 * Security notes:
 *  - Tokens are never stored to disk by this server.
 *  - The token subject is a grantId (not a userId); Oathkeeper injects it as
 *    X-Grant-Map so WebAPI can authorize the requested campaign.
 */

let _token: string | null = null;
let _refreshToken: string | null = null;

/**
 * Load tokens from environment variables.
 * OAUTH_TOKEN is required; REFRESH_TOKEN is optional.
 * Call this once at startup.
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
 * Returns the current access token.
 * Throws if the token has not been loaded.
 */
export function getToken(): string {
  if (!_token) {
    throw new Error("Token not loaded. Call loadToken() first.");
  }
  return _token;
}

/**
 * Returns the refresh token, or null if none was configured.
 */
export function getRefreshToken(): string | null {
  return _refreshToken;
}

/**
 * Updates the in-memory access token (and optionally the refresh token) after
 * a successful token refresh. Called by the retry logic in client.ts.
 */
export function setToken(newAccessToken: string, newRefreshToken?: string): void {
  _token = newAccessToken;
  if (newRefreshToken) {
    _refreshToken = newRefreshToken;
  }
}
