import { vi, describe, it, expect, beforeEach } from "vitest";

// Mock the underlying client; idResolution calls listMnemons → argoGet.
vi.mock("../client.js", () => ({
  argoGet: vi.fn(),
  argoPost: vi.fn(),
  argoPatch: vi.fn(),
  argoDelete: vi.fn(),
}));

import * as client from "../client.js";
import { MnemonResolver, MnemonResolutionError, isHexEntryId } from "./idResolution.js";
import type { MnemonSummary } from "./mnemon.js";

const argoGet = vi.mocked(client.argoGet);

const CAMPAIGN = "camp-123";
const PARTY_HEX = "D28D20AE5132402EBAA4859A84160751";
const NPC_HEX = "AAAA0000BBBB1111CCCC2222DDDD3333";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("isHexEntryId", () => {
  it("accepts uppercase 32-char hex", () => {
    expect(isHexEntryId(PARTY_HEX)).toBe(true);
  });
  it("accepts lowercase 32-char hex", () => {
    expect(isHexEntryId(PARTY_HEX.toLowerCase())).toBe(true);
  });
  it("rejects strings of the wrong length", () => {
    expect(isHexEntryId(PARTY_HEX.slice(0, 31))).toBe(false);
    expect(isHexEntryId(PARTY_HEX + "0")).toBe(false);
  });
  it("rejects non-hex characters", () => {
    expect(isHexEntryId("Z" + PARTY_HEX.slice(1))).toBe(false);
    expect(isHexEntryId("Outsiders")).toBe(false);
    expect(isHexEntryId("")).toBe(false);
  });
});

describe("MnemonResolver.resolve", () => {
  it("passes hex IDs through without listing", async () => {
    const resolver = new MnemonResolver(CAMPAIGN);
    const result = await resolver.resolve(PARTY_HEX, { fieldLabel: "partyId" });
    expect(result).toBe(PARTY_HEX);
    expect(argoGet).not.toHaveBeenCalled();
  });

  it("uppercases lowercase hex IDs to match WebAPI's stored shape", async () => {
    const resolver = new MnemonResolver(CAMPAIGN);
    const result = await resolver.resolve(PARTY_HEX.toLowerCase(), { fieldLabel: "partyId" });
    expect(result).toBe(PARTY_HEX);
  });

  it("resolves a title to its hex entryId", async () => {
    const summaries: MnemonSummary[] = [
      { entryId: PARTY_HEX, title: "Outsiders", type: "Player" },
      { entryId: NPC_HEX, title: "Some NPC", type: "NPC" },
    ];
    argoGet.mockResolvedValueOnce(summaries);

    const resolver = new MnemonResolver(CAMPAIGN);
    const result = await resolver.resolve("Outsiders", { type: "Player", fieldLabel: "partyId" });
    expect(result).toBe(PARTY_HEX);
  });

  it("filters by type when resolving titles", async () => {
    const summaries: MnemonSummary[] = [
      { entryId: PARTY_HEX, title: "Crew", type: "Player" },
      { entryId: NPC_HEX, title: "Crew", type: "NPC" },
    ];
    argoGet.mockResolvedValueOnce(summaries);

    const resolver = new MnemonResolver(CAMPAIGN);
    const result = await resolver.resolve("Crew", { type: "NPC", fieldLabel: "memberNpcEntryIds" });
    expect(result).toBe(NPC_HEX);
  });

  it("falls back to case-insensitive match when no exact match", async () => {
    argoGet.mockResolvedValueOnce([
      { entryId: PARTY_HEX, title: "Outsiders", type: "Player" },
    ]);
    const resolver = new MnemonResolver(CAMPAIGN);
    const result = await resolver.resolve("outsiders", { type: "Player", fieldLabel: "partyId" });
    expect(result).toBe(PARTY_HEX);
  });

  it("throws MnemonResolutionError on miss", async () => {
    argoGet.mockResolvedValueOnce([]);
    const resolver = new MnemonResolver(CAMPAIGN);
    await expect(
      resolver.resolve("Nope", { type: "Player", fieldLabel: "partyId" })
    ).rejects.toBeInstanceOf(MnemonResolutionError);
  });

  it("throws MnemonResolutionError listing candidates on ambiguity", async () => {
    const otherHex = "1111222233334444555566667777FFFF";
    argoGet.mockResolvedValueOnce([
      { entryId: PARTY_HEX, title: "Outsiders", type: "Player" },
      { entryId: otherHex, title: "Outsiders", type: "Player" },
    ]);
    const resolver = new MnemonResolver(CAMPAIGN);
    await expect(
      resolver.resolve("Outsiders", { type: "Player", fieldLabel: "partyId" })
    ).rejects.toThrow(/matches 2 mnemons/);
    await expect(
      resolver.resolve("Outsiders", { type: "Player", fieldLabel: "partyId" })
    ).rejects.toThrow(PARTY_HEX);
  });

  it("caches the list call across multiple resolves", async () => {
    argoGet.mockResolvedValueOnce([
      { entryId: PARTY_HEX, title: "Outsiders", type: "Player" },
      { entryId: NPC_HEX, title: "Goblin", type: "NPC" },
    ]);
    const resolver = new MnemonResolver(CAMPAIGN);
    await resolver.resolve("Outsiders", { fieldLabel: "partyId" });
    await resolver.resolve("Goblin", { fieldLabel: "targetEntryId" });
    expect(argoGet).toHaveBeenCalledTimes(1);
  });
});

describe("MnemonResolver.resolveOptional", () => {
  it("returns undefined when value is undefined without listing", async () => {
    const resolver = new MnemonResolver(CAMPAIGN);
    const result = await resolver.resolveOptional(undefined, { fieldLabel: "partyId" });
    expect(result).toBeUndefined();
    expect(argoGet).not.toHaveBeenCalled();
  });

  it("delegates to resolve when value is present", async () => {
    argoGet.mockResolvedValueOnce([{ entryId: PARTY_HEX, title: "Outsiders", type: "Player" }]);
    const resolver = new MnemonResolver(CAMPAIGN);
    const result = await resolver.resolveOptional("Outsiders", {
      type: "Player",
      fieldLabel: "partyId",
    });
    expect(result).toBe(PARTY_HEX);
  });
});

describe("MnemonResolver.resolveArray", () => {
  it("returns undefined for undefined input", async () => {
    const resolver = new MnemonResolver(CAMPAIGN);
    const result = await resolver.resolveArray(undefined, { fieldLabel: "memberNpcEntryIds" });
    expect(result).toBeUndefined();
  });

  it("resolves each element, indexing field labels for error context", async () => {
    const npcA = "AAAA1111AAAA1111AAAA1111AAAA1111";
    const npcB = "BBBB2222BBBB2222BBBB2222BBBB2222";
    argoGet.mockResolvedValueOnce([
      { entryId: npcA, title: "Goblin Boss", type: "NPC" },
      { entryId: npcB, title: "Goblin Scout", type: "NPC" },
    ]);
    const resolver = new MnemonResolver(CAMPAIGN);
    const result = await resolver.resolveArray(["Goblin Boss", npcB], {
      type: "NPC",
      fieldLabel: "memberNpcEntryIds",
    });
    expect(result).toEqual([npcA, npcB]);
  });

  it("propagates indexed error when one element fails to resolve", async () => {
    argoGet.mockResolvedValueOnce([{ entryId: PARTY_HEX, title: "Outsiders", type: "Player" }]);
    const resolver = new MnemonResolver(CAMPAIGN);
    await expect(
      resolver.resolveArray(["Outsiders", "Nonexistent"], {
        type: "Player",
        fieldLabel: "memberNpcEntryIds",
      })
    ).rejects.toThrow(/memberNpcEntryIds\[1\]/);
  });
});
