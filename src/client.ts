/**
 * Typed fetch wrapper for the Argo WebAPI.
 *
 * All requests carry the OAuth2 Bearer token so Oathkeeper can inject
 * X-Grant-ID into the forwarded request for WebAPI authorization checks.
 */

import { getToken } from "./auth.js";

// Tool functions pass full paths starting with `/mcp/v1/...` (or `/api/v1/...`
// if calling user-session endpoints), so the base must NOT include a path prefix.
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

/**
 * Perform an authenticated request to the Argo WebAPI.
 */
export async function argoFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const token = getToken();

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(options.headers as Record<string, string> | undefined),
  };

  const response = await fetch(url, { ...options, headers });

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
