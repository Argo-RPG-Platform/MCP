import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, existsSync, mkdirSync, readFileSync, statSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  clearStoredTokens,
  getTokenPath,
  loadStoredTokens,
  saveStoredTokens,
} from "./tokenStore.js";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "argo-mcp-test-"));
  process.env.ARGO_MCP_TOKEN_PATH = join(tempDir, "tokens.json");
});

afterEach(() => {
  delete process.env.ARGO_MCP_TOKEN_PATH;
  rmSync(tempDir, { recursive: true, force: true });
});

describe("tokenStore", () => {
  it("returns null when no token file exists", () => {
    expect(loadStoredTokens()).toBeNull();
  });

  it("saves and loads tokens round-trip", () => {
    saveStoredTokens({ access: "a-token", refresh: "r-token", expiresAt: 1234 });
    const loaded = loadStoredTokens();
    expect(loaded).toEqual({ access: "a-token", refresh: "r-token", expiresAt: 1234 });
  });

  it("treats missing refresh as null", () => {
    saveStoredTokens({ access: "a-token", refresh: null });
    expect(loadStoredTokens()).toEqual({ access: "a-token", refresh: null, expiresAt: null });
  });

  it("clearStoredTokens removes the file and reports true; second call returns false", () => {
    saveStoredTokens({ access: "a", refresh: null });
    expect(existsSync(getTokenPath())).toBe(true);
    expect(clearStoredTokens()).toBe(true);
    expect(existsSync(getTokenPath())).toBe(false);
    expect(clearStoredTokens()).toBe(false);
  });

  it("returns null on malformed JSON", () => {
    saveStoredTokens({ access: "a", refresh: null });
    writeFileSync(getTokenPath(), "{not json", "utf8");
    expect(loadStoredTokens()).toBeNull();
  });

  it("returns null when JSON lacks access field", () => {
    mkdirSync(tempDir, { recursive: true });
    writeFileSync(getTokenPath(), JSON.stringify({ refresh: "r" }), "utf8");
    expect(loadStoredTokens()).toBeNull();
  });

  it("writes the file with mode 0600 on POSIX", () => {
    if (process.platform === "win32") return; // Windows ignores POSIX mode
    saveStoredTokens({ access: "a", refresh: null });
    const mode = statSync(getTokenPath()).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("ARGO_MCP_TOKEN_PATH overrides default path", () => {
    expect(getTokenPath()).toBe(process.env.ARGO_MCP_TOKEN_PATH);
  });

  it("saved JSON is human-readable", () => {
    saveStoredTokens({ access: "abc", refresh: "def" });
    const raw = readFileSync(getTokenPath(), "utf8");
    expect(raw).toContain("\"access\": \"abc\"");
    expect(raw).toContain("\"refresh\": \"def\"");
  });
});
