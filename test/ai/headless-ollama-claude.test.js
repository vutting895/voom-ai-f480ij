import test from "node:test";
import assert from "node:assert/strict";
import { buildOllamaClaudeCommand } from "../../src/ai/headless/ollama-claude.js";

test("builds a headless read-only Ollama Claude Code invocation", () => {
  const result = buildOllamaClaudeCommand({
    model: "qwen3.5",
    prompt: "Review this repository and report risks.",
    workspace: "/tmp/voom-worktree",
  });
  assert.equal(result.command, "ollama");
  assert.equal(result.cwd, "/tmp/voom-worktree");
  assert.equal(result.permissionMode, "plan");
  assert.equal(result.interactive, false);
  assert.equal(result.executesProcess, false);
  assert.deepEqual(result.args, [
    "launch", "claude", "--model", "qwen3.5", "--yes", "--",
    "-p", "Review this repository and report risks.",
    "--permission-mode", "plan",
    "--no-session-persistence",
    "--output-format", "json",
  ]);
});

test("requires a model, prompt, and explicit workspace", () => {
  assert.throws(() => buildOllamaClaudeCommand({ prompt: "x", workspace: "/tmp" }), /model/);
  assert.throws(() => buildOllamaClaudeCommand({ model: "qwen3.5", prompt: " ", workspace: "/tmp" }), /prompt/);
  assert.throws(() => buildOllamaClaudeCommand({ model: "qwen3.5", prompt: "x" }), /workspace/);
});

test("rejects unsafe model strings and oversized prompts", () => {
  assert.throws(() => buildOllamaClaudeCommand({
    model: "qwen3.5; rm -rf /", prompt: "x", workspace: "/tmp",
  }), /model/);
  assert.throws(() => buildOllamaClaudeCommand({
    model: "qwen3.5", prompt: "12345", workspace: "/tmp", maxPromptLength: 4,
  }), /exceeds/);
});
