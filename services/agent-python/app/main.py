import os
from typing import Literal

from agents import Agent, Runner, AsyncOpenAI, OpenAIChatCompletionsModel, set_tracing_disabled
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.security import bearer_token_matches

APP_ENV = os.getenv("APP_ENV", "development")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434/v1")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen3:8b")
MAX_INPUT_CHARS = int(os.getenv("AGENT_MAX_INPUT_CHARS", "12000"))
AGENT_API_TOKEN = os.getenv("VOOM_AGENT_API_TOKEN", "")

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

app = FastAPI(title="VOOM Agent Service", version="0.1.0")


class RunRequest(BaseModel):
    input: str = Field(min_length=1, max_length=MAX_INPUT_CHARS)
    task: Literal["chat", "analysis"] = "chat"


class RunResponse(BaseModel):
    output: str
    provider: str = "ollama"
    model: str = OLLAMA_MODEL


@app.middleware("http")
async def authenticate_agent_requests(request: Request, call_next):
    if request.method == "POST" and request.url.path == "/v1/agent/run":
        if not AGENT_API_TOKEN:
            return JSONResponse(
                status_code=503,
                content={"detail": "Agent API authentication is not configured"},
            )
        if not bearer_token_matches(AGENT_API_TOKEN, request.headers.get("authorization")):
            return JSONResponse(status_code=401, content={"detail": "Unauthorized"})

        content_length = request.headers.get("content-length")
        if content_length:
            try:
                if int(content_length) > 64 * 1024:
                    return JSONResponse(status_code=413, content={"detail": "Request body too large"})
            except ValueError:
                return JSONResponse(status_code=400, content={"detail": "Invalid Content-Length"})

    return await call_next(request)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "voom-agent", "provider": "ollama", "model": OLLAMA_MODEL}


@app.post("/v1/agent/run", response_model=RunResponse)
async def run_agent(request: RunRequest):
    try:
        result = await Runner.run(assistant, request.input)
        return RunResponse(output=str(result.final_output or ""))
    except Exception as exc:
        # Keep provider internals and credentials out of API responses.
        raise HTTPException(status_code=502, detail="Agent provider request failed") from exc
