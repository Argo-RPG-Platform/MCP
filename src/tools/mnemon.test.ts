import { vi, describe, it, expect, beforeEach } from "vitest";

// Mock the client before importing the module under test
vi.mock("../client.js", () => ({
  argoPost: vi.fn(),
  argoGet: vi.fn(),
  argoPatch: vi.fn(),
}));

import { createMnemon, updateMnemon, describeMnemonTypes } from "./mnemon.js";
import * as client from "../client.js";

const argoPost = vi.mocked(client.argoPost);
const argoPatch = vi.mocked(client.argoPatch);

const CAMPAIGN = "camp-123";
const ENTRY = "entry-456";

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
    await createMnemon({ campaignId: CAMPAIGN, title: "The Faction", type: "NPC", npcType: "faction" });
    expect(argoPost).toHaveBeenCalledWith(
      expect.stringContaining(CAMPAIGN),
      expect.objectContaining({ type: "NPC", npcType: "faction" })
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
    await updateMnemon({ campaignId: CAMPAIGN, entryId: ENTRY, npcType: "guard" });
    const payload = argoPatch.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.npcType).toBe("guard");
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
});
