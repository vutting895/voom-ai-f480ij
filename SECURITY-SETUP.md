# VOOM AI Runtime — Development/Test Security Setup

The supported Node entrypoint is `server.js`. The legacy `sever.js` RAG server is disabled.

## Required server-side configuration

- `VOOM_API_AUTH_TOKEN`: required Bearer token for every `/api/*` route.
- `VOOM_ADMIN_TOKEN`: separate token required by `/api/security-status` administration.

If either token is missing, the corresponding API surface fails closed with HTTP 503. Never place either value in browser code, a repository, test fixture, log, or client-visible response.

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
