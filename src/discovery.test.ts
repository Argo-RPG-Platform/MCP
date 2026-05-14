import { describe, expect, it } from "vitest";
import {
  buildLlmsTxt,
  buildManifest,
  buildRobotsTxt,
  buildSitemapXml,
  buildToolDigest,
} from "./discovery.js";

describe("discovery", () => {
  it("builds a tool digest from the live server registry", async () => {
    const tools = await buildToolDigest();
    // Sanity bounds — current server registers 36 tools; let the assertion
    // tolerate growth without forcing a brittle exact match.
    expect(tools.length).toBeGreaterThanOrEqual(30);
    const names = tools.map((t) => t.name);
    expect(names).toContain("list_campaigns");
    expect(names).toContain("create_mnemon_relationship");
    expect(names).toContain("forum_search");

    // Known read-only tools must be flagged as such.
    const listCampaigns = tools.find((t) => t.name === "list_campaigns")!;
    expect(listCampaigns.read_only).toBe(true);

    // Known write tools must NOT be flagged read_only.
    const createCampaign = tools.find((t) => t.name === "create_campaign")!;
    expect(createCampaign.read_only).toBe(false);

    // Sorted alphabetically for stable manifest output.
    expect([...names].sort()).toEqual(names);

    // Every tool carries a description string.
    for (const t of tools) expect(t.description.length).toBeGreaterThan(0);
  });

  it("builds a manifest with expected shape", () => {
    const manifest = buildManifest({
      mcpBase: "https://mcp.argo.games",
      oauthBase: "https://oauth.argo.games",
      tools: [{ name: "list_campaigns", description: "x", read_only: true }],
    });
    expect(manifest).toMatchObject({
      name: "Argo MCP Server",
      remote_url: "https://mcp.argo.games/mcp",
      transports: ["streamable-http", "sse"],
      auth: {
        type: "oauth2",
        authorization_server: "https://oauth.argo.games",
      },
    });
    expect(Array.isArray(manifest.tools)).toBe(true);
    expect((manifest.tools as unknown[]).length).toBe(1);
  });

  it("produces llms.txt with endpoints", () => {
    const out = buildLlmsTxt({
      mcpBase: "https://mcp.argo.games",
      oauthBase: "https://oauth.argo.games",
    });
    expect(out).toContain("# Argo MCP Server");
    expect(out).toContain("https://mcp.argo.games/mcp");
    expect(out).toContain("https://oauth.argo.games");
  });

  it("produces a sitemap and robots.txt", () => {
    const sitemap = buildSitemapXml({ mcpBase: "https://mcp.argo.games" });
    expect(sitemap).toContain('<?xml version="1.0"');
    expect(sitemap).toContain("https://mcp.argo.games/.well-known/argo-mcp.json");

    const robots = buildRobotsTxt({ mcpBase: "https://mcp.argo.games" });
    expect(robots).toContain("Sitemap: https://mcp.argo.games/sitemap.xml");
  });
});
