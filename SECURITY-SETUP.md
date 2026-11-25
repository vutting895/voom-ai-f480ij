# VOOM AI Runtime — Development/Test Security Setup

The supported Node entrypoint is `server.js`. The legacy `sever.js` RAG server is disabled.

## Required server-side configuration

- `SUPABASE_URL`: URL of the canonical Supabase project used by the client to issue access tokens.
- `SUPABASE_PUBLISHABLE_KEY`: publishable key for that same project. For legacy projects, `SUPABASE_ANON_KEY` is accepted as a compatibility fallback.
- `VOOM_ADMIN_TOKEN`: separate server-only token required by the simulated `/api/security-status` administration route.

Every `/api/*` request must include a Supabase Auth access token in `Authorization: Bearer <access-token>`. The server validates it with Supabase Auth `getUser(token)`; it does not trust a user ID, role, or tenant ID supplied in request JSON. If Supabase configuration is missing, the API fails closed with HTTP 503. Invalid or expired tokens receive HTTP 401. Auth-provider/network failures return HTTP 503.

Never expose the publishable key as a secret (it is designed for client use), and never expose service-role/secret keys or `VOOM_ADMIN_TOKEN` to browser code. The project URL and publishable key must match the project that issued the user's token.

## Tenant-isolation boundary

This runtime currently has no persistent tenant-owned database API. Verified user identity is attached to `req.user.id` and exposed through the read-only `GET /api/auth/me` diagnostic route. This is an authentication foundation, **not proof of tenant isolation**. Before adding tenant-owned persistence, define tenant membership and enforce ownership with Supabase RLS policies for every exposed table; do not trust caller-supplied `user_id` or `tenant_id`. Do not use `user_metadata` for authorization decisions.

## Outbound request policy

The AI tool registry permits only fixed provider URLs for its named data sources. Caller-supplied custom URL fetching has been removed. Do not reintroduce arbitrary URL fetching without SSRF controls and security review.

## Validation

```bash
npm install
npm test
npm run lint
npm run build
```

The build script currently performs Node syntax validation because this Express service has no compilation step. This is not a deployment or production-readiness certification.
