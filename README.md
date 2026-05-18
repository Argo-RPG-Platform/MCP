# Argo MCP Server

Connects AI assistants to your Argo campaigns via the [Model Context Protocol](https://modelcontextprotocol.io). Once configured, your AI assistant can read and write campaign lore, look up character details, and interact with Argo data directly from the chat interface.

Supported clients: Claude Code, Claude Desktop, OpenAI Codex, VS Code (1.103+), and any MCP-compatible host.

## One-click install

[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Argo_MCP-0098FF?style=for-the-badge&logo=visualstudiocode&logoColor=white)](vscode:mcp/install?name=argo&config=%7B%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fmcp.argo.games%2Fmcp%22%7D)
[![Install in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Install_Argo_MCP-24bfa5?style=for-the-badge&logo=visualstudiocode&logoColor=white)](vscode-insiders:mcp/install?name=argo&config=%7B%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fmcp.argo.games%2Fmcp%22%7D)

Clicking either button hands a `vscode:mcp/install` URL to your editor with this config:

```json
{ "type": "http", "url": "https://mcp.argo.games/mcp" }
```

VS Code stores the entry in your user-level `mcp.json`, then negotiates OAuth on first connect via Dynamic Client Registration against the Argo authorization server. No tokens are embedded in the URL — VS Code stores the resulting access and refresh tokens in your OS keychain.

**Linux / Flatpak / Snap note:** If clicking the button doesn't open VS Code, the `vscode:` URL handler isn't registered. This is common on:

- **Flatpak / Snap VS Code** — the sandbox isolates the install from the host, so the host browser can't find the protocol handler.
- **Tarball / manual installs** — no postinst hook runs `update-desktop-database`. Either run `xdg-mime default code.desktop x-scheme-handler/vscode` once, or use the manual fallback below.

Manual fallback: copy the JSON from the [VS Code (one-click, recommended)](#vs-code-one-click-recommended) section below into your VS Code `mcp.json` config.

The same install button is rendered on the Argo install page at `https://app.argo.games/docs/mcp/install`.

---

## Prerequisites

- Node.js 20 or later
- An Argo account with at least one campaign
- A Game Master must authorize the AI assistant via the OAuth2 consent flow (see [Getting a token](#getting-a-token))

---

## Quick start

There are three supported ways to use the Argo MCP server. Pick the one that matches your client.

### ChatGPT (remote)

Use the hosted endpoint — **do not** install the npx package. Add this MCP server URL to ChatGPT:

```
https://mcp.argo.games/mcp
```

ChatGPT will walk you through OAuth on first connect via dynamic client registration.

### Local MCP clients (Claude Code, Claude Desktop, Codex, etc.) — recommended

Sign in once on the machine that runs the MCP client:

```bash
npx -y argo-mcp auth login
```

The command prints the consent URL, opens nothing, and asks you to paste the access token (and optionally the refresh token) from the consent page. Tokens are saved locally:

- Windows: `%APPDATA%\argo-mcp\tokens.json`
- macOS: `~/Library/Application Support/argo-mcp/tokens.json`
- Linux: `${XDG_CONFIG_HOME:-~/.config}/argo-mcp/tokens.json`

Then configure the MCP server with no env vars:

```json
{
  "mcpServers": {
    "argo": { "command": "npx", "args": ["-y", "argo-mcp"] }
  }
}
```

Other auth commands:

```bash
npx -y argo-mcp auth status   # show whether you are signed in
npx -y argo-mcp auth logout   # forget locally stored tokens
```

> Local stdio mode does not use OAuth Dynamic Client Registration. DCR is only used by the hosted HTTP server at `https://mcp.argo.games`.

### Advanced — environment variables

For CI, Docker, or anyone who prefers explicit env config, you can skip `auth login` and pass tokens directly. `OAUTH_TOKEN` always wins over the local token store.

```json
{
  "mcpServers": {
    "argo": {
      "command": "npx",
      "args": ["-y", "argo-mcp"],
      "env": {
        "OAUTH_TOKEN": "<your-access-token>",
        "REFRESH_TOKEN": "<your-refresh-token>"
      }
    }
  }
}
```

---

## Build from source (contributors)

```bash
git clone https://github.com/Argo-RPG-Platform/MCP.git argo-mcp
cd argo-mcp
npm install
npm run build
```

---

## Getting a token

The MCP server authenticates with Argo using an OAuth2 access token tied to a specific set of campaigns. Tokens are obtained through the Argo consent flow:

1. Open **https://app.argo.games/oauth2/mcp-connect** in your browser.
2. Select the campaigns you want the AI assistant to access and the permission level (read or read+write).
3. Click **Authorize**. You will be redirected to a page showing two tokens:
   - **Access token** — set this as `OAUTH_TOKEN`
   - **Refresh token** — set this as `REFRESH_TOKEN` (recommended; enables automatic renewal when the access token expires after ~1 hour)

Treat both tokens like passwords. Revoke them at any time from the campaign's integrations page.

---

## Configuration

### VS Code (one-click, recommended)

Use the install buttons at the top of this README, or paste the following into a `.vscode/mcp.json` (per-workspace) or your user-level MCP config:

```json
{
  "servers": {
    "argo": {
      "type": "http",
      "url": "https://mcp.argo.games/mcp"
    }
  }
}
```

VS Code handles OAuth automatically via Dynamic Client Registration on first connect. There is no need to set `OAUTH_TOKEN` or `REFRESH_TOKEN` — VS Code stores tokens in the OS keychain.

### Claude Code

Add the server with the CLI:

```bash
claude mcp add argo \
  --command node \
  --args /absolute/path/to/argo-mcp/dist/index.js \
  --env OAUTH_TOKEN=<your-access-token> \
  --env REFRESH_TOKEN=<your-refresh-token>
```

Or add it manually to your project's `.claude/settings.json`:

```json
{
  "mcpServers": {
    "argo": {
      "command": "node",
      "args": ["/absolute/path/to/argo-mcp/dist/index.js"],
      "env": {
        "OAUTH_TOKEN": "<your-access-token>",
        "REFRESH_TOKEN": "<your-refresh-token>"
      }
    }
  }
}
```

### Claude Desktop

Edit your Claude Desktop config file:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "argo": {
      "command": "node",
      "args": ["/absolute/path/to/argo-mcp/dist/index.js"],
      "env": {
        "OAUTH_TOKEN": "<your-access-token>",
        "REFRESH_TOKEN": "<your-refresh-token>"
      }
    }
  }
}
```

Restart Claude Desktop after saving.

### OpenAI Codex

Add the server to your Codex MCP configuration:

```json
{
  "mcpServers": {
    "argo": {
      "command": "node",
      "args": ["/absolute/path/to/argo-mcp/dist/index.js"],
      "env": {
        "OAUTH_TOKEN": "<your-access-token>",
        "REFRESH_TOKEN": "<your-refresh-token>"
      }
    }
  }
}
```

### ChatGPT App Submission

For the hosted ChatGPT app surface, this repo exposes OAuth discovery, dynamic client registration, and domain verification endpoints on the MCP domain. The submission checklist and required env vars are in [CHATGPT_APP_SUBMISSION.md](./CHATGPT_APP_SUBMISSION.md).

### Using a `.env` file (local dev)

Create a `.env` file in the `argo-mcp` directory:

```
OAUTH_TOKEN=<your-access-token>
REFRESH_TOKEN=<your-refresh-token>
```

Then run directly:

```bash
npm run dev       # hot-reload via tsx
# or
npm start         # compiled dist/
```

---

## Available tools

This server exposes tools across campaigns, mnemons, sessions, guilds, friends, invites, and the Argo community forum.

### Campaigns

- `list_campaigns` (`campaign.read`) lists accessible campaigns and their access level
- `get_campaign` (`campaign.read`) retrieves campaign details
- `create_campaign` (`campaign.create`) creates a new campaign
- `update_campaign` (`campaign.write`) updates campaign name or description
- `list_co_gms` (`campaign.read`) lists assistant GMs
- `add_co_gm` (`campaign.write`) adds an assistant GM
- `remove_co_gm` (`campaign.write`) removes an assistant GM

### Mnemons

- `describe_mnemon_types` lists supported mnemon types, relationship labels, and content-block rules
- `list_mnemons` (`campaign.read`) lists mnemon entries for a campaign
- `get_mnemon` (`campaign.read`) retrieves a mnemon entry in full
- `list_mnemon_relationships` (`campaign.read`) lists linked entries and relationship edges
- `create_*_mnemons` (`campaign.write`) creates typed mnemon entries for NPC, Location, Quest, Lore, Archive, Journal, SessionSummary, Player, and Custom entries
- `update_*_mnemons` (`campaign.write`) updates typed/meta fields for those mnemon entry types
- `update_mnemons_content` (`campaign.write`) edits mnemon content blocks
- `create_mnemon_relationship` (`campaign.write`) creates a relationship between entries
- `delete_mnemon_relationship` (`campaign.write`) deletes a relationship by ID

### Sessions

- `create_session` (`campaign.write`) schedules a campaign session
- `list_sessions` (`campaign.read`) lists sessions for a campaign and month
- `get_session` (`campaign.read`) retrieves a single session
- `update_session` (`campaign.write`) updates a session's schedule or text

### Guilds

- `list_guilds` (`guild.read`) lists guilds the current user belongs to
- `get_guild` (`guild.read`) retrieves guild details
- `list_guild_members` (`guild.read`) lists guild members
- `add_campaign_to_guild` (`guild.write`) links a campaign to a guild
- `invite_guild_member` (`guild.admin`) invites a guild member
- `remove_guild_member` (`guild.admin`) removes a guild member
- `set_guild_member_role` (`guild.admin`) changes a guild member's role
- `add_guild_calendar_event` (`guild.admin`) adds a guild calendar event

### Friends and invites

- `list_friends` (`friends.read`) lists accepted friends
- `list_sent_friend_requests` (`friends.read`) lists outgoing pending requests
- `list_received_friend_requests` (`friends.read`) lists incoming pending requests
- `send_friend_request` (`friends.write`) sends a friend request
- `accept_friend_request` (`friends.write`) accepts a request
- `reject_friend_request` (`friends.write`) rejects a request
- `cancel_friend_request` (`friends.write`) cancels a sent request
- `invite_user_by_email` (`invite.write`) sends Argo invitation emails

### Forum

- `forum_list_categories` (`forum.read`) lists forum categories
- `forum_list_topics` (`forum.read`) lists topics in a category
- `forum_get_latest_topics` (`forum.read`) lists recent forum activity
- `forum_read_topic` (`forum.read`) reads a topic thread
- `forum_search` (`forum.read`) searches forum content
- `forum_get_user_posts` (`forum.read`) lists the current user's topics
- `forum_get_notifications` (`forum.read`) lists the current user's notifications
- `forum_create_topic` (`forum.write`) creates a new topic on `community.argo.games`
- `forum_reply` (`forum.write`) replies to an existing topic on `community.argo.games`

Many campaign-scoped tools accept `campaignId`. You can find a campaign's ID from the Argo campaign URL or by asking the GM.

---

## Token renewal

The access token expires after approximately one hour. If `REFRESH_TOKEN` is configured, the server automatically fetches a new access token on the first request that returns a 401 and retries transparently — no action required.

If no refresh token is set and the access token expires, the tool will return:

> Token expired — re-consent at https://app.argo.games/oauth2/mcp-connect

Re-run the consent flow at that URL to get fresh tokens.

---

## Revoking access

To disconnect the AI assistant from a campaign, revoke the grant from the campaign's integrations page in the Argo WebApp. The access token and refresh token will both become invalid immediately.

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `OAUTH_TOKEN` | If not signed in via `auth login` | OAuth2 access token from the consent flow |
| `REFRESH_TOKEN` | Recommended | OAuth2 refresh token; enables automatic renewal |
| `ARGO_API_BASE` | No | Override the API base URL (default: `https://api.argo.games`) |
| `ARGO_MCP_TOKEN_PATH` | No | Override the local token file path used by `auth login` |

---

## Privacy Policy

Full policy: **https://argo.games/policies/privacy-policy**

What the Argo MCP server handles:

- **Data collected.** OAuth access and refresh tokens issued by the Argo authorization server (`oauth.argo.games`); the campaign, mnemon, guild, forum, and friends payloads that pass through tool calls; standard HTTP metadata (IP, user agent) for rate limiting and abuse mitigation.
- **Usage.** Tool calls are proxied to the Argo WebAPI (`api.argo.games`) on behalf of the authenticated user. Tokens are cached in-process for the lifetime of an MCP session so clients that omit `Authorization` on subsequent requests (a known Claude Code behaviour) keep working.
- **Storage & retention.** Session token cache is in-memory only and is evicted after 30 minutes of inactivity. No user content (mnemons, campaigns, forum posts) is persisted by the MCP server — it is forwarded to the WebAPI and discarded. Logs retain only request metadata, not payload contents.
- **Third-party sharing.** Requests are forwarded only to the Argo WebAPI and (during the OAuth flow) the Argo authorization server. No other third parties receive request data from this server.
- **Contact.** Privacy questions: `support@argo.games`. Security disclosures: see the SECURITY policy on the Argo GitHub organization.

The hosted privacy policy at the link above is the authoritative version and covers the full Argo platform including the WebAPI and WebApp.

---

## License

MIT — see [LICENSE](./LICENSE).
