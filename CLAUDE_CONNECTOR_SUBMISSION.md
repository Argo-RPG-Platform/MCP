# Anthropic Connector Submission — Argo MCP

This document captures everything Anthropic reviewers need to verify the Argo MCP server (`https://mcp.argo.games`) for inclusion as an official Connector in Claude.

## Public endpoints

- MCP endpoint (Streamable HTTP): `https://mcp.argo.games/mcp`
- OAuth authorization server metadata: `https://mcp.argo.games/.well-known/oauth-authorization-server`
- OAuth protected resource metadata: `https://mcp.argo.games/.well-known/oauth-protected-resource`
- OIDC discovery: `https://mcp.argo.games/.well-known/openid-configuration`
- Dynamic Client Registration (RFC 7591): `https://mcp.argo.games/oauth/register`
- Self-describing manifest: `https://mcp.argo.games/.well-known/argo-mcp.json`
- Health check: `https://mcp.argo.games/health`

## Technical-requirements checklist

| Anthropic requirement | Status | Evidence |
|---|---|---|
| Streamable HTTP transport | ✅ | `StreamableHTTPServerTransport` mounted at `POST/GET/DELETE /mcp` in `src/http.ts`; SSE retained only as a legacy alias |
| Tool annotations (`readOnlyHint` / `destructiveHint`) on every tool | ✅ | All 45 tools registered with one of three constants — `READ_ONLY`, `WRITE_SAFE`, `WRITE_DESTRUCTIVE` — in `src/server.ts` (~line 183) |
| Tool result ≤ 25,000 tokens | ✅ | Central `capToolResult` wrapper in `src/server.ts` enforces a 25,000-token (≈100,000 char) cap on every tool's return; oversized results are replaced with a truncation hint and `isError: true` |
| Tool handler ≤ 300 s | ✅ | `enforceMcpTimeout` Express middleware in `src/http.ts` (`MCP_HANDLER_TIMEOUT_MS = 5 * 60 * 1000`) returns a JSON-RPC `-32001` error if a request exceeds 300 s |
| OAuth + user consent | ✅ | Authorization Code + PKCE S256 against Argo's Ory Hydra (`oauth.argo.games`); refresh-token grant supported; DCR proxied to WebAPI |
| Redirect URIs allowlisted | ✅ | Verified end-to-end — the Argo MCP is already in use as a custom Claude connector via `https://claude.ai/api/mcp/auth_callback` and `https://claude.com/api/mcp/auth_callback`. DCR accepts both per-client. |
| Public HTTPS URL | ✅ | Deployed on Google Cloud Run at `https://mcp.argo.games` with managed TLS |
| Privacy Policy | ✅ | README `## Privacy Policy` section + `privacy_policies: ["https://argo.games/policies/privacy-policy"]` in manifest (`manifest_version: "0.2"`) |

## OAuth scopes

- Base: `openid`, `offline_access`
- Resource: `campaign.read`, `campaign.write`, `campaign.create`, `guild.read`, `guild.write`, `guild.admin`, `friends.read`, `friends.write`, `invite.write`, `forum.read`, `forum.write`

Anthropic reviewers should be granted the read scopes plus `campaign.write` and `forum.write` to exercise both read and write tool paths.

## Test account for Anthropic reviewers

Provided out-of-band with the submission (do not commit credentials). The test account is provisioned with:

- A seed campaign with sample mnemons (lore, NPC, location, quest, journal, session summary)
- Membership in a sandbox guild
- A pre-created forum topic to exercise `forum_read_topic` / `forum_reply`

Request credentials from `support@argo.games`.

## Privacy

- Hosted policy: `https://argo.games/policies/privacy-policy`
- README summary: see `## Privacy Policy` section in `README.md`
- Manifest field: `privacy_policies` array in `/.well-known/argo-mcp.json`

## Required runtime configuration

Same as the ChatGPT submission (see `CHATGPT_APP_SUBMISSION.md`):

- `MCP_BASE_URL=https://mcp.argo.games`
- `ARGO_OAUTH_BASE=https://oauth.argo.games`
- `WEBAPI_BASE=https://api.argo.games`

No Anthropic-specific environment variables are required.

## Verification commands

```bash
# Transport + discovery
curl -s https://mcp.argo.games/health
curl -s https://mcp.argo.games/.well-known/argo-mcp.json | jq '.manifest_version, .privacy_policies'

# OAuth metadata
curl -s https://mcp.argo.games/.well-known/oauth-authorization-server | jq
curl -s https://mcp.argo.games/.well-known/oauth-protected-resource    | jq
```

Expected: `manifest_version: "0.2"`, `privacy_policies: ["https://argo.games/policies/privacy-policy"]`, `registration_endpoint: "https://mcp.argo.games/oauth/register"`.
