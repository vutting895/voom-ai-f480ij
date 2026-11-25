import test from "node:test";
import assert from "node:assert/strict";
import { ModelRouter } from "../../src/ai/model-router.js";
import { ProviderError } from "../../src/ai/providers/openai-compatible.js";

test("routes to the configured default provider", async () => {
  const router = new ModelRouter({
    providers: { local: { chat: async () => ({ provider: "local", content: "ok" }) } },
    defaultProvider: "local",
  });
  assert.deepEqual(await router.chat({ messages: [{ role: "user", content: "hello" }] }), {
    provider: "local",
    content: "ok",
  });
});

test("uses explicit fallback for retryable provider failures", async () => {
  const router = new ModelRouter({
    providers: {
      local: { chat: async () => { throw new ProviderError("offline", { provider: "local" }); } },
      cloud: { chat: async () => ({ provider: "cloud", content: "fallback" }) },
    },
    defaultProvider: "local",
    fallbackProvider: "cloud",
  });
  assert.deepEqual(await router.chat({ messages: [{ role: "user", content: "hello" }] }), {
    provider: "cloud",
    content: "fallback",
    fallback: true,
    primaryProvider: "local",
  });
});

test("does not fallback for non-retryable client errors", async () => {
  let fallbackCalls = 0;
  const router = new ModelRouter({
    providers: {
      local: { chat: async () => { throw new ProviderError("bad request", { provider: "local", status: 400 }); } },
      cloud: { chat: async () => { fallbackCalls += 1; return { content: "unexpected" }; } },
    },
    defaultProvider: "local",
    fallbackProvider: "cloud",
  });
  await assert.rejects(
    () => router.chat({ messages: [{ role: "user", content: "hello" }] }),
    (error) => error.status === 400 && error.retryable === false,
  );
  assert.equal(fallbackCalls, 0);
});

test("does not silently fallback when no fallback is configured", async () => {
  const failure = new ProviderError("offline", { provider: "local" });
  const router = new ModelRouter({
    providers: { local: { chat: async () => { throw failure; } } },
    defaultProvider: "local",
  });
  await assert.rejects(() => router.chat({ messages: [{ role: "user", content: "hello" }] }), failure);
});

test("rejects unknown providers", async () => {
  const router = new ModelRouter({
    providers: { local: { chat: async () => ({}) } },
    defaultProvider: "local",
  });
  await assert.rejects(() => router.chat({ messages: [] }, { provider: "missing" }), /not configured/);
});
