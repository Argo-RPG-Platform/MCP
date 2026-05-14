# ChatGPT App Submission

This repo already exposes the HTTP and OAuth surfaces needed for a ChatGPT-hosted MCP app at `https://mcp.argo.games`.

## Public endpoints

- MCP endpoint: `https://mcp.argo.games/mcp`
- Legacy SSE transport: `https://mcp.argo.games/sse` and `https://mcp.argo.games/messages`
- OAuth authorization server metadata: `https://mcp.argo.games/.well-known/oauth-authorization-server`
- OIDC discovery: `https://mcp.argo.games/.well-known/openid-configuration`
- OAuth protected resource metadata: `https://mcp.argo.games/.well-known/oauth-protected-resource`
- Dynamic client registration: `https://mcp.argo.games/oauth/register`
- OpenAI domain verification: `https://mcp.argo.games/.well-known/openai-apps-challenge`
- Health check: `https://mcp.argo.games/health`

## Required runtime configuration

- `MCP_BASE_URL=https://mcp.argo.games`
- `ARGO_OAUTH_BASE=https://oauth.argo.games`
- `WEBAPI_BASE=https://api.argo.games`
- `OPENAI_CHALLENGE_TOKEN=<token provided by OpenAI>`

## OAuth behavior

- The app advertises `authorization_code` and `refresh_token` grant types.
- PKCE `S256` is supported.
- Dynamic client registration is exposed on the MCP domain and proxied to Argo WebAPI.
- Discovery metadata republishes `scopes_supported` on the MCP domain so ChatGPT can render base/resource scopes correctly during app registration.

## Scopes exposed by discovery

- Base scopes: `openid`, `offline_access`
- Resource scopes: `campaign.read`, `campaign.write`, `campaign.create`, `guild.read`, `guild.write`, `guild.admin`, `friends.read`, `friends.write`, `invite.write`, `forum.read`, `forum.write`

## Review notes

- Tokens are not embedded in the app; ChatGPT performs OAuth against Argo.
- The registration endpoint is rate-limited at the MCP edge before forwarding to WebAPI.
- Protected-resource metadata points clients back to the MCP domain so they discover the DCR-enabled authorization-server metadata instead of Hydra's raw metadata.
- Domain verification is served as plain text from `/.well-known/openai-apps-challenge` when `OPENAI_CHALLENGE_TOKEN` is configured.

## Submission checklist

- Set `OPENAI_CHALLENGE_TOKEN` in the deployed environment.
- Confirm `/.well-known/openai-apps-challenge` returns the exact token.
- Confirm `/.well-known/oauth-authorization-server` returns `registration_endpoint=https://mcp.argo.games/oauth/register`.
- Confirm `/.well-known/openid-configuration` returns non-empty `scopes_supported`.
- Confirm `/.well-known/oauth-protected-resource` advertises `authorization_servers: ["https://mcp.argo.games"]`.
- Confirm `/health` returns `200`.
