/**
 * Creates and returns a configured McpServer with all Argo tools registered.
 * Shared between stdio and HTTP modes.
 *
 * Tool annotations follow the MCP spec defaults:
 *   openWorldHint  defaults to true  → must explicitly set false for scoped tools
 *   destructiveHint defaults to true → must explicitly set false for non-destructive tools
 *
 * Uses registerTool(name, config, cb) which accepts an annotations field,
 * rather than the positional tool() overload which does not.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ArgoApiError } from "./client.js";
import {
  getCampaign,
  getCampaignInputSchema,
  listCampaigns,
  listCampaignsInputSchema,
  type CampaignSummary,
} from "./tools/campaign.js";
import {
  createMnemon,
  createMnemonInputSchema,
  describeMnemonTypes,
  describeMnemonTypesInputSchema,
  getMnemon,
  getMnemonInputSchema,
  listMnemons,
  listMnemonsInputSchema,
  updateMnemon,
  updateMnemonInputSchema,
  type MnemonSummary,
} from "./tools/mnemon.js";

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
};

const WRITE_SAFE = {
  readOnlyHint: false,
  destructiveHint: false, // creates/updates data, does not delete it
  openWorldHint: false,
};

function toUserMessage(err: unknown): string {
  if (err instanceof ArgoApiError) {
    switch (err.status) {
      case 401: return err.message;
      case 403: return "Access denied — your grant does not cover this campaign, or the grant has been revoked. Visit https://app.argo.games/oauth2/mcp-connect to reconnect.";
      case 404: return "Not found — check that the campaign ID or entry ID is correct.";
      case 429: return "Rate limited — please wait a moment and try again.";
      default:
        if (err.status >= 500) return `Argo server error (${err.status}) — try again in a moment.`;
        return err.message;
    }
  }
  if (err instanceof Error) return err.message;
  return "An unexpected error occurred.";
}

async function runTool<T>(fn: () => Promise<T>, format: (result: T) => ToolResult): Promise<ToolResult> {
  try {
    return format(await fn());
  } catch (err) {
    return { content: [{ type: "text", text: toUserMessage(err) }], isError: true };
  }
}

export function createServer(): McpServer {
  const server = new McpServer({ name: "argo-mcp", version: "1.0.0" });

  server.registerTool(
    "list_campaigns",
    {
      description:
        "List all Argo campaigns the current grant token has access to, including the access level " +
        "(\"read\" or \"read+write\") for each. Call this first when the user has not provided a " +
        "campaign ID — it returns all campaign IDs and names you can then use with other tools.",
      inputSchema: listCampaignsInputSchema.shape,
      annotations: READ_ONLY,
    },
    () =>
      runTool(
        () => listCampaigns(),
        (campaigns: CampaignSummary[]) => ({
          content: [{
            type: "text",
            text: campaigns.length === 0
              ? "No campaigns found in the current grant. The token may not cover any campaigns."
              : JSON.stringify(campaigns, null, 2),
          }],
        })
      )
  );

  server.registerTool(
    "get_campaign",
    {
      description:
        "Retrieve details of an Argo campaign (name, description, rule system, etc.). " +
        "Requires campaign.read scope.",
      inputSchema: getCampaignInputSchema.shape,
      annotations: READ_ONLY,
    },
    (input) =>
      runTool(
        () => getCampaign(input),
        (campaign) => ({ content: [{ type: "text", text: JSON.stringify(campaign, null, 2) }] })
      )
  );

  server.registerTool(
    "describe_mnemon_types",
    {
      description:
        "Returns a catalog of all mnemon types (NPC, Location, Quest, Lore, Archive, Journal, " +
        "SessionSummary, Player, Custom) and the type-specific fields each one supports. " +
        "Call this before create_mnemon when the user's request mentions a specific type or sub-category " +
        "(e.g. 'NPC of type faction', 'completed quest') so you know which extra fields to include.",
      inputSchema: describeMnemonTypesInputSchema.shape,
      annotations: READ_ONLY,
    },
    () =>
      runTool(
        () => Promise.resolve(describeMnemonTypes()),
        (catalog) => ({ content: [{ type: "text", text: JSON.stringify(catalog, null, 2) }] })
      )
  );

  server.registerTool(
    "list_mnemons",
    {
      description:
        "List all mnemon (lore/memory) entries for an Argo campaign. " +
        "Requires campaign.read scope.",
      inputSchema: listMnemonsInputSchema.shape,
      annotations: READ_ONLY,
    },
    (input) =>
      runTool(
        () => listMnemons(input),
        (entries: MnemonSummary[]) => ({
          content: [{
            type: "text",
            text: entries.length === 0 ? "No mnemon entries found." : JSON.stringify(entries, null, 2),
          }],
        })
      )
  );

  server.registerTool(
    "get_mnemon",
    {
      description:
        "Get the full details of a specific mnemon entry (title, blocks, relationships). " +
        "Requires campaign.read scope.",
      inputSchema: getMnemonInputSchema.shape,
      annotations: READ_ONLY,
    },
    (input) =>
      runTool(
        () => getMnemon(input),
        (entry) => ({ content: [{ type: "text", text: JSON.stringify(entry, null, 2) }] })
      )
  );

  server.registerTool(
    "create_mnemon",
    {
      description:
        "Create a new mnemon (lore/memory) entry in an Argo campaign. " +
        "Requires campaign.write scope (only available when the GM granted write access). " +
        "Supports type-specific fields: npcType/sheetId/primaryLocationEntryId (NPC), " +
        "questStatus/issuerNpcEntryId/issuerText/repeatable (Quest), levelId (Location), " +
        "date/sessionNumber (Journal/SessionSummary), playerKind/partyId/characterId (Player). " +
        "Call describe_mnemon_types for the full field catalog.",
      inputSchema: createMnemonInputSchema.shape,
      annotations: WRITE_SAFE,
    },
    (input) =>
      runTool(
        () => createMnemon(input),
        (entry) => ({
          content: [{ type: "text", text: `Created mnemon entry: ${entry.title} (id: ${entry.entryId})` }],
        })
      )
  );

  server.registerTool(
    "update_mnemon",
    {
      description:
        "Update an existing mnemon entry. All fields are optional — only supplied fields are changed. " +
        "Supports the same type-specific fields as create_mnemon. " +
        "Requires campaign.write scope (only available when the GM granted write access).",
      inputSchema: updateMnemonInputSchema.shape,
      annotations: WRITE_SAFE,
    },
    (input) =>
      runTool(
        () => updateMnemon(input),
        (entry) => ({
          content: [{ type: "text", text: `Updated mnemon entry: ${entry.title} (id: ${entry.entryId})` }],
        })
      )
  );

  return server;
}
