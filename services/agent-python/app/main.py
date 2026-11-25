import logging
import os
import uuid
from typing import Literal

from agents import Agent, Runner, AsyncOpenAI, OpenAIChatCompletionsModel, set_tracing_disabled
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.security import RateLimiter, bearer_token_matches, validate_provider_url

APP_ENV = os.getenv("APP_ENV", "development")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434/v1")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen3:8b")
MAX_INPUT_CHARS = int(os.getenv("AGENT_MAX_INPUT_CHARS", "12000"))
MAX_BODY_BYTES = int(os.getenv("AGENT_MAX_BODY_BYTES", str(64 * 1024)))
AGENT_API_TOKEN = os.getenv("VOOM_AGENT_API_TOKEN", "")
RATE_LIMIT_REQUESTS = int(os.getenv("AGENT_RATE_LIMIT_REQUESTS", "30"))
RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("AGENT_RATE_LIMIT_WINDOW_SECONDS", "60"))

logger = logging.getLogger("voom.agent")
rate_limiter = RateLimiter(RATE_LIMIT_REQUESTS, RATE_LIMIT_WINDOW_SECONDS)

# The provider endpoint is trusted configuration, never a request parameter.
validate_provider_url(OLLAMA_BASE_URL, os.getenv("OLLAMA_ALLOWED_HOSTS", ""))
# Do not export conversation traces to a third party by default.
set_tracing_disabled(True)

client = AsyncOpenAI(
    base_url=OLLAMA_BASE_URL,
    api_key=os.getenv("OLLAMA_API_KEY", "ollama"),
    timeout=float(os.getenv("AGENT_PROVIDER_TIMEOUT_SECONDS", "60")),
)
local_model = OpenAIChatCompletionsModel(model=OLLAMA_MODEL, openai_client=client)

assistant = Agent(
    name="VOOM Local Assistant",
    instructions=(
        "You are VOOM AI's local assistant. Answer in the user's language. "
        "Be accurate, distinguish facts from assumptions, and never claim to "
        "have executed external actions. You have no tools or trading permissions."
    ),
    model=local_model,
)

app = FastAPI(title="VOOM Agent Service", version="0.2.0")


class RunRequest(BaseModel):
    input: str = Field(min_length=1, max_length=MAX_INPUT_CHARS)
    task: Literal["chat", "analysis"] = "chat"


class RunResponse(BaseModel):
    output: str
    provider: str = "ollama"
    model: str = OLLAMA_MODEL


def _request_id_response(status_code: int, detail: str, request_id: str):
    response = JSONResponse(status_code=status_code, content={"detail": detail})
    response.headers["X-Request-ID"] = request_id
    return response


@app.middleware("http")
async def protect_agent_endpoint(request: Request, call_next):
    request_id = uuid.uuid4().hex
    request.state.request_id = request_id

    if request.method == "POST" and request.url.path == "/v1/agent/run":
        if len(AGENT_API_TOKEN) < 32:
            logger.error("agent_auth_not_configured request_id=%s", request_id)
            return _request_id_response(503, "Agent service authentication is not configured", request_id)

        if not bearer_token_matches(AGENT_API_TOKEN, request.headers.get("authorization")):
            logger.warning("agent_auth_rejected request_id=%s", request_id)
            return _request_id_response(401, "Unauthorized", request_id)

        content_length = request.headers.get("content-length")
        if content_length:
            try:
                if int(content_length) > MAX_BODY_BYTES:
                    return _request_id_response(413, "Request body too large", request_id)
            except ValueError:
                return _request_id_response(400, "Invalid Content-Length", request_id)

        # This is a per-process Dev/Test limiter, not a distributed production control.
        client_ip = request.client.host if request.client else "unknown"
        if not rate_limiter.allow(client_ip):
            logger.warning("agent_rate_limited request_id=%s", request_id)
            return _request_id_response(429, "Rate limit exceeded", request_id)

    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "voom-agent",
        "provider": "ollama",
        "model": OLLAMA_MODEL,
        "auth_configured": len(AGENT_API_TOKEN) >= 32,
    }


@app.post("/v1/agent/run", response_model=RunResponse)
async def run_agent(payload: RunRequest, request: Request):
    request_id = request.state.request_id
    task_input = payload.input
    if payload.task == "analysis":
        task_input = (
            "Analyze the following request carefully. Separate facts from assumptions "
            "and identify material risks.\n\n" + payload.input
        )

    try:
        result = await Runner.run(assistant, task_input)
        output = str(result.final_output or "")
        logger.info("agent_request_completed request_id=%s task=%s", request_id, payload.task)
        return RunResponse(output=output)
    except Exception as exc:
        # Do not log prompt, bearer token, or provider response body.
        logger.error(
            "agent_provider_error request_id=%s error_type=%s",
            request_id,
            type(exc).__name__,
        )
        raise HTTPException(status_code=502, detail="Agent provider request failed") from exc
