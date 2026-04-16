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
  type: string;
  title: string;
  content?: string;
}

export async function createMnemon(
  input: z.infer<typeof createMnemonInputSchema>
): Promise<MnemonEntry> {
  const payload: CreateMnemonPayload = {
    type: input.type ?? "Custom",
    title: input.title,
    content: input.content,
  };
  return argoPost<MnemonEntry, CreateMnemonPayload>(
    `/mcp/v1/campaigns/${encodeURIComponent(input.campaignId)}/mnemons`,
    payload
  );
}

export const updateMnemonInputSchema = z.object({
  campaignId: z.string().min(1).describe("Campaign ID."),
  entryId: z.string().min(1).describe("Mnemon entry ID to update."),
  title: z.string().optional().describe("New title."),
  content: z.string().optional().describe("New text content (replaces first text block)."),
});

export interface UpdateMnemonPayload {
  title?: string;
  content?: string;
}

export async function updateMnemon(
  input: z.infer<typeof updateMnemonInputSchema>
): Promise<MnemonEntry> {
  const payload: UpdateMnemonPayload = {};
  if (input.title) payload.title = input.title;
  if (input.content) payload.content = input.content;
  return argoPatch<MnemonEntry, UpdateMnemonPayload>(
    `/mcp/v1/campaigns/${encodeURIComponent(input.campaignId)}/mnemons/${encodeURIComponent(input.entryId)}`,
    payload
  );
}
