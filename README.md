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
| `OAUTH_TOKEN` | Yes | Hydra access token from the consent flow |
| `REFRESH_TOKEN` | Recommended | Hydra refresh token; enables automatic renewal |
| `ARGO_API_BASE` | No | Override the API base URL (default: `https://api.argo.games`) |

---

## License

MIT — see [LICENSE](./LICENSE).
