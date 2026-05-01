/**
 * MCP tools for reading and writing campaign mnemon (memory/lore) entries.
 *
 * Read tools: require grant_read on the campaign.
 * Write tools: require grant_write on the campaign (GM grants only).
 */

import { z } from "zod";
import { argoGet, argoPost, argoPatch } from "../client.js";

// ---------------------------------------------------------------------------
// Types (mirrors WebAPI McpMnemonSummaryDTO / McpMnemonDetailDTO)
// ---------------------------------------------------------------------------

export interface MnemonBlock {
  id: string;
  type: string;
  text: string;
}

/** Returned by the list endpoint — id, title, type only. */
export interface MnemonSummary {
  entryId: string;
  title: string;
  type: string;
}

/** Returned by get / create / update — includes full block content. */
export interface MnemonEntry {
  entryId: string;
  title: string;
  type: string;
  blocks: MnemonBlock[];
  /** Type-specific fields stored on the entry (e.g. npcType for NPC mnemons). */
  typeProperties?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Schema discovery (no HTTP call)
// ---------------------------------------------------------------------------

export const describeMnemonTypesInputSchema = z.object({});

/** Returns a static catalog of all mnemon types and their type-specific fields. */
export function describeMnemonTypes(): object {
  return {
    types: [
      {
        type: "NPC",
        description: "A non-player character. Use npcType to classify it (e.g. faction, merchant, guard, villain).",
        typeSpecificFields: [
          { name: "npcType", type: "string", description: "NPC archetype (e.g. 'faction', 'merchant', 'guard', 'villain')" },
          { name: "sheetId", type: "string", description: "Reference to a character sheet" },
          { name: "primaryLocationEntryId", type: "string", description: "entryId of the NPC's home location mnemon" },
        ],
      },
      {
        type: "Location",
        description: "A place in the world — a city, dungeon, tavern, etc.",
        typeSpecificFields: [
          { name: "levelId", type: "string", description: "Unreal Engine level reference" },
        ],
      },
      {
        type: "Quest",
        description: "A quest or mission the party can undertake.",
        typeSpecificFields: [
          { name: "questStatus", type: "string", description: "Status: 'active' | 'completed' | 'failed'" },
          { name: "issuerNpcEntryId", type: "string", description: "entryId of the NPC who issued the quest" },
          { name: "issuerText", type: "string", description: "Opening dialogue from the quest issuer" },
          { name: "repeatable", type: "boolean", description: "Whether the quest can be repeated" },
        ],
      },
      {
        type: "Journal",
        description: "A session journal entry.",
        typeSpecificFields: [
          { name: "date", type: "string", description: "In-world date" },
          { name: "sessionNumber", type: "integer", description: "Session number" },
        ],
      },
      {
        type: "SessionSummary",
        description: "A structured summary of a game session.",
        typeSpecificFields: [
          { name: "date", type: "string" },
          { name: "sessionNumber", type: "integer" },
        ],
      },
      {
        type: "Player",
        description: "A player-facing mnemon (character notes, party sheet, etc.).",
        typeSpecificFields: [
          { name: "playerKind", type: "string", description: "PARTY | CHARACTER | NOTES" },
          { name: "partyId", type: "string" },
          { name: "characterId", type: "string" },
        ],
      },
      {
        type: "Lore",
        description: "World lore or background information.",
        typeSpecificFields: [],
      },
      {
        type: "Archive",
        description: "Archived lore entry.",
        typeSpecificFields: [],
      },
      {
        type: "Custom",
        description: "A custom entry type. Use a descriptive title.",
        typeSpecificFields: [],
      },
    ],
    commonFields: [
      { name: "visibility", type: "string", description: "HIDDEN | INTERNAL | PUBLIC (default: INTERNAL)" },
      { name: "tags", type: "string[]", description: "Optional tag list" },
      { name: "content", type: "string", description: "Initial text content (stored as a paragraph block)" },
    ],
  };
}

// ---------------------------------------------------------------------------
// Read tools
// ---------------------------------------------------------------------------

export const listMnemonsInputSchema = z.object({
  campaignId: z
    .string()
    .min(1)
    .describe("ID of the campaign whose mnemon entries to list."),
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
// Write tools (grant_write required)
// ---------------------------------------------------------------------------

export const createMnemonInputSchema = z.object({
  campaignId: z.string().min(1).describe("Campaign ID."),
  title: z.string().min(1).describe("Title of the new mnemon entry."),
  type: z.string().optional().describe(
    "Mnemon type. Valid values: NPC, Location, Quest, Lore, Archive, Journal, " +
    "SessionSummary, Player, Custom (default). " +
    "Call describe_mnemon_types to see which extra fields each type supports."
  ),
  content: z.string().optional().describe("Initial text content (stored as a paragraph block)."),
  visibility: z.enum(["HIDDEN", "INTERNAL", "PUBLIC"]).optional()
    .describe("Visibility to players. HIDDEN = GM only, INTERNAL = GM only (default), PUBLIC = all players."),
  tags: z.array(z.string()).optional().describe("Optional tag list."),

  // NPC-specific
  npcType: z.string().optional()
    .describe("NPC archetype (type=NPC only). E.g. 'faction', 'merchant', 'guard', 'villain'."),
  sheetId: z.string().optional()
    .describe("Character sheet reference (type=NPC only)."),
  primaryLocationEntryId: z.string().optional()
    .describe("entryId of the NPC's home location mnemon (type=NPC only)."),

  // Quest-specific
  questStatus: z.string().optional()
    .describe("Quest status (type=Quest only). E.g. 'active', 'completed', 'failed'."),
  issuerNpcEntryId: z.string().optional()
    .describe("entryId of the NPC who issued the quest (type=Quest only)."),
  issuerText: z.string().optional()
    .describe("Opening dialogue from the quest issuer (type=Quest only)."),
  repeatable: z.boolean().optional()
    .describe("Whether the quest is repeatable (type=Quest only)."),

  // Location-specific
  levelId: z.string().optional()
    .describe("Unreal Engine level reference (type=Location only)."),

  // Journal / SessionSummary / MnemonEntry
  date: z.string().optional()
    .describe("In-world date (type=Journal, SessionSummary)."),
  sessionNumber: z.number().int().optional()
    .describe("Session number (type=Journal, SessionSummary)."),

  // Player-specific
  playerKind: z.enum(["PARTY", "CHARACTER", "NOTES"]).optional()
    .describe("Player mnemon kind (type=Player only)."),
  partyId: z.string().optional()
    .describe("Party ID (type=Player only)."),
  characterId: z.string().optional()
    .describe("Character ID (type=Player only)."),
});

export interface CreateMnemonPayload {
  type: string;
  title: string;
  content?: string;
  visibility?: string;
  tags?: string[];
  // NPC
  npcType?: string;
  sheetId?: string;
  primaryLocationEntryId?: string;
  // Quest
  questStatus?: string;
  issuerNpcEntryId?: string;
  issuerText?: string;
  repeatable?: boolean;
  // Location
  levelId?: string;
  // Journal / session
  date?: string;
  sessionNumber?: number;
  // Player
  playerKind?: string;
  partyId?: string;
  characterId?: string;
}

export async function createMnemon(
  input: z.infer<typeof createMnemonInputSchema>
): Promise<MnemonEntry> {
  const payload: CreateMnemonPayload = {
    type: input.type ?? "Custom",
    title: input.title,
    ...(input.content !== undefined && { content: input.content }),
    ...(input.visibility !== undefined && { visibility: input.visibility }),
    ...(input.tags !== undefined && { tags: input.tags }),
    // NPC
    ...(input.npcType !== undefined && { npcType: input.npcType }),
    ...(input.sheetId !== undefined && { sheetId: input.sheetId }),
    ...(input.primaryLocationEntryId !== undefined && { primaryLocationEntryId: input.primaryLocationEntryId }),
    // Quest
    ...(input.questStatus !== undefined && { questStatus: input.questStatus }),
    ...(input.issuerNpcEntryId !== undefined && { issuerNpcEntryId: input.issuerNpcEntryId }),
    ...(input.issuerText !== undefined && { issuerText: input.issuerText }),
    ...(input.repeatable !== undefined && { repeatable: input.repeatable }),
    // Location
    ...(input.levelId !== undefined && { levelId: input.levelId }),
    // Journal / session
    ...(input.date !== undefined && { date: input.date }),
    ...(input.sessionNumber !== undefined && { sessionNumber: input.sessionNumber }),
    // Player
    ...(input.playerKind !== undefined && { playerKind: input.playerKind }),
    ...(input.partyId !== undefined && { partyId: input.partyId }),
    ...(input.characterId !== undefined && { characterId: input.characterId }),
  };
  return argoPost<MnemonEntry, CreateMnemonPayload>(
    `/mcp/v1/campaigns/${encodeURIComponent(input.campaignId)}/mnemons`,
    payload
  );
}

export const updateMnemonInputSchema = z.object({
  campaignId: z.string().min(1).describe("Campaign ID."),
  entryId: z.string().min(1).describe("Mnemon entry ID to update."),
  title: z.string().optional().describe("New title (leave unset to keep existing)."),
  content: z.string().optional().describe("New text content (replaces first paragraph block)."),
  visibility: z.enum(["HIDDEN", "INTERNAL", "PUBLIC"]).optional()
    .describe("New visibility level."),
  tags: z.array(z.string()).optional().describe("Replace tag list."),

  // NPC
  npcType: z.string().optional().describe("NPC archetype (type=NPC only)."),
  sheetId: z.string().optional().describe("Character sheet reference (type=NPC only)."),
  primaryLocationEntryId: z.string().optional().describe("Home location entryId (type=NPC only)."),

  // Quest
  questStatus: z.string().optional().describe("Quest status (type=Quest only)."),
  issuerNpcEntryId: z.string().optional().describe("Issuer NPC entryId (type=Quest only)."),
  issuerText: z.string().optional().describe("Issuer dialogue (type=Quest only)."),
  repeatable: z.boolean().optional().describe("Repeatable flag (type=Quest only)."),

  // Location
  levelId: z.string().optional().describe("Unreal level reference (type=Location only)."),

  // Journal / SessionSummary
  date: z.string().optional().describe("In-world date."),
  sessionNumber: z.number().int().optional().describe("Session number."),

  // Player
  playerKind: z.enum(["PARTY", "CHARACTER", "NOTES"]).optional().describe("Player kind (type=Player only)."),
  partyId: z.string().optional().describe("Party ID (type=Player only)."),
  characterId: z.string().optional().describe("Character ID (type=Player only)."),
});

export interface UpdateMnemonPayload {
  title?: string;
  content?: string;
  visibility?: string;
  tags?: string[];
  npcType?: string;
  sheetId?: string;
  primaryLocationEntryId?: string;
  questStatus?: string;
  issuerNpcEntryId?: string;
  issuerText?: string;
  repeatable?: boolean;
  levelId?: string;
  date?: string;
  sessionNumber?: number;
  playerKind?: string;
  partyId?: string;
  characterId?: string;
}

export async function updateMnemon(
  input: z.infer<typeof updateMnemonInputSchema>
): Promise<MnemonEntry> {
  const payload: UpdateMnemonPayload = {
    ...(input.title !== undefined && { title: input.title }),
    ...(input.content !== undefined && { content: input.content }),
    ...(input.visibility !== undefined && { visibility: input.visibility }),
    ...(input.tags !== undefined && { tags: input.tags }),
    ...(input.npcType !== undefined && { npcType: input.npcType }),
    ...(input.sheetId !== undefined && { sheetId: input.sheetId }),
    ...(input.primaryLocationEntryId !== undefined && { primaryLocationEntryId: input.primaryLocationEntryId }),
    ...(input.questStatus !== undefined && { questStatus: input.questStatus }),
    ...(input.issuerNpcEntryId !== undefined && { issuerNpcEntryId: input.issuerNpcEntryId }),
    ...(input.issuerText !== undefined && { issuerText: input.issuerText }),
    ...(input.repeatable !== undefined && { repeatable: input.repeatable }),
    ...(input.levelId !== undefined && { levelId: input.levelId }),
    ...(input.date !== undefined && { date: input.date }),
    ...(input.sessionNumber !== undefined && { sessionNumber: input.sessionNumber }),
    ...(input.playerKind !== undefined && { playerKind: input.playerKind }),
    ...(input.partyId !== undefined && { partyId: input.partyId }),
    ...(input.characterId !== undefined && { characterId: input.characterId }),
  };
  return argoPatch<MnemonEntry, UpdateMnemonPayload>(
    `/mcp/v1/campaigns/${encodeURIComponent(input.campaignId)}/mnemons/${encodeURIComponent(input.entryId)}`,
    payload
  );
}
