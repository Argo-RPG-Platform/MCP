/**
 * Creates and returns a configured McpServer with all Argo tools registered.
 * Shared between stdio and HTTP modes.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ArgoApiError } from "./client.js";
import {
  addCoGm,
  addCoGmInputSchema,
  createCampaign,
  createCampaignInputSchema,
  getCampaign,
  getCampaignInputSchema,
  listCampaigns,
  listCampaignsInputSchema,
  listCoGms,
  listCoGmsInputSchema,
  removeCoGm,
  removeCoGmInputSchema,
  type Campaign,
  type CampaignSummary,
  type CoGm,
} from "./tools/campaign.js";
import {
  createMnemon,
  createMnemonInputSchema,
  createMnemons,
  createMnemonsInputSchema,
  createMnemonRelationship,
  createMnemonRelationshipInputSchema,
  deleteMnemonRelationship,
  deleteMnemonRelationshipInputSchema,
  describeMnemonTypes,
  describeMnemonTypesInputSchema,
  getMnemon,
  getMnemonInputSchema,
  listMnemons,
  listMnemonsInputSchema,
  listMnemonRelationships,
  listMnemonRelationshipsInputSchema,
  updateMnemon,
  updateMnemonInputSchema,
  type BulkCreateMnemonResponse,
  type MnemonSummary,
  type Relationship,
  type RelationshipsResponse,
} from "./tools/mnemon.js";
import {
  createSession,
  createSessionInputSchema,
  getSession,
  getSessionInputSchema,
  listSessions,
  listSessionsInputSchema,
  updateSession,
  updateSessionInputSchema,
  type CampaignSession,
} from "./tools/calendar.js";

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
};

const WRITE_SAFE = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
};

const WRITE_DESTRUCTIVE = {
  readOnlyHint: false,
  destructiveHint: true,
  openWorldHint: false,
};

const READ_META = { securitySchemes: [{ type: "oauth2", scopes: ["campaign.read"] }] };
const WRITE_META = { securitySchemes: [{ type: "oauth2", scopes: ["campaign.write"] }] };
const CREATE_META = { securitySchemes: [{ type: "oauth2", scopes: ["campaign.create"] }] };
const NO_META = { securitySchemes: [] as Array<{ type: string; scopes: string[] }> };

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

const json = (v: unknown) => JSON.stringify(v, null, 2);

export function createServer(): McpServer {
  const server = new McpServer({ name: "argo-mcp", version: "1.1.0" });

  // -------------------------------------------------------------------------
  // Campaign — read
  // -------------------------------------------------------------------------

  server.registerTool(
    "list_campaigns",
    {
      description:
        "List all Argo campaigns the current grant token has access to, including the access level " +
        "(\"read\" or \"read+write\") for each. Call this first when the user has not provided a " +
        "campaign ID — it returns all campaign IDs and names you can then use with other tools.",
      inputSchema: listCampaignsInputSchema.shape,
      annotations: READ_ONLY,
      _meta: READ_META,
    },
    () =>
      runTool(
        () => listCampaigns(),
        (campaigns: CampaignSummary[]) => ({
          content: [{
            type: "text",
            text: campaigns.length === 0
              ? "No campaigns found in the current grant. The token may not cover any campaigns."
              : json(campaigns),
          }],
        })
      )
  );

  server.registerTool(
    "get_campaign",
    {
      description:
        "Retrieve details of an Argo campaign (name, description, rule system, co-GMs).",
      inputSchema: getCampaignInputSchema.shape,
      annotations: READ_ONLY,
      _meta: READ_META,
    },
    (input) =>
      runTool(
        () => getCampaign(input),
        (campaign) => ({ content: [{ type: "text", text: json(campaign) }] })
      )
  );

  // -------------------------------------------------------------------------
  // Campaign — create (campaign.create scope)
  // -------------------------------------------------------------------------

  server.registerTool(
    "create_campaign",
    {
      description:
        "Create a new Argo campaign. The current user becomes GM and the calling token gains " +
        "read+write access to the new campaign immediately (no re-consent needed). " +
        "Requires the campaign.create OAuth scope, granted at consent time.",
      inputSchema: createCampaignInputSchema.shape,
      annotations: WRITE_SAFE,
      _meta: CREATE_META,
    },
    (input) =>
      runTool(
        () => createCampaign(input),
        (campaign) => ({
          content: [{
            type: "text",
            text: `Created campaign: ${campaign.campaignName} (id: ${campaign.id})\n\n${json(campaign)}`,
          }],
        })
      )
  );

  // -------------------------------------------------------------------------
  // Co-GM management
  // -------------------------------------------------------------------------

  server.registerTool(
    "list_co_gms",
    {
      description: "List the assistant GMs (co-GMs) of a campaign.",
      inputSchema: listCoGmsInputSchema.shape,
      annotations: READ_ONLY,
      _meta: READ_META,
    },
    (input) =>
      runTool(
        () => listCoGms(input),
        (cogms: CoGm[]) => ({
          content: [{
            type: "text",
            text: cogms.length === 0 ? "No co-GMs on this campaign." : json(cogms),
          }],
        })
      )
  );

  server.registerTool(
    "add_co_gm",
    {
      description:
        "Add a user as an assistant GM (co-GM) of a campaign. Owner-only — the calling user must " +
        "be the campaign's primary GM. Maximum 5 co-GMs per campaign.",
      inputSchema: addCoGmInputSchema.shape,
      annotations: WRITE_SAFE,
      _meta: WRITE_META,
    },
    (input) =>
      runTool(
        () => addCoGm(input),
        (campaign: Campaign) => ({
          content: [{ type: "text", text: `Added co-GM. Current co-GMs: ${json(campaign.coGameMasterIds ?? [])}` }],
        })
      )
  );

  server.registerTool(
    "remove_co_gm",
    {
      description:
        "Remove a co-GM from a campaign. Owner-only or self-removal.",
      inputSchema: removeCoGmInputSchema.shape,
      annotations: WRITE_DESTRUCTIVE,
      _meta: WRITE_META,
    },
    (input) =>
      runTool(
        () => removeCoGm(input),
        () => ({ content: [{ type: "text", text: `Removed co-GM ${input.userId}.` }] })
      )
  );

  // -------------------------------------------------------------------------
  // Mnemon — read
  // -------------------------------------------------------------------------

  server.registerTool(
    "describe_mnemon_types",
    {
      description:
        "Returns a catalog of all mnemon types and their type-specific fields. " +
        "Call this before create_mnemon when the user mentions a specific type " +
        "(e.g. 'NPC of type FACTION', 'completed quest'). NPC subtype is strictly " +
        "FACTION | INDIVIDUAL — anything else is rejected.",
      inputSchema: describeMnemonTypesInputSchema.shape,
      annotations: READ_ONLY,
      _meta: NO_META,
    },
    () =>
      runTool(
        () => Promise.resolve(describeMnemonTypes()),
        (catalog) => ({ content: [{ type: "text", text: json(catalog) }] })
      )
  );

  server.registerTool(
    "list_mnemons",
    {
      description: "List all mnemon (lore/memory) entries for an Argo campaign.",
      inputSchema: listMnemonsInputSchema.shape,
      annotations: READ_ONLY,
      _meta: READ_META,
    },
    (input) =>
      runTool(
        () => listMnemons(input),
        (entries: MnemonSummary[]) => ({
          content: [{
            type: "text",
            text: entries.length === 0 ? "No mnemon entries found." : json(entries),
          }],
        })
      )
  );

  server.registerTool(
    "get_mnemon",
    {
      description: "Get the full details of a specific mnemon entry (title, blocks, type properties).",
      inputSchema: getMnemonInputSchema.shape,
      annotations: READ_ONLY,
      _meta: READ_META,
    },
    (input) =>
      runTool(
        () => getMnemon(input),
        (entry) => ({ content: [{ type: "text", text: json(entry) }] })
      )
  );

  server.registerTool(
    "list_mnemon_relationships",
    {
      description:
        "List the relationships of a mnemon entry, split into outgoing edges, incoming edges, " +
        "and a flat list of linked entries (entryId/title/type/relationshipTypes). " +
        "Use this to find members of a faction, allies/enemies of an NPC, etc.",
      inputSchema: listMnemonRelationshipsInputSchema.shape,
      annotations: READ_ONLY,
      _meta: READ_META,
    },
    (input) =>
      runTool(
        () => listMnemonRelationships(input),
        (resp: RelationshipsResponse) => ({ content: [{ type: "text", text: json(resp) }] })
      )
  );

  // -------------------------------------------------------------------------
  // Mnemon — write
  // -------------------------------------------------------------------------

  server.registerTool(
    "create_mnemon",
    {
      description:
        "Create a single mnemon (lore/memory) entry. For batch authoring, prefer create_mnemons. " +
        "When type=NPC, npcType is REQUIRED and must be FACTION or INDIVIDUAL. " +
        "Use memberNpcEntryIds (FACTION) or affiliationEntryIds (INDIVIDUAL) to wire " +
        "faction membership — the server projects these into MEMBER relationships automatically.",
      inputSchema: createMnemonInputSchema.shape,
      annotations: WRITE_SAFE,
      _meta: WRITE_META,
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
    "create_mnemons",
    {
      description:
        "Create multiple mnemon entries in one call (best-effort, max 50 items). " +
        "Returns per-item success/error status. Use this to populate a fresh campaign " +
        "with NPCs, locations, quests, etc. in a single tool call instead of dozens of round-trips.",
      inputSchema: createMnemonsInputSchema.shape,
      annotations: WRITE_SAFE,
      _meta: WRITE_META,
    },
    (input) =>
      runTool(
        () => createMnemons(input),
        (resp: BulkCreateMnemonResponse) => {
          const ok = resp.results.filter((r) => r.success).length;
          const fail = resp.results.length - ok;
          return {
            content: [{
              type: "text",
              text: `Bulk create: ${ok} succeeded, ${fail} failed.\n\n${json(resp.results)}`,
            }],
          };
        }
      )
  );

  server.registerTool(
    "update_mnemon",
    {
      description:
        "Update an existing mnemon entry. All fields are optional — only supplied fields are changed. " +
        "Type cannot be changed after creation.",
      inputSchema: updateMnemonInputSchema.shape,
      annotations: WRITE_SAFE,
      _meta: WRITE_META,
    },
    (input) =>
      runTool(
        () => updateMnemon(input),
        (entry) => ({
          content: [{ type: "text", text: `Updated mnemon entry: ${entry.title} (id: ${entry.entryId})` }],
        })
      )
  );

  server.registerTool(
    "create_mnemon_relationship",
    {
      description:
        "Create a relationship between two mnemon entries. Label is one of: " +
        "MEMBER (e.g. NPC ∈ Faction; bidirectional), ALLY (bidirectional), " +
        "ENEMY (directional), RIVAL (directional). " +
        "For faction membership prefer setting memberNpcEntryIds / affiliationEntryIds " +
        "on the NPC mnemons themselves; this tool is for ad-hoc edges.",
      inputSchema: createMnemonRelationshipInputSchema.shape,
      annotations: WRITE_SAFE,
      _meta: WRITE_META,
    },
    (input) =>
      runTool(
        () => createMnemonRelationship(input),
        (rel: Relationship) => ({
          content: [{ type: "text", text: `Created relationship ${rel.relationshipId} (${rel.label}).` }],
        })
      )
  );

  server.registerTool(
    "delete_mnemon_relationship",
    {
      description: "Delete a relationship by id.",
      inputSchema: deleteMnemonRelationshipInputSchema.shape,
      annotations: WRITE_DESTRUCTIVE,
      _meta: WRITE_META,
    },
    (input) =>
      runTool(
        () => deleteMnemonRelationship(input),
        () => ({ content: [{ type: "text", text: `Deleted relationship ${input.relationshipId}.` }] })
      )
  );

  // -------------------------------------------------------------------------
  // Calendar
  // -------------------------------------------------------------------------

  server.registerTool(
    "create_session",
    {
      description:
        "Schedule a campaign session. Provide an ISO-8601 startAt; endAt is optional. " +
        "Useful for laying out planned arcs or recurring play nights.",
      inputSchema: createSessionInputSchema.shape,
      annotations: WRITE_SAFE,
      _meta: WRITE_META,
    },
    (input) =>
      runTool(
        () => createSession(input),
        (s: CampaignSession) => ({
          content: [{ type: "text", text: `Scheduled session ${s.id}: ${s.title} @ ${s.startAt}` }],
        })
      )
  );

  server.registerTool(
    "list_sessions",
    {
      description:
        "List campaign sessions for a given month (defaults to the current month).",
      inputSchema: listSessionsInputSchema.shape,
      annotations: READ_ONLY,
      _meta: READ_META,
    },
    (input) =>
      runTool(
        () => listSessions(input),
        (sessions: CampaignSession[]) => ({
          content: [{
            type: "text",
            text: sessions.length === 0 ? "No sessions scheduled in this window." : json(sessions),
          }],
        })
      )
  );

  server.registerTool(
    "get_session",
    {
      description: "Get details of a single campaign session.",
      inputSchema: getSessionInputSchema.shape,
      annotations: READ_ONLY,
      _meta: READ_META,
    },
    (input) =>
      runTool(
        () => getSession(input),
        (s: CampaignSession) => ({ content: [{ type: "text", text: json(s) }] })
      )
  );

  server.registerTool(
    "update_session",
    {
      description:
        "Reschedule a campaign session or edit its title/description. All fields optional. " +
        "Owner-only on the backend.",
      inputSchema: updateSessionInputSchema.shape,
      annotations: WRITE_SAFE,
      _meta: WRITE_META,
    },
    (input) =>
      runTool(
        () => updateSession(input),
        (s: CampaignSession) => ({ content: [{ type: "text", text: `Updated session ${s.id}.` }] })
      )
  );

  return server;
}
