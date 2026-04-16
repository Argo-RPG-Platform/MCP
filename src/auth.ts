/**
 * Token management for the Argo MCP server.
 *
 * The access token is obtained externally via the Argo Hydra OAuth2 consent
 * flow (the user authorizes the MCP from the Argo WebApp). The token is then
 * supplied to this server via the OAUTH_TOKEN environment variable.
 *
 * Security notes:
 *  - Tokens are never stored to disk by this server.
 *  - The token subject is a grantId (not a userId); Oathkeeper injects it as
 *    X-Grant-ID so WebAPI can distinguish MCP requests from user requests.
 *  - Refresh tokens should be handled by the OAuth2 client that obtained the
 *    original token — not by this MCP server.
 */

let _token: string | null = null;

/**
 * Load the OAuth token from the OAUTH_TOKEN environment variable.
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
