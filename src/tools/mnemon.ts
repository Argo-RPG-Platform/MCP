/**
 * MCP tools for reading and writing Argo campaign mnemon (memory/lore) entries.
 *
 * Per-type create + update tools, plus a single content-edit tool for body
 * mutations (append / insertAfter / replace / remove). Body content is authored
 * as Markdown; the server canonicalizes it to the rich document model. Mentions
 * use @[label](mnemon:<entryId>); images use ![caption](asset:<assetId>@<campaignId>)
 * (upload the asset first — inline base64 is not accepted in Markdown).
 */

import { z } from "zod";
import { ArgoApiError, argoDelete, argoGet, argoPost, argoPatch } from "../client.js";
import { MnemonResolver } from "./idResolution.js";

// ---------------------------------------------------------------------------
// Public types (mirror WebAPI DTOs)
// ---------------------------------------------------------------------------

export interface MnemonBlock {
  id: string;
  type: string;
  text?: string;
  assetId?: string;
  mimeType?: string;
  caption?: string;
  language?: string;
  checked?: boolean;
}

export interface MnemonSummary {
  entryId: string;
  title: string;
  type: string;
}

/**
 * A quest as the acting user may see it (ARGO-2148), read from its doc after
 * the doc was redacted for that user. Objective and chip ids are what
 * set_quest_objective_state and update_quest_mnemons name.
 */
export interface QuestProjection {
  status: string;
  kind: string;
  playersCanTick: boolean;
  /** Flattened in document order; depth and parentId rebuild the nesting. */
  objectives?: Array<{
    id?: string;
    text: string;
    state: string;
    optional: boolean;
    depth: number;
    parentId?: string;
    /** Staff reads only: true when players cannot see it. */
    hidden?: boolean;
  }>;
  rewards?: Array<{
    id?: string;
    kind: string;
    amount?: number;
    unit?: string;
    unitLabel?: string;
    label?: string;
    entryId?: string;
    ruleEntryId?: string;
    hidden?: boolean;
  }>;
  progress?: { done: number; total: number };
  rewardTotals?: {
    currency: Array<{ unit?: string; unitLabel?: string; amount?: number }>;
    xp?: number | null;
  };
}

export interface MnemonEntry {
  entryId: string;
  title: string;
  type: string;
  blocks: MnemonBlock[];
  typeProperties?: Record<string, unknown>;
  /** Quests only. */
  quest?: QuestProjection;
}

export interface MnemonItemResult {
  index: number;
  success: boolean;
  entryId?: string;
  title?: string;
  failedOpIndex?: number;
  error?: string;
  warnings?: string[];
}

export interface MnemonBulkResponse {
  results: MnemonItemResult[];
}

export interface Relationship {
  relationshipId: string;
  sourceId: string;
  targetId: string;
  label: string;
  color?: string;
  /** The edge's kind: containment | association | view_membership (Mnemon D33). */
  kind?: string;
  /** How the word reads: one_way | mutual. The word owns this (D29) — it is display, not input. */
  symmetry?: string;
  /** @deprecated the pre-split single field; still served for old readers. Read kind/symmetry. */
  direction?: string;
}

export interface LinkedEntry {
  entryId: string;
  title: string;
  type: string;
  relationshipTypes: string[];
}

export interface RelationshipsResponse {
  outgoing: Relationship[];
  incoming: Relationship[];
  linked: LinkedEntry[];
}

export const mnemonBlockOutputSchema = z.object({
  id: z.string(),
  type: z.string(),
  text: z.string().optional(),
  assetId: z.string().optional(),
  mimeType: z.string().optional(),
  caption: z.string().optional(),
  language: z.string().optional(),
  checked: z.boolean().optional(),
});

export const mnemonSummaryOutputSchema = z.object({
  entryId: z.string(),
  title: z.string(),
  type: z.string(),
});

// Vocabulary fields are plain strings here, not enums: a value the WebAPI adds
// later must not fail every read's output validation.
export const questProjectionOutputSchema = z.object({
  status: z.string().describe("Available | Active | Completed | Failed."),
  kind: z.string().describe("Main | Side | Personal."),
  playersCanTick: z.boolean(),
  objectives: z
    .array(
      z.object({
        id: z.string().optional().describe("Name it in set_quest_objective_state or update_quest_mnemons."),
        text: z.string(),
        state: z.string().describe("open | done | failed."),
        optional: z.boolean(),
        depth: z.number().describe("0 for a top-level objective."),
        parentId: z.string().optional(),
        hidden: z.boolean().optional().describe("GM reads only: true when players cannot see it."),
      })
    )
    .optional(),
  rewards: z
    .array(
      z.object({
        id: z.string().optional(),
        kind: z.string().describe("currency | xp | item | other."),
        amount: z.number().optional(),
        unit: z.string().optional(),
        unitLabel: z.string().optional(),
        label: z.string().optional(),
        entryId: z.string().optional(),
        ruleEntryId: z.string().optional(),
        hidden: z.boolean().optional(),
      })
    )
    .optional(),
  progress: z
    .object({ done: z.number(), total: z.number() })
    .optional()
    .describe("Required objectives done of those this user can see; optional and failed ones do not count."),
  rewardTotals: z
    .object({
      currency: z.array(
        z.object({ unit: z.string().optional(), unitLabel: z.string().optional(), amount: z.number().optional() })
      ),
      xp: z.number().nullable().optional(),
    })
    .optional(),
});

export const mnemonEntryOutputSchema = z.object({
  entryId: z.string(),
  title: z.string(),
  type: z.string(),
  blocks: z.array(mnemonBlockOutputSchema),
  typeProperties: z.record(z.unknown()).optional(),
  quest: questProjectionOutputSchema
    .optional()
    .describe("Quests only: status, kind, objectives, reward chips and progress as this user may see them."),
});

export const mnemonItemResultOutputSchema = z.object({
  index: z.number(),
  success: z.boolean(),
  entryId: z.string().optional(),
  title: z.string().optional(),
  failedOpIndex: z.number().optional(),
  error: z.string().optional(),
  warnings: z.array(z.string()).optional(),
});

export const mnemonBulkResponseOutputSchema = z.object({
  results: z.array(mnemonItemResultOutputSchema),
});

export const relationshipOutputSchema = z.object({
  relationshipId: z.string(),
  sourceId: z.string(),
  targetId: z.string(),
  label: z.string(),
  color: z.string().optional(),
  kind: z.string().optional(),
  symmetry: z.string().optional(),
  direction: z.string().optional(),
});

export const linkedEntryOutputSchema = z.object({
  entryId: z.string(),
  title: z.string(),
  type: z.string(),
  relationshipTypes: z.array(z.string()),
});

export const relationshipsResponseOutputSchema = z.object({
  outgoing: z.array(relationshipOutputSchema),
  incoming: z.array(relationshipOutputSchema),
  linked: z.array(linkedEntryOutputSchema),
});

export const describeMnemonTypesOutputSchema = z.object({
  types: z.array(z.object({
    type: z.string(),
    tool: z.string(),
    description: z.string(),
  })),
  markdownFormat: z.object({
    summary: z.string(),
    mentions: z.string(),
    images: z.string(),
  }),
  blockOps: z.object({
    tool: z.string(),
    ops: z.array(z.object({
      op: z.string(),
      required: z.array(z.string()),
      optional: z.array(z.string()),
      description: z.string(),
    })),
    atomicity: z.string(),
    addressing: z.string(),
  }),
  commonFields: z.array(z.object({
    name: z.string(),
    type: z.string(),
    values: z.array(z.string()).optional(),
    description: z.string(),
  })),
  relationshipLabels: z.array(z.string()),
  relationships: z.array(z.object({
    source: z.string(),
    label: z.string(),
    target: z.string(),
    description: z.string(),
  })),
  idReferences: z.string(),
  questBody: z.object({
    summary: z.string(),
    header: z.object({
      fields: z.array(z.string()),
      statusValues: z.array(z.string()),
      kindValues: z.array(z.string()),
      notes: z.string(),
    }),
    objective: z.object({
      fields: z.array(z.string()),
      stateValues: z.array(z.string()),
      notes: z.string(),
    }),
    reward: z.object({
      fields: z.array(z.string()),
      kindValues: z.array(z.string()),
      notes: z.string(),
    }),
    prose: z.string(),
    ticking: z.string(),
    retired: z.string(),
  }),
});

// ---------------------------------------------------------------------------
// describe_mnemon_types — discoverability for the LLM
// ---------------------------------------------------------------------------

export const describeMnemonTypesInputSchema = z.object({});

const RELATIONSHIP_LABELS = [
  "MEMBER",
  "ALLY",
  "ENEMY",
  "RIVAL",
  "PARENT_OF",
  "CONTAINS",
  "LOCATED_IN",
  "HAS_SUBQUEST",
  "QUEST_GIVER",
  "QUEST_LOCATION",
  "QUEST_RELATED_NPC",
  "QUEST_RELATED_LOCATION",
  "SESSION_ATTENDEE_CHARACTER",
  "SESSION_ATTENDEE_NPC",
  "SESSION_FEATURED_QUEST",
  "SESSION_FEATURED_LOCATION",
] as const;

const RELATIONSHIP_MATRIX: ReadonlyArray<{
  source: string;
  label: typeof RELATIONSHIP_LABELS[number];
  target: string;
  description: string;
}> = [
  { source: "Faction", label: "MEMBER", target: "NPC", description: "An NPC belongs to this faction." },
  { source: "Faction", label: "ALLY", target: "Faction", description: "Two factions are allies. Mutual — reads the same from both ends." },
  { source: "Faction", label: "ENEMY", target: "Faction", description: "Source faction is hostile to target. One-way." },
  { source: "Faction", label: "RIVAL", target: "Faction", description: "Two factions compete without open hostility. One-way." },
  { source: "NPC", label: "ALLY", target: "NPC", description: "Two NPCs are allies. Mutual — reads the same from both ends." },
  { source: "NPC", label: "ENEMY", target: "NPC", description: "Source NPC is hostile to target. One-way." },
  { source: "Location", label: "PARENT_OF", target: "Location", description: "Hierarchical containment: source is the larger place." },
  { source: "Location", label: "CONTAINS", target: "NPC", description: "An NPC is physically present at this location." },
  { source: "NPC", label: "LOCATED_IN", target: "Location", description: "An NPC is currently at this place. Inverse of CONTAINS." },
  { source: "Quest", label: "HAS_SUBQUEST", target: "Quest", description: "Source quest has the target as a subquest. Containment — nests under the parent quest in the tree. A quest has one parent: set it from the subquest with parentQuestId on create_quest_mnemons / update_quest_mnemons." },
  { source: "Quest", label: "QUEST_GIVER", target: "NPC", description: "Who gives the quest. One per quest: set it with giverId on create_quest_mnemons / update_quest_mnemons. Stored label: 'Quest giver'." },
  { source: "Quest", label: "QUEST_LOCATION", target: "Location", description: "Where the quest is given or set. One per quest: set it with locationId on create_quest_mnemons / update_quest_mnemons. Stored label: 'Quest location'." },
  { source: "Quest", label: "QUEST_RELATED_NPC", target: "NPC", description: "Quest references this NPC (issuer, target, witness, etc.). Mirrored by 'relatedNpcEntryIds'." },
  { source: "Quest", label: "QUEST_RELATED_LOCATION", target: "Location", description: "Quest references this location. Mirrored by 'relatedLocationEntryIds'." },
  { source: "SessionSummary", label: "SESSION_ATTENDEE_CHARACTER", target: "Player", description: "A character attended this session. Target is the CHARACTER-kind Player mnemon, not the character sheet. Stored label: 'Attendee'." },
  { source: "SessionSummary", label: "SESSION_ATTENDEE_NPC", target: "NPC", description: "An NPC appeared in this session. Stored label: 'NPC Present'." },
  { source: "SessionSummary", label: "SESSION_FEATURED_QUEST", target: "Quest", description: "This session advanced or featured the quest. Stored label: 'Featured Quest'." },
  { source: "SessionSummary", label: "SESSION_FEATURED_LOCATION", target: "Location", description: "This session took place at or featured the location. Stored label: 'Featured Location'." },
];

export function describeMnemonTypes(): object {
  return {
    types: [
      { type: "NPC", tool: "create_npc_mnemons / update_npc_mnemons", description: "A non-player character — a person (INDIVIDUAL) or organization (FACTION)." },
      { type: "Location", tool: "create_location_mnemons / update_location_mnemons", description: "A place in the world." },
      { type: "Quest", tool: "create_quest_mnemons / update_quest_mnemons / set_quest_objective_state", description: "A quest or mission: a status and kind, objectives, reward chips, a Background and GM-only notes. See questBody." },
      { type: "Lore", tool: "create_lore_mnemons / update_lore_mnemons", description: "World lore or background information." },
      { type: "Archive", tool: "create_archive_mnemons / update_archive_mnemons", description: "Archived lore entry." },
      { type: "Journal", tool: "create_journal_mnemons / update_journal_mnemons", description: "A session journal entry." },
      { type: "SessionSummary", tool: "create_session_summary_mnemons / update_session_summary_mnemons", description: "Structured session summary." },
      { type: "Player", tool: "create_player_mnemons / update_player_mnemons", description: "Player-facing mnemon (party root, character notes, party notes)." },
      { type: "Custom", tool: "create_custom_mnemons / update_custom_mnemons", description: "Custom entry type with free-form title." },
    ],
    markdownFormat: {
      summary: "Mnemon body content is authored as Markdown (headings, lists, quotes, code fences, bold/italic/strikethrough, links). The server canonicalizes it to the rich document model; do not send HTML.",
      mentions: "Link to another mnemon with @[label](mnemon:<entryId>) — label is display text, the id is the target entry id from get_mnemon / list_mnemons.",
      images: "Embed an uploaded asset with ![caption](asset:<assetId>@<campaignId>). Upload the image first via the campaign asset tool, then reference it — inline base64 / data: URLs are not accepted in Markdown.",
    },
    blockOps: {
      tool: "update_mnemons_content",
      ops: [
        { op: "append", required: ["markdown"], optional: [], description: "Add the Markdown content to the END of the entry body. Use this to ADD information — it never resends or clobbers the existing body." },
        { op: "insertAfter", required: ["afterBlockId", "markdown"], optional: [], description: "Insert the Markdown content immediately after the body node with afterBlockId." },
        { op: "replace", required: ["blockId", "markdown"], optional: [], description: "Replace the body node with blockId. The first new node keeps the original id so later ops can still address it." },
        { op: "remove", required: ["blockId"], optional: [], description: "Delete the body node with blockId." },
      ],
      atomicity: "All ops for one entry are validated up-front and applied atomically. A bad op rejects the whole entry's batch with the offending opIndex; no partial mutation. Multiple entries in one call are independent — each entry's batch is its own transaction.",
      addressing: "Each body node returned by get_mnemon has a stable id. Use those ids for replace / remove / insertAfter. A single op's Markdown may produce several nodes; new nodes get fresh server-generated ids.",
    },
    commonFields: [
      { name: "visibility", type: "enum", values: ["HIDDEN", "INTERNAL", "PUBLIC"], description: "HIDDEN: GM only. INTERNAL: party members (default). PUBLIC: requires a published campaign." },
      { name: "tags", type: "string[]", description: "Optional tag list." },
    ],
    relationshipLabels: RELATIONSHIP_LABELS,
    relationships: RELATIONSHIP_MATRIX,
    idReferences: "All entryId-shaped fields accept a hex entryId OR a mnemon's exact title — the MCP server resolves titles to hex IDs before calling the API. Title→id resolution fails (with candidate ids) when a title matches multiple mnemons.",
    questBody: {
      summary: "A quest's body is a document the server builds from the same template the Argo app uses: an objective list, a Rewards list of chips, a Background and GM-only notes. Write them with the typed fields of create_quest_mnemons / update_quest_mnemons — never as Markdown checklists or reward lines — and read them back from get_mnemon's `quest`, which also carries progress and reward totals.",
      header: {
        fields: ["status", "kind", "playersCanTick", "hook", "giverId", "locationId", "parentQuestId"],
        statusValues: [...QUEST_STATUSES],
        kindValues: [...QUEST_KINDS],
        notes: "status reads as Available and kind as Side when unset. playersCanTick lets players tick the objectives they can see (off by default). hook is the one line players see under the title in the quest log. giverId (an NPC), locationId (a Location) and parentQuestId (a Quest) each set one link and accept an entryId or exact title; on update an empty string removes the link.",
      },
      objective: {
        fields: ["id", "text", "state", "optional", "hidden", "children"],
        stateValues: [...QUEST_OBJECTIVE_STATES],
        notes: "text is one line of Markdown (mentions allowed). optional objectives do not count toward progress. hidden: true keeps an objective from players. On update, objectives is the whole list: name an existing objective by id (from get_mnemon's quest.objectives) to keep it and what the GM wrote under it; one left out is removed. children are its sub-objectives — omitted keeps the ones it has, an empty list removes them.",
      },
      reward: {
        fields: ["id", "kind", "amount", "unit", "unitLabel", "label", "entryId", "ruleEntryId", "hidden"],
        kindValues: [...QUEST_REWARD_KINDS],
        notes: "Every chip needs kind. currency: amount plus unit, the coin as the campaign's setting names it (e.g. coin.gp) or free text. xp: amount. item: label, and entryId (a mnemon entryId or exact title) or ruleEntryId (a rules-library entry), not both. other: label. On update, rewards is the whole list: name an existing chip by id to keep it; an empty list clears it.",
      },
      prose: "background (the Background section) and gmNotes (never shown to players) are Markdown. On create, markdown is the Background when background is not given. On update, each replaces its section and leaves the rest of the quest as it is.",
      ticking: "To tick, fail or reopen one objective, call set_quest_objective_state with its id rather than rewriting the list. A player may tick only while playersCanTick is on.",
      retired: "questStatus, steps, reward rows (rewardType, itemId, notes, linkedStepIds), issuerNpcEntryId, issuerText, repeatable and expiresAt are the retired quest board's fields, accepted for one release on quests the migration has not converted. Do not use them: the Argo app shows them read-only and cannot edit them.",
    },
  };
}

// ---------------------------------------------------------------------------
// Read tools — unchanged from prior shape
// ---------------------------------------------------------------------------

export const listMnemonsInputSchema = z.object({
  campaignId: z.string().min(1).describe("ID of the campaign."),
  title: z.string().optional().describe("Case-insensitive substring filter on title."),
  type: z.string().optional().describe("Mnemon type filter (NPC, Location, Quest, …)."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .describe("Maximum entries to return (default 100)."),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Entries to skip. Pass the nextOffset from the previous call to fetch the next page."),
});

export interface MnemonListPage {
  entries: MnemonSummary[];
  hasMore: boolean;
  nextOffset?: number;
}

const LIST_MNEMONS_PAGE_SIZE = 100;
const LIST_MNEMONS_DEFAULT_LIMIT = 100;

interface MnemonListFilters {
  title?: string;
  type?: string;
}

/**
 * Fetches WebAPI pages until at least `needed` entries are collected or the
 * upstream runs dry (short page). WebAPI's page size is fixed here at 100.
 */
async function fetchMnemonPages(
  campaignId: string,
  filters: MnemonListFilters,
  needed: number
): Promise<MnemonSummary[]> {
  const basePath = `/mcp/v1/campaigns/${encodeURIComponent(campaignId)}/mnemons`;
  const results: MnemonSummary[] = [];
  for (let page = 0; results.length < needed; page++) {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("size", String(LIST_MNEMONS_PAGE_SIZE));
    if (filters.title) params.set("title", filters.title);
    if (filters.type) params.set("type", filters.type);
    const batch = await argoGet<MnemonSummary[]>(`${basePath}?${params.toString()}`);
    results.push(...batch);
    if (batch.length < LIST_MNEMONS_PAGE_SIZE) break;
  }
  return results;
}

/**
 * Fetches every matching entry. Used by the title→id resolver, which needs
 * the full campaign index to detect ambiguity — never expose this as a tool
 * surface; large campaigns would blow the connector result cap.
 */
export async function listAllMnemons(input: {
  campaignId: string;
  title?: string;
  type?: string;
}): Promise<MnemonSummary[]> {
  return fetchMnemonPages(input.campaignId, input, Number.POSITIVE_INFINITY);
}

export async function listMnemons(
  input: z.infer<typeof listMnemonsInputSchema>
): Promise<MnemonListPage> {
  const limit = input.limit ?? LIST_MNEMONS_DEFAULT_LIMIT;
  const offset = input.offset ?? 0;
  // Fetch one entry past the requested window so hasMore is exact without
  // scanning the whole campaign.
  const fetched = await fetchMnemonPages(input.campaignId, input, offset + limit + 1);
  const entries = fetched.slice(offset, offset + limit);
  const hasMore = fetched.length > offset + limit;
  return {
    entries,
    hasMore,
    ...(hasMore ? { nextOffset: offset + limit } : {}),
  };
}

export const getMnemonInputSchema = z.object({
  campaignId: z.string().min(1).describe("Campaign ID."),
  entryId: z.string().min(1).describe("Mnemon entry ID (hex) or exact title."),
});

export async function getMnemon(
  input: z.infer<typeof getMnemonInputSchema>
): Promise<MnemonEntry> {
  const resolver = new MnemonResolver(input.campaignId);
  const hex = await resolver.resolve(input.entryId, { fieldLabel: "entryId" });
  return argoGet<MnemonEntry>(
    `/mcp/v1/campaigns/${encodeURIComponent(input.campaignId)}/mnemons/${encodeURIComponent(hex)}`
  );
}

// ---------------------------------------------------------------------------
// Search — full-text over title, tags, and body content
// ---------------------------------------------------------------------------

export const searchMnemonsInputSchema = z.object({
  campaignId: z.string().min(1).describe("ID of the campaign."),
  query: z
    .string()
    .min(2)
    .describe("Text to find (case-insensitive substring) in mnemon titles, tags, and body content."),
  type: z.string().optional().describe("Mnemon type filter (NPC, Location, Quest, …)."),
  limit: z.number().int().min(1).max(50).optional().describe("Maximum results (default 20)."),
});

export interface MnemonSearchSnippet {
  blockId?: string;
  text: string;
}

export interface MnemonSearchHit {
  entryId: string;
  title: string;
  type: string;
  matchedIn: string[];
  snippets: MnemonSearchSnippet[];
}

export interface MnemonSearchResponse {
  results: MnemonSearchHit[];
  hasMore: boolean;
}

export const mnemonSearchSnippetOutputSchema = z.object({
  blockId: z.string().optional(),
  text: z.string(),
});

export const mnemonSearchHitOutputSchema = z.object({
  entryId: z.string(),
  title: z.string(),
  type: z.string(),
  matchedIn: z.array(z.string()),
  snippets: z.array(mnemonSearchSnippetOutputSchema),
});

export async function searchMnemons(
  input: z.infer<typeof searchMnemonsInputSchema>
): Promise<MnemonSearchResponse> {
  const params = new URLSearchParams();
  params.set("q", input.query);
  if (input.type) params.set("type", input.type);
  if (input.limit !== undefined) params.set("limit", String(input.limit));
  return argoGet<MnemonSearchResponse>(
    `/mcp/v1/campaigns/${encodeURIComponent(input.campaignId)}/mnemons/search?${params.toString()}`
  );
}

// ---------------------------------------------------------------------------
// Delete — single entry, GM-only on the backend
// ---------------------------------------------------------------------------

export const deleteMnemonInputSchema = z.object({
  campaignId: z.string().min(1).describe("Campaign ID."),
  entryId: z.string().min(1).describe("Mnemon entry ID (hex) or exact title."),
});

/** Deletes the entry and returns the resolved hex id it was addressed by. */
export async function deleteMnemon(
  input: z.infer<typeof deleteMnemonInputSchema>
): Promise<string> {
  const resolver = new MnemonResolver(input.campaignId);
  const hex = await resolver.resolve(input.entryId, { fieldLabel: "entryId" });
  await argoDelete(
    `/mcp/v1/campaigns/${encodeURIComponent(input.campaignId)}/mnemons/${encodeURIComponent(hex)}`
  );
  return hex;
}

// ---------------------------------------------------------------------------
// Shared block-input shape (used by all create_*_mnemons tools)
// ---------------------------------------------------------------------------

const visibilityEnum = z.enum(["HIDDEN", "INTERNAL", "PUBLIC"]).optional();
const tagsSchema = z.array(z.string()).optional();
const stringArray = () => z.array(z.string()).optional();

// ---------------------------------------------------------------------------
// Create tools — one per type
// ---------------------------------------------------------------------------

const createCommon = {
  title: z.string().min(1).describe("Title of the new entry."),
  markdown: z
    .string()
    .min(1)
    .describe(
      "Body content as Markdown. Mentions: @[label](mnemon:<entryId>). " +
        "Images: ![caption](asset:<assetId>@<campaignId>) — upload the asset first."
    ),
  visibility: visibilityEnum,
  tags: tagsSchema,
};

// --- NPC ---
const createNpcItemSchema = z.object({
  ...createCommon,
  npcType: z.enum(["FACTION", "INDIVIDUAL"]).describe("Required: FACTION (organization) or INDIVIDUAL (person)."),
  sheetId: z.string().optional(),
  primaryLocationEntryId: z.string().optional().describe("Home location — entryId or exact title."),
  memberNpcEntryIds: stringArray().describe("FACTION only: members of this faction (NPC entryIds or titles)."),
  affiliationEntryIds: stringArray().describe("INDIVIDUAL only: factions this person belongs to."),
  relationshipIds: stringArray(),
});

export const createNpcMnemonsInputSchema = z.object({
  campaignId: z.string().min(1),
  items: z.array(createNpcItemSchema).min(1).max(50),
});

export async function createNpcMnemons(
  input: z.infer<typeof createNpcMnemonsInputSchema>
): Promise<MnemonBulkResponse> {
  const resolver = new MnemonResolver(input.campaignId);
  const items = [];
  for (const it of input.items) {
    items.push({
      ...it,
      primaryLocationEntryId: await resolver.resolveOptional(it.primaryLocationEntryId, { type: "Location", fieldLabel: "primaryLocationEntryId" }),
      memberNpcEntryIds: await resolver.resolveArray(it.memberNpcEntryIds, { type: "NPC", fieldLabel: "memberNpcEntryIds" }),
      affiliationEntryIds: await resolver.resolveArray(it.affiliationEntryIds, { fieldLabel: "affiliationEntryIds" }),
    });
  }
  return argoPost<MnemonBulkResponse, { items: typeof items }>(
    `/mcp/v1/campaigns/${encodeURIComponent(input.campaignId)}/mnemons/npc`,
    { items }
  );
}

// --- Location ---
const createLocationItemSchema = z.object({
  ...createCommon,
  levelId: z.string().optional().describe("Unreal Engine level reference."),
});

export const createLocationMnemonsInputSchema = z.object({
  campaignId: z.string().min(1),
  items: z.array(createLocationItemSchema).min(1).max(50),
});

export async function createLocationMnemons(
  input: z.infer<typeof createLocationMnemonsInputSchema>
): Promise<MnemonBulkResponse> {
  return argoPost<MnemonBulkResponse, { items: typeof input.items }>(
    `/mcp/v1/campaigns/${encodeURIComponent(input.campaignId)}/mnemons/location`,
    { items: input.items }
  );
}

// --- Quest ---
//
// A quest is written in one of two shapes (ARGO-2148). The typed fields —
// objectives, reward chips, background, gmNotes — build the doc-based quest the
// Argo app shows, from the server's template. The retired quest board's fields
// (steps, reward rows, the issuer, repeatable, expiresAt, questStatus) are still
// accepted for one release on quests the quest-doc-v2 migration has not
// converted; one item may not mix the two. describe_mnemon_types.questBody is
// the agent-facing account of all this.

export const QUEST_STATUSES = ["Available", "Active", "Completed", "Failed"] as const;
export const QUEST_KINDS = ["Main", "Side", "Personal"] as const;
export const QUEST_OBJECTIVE_STATES = ["open", "done", "failed"] as const;
export const QUEST_REWARD_KINDS = ["currency", "xp", "item", "other"] as const;

/** The retired quest board's step statuses. */
const QUEST_STEP_STATUSES = [
  "Hidden",
  "Available",
  "Active",
  "Completed",
  "Failed",
  "TurnedIn",
  "Abandoned",
  "Expired",
  "OnHold",
] as const;

const questStepInputSchema = z.object({
  stepId: z
    .string()
    .optional()
    .describe("Optional. Server generates a fresh UUID when blank. Provide an existing stepId to reuse linkedStepIds."),
  title: z.string().describe("Short label for the step, e.g. 'Talk to the innkeeper'."),
  description: z.string().optional(),
  status: z
    .enum(QUEST_STEP_STATUSES)
    .optional()
    .describe("Defaults to 'Available' when omitted. Unknown values are coerced server-side."),
  targetNpcEntryIds: stringArray().describe("NPCs involved in this step (entryIds or titles)."),
  targetLocationEntryIds: stringArray().describe("Locations involved in this step."),
  notes: stringArray().describe("Free-text bullet notes for the step."),
});

// A factory, not a shared object: zod-to-json-schema writes a schema instance
// it has already emitted as a $ref, so objectives and sub-objectives each need
// their own instances to stay inline.
const questObjectiveFields = () => ({
  id: z
    .string()
    .optional()
    .describe("The objective to rewrite, as get_mnemon's quest.objectives[].id names it. Omit for a new objective."),
  text: z
    .string()
    .min(1)
    .describe("The objective, one line of Markdown. Mentions: @[label](mnemon:<entryId>)."),
  state: z.enum(QUEST_OBJECTIVE_STATES).optional().describe("open (the default), done or failed."),
  optional: z
    .boolean()
    .optional()
    .describe("An optional objective does not count toward the quest's progress. Defaults to false."),
  hidden: z
    .boolean()
    .optional()
    .describe("true hides it from players, false shows it; omitted keeps what it has (a new one is shown)."),
});

// Two levels — objectives and their sub-objectives — rather than a recursive
// schema, so the tool's JSON Schema stays flat for every client. Deeper nesting
// is rare, and a sub-objective named by id keeps whatever is nested under it.
const questObjectiveInputSchema = z.object({
  ...questObjectiveFields(),
  children: z
    .array(z.object(questObjectiveFields()))
    .optional()
    .describe("Its sub-objectives, in order. Omitted keeps the ones it has; an empty list removes them."),
});

const questRewardInputSchema = z.object({
  id: z
    .string()
    .optional()
    .describe("The chip to rewrite, as get_mnemon's quest.rewards[].id names it. Omit for a new chip."),
  kind: z
    .enum(QUEST_REWARD_KINDS)
    .optional()
    .describe("currency | xp | item | other. Makes this a reward chip — send it on every reward."),
  amount: z.number().optional().describe("How many: coins, experience points, a stack."),
  unit: z
    .string()
    .optional()
    .describe("currency chips: the coin, as the campaign's setting names it (e.g. coin.gp), or free text such as 'gold'."),
  unitLabel: z.string().optional().describe("How the coin reads, e.g. 'Gold piece'."),
  label: z.string().optional().describe("What the chip says: an item's name, a favour, a title."),
  entryId: z
    .string()
    .optional()
    .describe("item chips: the mnemon entry it links to (entryId or exact title). Not with ruleEntryId."),
  ruleEntryId: z.string().optional().describe("item chips: the rules-library entry it links to. Not with entryId."),
  hidden: z
    .boolean()
    .optional()
    .describe("true hides the chip from players, false shows it; omitted keeps what it has (a new one is shown)."),
  rewardType: z.string().optional().describe("Retired reward row, without kind: Gold | Item | XP | Reputation …"),
  itemId: z.string().optional().describe("Retired reward row: a free-text item reference."),
  notes: z.string().optional().describe("Retired reward row: notes."),
  linkedStepIds: stringArray().describe("Retired reward row: the stepIds or subquest entry ids that unlock it."),
});

/** The quest header: typed fields beside the doc, the same on create and update. */
const questHeaderFields = {
  status: z
    .enum(QUEST_STATUSES)
    .optional()
    .describe("Available | Active | Completed | Failed. Reads as Available when unset."),
  kind: z.enum(QUEST_KINDS).optional().describe("Main | Side | Personal. Reads as Side when unset."),
  playersCanTick: z
    .boolean()
    .optional()
    .describe("Whether players may tick the objectives they can see. Off by default."),
  hook: z
    .string()
    .optional()
    .describe("The one line players see under the title in the quest log. An empty string clears it."),
  giverId: z
    .string()
    .optional()
    .describe("Who gives the quest: an NPC's entryId or exact title (its Quest giver link). On update an empty string removes it."),
  locationId: z
    .string()
    .optional()
    .describe("Where the quest is given or set: a Location's entryId or exact title. On update an empty string removes it."),
  parentQuestId: z
    .string()
    .optional()
    .describe("The quest this one belongs to: a Quest's entryId or exact title. On update an empty string removes it."),
};

const questLinkListFields = {
  subQuestEntryIds: stringArray().describe("This quest's subquests (entryIds or titles). Prefer parentQuestId on each subquest."),
  relatedNpcEntryIds: stringArray().describe("NPCs the quest involves (entryIds or titles)."),
  relatedLocationEntryIds: stringArray().describe("Locations the quest involves (entryIds or titles)."),
};

const retiredQuestFields = {
  questStatus: z.string().optional().describe("Retired: send status."),
  issuerNpcEntryId: z.string().optional().describe("Retired quest board field: send giverId."),
  issuerText: z.string().optional().describe("Retired quest board field: write it into background."),
  repeatable: z.boolean().optional().describe("Retired quest board field."),
  expiresAt: z.string().optional().describe("Retired quest board field (ISO-8601)."),
  steps: z
    .array(questStepInputSchema)
    .optional()
    .describe("Retired: the old quest board's steps, for quests the migration has not converted. Send objectives."),
};

const createQuestItemSchema = z.object({
  title: createCommon.title,
  markdown: z
    .string()
    .min(1)
    .optional()
    .describe(
      "The quest's prose in Markdown: its Background when background is not given. " +
        "Mentions: @[label](mnemon:<entryId>)."
    ),
  visibility: visibilityEnum,
  tags: tagsSchema,
  ...questHeaderFields,
  objectives: z.array(questObjectiveInputSchema).optional().describe("The objectives, in order."),
  rewards: z.array(questRewardInputSchema).optional().describe("The reward chips, each with its kind."),
  background: z.string().optional().describe("The Background section, in Markdown."),
  gmNotes: z.string().optional().describe("GM-only notes, in Markdown. Players never see them."),
  ...questLinkListFields,
  ...retiredQuestFields,
});

export const createQuestMnemonsInputSchema = z.object({
  campaignId: z.string().min(1),
  items: z.array(createQuestItemSchema).min(1).max(50),
});

export async function createQuestMnemons(
  input: z.infer<typeof createQuestMnemonsInputSchema>
): Promise<MnemonBulkResponse> {
  const resolver = new MnemonResolver(input.campaignId);
  const items = [];
  for (const it of input.items) {
    items.push(asQuestDoc({ ...it, ...(await resolveQuestReferences(resolver, it)) }));
  }
  return argoPost<MnemonBulkResponse, { items: typeof items }>(
    `/mcp/v1/campaigns/${encodeURIComponent(input.campaignId)}/mnemons/quest`,
    { items }
  );
}

type QuestStepInput = z.infer<typeof questStepInputSchema>;
type QuestRewardInput = z.infer<typeof questRewardInputSchema>;

/** The entry references a quest item may carry, on create and update alike. */
interface QuestReferences {
  giverId?: string;
  locationId?: string;
  parentQuestId?: string;
  issuerNpcEntryId?: string;
  subQuestEntryIds?: string[];
  relatedNpcEntryIds?: string[];
  relatedLocationEntryIds?: string[];
  steps?: QuestStepInput[];
  rewards?: QuestRewardInput[];
}

/** Resolves every entry reference a quest item carries — entryIds or titles — to hex ids. */
async function resolveQuestReferences(
  resolver: MnemonResolver,
  it: QuestReferences,
): Promise<QuestReferences> {
  return {
    giverId: await resolver.resolveOrClear(it.giverId, { type: "NPC", fieldLabel: "giverId" }),
    locationId: await resolver.resolveOrClear(it.locationId, { type: "Location", fieldLabel: "locationId" }),
    parentQuestId: await resolver.resolveOrClear(it.parentQuestId, { type: "Quest", fieldLabel: "parentQuestId" }),
    issuerNpcEntryId: await resolver.resolveOptional(it.issuerNpcEntryId, { type: "NPC", fieldLabel: "issuerNpcEntryId" }),
    subQuestEntryIds: await resolver.resolveArray(it.subQuestEntryIds, { type: "Quest", fieldLabel: "subQuestEntryIds" }),
    relatedNpcEntryIds: await resolver.resolveArray(it.relatedNpcEntryIds, { type: "NPC", fieldLabel: "relatedNpcEntryIds" }),
    relatedLocationEntryIds: await resolver.resolveArray(it.relatedLocationEntryIds, { type: "Location", fieldLabel: "relatedLocationEntryIds" }),
    steps: await resolveQuestSteps(resolver, it.steps),
    rewards: await resolveQuestRewards(resolver, it.rewards),
  };
}

/**
 * Checks each reward names its shape — a chip's kind, or a retired row's
 * rewardType — and resolves a chip's linked entry. The WebAPI reads a reward
 * with neither as a retired row, which would quietly give a new quest the old
 * board's shape.
 */
async function resolveQuestRewards(
  resolver: MnemonResolver,
  rewards: QuestRewardInput[] | undefined,
): Promise<QuestRewardInput[] | undefined> {
  if (!rewards) return undefined;
  const out: QuestRewardInput[] = [];
  for (const [i, reward] of rewards.entries()) {
    if (reward.kind === undefined && reward.rewardType === undefined) {
      throw new Error(`rewards[${i}]: a reward chip needs its kind — currency, xp, item or other.`);
    }
    out.push({
      ...reward,
      entryId: await resolver.resolveOrClear(reward.entryId, { fieldLabel: `rewards[${i}].entryId` }),
    });
  }
  return out;
}

/**
 * Sends a new quest in the doc-based shape unless it uses a retired quest board
 * field. The WebAPI stores `markdown` alone in the retired shape — prose with no
 * objective list or Rewards — so here it goes in as the Background of the
 * template quest instead, which is the quest the Argo app shows.
 */
function asQuestDoc<T extends QuestReferences & { markdown?: string; background?: string; issuerText?: string; repeatable?: boolean; expiresAt?: string }>(
  item: T,
): T {
  const retired =
    item.steps !== undefined ||
    item.issuerNpcEntryId !== undefined ||
    item.issuerText !== undefined ||
    item.repeatable !== undefined ||
    item.expiresAt !== undefined ||
    (item.rewards ?? []).some((reward) => reward.kind === undefined);
  if (retired || item.background !== undefined || item.markdown === undefined) return item;
  const { markdown, ...rest } = item;
  return { ...rest, background: markdown } as T;
}

/**
 * Resolves the per-step target lists (NPCs / Locations) through the title→id
 * resolver, so callers can pass either entry ids or titles. {@code linkedStepIds}
 * on rewards is left as-is — those are local-to-this-quest stepIds (server
 * UUIDs) or subquest entry ids the caller already resolved upstream.
 */
async function resolveQuestSteps(
  resolver: MnemonResolver,
  steps: QuestStepInput[] | undefined,
): Promise<QuestStepInput[] | undefined> {
  if (!steps) return undefined;
  const out: QuestStepInput[] = [];
  for (const step of steps) {
    out.push({
      ...step,
      targetNpcEntryIds: await resolver.resolveArray(step.targetNpcEntryIds, { type: "NPC", fieldLabel: "step.targetNpcEntryIds" }),
      targetLocationEntryIds: await resolver.resolveArray(step.targetLocationEntryIds, { type: "Location", fieldLabel: "step.targetLocationEntryIds" }),
    });
  }
  return out;
}

// --- Lore ---
const createLoreItemSchema = z.object({
  ...createCommon,
  relatedEntryIds: stringArray(),
});

export const createLoreMnemonsInputSchema = z.object({
  campaignId: z.string().min(1),
  items: z.array(createLoreItemSchema).min(1).max(50),
});

export async function createLoreMnemons(
  input: z.infer<typeof createLoreMnemonsInputSchema>
): Promise<MnemonBulkResponse> {
  const resolver = new MnemonResolver(input.campaignId);
  const items = [];
  for (const it of input.items) {
    items.push({
      ...it,
      relatedEntryIds: await resolver.resolveArray(it.relatedEntryIds, { fieldLabel: "relatedEntryIds" }),
    });
  }
  return argoPost<MnemonBulkResponse, { items: typeof items }>(
    `/mcp/v1/campaigns/${encodeURIComponent(input.campaignId)}/mnemons/lore`,
    { items }
  );
}

// --- Archive ---
const createArchiveItemSchema = z.object({
  ...createCommon,
  relatedEntryIds: stringArray(),
});

export const createArchiveMnemonsInputSchema = z.object({
  campaignId: z.string().min(1),
  items: z.array(createArchiveItemSchema).min(1).max(50),
});

export async function createArchiveMnemons(
  input: z.infer<typeof createArchiveMnemonsInputSchema>
): Promise<MnemonBulkResponse> {
  const resolver = new MnemonResolver(input.campaignId);
  const items = [];
  for (const it of input.items) {
    items.push({
      ...it,
      relatedEntryIds: await resolver.resolveArray(it.relatedEntryIds, { fieldLabel: "relatedEntryIds" }),
    });
  }
  return argoPost<MnemonBulkResponse, { items: typeof items }>(
    `/mcp/v1/campaigns/${encodeURIComponent(input.campaignId)}/mnemons/archive`,
    { items }
  );
}

// --- Journal ---
const createJournalItemSchema = z.object({
  ...createCommon,
  date: z.string().optional(),
  sessionNumber: z.number().int().optional(),
  involvedNpcEntryIds: stringArray(),
  involvedLocationEntryIds: stringArray(),
  involvedCharacterIds: stringArray(),
  outcome: z.string().optional(),
  consequenceEntryIds: stringArray(),
});

export const createJournalMnemonsInputSchema = z.object({
  campaignId: z.string().min(1),
  items: z.array(createJournalItemSchema).min(1).max(50),
});

export async function createJournalMnemons(
  input: z.infer<typeof createJournalMnemonsInputSchema>
): Promise<MnemonBulkResponse> {
  const resolver = new MnemonResolver(input.campaignId);
  const items = [];
  for (const it of input.items) {
    items.push({
      ...it,
      involvedNpcEntryIds: await resolver.resolveArray(it.involvedNpcEntryIds, { type: "NPC", fieldLabel: "involvedNpcEntryIds" }),
      involvedLocationEntryIds: await resolver.resolveArray(it.involvedLocationEntryIds, { type: "Location", fieldLabel: "involvedLocationEntryIds" }),
      consequenceEntryIds: await resolver.resolveArray(it.consequenceEntryIds, { fieldLabel: "consequenceEntryIds" }),
    });
  }
  return argoPost<MnemonBulkResponse, { items: typeof items }>(
    `/mcp/v1/campaigns/${encodeURIComponent(input.campaignId)}/mnemons/journal`,
    { items }
  );
}

// --- SessionSummary ---

/**
 * Narrative fields authored by the AthenaLLM summary pass in the Unreal client;
 * a GM may edit any of them afterwards. Shared by the create and update schemas.
 *
 * Note what is absent: attendees and featured quests/locations used to be id
 * arrays here. They are relationships now, so link them with
 * create_mnemon_relationship using SESSION_ATTENDEE_CHARACTER,
 * SESSION_ATTENDEE_NPC, SESSION_FEATURED_QUEST, or SESSION_FEATURED_LOCATION.
 */
const sessionSummaryNarrative = {
  suggestedTitle: z.string().optional().describe("Short evocative title for the session, like a TV episode title."),
  oneSentenceSummary: z.string().optional().describe("Single-sentence TL;DR of what happened."),
  detailedSummary: z.string().optional().describe("Full narrative summary, 3-5 paragraphs."),
  previouslyOn: z.string().optional().describe("Where each player ended — read aloud at the top of the next session."),
  partyEndState: z
    .record(z.string(), z.string())
    .optional()
    .describe("Character display name -> short end-of-session status line."),
  majorEvents: stringArray().describe("Significant story beats, in chronological order."),
  partyDecisions: stringArray().describe("Meaningful choices that will shape future sessions."),
  openThreads: stringArray().describe("Unresolved threads and cliffhangers as of session end."),
  loot: stringArray().describe("Items, treasure, or rewards acquired."),
  npcsMentioned: z
    .array(
      z.object({
        name: z.string().min(1).describe('Name as referenced in the session, e.g. "Captain Mira".'),
        role: z.string().optional().describe('Role played this session, e.g. "quest-giver", "rescued captive".'),
      })
    )
    .optional()
    .describe(
      "NPCs that appeared or were referenced. This is descriptive only — to link one to an " +
        "existing NPC mnemon, call create_mnemon_relationship with SESSION_ATTENDEE_NPC."
    ),
  combats: z
    .array(
      z.object({
        description: z.string().min(1).describe("Who fought whom and where, in one sentence."),
        outcome: z.string().optional().describe('How it resolved, e.g. "party victorious, no casualties".'),
      })
    )
    .optional()
    .describe("Combat encounters that took place this session."),
};

const createSessionSummaryItemSchema = z.object({
  ...createCommon,
  date: z.string().optional(),
  sessionNumber: z.number().int().optional(),
  ...sessionSummaryNarrative,
});

export const createSessionSummaryMnemonsInputSchema = z.object({
  campaignId: z.string().min(1),
  items: z.array(createSessionSummaryItemSchema).min(1).max(50),
});

export async function createSessionSummaryMnemons(
  input: z.infer<typeof createSessionSummaryMnemonsInputSchema>
): Promise<MnemonBulkResponse> {
  // No resolver pass: this payload no longer carries any mnemon reference. The
  // links moved to the relationship graph.
  return argoPost<MnemonBulkResponse, { items: typeof input.items }>(
    `/mcp/v1/campaigns/${encodeURIComponent(input.campaignId)}/mnemons/session-summary`,
    { items: input.items }
  );
}

// --- Player ---
const createPlayerItemSchema = z.object({
  ...createCommon,
  playerKind: z.enum(["PARTY", "CHARACTER", "NOTES"]).optional(),
  partyId: z.string().optional().describe("CampaignParty id (NOT a mnemon entryId)."),
  parentEntryId: z.string().optional().describe("For playerKind=CHARACTER: entryId of the parent PARTY-kind PlayerMnemon."),
  characterId: z.string().optional().describe("SessionCharacter id (required for playerKind=CHARACTER)."),
});

export const createPlayerMnemonsInputSchema = z.object({
  campaignId: z.string().min(1),
  items: z.array(createPlayerItemSchema).min(1).max(50),
});

export async function createPlayerMnemons(
  input: z.infer<typeof createPlayerMnemonsInputSchema>
): Promise<MnemonBulkResponse> {
  const resolver = new MnemonResolver(input.campaignId);
  const items = [];
  for (const it of input.items) {
    items.push({
      ...it,
      parentEntryId: await resolver.resolveOptional(it.parentEntryId, { type: "Player", fieldLabel: "parentEntryId" }),
    });
  }
  return argoPost<MnemonBulkResponse, { items: typeof items }>(
    `/mcp/v1/campaigns/${encodeURIComponent(input.campaignId)}/mnemons/player`,
    { items }
  );
}

// --- Custom ---
const createCustomItemSchema = z.object({
  ...createCommon,
  customType: z.string().optional().describe("Optional descriptive subtype label."),
});

export const createCustomMnemonsInputSchema = z.object({
  campaignId: z.string().min(1),
  items: z.array(createCustomItemSchema).min(1).max(50),
});

export async function createCustomMnemons(
  input: z.infer<typeof createCustomMnemonsInputSchema>
): Promise<MnemonBulkResponse> {
  return argoPost<MnemonBulkResponse, { items: typeof input.items }>(
    `/mcp/v1/campaigns/${encodeURIComponent(input.campaignId)}/mnemons/custom`,
    { items: input.items }
  );
}

// ---------------------------------------------------------------------------
// Update tools — typed/meta fields only; never blocks
// ---------------------------------------------------------------------------

const updateCommon = {
  entryId: z.string().min(1).describe("Mnemon entry id (hex) or exact title."),
  title: z.string().optional(),
  visibility: visibilityEnum,
  tags: tagsSchema,
};

// --- NPC ---
const updateNpcItemSchema = z.object({
  ...updateCommon,
  npcType: z.enum(["FACTION", "INDIVIDUAL"]).optional(),
  sheetId: z.string().optional(),
  primaryLocationEntryId: z.string().optional(),
  memberNpcEntryIds: stringArray(),
  affiliationEntryIds: stringArray(),
  relationshipIds: stringArray(),
});

export const updateNpcMnemonsInputSchema = z.object({
  campaignId: z.string().min(1),
  items: z.array(updateNpcItemSchema).min(1).max(50),
});

export async function updateNpcMnemons(
  input: z.infer<typeof updateNpcMnemonsInputSchema>
): Promise<MnemonBulkResponse> {
  const resolver = new MnemonResolver(input.campaignId);
  const items = [];
  for (const it of input.items) {
    items.push({
      ...it,
      entryId: await resolver.resolve(it.entryId, { fieldLabel: "entryId" }),
      primaryLocationEntryId: await resolver.resolveOptional(it.primaryLocationEntryId, { type: "Location", fieldLabel: "primaryLocationEntryId" }),
      memberNpcEntryIds: await resolver.resolveArray(it.memberNpcEntryIds, { type: "NPC", fieldLabel: "memberNpcEntryIds" }),
      affiliationEntryIds: await resolver.resolveArray(it.affiliationEntryIds, { fieldLabel: "affiliationEntryIds" }),
    });
  }
  return argoPatch<MnemonBulkResponse, { items: typeof items }>(
    `/mcp/v1/campaigns/${encodeURIComponent(input.campaignId)}/mnemons/npc`,
    { items }
  );
}

// --- Location ---
const updateLocationItemSchema = z.object({
  ...updateCommon,
  levelId: z.string().optional(),
});

export const updateLocationMnemonsInputSchema = z.object({
  campaignId: z.string().min(1),
  items: z.array(updateLocationItemSchema).min(1).max(50),
});

export async function updateLocationMnemons(
  input: z.infer<typeof updateLocationMnemonsInputSchema>
): Promise<MnemonBulkResponse> {
  const resolver = new MnemonResolver(input.campaignId);
  const items = await Promise.all(
    input.items.map(async (it) => ({ ...it, entryId: await resolver.resolve(it.entryId, { fieldLabel: "entryId" }) }))
  );
  return argoPatch<MnemonBulkResponse, { items: typeof items }>(
    `/mcp/v1/campaigns/${encodeURIComponent(input.campaignId)}/mnemons/location`,
    { items }
  );
}

// --- Quest ---
const updateQuestItemSchema = z.object({
  ...updateCommon,
  ...questHeaderFields,
  objectives: z
    .array(questObjectiveInputSchema)
    .optional()
    .describe(
      "Replaces the objective list. Name an existing objective by id to keep it and what the GM wrote under it; " +
        "one left out is removed. To tick one objective, use set_quest_objective_state instead."
    ),
  rewards: z
    .array(questRewardInputSchema)
    .optional()
    .describe("Replaces the reward chips; an empty list clears them. Name an existing chip by id to keep it."),
  background: z.string().optional().describe("Replaces the Background section, in Markdown."),
  gmNotes: z.string().optional().describe("Replaces the GM-only notes, in Markdown."),
  ...questLinkListFields,
  ...retiredQuestFields,
});

export const updateQuestMnemonsInputSchema = z.object({
  campaignId: z.string().min(1),
  items: z.array(updateQuestItemSchema).min(1).max(50),
});

export async function updateQuestMnemons(
  input: z.infer<typeof updateQuestMnemonsInputSchema>
): Promise<MnemonBulkResponse> {
  const resolver = new MnemonResolver(input.campaignId);
  const items = [];
  for (const it of input.items) {
    items.push({
      ...it,
      entryId: await resolver.resolve(it.entryId, { type: "Quest", fieldLabel: "entryId" }),
      ...(await resolveQuestReferences(resolver, it)),
    });
  }
  return argoPatch<MnemonBulkResponse, { items: typeof items }>(
    `/mcp/v1/campaigns/${encodeURIComponent(input.campaignId)}/mnemons/quest`,
    { items }
  );
}

export const setQuestObjectiveStateInputSchema = z.object({
  campaignId: z.string().min(1).describe("Campaign ID."),
  entryId: z.string().min(1).describe("The quest: entryId (hex) or exact title."),
  objectiveId: z.string().min(1).describe("The objective, as get_mnemon's quest.objectives[].id names it."),
  state: z.enum(QUEST_OBJECTIVE_STATES).describe("open, done or failed."),
});

/**
 * Sets one objective's state by id, at any depth, without rewriting the doc.
 * Answers the quest as get_mnemon shows it, its progress recounted.
 */
export async function setQuestObjectiveState(
  input: z.infer<typeof setQuestObjectiveStateInputSchema>
): Promise<MnemonEntry> {
  const resolver = new MnemonResolver(input.campaignId);
  const hex = await resolver.resolve(input.entryId, { type: "Quest", fieldLabel: "entryId" });
  try {
    return await argoPatch<MnemonEntry, { state: string }>(
      `/mcp/v1/campaigns/${encodeURIComponent(input.campaignId)}/mnemons/${encodeURIComponent(hex)}` +
        `/objectives/${encodeURIComponent(input.objectiveId)}`,
      { state: input.state }
    );
  } catch (err) {
    // The generic 404 text blames the campaign or entry id; here the objective
    // id is the likelier culprit, and the WebAPI names it.
    if (err instanceof ArgoApiError && err.status === 404 && err.body.includes("QUEST_OBJECTIVE_NOT_FOUND")) {
      throw new Error(
        `This quest has no objective ${JSON.stringify(input.objectiveId)} that you can see. ` +
          "Read the objective ids from get_mnemon's quest.objectives[].id."
      );
    }
    throw err;
  }
}

// --- Lore / Archive ---
const updateLoreItemSchema = z.object({ ...updateCommon, relatedEntryIds: stringArray() });
export const updateLoreMnemonsInputSchema = z.object({
  campaignId: z.string().min(1),
  items: z.array(updateLoreItemSchema).min(1).max(50),
});
export async function updateLoreMnemons(
  input: z.infer<typeof updateLoreMnemonsInputSchema>
): Promise<MnemonBulkResponse> {
  return resolveAndPatchSimple(input, "lore", true);
}

const updateArchiveItemSchema = z.object({ ...updateCommon, relatedEntryIds: stringArray() });
export const updateArchiveMnemonsInputSchema = z.object({
  campaignId: z.string().min(1),
  items: z.array(updateArchiveItemSchema).min(1).max(50),
});
export async function updateArchiveMnemons(
  input: z.infer<typeof updateArchiveMnemonsInputSchema>
): Promise<MnemonBulkResponse> {
  return resolveAndPatchSimple(input, "archive", true);
}

async function resolveAndPatchSimple(
  input: { campaignId: string; items: Array<{ entryId: string; relatedEntryIds?: string[] } & Record<string, unknown>> },
  pathSegment: string,
  resolveRelated: boolean
): Promise<MnemonBulkResponse> {
  const resolver = new MnemonResolver(input.campaignId);
  const items = [];
  for (const it of input.items) {
    const out: Record<string, unknown> = { ...it };
    out.entryId = await resolver.resolve(it.entryId, { fieldLabel: "entryId" });
    if (resolveRelated) {
      out.relatedEntryIds = await resolver.resolveArray(it.relatedEntryIds, { fieldLabel: "relatedEntryIds" });
    }
    items.push(out);
  }
  return argoPatch<MnemonBulkResponse, { items: typeof items }>(
    `/mcp/v1/campaigns/${encodeURIComponent(input.campaignId)}/mnemons/${pathSegment}`,
    { items }
  );
}

// --- Journal ---
const updateJournalItemSchema = z.object({
  ...updateCommon,
  date: z.string().optional(),
  sessionNumber: z.number().int().optional(),
  involvedNpcEntryIds: stringArray(),
  involvedLocationEntryIds: stringArray(),
  involvedCharacterIds: stringArray(),
  outcome: z.string().optional(),
  consequenceEntryIds: stringArray(),
});
export const updateJournalMnemonsInputSchema = z.object({
  campaignId: z.string().min(1),
  items: z.array(updateJournalItemSchema).min(1).max(50),
});
export async function updateJournalMnemons(
  input: z.infer<typeof updateJournalMnemonsInputSchema>
): Promise<MnemonBulkResponse> {
  const resolver = new MnemonResolver(input.campaignId);
  const items = [];
  for (const it of input.items) {
    items.push({
      ...it,
      entryId: await resolver.resolve(it.entryId, { fieldLabel: "entryId" }),
      involvedNpcEntryIds: await resolver.resolveArray(it.involvedNpcEntryIds, { type: "NPC", fieldLabel: "involvedNpcEntryIds" }),
      involvedLocationEntryIds: await resolver.resolveArray(it.involvedLocationEntryIds, { type: "Location", fieldLabel: "involvedLocationEntryIds" }),
      consequenceEntryIds: await resolver.resolveArray(it.consequenceEntryIds, { fieldLabel: "consequenceEntryIds" }),
    });
  }
  return argoPatch<MnemonBulkResponse, { items: typeof items }>(
    `/mcp/v1/campaigns/${encodeURIComponent(input.campaignId)}/mnemons/journal`,
    { items }
  );
}

// --- SessionSummary ---
const updateSessionSummaryItemSchema = z.object({
  ...updateCommon,
  date: z.string().optional(),
  sessionNumber: z.number().int().optional(),
  ...sessionSummaryNarrative,
});
export const updateSessionSummaryMnemonsInputSchema = z.object({
  campaignId: z.string().min(1),
  items: z.array(updateSessionSummaryItemSchema).min(1).max(50),
});
export async function updateSessionSummaryMnemons(
  input: z.infer<typeof updateSessionSummaryMnemonsInputSchema>
): Promise<MnemonBulkResponse> {
  const resolver = new MnemonResolver(input.campaignId);
  const items = [];
  for (const it of input.items) {
    items.push({
      ...it,
      // entryId still resolves, so callers may address the summary by title. The
      // former id arrays are gone — those links live in the relationship graph.
      entryId: await resolver.resolve(it.entryId, { fieldLabel: "entryId" }),
    });
  }
  return argoPatch<MnemonBulkResponse, { items: typeof items }>(
    `/mcp/v1/campaigns/${encodeURIComponent(input.campaignId)}/mnemons/session-summary`,
    { items }
  );
}

// --- Player ---
const updatePlayerItemSchema = z.object({
  ...updateCommon,
  playerKind: z.enum(["PARTY", "CHARACTER", "NOTES"]).optional(),
  partyId: z.string().optional(),
  parentEntryId: z.string().optional(),
  characterId: z.string().optional(),
});
export const updatePlayerMnemonsInputSchema = z.object({
  campaignId: z.string().min(1),
  items: z.array(updatePlayerItemSchema).min(1).max(50),
});
export async function updatePlayerMnemons(
  input: z.infer<typeof updatePlayerMnemonsInputSchema>
): Promise<MnemonBulkResponse> {
  const resolver = new MnemonResolver(input.campaignId);
  const items = [];
  for (const it of input.items) {
    items.push({
      ...it,
      entryId: await resolver.resolve(it.entryId, { fieldLabel: "entryId" }),
      parentEntryId: await resolver.resolveOptional(it.parentEntryId, { type: "Player", fieldLabel: "parentEntryId" }),
    });
  }
  return argoPatch<MnemonBulkResponse, { items: typeof items }>(
    `/mcp/v1/campaigns/${encodeURIComponent(input.campaignId)}/mnemons/player`,
    { items }
  );
}

// --- Custom ---
const updateCustomItemSchema = z.object({ ...updateCommon, customType: z.string().optional() });
export const updateCustomMnemonsInputSchema = z.object({
  campaignId: z.string().min(1),
  items: z.array(updateCustomItemSchema).min(1).max(50),
});
export async function updateCustomMnemons(
  input: z.infer<typeof updateCustomMnemonsInputSchema>
): Promise<MnemonBulkResponse> {
  const resolver = new MnemonResolver(input.campaignId);
  const items = await Promise.all(
    input.items.map(async (it) => ({ ...it, entryId: await resolver.resolve(it.entryId, { fieldLabel: "entryId" }) }))
  );
  return argoPatch<MnemonBulkResponse, { items: typeof items }>(
    `/mcp/v1/campaigns/${encodeURIComponent(input.campaignId)}/mnemons/custom`,
    { items }
  );
}

// ---------------------------------------------------------------------------
// Content tool — block-level mutations
// ---------------------------------------------------------------------------

const blockOpSchema = z
  .object({
    op: z.enum(["append", "insertAfter", "replace", "remove"]).describe("The op to apply."),
    blockId: z.string().optional().describe("Required for replace and remove: a body node id from get_mnemon."),
    afterBlockId: z.string().optional().describe("Required for insertAfter: the body node id the new content follows."),
    markdown: z
      .string()
      .optional()
      .describe(
        "Markdown content for append / insertAfter / replace. May produce several body nodes. " +
          "Mentions: @[label](mnemon:<entryId>); images: ![caption](asset:<assetId>@<campaignId>)."
      ),
  })
  .describe("A single body mutation, keyed by node id. See describe_mnemon_types.blockOps.");

const updateContentItemSchema = z.object({
  entryId: z.string().min(1).describe("Mnemon entry id (hex) or exact title."),
  ops: z.array(blockOpSchema).min(1).max(50).describe("Ordered ops to apply atomically per entry."),
});

export const updateMnemonsContentInputSchema = z.object({
  campaignId: z.string().min(1),
  items: z.array(updateContentItemSchema).min(1).max(50),
});

export async function updateMnemonsContent(
  input: z.infer<typeof updateMnemonsContentInputSchema>
): Promise<MnemonBulkResponse> {
  const resolver = new MnemonResolver(input.campaignId);
  const items = await Promise.all(
    input.items.map(async (it) => ({
      ...it,
      entryId: await resolver.resolve(it.entryId, { fieldLabel: "entryId" }),
    }))
  );
  return argoPost<MnemonBulkResponse, { items: typeof items }>(
    `/mcp/v1/campaigns/${encodeURIComponent(input.campaignId)}/mnemons/content`,
    { items }
  );
}

// ---------------------------------------------------------------------------
// Relationships — unchanged
// ---------------------------------------------------------------------------

export const createMnemonRelationshipInputSchema = z.object({
  campaignId: z.string().min(1),
  sourceEntryId: z.string().min(1),
  targetEntryId: z.string().min(1),
  label: z.enum(RELATIONSHIP_LABELS),
  color: z.string().optional(),
  direction: z
    .string()
    .optional()
    .describe(
      "Deprecated: leave unset. The label alone decides the edge's shape — its kind and how it reads belong to the word (Mnemon D29/D33), and the server refuses a contradiction."
    ),
});

export async function createMnemonRelationship(
  input: z.infer<typeof createMnemonRelationshipInputSchema>
): Promise<Relationship> {
  const { campaignId, ...body } = input;
  const resolver = new MnemonResolver(campaignId);
  const sourceEntryId = await resolver.resolve(body.sourceEntryId, { fieldLabel: "sourceEntryId" });
  const targetEntryId = await resolver.resolve(body.targetEntryId, { fieldLabel: "targetEntryId" });
  return argoPost<Relationship, typeof body>(
    `/mcp/v1/campaigns/${encodeURIComponent(campaignId)}/mnemons/relationships`,
    { ...body, sourceEntryId, targetEntryId }
  );
}

export const deleteMnemonRelationshipInputSchema = z.object({
  campaignId: z.string().min(1),
  relationshipId: z.string().min(1),
});

export async function deleteMnemonRelationship(
  input: z.infer<typeof deleteMnemonRelationshipInputSchema>
): Promise<void> {
  await argoDelete(
    `/mcp/v1/campaigns/${encodeURIComponent(input.campaignId)}/mnemons/relationships/${encodeURIComponent(input.relationshipId)}`
  );
}

export const listMnemonRelationshipsInputSchema = z.object({
  campaignId: z.string().min(1),
  entryId: z.string().min(1),
});

export async function listMnemonRelationships(
  input: z.infer<typeof listMnemonRelationshipsInputSchema>
): Promise<RelationshipsResponse> {
  const resolver = new MnemonResolver(input.campaignId);
  const hex = await resolver.resolve(input.entryId, { fieldLabel: "entryId" });
  return argoGet<RelationshipsResponse>(
    `/mcp/v1/campaigns/${encodeURIComponent(input.campaignId)}/mnemons/${encodeURIComponent(hex)}/relationships`
  );
}
