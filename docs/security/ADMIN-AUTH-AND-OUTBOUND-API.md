# Admin Authentication and Outbound API Security

**Status:** Development / Dev-Test only. This document does not authorize deployment or production exposure.

## Admin endpoint authentication

Both `GET /api/security-status` and `POST /api/security-status` require an Authorization Bearer access token issued by Supabase Auth.

The Node middleware sends the token to the configured Supabase Auth `/auth/v1/user` endpoint. It does not trust locally decoded JWT payloads, browser-supplied role fields, or `user_metadata`. Authorization is granted only when the Auth server returns `app_metadata.role === "admin"`.

Required server environment:

- `SUPABASE_URL`: the Supabase project URL.
- `SUPABASE_PUBLISHABLE_KEY`: recommended public publishable key, or `SUPABASE_ANON_KEY` for a legacy public anon key.

Do not place a Supabase secret/service-role key in a browser. The middleware does not require a service-role key. The project must assign `app_metadata.role=admin` through a trusted administrative operation; users must never be able to assign their own role through `user_metadata` or a client profile update.

**Frontend limitation:** the current static UI does not yet implement Supabase sign-in/session handling. Until that is implemented and sends a valid access token, its Admin UI calls will receive 401. This is an intentional fail-closed state, not a completed end-user admin workflow.

## Custom outbound API allowlist

The Custom API source is disabled unless the server configures:

- `VOOM_CUSTOM_API_HOSTS`: comma-separated exact hostnames, for example `api.example.com,feeds.example.net`.

Rules enforced by `safeExternalGet`:

- HTTPS only, port 443 only; URL credentials and IP-literal destinations are rejected.
- Exact hostname matching; wildcards are not supported.
- DNS is resolved to IPv4 and every returned address must be globally routable.
- The selected public IPv4 address is pinned for the TLS request to prevent a second DNS lookup from changing the destination.
- TLS certificate validation remains enabled and SNI uses the original hostname.
- Redirects are handled manually; each redirect target must independently pass the same host allowlist and DNS checks.
- Redirect count, request time, response size, headers, and method are bounded. Only GET is supported.
- IPv6-only destinations and non-standard ports are intentionally unsupported in this first security slice.

Built-in API sources have their own fixed host allowlists. A redirect to a host not explicitly allowed is rejected.

## Remaining gates

- Implement frontend Supabase sign-in, token refresh, logout, and Admin UI error handling.
- Confirm actual ingress/network controls before exposing the Express listener.
- Keep the Python Agent service loopback-only until user/tenant identity is forwarded over a separately authenticated service boundary.
- Complete independent review and Dev/Test integration tests before considering any production approval.

No production database migration, deployment, broker access, or live trading is part of this change.
