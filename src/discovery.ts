/**
 * Public discovery surfaces for mcp.argo.games.
 *
 * Files served:
 *   /.well-known/argo-mcp.json   self-describing JSON manifest (also /mcp-manifest.json)
 *   /llms.txt                    llmstxt.org-style summary for LLM crawlers
 *   /sitemap.xml                 minimal sitemap of public URLs
 *   /robots.txt                  links crawlers to the sitemap
 *
 * No standardised MCP discovery format exists yet; the manifest shape is
 * pragmatic and tracks what Glama / MCP.so scrapers actually consume.
 *
 * The tool digest is built once at startup by connecting an in-process MCP
 * client to a fresh server instance and calling tools/list — this keeps the
 * manifest in lockstep with the real tool registrations + their readOnlyHint
 * annotations, with no hand-curated duplicate to drift.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "./server.js";

export interface ToolDigestEntry {
  name: string;
  description: string;
  read_only: boolean;
}

const BASE_SCOPES = ["openid", "offline_access"];
const RESOURCE_SCOPES = [
  "campaign.read", "campaign.write", "campaign.create",
  "guild.read", "guild.write", "guild.admin",
  "friends.read", "friends.write",
  "invite.write",
  "forum.read", "forum.write",
];

export async function buildToolDigest(): Promise<ToolDigestEntry[]> {
  const server = createServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "argo-mcp-manifest-builder", version: "1.0.0" });
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  try {
    const { tools } = await client.listTools();
    return tools
      .map((t) => ({
        name: t.name,
        description: (t.description ?? "").trim(),
        read_only: t.annotations?.readOnlyHint === true,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } finally {
    await client.close();
    await server.close();
  }
}

export interface ManifestOptions {
  mcpBase: string;
  oauthBase: string;
  tools: ToolDigestEntry[];
}

export function buildManifest(opts: ManifestOptions): Record<string, unknown> {
  return {
    manifest_version: "0.2",
    name: "Argo MCP Server",
    description:
      "Remote MCP server for the Argo TTRPG/VTT platform. Lets AI assistants " +
      "search and manage campaigns, mnemons (lore, NPCs, locations, quests, " +
      "journals, session summaries), sessions, guilds, friends, email " +
      "invitations, and the community forum.",
    vendor: "Argo Games",
    homepage: "https://argo.games",
    docs_url: "https://app.argo.games/docs/mcp",
    support_url: "https://github.com/Argo-RPG-Platform/MCP/issues",
    repository: "https://github.com/Argo-RPG-Platform/MCP",
    categories: ["games", "ttrpg", "worldbuilding", "campaign-management"],
    privacy_policies: ["https://argo.games/policies/privacy-policy"],
    remote_url: `${opts.mcpBase}/mcp`,
    sse_url: `${opts.mcpBase}/sse`,
    transports: ["streamable-http", "sse"],
    auth: {
      type: "oauth2",
      authorization_server: opts.oauthBase,
      authorization_server_metadata: `${opts.mcpBase}/.well-known/oauth-authorization-server`,
      protected_resource_metadata: `${opts.mcpBase}/.well-known/oauth-protected-resource`,
      registration_endpoint: `${opts.mcpBase}/oauth/register`,
      scopes_supported: [...BASE_SCOPES, ...RESOURCE_SCOPES],
    },
    tools: opts.tools,
    examples: [
      "What does my party know about the Red Oracle?",
      "Summarise last session and create a session summary mnemon for it.",
      "Create an NPC named Captain Veyl with a backstory tied to the Ashfall Wars.",
      "List all locations inside the city of Black Harbor.",
      "Find contradictions between my lore entries on the Iron Compact.",
    ],
  };
}

export function buildLlmsTxt(opts: { mcpBase: string; oauthBase: string }): string {
  return `# Argo MCP Server

> Remote MCP server connecting AI assistants to Argo — a TTRPG/VTT platform for
> running and remembering tabletop campaigns. Authenticated users can search
> their campaign lore, retrieve session context, and create or update mnemons
> (lore, NPCs, locations, quests, journals, session summaries) on their behalf.

## Endpoints
- MCP (Streamable HTTP): ${opts.mcpBase}/mcp
- MCP (SSE legacy):      ${opts.mcpBase}/sse
- OAuth AS metadata:     ${opts.mcpBase}/.well-known/oauth-authorization-server
- Protected resource:    ${opts.mcpBase}/.well-known/oauth-protected-resource
- Self-describing JSON:  ${opts.mcpBase}/.well-known/argo-mcp.json
- Gemini CLI manifest:   ${opts.mcpBase}/.well-known/gemini-extension.json

## Capabilities
- Campaigns: list, get, create, update; co-GM management.
- Mnemons (lore, NPCs, locations, quests, journals, archives, session summaries,
  player, custom): full CRUD plus relationship edges (MEMBER, ALLY, ENEMY,
  RIVAL, PARENT_OF, CONTAINS, LOCATED_IN).
- Sessions: list, get, create, update (calendar / scheduling).
- Guilds: members, roles, calendar events, campaign linking.
- Social: friends, friend requests, email invitations.
- Forum: categories, topics, replies, search, notifications.

## Auth
OAuth 2.0 via ${opts.oauthBase}. Dynamic Client Registration supported at
${opts.mcpBase}/oauth/register. Per-tool scopes are advertised in each tool's
\`_meta.securitySchemes\` over the MCP wire and in argo-mcp.json.

## Repository
https://github.com/Argo-RPG-Platform/MCP
`;
}

export function buildSitemapXml(opts: { mcpBase: string }): string {
  const urls = [
    "/",
    "/llms.txt",
    "/.well-known/argo-mcp.json",
    "/.well-known/oauth-authorization-server",
    "/.well-known/oauth-protected-resource",
    "/.well-known/openid-configuration",
    "/.well-known/gemini-extension.json",
  ];
  const body = urls
    .map((p) => `  <url><loc>${opts.mcpBase}${p}</loc></url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

export function buildRobotsTxt(opts: { mcpBase: string }): string {
  return `User-agent: *
Allow: /
Sitemap: ${opts.mcpBase}/sitemap.xml
`;
}
