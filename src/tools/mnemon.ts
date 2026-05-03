/**
 * MCP tools for reading and writing campaign mnemon (memory/lore) entries.
 *
 * Read tools: require grant_read on the campaign.
 * Write tools: require grant_write on the campaign (GM grants only).
 */

import { z } from "zod";
import { argoDelete, argoGet, argoPost, argoPatch } from "../client.js";

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
        description: "A player-facing mnemon (character notes, party sheet, etc.).",
        typeSpecificFields: [
          { name: "playerKind", type: "enum", values: ["PARTY", "CHARACTER", "NOTES"] },
          { name: "partyId", type: "string" },
          { name: "characterId", type: "string" },
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
});

export async function listMnemons(
  input: z.infer<typeof listMnemonsInputSchema>
): Promise<MnemonSummary[]> {
  return argoGet<MnemonSummary[]>(
    `/mcp/v1/campaigns/${encodeURIComponent(input.campaignId)}/mnemons`
  );
}

export const getMnemonInputSchema = z.object({
  campaignId: z.string().min(1).describe("Campaign ID."),
  entryId: z.string().min(1).describe("Mnemon entry ID to retrieve."),
});

export async function getMnemon(
  input: z.infer<typeof getMnemonInputSchema>
): Promise<MnemonEntry> {
  return argoGet<MnemonEntry>(
    `/mcp/v1/campaigns/${encodeURIComponent(input.campaignId)}/mnemons/${encodeURIComponent(input.entryId)}`
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
  partyId: z.string().optional(),
  characterId: z.string().optional(),
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
    ...(item.characterId !== undefined && { characterId: item.characterId }),
  };
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
  return argoPost<MnemonEntry, CreateMnemonPayload>(
    `/mcp/v1/campaigns/${encodeURIComponent(campaignId)}/mnemons`,
    buildCreatePayload(rest)
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
  return argoPost<BulkCreateMnemonResponse, { items: CreateMnemonPayload[] }>(
    `/mcp/v1/campaigns/${encodeURIComponent(input.campaignId)}/mnemons/bulk`,
    { items: input.items.map(buildCreatePayload) }
  );
}

export const updateMnemonInputSchema = createMnemonItemSchema.partial().extend({
  campaignId: z.string().min(1).describe("Campaign ID."),
  entryId: z.string().min(1).describe("Mnemon entry ID to update."),
});

export async function updateMnemon(
  input: z.infer<typeof updateMnemonInputSchema>
): Promise<MnemonEntry> {
  const { campaignId, entryId, type: _type, ...rest } = input;
  // Update payload mirrors create but type cannot be changed.
  const payload: Partial<CreateMnemonPayload> = {};
  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined) {
      (payload as Record<string, unknown>)[key] = value;
    }
  }
  return argoPatch<MnemonEntry, Partial<CreateMnemonPayload>>(
    `/mcp/v1/campaigns/${encodeURIComponent(campaignId)}/mnemons/${encodeURIComponent(entryId)}`,
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
  sourceEntryId: z.string().min(1).describe("entryId of the source mnemon (e.g. the faction)."),
  targetEntryId: z.string().min(1).describe("entryId of the target mnemon (e.g. the NPC member)."),
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
  return argoPost<Relationship, typeof body>(
    `/mcp/v1/campaigns/${encodeURIComponent(campaignId)}/mnemons/relationships`,
    body
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
  entryId: z.string().min(1).describe("Mnemon entry whose relationships to list."),
});

export async function listMnemonRelationships(
  input: z.infer<typeof listMnemonRelationshipsInputSchema>
): Promise<RelationshipsResponse> {
  return argoGet<RelationshipsResponse>(
    `/mcp/v1/campaigns/${encodeURIComponent(input.campaignId)}/mnemons/${encodeURIComponent(input.entryId)}/relationships`
  );
}

// ---------------------------------------------------------------------------
// Visibility — campaign.write (PUBLIC requires a published campaign)
// ---------------------------------------------------------------------------

export const setMnemonVisibilityInputSchema = z.object({
  campaignId: z.string().min(1).describe("Campaign ID."),
  entryId: z.string().min(1).describe("Mnemon entry to update."),
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
  return argoPatch<MnemonEntry, { visibility: string }>(
    `/mcp/v1/campaigns/${encodeURIComponent(input.campaignId)}/mnemons/${encodeURIComponent(input.entryId)}/visibility`,
    { visibility: input.visibility }
  );
}
