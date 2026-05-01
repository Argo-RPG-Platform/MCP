/**
 * MCP tools for reading campaign data.
 * These tools require grant_read permission on the target campaign.
 */

import { z } from "zod";
import { argoGet } from "../client.js";

// ---------------------------------------------------------------------------
// Types (mirrors WebAPI CampaignDTO)
// ---------------------------------------------------------------------------

export interface Campaign {
  id: string;
  gameMasterId: string;
  campaignName: string;
  campaignDescription?: string;
  ruleSystem?: string;
  gameSystemSlug?: string;
  color?: string;
  creationDateTime?: string;
}

// ---------------------------------------------------------------------------
// Tool definitions (registered in index.ts)
// ---------------------------------------------------------------------------

/** Returned by the list endpoint — includes accessLevel. */
export interface CampaignSummary extends Campaign {
  accessLevel?: string;
}

export const listCampaignsInputSchema = z.object({});

export async function listCampaigns(): Promise<CampaignSummary[]> {
  return argoGet<CampaignSummary[]>("/mcp/v1/campaigns");
}

export const getCampaignInputSchema = z.object({
  campaignId: z
    .string()
    .min(1)
    .describe("The ID of the campaign to retrieve."),
});

export async function getCampaign(
  input: z.infer<typeof getCampaignInputSchema>
): Promise<Campaign> {
  return argoGet<Campaign>(
    `/mcp/v1/campaigns/${encodeURIComponent(input.campaignId)}`
  );
}

// listCampaignGrants was previously exposed here but called the user-session
// endpoint /api/v1/campaigns/{id}/grants. With a Hydra-issued grant JWT the
// MCP server cannot authenticate against /api/v1 (Oathkeeper expects a Kratos
// session there). GMs manage grants from the WebApp's integrations UI; the
// AI assistant doesn't need this surface.
