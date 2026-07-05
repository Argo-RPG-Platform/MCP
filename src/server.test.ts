import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

vi.mock("./client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./client.js")>();
  return {
    ...actual,
    argoGet: vi.fn(),
    argoPost: vi.fn(),
    argoPatch: vi.fn(),
    argoDelete: vi.fn(),
  };
});

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

  it("advertises outputSchema for all 63 tools", async () => {
    const result = await client.listTools();

    expect(result.tools).toHaveLength(63);
    expect(result.tools.every((tool) => tool.outputSchema)).toBe(true);
  });

  it("returns formatted hits with block-addressed snippets from search_mnemons", async () => {
    argoGet.mockResolvedValueOnce({
      results: [
        {
          entryId: "A".repeat(32),
          title: "Red Oracle",
          type: "NPC",
          matchedIn: ["title", "content"],
          snippets: [{ blockId: "b1", text: "…dwells beneath Black Harbor…" }],
        },
      ],
      hasMore: false,
    });

    const result = await client.callTool({
      name: "search_mnemons",
      arguments: { campaignId: "camp-1", query: "oracle" },
    });

    expect(result.structuredContent).toMatchObject({
      results: [expect.objectContaining({ entryId: "A".repeat(32), title: "Red Oracle" })],
      idMap: { "Red Oracle|NPC": "A".repeat(32) },
      hasMore: false,
    });
    const text = textAt(result) ?? "";
    expect(text).toContain("matched title, content");
    expect(text).toContain("[block: b1]");
  });

  it("describes update_mnemons_content as markdown-authored ops", async () => {
    const result = await client.listTools();
    const tool = result.tools.find((t) => t.name === "update_mnemons_content")!;

    // The input schema is markdown-based ops; the description must not drift
    // back to the pre-markdown HTML/blockType vocabulary (regression: PR #53
    // migrated the schema but left the old description in place).
    expect(tool.description).toMatch(/Markdown/);
    expect(tool.description).not.toMatch(/blockType/);
  });

  it("describes create_mnemon_relationship with every registered label", async () => {
    const result = await client.listTools();
    const tool = result.tools.find((t) => t.name === "create_mnemon_relationship")!;
    const catalog = (await client.callTool({
      name: "describe_mnemon_types",
      arguments: {},
    })).structuredContent as { relationshipLabels: string[] };

    for (const label of catalog.relationshipLabels) {
      expect(tool.description).toContain(label);
    }
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
            markdown: "Harbor master",
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

  it("suffixes duplicate names in idMap instead of dropping entries", async () => {
    argoGet.mockResolvedValueOnce([
      { id: "camp-1", gameMasterId: "gm-1", campaignName: "Reboot" },
      { id: "camp-2", gameMasterId: "gm-1", campaignName: "Reboot" },
    ]);

    const result = await client.callTool({ name: "list_campaigns", arguments: {} });

    expect(result.structuredContent).toMatchObject({
      idMap: {
        "Reboot": "camp-1",
        "Reboot (2)": "camp-2",
      },
    });
  });

  it("exposes pagination metadata on list_mnemons", async () => {
    const page = Array.from({ length: 100 }, (_, i) => ({
      entryId: `id${i}`.padEnd(32, "0"),
      title: `entry-${i}`,
      type: "Lore",
    }));
    argoGet.mockResolvedValueOnce(page);

    const result = await client.callTool({
      name: "list_mnemons",
      arguments: { campaignId: "camp-1", limit: 10 },
    });

    expect(result.structuredContent).toMatchObject({
      hasMore: true,
      nextOffset: 10,
    });
    expect(textAt(result)).toContain("offset=10");
  });

  it("truncates oversized results instead of discarding them", async () => {
    // ~200k chars of entries — far past the 100k char (25k token) cap.
    const huge = Array.from({ length: 500 }, (_, i) => ({
      entryId: `id${i}`.padEnd(32, "0"),
      title: `entry-${i} ${"x".repeat(400)}`,
      type: "Lore",
    }));
    argoGet.mockResolvedValueOnce(huge).mockResolvedValueOnce([]);

    const result = await client.callTool({
      name: "list_mnemons",
      arguments: { campaignId: "camp-1", limit: 500 },
    });

    expect(result.isError).toBe(true);
    const text = textAt(result) ?? "";
    expect(text).toContain("Result truncated");
    // Partial data survives — the first entries are still in the payload.
    expect(text).toContain("entry-0");
    expect(text.length).toBeLessThanOrEqual(100_000);
  });
});
