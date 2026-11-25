import test from "node:test";
import assert from "node:assert/strict";
import { createOllamaProvider } from "../../src/ai/providers/ollama.js";

test("Ollama adapter calls the OpenAI-compatible chat completions endpoint", async () => {
  let requestedUrl;
  let requestedBody;
  const provider = createOllamaProvider({
    baseUrl: "http://localhost:11434/v1",
    model: "qwen3:8b",
    fetchImpl: async (url, options) => {
      requestedUrl = String(url);
      requestedBody = JSON.parse(options.body);
      return new Response(JSON.stringify({
        model: "qwen3:8b",
        choices: [{ message: { content: "สวัสดี" } }],
        usage: { total_tokens: 5 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });

  const result = await provider.chat({
    messages: [{ role: "user", content: "สวัสดี" }],
  });

  assert.equal(requestedUrl, "http://localhost:11434/v1/chat/completions");
  assert.equal(requestedBody.model, "qwen3:8b");
  assert.equal(result.provider, "ollama");
  assert.equal(result.content, "สวัสดี");
});

test("Ollama adapter normalizes upstream HTTP errors", async () => {
  const provider = createOllamaProvider({
    fetchImpl: async () => new Response("not found", { status: 404 }),
  });
  await assert.rejects(
    () => provider.chat({ messages: [{ role: "user", content: "hello" }] }),
    (error) => error.name === "ProviderError" && error.status === 404,
  );
});
