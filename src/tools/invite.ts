/**
 * MCP tools for inviting people to Argo by email.
 * Requires the invite.write OAuth scope. No Keto/per-resource check —
 * any authenticated user can invite others.
 */

import { z } from "zod";
import { argoPost } from "../client.js";

export interface InviteResult {
  email: string;
  status: string;
  message?: string;
}

export interface SendInvitesResponse {
  results: InviteResult[];
}

export const inviteUserByEmailInputSchema = z.object({
  emails: z
    .array(z.string().email())
    .min(1)
    .max(20)
    .describe(
      "Email addresses to invite. Up to 20 per call. Each address that " +
        "already corresponds to an Argo user will be skipped server-side."
    ),
});

export async function inviteUserByEmail(
  input: z.infer<typeof inviteUserByEmailInputSchema>
): Promise<SendInvitesResponse> {
  return argoPost<SendInvitesResponse, { emails: string[] }>(
    "/mcp/v1/invites/email",
    { emails: input.emails }
  );
}
