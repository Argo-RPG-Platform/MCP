/**
 * Bearer-token validation at the MCP edge (Phase 3.7).
 *
 * The MCP service is a resource server in OAuth2 terms; it forwards bearer
 * tokens to the WebAPI which performs the real Keto / grant_map authorization.
 * This module adds defense-in-depth: validate the token's signature and core
 * claims (iss, aud, exp, nbf) against Hydra's published JWKS before forwarding,
 * so malformed or expired tokens never reach WebAPI.
 *
 * Configurable via env vars:
 *   HYDRA_ISSUER          — expected `iss` claim (default https://oauth.argo.games)
 *   MCP_AUDIENCE          — expected `aud` claim (default https://mcp.argo.games)
 *   HYDRA_JWKS_URL        — JWKS endpoint (default `${HYDRA_ISSUER}/.well-known/jwks.json`)
 *   SKIP_JWT_VALIDATION   — set to "true" to bypass (used for the stdio CLI flow
 *                            where users paste tokens directly and we don't need
 *                            edge validation).
 */

import { createRemoteJWKSet, jwtVerify, errors as joseErrors, type JWTPayload } from "jose";

export class JwtValidationError extends Error {
  constructor(public readonly description: string) {
    super(description);
    this.name = "JwtValidationError";
  }
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks(): ReturnType<typeof createRemoteJWKSet> {
  if (jwks) return jwks;
  const issuer = process.env.HYDRA_ISSUER ?? "https://oauth.argo.games";
  const jwksUrl =
    process.env.HYDRA_JWKS_URL ?? `${issuer}/.well-known/jwks.json`;
  // jose's createRemoteJWKSet caches keys in-memory and refreshes on cache
  // miss / kid rotation. Cooldown prevents tight loops on a misbehaving IdP.
  jwks = createRemoteJWKSet(new URL(jwksUrl), {
    cooldownDuration: 30_000,
    cacheMaxAge: 600_000,
  });
  return jwks;
}

export function isJwtValidationEnabled(): boolean {
  return process.env.SKIP_JWT_VALIDATION !== "true";
}

/**
 * Verify a bearer token. Throws JwtValidationError on any failure with a
 * short description suitable for the WWW-Authenticate `error_description`.
 */
export async function validateBearer(token: string): Promise<JWTPayload> {
  const issuer = process.env.HYDRA_ISSUER ?? "https://oauth.argo.games";
  const audience = process.env.MCP_AUDIENCE ?? "https://mcp.argo.games";

  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      issuer,
      audience,
      algorithms: ["RS256"],
      // jose enforces exp and nbf automatically when present.
      clockTolerance: 30,
    });
    return payload;
  } catch (err) {
    if (err instanceof joseErrors.JWTExpired) {
      throw new JwtValidationError("token expired");
    }
    if (err instanceof joseErrors.JWTClaimValidationFailed) {
      throw new JwtValidationError(`invalid claim: ${err.claim}`);
    }
    if (err instanceof joseErrors.JWSSignatureVerificationFailed) {
      throw new JwtValidationError("signature verification failed");
    }
    if (err instanceof joseErrors.JWSInvalid || err instanceof joseErrors.JWTInvalid) {
      throw new JwtValidationError("malformed token");
    }
    throw new JwtValidationError("token rejected");
  }
}

// Test helper — clears the cached JWKS so the next call re-reads env vars.
export function _resetJwksForTests(): void {
  jwks = null;
}
