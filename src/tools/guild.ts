/**
 * MCP tools for guild interactions.
 * Reads require guild.read; member-level writes require guild.write
 * (currently: adding a campaign to a guild); admin-level writes require
 * guild.admin (member invite/remove, role changes, calendar event auth).
 */

import { z } from "zod";
import { argoGet, argoPost } from "../client.js";

export interface GuildSummary {
  guildId: string;
  name: string;
  role: string;
  canAdmin: boolean;
  memberCount: number;
  campaignCount: number;
}

export interface GuildMember {
  userId: string;
  role?: string;
  status?: string;
  invitedAt?: string;
  joinedAt?: string;
}

export interface GuildDetail {
  id: string;
  ownerId: string;
  summary?: { name?: string; description?: string; color?: string; imageUrl?: string };
  members?: GuildMember[];
  campaignIds?: string[];
}

// ---------------------------------------------------------------------------
// Reads (guild.read)
// ---------------------------------------------------------------------------

export const listGuildsInputSchema = z.object({});

export async function listGuilds(): Promise<GuildSummary[]> {
  return argoGet<GuildSummary[]>("/mcp/v1/guilds");
}

export const getGuildInputSchema = z.object({
  guildId: z.string().min(1).describe("Guild ID to retrieve."),
});

export async function getGuild(
  input: z.infer<typeof getGuildInputSchema>
): Promise<GuildDetail> {
  return argoGet<GuildDetail>(`/mcp/v1/guilds/${encodeURIComponent(input.guildId)}`);
}

export const listGuildMembersInputSchema = z.object({
  guildId: z.string().min(1).describe("Guild ID."),
});

export async function listGuildMembers(
  input: z.infer<typeof listGuildMembersInputSchema>
): Promise<GuildMember[]> {
  return argoGet<GuildMember[]>(
    `/mcp/v1/guilds/${encodeURIComponent(input.guildId)}/members`
  );
}

// ---------------------------------------------------------------------------
// Member-level writes (guild.write)
// ---------------------------------------------------------------------------

export const addCampaignToGuildInputSchema = z.object({
  guildId: z.string().min(1).describe("Guild ID."),
  campaignId: z.string().min(1).describe("Campaign ID to add to the guild."),
});

export async function addCampaignToGuild(
  input: z.infer<typeof addCampaignToGuildInputSchema>
): Promise<void> {
  await argoPost<void, Record<string, never>>(
    `/mcp/v1/guilds/${encodeURIComponent(input.guildId)}/campaigns/${encodeURIComponent(input.campaignId)}`,
    {}
  );
}

// ---------------------------------------------------------------------------
// Admin writes (guild.admin)
// ---------------------------------------------------------------------------

export const inviteGuildMemberInputSchema = z.object({
  guildId: z.string().min(1).describe("Guild ID."),
  userId: z.string().min(1).describe("Argo user ID to invite."),
});

export async function inviteGuildMember(
  input: z.infer<typeof inviteGuildMemberInputSchema>
): Promise<void> {
  await argoPost<void, { userId: string }>(
    `/mcp/v1/guilds/${encodeURIComponent(input.guildId)}/invite`,
    { userId: input.userId }
  );
}

export const removeGuildMemberInputSchema = z.object({
  guildId: z.string().min(1).describe("Guild ID."),
  userId: z.string().min(1).describe("User ID of the member to remove."),
});

export async function removeGuildMember(
  input: z.infer<typeof removeGuildMemberInputSchema>
): Promise<void> {
  await argoPost<void, { userId: string }>(
    `/mcp/v1/guilds/${encodeURIComponent(input.guildId)}/remove`,
    { userId: input.userId }
  );
}

export const setGuildMemberRoleInputSchema = z.object({
  guildId: z.string().min(1).describe("Guild ID."),
  userId: z.string().min(1).describe("Member to change."),
  role: z.enum(["Owner", "Admin", "Member"]).describe("New role."),
});

export async function setGuildMemberRole(
  input: z.infer<typeof setGuildMemberRoleInputSchema>
): Promise<void> {
  await argoPost<void, { userId: string; role: string }>(
    `/mcp/v1/guilds/${encodeURIComponent(input.guildId)}/role`,
    { userId: input.userId, role: input.role }
  );
}

export const addGuildCalendarEventInputSchema = z.object({
  guildId: z.string().min(1).describe("Guild ID."),
  title: z.string().min(1).describe("Event title."),
  description: z.string().optional().describe("Optional event description."),
  startDateTime: z
    .string()
    .describe("Event start, ISO-8601 (e.g. 2026-06-12T19:00:00)."),
  endDateTime: z
    .string()
    .optional()
    .describe("Event end, ISO-8601 — optional."),
});

export interface CreatedEventResponse {
  id: string;
}

export async function addGuildCalendarEvent(
  input: z.infer<typeof addGuildCalendarEventInputSchema>
): Promise<CreatedEventResponse> {
  return argoPost<CreatedEventResponse, {
    title: string;
    description?: string;
    startDateTime: string;
    endDateTime?: string;
  }>(`/mcp/v1/guilds/${encodeURIComponent(input.guildId)}/calendar/events`, {
    title: input.title,
    ...(input.description !== undefined && { description: input.description }),
    startDateTime: input.startDateTime,
    ...(input.endDateTime !== undefined && { endDateTime: input.endDateTime }),
  });
}
