/**
 * MCP tools for Discourse forum access (community.argo.games).
 *
 * Read tools require forum.read; write tools require forum.write.
 * All requests are proxied through WebAPI /mcp/v1/forum/* which resolves
 * the acting user's Discourse username from the OAuth grant.
 */

import { z } from "zod";
import { argoGet, argoPost } from "../client.js";

// ---------------------------------------------------------------------------
// Reads (forum.read)
// ---------------------------------------------------------------------------

export const forumListCategoriesInputSchema = z.object({});

export async function forumListCategories(): Promise<unknown> {
  return argoGet<unknown>("/mcp/v1/forum/categories");
}

export const forumListTopicsInputSchema = z.object({
  categorySlug: z.string().min(1).describe("Category slug (e.g. 'bug-reports')."),
  categoryId: z.number().int().describe("Numeric category ID."),
});

export async function forumListTopics(
  input: z.infer<typeof forumListTopicsInputSchema>
): Promise<unknown> {
  return argoGet<unknown>(
    `/mcp/v1/forum/topics?categorySlug=${encodeURIComponent(input.categorySlug)}&categoryId=${input.categoryId}`
  );
}

export const forumGetLatestTopicsInputSchema = z.object({});

export async function forumGetLatestTopics(): Promise<unknown> {
  return argoGet<unknown>("/mcp/v1/forum/latest");
}

export const forumReadTopicInputSchema = z.object({
  topicId: z.number().int().describe("Numeric Discourse topic ID."),
});

export async function forumReadTopic(
  input: z.infer<typeof forumReadTopicInputSchema>
): Promise<unknown> {
  return argoGet<unknown>(`/mcp/v1/forum/topics/${input.topicId}`);
}

export const forumSearchInputSchema = z.object({
  q: z.string().min(1).describe("Search query. Supports Discourse search syntax (e.g. #category, @username)."),
});

export async function forumSearch(
  input: z.infer<typeof forumSearchInputSchema>
): Promise<unknown> {
  return argoGet<unknown>(`/mcp/v1/forum/search?q=${encodeURIComponent(input.q)}`);
}

export const forumGetUserPostsInputSchema = z.object({});

export async function forumGetUserPosts(): Promise<unknown> {
  return argoGet<unknown>("/mcp/v1/forum/users/posts");
}

export const forumGetNotificationsInputSchema = z.object({});

export async function forumGetNotifications(): Promise<unknown> {
  return argoGet<unknown>("/mcp/v1/forum/notifications");
}

// ---------------------------------------------------------------------------
// Writes (forum.write)
// ---------------------------------------------------------------------------

export const forumCreateTopicInputSchema = z.object({
  title: z.string().min(1).describe("Topic title. Keep it concise and descriptive."),
  raw: z.string().min(1).describe("Topic body in Markdown."),
  categoryId: z.number().int().describe("Numeric category ID. Call forum_list_categories first if unsure."),
});

export async function forumCreateTopic(
  input: z.infer<typeof forumCreateTopicInputSchema>
): Promise<unknown> {
  return argoPost<unknown, typeof input>("/mcp/v1/forum/topics", input);
}

export const forumReplyInputSchema = z.object({
  topicId: z.number().int().describe("Numeric Discourse topic ID to reply to."),
  raw: z.string().min(1).describe("Reply body in Markdown."),
});

export async function forumReply(
  input: z.infer<typeof forumReplyInputSchema>
): Promise<unknown> {
  return argoPost<unknown, { raw: string }>(
    `/mcp/v1/forum/topics/${input.topicId}/posts`,
    { raw: input.raw }
  );
}
