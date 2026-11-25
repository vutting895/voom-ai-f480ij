import test from "node:test";
import assert from "node:assert/strict";
import { buildOllamaClaudeCommand } from "../../src/ai/headless/ollama-claude.js";
import { buildReadOnlySandboxPlan } from "../../src/ai/headless/sandbox-contract.js";

const commandSpec = buildOllamaClaudeCommand({
  model: "qwen3.5",
  prompt: "Review this repository and report risks.",
  workspace: "/tmp/voom-worktree",
  allowedWorkspaceRoots: ["/tmp"],
});

function validProfile(overrides = {}) {
  return {
    imageDigest: `sha256:${"a".repeat(64)}`,
    uid: 10001,
    gid: 10001,
    readOnlyRootFilesystem: true,
    noNewPrivileges: true,
    dropAllCapabilities: true,
    seccompProfile: "runtime/default",
    networkMode: "none",
    envAllowlist: [],
    workspaceMount: {
      source: "/tmp/voom-worktree",
      target: "/workspace",
      readOnly: true,
    },
    resourceLimits: {
      cpuMillis: 2000,
      memoryBytes: 1024 * 1024 * 1024,
      pidsLimit: 64,
      wallClockMs: 120000,
      maxOutputBytes: 256 * 1024,
    },
    ...overrides,
  };
}

test("builds a declarative read-only sandbox plan without enabling execution", () => {
  const plan = buildReadOnlySandboxPlan({ commandSpec, profile: validProfile() });
  assert.equal(plan.contract, "voom-read-only-sandbox-v1");
  assert.equal(plan.executionAllowed, false);
  assert.equal(plan.executorImplemented, false);
  assert.equal(plan.enforcement, "external-oci-runtime-required");
  assert.equal(plan.profile.workspaceMount.readOnly, true);
  assert.equal(plan.profile.networkMode, "none");
  assert.equal(plan.profile.uid, 10001);
  assert.ok(Object.isFrozen(plan));
  assert.ok(Object.isFrozen(plan.profile));
});

test("rejects missing, executable, or malformed command specifications", () => {
  assert.throws(() => buildReadOnlySandboxPlan({ profile: validProfile() }), /command specification/);
  assert.throws(() => buildReadOnlySandboxPlan({
    commandSpec: { ...commandSpec, executesProcess: true },
    profile: validProfile(),
  }), /command specification/);
  assert.throws(() => buildReadOnlySandboxPlan({
    commandSpec: { ...commandSpec, args: ["ollama", 7] },
    profile: validProfile(),
  }), /command specification/);
});

test("rejects mutable or privileged container settings", () => {
  for (const profile of [
    validProfile({ imageDigest: "latest" }),
    validProfile({ uid: 0 }),
    validProfile({ gid: 0 }),
    validProfile({ readOnlyRootFilesystem: false }),
    validProfile({ noNewPrivileges: false }),
    validProfile({ dropAllCapabilities: false }),
    validProfile({ seccompProfile: "unconfined" }),
    validProfile({ networkMode: "bridge" }),
    validProfile({ envAllowlist: ["API_KEY"] }),
  ]) {
    assert.throws(() => buildReadOnlySandboxPlan({ commandSpec, profile }));
  }
});

test("rejects writable, mismatched, or invalid workspace mounts", () => {
  assert.throws(() => buildReadOnlySandboxPlan({
    commandSpec,
    profile: validProfile({ workspaceMount: {
      source: "/tmp/voom-worktree", target: "/workspace", readOnly: false,
    } }),
  }), /read-only/);
  assert.throws(() => buildReadOnlySandboxPlan({
    commandSpec,
    profile: validProfile({ workspaceMount: {
      source: "/tmp/other", target: "/workspace", readOnly: true,
    } }),
  }), /must match/);
  assert.throws(() => buildReadOnlySandboxPlan({
    commandSpec,
    profile: validProfile({ workspaceMount: {
      source: "/tmp/voom-worktree", target: "workspace", readOnly: true,
    } }),
  }), /read-only/);
});

test("rejects missing, zero, negative, or excessive resource limits", () => {
  for (const resourceLimits of [
    undefined,
    { cpuMillis: 0, memoryBytes: 1, pidsLimit: 1, wallClockMs: 1, maxOutputBytes: 1 },
    { cpuMillis: 1, memoryBytes: -1, pidsLimit: 1, wallClockMs: 1, maxOutputBytes: 1 },
    { cpuMillis: 1, memoryBytes: 1, pidsLimit: 257, wallClockMs: 1, maxOutputBytes: 1 },
    { cpuMillis: 1, memoryBytes: 1, pidsLimit: 1, wallClockMs: 600001, maxOutputBytes: 1 },
    { cpuMillis: 1, memoryBytes: 1, pidsLimit: 1, wallClockMs: 1, maxOutputBytes: 1048577 },
  ]) {
    assert.throws(() => buildReadOnlySandboxPlan({
      commandSpec,
      profile: validProfile({ resourceLimits }),
    }));
  }
});
