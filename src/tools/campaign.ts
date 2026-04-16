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

export const listCampaignGrantsInputSchema = z.object({
  campaignId: z
    .string()
    .min(1)
    .describe("Campaign ID to list active AI integration grants for (GM only)."),
});

export interface IntegrationGrant {
  grantId: string;
  campaignId: string;
  hydraClientId: string;
  accessLevel: "READ" | "WRITE";
  status: "ACTIVE" | "REVOKED";
  createdAt: string;
}

export async function listCampaignGrants(
  input: z.infer<typeof listCampaignGrantsInputSchema>
): Promise<IntegrationGrant[]> {
  return argoGet<IntegrationGrant[]>(
    `/api/v1/campaigns/${encodeURIComponent(input.campaignId)}/grants`
  );
}
