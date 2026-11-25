# VOOM Agent Service (development)

A separate Python service for OpenAI Agents SDK orchestration. The initial vertical slice uses Ollama's OpenAI-compatible Chat Completions endpoint. It intentionally exposes no tools, handoffs, broker connectivity, or execution permissions.

## Run locally

```bash
python -m venv .venv
# Windows PowerShell: .venv\\Scripts\\Activate.ps1
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
$env:VOOM_AGENT_API_TOKEN = "use-a-long-random-local-token"
$env:OLLAMA_BASE_URL = "http://127.0.0.1:11434/v1"
$env:OLLAMA_MODEL = "qwen3:8b"
uvicorn app.main:app --host 127.0.0.1 --port 8100
```

Start Ollama separately and pull the model you have capacity to run. The model name is configurable; do not assume qwen3:8b fits every machine.

## API

- `GET /health` — public liveness endpoint; does not run inference.
- `POST /v1/agent/run` with JSON `{"input":"...","task":"chat"}` and `Authorization: Bearer <VOOM_AGENT_API_TOKEN>`.
- The run endpoint fails closed with HTTP 503 when `VOOM_AGENT_API_TOKEN` is not configured and returns HTTP 401 for missing or invalid bearer tokens.

Tracing is disabled by default to prevent conversation content being exported to an external tracing service. Sessions, durable memory, tool registry, handoffs, and approval workflows are intentionally deferred until authentication, persistence, and authorization contracts are agreed. Keep the service bound to loopback until a separately reviewed network and service-to-service authorization boundary exists.
