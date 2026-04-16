/**
 * MCP tools for reading and writing campaign mnemon (memory/lore) entries.
 *
 * Read tools: require grant_read on the campaign.
 * Write tools: require grant_write on the campaign (GM grants only).
 */

import { z } from "zod";
import { argoGet, argoPost, argoPatch } from "../client.js";

// ---------------------------------------------------------------------------
// Types (mirrors WebAPI MnemosyneEntryDTO)
// ---------------------------------------------------------------------------

export interface MnemonBlock {
  blockId: string;
  type: string;
  content: unknown;
}

export interface MnemonEntry {
  id: string;
  campaignId: string;
  title: string;
  type?: string;
  blocks?: MnemonBlock[];
  createdAt?: string;
  updatedAt?: string;
}

export interface MnemonEntryList {
  entries: MnemonEntry[];
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
): Promise<MnemonEntry[]> {
  const result = await argoGet<MnemonEntry[] | MnemonEntryList>(
    `/campaigns/${encodeURIComponent(input.campaignId)}/mnemon/entries`
  );
  // Normalise: endpoint may return array directly or wrapped object
  return Array.isArray(result) ? result : (result as MnemonEntryList).entries ?? [];
}

export const getMnemonInputSchema = z.object({
  campaignId: z.string().min(1).describe("Campaign ID."),
  entryId: z.string().min(1).describe("Mnemon entry ID to retrieve."),
});

export async function getMnemon(
  input: z.infer<typeof getMnemonInputSchema>
): Promise<MnemonEntry> {
  return argoGet<MnemonEntry>(
    `/campaigns/${encodeURIComponent(input.campaignId)}/mnemon/entries/${encodeURIComponent(input.entryId)}`
  );
}

// ---------------------------------------------------------------------------
// Write tools (grant_write required)
// ---------------------------------------------------------------------------

export const createMnemonInputSchema = z.object({
  campaignId: z.string().min(1).describe("Campaign ID."),
  title: z.string().min(1).describe("Title of the new mnemon entry."),
  type: z
    .string()
    .optional()
    .describe("Entry type (e.g. 'character', 'location', 'event')."),
  content: z
    .string()
    .optional()
    .describe("Initial text content for the entry."),
});

export interface CreateMnemonPayload {
  title: string;
  type?: string;
  blocks?: Array<{ type: string; content: { text: string } }>;
}

export async function createMnemon(
  input: z.infer<typeof createMnemonInputSchema>
): Promise<MnemonEntry> {
  const payload: CreateMnemonPayload = {
    title: input.title,
    type: input.type,
  };
  if (input.content) {
    payload.blocks = [{ type: "text", content: { text: input.content } }];
  }
  return argoPost<MnemonEntry, CreateMnemonPayload>(
    `/campaigns/${encodeURIComponent(input.campaignId)}/mnemon/entries`,
    payload
  );
}

export const updateMnemonInputSchema = z.object({
  campaignId: z.string().min(1).describe("Campaign ID."),
  entryId: z.string().min(1).describe("Mnemon entry ID to update."),
  title: z.string().optional().describe("New title."),
  content: z.string().optional().describe("New text content (replaces first text block)."),
});

export async function updateMnemon(
  input: z.infer<typeof updateMnemonInputSchema>
): Promise<MnemonEntry> {
  const payload: Partial<CreateMnemonPayload> = {};
  if (input.title) payload.title = input.title;
  if (input.content) {
    payload.blocks = [{ type: "text", content: { text: input.content } }];
  }
  return argoPatch<MnemonEntry, Partial<CreateMnemonPayload>>(
    `/campaigns/${encodeURIComponent(input.campaignId)}/mnemon/entries/${encodeURIComponent(input.entryId)}`,
    payload
  );
}
