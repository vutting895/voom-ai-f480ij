# VOOM Hybrid AI Runtime — Development Proposal

**Status:** Development slice / not production approved  
**Base:** `main@1a5df0780fe7899f99155a953e79906efef16de6`  
**Branch:** `feature/hybrid-ai-runtime-ollama-agents`

## Responsibility boundaries

- **Ollama:** model runtime and API server for local/open-weight models. It is not an agent framework and does not provide VOOM's authorization policy.
- **OpenAI Agents SDK:** agent orchestration primitives (agents, tools, handoffs, guardrails, sessions, tracing). It does not host model weights.
- **VOOM Model Gateway:** provider selection, request validation, timeouts, normalized responses, explicit fallback policy, and provider observability.
- **Existing Node/Express backend:** remains intact during this slice. The new gateway is an isolated module and is not wired into the existing `/api/chat` route yet.
- **Python Agent Service:** separate internal service using Agents SDK and Ollama's OpenAI-compatible Chat Completions endpoint.

## Initial implementation

The Node gateway provides an Ollama adapter and a provider router. Fallback is opt-in and only occurs for explicitly retryable provider failures (network/timeout, rate limit, or upstream 5xx). Client-side 4xx errors and malformed provider responses do not trigger fallback. The Python service starts with a single local agent and no tools, handoffs, memory writes, or trading permissions. SDK tracing is disabled by default.

## Security and operational constraints

1. Bind local services to loopback during development. Do not expose Ollama's unauthenticated local API to the public internet.
2. Keep provider keys in environment secrets; never commit credentials.
3. Apply authentication, tenant authorization, rate limits, request-size limits, and audit logging before exposing internal endpoints.
4. Do not pass untrusted model output directly to tools or execution systems.
5. Human approval must be enforced by the application authorization layer, not by model instructions.
6. No broker adapters, order tools, live execution, production database changes, deployment, or Main merge are included.

## Deferred work / acceptance gates

- OpenAI cloud adapter and Gemini adapter with normalized error/usage semantics.
- Agent tool registry, handoffs, guardrails, durable sessions, and memory integration.
- Explicit human-approval workflow and auditable action lifecycle.
- Integration tests against a disposable Ollama instance and a mock OpenAI-compatible server.
- Authentication and tenant isolation between the existing backend and Python service.
- Python dependency installation/import tests, live Ollama integration, load tests, provider capability matrix, and security review.

## Validation status

GitHub Actions run [#43](https://github.com/vutting895/voom-ai-f480ij/actions/runs/45537373472) completed successfully on the feature branch:
- Node 22: `npm install --ignore-scripts`, `npm test`, and `npm run build` passed.
- Python 3.12: `python -m compileall -q services/agent-python/app` passed.

The Python dependencies were not installed by this workflow, so this is syntax validation only—not proof that the Agents SDK service imports or runs. Live Ollama inference has not been tested. Do not treat this slice as production-ready.
