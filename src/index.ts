/**
 * Argo MCP Server
 *
 * Provides AI assistants (Claude, ChatGPT, etc.) with read and write access
 * to Argo campaign data via OAuth2 grants.
 *
 * Authentication: Bearer token obtained via the Argo Hydra OAuth2 consent flow.
 * Authorization: Oathkeeper validates the token and injects X-Grant-ID;
 *                WebAPI checks Keto for grant_read / grant_write on the campaign.
 *
 * Start with:
 *   OAUTH_TOKEN=<token> node dist/index.js
 *
 * For dev (hot-reload):
 *   OAUTH_TOKEN=<token> npx tsx src/index.ts
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import dotenv from "dotenv";
import { loadToken } from "./auth.js";
import {
  getCampaign,
  getCampaignInputSchema,
} from "./tools/campaign.js";
import {
  createMnemon,
  createMnemonInputSchema,
  getMnemon,
  getMnemonInputSchema,
  listMnemons,
  listMnemonsInputSchema,
  updateMnemon,
  updateMnemonInputSchema,
  type MnemonSummary,
} from "./tools/mnemon.js";

// Load environment variables from .env if present
dotenv.config();

// ---------------------------------------------------------------------------
// Token validation
// ---------------------------------------------------------------------------

loadToken();

// ---------------------------------------------------------------------------
// MCP server setup
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "argo-mcp",
  version: "1.0.0",
});

// ---------------------------------------------------------------------------
// Campaign tools
// ---------------------------------------------------------------------------

server.tool(
  "get_campaign",
  "Retrieve details of an Argo campaign (name, description, rule system, etc.). " +
    "Requires campaign.read scope.",
  getCampaignInputSchema.shape,
  async (input) => {
    const campaign = await getCampaign(input);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(campaign, null, 2),
        },
      ],
    };
  }
);

// ---------------------------------------------------------------------------
// Mnemon (lore / memory) tools
// ---------------------------------------------------------------------------

server.tool(
  "list_mnemons",
  "List all mnemon (lore/memory) entries for an Argo campaign. " +
    "Requires campaign.read scope.",
  listMnemonsInputSchema.shape,
  async (input) => {
    const entries: MnemonSummary[] = await listMnemons(input);
    return {
      content: [
        {
          type: "text",
          text:
            entries.length === 0
              ? "No mnemon entries found."
              : JSON.stringify(entries, null, 2),
        },
      ],
    };
  }
);

server.tool(
  "get_mnemon",
  "Get the full details of a specific mnemon entry (title, blocks, relationships). " +
    "Requires campaign.read scope.",
  getMnemonInputSchema.shape,
  async (input) => {
    const entry = await getMnemon(input);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(entry, null, 2),
        },
      ],
    };
  }
);

server.tool(
  "create_mnemon",
  "Create a new mnemon (lore/memory) entry in an Argo campaign. " +
    "Requires campaign.write scope (only available when the GM granted write access).",
  createMnemonInputSchema.shape,
  async (input) => {
    const entry = await createMnemon(input);
    return {
      content: [
        {
          type: "text",
          text: `Created mnemon entry: ${entry.title} (id: ${entry.entryId})`,
        },
      ],
    };
  }
);

server.tool(
  "update_mnemon",
  "Update the title or text content of an existing mnemon entry. " +
    "Requires campaign.write scope (only available when the GM granted write access).",
  updateMnemonInputSchema.shape,
  async (input) => {
    const entry = await updateMnemon(input);
    return {
      content: [
        {
          type: "text",
          text: `Updated mnemon entry: ${entry.title} (id: ${entry.entryId})`,
        },
      ],
    };
  }
);

// ---------------------------------------------------------------------------
// Start transport
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);

console.error("Argo MCP server started on stdio transport.");
