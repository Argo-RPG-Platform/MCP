import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { generateKeyPair, SignJWT, exportJWK, type KeyObject } from "jose";

import { _resetJwksForTests, isJwtValidationEnabled, JwtValidationError, validateBearer } from "./jwt.js";

let privateKey: KeyObject | Uint8Array | unknown;
let publicJwk: { kid: string; [k: string]: unknown };

const ISSUER = "https://test-hydra.example";
const AUDIENCE = "https://test-mcp.example";

async function makeToken(claims: Record<string, unknown> = {}, opts?: { expSec?: number; nbfSec?: number }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const jwt = new SignJWT({ scope: "campaign.read", ...claims })
    .setProtectedHeader({ alg: "RS256", kid: publicJwk.kid })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(opts?.expSec ?? now + 600);
  if (opts?.nbfSec !== undefined) jwt.setNotBefore(opts.nbfSec);
  return jwt.sign(privateKey as Parameters<typeof jwt.sign>[0]);
}

beforeAll(async () => {
  const kp = await generateKeyPair("RS256", { extractable: true });
  privateKey = kp.privateKey;
  const jwk = await exportJWK(kp.publicKey);
  publicJwk = { ...jwk, kid: "test-kid", alg: "RS256", use: "sig" };

  // Stub the global fetch so jose's createRemoteJWKSet picks up our JWK.
  vi.stubGlobal("fetch", vi.fn(async (input: unknown) => {
    const url = input instanceof URL ? input.toString() : String(input);
    if (url.endsWith("/.well-known/jwks.json")) {
      return new Response(JSON.stringify({ keys: [publicJwk] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("not found", { status: 404 });
  }));
});

beforeEach(() => {
  process.env.HYDRA_ISSUER = ISSUER;
  process.env.MCP_AUDIENCE = AUDIENCE;
  delete process.env.SKIP_JWT_VALIDATION;
  _resetJwksForTests();
});

afterEach(() => {
  delete process.env.MCP_AUDIENCE;
  vi.restoreAllMocks();
});

describe("validateBearer", () => {
  it("accepts a well-formed token", async () => {
    const token = await makeToken();
    const payload = await validateBearer(token);
    expect(payload.iss).toBe(ISSUER);
    expect(payload.aud).toBe(AUDIENCE);
  });

  it("rejects an expired token", async () => {
    const token = await makeToken({}, { expSec: Math.floor(Date.now() / 1000) - 3600 });
    await expect(validateBearer(token)).rejects.toBeInstanceOf(JwtValidationError);
    await expect(validateBearer(token)).rejects.toMatchObject({ description: "token expired" });
  });

  it("rejects a token with wrong audience when MCP_AUDIENCE is set", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "RS256", kid: publicJwk.kid })
      .setIssuer(ISSUER)
      .setAudience("https://wrong-audience.example")
      .setIssuedAt(now)
      .setExpirationTime(now + 600)
      .sign(privateKey as Parameters<SignJWT["sign"]>[0]);
    await expect(validateBearer(token)).rejects.toMatchObject({
      description: expect.stringContaining("aud"),
    });
  });

  it("accepts a token with no audience when MCP_AUDIENCE is unset", async () => {
    delete process.env.MCP_AUDIENCE;
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({ scope: "campaign.read" })
      .setProtectedHeader({ alg: "RS256", kid: publicJwk.kid })
      .setIssuer(ISSUER)
      .setIssuedAt(now)
      .setExpirationTime(now + 600)
      .sign(privateKey as Parameters<SignJWT["sign"]>[0]);
    const payload = await validateBearer(token);
    expect(payload.iss).toBe(ISSUER);
    expect(payload.aud).toBeUndefined();
  });

  it("accepts any audience when MCP_AUDIENCE is unset", async () => {
    delete process.env.MCP_AUDIENCE;
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "RS256", kid: publicJwk.kid })
      .setIssuer(ISSUER)
      .setAudience("https://anything.example")
      .setIssuedAt(now)
      .setExpirationTime(now + 600)
      .sign(privateKey as Parameters<SignJWT["sign"]>[0]);
    const payload = await validateBearer(token);
    expect(payload.aud).toBe("https://anything.example");
  });

  it("rejects a token with wrong issuer", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "RS256", kid: publicJwk.kid })
      .setIssuer("https://wrong-issuer.example")
      .setAudience(AUDIENCE)
      .setIssuedAt(now)
      .setExpirationTime(now + 600)
      .sign(privateKey as Parameters<SignJWT["sign"]>[0]);
    await expect(validateBearer(token)).rejects.toMatchObject({
      description: expect.stringContaining("iss"),
    });
  });

  it("rejects a token not yet valid", async () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    const token = await makeToken({}, { nbfSec: future, expSec: future + 600 });
    await expect(validateBearer(token)).rejects.toBeInstanceOf(JwtValidationError);
  });

  it("rejects a malformed token", async () => {
    await expect(validateBearer("not.a.jwt")).rejects.toMatchObject({
      description: "malformed token",
    });
  });
});

describe("isJwtValidationEnabled", () => {
  it("defaults to true", () => {
    delete process.env.SKIP_JWT_VALIDATION;
    expect(isJwtValidationEnabled()).toBe(true);
  });
  it("returns false when SKIP_JWT_VALIDATION=true", () => {
    process.env.SKIP_JWT_VALIDATION = "true";
    expect(isJwtValidationEnabled()).toBe(false);
  });
});
