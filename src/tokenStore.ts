/**
 * Local token storage for stdio-mode argo-mcp.
 *
 * Tokens written by `argo-mcp auth login` live in a per-user config directory
 * so the MCP server can be launched by Claude Code / Desktop / Codex without
 * the user having to manage env vars manually.
 *
 * Path resolution:
 *   $ARGO_MCP_TOKEN_PATH               (override — used by tests and locked-down hosts)
 *   Windows: %APPDATA%\argo-mcp\tokens.json
 *   macOS:   ~/Library/Application Support/argo-mcp/tokens.json
 *   Linux:   ${XDG_CONFIG_HOME:-~/.config}/argo-mcp/tokens.json
 */

import { homedir } from "node:os";
import { join } from "node:path";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";

export interface StoredTokens {
  access: string;
  refresh: string | null;
  expiresAt?: number | null;
}

export function getTokenPath(): string {
  const override = process.env.ARGO_MCP_TOKEN_PATH;
  if (override) return override;

  if (process.platform === "win32") {
    const base = process.env.APPDATA ?? join(homedir(), "AppData", "Roaming");
    return join(base, "argo-mcp", "tokens.json");
  }

  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "argo-mcp", "tokens.json");
  }

  const base = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
  return join(base, "argo-mcp", "tokens.json");
}

export function loadStoredTokens(): StoredTokens | null {
  const path = getTokenPath();
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as Partial<StoredTokens>;
    if (!parsed.access || typeof parsed.access !== "string") return null;
    return {
      access: parsed.access,
      refresh: typeof parsed.refresh === "string" ? parsed.refresh : null,
      expiresAt: typeof parsed.expiresAt === "number" ? parsed.expiresAt : null,
    };
  } catch {
    return null;
  }
}

export function saveStoredTokens(tokens: StoredTokens): void {
  const path = getTokenPath();
  const dir = path.substring(0, path.lastIndexOf(process.platform === "win32" ? "\\" : "/"));
  mkdirSync(dir, { recursive: true });
  const payload = JSON.stringify(
    {
      access: tokens.access,
      refresh: tokens.refresh ?? null,
      expiresAt: tokens.expiresAt ?? null,
    },
    null,
    2
  );
  writeFileSync(path, payload, { encoding: "utf8", mode: 0o600 });
}

export function clearStoredTokens(): boolean {
  const path = getTokenPath();
  if (!existsSync(path)) return false;
  rmSync(path, { force: true });
  return true;
}
