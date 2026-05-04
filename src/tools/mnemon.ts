/**
 * MCP tools for reading and writing campaign mnemon (memory/lore) entries.
 *
 * Read tools: require grant_read on the campaign.
 * Write tools: require grant_write on the campaign (GM grants only).
 */

import { z } from "zod";
import { argoDelete, argoGet, argoPost, argoPatch } from "../client.js";
import { MnemonResolver } from "./idResolution.js";

// ---------------------------------------------------------------------------
// Types (mirrors WebAPI McpMnemonSummaryDTO / McpMnemonDetailDTO)
// ---------------------------------------------------------------------------

export interface MnemonBlock {
  id: string;
  type: string;
  text: string;
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

// ---------------------------------------------------------------------------
// Schema discovery (no HTTP call)
// ---------------------------------------------------------------------------

export const describeMnemonTypesInputSchema = z.object({});

const NPC_TYPE_VALUES = ["FACTION", "INDIVIDUAL"] as const;
const RELATIONSHIP_LABELS = [
  "MEMBER",
  "ALLY",
  "ENEMY",
  "RIVAL",
  "PARENT_OF",
  "CONTAINS",
  "LOCATED_IN",
] as const;

/**
 * Valid (sourceType, label, targetType) triples. The MCP server publishes
 * this matrix so the model can pick a relationship that actually fits the
 * two mnemons it is connecting — instead of guessing and getting rejected.
 *
 * Direction: source is described as <label> of target. Read as:
 *   "{source} {label} {target}"  e.g.  "Region PARENT_OF City".
 */
const RELATIONSHIP_MATRIX: ReadonlyArray<{
  source: string;
  label: typeof RELATIONSHIP_LABELS[number];
  target: string;
  description: string;
}> = [
  {
    source: "Faction",
    label: "MEMBER",
    target: "NPC",
    description: "An NPC belongs to this faction (FACTION-typed NPC contains INDIVIDUAL-typed NPCs).",
  },
  {
    source: "Faction",
    label: "ALLY",
    target: "Faction",
    description: "Two factions are allies. Bidirectional.",
  },
  {
    source: "Faction",
    label: "ENEMY",
    target: "Faction",
    description: "Source faction is hostile to the target faction. Directional.",
  },
  {
    source: "Faction",
    label: "RIVAL",
    target: "Faction",
    description: "Two factions compete without open hostility. Directional.",
  },
  {
    source: "NPC",
    label: "ALLY",
    target: "NPC",
    description: "Two NPCs are allies. Bidirectional.",
  },
  {
    source: "NPC",
    label: "ENEMY",
    target: "NPC",
    description: "Source NPC is hostile to the target NPC. Directional.",
  },
  {
    source: "Location",
    label: "PARENT_OF",
    target: "Location",
    description:
      "Hierarchical containment of locations: source is the larger, more general place. " +
      "Example: Region PARENT_OF City PARENT_OF District PARENT_OF Tavern. Directional.",
  },
  {
    source: "Location",
    label: "CONTAINS",
    target: "NPC",
    description: "An NPC is physically present at this location.",
  },
  {
    source: "NPC",
    label: "LOCATED_IN",
    target: "Location",
    description:
      "An NPC is currently located at this place. Inverse perspective of " +
      "Location CONTAINS NPC — pick whichever direction reads more naturally.",
  },
];

export function describeMnemonTypes(): object {
  return {
    types: [
      {
        type: "NPC",
        description:
          "A non-player character. npcType must be FACTION (an organization) or INDIVIDUAL " +
          "(a person). FACTIONs use memberNpcEntryIds; INDIVIDUALs use affiliationEntryIds. " +
          "Both project into MEMBER relationships server-side.",
        typeSpecificFields: [
          { name: "npcType", type: "enum", values: NPC_TYPE_VALUES, required: true },
          { name: "sheetId", type: "string", description: "Reference to a character sheet." },
          { name: "primaryLocationEntryId", type: "string", description: "Home location entryId." },
          { name: "memberNpcEntryIds", type: "string[]", description: "FACTION only: members of this faction." },
          { name: "affiliationEntryIds", type: "string[]", description: "INDIVIDUAL only: factions this person belongs to." },
        ],
      },
      {
        type: "Location",
        description: "A place in the world — a city, dungeon, tavern, etc.",
        typeSpecificFields: [
          { name: "levelId", type: "string", description: "Unreal Engine level reference." },
        ],
      },
      {
        type: "Quest",
        description: "A quest or mission the party can undertake.",
        typeSpecificFields: [
          { name: "questStatus", type: "string", description: "active | completed | failed" },
          { name: "issuerNpcEntryId", type: "string" },
          { name: "issuerText", type: "string" },
          { name: "repeatable", type: "boolean" },
          { name: "expiresAt", type: "string", description: "ISO-8601 instant." },
          { name: "subQuestEntryIds", type: "string[]" },
          { name: "relatedNpcEntryIds", type: "string[]" },
          { name: "relatedLocationEntryIds", type: "string[]" },
        ],
      },
      {
        type: "Lore",
        description: "World lore or background information.",
        typeSpecificFields: [
          { name: "relatedEntryIds", type: "string[]" },
        ],
      },
      {
        type: "Archive",
        description: "Archived lore entry.",
        typeSpecificFields: [
          { name: "relatedEntryIds", type: "string[]" },
        ],
      },
      {
        type: "Journal",
        description: "A session journal entry.",
        typeSpecificFields: [
          { name: "date", type: "string" },
          { name: "sessionNumber", type: "integer" },
          { name: "involvedNpcEntryIds", type: "string[]" },
          { name: "involvedLocationEntryIds", type: "string[]" },
          { name: "involvedCharacterIds", type: "string[]" },
          { name: "outcome", type: "string" },
          { name: "consequenceEntryIds", type: "string[]" },
        ],
      },
      {
        type: "SessionSummary",
        description: "A structured summary of a game session.",
        typeSpecificFields: [
          { name: "date", type: "string" },
          { name: "sessionNumber", type: "integer" },
          { name: "attendeeCharacterIds", type: "string[]" },
          { name: "attendeeNpcEntryIds", type: "string[]" },
          { name: "linkedQuestEntryIds", type: "string[]" },
          { name: "linkedLocationEntryIds", type: "string[]" },
        ],
      },
      {
        type: "Player",
        description:
          "A player-facing mnemon (character notes, party sheet, etc.). " +
          "Player mnemons are reconciled by the server's PlayerMnemon sync service: " +
          "entries that don't match an active CampaignParty / SessionCharacter are " +
          "automatically detached. To create a CHARACTER nested under a PARTY mnemon, " +
          "supply playerKind=CHARACTER, parentEntryId=<the PARTY mnemon's entryId>, " +
          "partyId=<the CampaignParty.id of that party>, and characterId=<the " +
          "SessionCharacter id>; otherwise the server will detach the entry.",
        typeSpecificFields: [
          {
            name: "playerKind",
            type: "enum",
            values: ["PARTY", "CHARACTER", "NOTES"],
            description:
              "PARTY = the party root mnemon. CHARACTER = a single character nested under a PARTY (requires parentEntryId, partyId, and characterId). NOTES = free-form notes scoped to a party.",
          },
          {
            name: "partyId",
            type: "string",
            description:
              "The CampaignParty id (NOT a mnemon entryId). Validated against the campaign's active parties; mismatched entries are detached.",
          },
          {
            name: "parentEntryId",
            type: "string",
            description:
              "For playerKind=CHARACTER: entryId (or exact title) of the PARTY-kind Player mnemon this character nests under.",
          },
          {
            name: "characterId",
            type: "string",
            description:
              "The SessionCharacter id this player mnemon represents. Required for playerKind=CHARACTER.",
          },
        ],
      },
      {
        type: "Custom",
        description: "A custom entry type. Use a descriptive title.",
        typeSpecificFields: [],
      },
    ],
    commonFields: [
      {
        name: "visibility",
        type: "enum",
        values: ["HIDDEN", "INTERNAL", "PUBLIC"],
        description:
          "HIDDEN: GM/co-GM only. INTERNAL: all party members (default). " +
          "PUBLIC: visible on the campaign's public publication — requires the campaign to be published. " +
          "Use the set_mnemon_visibility tool to change this after creation.",
      },
      { name: "tags", type: "string[]", description: "Optional tag list." },
      { name: "content", type: "string", description: "Initial text content (stored as a paragraph block)." },
    ],
    idReferences:
      "All entryId-shaped fields (partyId, parentEntryId, *NpcEntryIds, *LocationEntryIds, " +
      "*QuestEntryIds, sourceEntryId, targetEntryId, etc.) accept either a hex entryId OR the " +
      "mnemon's exact title — the MCP server resolves titles to hex IDs before calling the API. " +
      "If a title matches multiple mnemons, the call fails with a list of candidate IDs; pass " +
      "the explicit hex entryId in that case.",
    relationshipLabels: RELATIONSHIP_LABELS,
    relationships: RELATIONSHIP_MATRIX,
    relationshipsHowTo:
      "Use create_mnemon_relationship with the (source, label, target) triple from the relationships matrix. " +
      "Direction matters for PARENT_OF, CONTAINS, LOCATED_IN, ENEMY, RIVAL. " +
      "Example: to nest 'Tavern of the Rusty Anchor' inside 'Port City Veridia', " +
      "create the relationship with source=<port-city-id>, label=PARENT_OF, target=<tavern-id>.",
  };
}

// ---------------------------------------------------------------------------
// Read tools
// ---------------------------------------------------------------------------

export const listMnemonsInputSchema = z.object({
  campaignId: z.string().min(1).describe("ID of the campaign whose mnemon entries to list."),
  title: z
    .string()
    .optional()
    .describe(
      "Optional case-insensitive substring filter on the entry title (meta.title). " +
        "Does NOT match against body content or tags."
    ),
  type: z
    .string()
    .optional()
    .describe("Optional type filter (e.g. NPC, Location, Quest, Lore, Archive, Journal, SessionSummary, Player, Custom)."),
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

    if (batch.length < LIST_MNEMONS_PAGE_SIZE) {
      break;
    }
  }

  return results;
}

export const getMnemonInputSchema = z.object({
  campaignId: z.string().min(1).describe("Campaign ID."),
  entryId: z
    .string()
    .min(1)
    .describe("Mnemon entry ID (hex) or its exact title — titles are resolved server-side."),
});

export async function getMnemon(
  input: z.infer<typeof getMnemonInputSchema>
): Promise<MnemonEntry> {
  const resolver = new MnemonResolver(input.campaignId);
  const hexEntryId = await resolver.resolve(input.entryId, { fieldLabel: "entryId" });
  return argoGet<MnemonEntry>(
    `/mcp/v1/campaigns/${encodeURIComponent(input.campaignId)}/mnemons/${encodeURIComponent(hexEntryId)}`
  );
}

// ---------------------------------------------------------------------------
// Shared payload schema for create / bulk / update
// ---------------------------------------------------------------------------

const stringArray = () => z.array(z.string()).optional();

const createMnemonItemSchema = z.object({
  title: z.string().min(1).describe("Title of the mnemon entry."),
  type: z
    .string()
    .optional()
    .describe(
      "Mnemon type: NPC, Location, Quest, Lore, Archive, Journal, SessionSummary, Player, " +
        "Custom (default). Call describe_mnemon_types for per-type fields."
    ),
  content: z.string().optional().describe("Initial text content (paragraph block)."),
  visibility: z
    .enum(["HIDDEN", "INTERNAL", "PUBLIC"])
    .optional()
    .describe("Visibility: HIDDEN/INTERNAL = GM only, PUBLIC = all players."),
  tags: stringArray(),

  // NPC
  npcType: z
    .enum(NPC_TYPE_VALUES)
    .optional()
    .describe("NPC subtype, REQUIRED when type=NPC. FACTION = organization; INDIVIDUAL = person."),
  sheetId: z.string().optional(),
  primaryLocationEntryId: z.string().optional(),
  memberNpcEntryIds: stringArray().describe(
    "FACTION only: member NPC entryIds. Server projects into MEMBER relationships."
  ),
  affiliationEntryIds: stringArray().describe(
    "INDIVIDUAL only: faction entryIds this NPC belongs to. Server projects into MEMBER relationships."
  ),

  // Quest
  questStatus: z.string().optional(),
  issuerNpcEntryId: z.string().optional(),
  issuerText: z.string().optional(),
  repeatable: z.boolean().optional(),
  expiresAt: z.string().optional(),
  subQuestEntryIds: stringArray(),
  relatedNpcEntryIds: stringArray(),
  relatedLocationEntryIds: stringArray(),

  // Location
  levelId: z.string().optional(),

  // Lore / Archive
  relatedEntryIds: stringArray(),

  // Journal / SessionSummary
  date: z.string().optional(),
  sessionNumber: z.number().int().optional(),
  involvedNpcEntryIds: stringArray(),
  involvedLocationEntryIds: stringArray(),
  involvedCharacterIds: stringArray(),
  outcome: z.string().optional(),
  consequenceEntryIds: stringArray(),
  attendeeCharacterIds: stringArray(),
  attendeeNpcEntryIds: stringArray(),
  linkedQuestEntryIds: stringArray(),
  linkedLocationEntryIds: stringArray(),

  // Player
  playerKind: z.enum(["PARTY", "CHARACTER", "NOTES"]).optional(),
  partyId: z
    .string()
    .optional()
    .describe(
      "CampaignParty id (NOT a mnemon entryId). Validated server-side against the campaign's active parties; mismatched entries are auto-detached."
    ),
  parentEntryId: z
    .string()
    .optional()
    .describe(
      "For playerKind=CHARACTER, the entryId (or exact title) of the PARTY-kind Player mnemon this character nests under. Resolved server-side."
    ),
  characterId: z
    .string()
    .optional()
    .describe(
      "SessionCharacter id this player mnemon represents. Required for playerKind=CHARACTER."
    ),
});

type CreateMnemonItem = z.infer<typeof createMnemonItemSchema>;

interface CreateMnemonPayload {
  type: string;
  title: string;
  content?: string;
  visibility?: string;
  tags?: string[];
  npcType?: string;
  sheetId?: string;
  primaryLocationEntryId?: string;
  memberNpcEntryIds?: string[];
  affiliationEntryIds?: string[];
  questStatus?: string;
  issuerNpcEntryId?: string;
  issuerText?: string;
  repeatable?: boolean;
  expiresAt?: string;
  subQuestEntryIds?: string[];
  relatedNpcEntryIds?: string[];
  relatedLocationEntryIds?: string[];
  levelId?: string;
  relatedEntryIds?: string[];
  date?: string;
  sessionNumber?: number;
  involvedNpcEntryIds?: string[];
  involvedLocationEntryIds?: string[];
  involvedCharacterIds?: string[];
  outcome?: string;
  consequenceEntryIds?: string[];
  attendeeCharacterIds?: string[];
  attendeeNpcEntryIds?: string[];
  linkedQuestEntryIds?: string[];
  linkedLocationEntryIds?: string[];
  playerKind?: string;
  partyId?: string;
  parentEntryId?: string;
  characterId?: string;
}

function buildCreatePayload(item: CreateMnemonItem): CreateMnemonPayload {
  return {
    type: item.type ?? "Custom",
    title: item.title,
    ...(item.content !== undefined && { content: item.content }),
    ...(item.visibility !== undefined && { visibility: item.visibility }),
    ...(item.tags !== undefined && { tags: item.tags }),
    ...(item.npcType !== undefined && { npcType: item.npcType }),
    ...(item.sheetId !== undefined && { sheetId: item.sheetId }),
    ...(item.primaryLocationEntryId !== undefined && { primaryLocationEntryId: item.primaryLocationEntryId }),
    ...(item.memberNpcEntryIds !== undefined && { memberNpcEntryIds: item.memberNpcEntryIds }),
    ...(item.affiliationEntryIds !== undefined && { affiliationEntryIds: item.affiliationEntryIds }),
    ...(item.questStatus !== undefined && { questStatus: item.questStatus }),
    ...(item.issuerNpcEntryId !== undefined && { issuerNpcEntryId: item.issuerNpcEntryId }),
    ...(item.issuerText !== undefined && { issuerText: item.issuerText }),
    ...(item.repeatable !== undefined && { repeatable: item.repeatable }),
    ...(item.expiresAt !== undefined && { expiresAt: item.expiresAt }),
    ...(item.subQuestEntryIds !== undefined && { subQuestEntryIds: item.subQuestEntryIds }),
    ...(item.relatedNpcEntryIds !== undefined && { relatedNpcEntryIds: item.relatedNpcEntryIds }),
    ...(item.relatedLocationEntryIds !== undefined && { relatedLocationEntryIds: item.relatedLocationEntryIds }),
    ...(item.levelId !== undefined && { levelId: item.levelId }),
    ...(item.relatedEntryIds !== undefined && { relatedEntryIds: item.relatedEntryIds }),
    ...(item.date !== undefined && { date: item.date }),
    ...(item.sessionNumber !== undefined && { sessionNumber: item.sessionNumber }),
    ...(item.involvedNpcEntryIds !== undefined && { involvedNpcEntryIds: item.involvedNpcEntryIds }),
    ...(item.involvedLocationEntryIds !== undefined && { involvedLocationEntryIds: item.involvedLocationEntryIds }),
    ...(item.involvedCharacterIds !== undefined && { involvedCharacterIds: item.involvedCharacterIds }),
    ...(item.outcome !== undefined && { outcome: item.outcome }),
    ...(item.consequenceEntryIds !== undefined && { consequenceEntryIds: item.consequenceEntryIds }),
    ...(item.attendeeCharacterIds !== undefined && { attendeeCharacterIds: item.attendeeCharacterIds }),
    ...(item.attendeeNpcEntryIds !== undefined && { attendeeNpcEntryIds: item.attendeeNpcEntryIds }),
    ...(item.linkedQuestEntryIds !== undefined && { linkedQuestEntryIds: item.linkedQuestEntryIds }),
    ...(item.linkedLocationEntryIds !== undefined && { linkedLocationEntryIds: item.linkedLocationEntryIds }),
    ...(item.playerKind !== undefined && { playerKind: item.playerKind }),
    ...(item.partyId !== undefined && { partyId: item.partyId }),
    ...(item.parentEntryId !== undefined && { parentEntryId: item.parentEntryId }),
    ...(item.characterId !== undefined && { characterId: item.characterId }),
  };
}

// ---------------------------------------------------------------------------
// ID-reference resolution
// ---------------------------------------------------------------------------

/**
 * Resolves every entryId-shaped field on a (partial) create/update item from
 * its title-form to the canonical hex entryId via {@link MnemonResolver}. Hex
 * inputs pass through unchanged. Fields referencing non-mnemon entities
 * (characterId, sheetId, levelId, *CharacterIds) are intentionally left alone
 * — those point to SessionCharacters / Unreal levels / sheets, not mnemons.
 */
async function resolveItemReferences<T extends Partial<CreateMnemonItem>>(
  resolver: MnemonResolver,
  item: T
): Promise<T> {
  const out: T = { ...item };

  // partyId is a CampaignParty.id, NOT a mnemon entryId — do not resolve.
  out.partyId = item.partyId;
  out.parentEntryId = await resolver.resolveOptional(item.parentEntryId, {
    type: "Player",
    fieldLabel: "parentEntryId",
  });
  out.primaryLocationEntryId = await resolver.resolveOptional(item.primaryLocationEntryId, {
    type: "Location",
    fieldLabel: "primaryLocationEntryId",
  });
  out.issuerNpcEntryId = await resolver.resolveOptional(item.issuerNpcEntryId, {
    type: "NPC",
    fieldLabel: "issuerNpcEntryId",
  });
  out.memberNpcEntryIds = await resolver.resolveArray(item.memberNpcEntryIds, {
    type: "NPC",
    fieldLabel: "memberNpcEntryIds",
  });
  // Affiliations may be Factions (NPCs of npcType=FACTION); keep type unfiltered.
  out.affiliationEntryIds = await resolver.resolveArray(item.affiliationEntryIds, {
    fieldLabel: "affiliationEntryIds",
  });
  out.subQuestEntryIds = await resolver.resolveArray(item.subQuestEntryIds, {
    type: "Quest",
    fieldLabel: "subQuestEntryIds",
  });
  out.relatedNpcEntryIds = await resolver.resolveArray(item.relatedNpcEntryIds, {
    type: "NPC",
    fieldLabel: "relatedNpcEntryIds",
  });
  out.relatedLocationEntryIds = await resolver.resolveArray(item.relatedLocationEntryIds, {
    type: "Location",
    fieldLabel: "relatedLocationEntryIds",
  });
  out.relatedEntryIds = await resolver.resolveArray(item.relatedEntryIds, {
    fieldLabel: "relatedEntryIds",
  });
  out.involvedNpcEntryIds = await resolver.resolveArray(item.involvedNpcEntryIds, {
    type: "NPC",
    fieldLabel: "involvedNpcEntryIds",
  });
  out.involvedLocationEntryIds = await resolver.resolveArray(item.involvedLocationEntryIds, {
    type: "Location",
    fieldLabel: "involvedLocationEntryIds",
  });
  out.consequenceEntryIds = await resolver.resolveArray(item.consequenceEntryIds, {
    fieldLabel: "consequenceEntryIds",
  });
  out.attendeeNpcEntryIds = await resolver.resolveArray(item.attendeeNpcEntryIds, {
    type: "NPC",
    fieldLabel: "attendeeNpcEntryIds",
  });
  out.linkedQuestEntryIds = await resolver.resolveArray(item.linkedQuestEntryIds, {
    type: "Quest",
    fieldLabel: "linkedQuestEntryIds",
  });
  out.linkedLocationEntryIds = await resolver.resolveArray(item.linkedLocationEntryIds, {
    type: "Location",
    fieldLabel: "linkedLocationEntryIds",
  });

  return out;
}

// ---------------------------------------------------------------------------
// Create / bulk-create / update
// ---------------------------------------------------------------------------

export const createMnemonInputSchema = createMnemonItemSchema.extend({
  campaignId: z.string().min(1).describe("Campaign ID."),
});

export async function createMnemon(
  input: z.infer<typeof createMnemonInputSchema>
): Promise<MnemonEntry> {
  const { campaignId, ...rest } = input;
  const resolver = new MnemonResolver(campaignId);
  const resolved = await resolveItemReferences(resolver, rest);
  return argoPost<MnemonEntry, CreateMnemonPayload>(
    `/mcp/v1/campaigns/${encodeURIComponent(campaignId)}/mnemons`,
    buildCreatePayload(resolved)
  );
}

export const createMnemonsInputSchema = z.object({
  campaignId: z.string().min(1).describe("Campaign ID."),
  items: z
    .array(createMnemonItemSchema)
    .min(1)
    .max(50)
    .describe("Up to 50 mnemon entries to create in one call."),
});

export interface BulkCreateMnemonResult {
  index: number;
  success: boolean;
  entryId?: string;
  title?: string;
  error?: string;
}

export interface BulkCreateMnemonResponse {
  results: BulkCreateMnemonResult[];
}

export async function createMnemons(
  input: z.infer<typeof createMnemonsInputSchema>
): Promise<BulkCreateMnemonResponse> {
  const resolver = new MnemonResolver(input.campaignId);
  // Sequential resolution shares the cached list_mnemons call across items;
  // parallelism would buy nothing because the first call already populates it.
  const resolvedItems: CreateMnemonItem[] = [];
  for (const item of input.items) {
    resolvedItems.push(await resolveItemReferences(resolver, item));
  }
  return argoPost<BulkCreateMnemonResponse, { items: CreateMnemonPayload[] }>(
    `/mcp/v1/campaigns/${encodeURIComponent(input.campaignId)}/mnemons/bulk`,
    { items: resolvedItems.map(buildCreatePayload) }
  );
}

export const updateMnemonInputSchema = createMnemonItemSchema.partial().extend({
  campaignId: z.string().min(1).describe("Campaign ID."),
  entryId: z
    .string()
    .min(1)
    .describe("Mnemon entry ID (hex) or its exact title — titles are resolved server-side."),
});

export async function updateMnemon(
  input: z.infer<typeof updateMnemonInputSchema>
): Promise<MnemonEntry> {
  const { campaignId, entryId, type: _type, ...rest } = input;
  const resolver = new MnemonResolver(campaignId);
  const hexEntryId = await resolver.resolve(entryId, { fieldLabel: "entryId" });
  const resolvedRest = await resolveItemReferences(resolver, rest);
  // Update payload mirrors create but type cannot be changed.
  const payload: Partial<CreateMnemonPayload> = {};
  for (const [key, value] of Object.entries(resolvedRest)) {
    if (value !== undefined) {
      (payload as Record<string, unknown>)[key] = value;
    }
  }
  return argoPatch<MnemonEntry, Partial<CreateMnemonPayload>>(
    `/mcp/v1/campaigns/${encodeURIComponent(campaignId)}/mnemons/${encodeURIComponent(hexEntryId)}`,
    payload
  );
}

// ---------------------------------------------------------------------------
// Relationships
// ---------------------------------------------------------------------------

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

export const createMnemonRelationshipInputSchema = z.object({
  campaignId: z.string().min(1).describe("Campaign ID."),
  sourceEntryId: z
    .string()
    .min(1)
    .describe("entryId (hex) or exact title of the source mnemon (e.g. the faction)."),
  targetEntryId: z
    .string()
    .min(1)
    .describe("entryId (hex) or exact title of the target mnemon (e.g. the NPC member)."),
  label: z
    .enum(RELATIONSHIP_LABELS)
    .describe("Relationship type. MEMBER and ALLY are bidirectional; ENEMY and RIVAL are directional."),
  color: z.string().optional().describe("Optional UI color/note."),
  direction: z.string().optional().describe("Override default direction."),
});

export async function createMnemonRelationship(
  input: z.infer<typeof createMnemonRelationshipInputSchema>
): Promise<Relationship> {
  const { campaignId, ...body } = input;
  const resolver = new MnemonResolver(campaignId);
  const sourceEntryId = await resolver.resolve(body.sourceEntryId, {
    fieldLabel: "sourceEntryId",
  });
  const targetEntryId = await resolver.resolve(body.targetEntryId, {
    fieldLabel: "targetEntryId",
  });
  return argoPost<Relationship, typeof body>(
    `/mcp/v1/campaigns/${encodeURIComponent(campaignId)}/mnemons/relationships`,
    { ...body, sourceEntryId, targetEntryId }
  );
}

export const deleteMnemonRelationshipInputSchema = z.object({
  campaignId: z.string().min(1).describe("Campaign ID."),
  relationshipId: z.string().min(1).describe("Relationship ID to delete."),
});

export async function deleteMnemonRelationship(
  input: z.infer<typeof deleteMnemonRelationshipInputSchema>
): Promise<void> {
  await argoDelete(
    `/mcp/v1/campaigns/${encodeURIComponent(input.campaignId)}/mnemons/relationships/${encodeURIComponent(input.relationshipId)}`
  );
}

export const listMnemonRelationshipsInputSchema = z.object({
  campaignId: z.string().min(1).describe("Campaign ID."),
  entryId: z
    .string()
    .min(1)
    .describe(
      "Mnemon whose relationships to list — entryId (hex) or exact title."
    ),
});

export async function listMnemonRelationships(
  input: z.infer<typeof listMnemonRelationshipsInputSchema>
): Promise<RelationshipsResponse> {
  const resolver = new MnemonResolver(input.campaignId);
  const hexEntryId = await resolver.resolve(input.entryId, { fieldLabel: "entryId" });
  return argoGet<RelationshipsResponse>(
    `/mcp/v1/campaigns/${encodeURIComponent(input.campaignId)}/mnemons/${encodeURIComponent(hexEntryId)}/relationships`
  );
}

// ---------------------------------------------------------------------------
// Visibility — campaign.write (PUBLIC requires a published campaign)
// ---------------------------------------------------------------------------

export const setMnemonVisibilityInputSchema = z.object({
  campaignId: z.string().min(1).describe("Campaign ID."),
  entryId: z
    .string()
    .min(1)
    .describe("Mnemon entry to update — entryId (hex) or exact title."),
  visibility: z
    .enum(["HIDDEN", "INTERNAL", "PUBLIC"])
    .describe(
      "HIDDEN = GM/co-GM only. INTERNAL = all party members. " +
        "PUBLIC = visible on the campaign's public publication. " +
        "PUBLIC requires the campaign to be published; otherwise the server returns a 409."
    ),
});

export async function setMnemonVisibility(
  input: z.infer<typeof setMnemonVisibilityInputSchema>
): Promise<MnemonEntry> {
  const resolver = new MnemonResolver(input.campaignId);
  const hexEntryId = await resolver.resolve(input.entryId, { fieldLabel: "entryId" });
  return argoPatch<MnemonEntry, { visibility: string }>(
    `/mcp/v1/campaigns/${encodeURIComponent(input.campaignId)}/mnemons/${encodeURIComponent(hexEntryId)}/visibility`,
    { visibility: input.visibility }
  );
}
