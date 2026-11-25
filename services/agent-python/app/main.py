import os
from typing import Literal

from agents import Agent, Runner, AsyncOpenAI, OpenAIChatCompletionsModel, set_tracing_disabled
from fastapi import FastAPI, Header, HTTPException
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


@app.get("/health")
async def health():
    return {"status": "ok", "service": "voom-agent", "provider": "ollama", "model": OLLAMA_MODEL}


@app.post("/v1/agent/run", response_model=RunResponse)
async def run_agent(
    request: RunRequest,
    authorization: str | None = Header(default=None),
):
    if not AGENT_API_TOKEN:
        raise HTTPException(status_code=503, detail="Agent API authentication is not configured")
    if not bearer_token_matches(AGENT_API_TOKEN, authorization):
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        result = await Runner.run(assistant, request.input)
        return RunResponse(output=str(result.final_output or ""))
    except Exception as exc:
        # Keep provider internals and credentials out of API responses.
        raise HTTPException(status_code=502, detail="Agent provider request failed") from exc
