/**
 * MCP tools for inviting people to Argo by email — DISABLED.
 *
 * The Anthropic MCP directory review (2026-08) flagged invite_user_by_email:
 * it sent sign-up email to up to 20 arbitrary addresses on behalf of the user
 * with no campaign or guild context. The tool is no longer registered in
 * src/server.ts and this implementation is commented out so nothing can reach
 * POST /mcp/v1/invites/email through the MCP surface.
 *
 * Do not simply un-comment this. Re-enabling requires, per the review:
 *   1. recipients restricted to an existing campaign or guild the caller is
 *      already part of (take a campaignId/guildId and resolve members
 *      server-side rather than accepting free-form addresses), and
 *   2. an explicit user confirmation required by the server before any mail is
 *      dispatched, reflected in both the input schema and the description.
 *
 * The in-platform equivalents (invite_guild_member, send_friend_request) stay
 * registered and cover the same intent without outbound mail to strangers.
 */

export {};

// import { z } from "zod";
// import { argoPost } from "../client.js";
//
// export interface InviteResult {
//   email: string;
//   status: string;
//   message?: string | null;
// }
//
// export interface SendInvitesResponse {
//   results: InviteResult[];
// }
//
// export const inviteResultOutputSchema = z.object({
//   email: z.string(),
//   status: z.string(),
//   message: z.string().nullish(),
// });
//
// export const sendInvitesResponseOutputSchema = z.object({
//   results: z.array(inviteResultOutputSchema),
// });
//
// export const inviteUserByEmailInputSchema = z.object({
//   emails: z
//     .array(z.string().email())
//     .min(1)
//     .max(20)
//     .describe(
//       "Email addresses to invite. Up to 20 per call. Each address that " +
//         "already corresponds to an Argo user will be skipped server-side."
//     ),
// });
//
// export async function inviteUserByEmail(
//   input: z.infer<typeof inviteUserByEmailInputSchema>
// ): Promise<SendInvitesResponse> {
//   return argoPost<SendInvitesResponse, { emails: string[] }>(
//     "/mcp/v1/invites/email",
//     { emails: input.emails }
//   );
// }
