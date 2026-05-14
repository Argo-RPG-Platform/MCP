/**
 * Interactive CLI commands for argo-mcp.
 *
 *   argo-mcp auth login   — prompt user to paste tokens; persist to local store
 *   argo-mcp auth logout  — clear local store
 *   argo-mcp auth status  — report whether a stored token is present
 *   argo-mcp help         — usage
 *
 * Unlike MCP stdio mode (which reserves stdout for JSON-RPC), these commands
 * are interactive, so stdout is fair game.
 */

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import {
  clearStoredTokens,
  getTokenPath,
  loadStoredTokens,
  saveStoredTokens,
} from "./tokenStore.js";

const CONSENT_URL = "https://app.argo.games/oauth2/mcp-connect";

function printHelp(): void {
  stdout.write(
    [
      "Usage: argo-mcp [command]",
      "",
      "Commands:",
      "  (no command)        Start the MCP server on stdio transport.",
      "  auth login          Sign in by pasting tokens from the Argo consent flow.",
      "  auth logout         Remove locally stored tokens.",
      "  auth status         Show whether a token is stored locally.",
      "  help                Show this message.",
      "",
      "Environment variables (advanced):",
      "  OAUTH_TOKEN         Hydra access token; takes precedence over the local store.",
      "  REFRESH_TOKEN       Hydra refresh token (optional).",
      "  ARGO_API_BASE       Override the API base (default: https://api.argo.games).",
      "  ARGO_MCP_TOKEN_PATH Override the local token file path.",
      "",
    ].join("\n")
  );
}

async function authLogin(): Promise<number> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    stdout.write(
      [
        "",
        "Argo MCP — sign in",
        "------------------",
        "",
        `1. Open this URL in your browser:`,
        `     ${CONSENT_URL}`,
        "",
        "2. Select the campaigns and permissions you want to grant.",
        "3. Authorize. The page will display an access token and refresh token.",
        "",
      ].join("\n")
    );

    const access = (await rl.question("Paste access token: ")).trim();
    if (!access) {
      stdout.write("\nNo access token provided — aborting.\n");
      return 1;
    }

    const refreshRaw = (await rl.question("Paste refresh token (optional, press Enter to skip): ")).trim();
    const refresh = refreshRaw.length > 0 ? refreshRaw : null;

    saveStoredTokens({ access, refresh });
    stdout.write(`\nSigned in. Tokens stored at:\n  ${getTokenPath()}\n\n`);
    stdout.write("Restart your MCP client to pick up the new credentials.\n");
    return 0;
  } finally {
    rl.close();
  }
}

function authLogout(): number {
  const removed = clearStoredTokens();
  if (removed) {
    stdout.write(`Signed out. Removed ${getTokenPath()}\n`);
  } else {
    stdout.write("No stored tokens found — already signed out.\n");
  }
  return 0;
}

function authStatus(): number {
  const stored = loadStoredTokens();
  const path = getTokenPath();
  if (!stored) {
    stdout.write(
      [
        "Not signed in.",
        "",
        `Token file: ${path} (missing)`,
        "",
        "Run:",
        "  npx -y argo-mcp auth login",
        "",
      ].join("\n")
    );
    return 0;
  }
  stdout.write(
    [
      "Signed in.",
      "",
      `Token file:    ${path}`,
      `Access token:  present (${stored.access.length} chars)`,
      `Refresh token: ${stored.refresh ? "present" : "absent"}`,
      `Expires at:    ${stored.expiresAt ? new Date(stored.expiresAt).toISOString() : "unknown"}`,
      "",
    ].join("\n")
  );
  return 0;
}

/**
 * Dispatch a CLI command. Returns the process exit code, or null if argv
 * does not match any CLI command (caller should fall through to MCP server).
 */
export async function runCli(argv: string[]): Promise<number | null> {
  const args = argv.slice(2);
  if (args.length === 0) return null;

  const [cmd, sub] = args;

  if (cmd === "help" || cmd === "--help" || cmd === "-h") {
    printHelp();
    return 0;
  }

  if (cmd === "auth") {
    switch (sub) {
      case "login":
        return await authLogin();
      case "logout":
        return authLogout();
      case "status":
        return authStatus();
      default:
        stdout.write(`Unknown auth subcommand: ${sub ?? "(none)"}\n\n`);
        printHelp();
        return 1;
    }
  }

  stdout.write(`Unknown command: ${cmd}\n\n`);
  printHelp();
  return 1;
}
