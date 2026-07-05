import { vi, describe, it, expect, beforeEach } from "vitest";

// Mock the client before importing the module under test
vi.mock("../client.js", () => ({
  argoPost: vi.fn(),
  argoGet: vi.fn(),
  argoPatch: vi.fn(),
  argoDelete: vi.fn(),
}));

import { forumListTopics, forumReadTopic, forumSearch } from "./forum.js";
import * as client from "../client.js";

const argoGet = vi.mocked(client.argoGet);

beforeEach(() => {
  vi.resetAllMocks();
});

const CATEGORIES = {
  category_list: {
    categories: [
      { id: 5, name: "Bug Reports", slug: "bug-reports" },
      {
        id: 7,
        name: "Ideas",
        slug: "ideas",
        subcategory_list: [{ id: 11, name: "Guilds", slug: "guild-ideas" }],
      },
    ],
  },
};

const EMPTY_TOPICS = { topic_list: { topics: [] } };

describe("forumListTopics", () => {
  it("passes straight through when both slug and id are given", async () => {
    argoGet.mockResolvedValueOnce(EMPTY_TOPICS);
    await forumListTopics({ categorySlug: "bug-reports", categoryId: 5 });
    expect(argoGet).toHaveBeenCalledTimes(1);
    expect(argoGet).toHaveBeenCalledWith(
      "/mcp/v1/forum/topics?categorySlug=bug-reports&categoryId=5"
    );
  });

  it("resolves the id from the slug via the category list", async () => {
    argoGet.mockResolvedValueOnce(CATEGORIES).mockResolvedValueOnce(EMPTY_TOPICS);
    await forumListTopics({ categorySlug: "bug-reports" });
    expect(argoGet).toHaveBeenLastCalledWith(
      "/mcp/v1/forum/topics?categorySlug=bug-reports&categoryId=5"
    );
  });

  it("resolves the slug from the id, including subcategories", async () => {
    argoGet.mockResolvedValueOnce(CATEGORIES).mockResolvedValueOnce(EMPTY_TOPICS);
    await forumListTopics({ categoryId: 11 });
    expect(argoGet).toHaveBeenLastCalledWith(
      "/mcp/v1/forum/topics?categorySlug=guild-ideas&categoryId=11"
    );
  });

  it("throws a clear error when neither slug nor id is given", async () => {
    await expect(forumListTopics({})).rejects.toThrow(/categorySlug and\/or categoryId/);
    expect(argoGet).not.toHaveBeenCalled();
  });

  it("throws a clear error when the category does not exist", async () => {
    argoGet.mockResolvedValueOnce(CATEGORIES);
    await expect(forumListTopics({ categorySlug: "nope" })).rejects.toThrow(
      /No forum category found/
    );
  });
});

describe("cooked HTML stripping", () => {
  it("returns plain-text post bodies from forumReadTopic", async () => {
    argoGet.mockResolvedValueOnce({
      id: 9,
      title: "T",
      slug: "t",
      post_stream: {
        posts: [
          {
            id: 1,
            username: "beto",
            cooked: "<p>Hello <b>world</b>!</p><p>Second &amp; last.</p>",
          },
        ],
      },
    });
    const topic = await forumReadTopic({ topicId: 9 });
    expect(topic.post_stream.posts[0].cooked).toBe("Hello world!\nSecond & last.");
  });

  it("strips cooked HTML in forumSearch post results", async () => {
    argoGet.mockResolvedValueOnce({
      topics: [],
      posts: [{ id: 1, topic_id: 9, cooked: "<p>Found &lt;here&gt;</p>" }],
    });
    const result = await forumSearch({ q: "x" });
    expect(result.posts?.[0].cooked).toBe("Found <here>");
  });
});
