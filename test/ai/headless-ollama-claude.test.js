import test from "node:test";
import assert from "node:assert/strict";
import { buildOllamaClaudeCommand } from "../../src/ai/headless/ollama-claude.js";
import { resolveWorkspaceWithinAllowedRoots } from "../../src/ai/headless/workspace-policy.js";

test("builds a headless read-only Ollama Claude Code invocation inside an allowlisted root", () => {
  const result = buildOllamaClaudeCommand({
    model: "qwen3.5",
    prompt: "Review this repository and report risks.",
    workspace: "/tmp/voom-worktree",
    allowedWorkspaceRoots: ["/tmp"],
  });
  assert.equal(result.command, "ollama");
  assert.equal(result.cwd, "/tmp/voom-worktree");
  assert.equal(result.permissionMode, "plan");
  assert.equal(result.workspacePolicy, "lexical-allowlist-only");
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

test("requires a model, prompt, workspace, and explicit allowlist", () => {
  const roots = ["/tmp"];
  assert.throws(() => buildOllamaClaudeCommand({
    prompt: "x", workspace: "/tmp/work", allowedWorkspaceRoots: roots,
  }), /model/);
  assert.throws(() => buildOllamaClaudeCommand({
    model: "qwen3.5", prompt: " ", workspace: "/tmp/work", allowedWorkspaceRoots: roots,
  }), /prompt/);
  assert.throws(() => buildOllamaClaudeCommand({
    model: "qwen3.5", prompt: "x", workspace: "/tmp/work",
  }), /allowed workspace root/);
});

test("rejects paths outside the allowlist and relative paths", () => {
  assert.throws(() => resolveWorkspaceWithinAllowedRoots({
    workspace: "/etc", allowedRoots: ["/tmp/voom"],
  }), /outside/);
  assert.throws(() => resolveWorkspaceWithinAllowedRoots({
    workspace: "../voom", allowedRoots: ["/tmp"],
  }), /absolute/);
});

test("rejects malformed roots, empty allowlists, and NUL bytes", () => {
  assert.throws(() => resolveWorkspaceWithinAllowedRoots({
    workspace: "/tmp/work", allowedRoots: [],
  }), /at least one/i);
  assert.throws(() => resolveWorkspaceWithinAllowedRoots({
    workspace: "/tmp/work", allowedRoots: ["relative-root"],
  }), /absolute/);
  assert.throws(() => resolveWorkspaceWithinAllowedRoots({
    workspace: "/tmp/\0work", allowedRoots: ["/tmp"],
  }), /NUL/);
});

test("rejects unsafe model strings and oversized prompts", () => {
  assert.throws(() => buildOllamaClaudeCommand({
    model: "qwen3.5; rm -rf /", prompt: "x",
    workspace: "/tmp", allowedWorkspaceRoots: ["/tmp"],
  }), /model/);
  assert.throws(() => buildOllamaClaudeCommand({
    model: "qwen3.5", prompt: "12345",
    workspace: "/tmp", allowedWorkspaceRoots: ["/tmp"], maxPromptLength: 4,
  }), /character limit/);
});
