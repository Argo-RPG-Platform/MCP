/**
 * MCP tools for Discourse forum access (community.argo.games).
 *
 * Read tools require forum.read; write tools require forum.write.
 * All requests are proxied through WebAPI /mcp/v1/forum/* which resolves
 * the acting user's Discourse username from the OAuth grant.
 */

import { z } from "zod";
import { argoGet, argoPost } from "../client.js";

export interface ForumCategory {
  id: number;
  name: string;
  slug: string;
  description_text?: string | null;
  subcategory_list?: ForumCategory[] | null;
  [key: string]: unknown;
}

export interface ForumCategoriesResponse {
  category_list: {
    categories: ForumCategory[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface ForumTopicSummary {
  id: number;
  title: string;
  slug: string;
  posts_count: number;
  reply_count: number;
  created_at: string;
  last_posted_at?: string | null;
  category_id?: number | null;
  tags?: string[] | null;
  excerpt?: string | null;
  [key: string]: unknown;
}

export interface ForumTopicListResponse {
  topic_list: {
    topics: ForumTopicSummary[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface ForumTopicPost {
  id: number;
  username?: string | null;
  cooked?: string | null;
  created_at?: string | null;
  reply_count?: number | null;
  [key: string]: unknown;
}

export interface ForumTopicDetailResponse {
  id: number;
  title: string;
  slug: string;
  post_stream: {
    posts: ForumTopicPost[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface ForumSearchPost {
  id: number;
  topic_id?: number | null;
  username?: string | null;
  cooked?: string | null;
  created_at?: string | null;
  [key: string]: unknown;
}

export interface ForumSearchResponse {
  topics?: ForumTopicSummary[] | null;
  posts?: ForumSearchPost[] | null;
  grouped_search_result?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface ForumNotification {
  id: number;
  notification_type?: number | null;
  read?: boolean | null;
  created_at?: string | null;
  topic_id?: number | null;
  post_number?: number | null;
  data?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface ForumNotificationsResponse {
  notifications: ForumNotification[];
  [key: string]: unknown;
}

export interface ForumPostResponse {
  id: number;
  topic_id?: number | null;
  topic_slug?: string | null;
  post_number?: number | null;
  username?: string | null;
  [key: string]: unknown;
}

const forumCategoryOutputSchema: z.ZodType<ForumCategory> = z.lazy(() =>
  z.object({
    id: z.number(),
    name: z.string(),
    slug: z.string(),
    description_text: z.string().nullish(),
    subcategory_list: z.array(forumCategoryOutputSchema).nullish(),
  }).passthrough()
);

export const forumCategoriesOutputSchema: z.ZodType<ForumCategoriesResponse> = z.object({
  category_list: z.object({
    categories: z.array(forumCategoryOutputSchema),
  }).passthrough(),
}).passthrough();

export const forumTopicSummaryOutputSchema: z.ZodType<ForumTopicSummary> = z.object({
  id: z.number(),
  title: z.string(),
  slug: z.string(),
  posts_count: z.number(),
  reply_count: z.number(),
  created_at: z.string(),
  last_posted_at: z.string().nullish(),
  category_id: z.number().nullish(),
  tags: z.array(z.string()).nullish(),
  excerpt: z.string().nullish(),
}).passthrough();

export const forumTopicListOutputSchema: z.ZodType<ForumTopicListResponse> = z.object({
  topic_list: z.object({
    topics: z.array(forumTopicSummaryOutputSchema),
  }).passthrough(),
}).passthrough();

export const forumTopicPostOutputSchema: z.ZodType<ForumTopicPost> = z.object({
  id: z.number(),
  username: z.string().nullish(),
  cooked: z.string().nullish(),
  created_at: z.string().nullish(),
  reply_count: z.number().nullish(),
}).passthrough();

export const forumTopicDetailOutputSchema: z.ZodType<ForumTopicDetailResponse> = z.object({
  id: z.number(),
  title: z.string(),
  slug: z.string(),
  post_stream: z.object({
    posts: z.array(forumTopicPostOutputSchema),
  }).passthrough(),
}).passthrough();

export const forumSearchPostOutputSchema: z.ZodType<ForumSearchPost> = z.object({
  id: z.number(),
  topic_id: z.number().nullish(),
  username: z.string().nullish(),
  cooked: z.string().nullish(),
  created_at: z.string().nullish(),
}).passthrough();

export const forumSearchOutputSchema: z.ZodType<ForumSearchResponse> = z.object({
  topics: z.array(forumTopicSummaryOutputSchema).nullish(),
  posts: z.array(forumSearchPostOutputSchema).nullish(),
  grouped_search_result: z.record(z.unknown()).nullish(),
}).passthrough();

export const forumNotificationsOutputSchema: z.ZodType<ForumNotificationsResponse> = z.object({
  notifications: z.array(z.object({
    id: z.number(),
    notification_type: z.number().nullish(),
    read: z.boolean().nullish(),
    created_at: z.string().nullish(),
    topic_id: z.number().nullish(),
    post_number: z.number().nullish(),
    data: z.record(z.unknown()).nullish(),
  }).passthrough()),
}).passthrough();

export const forumPostResponseOutputSchema: z.ZodType<ForumPostResponse> = z.object({
  id: z.number(),
  topic_id: z.number().nullish(),
  topic_slug: z.string().nullish(),
  post_number: z.number().nullish(),
  username: z.string().nullish(),
}).passthrough();

// ---------------------------------------------------------------------------
// Reads (forum.read)
// ---------------------------------------------------------------------------

export const forumListCategoriesInputSchema = z.object({});

export async function forumListCategories(): Promise<ForumCategoriesResponse> {
  return argoGet<ForumCategoriesResponse>("/mcp/v1/forum/categories");
}

export const forumListTopicsInputSchema = z.object({
  categorySlug: z.string().min(1).describe("Category slug (e.g. 'bug-reports')."),
  categoryId: z.number().int().describe("Numeric category ID."),
});

export async function forumListTopics(
  input: z.infer<typeof forumListTopicsInputSchema>
): Promise<ForumTopicListResponse> {
  return argoGet<ForumTopicListResponse>(
    `/mcp/v1/forum/topics?categorySlug=${encodeURIComponent(input.categorySlug)}&categoryId=${input.categoryId}`
  );
}

export const forumGetLatestTopicsInputSchema = z.object({});

export async function forumGetLatestTopics(): Promise<ForumTopicListResponse> {
  return argoGet<ForumTopicListResponse>("/mcp/v1/forum/latest");
}

export const forumReadTopicInputSchema = z.object({
  topicId: z.number().int().describe("Numeric Discourse topic ID."),
});

export async function forumReadTopic(
  input: z.infer<typeof forumReadTopicInputSchema>
): Promise<ForumTopicDetailResponse> {
  return argoGet<ForumTopicDetailResponse>(`/mcp/v1/forum/topics/${input.topicId}`);
}

export const forumSearchInputSchema = z.object({
  q: z.string().min(1).describe("Search query. Supports Discourse search syntax (e.g. #category, @username)."),
});

export async function forumSearch(
  input: z.infer<typeof forumSearchInputSchema>
): Promise<ForumSearchResponse> {
  return argoGet<ForumSearchResponse>(`/mcp/v1/forum/search?q=${encodeURIComponent(input.q)}`);
}

export const forumGetUserPostsInputSchema = z.object({});

export async function forumGetUserPosts(): Promise<ForumTopicListResponse> {
  return argoGet<ForumTopicListResponse>("/mcp/v1/forum/users/posts");
}

export const forumGetNotificationsInputSchema = z.object({});

export async function forumGetNotifications(): Promise<ForumNotificationsResponse> {
  return argoGet<ForumNotificationsResponse>("/mcp/v1/forum/notifications");
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
): Promise<ForumPostResponse> {
  return argoPost<ForumPostResponse, typeof input>("/mcp/v1/forum/topics", input);
}

export const forumReplyInputSchema = z.object({
  topicId: z.number().int().describe("Numeric Discourse topic ID to reply to."),
  raw: z.string().min(1).describe("Reply body in Markdown."),
});

export async function forumReply(
  input: z.infer<typeof forumReplyInputSchema>
): Promise<ForumPostResponse> {
  return argoPost<ForumPostResponse, { raw: string }>(
    `/mcp/v1/forum/topics/${input.topicId}/posts`,
    { raw: input.raw }
  );
}
