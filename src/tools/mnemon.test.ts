import { vi, describe, it, expect, beforeEach } from "vitest";

// Mock the client before importing the module under test. ArgoApiError stays
// real: setQuestObjectiveState reads it to explain a missing objective.
vi.mock("../client.js", async (importOriginal) => ({
  ArgoApiError: (await importOriginal<typeof import("../client.js")>()).ArgoApiError,
  argoPost: vi.fn(),
  argoGet: vi.fn(),
  argoPatch: vi.fn(),
  argoDelete: vi.fn(),
}));

import {
  createNpcMnemons,
  createLocationMnemons,
  createQuestMnemons,
  createQuestMnemonsInputSchema,
  createPlayerMnemons,
  deleteMnemon,
  describeMnemonTypes,
  describeMnemonTypesOutputSchema,
  listMnemons,
  mnemonEntryOutputSchema,
  searchMnemons,
  setQuestObjectiveState,
  updateNpcMnemons,
  updateMnemonsContent,
  updateQuestMnemons,
  updateQuestMnemonsInputSchema,
  type MnemonSummary,
} from "./mnemon.js";
import * as client from "../client.js";

const argoPost = vi.mocked(client.argoPost);
const argoPatch = vi.mocked(client.argoPatch);
const argoGet = vi.mocked(client.argoGet);
const argoDelete = vi.mocked(client.argoDelete);

const CAMPAIGN = "camp-123";
const ENTRY = "AAAA0000AAAA0000AAAA0000AAAA0000";
const NPC_HEX = "BBBB1111BBBB1111BBBB1111BBBB1111";
const LOC_HEX = "CCCC2222CCCC2222CCCC2222CCCC2222";

beforeEach(() => {
  vi.resetAllMocks();
});

// ---------------------------------------------------------------------------
// describe_mnemon_types
// ---------------------------------------------------------------------------

describe("describeMnemonTypes", () => {
  it("returns a types array", () => {
    const result = describeMnemonTypes() as { types: { type: string; tool: string }[] };
    expect(Array.isArray(result.types)).toBe(true);
  });

  it("includes all expected types", () => {
    const result = describeMnemonTypes() as { types: { type: string }[] };
    const names = result.types.map((t) => t.type);
    expect(names).toEqual(
      expect.arrayContaining([
        "NPC", "Location", "Quest", "Lore", "Archive",
        "Journal", "SessionSummary", "Player", "Custom",
      ])
    );
  });

  it("documents the markdown format, mentions, and image rules", () => {
    const result = describeMnemonTypes() as { markdownFormat: { summary: string; mentions: string; images: string } };
    expect(result.markdownFormat.summary).toMatch(/Markdown/);
    expect(result.markdownFormat.mentions).toMatch(/@\[label\]\(mnemon:/);
    expect(result.markdownFormat.images).toMatch(/asset:/);
  });

  it("documents the blockOps vocabulary", () => {
    const result = describeMnemonTypes() as { blockOps: { ops: { op: string }[] } };
    const ops = result.blockOps.ops.map((o) => o.op);
    expect(ops).toEqual(["append", "insertAfter", "replace", "remove"]);
  });

  it("output schema covers every key the catalog actually returns", () => {
    // .strict() turns unknown keys into a parse error, so a new catalog field
    // that is missing from the output schema fails here instead of being
    // silently stripped from structuredContent.
    expect(() => describeMnemonTypesOutputSchema.strict().parse(describeMnemonTypes())).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// listMnemons
// ---------------------------------------------------------------------------

const lorePage = (start: number, count: number): MnemonSummary[] =>
  Array.from({ length: count }, (_, i) => ({
    entryId: `id${start + i}`.padEnd(32, "0"),
    title: `entry-${start + i}`,
    type: "Lore",
  }));

describe("listMnemons", () => {
  it("returns a single short page with hasMore=false", async () => {
    const entries: MnemonSummary[] = [
      { entryId: ENTRY, title: "Town", type: "Location" },
    ];
    argoGet.mockResolvedValueOnce(entries);
    const result = await listMnemons({ campaignId: CAMPAIGN });
    expect(result.entries).toEqual(entries);
    expect(result.hasMore).toBe(false);
    expect(result.nextOffset).toBeUndefined();
    expect(argoGet).toHaveBeenCalledTimes(1);
  });

  it("reports hasMore=false when results end exactly on a page boundary", async () => {
    argoGet.mockResolvedValueOnce(lorePage(0, 100)).mockResolvedValueOnce([]);
    const result = await listMnemons({ campaignId: CAMPAIGN });
    expect(result.entries).toHaveLength(100);
    expect(result.hasMore).toBe(false);
    expect(argoGet).toHaveBeenCalledTimes(2);
  });

  it("respects limit and reports nextOffset when more entries exist", async () => {
    argoGet.mockResolvedValueOnce(lorePage(0, 100));
    const result = await listMnemons({ campaignId: CAMPAIGN, limit: 50 });
    expect(result.entries).toHaveLength(50);
    expect(result.entries[0].title).toBe("entry-0");
    expect(result.hasMore).toBe(true);
    expect(result.nextOffset).toBe(50);
    // The first upstream page already covers limit+1 — no second fetch.
    expect(argoGet).toHaveBeenCalledTimes(1);
  });

  it("skips offset entries and pages upstream until the window is covered", async () => {
    argoGet
      .mockResolvedValueOnce(lorePage(0, 100))
      .mockResolvedValueOnce(lorePage(100, 100))
      .mockResolvedValueOnce(lorePage(200, 30));
    const result = await listMnemons({ campaignId: CAMPAIGN, offset: 150, limit: 50 });
    expect(result.entries).toHaveLength(50);
    expect(result.entries[0].title).toBe("entry-150");
    expect(result.entries[49].title).toBe("entry-199");
    expect(result.hasMore).toBe(true);
    expect(result.nextOffset).toBe(200);
    expect(argoGet).toHaveBeenCalledTimes(3);
  });

  it("returns an empty page with hasMore=false when offset is past the end", async () => {
    argoGet.mockResolvedValueOnce(lorePage(0, 10));
    const result = await listMnemons({ campaignId: CAMPAIGN, offset: 50 });
    expect(result.entries).toHaveLength(0);
    expect(result.hasMore).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// searchMnemons
// ---------------------------------------------------------------------------

describe("searchMnemons", () => {
  it("GETs /mnemons/search with q, type, and limit", async () => {
    argoGet.mockResolvedValueOnce({ results: [], hasMore: false });
    await searchMnemons({ campaignId: CAMPAIGN, query: "red oracle", type: "NPC", limit: 5 });
    expect(argoGet).toHaveBeenCalledWith(
      `/mcp/v1/campaigns/${CAMPAIGN}/mnemons/search?q=red+oracle&type=NPC&limit=5`
    );
  });

  it("omits optional params when not provided", async () => {
    argoGet.mockResolvedValueOnce({ results: [], hasMore: false });
    await searchMnemons({ campaignId: CAMPAIGN, query: "oracle" });
    expect(argoGet).toHaveBeenCalledWith(
      `/mcp/v1/campaigns/${CAMPAIGN}/mnemons/search?q=oracle`
    );
  });
});

// ---------------------------------------------------------------------------
// deleteMnemon
// ---------------------------------------------------------------------------

describe("deleteMnemon", () => {
  it("DELETEs by hex id without listing", async () => {
    argoDelete.mockResolvedValueOnce(undefined);
    const hex = await deleteMnemon({ campaignId: CAMPAIGN, entryId: ENTRY });
    expect(hex).toBe(ENTRY);
    expect(argoGet).not.toHaveBeenCalled();
    expect(argoDelete).toHaveBeenCalledWith(
      `/mcp/v1/campaigns/${CAMPAIGN}/mnemons/${ENTRY}`
    );
  });

  it("resolves a title to its hex id before deleting", async () => {
    argoGet.mockResolvedValueOnce([{ entryId: NPC_HEX, title: "Goblin", type: "NPC" }]);
    argoDelete.mockResolvedValueOnce(undefined);
    const hex = await deleteMnemon({ campaignId: CAMPAIGN, entryId: "Goblin" });
    expect(hex).toBe(NPC_HEX);
    expect(argoDelete).toHaveBeenCalledWith(
      `/mcp/v1/campaigns/${CAMPAIGN}/mnemons/${NPC_HEX}`
    );
  });

  it("does not delete when the title is ambiguous", async () => {
    argoGet.mockResolvedValueOnce([
      { entryId: NPC_HEX, title: "Goblin", type: "NPC" },
      { entryId: LOC_HEX, title: "Goblin", type: "NPC" },
    ]);
    await expect(deleteMnemon({ campaignId: CAMPAIGN, entryId: "Goblin" })).rejects.toThrow(
      /matches 2 mnemons/
    );
    expect(argoDelete).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Per-type create tools
// ---------------------------------------------------------------------------

describe("createNpcMnemons", () => {
  it("POSTs to /mnemons/npc with items array", async () => {
    argoPost.mockResolvedValueOnce({ results: [{ index: 0, success: true, entryId: ENTRY, title: "Goblin" }] });
    await createNpcMnemons({
      campaignId: CAMPAIGN,
      items: [{ title: "Goblin", markdown: "ugly", npcType: "INDIVIDUAL" }],
    });
    expect(argoPost).toHaveBeenCalledWith(
      expect.stringMatching(/\/mnemons\/npc$/),
      expect.objectContaining({
        items: expect.arrayContaining([expect.objectContaining({ title: "Goblin", npcType: "INDIVIDUAL" })]),
      })
    );
  });

  it("resolves title-form primaryLocationEntryId to hex before POSTing", async () => {
    argoGet.mockResolvedValueOnce([{ entryId: LOC_HEX, title: "Tavern", type: "Location" }]);
    argoPost.mockResolvedValueOnce({ results: [{ index: 0, success: true, entryId: NPC_HEX, title: "Bartender" }] });
    await createNpcMnemons({
      campaignId: CAMPAIGN,
      items: [
        {
          title: "Bartender",
          markdown: "x",
          npcType: "INDIVIDUAL",
          primaryLocationEntryId: "Tavern",
        },
      ],
    });
    const body = argoPost.mock.calls[0][1] as { items: Array<{ primaryLocationEntryId: string }> };
    expect(body.items[0].primaryLocationEntryId).toBe(LOC_HEX);
  });
});

describe("createLocationMnemons", () => {
  it("POSTs to /mnemons/location", async () => {
    argoPost.mockResolvedValueOnce({ results: [{ index: 0, success: true, entryId: LOC_HEX, title: "Town" }] });
    await createLocationMnemons({
      campaignId: CAMPAIGN,
      items: [{ title: "Town", markdown: "x", levelId: "L_Town" }],
    });
    expect(argoPost).toHaveBeenCalledWith(
      expect.stringMatching(/\/mnemons\/location$/),
      expect.any(Object)
    );
  });
});

describe("createQuestMnemons", () => {
  it("resolves title-form issuerNpcEntryId before POSTing", async () => {
    argoGet.mockResolvedValueOnce([{ entryId: NPC_HEX, title: "Mayor", type: "NPC" }]);
    argoPost.mockResolvedValueOnce({ results: [{ index: 0, success: true, entryId: ENTRY, title: "Save the cat" }] });
    await createQuestMnemons({
      campaignId: CAMPAIGN,
      items: [
        {
          title: "Save the cat",
          markdown: "x",
          questStatus: "active",
          issuerNpcEntryId: "Mayor",
        },
      ],
    });
    const body = argoPost.mock.calls[0][1] as { items: Array<{ issuerNpcEntryId: string }> };
    expect(body.items[0].issuerNpcEntryId).toBe(NPC_HEX);
  });

  it("passes steps and rewards through the POST body", async () => {
    argoPost.mockResolvedValueOnce({ results: [{ index: 0, success: true, entryId: ENTRY, title: "Save the cat" }] });
    await createQuestMnemons({
      campaignId: CAMPAIGN,
      items: [
        {
          title: "Save the cat",
          markdown: "x",
          steps: [
            { stepId: "s1", title: "Find the cat", status: "Available" },
            { title: "Bring it home" },
          ],
          rewards: [
            { rewardType: "Gold", label: "50 gp", amount: 50, linkedStepIds: ["s1"] },
          ],
        },
      ],
    });
    const body = argoPost.mock.calls[0][1] as {
      items: Array<{
        steps?: Array<{ stepId?: string; title: string; status?: string }>;
        rewards?: Array<{ rewardType?: string; amount?: number; linkedStepIds?: string[] }>;
      }>;
    };
    expect(body.items[0].steps).toHaveLength(2);
    expect(body.items[0].steps?.[0]).toMatchObject({ stepId: "s1", title: "Find the cat", status: "Available" });
    expect(body.items[0].rewards).toHaveLength(1);
    expect(body.items[0].rewards?.[0]).toMatchObject({ rewardType: "Gold", amount: 50 });
    expect(body.items[0].rewards?.[0].linkedStepIds).toEqual(["s1"]);
  });

  it("resolves title-form targetNpcEntryIds inside a step", async () => {
    argoGet.mockResolvedValueOnce([{ entryId: NPC_HEX, title: "Mayor", type: "NPC" }]);
    argoPost.mockResolvedValueOnce({ results: [{ index: 0, success: true, entryId: ENTRY, title: "Q" }] });
    await createQuestMnemons({
      campaignId: CAMPAIGN,
      items: [
        {
          title: "Q",
          markdown: "x",
          steps: [
            { title: "Talk to mayor", targetNpcEntryIds: ["Mayor"] },
          ],
        },
      ],
    });
    const body = argoPost.mock.calls[0][1] as {
      items: Array<{ steps?: Array<{ targetNpcEntryIds?: string[] }> }>;
    };
    expect(body.items[0].steps?.[0].targetNpcEntryIds).toEqual([NPC_HEX]);
  });

  it("rejects an invalid step status at the schema layer", () => {
    expect(() =>
      createQuestMnemonsInputSchema.parse({
        campaignId: CAMPAIGN,
        items: [
          {
            title: "Q",
            markdown: "x",
            steps: [{ title: "x", status: "NotARealStatus" as unknown as "Available" }],
          },
        ],
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// The doc-based quest (ARGO-2148 / ARGO-2213)
// ---------------------------------------------------------------------------

const QUEST_HEX = "DDDD3333DDDD3333DDDD3333DDDD3333";
const ITEM_HEX = "EEEE4444EEEE4444EEEE4444EEEE4444";
const created = (title: string) => ({ results: [{ index: 0, success: true, entryId: ENTRY, title }] });
const sentItem = (call: typeof argoPost | typeof argoPatch) =>
  (call.mock.calls[0][1] as { items: Array<Record<string, unknown>> }).items[0];

describe("createQuestMnemons — typed quests", () => {
  it("sends the header, objectives with sub-objectives, reward chips and prose as typed fields", async () => {
    argoPost.mockResolvedValueOnce(created("The Shattered Crown"));
    await createQuestMnemons({
      campaignId: CAMPAIGN,
      items: [
        {
          title: "The Shattered Crown",
          status: "Active",
          kind: "Main",
          playersCanTick: true,
          hook: "The crown is broken and the heirs are circling.",
          giverId: NPC_HEX,
          objectives: [
            { text: "Find the three shards", children: [{ text: "The shard under the chapel", state: "done" }] },
            { text: "Keep the regent alive", optional: true, hidden: true },
          ],
          rewards: [
            { kind: "currency", amount: 250, unit: "coin.gp", unitLabel: "Gold piece" },
            { kind: "xp", amount: 1.5 },
          ],
          background: "The crown broke on the night the old king died.",
          gmNotes: "The regent is the thief.",
        },
      ],
    });

    expect(argoGet).not.toHaveBeenCalled(); // hex ids need no lookup
    expect(sentItem(argoPost)).toMatchObject({
      status: "Active",
      kind: "Main",
      playersCanTick: true,
      hook: "The crown is broken and the heirs are circling.",
      giverId: NPC_HEX,
      objectives: [
        { text: "Find the three shards", children: [{ text: "The shard under the chapel", state: "done" }] },
        { text: "Keep the regent alive", optional: true, hidden: true },
      ],
      rewards: [
        { kind: "currency", amount: 250, unit: "coin.gp", unitLabel: "Gold piece" },
        { kind: "xp", amount: 1.5 },
      ],
      background: "The crown broke on the night the old king died.",
      gmNotes: "The regent is the thief.",
    });
  });

  it("resolves the header links and an item chip's entry by title, each against its own type", async () => {
    argoGet.mockResolvedValueOnce([
      { entryId: NPC_HEX, title: "Mira", type: "NPC" },
      { entryId: LOC_HEX, title: "Mira", type: "Location" },
      { entryId: QUEST_HEX, title: "The Crown", type: "Quest" },
      { entryId: ITEM_HEX, title: "Ancient map", type: "Custom" },
    ]);
    argoPost.mockResolvedValueOnce(created("The Heir"));
    await createQuestMnemons({
      campaignId: CAMPAIGN,
      items: [
        {
          title: "The Heir",
          giverId: "Mira",
          locationId: "Mira",
          parentQuestId: "The Crown",
          rewards: [{ kind: "item", label: "Ancient map", entryId: "Ancient map" }],
        },
      ],
    });

    expect(sentItem(argoPost)).toMatchObject({
      giverId: NPC_HEX,
      locationId: LOC_HEX,
      parentQuestId: QUEST_HEX,
      rewards: [{ kind: "item", label: "Ancient map", entryId: ITEM_HEX }],
    });
    expect(argoGet).toHaveBeenCalledTimes(1);
  });

  it("sends markdown alone as the Background of the template quest", async () => {
    argoPost.mockResolvedValueOnce(created("A lead"));
    await createQuestMnemons({ campaignId: CAMPAIGN, items: [{ title: "A lead", markdown: "Someone is buying maps." }] });

    const item = sentItem(argoPost);
    expect(item.background).toBe("Someone is buying maps.");
    expect(item).not.toHaveProperty("markdown");
  });

  it("keeps markdown as it is for a quest written with the retired fields", async () => {
    argoPost.mockResolvedValueOnce(created("Old"));
    await createQuestMnemons({
      campaignId: CAMPAIGN,
      items: [{ title: "Old", markdown: "x", steps: [{ title: "Find the cat" }] }],
    });

    const item = sentItem(argoPost);
    expect(item.markdown).toBe("x");
    expect(item).not.toHaveProperty("background");
  });

  it("refuses a reward that names neither a chip's kind nor a retired rewardType", async () => {
    await expect(
      createQuestMnemons({
        campaignId: CAMPAIGN,
        items: [{ title: "Q", objectives: [{ text: "x" }], rewards: [{ label: "50 gp", amount: 50 }] }],
      })
    ).rejects.toThrow(/rewards\[0\]: a reward chip needs its kind/);
    expect(argoPost).not.toHaveBeenCalled();
  });

  it("holds status, kind and objective state to their vocabularies at the schema layer", () => {
    const item = (extra: Record<string, unknown>) => ({ campaignId: CAMPAIGN, items: [{ title: "Q", ...extra }] });

    expect(() => createQuestMnemonsInputSchema.parse(item({ status: "Active", kind: "Personal" }))).not.toThrow();
    expect(() => createQuestMnemonsInputSchema.parse(item({ status: "TurnedIn" }))).toThrow();
    expect(() => createQuestMnemonsInputSchema.parse(item({ kind: "Epic" }))).toThrow();
    expect(() => createQuestMnemonsInputSchema.parse(item({ objectives: [{ text: "x", state: "complete" }] }))).toThrow();
    expect(() => createQuestMnemonsInputSchema.parse(item({ rewards: [{ kind: "gold", amount: 5 }] }))).toThrow();
  });
});

describe("updateQuestMnemons", () => {
  it("passes an empty link through, so the WebAPI removes it, without a title lookup", async () => {
    argoPatch.mockResolvedValueOnce(created("The Crown"));
    await updateQuestMnemons({
      campaignId: CAMPAIGN,
      items: [{ entryId: QUEST_HEX, giverId: "", locationId: "", parentQuestId: "", hook: "" }],
    });

    expect(argoGet).not.toHaveBeenCalled();
    expect(sentItem(argoPatch)).toMatchObject({ entryId: QUEST_HEX, giverId: "", locationId: "", parentQuestId: "", hook: "" });
  });

  it("resolves the quest's title among quests only, and names objectives by id", async () => {
    argoGet.mockResolvedValueOnce([
      { entryId: NPC_HEX, title: "The Crown", type: "NPC" },
      { entryId: QUEST_HEX, title: "The Crown", type: "Quest" },
    ]);
    argoPatch.mockResolvedValueOnce(created("The Crown"));
    await updateQuestMnemons({
      campaignId: CAMPAIGN,
      items: [
        {
          entryId: "The Crown",
          status: "Completed",
          objectives: [{ id: "obj-1", text: "Find the three shards", state: "done" }, { text: "Crown the heir" }],
        },
      ],
    });

    expect(sentItem(argoPatch)).toMatchObject({
      entryId: QUEST_HEX,
      status: "Completed",
      objectives: [{ id: "obj-1", text: "Find the three shards", state: "done" }, { text: "Crown the heir" }],
    });
  });

  it("has no markdown field: a quest's prose is rewritten through background and gmNotes", () => {
    expect(Object.keys(updateQuestMnemonsInputSchema.shape.items.element.shape)).not.toContain("markdown");
  });
});

describe("setQuestObjectiveState", () => {
  const crown = {
    entryId: QUEST_HEX,
    title: "The Crown",
    type: "Quest",
    blocks: [],
    quest: {
      status: "Active",
      kind: "Main",
      playersCanTick: true,
      objectives: [{ id: "obj-1", text: "Find the three shards", state: "done", optional: false, depth: 0 }],
      progress: { done: 1, total: 1 },
      rewardTotals: { currency: [], xp: null },
    },
  };

  it("PATCHes the objective by id and returns the quest with its progress recounted", async () => {
    argoPatch.mockResolvedValueOnce(crown);
    const entry = await setQuestObjectiveState({
      campaignId: CAMPAIGN,
      entryId: QUEST_HEX,
      objectiveId: "obj-1",
      state: "done",
    });

    expect(argoPatch).toHaveBeenCalledWith(
      `/mcp/v1/campaigns/${CAMPAIGN}/mnemons/${QUEST_HEX}/objectives/obj-1`,
      { state: "done" }
    );
    expect(entry.quest?.progress).toEqual({ done: 1, total: 1 });
    // What the WebAPI answers must satisfy the tool's advertised output schema.
    expect(() => mnemonEntryOutputSchema.parse(entry)).not.toThrow();
  });

  it("resolves the quest by title among quests only", async () => {
    argoGet.mockResolvedValueOnce([
      { entryId: NPC_HEX, title: "The Crown", type: "NPC" },
      { entryId: QUEST_HEX, title: "The Crown", type: "Quest" },
    ]);
    argoPatch.mockResolvedValueOnce(crown);
    await setQuestObjectiveState({ campaignId: CAMPAIGN, entryId: "The Crown", objectiveId: "obj-1", state: "open" });

    expect(argoPatch.mock.calls[0][0]).toBe(`/mcp/v1/campaigns/${CAMPAIGN}/mnemons/${QUEST_HEX}/objectives/obj-1`);
  });

  it("names the objective, not the entry, when the WebAPI finds no objective the user can see", async () => {
    argoPatch.mockRejectedValueOnce(
      new client.ArgoApiError(
        404,
        '{"status":404,"error":"Quest objective not found","code":"QUEST_OBJECTIVE_NOT_FOUND"}',
        "Argo API error 404"
      )
    );

    await expect(
      setQuestObjectiveState({ campaignId: CAMPAIGN, entryId: QUEST_HEX, objectiveId: "obj-9", state: "done" })
    ).rejects.toThrow(/no objective "obj-9" that you can see/);
  });

  it("passes any other refusal through as the WebAPI worded it", async () => {
    const refusal = new client.ArgoApiError(
      403,
      '{"status":403,"error":"The GM has not let players tick this quest\'s objectives","code":"QUEST_TICKING_OFF"}',
      "Argo API error 403"
    );
    argoPatch.mockRejectedValueOnce(refusal);

    await expect(
      setQuestObjectiveState({ campaignId: CAMPAIGN, entryId: QUEST_HEX, objectiveId: "obj-1", state: "done" })
    ).rejects.toBe(refusal);
  });
});

describe("describeMnemonTypes — quests", () => {
  it("documents the doc-based quest's typed fields and vocabularies", () => {
    const { questBody } = describeMnemonTypes() as {
      questBody: {
        header: { fields: string[]; statusValues: string[]; kindValues: string[] };
        objective: { fields: string[]; stateValues: string[] };
        reward: { fields: string[]; kindValues: string[] };
      };
    };

    expect(questBody.header.fields).toEqual(
      expect.arrayContaining(["status", "kind", "playersCanTick", "hook", "giverId", "locationId", "parentQuestId"])
    );
    expect(questBody.header.statusValues).toEqual(["Available", "Active", "Completed", "Failed"]);
    expect(questBody.header.kindValues).toEqual(["Main", "Side", "Personal"]);
    expect(questBody.objective.stateValues).toEqual(["open", "done", "failed"]);
    expect(questBody.reward.kindValues).toEqual(["currency", "xp", "item", "other"]);
  });

  it("offers the quest giver and quest location links the WebAPI accepts", () => {
    const { relationshipLabels, relationships } = describeMnemonTypes() as {
      relationshipLabels: string[];
      relationships: Array<{ source: string; label: string; target: string }>;
    };

    expect(relationshipLabels).toEqual(expect.arrayContaining(["QUEST_GIVER", "QUEST_LOCATION"]));
    expect(relationships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "Quest", label: "QUEST_GIVER", target: "NPC" }),
        expect.objectContaining({ source: "Quest", label: "QUEST_LOCATION", target: "Location" }),
      ])
    );
  });
});

describe("createPlayerMnemons", () => {
  it("resolves title-form parentEntryId of type Player", async () => {
    argoGet.mockResolvedValueOnce([{ entryId: ENTRY, title: "The Misfits", type: "Player" }]);
    argoPost.mockResolvedValueOnce({ results: [{ index: 0, success: true, entryId: NPC_HEX, title: "Maelen" }] });
    await createPlayerMnemons({
      campaignId: CAMPAIGN,
      items: [
        {
          title: "Maelen",
          markdown: "x",
          playerKind: "CHARACTER",
          parentEntryId: "The Misfits",
          partyId: "party-id",
          characterId: "char-id",
        },
      ],
    });
    const body = argoPost.mock.calls[0][1] as { items: Array<{ parentEntryId: string }> };
    expect(body.items[0].parentEntryId).toBe(ENTRY);
  });
});

// ---------------------------------------------------------------------------
// Per-type update tools
// ---------------------------------------------------------------------------

describe("updateNpcMnemons", () => {
  it("PATCHes /mnemons/npc with items[]", async () => {
    argoPatch.mockResolvedValueOnce({ results: [{ index: 0, success: true, entryId: ENTRY, title: "Goblin" }] });
    await updateNpcMnemons({
      campaignId: CAMPAIGN,
      items: [{ entryId: ENTRY, visibility: "PUBLIC" }],
    });
    expect(argoPatch).toHaveBeenCalledWith(
      expect.stringMatching(/\/mnemons\/npc$/),
      expect.objectContaining({
        items: expect.arrayContaining([expect.objectContaining({ entryId: ENTRY, visibility: "PUBLIC" })]),
      })
    );
  });

  it("resolves title-form entryId before PATCH", async () => {
    argoGet.mockResolvedValueOnce([{ entryId: NPC_HEX, title: "Goblin", type: "NPC" }]);
    argoPatch.mockResolvedValueOnce({ results: [{ index: 0, success: true, entryId: NPC_HEX, title: "Goblin" }] });
    await updateNpcMnemons({
      campaignId: CAMPAIGN,
      items: [{ entryId: "Goblin", sheetId: "sheet-1" }],
    });
    const body = argoPatch.mock.calls[0][1] as { items: Array<{ entryId: string; sheetId: string }> };
    expect(body.items[0].entryId).toBe(NPC_HEX);
    expect(body.items[0].sheetId).toBe("sheet-1");
  });
});

// ---------------------------------------------------------------------------
// update_mnemons_content
// ---------------------------------------------------------------------------

describe("updateMnemonsContent", () => {
  it("POSTs to /mnemons/content with ops array", async () => {
    argoPost.mockResolvedValueOnce({ results: [{ index: 0, success: true, entryId: ENTRY }] });
    await updateMnemonsContent({
      campaignId: CAMPAIGN,
      items: [
        {
          entryId: ENTRY,
          ops: [
            { op: "append", markdown: "**hello**" },
            { op: "remove", blockId: "old-block-id" },
          ],
        },
      ],
    });
    expect(argoPost).toHaveBeenCalledWith(
      expect.stringMatching(/\/mnemons\/content$/),
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({
            entryId: ENTRY,
            ops: expect.arrayContaining([
              expect.objectContaining({ op: "append", markdown: "**hello**" }),
              expect.objectContaining({ op: "remove", blockId: "old-block-id" }),
            ]),
          }),
        ]),
      })
    );
  });

  it("resolves title-form entryId before posting ops", async () => {
    argoGet.mockResolvedValueOnce([{ entryId: ENTRY, title: "The Misfits", type: "Player" }]);
    argoPost.mockResolvedValueOnce({ results: [{ index: 0, success: true, entryId: ENTRY }] });
    await updateMnemonsContent({
      campaignId: CAMPAIGN,
      items: [
        {
          entryId: "The Misfits",
          ops: [{ op: "append", markdown: "x" }],
        },
      ],
    });
    const body = argoPost.mock.calls[0][1] as { items: Array<{ entryId: string }> };
    expect(body.items[0].entryId).toBe(ENTRY);
  });
});
