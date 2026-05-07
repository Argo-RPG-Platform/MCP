/**
 * MCP tools for reading and writing Argo campaign mnemon (memory/lore) entries.
 *
 * Per-type create + update tools, plus a single content-edit tool for block-level
 * mutations (append / insertAfter / replace / remove). Text blocks are HTML — use
 * <b>...</b> not **bold**. Inline <img src="data:..."> or <img src="https://...">
 * is uploaded to the campaign asset bucket and the src is rewritten to asset:<id>.
 */

import { z } from "zod";
import { argoDelete, argoGet, argoPost, argoPatch } from "../client.js";
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

export interface MnemonEntry {
  entryId: string;
  title: string;
  type: string;
  blocks: MnemonBlock[];
  typeProperties?: Record<string, unknown>;
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
] as const;

const RELATIONSHIP_MATRIX: ReadonlyArray<{
  source: string;
  label: typeof RELATIONSHIP_LABELS[number];
  target: string;
  description: string;
}> = [
  { source: "Faction", label: "MEMBER", target: "NPC", description: "An NPC belongs to this faction." },
  { source: "Faction", label: "ALLY", target: "Faction", description: "Two factions are allies. Bidirectional." },
  { source: "Faction", label: "ENEMY", target: "Faction", description: "Source faction is hostile to target. Directional." },
  { source: "Faction", label: "RIVAL", target: "Faction", description: "Two factions compete without open hostility. Directional." },
  { source: "NPC", label: "ALLY", target: "NPC", description: "Two NPCs are allies. Bidirectional." },
  { source: "NPC", label: "ENEMY", target: "NPC", description: "Source NPC is hostile to target. Directional." },
  { source: "Location", label: "PARENT_OF", target: "Location", description: "Hierarchical containment: source is the larger place." },
  { source: "Location", label: "CONTAINS", target: "NPC", description: "An NPC is physically present at this location." },
  { source: "NPC", label: "LOCATED_IN", target: "Location", description: "An NPC is currently at this place. Inverse of CONTAINS." },
];

export function describeMnemonTypes(): object {
  return {
    types: [
      { type: "NPC", tool: "create_npc_mnemons / update_npc_mnemons", description: "A non-player character — a person (INDIVIDUAL) or organization (FACTION)." },
      { type: "Location", tool: "create_location_mnemons / update_location_mnemons", description: "A place in the world." },
      { type: "Quest", tool: "create_quest_mnemons / update_quest_mnemons", description: "A quest or mission." },
      { type: "Lore", tool: "create_lore_mnemons / update_lore_mnemons", description: "World lore or background information." },
      { type: "Archive", tool: "create_archive_mnemons / update_archive_mnemons", description: "Archived lore entry." },
      { type: "Journal", tool: "create_journal_mnemons / update_journal_mnemons", description: "A session journal entry." },
      { type: "SessionSummary", tool: "create_session_summary_mnemons / update_session_summary_mnemons", description: "Structured session summary." },
      { type: "Player", tool: "create_player_mnemons / update_player_mnemons", description: "Player-facing mnemon (party root, character notes, party notes)." },
      { type: "Custom", tool: "create_custom_mnemons / update_custom_mnemons", description: "Custom entry type with free-form title." },
    ],
    htmlFormat: {
      summary: "Text inside mnemon block 'text' is HTML, not Markdown.",
      allowedInlineTags: ["<b>", "<strong>", "<i>", "<em>", "<u>", "<s>", "<code>", "<a href>", "<br>", "<img>"],
      doNot: [
        "Do NOT use Markdown — '**bold**' / '_italic_' / '# heading' / '[text](url)' will be flagged in warnings and produce literal punctuation.",
        "Do NOT wrap text in block-level tags (<p>, <div>, <ul>, <li>, <h1>) inside 'text'. Use mnemon block types instead: paragraph, heading1/2, bullet_list, numbered_list, quote, code, callout, divider.",
      ],
      images: {
        supportedSrc: ["data:image/<type>;base64,<...>", "https://<external-url>", "asset:<existing-asset-id>"],
        rewrite: "Inline <img> with data: or https:// src is uploaded to the campaign bucket; src is rewritten to asset:<id>.",
        caps: "5MB per image, max 5 inline images per text block, 20MB aggregate per write request.",
        failureMode: "Failed/oversize/SSRF-blocked <img> tags are stripped with a warning; the rest of the write succeeds.",
      },
    },
    blockOps: {
      tool: "update_mnemons_content",
      ops: [
        { op: "append", required: ["blockType"], optional: ["text", "language", "checked", "assetId", "data", "mimeType", "filename", "caption"], description: "Add a new block at the end of the entry." },
        { op: "insertAfter", required: ["afterBlockId", "blockType"], optional: ["text", "language", "checked", "assetId", "data", "mimeType", "filename", "caption"], description: "Insert a new block immediately after an existing block." },
        { op: "replace", required: ["blockId", "blockType"], optional: ["text", "language", "checked", "assetId", "data", "mimeType", "filename", "caption"], description: "Replace an existing block. The block's id is preserved so future ops can still address it." },
        { op: "remove", required: ["blockId"], optional: [], description: "Delete an existing block." },
      ],
      blockTypes: ["paragraph", "heading1", "heading2", "bullet_list", "numbered_list", "todo", "quote", "code", "callout", "divider", "image"],
      atomicity: "All ops for one entry are validated up-front and applied atomically. A bad op rejects the whole entry's batch with the offending opIndex; no partial mutation. Multiple entries in one call are independent — each entry's batch is its own transaction.",
      addressing: "Block ids are returned by get_mnemon. Use them to target replace / remove / insertAfter. Newly created blocks (append, insertAfter, replace) get fresh server-generated UUIDs.",
    },
    commonFields: [
      { name: "visibility", type: "enum", values: ["HIDDEN", "INTERNAL", "PUBLIC"], description: "HIDDEN: GM only. INTERNAL: party members (default). PUBLIC: requires a published campaign." },
      { name: "tags", type: "string[]", description: "Optional tag list." },
    ],
    relationshipLabels: RELATIONSHIP_LABELS,
    relationships: RELATIONSHIP_MATRIX,
    idReferences: "All entryId-shaped fields accept a hex entryId OR a mnemon's exact title — the MCP server resolves titles to hex IDs before calling the API. Title→id resolution fails (with candidate ids) when a title matches multiple mnemons.",
  };
}

// ---------------------------------------------------------------------------
// Read tools — unchanged from prior shape
// ---------------------------------------------------------------------------

export const listMnemonsInputSchema = z.object({
  campaignId: z.string().min(1).describe("ID of the campaign."),
  title: z.string().optional().describe("Case-insensitive substring filter on title."),
  type: z.string().optional().describe("Mnemon type filter (NPC, Location, Quest, …)."),
});

const LIST_MNEMONS_PAGE_SIZE = 100;

export async function listMnemons(
  input: z.infer<typeof listMnemonsInputSchema>
): Promise<MnemonSummary[]> {
  const basePath = `/mcp/v1/campaigns/${encodeURIComponent(input.campaignId)}/mnemons`;
  const results: MnemonSummary[] = [];
  for (let page = 0; ; page++) {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("size", String(LIST_MNEMONS_PAGE_SIZE));
    if (input.title) params.set("title", input.title);
    if (input.type) params.set("type", input.type);
    const batch = await argoGet<MnemonSummary[]>(`${basePath}?${params.toString()}`);
    results.push(...batch);
    if (batch.length < LIST_MNEMONS_PAGE_SIZE) break;
  }
  return results;
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
// Shared block-input shape (used by all create_*_mnemons tools)
// ---------------------------------------------------------------------------

const blockInputSchema = z
  .object({
    type: z
      .enum([
        "paragraph",
        "heading1",
        "heading2",
        "bullet_list",
        "numbered_list",
        "todo",
        "quote",
        "code",
        "callout",
        "divider",
        "image",
      ])
      .describe("Block type."),
    content: z
      .string()
      .optional()
      .describe(
        "HTML text content for text-type blocks. Use <b>/<i>/<u>/<a>/<br>/<img> — NOT Markdown."
      ),
    language: z.string().optional().describe("Code-block language hint."),
    checked: z.boolean().optional().describe("Todo-block checked state."),
    assetId: z.string().optional().describe("Image block: pre-uploaded campaign asset id."),
    data: z.string().optional().describe("Image block: inline base64 data (decoded server-side, max 5MB)."),
    mimeType: z.string().optional().describe("Image block mime type — required when 'data' is set."),
    filename: z.string().optional().describe("Image block filename hint."),
    caption: z.string().optional().describe("Image block caption."),
  })
  .describe("A single content block. Image blocks need assetId OR (data + mimeType).");

const visibilityEnum = z.enum(["HIDDEN", "INTERNAL", "PUBLIC"]).optional();
const tagsSchema = z.array(z.string()).optional();
const stringArray = () => z.array(z.string()).optional();

// ---------------------------------------------------------------------------
// Create tools — one per type
// ---------------------------------------------------------------------------

const createCommon = {
  title: z.string().min(1).describe("Title of the new entry."),
  blocks: z.array(blockInputSchema).min(1).describe("Initial content blocks (at least one)."),
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
const createQuestItemSchema = z.object({
  ...createCommon,
  questStatus: z.string().optional().describe("active | completed | failed."),
  issuerNpcEntryId: z.string().optional(),
  issuerText: z.string().optional(),
  repeatable: z.boolean().optional(),
  expiresAt: z.string().optional().describe("ISO-8601 instant."),
  subQuestEntryIds: stringArray(),
  relatedNpcEntryIds: stringArray(),
  relatedLocationEntryIds: stringArray(),
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
    items.push({
      ...it,
      issuerNpcEntryId: await resolver.resolveOptional(it.issuerNpcEntryId, { type: "NPC", fieldLabel: "issuerNpcEntryId" }),
      subQuestEntryIds: await resolver.resolveArray(it.subQuestEntryIds, { type: "Quest", fieldLabel: "subQuestEntryIds" }),
      relatedNpcEntryIds: await resolver.resolveArray(it.relatedNpcEntryIds, { type: "NPC", fieldLabel: "relatedNpcEntryIds" }),
      relatedLocationEntryIds: await resolver.resolveArray(it.relatedLocationEntryIds, { type: "Location", fieldLabel: "relatedLocationEntryIds" }),
    });
  }
  return argoPost<MnemonBulkResponse, { items: typeof items }>(
    `/mcp/v1/campaigns/${encodeURIComponent(input.campaignId)}/mnemons/quest`,
    { items }
  );
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
const createSessionSummaryItemSchema = z.object({
  ...createCommon,
  date: z.string().optional(),
  sessionNumber: z.number().int().optional(),
  attendeeCharacterIds: stringArray(),
  attendeeNpcEntryIds: stringArray(),
  linkedQuestEntryIds: stringArray(),
  linkedLocationEntryIds: stringArray(),
});

export const createSessionSummaryMnemonsInputSchema = z.object({
  campaignId: z.string().min(1),
  items: z.array(createSessionSummaryItemSchema).min(1).max(50),
});

export async function createSessionSummaryMnemons(
  input: z.infer<typeof createSessionSummaryMnemonsInputSchema>
): Promise<MnemonBulkResponse> {
  const resolver = new MnemonResolver(input.campaignId);
  const items = [];
  for (const it of input.items) {
    items.push({
      ...it,
      attendeeNpcEntryIds: await resolver.resolveArray(it.attendeeNpcEntryIds, { type: "NPC", fieldLabel: "attendeeNpcEntryIds" }),
      linkedQuestEntryIds: await resolver.resolveArray(it.linkedQuestEntryIds, { type: "Quest", fieldLabel: "linkedQuestEntryIds" }),
      linkedLocationEntryIds: await resolver.resolveArray(it.linkedLocationEntryIds, { type: "Location", fieldLabel: "linkedLocationEntryIds" }),
    });
  }
  return argoPost<MnemonBulkResponse, { items: typeof items }>(
    `/mcp/v1/campaigns/${encodeURIComponent(input.campaignId)}/mnemons/session-summary`,
    { items }
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
  questStatus: z.string().optional(),
  issuerNpcEntryId: z.string().optional(),
  issuerText: z.string().optional(),
  repeatable: z.boolean().optional(),
  expiresAt: z.string().optional(),
  subQuestEntryIds: stringArray(),
  relatedNpcEntryIds: stringArray(),
  relatedLocationEntryIds: stringArray(),
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
      entryId: await resolver.resolve(it.entryId, { fieldLabel: "entryId" }),
      issuerNpcEntryId: await resolver.resolveOptional(it.issuerNpcEntryId, { type: "NPC", fieldLabel: "issuerNpcEntryId" }),
      subQuestEntryIds: await resolver.resolveArray(it.subQuestEntryIds, { type: "Quest", fieldLabel: "subQuestEntryIds" }),
      relatedNpcEntryIds: await resolver.resolveArray(it.relatedNpcEntryIds, { type: "NPC", fieldLabel: "relatedNpcEntryIds" }),
      relatedLocationEntryIds: await resolver.resolveArray(it.relatedLocationEntryIds, { type: "Location", fieldLabel: "relatedLocationEntryIds" }),
    });
  }
  return argoPatch<MnemonBulkResponse, { items: typeof items }>(
    `/mcp/v1/campaigns/${encodeURIComponent(input.campaignId)}/mnemons/quest`,
    { items }
  );
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
  attendeeCharacterIds: stringArray(),
  attendeeNpcEntryIds: stringArray(),
  linkedQuestEntryIds: stringArray(),
  linkedLocationEntryIds: stringArray(),
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
      entryId: await resolver.resolve(it.entryId, { fieldLabel: "entryId" }),
      attendeeNpcEntryIds: await resolver.resolveArray(it.attendeeNpcEntryIds, { type: "NPC", fieldLabel: "attendeeNpcEntryIds" }),
      linkedQuestEntryIds: await resolver.resolveArray(it.linkedQuestEntryIds, { type: "Quest", fieldLabel: "linkedQuestEntryIds" }),
      linkedLocationEntryIds: await resolver.resolveArray(it.linkedLocationEntryIds, { type: "Location", fieldLabel: "linkedLocationEntryIds" }),
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
    blockId: z.string().optional().describe("Required for replace and remove."),
    afterBlockId: z.string().optional().describe("Required for insertAfter."),
    blockType: z
      .enum([
        "paragraph",
        "heading1",
        "heading2",
        "bullet_list",
        "numbered_list",
        "todo",
        "quote",
        "code",
        "callout",
        "divider",
        "image",
      ])
      .optional()
      .describe("Required for append, insertAfter, replace."),
    text: z.string().optional().describe("HTML text for text-type blocks."),
    language: z.string().optional(),
    checked: z.boolean().optional(),
    assetId: z.string().optional(),
    data: z.string().optional(),
    mimeType: z.string().optional(),
    filename: z.string().optional(),
    caption: z.string().optional(),
  })
  .describe("A single block-level mutation. See describe_mnemon_types.blockOps.");

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
  direction: z.string().optional(),
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
