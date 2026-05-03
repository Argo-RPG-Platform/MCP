/**
 * Typed fetch wrapper for the Argo WebAPI.
 *
 * All requests carry the OAuth2 Bearer token so Oathkeeper can inject
 * X-Grant-Map into the forwarded request for WebAPI authorization checks.
 *
 * On a 401 response, the client automatically attempts one token refresh via
 * the Argo refresh endpoint (REFRESH_TOKEN env var) and retries the original
 * request. If no refresh token is configured, the 401 surfaces as an
 * actionable error message.
 */

import { getToken, getRefreshToken, setToken } from "./auth.js";

const API_BASE = process.env.ARGO_API_BASE ?? "https://api.argo.games";

export class ArgoApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    message: string
  ) {
    super(message);
    this.name = "ArgoApiError";
  }
}

interface RefreshResponse {
  accessToken: string;
  refreshToken?: string;
}

/**
 * Attempt to refresh the access token using the stored refresh token.
 * Returns true if the refresh succeeded and new tokens have been stored.
 */
async function tryRefreshToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    const response = await fetch(`${API_BASE}/api-public/hydra/mcp/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!response.ok) return false;
    const data = (await response.json()) as RefreshResponse;
    setToken(data.accessToken, data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

function buildHeaders(token: string, hasBody: boolean, extra?: Record<string, string>): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    ...(hasBody ? { "Content-Type": "application/json" } : {}),
    ...extra,
  };
}

/**
 * Perform an authenticated request to the Argo WebAPI.
 * Retries once after a successful token refresh on 401.
 */
export async function argoFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const hasBody = !!options.body;

  const response = await fetch(url, {
    ...options,
    headers: buildHeaders(getToken(), hasBody, options.headers as Record<string, string> | undefined),
  });

  if (response.status === 401) {
    const refreshed = await tryRefreshToken();
    if (!refreshed) {
      throw new ArgoApiError(
        401,
        "",
        "Token expired — re-consent at https://app.argo.games/oauth2/mcp-connect"
      );
    }
    const retry = await fetch(url, {
      ...options,
      headers: buildHeaders(getToken(), hasBody, options.headers as Record<string, string> | undefined),
    });
    if (!retry.ok) {
      const body = await retry.text().catch(() => "");
      throw new ArgoApiError(retry.status, body, `Argo API error ${retry.status} at ${path}: ${body}`);
    }
    if (retry.status === 204) return undefined as T;
    return retry.json() as Promise<T>;
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new ArgoApiError(
      response.status,
      body,
      `Argo API error ${response.status} at ${path}: ${body}`
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function argoGet<T>(path: string): Promise<T> {
  return argoFetch<T>(path);
}

export async function argoPost<TRes, TBody>(
  path: string,
  body: TBody
): Promise<TRes> {
  return argoFetch<TRes>(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function argoPatch<TRes, TBody>(
  path: string,
  body: TBody
): Promise<TRes> {
  return argoFetch<TRes>(path, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function argoDelete<TRes = void>(path: string): Promise<TRes> {
  return argoFetch<TRes>(path, { method: "DELETE" });
}
