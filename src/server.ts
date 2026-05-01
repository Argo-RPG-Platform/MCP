/**
 * Creates and returns a configured McpServer with all Argo tools registered.
 * Shared between stdio and HTTP modes.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ArgoApiError } from "./client.js";
import { getCampaign, getCampaignInputSchema } from "./tools/campaign.js";
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

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

function toUserMessage(err: unknown): string {
  if (err instanceof ArgoApiError) {
    switch (err.status) {
      case 401:
        return err.message;
      case 403:
        return "Access denied — your grant does not cover this campaign, or the grant has been revoked. Visit https://app.argo.games/oauth2/mcp-connect to reconnect.";
      case 404:
        return "Not found — check that the campaign ID or entry ID is correct.";
      case 429:
        return "Rate limited — please wait a moment and try again.";
      default:
        if (err.status >= 500) return `Argo server error (${err.status}) — try again in a moment.`;
        return err.message;
    }
  }
  if (err instanceof Error) return err.message;
  return "An unexpected error occurred.";
}

async function runTool<T>(
  fn: () => Promise<T>,
  format: (result: T) => ToolResult
): Promise<ToolResult> {
  try {
    return format(await fn());
  } catch (err) {
    return { content: [{ type: "text", text: toUserMessage(err) }], isError: true };
  }
}

export function createServer(): McpServer {
  const server = new McpServer({ name: "argo-mcp", version: "1.0.0" });

  server.tool(
    "get_campaign",
    "Retrieve details of an Argo campaign (name, description, rule system, etc.). " +
      "Requires campaign.read scope.",
    getCampaignInputSchema.shape,
    (input) =>
      runTool(
        () => getCampaign(input),
        (campaign) => ({ content: [{ type: "text", text: JSON.stringify(campaign, null, 2) }] })
      )
  );

  server.tool(
    "list_mnemons",
    "List all mnemon (lore/memory) entries for an Argo campaign. " +
      "Requires campaign.read scope.",
    listMnemonsInputSchema.shape,
    (input) =>
      runTool(
        () => listMnemons(input),
        (entries: MnemonSummary[]) => ({
          content: [
            {
              type: "text",
              text: entries.length === 0 ? "No mnemon entries found." : JSON.stringify(entries, null, 2),
            },
          ],
        })
      )
  );

  server.tool(
    "get_mnemon",
    "Get the full details of a specific mnemon entry (title, blocks, relationships). " +
      "Requires campaign.read scope.",
    getMnemonInputSchema.shape,
    (input) =>
      runTool(
        () => getMnemon(input),
        (entry) => ({ content: [{ type: "text", text: JSON.stringify(entry, null, 2) }] })
      )
  );

  server.tool(
    "create_mnemon",
    "Create a new mnemon (lore/memory) entry in an Argo campaign. " +
      "Requires campaign.write scope (only available when the GM granted write access).",
    createMnemonInputSchema.shape,
    (input) =>
      runTool(
        () => createMnemon(input),
        (entry) => ({
          content: [{ type: "text", text: `Created mnemon entry: ${entry.title} (id: ${entry.entryId})` }],
        })
      )
  );

  server.tool(
    "update_mnemon",
    "Update the title or text content of an existing mnemon entry. " +
      "Requires campaign.write scope (only available when the GM granted write access).",
    updateMnemonInputSchema.shape,
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
