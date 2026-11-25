import { createOpenAICompatibleProvider } from "./openai-compatible.js";

export function createOllamaProvider({
  baseUrl = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434/v1",
  model = process.env.OLLAMA_MODEL || "qwen3:8b",
  timeoutMs = Number(process.env.OLLAMA_TIMEOUT_MS || 60_000),
  fetchImpl = fetch,
} = {}) {
  return createOpenAICompatibleProvider({
    name: "ollama",
    baseUrl,
    apiKey: "ollama", // Ollama accepts this compatibility placeholder; it is not a secret.
    model,
    timeoutMs,
    fetchImpl,
  });
}
