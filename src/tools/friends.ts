/**
 * MCP tools for friend-request management.
 * Reads require friends.read; writes require friends.write. The acting user
 * is implied by the OAuth grant — bodies only carry the counterparty's userId.
 */

import { z } from "zod";
import { argoGet, argoPost } from "../client.js";

export interface UserDetail {
  id: string;
  name?: string;
  email?: string;
}

export interface FriendRequestRecord {
  id: string;
  senderId: string;
  receiverId: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
}

const targetSchema = z.object({
  userId: z.string().min(1).describe("Argo user ID of the counterparty."),
});

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const listFriendsInputSchema = z.object({});

export async function listFriends(): Promise<UserDetail[]> {
  return argoGet<UserDetail[]>("/mcp/v1/friends");
}

export const listSentFriendRequestsInputSchema = z.object({});

export async function listSentFriendRequests(): Promise<FriendRequestRecord[]> {
  return argoGet<FriendRequestRecord[]>("/mcp/v1/friends/pending/sent");
}

export const listReceivedFriendRequestsInputSchema = z.object({});

export async function listReceivedFriendRequests(): Promise<FriendRequestRecord[]> {
  return argoGet<FriendRequestRecord[]>("/mcp/v1/friends/pending/received");
}

// ---------------------------------------------------------------------------
// Writes — the acting user is implied; bodies carry only the counterparty.
// ---------------------------------------------------------------------------

export const sendFriendRequestInputSchema = targetSchema;

export async function sendFriendRequest(
  input: z.infer<typeof sendFriendRequestInputSchema>
): Promise<FriendRequestRecord> {
  return argoPost<FriendRequestRecord, { userId: string }>(
    "/mcp/v1/friends/request",
    { userId: input.userId }
  );
}

export const acceptFriendRequestInputSchema = targetSchema;

export async function acceptFriendRequest(
  input: z.infer<typeof acceptFriendRequestInputSchema>
): Promise<FriendRequestRecord> {
  return argoPost<FriendRequestRecord, { userId: string }>(
    "/mcp/v1/friends/accept",
    { userId: input.userId }
  );
}

export const rejectFriendRequestInputSchema = targetSchema;

export async function rejectFriendRequest(
  input: z.infer<typeof rejectFriendRequestInputSchema>
): Promise<FriendRequestRecord> {
  return argoPost<FriendRequestRecord, { userId: string }>(
    "/mcp/v1/friends/reject",
    { userId: input.userId }
  );
}

export const cancelFriendRequestInputSchema = targetSchema;

export async function cancelFriendRequest(
  input: z.infer<typeof cancelFriendRequestInputSchema>
): Promise<FriendRequestRecord> {
  return argoPost<FriendRequestRecord, { userId: string }>(
    "/mcp/v1/friends/cancel",
    { userId: input.userId }
  );
}
