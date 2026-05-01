# Argo MCP Server

Connects AI assistants to your Argo campaigns via the [Model Context Protocol](https://modelcontextprotocol.io). Once configured, your AI assistant can read and write campaign lore, look up character details, and interact with Argo data directly from the chat interface.

Supported clients: Claude Code, Claude Desktop, OpenAI Codex, and any MCP-compatible host.

---

## Prerequisites

- Node.js 20 or later
- An Argo account with at least one campaign
- A Game Master must authorize the AI assistant via the OAuth2 consent flow (see [Getting a token](#getting-a-token))

---

## Setup

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

| Tool | Scope required | Description |
|---|---|---|
| `get_campaign` | `campaign.read` | Fetch campaign name, description, rule system, and metadata |
| `list_mnemons` | `campaign.read` | List all lore/memory entries for a campaign |
| `get_mnemon` | `campaign.read` | Get the full content of a specific lore entry |
| `create_mnemon` | `campaign.write` | Create a new lore entry (GM write grant required) |
| `update_mnemon` | `campaign.write` | Update the title or content of a lore entry (GM write grant required) |

All tools accept a `campaignId` parameter. You can find a campaign's ID from the Argo campaign URL or by asking the GM.

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
| `OAUTH_TOKEN` | Yes | Hydra access token from the consent flow |
| `REFRESH_TOKEN` | Recommended | Hydra refresh token; enables automatic renewal |
| `ARGO_API_BASE` | No | Override the API base URL (default: `https://api.argo.games`) |
