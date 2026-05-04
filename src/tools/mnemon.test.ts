import { vi, describe, it, expect, beforeEach } from "vitest";

// Mock the client before importing the module under test
vi.mock("../client.js", () => ({
  argoPost: vi.fn(),
  argoGet: vi.fn(),
  argoPatch: vi.fn(),
  argoDelete: vi.fn(),
}));

import {
  createMnemon,
  createMnemons,
  updateMnemon,
  createMnemonRelationship,
  describeMnemonTypes,
} from "./mnemon.js";
import * as client from "../client.js";

const argoPost = vi.mocked(client.argoPost);
const argoPatch = vi.mocked(client.argoPatch);
const argoGet = vi.mocked(client.argoGet);

const CAMPAIGN = "camp-123";
const ENTRY = "AAAA0000AAAA0000AAAA0000AAAA0000";
const PARTY_HEX = "D28D20AE5132402EBAA4859A84160751";
const NPC_HEX = "BBBB1111BBBB1111BBBB1111BBBB1111";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("describeMnemonTypes", () => {
  it("returns a types array", () => {
    const result = describeMnemonTypes() as { types: { type: string; typeSpecificFields: { name: string }[] }[] };
    expect(Array.isArray(result.types)).toBe(true);
  });

  it("includes NPC with npcType field", () => {
    const result = describeMnemonTypes() as { types: { type: string; typeSpecificFields: { name: string }[] }[] };
    const npc = result.types.find((t) => t.type === "NPC");
    expect(npc).toBeDefined();
    expect(npc!.typeSpecificFields.some((f) => f.name === "npcType")).toBe(true);
  });

  it("includes all expected types", () => {
    const result = describeMnemonTypes() as { types: { type: string }[] };
    const names = result.types.map((t) => t.type);
    expect(names).toContain("NPC");
    expect(names).toContain("Location");
    expect(names).toContain("Quest");
    expect(names).toContain("Journal");
    expect(names).toContain("SessionSummary");
    expect(names).toContain("Player");
    expect(names).toContain("Lore");
    expect(names).toContain("Archive");
    expect(names).toContain("Custom");
  });
});

describe("createMnemon", () => {
  it("defaults type to Custom when not provided", async () => {
    argoPost.mockResolvedValueOnce({ entryId: ENTRY, title: "Test", type: "Custom", blocks: [] });
    await createMnemon({ campaignId: CAMPAIGN, title: "Test" });
    expect(argoPost).toHaveBeenCalledWith(
      expect.stringContaining(CAMPAIGN),
      expect.objectContaining({ type: "Custom" })
    );
  });

  it("sends npcType for NPC mnemons", async () => {
    argoPost.mockResolvedValueOnce({ entryId: ENTRY, title: "The Faction", type: "NPC", blocks: [] });
    await createMnemon({ campaignId: CAMPAIGN, title: "The Faction", type: "NPC", npcType: "FACTION" });
    expect(argoPost).toHaveBeenCalledWith(
      expect.stringContaining(CAMPAIGN),
      expect.objectContaining({ type: "NPC", npcType: "FACTION" })
    );
  });

  it("sends questStatus for Quest mnemons", async () => {
    argoPost.mockResolvedValueOnce({ entryId: ENTRY, title: "A Quest", type: "Quest", blocks: [] });
    await createMnemon({ campaignId: CAMPAIGN, title: "A Quest", type: "Quest", questStatus: "active" });
    expect(argoPost).toHaveBeenCalledWith(
      expect.stringContaining(CAMPAIGN),
      expect.objectContaining({ type: "Quest", questStatus: "active" })
    );
  });

  it("sends levelId for Location mnemons", async () => {
    argoPost.mockResolvedValueOnce({ entryId: ENTRY, title: "The Town", type: "Location", blocks: [] });
    await createMnemon({ campaignId: CAMPAIGN, title: "The Town", type: "Location", levelId: "L_Town" });
    expect(argoPost).toHaveBeenCalledWith(
      expect.stringContaining(CAMPAIGN),
      expect.objectContaining({ levelId: "L_Town" })
    );
  });

  it("sends playerKind for Player mnemons", async () => {
    argoPost.mockResolvedValueOnce({ entryId: ENTRY, title: "Party Sheet", type: "Player", blocks: [] });
    await createMnemon({ campaignId: CAMPAIGN, title: "Party Sheet", type: "Player", playerKind: "PARTY" });
    expect(argoPost).toHaveBeenCalledWith(
      expect.stringContaining(CAMPAIGN),
      expect.objectContaining({ playerKind: "PARTY" })
    );
  });

  it("omits undefined type-specific fields from payload", async () => {
    argoPost.mockResolvedValueOnce({ entryId: ENTRY, title: "Basic", type: "Custom", blocks: [] });
    await createMnemon({ campaignId: CAMPAIGN, title: "Basic" });
    const payload = argoPost.mock.calls[0][1] as Record<string, unknown>;
    expect("npcType" in payload).toBe(false);
    expect("questStatus" in payload).toBe(false);
    expect("levelId" in payload).toBe(false);
  });

  it("sends visibility and tags when provided", async () => {
    argoPost.mockResolvedValueOnce({ entryId: ENTRY, title: "Hidden", type: "Lore", blocks: [] });
    await createMnemon({ campaignId: CAMPAIGN, title: "Hidden", type: "Lore", visibility: "HIDDEN", tags: ["secret"] });
    expect(argoPost).toHaveBeenCalledWith(
      expect.stringContaining(CAMPAIGN),
      expect.objectContaining({ visibility: "HIDDEN", tags: ["secret"] })
    );
  });
});

describe("updateMnemon", () => {
  it("sends only provided fields", async () => {
    argoPatch.mockResolvedValueOnce({ entryId: ENTRY, title: "Updated", type: "NPC", blocks: [] });
    await updateMnemon({ campaignId: CAMPAIGN, entryId: ENTRY, npcType: "INDIVIDUAL" });
    const payload = argoPatch.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.npcType).toBe("INDIVIDUAL");
    expect("title" in payload).toBe(false);
    expect("questStatus" in payload).toBe(false);
  });

  it("sends questStatus update", async () => {
    argoPatch.mockResolvedValueOnce({ entryId: ENTRY, title: "Quest", type: "Quest", blocks: [] });
    await updateMnemon({ campaignId: CAMPAIGN, entryId: ENTRY, questStatus: "completed" });
    expect(argoPatch).toHaveBeenCalledWith(
      expect.stringContaining(ENTRY),
      expect.objectContaining({ questStatus: "completed" })
    );
  });

  it("resolves a title-form entryId before PATCHing", async () => {
    argoGet.mockResolvedValueOnce([
      { entryId: ENTRY, title: "Beto's character", type: "Player" },
    ]);
    argoPatch.mockResolvedValueOnce({
      entryId: ENTRY,
      title: "Beto's character",
      type: "Player",
      blocks: [],
    });
    await updateMnemon({
      campaignId: CAMPAIGN,
      entryId: "Beto's character",
      content: "new content",
    });
    expect(argoPatch).toHaveBeenCalledWith(
      expect.stringContaining(ENTRY),
      expect.objectContaining({ content: "new content" })
    );
  });
});

describe("createMnemon — id-reference resolution", () => {
  it("resolves a title-form partyId to its hex entryId before POSTing", async () => {
    argoGet.mockResolvedValueOnce([
      { entryId: PARTY_HEX, title: "Outsiders", type: "Player" },
    ]);
    argoPost.mockResolvedValueOnce({
      entryId: ENTRY,
      title: "Beto's character",
      type: "Player",
      blocks: [],
    });
    await createMnemon({
      campaignId: CAMPAIGN,
      title: "Beto's character",
      type: "Player",
      playerKind: "CHARACTER",
      partyId: "Outsiders",
    });
    const payload = argoPost.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.partyId).toBe(PARTY_HEX);
  });

  it("passes hex partyId through without any list_mnemons call", async () => {
    argoPost.mockResolvedValueOnce({
      entryId: ENTRY,
      title: "Beto's character",
      type: "Player",
      blocks: [],
    });
    await createMnemon({
      campaignId: CAMPAIGN,
      title: "Beto's character",
      type: "Player",
      playerKind: "CHARACTER",
      partyId: PARTY_HEX,
    });
    expect(argoGet).not.toHaveBeenCalled();
    const payload = argoPost.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.partyId).toBe(PARTY_HEX);
  });

  it("rejects an unresolvable title with a clear error and does not POST", async () => {
    argoGet.mockResolvedValueOnce([]);
    await expect(
      createMnemon({
        campaignId: CAMPAIGN,
        title: "Beto's character",
        type: "Player",
        playerKind: "CHARACTER",
        partyId: "NoSuchParty",
      })
    ).rejects.toThrow(/partyId.*NoSuchParty/);
    expect(argoPost).not.toHaveBeenCalled();
  });

  it("filters partyId resolution to type=Player", async () => {
    const wrongTypeHex = "9999AAAA9999AAAA9999AAAA9999AAAA";
    argoGet.mockResolvedValueOnce([
      { entryId: PARTY_HEX, title: "Outsiders", type: "Player" },
      { entryId: wrongTypeHex, title: "Outsiders", type: "Lore" },
    ]);
    argoPost.mockResolvedValueOnce({
      entryId: ENTRY,
      title: "Beto's character",
      type: "Player",
      blocks: [],
    });
    await createMnemon({
      campaignId: CAMPAIGN,
      title: "Beto's character",
      type: "Player",
      playerKind: "CHARACTER",
      partyId: "Outsiders",
    });
    const payload = argoPost.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.partyId).toBe(PARTY_HEX);
  });

  it("resolves NPC array references with type=NPC filter", async () => {
    argoGet.mockResolvedValueOnce([
      { entryId: NPC_HEX, title: "Goblin Boss", type: "NPC" },
    ]);
    argoPost.mockResolvedValueOnce({
      entryId: ENTRY,
      title: "Goblin Tribe",
      type: "NPC",
      blocks: [],
    });
    await createMnemon({
      campaignId: CAMPAIGN,
      title: "Goblin Tribe",
      type: "NPC",
      npcType: "FACTION",
      memberNpcEntryIds: ["Goblin Boss"],
    });
    const payload = argoPost.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.memberNpcEntryIds).toEqual([NPC_HEX]);
  });
});

describe("createMnemons (bulk) — id-reference resolution", () => {
  it("uses one cached list_mnemons call across all items", async () => {
    argoGet.mockResolvedValueOnce([
      { entryId: PARTY_HEX, title: "Outsiders", type: "Player" },
    ]);
    argoPost.mockResolvedValueOnce({ results: [] });
    await createMnemons({
      campaignId: CAMPAIGN,
      items: [
        {
          title: "Char A",
          type: "Player",
          playerKind: "CHARACTER",
          partyId: "Outsiders",
        },
        {
          title: "Char B",
          type: "Player",
          playerKind: "CHARACTER",
          partyId: "Outsiders",
        },
      ],
    });
    expect(argoGet).toHaveBeenCalledTimes(1);
    const body = argoPost.mock.calls[0][1] as { items: Array<{ partyId?: string }> };
    expect(body.items[0].partyId).toBe(PARTY_HEX);
    expect(body.items[1].partyId).toBe(PARTY_HEX);
  });
});

describe("createMnemonRelationship — id-reference resolution", () => {
  it("resolves source and target titles to hex entryIds", async () => {
    argoGet.mockResolvedValueOnce([
      { entryId: PARTY_HEX, title: "Faction One", type: "NPC" },
      { entryId: NPC_HEX, title: "Goblin Boss", type: "NPC" },
    ]);
    argoPost.mockResolvedValueOnce({
      relationshipId: "rel-1",
      sourceId: PARTY_HEX,
      targetId: NPC_HEX,
      label: "MEMBER",
    });
    await createMnemonRelationship({
      campaignId: CAMPAIGN,
      sourceEntryId: "Faction One",
      targetEntryId: "Goblin Boss",
      label: "MEMBER",
    });
    const body = argoPost.mock.calls[0][1] as Record<string, unknown>;
    expect(body.sourceEntryId).toBe(PARTY_HEX);
    expect(body.targetEntryId).toBe(NPC_HEX);
  });
});
