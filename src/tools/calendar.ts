/**
 * MCP tools for campaign calendar (session scheduling).
 * Reads require campaign.read; writes require campaign.write.
 */

import { z } from "zod";
import { argoGet, argoPatch, argoPost } from "../client.js";

export interface CampaignSession {
  id: string;
  campaignId: string;
  guildId?: string | null;
  title: string;
  description?: string | null;
  startAt: string;
  endAt?: string | null;
  createdByUserId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  invitedUserIds?: string[] | null;
  invitedPartyIds?: string[] | null;
  attendanceReplies?: Record<string, unknown> | null;
}

export const campaignSessionOutputSchema = z.object({
  id: z.string(),
  campaignId: z.string(),
  guildId: z.string().nullish(),
  title: z.string(),
  description: z.string().nullish(),
  startAt: z.string(),
  endAt: z.string().nullish(),
  createdByUserId: z.string().nullish(),
  createdAt: z.string().nullish(),
  updatedAt: z.string().nullish(),
  invitedUserIds: z.array(z.string()).nullish(),
  invitedPartyIds: z.array(z.string()).nullish(),
  attendanceReplies: z.record(z.unknown()).nullish(),
});

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export const createSessionInputSchema = z.object({
  campaignId: z.string().min(1).describe("Campaign ID."),
  title: z.string().min(1).describe("Session title (e.g. 'Session 12: The Dragon's Lair')."),
  description: z.string().optional().describe("Optional session description / GM notes."),
  startAt: z
    .string()
    .min(1)
    .describe("Session start time as an ISO-8601 instant (e.g. '2026-06-01T19:00:00Z')."),
  endAt: z.string().optional().describe("Session end time as an ISO-8601 instant."),
  invitedUserIds: z
    .array(z.string())
    .optional()
    .describe("User IDs to invite (must be active campaign members)."),
});

export async function createSession(
  input: z.infer<typeof createSessionInputSchema>
): Promise<CampaignSession> {
  const { campaignId, ...body } = input;
  return argoPost<CampaignSession, typeof body>(
    `/mcp/v1/campaigns/${encodeURIComponent(campaignId)}/sessions`,
    body
  );
}

// ---------------------------------------------------------------------------
// List / get
// ---------------------------------------------------------------------------

export const listSessionsInputSchema = z.object({
  campaignId: z.string().min(1).describe("Campaign ID."),
  year: z.number().int().optional().describe("Calendar year. Defaults to current year."),
  month: z
    .number()
    .int()
    .min(1)
    .max(12)
    .optional()
    .describe("Calendar month (1-12). Defaults to current month."),
});

export async function listSessions(
  input: z.infer<typeof listSessionsInputSchema>
): Promise<CampaignSession[]> {
  const params = new URLSearchParams();
  if (input.year !== undefined) params.set("year", String(input.year));
  if (input.month !== undefined) params.set("month", String(input.month));
  const qs = params.toString();
  return argoGet<CampaignSession[]>(
    `/mcp/v1/campaigns/${encodeURIComponent(input.campaignId)}/sessions${qs ? `?${qs}` : ""}`
  );
}

export const getSessionInputSchema = z.object({
  campaignId: z.string().min(1).describe("Campaign ID."),
  sessionId: z.string().min(1).describe("Session ID."),
});

export async function getSession(
  input: z.infer<typeof getSessionInputSchema>
): Promise<CampaignSession> {
  return argoGet<CampaignSession>(
    `/mcp/v1/campaigns/${encodeURIComponent(input.campaignId)}/sessions/${encodeURIComponent(input.sessionId)}`
  );
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export const updateSessionInputSchema = z.object({
  campaignId: z.string().min(1).describe("Campaign ID."),
  sessionId: z.string().min(1).describe("Session ID."),
  title: z.string().optional(),
  description: z.string().optional(),
  startAt: z.string().optional().describe("ISO-8601 instant."),
  endAt: z.string().optional().describe("ISO-8601 instant."),
});

export async function updateSession(
  input: z.infer<typeof updateSessionInputSchema>
): Promise<CampaignSession> {
  const { campaignId, sessionId, ...body } = input;
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined) payload[key] = value;
  }
  return argoPatch<CampaignSession, Record<string, unknown>>(
    `/mcp/v1/campaigns/${encodeURIComponent(campaignId)}/sessions/${encodeURIComponent(sessionId)}`,
    payload
  );
}
