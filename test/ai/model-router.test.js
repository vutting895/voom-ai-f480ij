import test from "node:test";
import assert from "node:assert/strict";
import { ModelRouter } from "../../src/ai/model-router.js";

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

test("uses the explicit fallback when the primary provider fails", async () => {
  const router = new ModelRouter({
    providers: {
      local: { chat: async () => { throw new Error("offline"); } },
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

test("does not silently fallback when no fallback is configured", async () => {
  const failure = new Error("offline");
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
