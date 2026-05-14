import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  AuthRequiredError,
  AUTH_REQUIRED_MESSAGE,
  getRefreshToken,
  getToken,
  loadToken,
  _resetTokenStateForTests,
} from "./auth.js";
import { saveStoredTokens } from "./tokenStore.js";

let tempDir: string;
const ORIGINAL_OAUTH_TOKEN = process.env.OAUTH_TOKEN;
const ORIGINAL_REFRESH_TOKEN = process.env.REFRESH_TOKEN;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "argo-mcp-auth-test-"));
  process.env.ARGO_MCP_TOKEN_PATH = join(tempDir, "tokens.json");
  delete process.env.OAUTH_TOKEN;
  delete process.env.REFRESH_TOKEN;
  _resetTokenStateForTests();
});

afterEach(() => {
  delete process.env.ARGO_MCP_TOKEN_PATH;
  if (ORIGINAL_OAUTH_TOKEN !== undefined) process.env.OAUTH_TOKEN = ORIGINAL_OAUTH_TOKEN;
  if (ORIGINAL_REFRESH_TOKEN !== undefined) process.env.REFRESH_TOKEN = ORIGINAL_REFRESH_TOKEN;
  _resetTokenStateForTests();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("loadToken", () => {
  it("uses OAUTH_TOKEN from env when present", () => {
    process.env.OAUTH_TOKEN = "env-access";
    process.env.REFRESH_TOKEN = "env-refresh";
    loadToken();
    expect(getToken()).toBe("env-access");
    expect(getRefreshToken()).toBe("env-refresh");
  });

  it("env token wins over stored token", () => {
    saveStoredTokens({ access: "stored-access", refresh: "stored-refresh" });
    process.env.OAUTH_TOKEN = "env-access";
    loadToken();
    expect(getToken()).toBe("env-access");
    expect(getRefreshToken()).toBeNull();
  });

  it("falls back to stored tokens when env is unset", () => {
    saveStoredTokens({ access: "stored-access", refresh: "stored-refresh" });
    loadToken();
    expect(getToken()).toBe("stored-access");
    expect(getRefreshToken()).toBe("stored-refresh");
  });

  it("loads stored access token with null refresh", () => {
    saveStoredTokens({ access: "stored-access", refresh: null });
    loadToken();
    expect(getToken()).toBe("stored-access");
    expect(getRefreshToken()).toBeNull();
  });

  it("throws AuthRequiredError with onboarding message when no token available", () => {
    expect(() => loadToken()).toThrow(AuthRequiredError);
    try {
      loadToken();
    } catch (err) {
      expect(err).toBeInstanceOf(AuthRequiredError);
      expect((err as Error).message).toBe(AUTH_REQUIRED_MESSAGE);
      expect((err as Error).message).toContain("argo-mcp auth login");
      expect((err as Error).message).toContain("https://mcp.argo.games/mcp");
    }
  });
});
