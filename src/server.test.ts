import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

vi.mock("./client.js", () => ({
  argoGet: vi.fn(),
  argoPost: vi.fn(),
  argoPatch: vi.fn(),
  argoDelete: vi.fn(),
}));

import * as apiClient from "./client.js";
import { createServer } from "./server.js";

const argoGet = vi.mocked(apiClient.argoGet);
const argoPost = vi.mocked(apiClient.argoPost);
const argoPatch = vi.mocked(apiClient.argoPatch);
const argoDelete = vi.mocked(apiClient.argoDelete);
const textAt = (result: unknown, index = 0): string | undefined =>
  ((result as { content?: Array<{ text?: string }> }).content?.[index]?.text);

describe("MCP server output schemas", () => {
  let server: ReturnType<typeof createServer>;
  let client: Client;
  let clientTransport: InMemoryTransport;
  let serverTransport: InMemoryTransport;

  beforeEach(async () => {
    vi.resetAllMocks();
    server = createServer();
    client = new Client({ name: "test-client", version: "1.0.0" });
    [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
  });

  afterEach(async () => {
    await Promise.allSettled([
      client.close(),
      server.close(),
    ]);
  });

  it("advertises outputSchema for all 61 tools", async () => {
    const result = await client.listTools();

    expect(result.tools).toHaveLength(61);
    expect(result.tools.every((tool) => tool.outputSchema)).toBe(true);
  });

  it("returns structuredContent for a typed read tool", async () => {
    argoGet.mockResolvedValueOnce({
      id: "camp-1",
      gameMasterId: "gm-1",
      campaignName: "Black Harbor",
      campaignDescription: "Shadows and salt",
      ruleSystem: "D&D 5e",
      coGameMasterIds: ["gm-2"],
    });

    const result = await client.callTool({
      name: "get_campaign",
      arguments: { campaignId: "camp-1" },
    });

    expect(result.structuredContent).toMatchObject({
      id: "camp-1",
      campaignName: "Black Harbor",
    });
    expect(textAt(result)).toContain("Black Harbor");
  });

  it("returns structuredContent with idMap for a formatted list tool", async () => {
    argoGet.mockResolvedValueOnce([
      {
        id: "camp-1",
        gameMasterId: "gm-1",
        campaignName: "Black Harbor",
        accessLevel: "read+write",
      },
    ]);

    const result = await client.callTool({
      name: "list_campaigns",
      arguments: {},
    });

    expect(result.structuredContent).toMatchObject({
      campaigns: [
        expect.objectContaining({ campaignName: "Black Harbor" }),
      ],
      idMap: {
        "Black Harbor": "camp-1",
      },
    });
    expect(textAt(result)).toContain("Black Harbor");
  });

  it("returns structuredContent for a bulk mnemon write tool", async () => {
    argoPost.mockResolvedValueOnce({
      results: [
        {
          index: 0,
          success: true,
          entryId: "A".repeat(32),
          title: "Captain Nyra",
        },
      ],
    });

    const result = await client.callTool({
      name: "create_npc_mnemons",
      arguments: {
        campaignId: "camp-1",
        items: [
          {
            title: "Captain Nyra",
            blocks: [{ type: "paragraph", content: "Harbor master" }],
            npcType: "INDIVIDUAL",
          },
        ],
      },
    });

    expect(result.structuredContent).toMatchObject({
      results: [
        expect.objectContaining({
          success: true,
          title: "Captain Nyra",
        }),
      ],
    });
    expect(textAt(result)).toContain("succeeded");
  });

  it("returns structuredContent for a void-style guild mutation", async () => {
    argoPost.mockResolvedValueOnce(undefined);

    const result = await client.callTool({
      name: "invite_guild_member",
      arguments: {
        guildId: "guild-1",
        userId: "user-9",
      },
    });

    expect(result.structuredContent).toEqual({
      success: true,
      guildId: "guild-1",
      userId: "user-9",
    });
    expect(textAt(result)).toContain("Invited user");
  });

  it("returns structuredContent for a forum read tool", async () => {
    argoGet.mockResolvedValueOnce({
      topics: [
        {
          id: 7,
          title: "Recurring guild events",
          slug: "recurring-guild-events",
          posts_count: 4,
          reply_count: 2,
          created_at: "2026-05-01T10:00:00Z",
          last_posted_at: "2026-05-02T10:00:00Z",
          category_id: 11,
          tags: ["guilds"],
        },
      ],
      posts: [],
      grouped_search_result: { more_full_page_results: false },
    });

    const result = await client.callTool({
      name: "forum_search",
      arguments: { q: "guild calendar" },
    });

    expect(result.structuredContent).toMatchObject({
      topics: [
        expect.objectContaining({
          title: "Recurring guild events",
        }),
      ],
    });
    expect(textAt(result)).toContain("Recurring guild events");
  });

  it("returns structuredContent for a forum write tool", async () => {
    argoPost.mockResolvedValueOnce({
      id: 42,
      topic_id: 9,
      topic_slug: "guild-calendar-feedback",
      post_number: 2,
      username: "beto",
      cooked: "<p>Nice idea</p>",
    });

    const result = await client.callTool({
      name: "forum_reply",
      arguments: {
        topicId: 9,
        raw: "Nice idea",
      },
    });

    expect(result.structuredContent).toMatchObject({
      id: 42,
      topic_id: 9,
      post_number: 2,
    });
    expect(textAt(result)).toContain("Reply posted");
  });

  it("returns tool errors without structuredContent on failure", async () => {
    argoGet.mockRejectedValueOnce(new Error("boom"));

    const result = await client.callTool({
      name: "get_campaign",
      arguments: { campaignId: "camp-1" },
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
    expect(textAt(result)).toContain("boom");
  });
});
