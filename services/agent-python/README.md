# VOOM Agent Service (development)

A separate Python service for OpenAI Agents SDK orchestration. The initial vertical slice uses Ollama's OpenAI-compatible Chat Completions endpoint. It intentionally exposes no tools, handoffs, broker connectivity, or execution permissions.

## Run locally

```bash
python -m venv .venv
# Windows PowerShell: .venv\\Scripts\\Activate.ps1
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
# Generate a local random token of at least 32 characters; do not reuse a production credential.
$env:VOOM_AGENT_API_TOKEN = "replace-with-a-random-32-plus-character-local-token"
$env:OLLAMA_BASE_URL = "http://127.0.0.1:11434/v1"
$env:OLLAMA_MODEL = "qwen3:8b"
uvicorn app.main:app --host 127.0.0.1 --port 8100
```

Start Ollama separately and pull the model you have capacity to run. The model name is configurable; do not assume qwen3:8b fits every machine.

## API

- `GET /health` — public liveness endpoint; does not run inference.
- `POST /v1/agent/run` with JSON `{"input":"...","task":"chat"}` and `Authorization: Bearer <VOOM_AGENT_API_TOKEN>`.
- The run endpoint fails closed with HTTP 503 if the service token is absent or shorter than 32 characters; missing or invalid bearer tokens receive HTTP 401.
- Successful and rejected run requests carry an `X-Request-ID` response header. Audit logs include the request ID and outcome, not prompts or bearer tokens.
- A per-process fixed-window rate limiter is included for Dev/Test only. It is not a distributed production rate limiter.
- Request body size and prompt length are bounded.

## Security boundary

The bearer token authenticates a trusted service caller only. It does **not** authenticate individual Supabase users, establish tenant membership, or provide tenant isolation. The endpoint must remain bound to loopback and must not be exposed to browsers or public networks. Before any network exposure, integrate it behind the existing authenticated Node gateway using a reviewed service-to-service identity and trusted user/tenant context; never accept caller-supplied user or tenant identifiers as authorization evidence.

The Ollama base URL is trusted configuration, not request input. Loopback HTTP is allowed by default. A remote provider host requires an explicit `OLLAMA_ALLOWED_HOSTS` entry and HTTPS. Keep Ollama itself on loopback unless a separate authenticated network boundary is reviewed.

Tracing is disabled by default to prevent conversation content being exported to an external tracing service. Sessions, durable memory, tool registry, handoffs, and approval workflows are intentionally deferred. No broker, order, production database, deployment, or live-trading permissions exist in this service.
