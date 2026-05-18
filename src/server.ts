/**
 * Creates and returns a configured McpServer with all Argo tools registered.
 * Shared between stdio and HTTP modes.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ArgoApiError } from "./client.js";
import {
  addCoGm,
  addCoGmInputSchema,
  campaignOutputSchema,
  campaignSummaryOutputSchema,
  coGmOutputSchema,
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
  updateCampaign,
  updateCampaignInputSchema,
  type Campaign,
  type CampaignSummary,
  type CoGm,
} from "./tools/campaign.js";
import {
  createArchiveMnemons,
  createArchiveMnemonsInputSchema,
  createCustomMnemons,
  createCustomMnemonsInputSchema,
  createJournalMnemons,
  createJournalMnemonsInputSchema,
  createLocationMnemons,
  createLocationMnemonsInputSchema,
  createLoreMnemons,
  createLoreMnemonsInputSchema,
  createMnemonRelationship,
  createMnemonRelationshipInputSchema,
  createNpcMnemons,
  createNpcMnemonsInputSchema,
  createPlayerMnemons,
  createPlayerMnemonsInputSchema,
  createQuestMnemons,
  createQuestMnemonsInputSchema,
  createSessionSummaryMnemons,
  createSessionSummaryMnemonsInputSchema,
  deleteMnemonRelationship,
  deleteMnemonRelationshipInputSchema,
  describeMnemonTypes,
  describeMnemonTypesInputSchema,
  describeMnemonTypesOutputSchema,
  getMnemon,
  getMnemonInputSchema,
  linkedEntryOutputSchema,
  listMnemons,
  listMnemonsInputSchema,
  listMnemonRelationships,
  listMnemonRelationshipsInputSchema,
  mnemonBulkResponseOutputSchema,
  mnemonEntryOutputSchema,
  mnemonSummaryOutputSchema,
  relationshipOutputSchema,
  relationshipsResponseOutputSchema,
  updateArchiveMnemons,
  updateArchiveMnemonsInputSchema,
  updateCustomMnemons,
  updateCustomMnemonsInputSchema,
  updateJournalMnemons,
  updateJournalMnemonsInputSchema,
  updateLocationMnemons,
  updateLocationMnemonsInputSchema,
  updateLoreMnemons,
  updateLoreMnemonsInputSchema,
  updateMnemonsContent,
  updateMnemonsContentInputSchema,
  updateNpcMnemons,
  updateNpcMnemonsInputSchema,
  updatePlayerMnemons,
  updatePlayerMnemonsInputSchema,
  updateQuestMnemons,
  updateQuestMnemonsInputSchema,
  updateSessionSummaryMnemons,
  updateSessionSummaryMnemonsInputSchema,
  type MnemonBulkResponse,
  type MnemonSummary,
  type Relationship,
  type RelationshipsResponse,
} from "./tools/mnemon.js";
import {
  inviteUserByEmail,
  inviteUserByEmailInputSchema,
  sendInvitesResponseOutputSchema,
} from "./tools/invite.js";
import {
  forumCreateTopic,
  forumCreateTopicInputSchema,
  forumCategoriesOutputSchema,
  forumGetLatestTopics,
  forumGetLatestTopicsInputSchema,
  forumNotificationsOutputSchema,
  forumPostResponseOutputSchema,
  forumSearchOutputSchema,
  forumTopicDetailOutputSchema,
  forumTopicListOutputSchema,
  forumGetNotifications,
  forumGetNotificationsInputSchema,
  forumGetUserPosts,
  forumGetUserPostsInputSchema,
  forumListCategories,
  forumListCategoriesInputSchema,
  forumListTopics,
  forumListTopicsInputSchema,
  forumReadTopic,
  forumReadTopicInputSchema,
  forumReply,
  forumReplyInputSchema,
  forumSearch,
  forumSearchInputSchema,
} from "./tools/forum.js";
import {
  acceptFriendRequest,
  acceptFriendRequestInputSchema,
  cancelFriendRequest,
  cancelFriendRequestInputSchema,
  friendRequestRecordOutputSchema,
  listFriends,
  listFriendsInputSchema,
  listReceivedFriendRequests,
  listReceivedFriendRequestsInputSchema,
  listSentFriendRequests,
  listSentFriendRequestsInputSchema,
  rejectFriendRequest,
  rejectFriendRequestInputSchema,
  sendFriendRequest,
  sendFriendRequestInputSchema,
  userDetailOutputSchema,
} from "./tools/friends.js";
import {
  addCampaignToGuild,
  addCampaignToGuildInputSchema,
  addGuildCalendarEvent,
  addGuildCalendarEventInputSchema,
  createdEventResponseOutputSchema,
  getGuild,
  getGuildInputSchema,
  guildDetailOutputSchema,
  guildMemberOutputSchema,
  guildSummaryOutputSchema,
  inviteGuildMember,
  inviteGuildMemberInputSchema,
  listGuildMembers,
  listGuildMembersInputSchema,
  listGuilds,
  listGuildsInputSchema,
  type GuildSummary,
  removeGuildMember,
  removeGuildMemberInputSchema,
  setGuildMemberRole,
  setGuildMemberRoleInputSchema,
} from "./tools/guild.js";
import {
  campaignSessionOutputSchema,
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

type ToolTextContent = Array<{ type: "text"; text: string }>;
type ToolStructuredContent = Record<string, unknown>;
type ToolResult = { content: ToolTextContent; structuredContent?: ToolStructuredContent; isError?: boolean };

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
const GUILD_READ_META = { securitySchemes: [{ type: "oauth2", scopes: ["guild.read"] }] };
const GUILD_WRITE_META = { securitySchemes: [{ type: "oauth2", scopes: ["guild.write"] }] };
const GUILD_ADMIN_META = { securitySchemes: [{ type: "oauth2", scopes: ["guild.admin"] }] };
const FRIENDS_READ_META = { securitySchemes: [{ type: "oauth2", scopes: ["friends.read"] }] };
const FRIENDS_WRITE_META = { securitySchemes: [{ type: "oauth2", scopes: ["friends.write"] }] };
const INVITE_WRITE_META = { securitySchemes: [{ type: "oauth2", scopes: ["invite.write"] }] };
const FORUM_READ_META  = { securitySchemes: [{ type: "oauth2", scopes: ["forum.read"]  }] };
const FORUM_WRITE_META = { securitySchemes: [{ type: "oauth2", scopes: ["forum.write"] }] };
const NO_META = { securitySchemes: [] as Array<{ type: string; scopes: string[] }> };

function toUserMessage(err: unknown): string {
  if (err instanceof ArgoApiError) {
    switch (err.status) {
      case 401: return err.message;
      case 403: {
        const upstream = err.message?.trim();
        if (upstream && !/^forbidden$/i.test(upstream)) return upstream;
        return "Access denied — your grant does not cover this campaign, or the grant has been revoked. Visit https://app.argo.games/oauth2/mcp-connect to reconnect.";
      }
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

// Anthropic Connector requirement: tool results must not exceed 25,000 tokens.
// We approximate tokens as ceil(byteLength / 4) over the serialized payload —
// generous enough that real model tokenisation will stay under the bar, cheap
// enough to compute on every call. The cap is enforced centrally here so a new
// tool can never forget it; the offending tools today are the *_list / *_search
// surfaces that can fan out over a large guild archive.
const RESULT_TOKEN_CAP = 25_000;
const APPROX_CHARS_PER_TOKEN = 4;
const RESULT_CHAR_CAP = RESULT_TOKEN_CAP * APPROX_CHARS_PER_TOKEN;

function capToolResult(result: ToolResult): ToolResult {
  const textLen = result.content.reduce((n, c) => n + c.text.length, 0);
  const structLen = result.structuredContent
    ? JSON.stringify(result.structuredContent).length
    : 0;
  if (textLen + structLen <= RESULT_CHAR_CAP) return result;

  const hint =
    "Result truncated: this tool returned more than 25,000 tokens, which exceeds the Anthropic " +
    "Connector limit. Narrow your query — add filters, pass a smaller limit, or paginate.";
  return {
    content: [{ type: "text", text: hint }],
    structuredContent: { truncated: true, reason: "result_exceeds_25k_tokens" },
    isError: true,
  };
}

async function runTool<T>(fn: () => Promise<T>, format: (result: T) => ToolResult): Promise<ToolResult> {
  try {
    return capToolResult(format(await fn()));
  } catch (err) {
    return { content: [{ type: "text", text: toUserMessage(err) }], isError: true };
  }
}

const json = (v: unknown) => JSON.stringify(v, null, 2);
const textContent = (text: string): ToolTextContent => [{ type: "text", text }];
const withStructuredContent = <T extends object>(text: string, structuredContent: T): ToolResult => ({
  content: textContent(text),
  structuredContent: structuredContent as ToolStructuredContent,
});

const successOutputSchema = z.object({
  success: z.literal(true),
});

const campaignListOutputSchema = z.object({
  campaigns: z.array(campaignSummaryOutputSchema),
  idMap: z.record(z.string()),
});

const guildListOutputSchema = z.object({
  guilds: z.array(guildSummaryOutputSchema),
  idMap: z.record(z.string()),
});

const mnemonListOutputSchema = z.object({
  entries: z.array(mnemonSummaryOutputSchema),
  idMap: z.record(z.string()),
});

const coGmListOutputSchema = z.object({
  items: z.array(coGmOutputSchema),
});

const sessionListOutputSchema = z.object({
  items: z.array(campaignSessionOutputSchema),
});

const guildMemberListOutputSchema = z.object({
  items: z.array(guildMemberOutputSchema),
});

const friendListOutputSchema = z.object({
  items: z.array(userDetailOutputSchema),
});

const friendRequestListOutputSchema = z.object({
  items: z.array(friendRequestRecordOutputSchema),
});

const removeCoGmOutputSchema = successOutputSchema.extend({
  campaignId: z.string(),
  userId: z.string(),
});

const deleteRelationshipOutputSchema = successOutputSchema.extend({
  campaignId: z.string(),
  relationshipId: z.string(),
});

const guildMutationOutputSchema = successOutputSchema.extend({
  guildId: z.string(),
});

const guildMemberMutationOutputSchema = guildMutationOutputSchema.extend({
  userId: z.string(),
});

const guildRoleMutationOutputSchema = guildMemberMutationOutputSchema.extend({
  role: z.enum(["Owner", "Admin", "Member"]),
});

// Format list responses. IDs are included in the text payload so clients that
// do not surface structuredContent (e.g. Claude.ai chat) can still see them;
// the model is expected to use IDs for tool calls but not echo them to the user.

function fmtCampaigns(campaigns: CampaignSummary[]): string {
  const lines = campaigns.map(
    (c) => `• ${c.campaignName}${c.ruleSystem ? ` (${c.ruleSystem})` : ""} — ${c.accessLevel ?? "read"}  [id: ${c.id}]`
  );
  return `${campaigns.length} campaign(s):\n${lines.join("\n")}`;
}

function fmtGuilds(guilds: GuildSummary[]): string {
  const lines = guilds.map(
    (g) => `• ${g.name} — ${g.role} (${g.memberCount} member${g.memberCount === 1 ? "" : "s"}, ${g.campaignCount} campaign${g.campaignCount === 1 ? "" : "s"})  [id: ${g.guildId}]`
  );
  return `${guilds.length} guild(s):\n${lines.join("\n")}`;
}

function fmtBulkResponse(resp: MnemonBulkResponse, verb: string): ToolResult {
  const ok = resp.results.filter((r) => r.success);
  const fail = resp.results.filter((r) => !r.success);
  const parts = [`${verb}: ${ok.length} succeeded, ${fail.length} failed.`];
  if (ok.length) {
    parts.push(
      ok
        .map((r) => {
          const label = r.title ? `"${r.title}"` : `item ${r.index}`;
          const warns = r.warnings && r.warnings.length > 0 ? ` (${r.warnings.length} warning${r.warnings.length === 1 ? "" : "s"})` : "";
          return `• ${label}${warns}`;
        })
        .join("\n")
    );
  }
  if (fail.length) {
    parts.push(
      `Failed:\n${fail
        .map((r) => {
          const opIdx = r.failedOpIndex !== undefined ? ` [op ${r.failedOpIndex}]` : "";
          return `• item ${r.index}${opIdx}: ${r.error ?? "unknown error"}`;
        })
        .join("\n")}`
    );
  }
  // Surface first few warnings inline for visibility; LLM can call get_mnemon for the rest.
  const warningLines = ok.flatMap((r) => (r.warnings ?? []).map((w) => `• [${r.title ?? `item ${r.index}`}] ${w}`));
  if (warningLines.length > 0) {
    const shown = warningLines.slice(0, 10);
    const more = warningLines.length - shown.length;
    parts.push(`Warnings:\n${shown.join("\n")}${more > 0 ? `\n• …and ${more} more` : ""}`);
  }
  return withStructuredContent(parts.join("\n\n"), resp);
}

function fmtMnemons(entries: MnemonSummary[]): string {
  const lines = entries.map((e) => `• ${e.title} [${e.type}]  [id: ${e.entryId}]`);
  return `${entries.length} entry(ies):\n${lines.join("\n")}`;
}

export function createServer(): McpServer {
  const server = new McpServer(
    { name: "argo-mcp", version: "1.1.0" },
    {
      instructions:
        "ID handling: every list_* tool includes an `[id: …]` suffix on each entry " +
        "in its text response (and the same IDs in structuredContent.idMap). You MUST " +
        "use those IDs verbatim when calling any tool that takes a guildId, campaignId, " +
        "entryId, relationshipId, userId, or sessionId — do not ask the user for an ID " +
        "you can resolve from a list_* call. " +
        "Display policy: in your prose to the user, refer to resources by name/title " +
        "(campaignName, guild name, mnemon title) rather than printing the raw ID. " +
        "Only show an ID if the user explicitly asks for it. " +
        "Ambiguity: if two resources share the same name, distinguish by campaign, " +
        "type, date, or description — never by showing raw IDs.",
    }
  );

  // Helpers used by the per-type mnemon create/update tool registrations below.
  // Defined inside createServer so they close over `server` and stay tidy at the
  // call sites (just name + description + schema + fn).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function registerCreateMnemonsTool<S extends z.ZodObject<any>>(
    name: string,
    description: string,
    schema: S,
    fn: (input: z.infer<S>) => Promise<MnemonBulkResponse>
  ): void {
    server.registerTool(
      name,
      {
        description,
        inputSchema: schema.shape,
        outputSchema: mnemonBulkResponseOutputSchema,
        annotations: WRITE_SAFE,
        _meta: WRITE_META,
      },
      (input: z.infer<S>) =>
        runTool(
          () => fn(input),
          (resp: MnemonBulkResponse) => fmtBulkResponse(resp, "Create")
        )
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function registerUpdateMnemonsTool<S extends z.ZodObject<any>>(
    name: string,
    description: string,
    schema: S,
    fn: (input: z.infer<S>) => Promise<MnemonBulkResponse>
  ): void {
    server.registerTool(
      name,
      {
        description,
        inputSchema: schema.shape,
        outputSchema: mnemonBulkResponseOutputSchema,
        annotations: WRITE_SAFE,
        _meta: WRITE_META,
      },
      (input: z.infer<S>) =>
        runTool(
          () => fn(input),
          (resp: MnemonBulkResponse) => fmtBulkResponse(resp, "Update")
        )
    );
  }

  // -------------------------------------------------------------------------
  // Campaign — read
  // -------------------------------------------------------------------------

  server.registerTool(
    "list_campaigns",
    {
      description:
        "List all Argo campaigns the current grant token has access to, including the access level " +
        "(\"read\" or \"read+write\") for each. Call this first when the user has not provided a " +
        "campaign ID. Each entry includes both `campaignName` and `id` (shown inline as `[id: …]` " +
        "and also in structuredContent.idMap). Use the `id` verbatim for any subsequent tool call " +
        "that takes a `campaignId`. In prose to the user, refer to campaigns by `campaignName`; " +
        "do not print the raw `id` unless asked.",
      inputSchema: listCampaignsInputSchema.shape,
      outputSchema: campaignListOutputSchema,
      annotations: READ_ONLY,
      _meta: READ_META,
    },
    () =>
      runTool(
        () => listCampaigns(),
        (campaigns: CampaignSummary[]) => withStructuredContent(
          campaigns.length === 0
            ? "No campaigns found in the current grant. The token may not cover any campaigns."
            : fmtCampaigns(campaigns),
          {
            campaigns,
            idMap: Object.fromEntries(campaigns.map((c) => [c.campaignName, c.id])),
          }
        )
      )
  );

  server.registerTool(
    "get_campaign",
    {
      description:
        "Retrieve details of an Argo campaign (name, description, rule system, co-GMs).",
      inputSchema: getCampaignInputSchema.shape,
      outputSchema: campaignOutputSchema,
      annotations: READ_ONLY,
      _meta: READ_META,
    },
    (input) =>
      runTool(
        () => getCampaign(input),
        (campaign) => withStructuredContent(json(campaign), campaign)
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
      outputSchema: campaignSummaryOutputSchema,
      annotations: WRITE_SAFE,
      _meta: CREATE_META,
    },
    (input) =>
      runTool(
        () => createCampaign(input),
        (campaign) => withStructuredContent(
          `Created campaign: "${campaign.campaignName}".\n\n${json(campaign)}`,
          campaign
        )
      )
  );

  // -------------------------------------------------------------------------
  // Campaign — update (campaign.write)
  // -------------------------------------------------------------------------

  server.registerTool(
    "update_campaign",
    {
      description:
        "Update a campaign's display name and/or description. Both fields optional — only " +
        "supplied fields are changed; pass an empty string to clear the description. " +
        "GMs and co-GMs can call this; rule-system swaps remain WebApp-only.",
      inputSchema: updateCampaignInputSchema.shape,
      outputSchema: campaignOutputSchema,
      annotations: WRITE_SAFE,
      _meta: WRITE_META,
    },
    (input) =>
      runTool(
        () => updateCampaign(input),
        (campaign) => withStructuredContent(
          `Updated campaign "${campaign.campaignName}".\n\n${json(campaign)}`,
          campaign
        )
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
      outputSchema: coGmListOutputSchema,
      annotations: READ_ONLY,
      _meta: READ_META,
    },
    (input) =>
      runTool(
        () => listCoGms(input),
        (cogms: CoGm[]) => withStructuredContent(
          cogms.length === 0 ? "No co-GMs on this campaign." : json(cogms),
          { items: cogms }
        )
      )
  );

  server.registerTool(
    "add_co_gm",
    {
      description:
        "Add a user as an assistant GM (co-GM) of a campaign. Owner-only — the calling user must " +
        "be the campaign's primary GM. Maximum 5 co-GMs per campaign.",
      inputSchema: addCoGmInputSchema.shape,
      outputSchema: campaignOutputSchema,
      annotations: WRITE_SAFE,
      _meta: WRITE_META,
    },
    (input) =>
      runTool(
        () => addCoGm(input),
        (campaign: Campaign) => withStructuredContent(
          `Added co-GM. Current co-GMs: ${json(campaign.coGameMasterIds ?? [])}`,
          campaign
        )
      )
  );

  server.registerTool(
    "remove_co_gm",
    {
      description:
        "Remove a co-GM from a campaign. Owner-only or self-removal.",
      inputSchema: removeCoGmInputSchema.shape,
      outputSchema: removeCoGmOutputSchema,
      annotations: WRITE_DESTRUCTIVE,
      _meta: WRITE_META,
    },
    (input) =>
      runTool(
        () => removeCoGm(input),
        () => withStructuredContent("Removed co-GM.", {
          success: true as const,
          campaignId: input.campaignId,
          userId: input.userId,
        })
      )
  );

  // -------------------------------------------------------------------------
  // Mnemon — read
  // -------------------------------------------------------------------------

  server.registerTool(
    "describe_mnemon_types",
    {
      description:
        "Returns a catalog of all mnemon types, their type-specific fields, and the " +
        "full valid relationship matrix (sourceType → label → targetType). " +
        "Call this before create_mnemon or create_mnemon_relationship when you are " +
        "unsure which type or label to use. NPC subtype is strictly FACTION | INDIVIDUAL.",
      inputSchema: describeMnemonTypesInputSchema.shape,
      outputSchema: describeMnemonTypesOutputSchema,
      annotations: READ_ONLY,
      _meta: NO_META,
    },
    () =>
      runTool(
        () => Promise.resolve(describeMnemonTypes()),
        (catalog) => withStructuredContent(json(catalog), catalog)
      )
  );

  server.registerTool(
    "list_mnemons",
    {
      description:
        "List mnemon (lore/memory) entries for an Argo campaign. " +
        "Optional filters: `title` (case-insensitive substring on entry title only) and " +
        "`type` (e.g. NPC, Location, Quest). Returns all matching entries — pagination is automatic. " +
        "Each entry includes both `title` and `entryId` (shown inline as `[id: …]` and in " +
        "structuredContent.idMap). Use the `entryId` verbatim for any tool that takes one; " +
        "refer to entries by `title` in prose to the user.",
      inputSchema: listMnemonsInputSchema.shape,
      outputSchema: mnemonListOutputSchema,
      annotations: READ_ONLY,
      _meta: READ_META,
    },
    (input) =>
      runTool(
        () => listMnemons(input),
        (entries: MnemonSummary[]) => withStructuredContent(
          entries.length === 0 ? "No mnemon entries found." : fmtMnemons(entries),
          {
            entries,
            idMap: Object.fromEntries(entries.map((e) => [`${e.title}|${e.type}`, e.entryId])),
          }
        )
      )
  );

  server.registerTool(
    "get_mnemon",
    {
      description: "Get the full details of a specific mnemon entry (title, blocks, type properties).",
      inputSchema: getMnemonInputSchema.shape,
      outputSchema: mnemonEntryOutputSchema,
      annotations: READ_ONLY,
      _meta: READ_META,
    },
    (input) =>
      runTool(
        () => getMnemon(input),
        (entry) => withStructuredContent(json(entry), entry)
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
      outputSchema: relationshipsResponseOutputSchema,
      annotations: READ_ONLY,
      _meta: READ_META,
    },
    (input) =>
      runTool(
        () => listMnemonRelationships(input),
        (resp: RelationshipsResponse) => withStructuredContent(json(resp), resp)
      )
  );

  // -------------------------------------------------------------------------
  // Mnemon — write
  // -------------------------------------------------------------------------

  // Per-type create tools. Each takes items[] (1-50). Use the per-type tool —
  // the schemas only expose fields that apply to that type. For mixed-type
  // seeding, call multiple of these tools in one turn. Text inside each block's
  // `content` is HTML — see describe_mnemon_types.htmlFormat.
  registerCreateMnemonsTool(
    "create_npc_mnemons",
    "Create NPC mnemons (FACTION or INDIVIDUAL). npcType is REQUIRED on each item. Use memberNpcEntryIds (on FACTIONs) and affiliationEntryIds (on INDIVIDUALs) to wire membership; the server projects into MEMBER relationships. Players may not call this — GM/co-GM only.",
    createNpcMnemonsInputSchema,
    createNpcMnemons
  );
  registerCreateMnemonsTool(
    "create_location_mnemons",
    "Create Location mnemons (places — cities, dungeons, taverns). Use create_mnemon_relationship with PARENT_OF to nest larger places under one another after creation. Players may not call this — GM/co-GM only.",
    createLocationMnemonsInputSchema,
    createLocationMnemons
  );
  registerCreateMnemonsTool(
    "create_quest_mnemons",
    "Create Quest mnemons. questStatus is one of active|completed|failed. Players may not call this — GM/co-GM only.",
    createQuestMnemonsInputSchema,
    createQuestMnemons
  );
  registerCreateMnemonsTool(
    "create_lore_mnemons",
    "Create Lore mnemons (world background, factions' beliefs, history). Players may not call this — GM/co-GM only.",
    createLoreMnemonsInputSchema,
    createLoreMnemons
  );
  registerCreateMnemonsTool(
    "create_archive_mnemons",
    "Create Archive mnemons (archived lore that is no longer current). Players may not call this — GM/co-GM only.",
    createArchiveMnemonsInputSchema,
    createArchiveMnemons
  );
  registerCreateMnemonsTool(
    "create_journal_mnemons",
    "Create Journal mnemons (log of in-world events). Players may not call this — GM/co-GM only.",
    createJournalMnemonsInputSchema,
    createJournalMnemons
  );
  registerCreateMnemonsTool(
    "create_session_summary_mnemons",
    "Create SessionSummary mnemons (structured summaries of game sessions). Players may not call this — GM/co-GM only.",
    createSessionSummaryMnemonsInputSchema,
    createSessionSummaryMnemons
  );
  registerCreateMnemonsTool(
    "create_player_mnemons",
    "Create Player mnemons (party root, character notes, party notes). For playerKind=CHARACTER, supply parentEntryId (the PARTY mnemon), partyId (CampaignParty.id), and characterId (SessionCharacter id) or the entry will be auto-detached. Players with campaign.write may call this for a party they belong to; GMs may call for any party.",
    createPlayerMnemonsInputSchema,
    createPlayerMnemons
  );
  registerCreateMnemonsTool(
    "create_custom_mnemons",
    "Create custom-typed mnemons (any free-form entry that doesn't fit the other types). Players may not call this — GM/co-GM only.",
    createCustomMnemonsInputSchema,
    createCustomMnemons
  );

  // Per-type update tools — typed/meta fields ONLY (title, visibility, tags,
  // type-specific fields). Block-level edits go through update_mnemons_content.
  // All fields except entryId are optional; unset fields are preserved.
  registerUpdateMnemonsTool(
    "update_npc_mnemons",
    "Update typed/meta fields of NPC mnemons (visibility, tags, npcType, faction membership, etc.). Does NOT modify content blocks — use update_mnemons_content for that. Set visibility=PUBLIC on multiple NPCs in a single call by listing them in items[].",
    updateNpcMnemonsInputSchema,
    updateNpcMnemons
  );
  registerUpdateMnemonsTool(
    "update_location_mnemons",
    "Update typed/meta fields of Location mnemons.",
    updateLocationMnemonsInputSchema,
    updateLocationMnemons
  );
  registerUpdateMnemonsTool(
    "update_quest_mnemons",
    "Update typed/meta fields of Quest mnemons (status transitions, expiry, related entries).",
    updateQuestMnemonsInputSchema,
    updateQuestMnemons
  );
  registerUpdateMnemonsTool(
    "update_lore_mnemons",
    "Update typed/meta fields of Lore mnemons.",
    updateLoreMnemonsInputSchema,
    updateLoreMnemons
  );
  registerUpdateMnemonsTool(
    "update_archive_mnemons",
    "Update typed/meta fields of Archive mnemons.",
    updateArchiveMnemonsInputSchema,
    updateArchiveMnemons
  );
  registerUpdateMnemonsTool(
    "update_journal_mnemons",
    "Update typed/meta fields of Journal mnemons.",
    updateJournalMnemonsInputSchema,
    updateJournalMnemons
  );
  registerUpdateMnemonsTool(
    "update_session_summary_mnemons",
    "Update typed/meta fields of SessionSummary mnemons.",
    updateSessionSummaryMnemonsInputSchema,
    updateSessionSummaryMnemons
  );
  registerUpdateMnemonsTool(
    "update_player_mnemons",
    "Update typed/meta fields of Player mnemons.",
    updatePlayerMnemonsInputSchema,
    updatePlayerMnemons
  );
  registerUpdateMnemonsTool(
    "update_custom_mnemons",
    "Update typed/meta fields of Custom-typed mnemons.",
    updateCustomMnemonsInputSchema,
    updateCustomMnemons
  );

  // Content-edit tool — block-level append/insertAfter/replace/remove ops,
  // shared across all mnemon types. Block ids come from get_mnemon. Atomic
  // per entry; multiple entries in one call run independently.
  server.registerTool(
    "update_mnemons_content",
    {
      description:
        "Edit the content blocks of one or more mnemon entries. Each item carries an entryId and an ordered list of ops (append, insertAfter, replace, remove) applied atomically per entry. " +
        "Block addressing: get block ids from get_mnemon, then target them in replace/remove/insertAfter. New blocks (append, insertAfter, replace) get fresh server-generated UUIDs. " +
        "Text in block 'text' is HTML — use <b>, <i>, <a>, <br>, <img>; do NOT use Markdown like '**bold**' or '# heading'. Use blockType for paragraph/heading1/heading2/bullet_list/numbered_list/todo/quote/code/callout/divider/image. " +
        "Inline <img src=\"data:...\"> or <img src=\"https://...\"> is uploaded to the campaign asset bucket and the src is rewritten to asset:<id>. SSRF-blocked / oversize / failed fetches are stripped with a warning. " +
        "On a bad op (missing blockId, unknown blockType, etc.) the whole entry's batch is rejected with the failedOpIndex; no partial mutation per entry.",
      inputSchema: updateMnemonsContentInputSchema.shape,
      outputSchema: mnemonBulkResponseOutputSchema,
      annotations: WRITE_SAFE,
      _meta: WRITE_META,
    },
    (input) =>
      runTool(
        () => updateMnemonsContent(input),
        (resp: MnemonBulkResponse) => fmtBulkResponse(resp, "Content update")
      )
  );

  server.registerTool(
    "create_mnemon_relationship",
    {
      description:
        "Create a relationship between two mnemon entries. " +
        "All 7 labels: MEMBER (NPC ∈ Faction, bidirectional), ALLY (bidirectional), " +
        "ENEMY (directional), RIVAL (directional), " +
        "PARENT_OF (Location hierarchy — sourceEntryId is the outer/larger place, " +
        "e.g. Region → City → District → Tavern), " +
        "CONTAINS (Location → NPC present there), LOCATED_IN (NPC → Location; inverse of CONTAINS). " +
        "sourceEntryId is the 'from' side; targetEntryId is the 'to' side — direction matters. " +
        "Call describe_mnemon_types for the full valid (sourceType, label, targetType) matrix. " +
        "For faction membership prefer memberNpcEntryIds / affiliationEntryIds on the NPC itself.",
      inputSchema: createMnemonRelationshipInputSchema.shape,
      outputSchema: relationshipOutputSchema,
      annotations: WRITE_SAFE,
      _meta: WRITE_META,
    },
    (input) =>
      runTool(
        () => createMnemonRelationship(input),
        (rel: Relationship) => withStructuredContent(`Created ${rel.label} relationship.`, rel)
      )
  );

  server.registerTool(
    "delete_mnemon_relationship",
    {
      description: "Delete a relationship by id.",
      inputSchema: deleteMnemonRelationshipInputSchema.shape,
      outputSchema: deleteRelationshipOutputSchema,
      annotations: WRITE_DESTRUCTIVE,
      _meta: WRITE_META,
    },
    (input) =>
      runTool(
        () => deleteMnemonRelationship(input),
        () => withStructuredContent("Deleted relationship.", {
          success: true as const,
          campaignId: input.campaignId,
          relationshipId: input.relationshipId,
        })
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
      outputSchema: campaignSessionOutputSchema,
      annotations: WRITE_SAFE,
      _meta: WRITE_META,
    },
    (input) =>
      runTool(
        () => createSession(input),
        (s: CampaignSession) => withStructuredContent(`Scheduled "${s.title}" @ ${s.startAt}.`, s)
      )
  );

  server.registerTool(
    "list_sessions",
    {
      description:
        "List campaign sessions for a given month (defaults to the current month).",
      inputSchema: listSessionsInputSchema.shape,
      outputSchema: sessionListOutputSchema,
      annotations: READ_ONLY,
      _meta: READ_META,
    },
    (input) =>
      runTool(
        () => listSessions(input),
        (sessions: CampaignSession[]) => withStructuredContent(
          sessions.length === 0 ? "No sessions scheduled in this window." : json(sessions),
          { items: sessions }
        )
      )
  );

  server.registerTool(
    "get_session",
    {
      description: "Get details of a single campaign session.",
      inputSchema: getSessionInputSchema.shape,
      outputSchema: campaignSessionOutputSchema,
      annotations: READ_ONLY,
      _meta: READ_META,
    },
    (input) =>
      runTool(
        () => getSession(input),
        (s: CampaignSession) => withStructuredContent(json(s), s)
      )
  );

  server.registerTool(
    "update_session",
    {
      description:
        "Reschedule a campaign session or edit its title/description. All fields optional. " +
        "Owner-only on the backend.",
      inputSchema: updateSessionInputSchema.shape,
      outputSchema: campaignSessionOutputSchema,
      annotations: WRITE_SAFE,
      _meta: WRITE_META,
    },
    (input) =>
      runTool(
        () => updateSession(input),
        (s: CampaignSession) => withStructuredContent(`Updated session "${s.title}".`, s)
      )
  );

  // -------------------------------------------------------------------------
  // Guild — read (guild.read)
  // -------------------------------------------------------------------------

  server.registerTool(
    "list_guilds",
    {
      description:
        "List the guilds the current user belongs to, with role (Owner/Admin/Member), " +
        "member count, and campaign count. Requires the guild.read scope. " +
        "Each entry includes both `name` and `guildId` (shown inline as `[id: …]` and in " +
        "structuredContent.idMap). Use the `guildId` verbatim for any tool that takes one; " +
        "refer to guilds by `name` in prose to the user.",
      inputSchema: listGuildsInputSchema.shape,
      outputSchema: guildListOutputSchema,
      annotations: READ_ONLY,
      _meta: GUILD_READ_META,
    },
    () =>
      runTool(
        () => listGuilds(),
        (guilds) => withStructuredContent(
          guilds.length === 0
            ? "You are not a member of any guilds."
            : fmtGuilds(guilds),
          {
            guilds,
            idMap: Object.fromEntries(guilds.map((g) => [g.name, g.guildId])),
          }
        )
      )
  );

  server.registerTool(
    "get_guild",
    {
      description: "Retrieve full details of a guild (members, campaigns, calendar metadata).",
      inputSchema: getGuildInputSchema.shape,
      outputSchema: guildDetailOutputSchema,
      annotations: READ_ONLY,
      _meta: GUILD_READ_META,
    },
    (input) =>
      runTool(
        () => getGuild(input),
        (guild) => withStructuredContent(json(guild), guild)
      )
  );

  server.registerTool(
    "list_guild_members",
    {
      description: "List the members of a guild (id, role, status, invitedAt, joinedAt).",
      inputSchema: listGuildMembersInputSchema.shape,
      outputSchema: guildMemberListOutputSchema,
      annotations: READ_ONLY,
      _meta: GUILD_READ_META,
    },
    (input) =>
      runTool(
        () => listGuildMembers(input),
        (members) => withStructuredContent(
          members.length === 0 ? "Guild has no members." : json(members),
          { items: members }
        )
      )
  );

  // -------------------------------------------------------------------------
  // Guild — member-level write (guild.write)
  // -------------------------------------------------------------------------

  server.registerTool(
    "add_campaign_to_guild",
    {
      description:
        "Add a campaign to a guild. Any active member of the guild can do this; " +
        "the calling user must be the campaign's GM (enforced server-side).",
      inputSchema: addCampaignToGuildInputSchema.shape,
      outputSchema: guildMutationOutputSchema.extend({
        campaignId: z.string(),
      }),
      annotations: WRITE_SAFE,
      _meta: GUILD_WRITE_META,
    },
    (input) =>
      runTool(
        () => addCampaignToGuild(input),
        () => withStructuredContent("Added campaign to guild.", {
          success: true as const,
          guildId: input.guildId,
          campaignId: input.campaignId,
        })
      )
  );

  // -------------------------------------------------------------------------
  // Guild — admin (guild.admin)
  // -------------------------------------------------------------------------

  server.registerTool(
    "invite_guild_member",
    {
      description: "Invite a user to join the guild. Owner/Admin only.",
      inputSchema: inviteGuildMemberInputSchema.shape,
      outputSchema: guildMemberMutationOutputSchema,
      annotations: WRITE_SAFE,
      _meta: GUILD_ADMIN_META,
    },
    (input) =>
      runTool(
        () => inviteGuildMember(input),
        () => withStructuredContent("Invited user to guild.", {
          success: true as const,
          guildId: input.guildId,
          userId: input.userId,
        })
      )
  );

  server.registerTool(
    "remove_guild_member",
    {
      description: "Remove a member from the guild. Owner/Admin only.",
      inputSchema: removeGuildMemberInputSchema.shape,
      outputSchema: guildMemberMutationOutputSchema,
      annotations: WRITE_DESTRUCTIVE,
      _meta: GUILD_ADMIN_META,
    },
    (input) =>
      runTool(
        () => removeGuildMember(input),
        () => withStructuredContent("Removed member from guild.", {
          success: true as const,
          guildId: input.guildId,
          userId: input.userId,
        })
      )
  );

  server.registerTool(
    "set_guild_member_role",
    {
      description:
        "Change a guild member's role to Owner, Admin, or Member. Owner/Admin only. " +
        "Note that promoting another user to Owner transfers the guild — confirm with the user first.",
      inputSchema: setGuildMemberRoleInputSchema.shape,
      outputSchema: guildRoleMutationOutputSchema,
      annotations: WRITE_SAFE,
      _meta: GUILD_ADMIN_META,
    },
    (input) =>
      runTool(
        () => setGuildMemberRole(input),
        () => withStructuredContent(`Set role to ${input.role}.`, {
          success: true as const,
          guildId: input.guildId,
          userId: input.userId,
          role: input.role,
        })
      )
  );

  server.registerTool(
    "add_guild_calendar_event",
    {
      description:
        "Add a new event to the guild's shared calendar. Owner/Admin only. " +
        "startDateTime / endDateTime are ISO-8601 (e.g. 2026-06-12T19:00:00).",
      inputSchema: addGuildCalendarEventInputSchema.shape,
      outputSchema: createdEventResponseOutputSchema,
      annotations: WRITE_SAFE,
      _meta: GUILD_ADMIN_META,
    },
    (input) =>
      runTool(
        () => addGuildCalendarEvent(input),
        (resp) => withStructuredContent("Created calendar event.", resp)
      )
  );

  // -------------------------------------------------------------------------
  // Friends (friends.read / friends.write)
  // -------------------------------------------------------------------------

  server.registerTool(
    "list_friends",
    {
      description: "List the current user's accepted friends.",
      inputSchema: listFriendsInputSchema.shape,
      outputSchema: friendListOutputSchema,
      annotations: READ_ONLY,
      _meta: FRIENDS_READ_META,
    },
    () =>
      runTool(
        () => listFriends(),
        (friends) => withStructuredContent(
          friends.length === 0 ? "You have no friends yet." : json(friends),
          { items: friends }
        )
      )
  );

  server.registerTool(
    "list_sent_friend_requests",
    {
      description: "List outgoing friend requests that are still pending.",
      inputSchema: listSentFriendRequestsInputSchema.shape,
      outputSchema: friendRequestListOutputSchema,
      annotations: READ_ONLY,
      _meta: FRIENDS_READ_META,
    },
    () =>
      runTool(
        () => listSentFriendRequests(),
        (reqs) => withStructuredContent(
          reqs.length === 0 ? "No pending sent requests." : json(reqs),
          { items: reqs }
        )
      )
  );

  server.registerTool(
    "list_received_friend_requests",
    {
      description: "List incoming friend requests awaiting your response.",
      inputSchema: listReceivedFriendRequestsInputSchema.shape,
      outputSchema: friendRequestListOutputSchema,
      annotations: READ_ONLY,
      _meta: FRIENDS_READ_META,
    },
    () =>
      runTool(
        () => listReceivedFriendRequests(),
        (reqs) => withStructuredContent(
          reqs.length === 0 ? "No pending received requests." : json(reqs),
          { items: reqs }
        )
      )
  );

  server.registerTool(
    "send_friend_request",
    {
      description: "Send a friend request to another Argo user.",
      inputSchema: sendFriendRequestInputSchema.shape,
      outputSchema: friendRequestRecordOutputSchema,
      annotations: WRITE_SAFE,
      _meta: FRIENDS_WRITE_META,
    },
    (input) =>
      runTool(
        () => sendFriendRequest(input),
        (request) => withStructuredContent("Friend request sent.", request)
      )
  );

  server.registerTool(
    "accept_friend_request",
    {
      description: "Accept an incoming friend request from the given user.",
      inputSchema: acceptFriendRequestInputSchema.shape,
      outputSchema: friendRequestRecordOutputSchema,
      annotations: WRITE_SAFE,
      _meta: FRIENDS_WRITE_META,
    },
    (input) =>
      runTool(
        () => acceptFriendRequest(input),
        (request) => withStructuredContent("Friend request accepted.", request)
      )
  );

  server.registerTool(
    "reject_friend_request",
    {
      description: "Reject an incoming friend request from the given user.",
      inputSchema: rejectFriendRequestInputSchema.shape,
      outputSchema: friendRequestRecordOutputSchema,
      annotations: WRITE_DESTRUCTIVE,
      _meta: FRIENDS_WRITE_META,
    },
    (input) =>
      runTool(
        () => rejectFriendRequest(input),
        (request) => withStructuredContent("Friend request rejected.", request)
      )
  );

  server.registerTool(
    "cancel_friend_request",
    {
      description: "Cancel a friend request you previously sent.",
      inputSchema: cancelFriendRequestInputSchema.shape,
      outputSchema: friendRequestRecordOutputSchema,
      annotations: WRITE_DESTRUCTIVE,
      _meta: FRIENDS_WRITE_META,
    },
    (input) =>
      runTool(
        () => cancelFriendRequest(input),
        (request) => withStructuredContent("Friend request cancelled.", request)
      )
  );

  // -------------------------------------------------------------------------
  // Invites (invite.write)
  // -------------------------------------------------------------------------

  server.registerTool(
    "invite_user_by_email",
    {
      description:
        "Send Argo email invitations to up to 20 addresses on behalf of the current user. " +
        "Recipients receive a sign-up link. No campaign or guild context is required.",
      inputSchema: inviteUserByEmailInputSchema.shape,
      outputSchema: sendInvitesResponseOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: true,
      },
      _meta: INVITE_WRITE_META,
    },
    (input) =>
      runTool(
        () => inviteUserByEmail(input),
        (resp) => withStructuredContent(`Invite results:\n${json(resp.results)}`, resp)
      )
  );

  // -------------------------------------------------------------------------
  // Forum — read (forum.read)
  // -------------------------------------------------------------------------

  server.registerTool(
    "forum_list_categories",
    {
      description:
        "List all Discourse forum categories at community.argo.games. " +
        "Call this first when the user wants to post a bug report or feature request — " +
        "you need the categoryId to create a topic.",
      inputSchema: forumListCategoriesInputSchema.shape,
      outputSchema: forumCategoriesOutputSchema,
      annotations: READ_ONLY,
      _meta: FORUM_READ_META,
    },
    () =>
      runTool(
        () => forumListCategories(),
        (result) => withStructuredContent(json(result), result)
      )
  );

  server.registerTool(
    "forum_list_topics",
    {
      description: "List topics in a specific forum category. Use forum_list_categories to get category slugs and IDs.",
      inputSchema: forumListTopicsInputSchema.shape,
      outputSchema: forumTopicListOutputSchema,
      annotations: READ_ONLY,
      _meta: FORUM_READ_META,
    },
    (input) =>
      runTool(
        () => forumListTopics(input),
        (result) => withStructuredContent(json(result), result)
      )
  );

  server.registerTool(
    "forum_get_latest_topics",
    {
      description: "Get the latest active topics across all forum categories.",
      inputSchema: forumGetLatestTopicsInputSchema.shape,
      outputSchema: forumTopicListOutputSchema,
      annotations: READ_ONLY,
      _meta: FORUM_READ_META,
    },
    () =>
      runTool(
        () => forumGetLatestTopics(),
        (result) => withStructuredContent(json(result), result)
      )
  );

  server.registerTool(
    "forum_read_topic",
    {
      description: "Read the full content of a forum topic including all posts and replies.",
      inputSchema: forumReadTopicInputSchema.shape,
      outputSchema: forumTopicDetailOutputSchema,
      annotations: READ_ONLY,
      _meta: FORUM_READ_META,
    },
    (input) =>
      runTool(
        () => forumReadTopic(input),
        (result) => withStructuredContent(json(result), result)
      )
  );

  server.registerTool(
    "forum_search",
    {
      description:
        "Search forum topics and posts. Supports Discourse search syntax: " +
        "#category-slug to filter by category, @username to filter by author. " +
        "Always search before creating a bug report or feature request to avoid duplicates.",
      inputSchema: forumSearchInputSchema.shape,
      outputSchema: forumSearchOutputSchema,
      annotations: READ_ONLY,
      _meta: FORUM_READ_META,
    },
    (input) =>
      runTool(
        () => forumSearch(input),
        (result) => withStructuredContent(json(result), result)
      )
  );

  server.registerTool(
    "forum_get_user_posts",
    {
      description: "List topics created by the current user on the forum.",
      inputSchema: forumGetUserPostsInputSchema.shape,
      outputSchema: forumTopicListOutputSchema,
      annotations: READ_ONLY,
      _meta: FORUM_READ_META,
    },
    () =>
      runTool(
        () => forumGetUserPosts(),
        (result) => withStructuredContent(json(result), result)
      )
  );

  server.registerTool(
    "forum_get_notifications",
    {
      description: "Get the current user's forum notifications (replies, mentions, likes).",
      inputSchema: forumGetNotificationsInputSchema.shape,
      outputSchema: forumNotificationsOutputSchema,
      annotations: READ_ONLY,
      _meta: FORUM_READ_META,
    },
    () =>
      runTool(
        () => forumGetNotifications(),
        (result) => withStructuredContent(json(result), result)
      )
  );

  // -------------------------------------------------------------------------
  // Forum — write (forum.write)
  // -------------------------------------------------------------------------

  server.registerTool(
    "forum_create_topic",
    {
      description:
        "Create a new forum topic (bug report, feature request, or general discussion). " +
        "Always call forum_search first to check for duplicates. " +
        "Call forum_list_categories to get the correct categoryId.",
      inputSchema: forumCreateTopicInputSchema.shape,
      outputSchema: forumPostResponseOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
      _meta: FORUM_WRITE_META,
    },
    (input) =>
      runTool(
        () => forumCreateTopic(input),
        (result) => withStructuredContent(`Topic created.\n\n${json(result)}`, result)
      )
  );

  server.registerTool(
    "forum_reply",
    {
      description: "Reply to an existing forum topic.",
      inputSchema: forumReplyInputSchema.shape,
      outputSchema: forumPostResponseOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
      _meta: FORUM_WRITE_META,
    },
    (input) =>
      runTool(
        () => forumReply(input),
        (result) => withStructuredContent(`Reply posted.\n\n${json(result)}`, result)
      )
  );

  return server;
}
