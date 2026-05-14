/**
 * MCP tools for campaign management.
 * Reads require campaign.read; create requires campaign.create; co-GM
 * mutations require campaign.write.
 */

import { z } from "zod";
import { argoDelete, argoGet, argoPatch, argoPost } from "../client.js";

// ---------------------------------------------------------------------------
// Types (mirrors WebAPI McpCampaignDTO)
// ---------------------------------------------------------------------------

export interface Campaign {
  id: string;
  gameMasterId: string;
  campaignName: string;
  campaignDescription?: string;
  ruleSystem?: string;
  gameSystemSlug?: string;
  coGameMasterIds?: string[];
}

export interface CampaignSummary extends Campaign {
  accessLevel?: string;
}

export const campaignOutputSchema = z.object({
  id: z.string(),
  gameMasterId: z.string(),
  campaignName: z.string(),
  campaignDescription: z.string().optional(),
  ruleSystem: z.string().optional(),
  gameSystemSlug: z.string().optional(),
  coGameMasterIds: z.array(z.string()).optional(),
});

export const campaignSummaryOutputSchema = campaignOutputSchema.extend({
  accessLevel: z.string().optional(),
});

export const coGmOutputSchema = z.object({
  userId: z.string(),
  displayName: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export const listCampaignsInputSchema = z.object({});

export async function listCampaigns(): Promise<CampaignSummary[]> {
  return argoGet<CampaignSummary[]>("/mcp/v1/campaigns");
}

export const getCampaignInputSchema = z.object({
  campaignId: z.string().min(1).describe("The ID of the campaign to retrieve."),
});

export async function getCampaign(
  input: z.infer<typeof getCampaignInputSchema>
): Promise<Campaign> {
  return argoGet<Campaign>(`/mcp/v1/campaigns/${encodeURIComponent(input.campaignId)}`);
}

// ---------------------------------------------------------------------------
// Create — campaign.create scope
// ---------------------------------------------------------------------------

export const createCampaignInputSchema = z.object({
  campaignName: z.string().min(1).describe("Display name of the campaign."),
  description: z
    .string()
    .min(1)
    .describe("Short description of the campaign's setting, tone, and premise."),
  ruleSystem: z
    .string()
    .min(1)
    .describe(
      "Rule system the campaign uses. E.g. 'Dungeons & Dragons 5e', 'Pathfinder 2e', " +
        "'Forbidden Lands'. Free-form; the WebAPI derives the slug from this."
    ),
  gameSystemSlug: z
    .string()
    .optional()
    .describe(
      "Optional explicit slug for the public URL (e.g. 'dnd5e'). If omitted, " +
        "the server derives one from ruleSystem."
    ),
});

interface CreateCampaignPayload {
  campaignName: string;
  description: string;
  ruleSystem: string;
  gameSystemSlug?: string;
}

export async function createCampaign(
  input: z.infer<typeof createCampaignInputSchema>
): Promise<CampaignSummary> {
  const payload: CreateCampaignPayload = {
    campaignName: input.campaignName,
    description: input.description,
    ruleSystem: input.ruleSystem,
    ...(input.gameSystemSlug !== undefined && { gameSystemSlug: input.gameSystemSlug }),
  };
  return argoPost<CampaignSummary, CreateCampaignPayload>("/mcp/v1/campaigns", payload);
}

// ---------------------------------------------------------------------------
// Update — campaign.write (GM or co-GM)
// ---------------------------------------------------------------------------

export const updateCampaignInputSchema = z.object({
  campaignId: z.string().min(1).describe("ID of the campaign to update."),
  campaignName: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe("New display name. Omit to leave unchanged."),
  campaignDescription: z
    .string()
    .max(5000)
    .optional()
    .describe(
      "New description (setting, tone, premise). Omit to leave unchanged. " +
        "Pass an empty string to clear the existing description."
    ),
});

interface UpdateCampaignPayload {
  campaignName?: string;
  campaignDescription?: string;
}

export async function updateCampaign(
  input: z.infer<typeof updateCampaignInputSchema>
): Promise<Campaign> {
  const payload: UpdateCampaignPayload = {};
  if (input.campaignName !== undefined) payload.campaignName = input.campaignName;
  if (input.campaignDescription !== undefined)
    payload.campaignDescription = input.campaignDescription;
  return argoPatch<Campaign, UpdateCampaignPayload>(
    `/mcp/v1/campaigns/${encodeURIComponent(input.campaignId)}`,
    payload
  );
}

// ---------------------------------------------------------------------------
// Co-GM management — campaign.write scope (owner-only on the backend)
// ---------------------------------------------------------------------------

export interface CoGm {
  userId: string;
  displayName?: string;
}

export const listCoGmsInputSchema = z.object({
  campaignId: z.string().min(1).describe("Campaign ID."),
});

export async function listCoGms(
  input: z.infer<typeof listCoGmsInputSchema>
): Promise<CoGm[]> {
  return argoGet<CoGm[]>(
    `/mcp/v1/campaigns/${encodeURIComponent(input.campaignId)}/co-gms`
  );
}

export const addCoGmInputSchema = z.object({
  campaignId: z.string().min(1).describe("Campaign ID."),
  userId: z
    .string()
    .min(1)
    .describe("Argo user ID of the user to promote to co-GM. Must be an existing user."),
});

export async function addCoGm(
  input: z.infer<typeof addCoGmInputSchema>
): Promise<Campaign> {
  return argoPost<Campaign, { userId: string }>(
    `/mcp/v1/campaigns/${encodeURIComponent(input.campaignId)}/co-gms`,
    { userId: input.userId }
  );
}

export const removeCoGmInputSchema = z.object({
  campaignId: z.string().min(1).describe("Campaign ID."),
  userId: z.string().min(1).describe("User ID of the co-GM to remove."),
});

export async function removeCoGm(
  input: z.infer<typeof removeCoGmInputSchema>
): Promise<void> {
  await argoDelete(
    `/mcp/v1/campaigns/${encodeURIComponent(input.campaignId)}/co-gms/${encodeURIComponent(input.userId)}`
  );
}
