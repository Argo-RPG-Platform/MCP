import { vi, describe, it, expect, beforeEach } from "vitest";

// Mock the client before importing the module under test
vi.mock("../client.js", () => ({
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
  describeMnemonTypes,
  listMnemons,
  updateNpcMnemons,
  updateMnemonsContent,
  type MnemonSummary,
} from "./mnemon.js";
import * as client from "../client.js";

const argoPost = vi.mocked(client.argoPost);
const argoPatch = vi.mocked(client.argoPatch);
const argoGet = vi.mocked(client.argoGet);

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

  it("documents the HTML format and inline image rules", () => {
    const result = describeMnemonTypes() as { htmlFormat: { allowedInlineTags: string[]; images: { caps: string } } };
    expect(result.htmlFormat.allowedInlineTags).toEqual(
      expect.arrayContaining(["<b>", "<i>", "<a href>", "<img>"])
    );
    expect(result.htmlFormat.images.caps).toMatch(/5MB/);
  });

  it("documents the blockOps vocabulary", () => {
    const result = describeMnemonTypes() as { blockOps: { ops: { op: string }[] } };
    const ops = result.blockOps.ops.map((o) => o.op);
    expect(ops).toEqual(["append", "insertAfter", "replace", "remove"]);
  });
});

// ---------------------------------------------------------------------------
// listMnemons
// ---------------------------------------------------------------------------

describe("listMnemons", () => {
  it("returns first page when fewer than page-size results", async () => {
    const entries: MnemonSummary[] = [
      { entryId: ENTRY, title: "Town", type: "Location" },
    ];
    argoGet.mockResolvedValueOnce(entries);
    const result = await listMnemons({ campaignId: CAMPAIGN });
    expect(result).toEqual(entries);
    expect(argoGet).toHaveBeenCalledTimes(1);
  });

  it("paginates when results fill a page", async () => {
    const fullPage: MnemonSummary[] = Array.from({ length: 100 }, (_, i) => ({
      entryId: `id${i}`.padEnd(32, "0"),
      title: `entry-${i}`,
      type: "Lore",
    }));
    argoGet.mockResolvedValueOnce(fullPage).mockResolvedValueOnce([]);
    const result = await listMnemons({ campaignId: CAMPAIGN });
    expect(result).toHaveLength(100);
    expect(argoGet).toHaveBeenCalledTimes(2);
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
      items: [{ title: "Goblin", blocks: [{ type: "paragraph", content: "ugly" }], npcType: "INDIVIDUAL" }],
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
          blocks: [{ type: "paragraph", content: "x" }],
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
      items: [{ title: "Town", blocks: [{ type: "paragraph", content: "x" }], levelId: "L_Town" }],
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
          blocks: [{ type: "paragraph", content: "x" }],
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
          blocks: [{ type: "paragraph", content: "x" }],
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
          blocks: [{ type: "paragraph", content: "x" }],
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
            blocks: [{ type: "paragraph", content: "x" }],
            steps: [{ title: "x", status: "NotARealStatus" as unknown as "Available" }],
          },
        ],
      }),
    ).toThrow();
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
          blocks: [{ type: "paragraph", content: "x" }],
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
            { op: "append", blockType: "paragraph", text: "<b>hello</b>" },
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
              expect.objectContaining({ op: "append", blockType: "paragraph", text: "<b>hello</b>" }),
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
          ops: [{ op: "append", blockType: "paragraph", text: "x" }],
        },
      ],
    });
    const body = argoPost.mock.calls[0][1] as { items: Array<{ entryId: string }> };
    expect(body.items[0].entryId).toBe(ENTRY);
  });
});
