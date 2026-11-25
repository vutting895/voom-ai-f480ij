import path from "node:path";

const IMAGE_DIGEST = /^sha256:[a-f0-9]{64}$/;
const MAX_WALL_CLOCK_MS = 10 * 60 * 1000;
const MAX_OUTPUT_BYTES = 1024 * 1024;

function requirePositiveInteger(value, label, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > max) {
    throw new RangeError(`${label} must be a positive integer no greater than ${max}`);
  }
}

/**
 * Validate a declarative read-only OCI sandbox profile.
 *
 * This function does not create a container, inspect mounts, enforce seccomp,
 * or start a process. It only rejects incomplete/unsafe policy declarations
 * and returns a plan that is explicitly non-executable.
 */
export function buildReadOnlySandboxPlan({ commandSpec, profile }) {
  if (!commandSpec || commandSpec.command !== "ollama"
    || !Array.isArray(commandSpec.args)
    || commandSpec.args.length === 0
    || commandSpec.args.some((arg) => typeof arg !== "string")
    || typeof commandSpec.cwd !== "string"
    || commandSpec.executesProcess !== false) {
    throw new TypeError("A non-executing Ollama command specification is required");
  }

  if (!profile || typeof profile !== "object") {
    throw new TypeError("A trusted sandbox profile is required");
  }
  if (typeof profile.imageDigest !== "string" || !IMAGE_DIGEST.test(profile.imageDigest)) {
    throw new TypeError("Sandbox image must be pinned by a sha256 digest");
  }
  if (!Number.isSafeInteger(profile.uid) || profile.uid <= 0
    || !Number.isSafeInteger(profile.gid) || profile.gid <= 0) {
    throw new RangeError("Sandbox must run with non-root uid and gid");
  }
  if (profile.readOnlyRootFilesystem !== true) {
    throw new Error("Sandbox root filesystem must be read-only");
  }
  if (profile.noNewPrivileges !== true || profile.dropAllCapabilities !== true) {
    throw new Error("Sandbox must disable privilege escalation and drop all capabilities");
  }
  if (profile.seccompProfile !== "runtime/default") {
    throw new Error("Sandbox must use the runtime default seccomp profile");
  }
  if (profile.networkMode !== "none") {
    throw new Error("Network egress must be disabled for this contract");
  }
  if (!Array.isArray(profile.envAllowlist) || profile.envAllowlist.length !== 0) {
    throw new Error("Environment allowlist must be empty in this initial contract");
  }

  const mount = profile.workspaceMount;
  if (!mount || typeof mount.source !== "string" || !path.isAbsolute(mount.source)
    || typeof mount.target !== "string" || !path.isAbsolute(mount.target)
    || mount.readOnly !== true) {
    throw new Error("Workspace must be mounted at an absolute target as read-only");
  }
  if (path.resolve(mount.source) !== path.resolve(commandSpec.cwd)) {
    throw new Error("Workspace mount source must match the validated command workspace");
  }

  const limits = profile.resourceLimits;
  if (!limits || typeof limits !== "object") {
    throw new TypeError("Explicit resource limits are required");
  }
  requirePositiveInteger(limits.cpuMillis, "cpuMillis", 16_000);
  requirePositiveInteger(limits.memoryBytes, "memoryBytes", 8 * 1024 * 1024 * 1024);
  requirePositiveInteger(limits.pidsLimit, "pidsLimit", 256);
  requirePositiveInteger(limits.wallClockMs, "wallClockMs", MAX_WALL_CLOCK_MS);
  requirePositiveInteger(limits.maxOutputBytes, "maxOutputBytes", MAX_OUTPUT_BYTES);

  const frozenMount = Object.freeze({
    source: path.resolve(mount.source),
    target: path.resolve(mount.target),
    readOnly: true,
  });
  const frozenLimits = Object.freeze({ ...limits });

  return Object.freeze({
    contract: "voom-read-only-sandbox-v1",
    executionAllowed: false,
    executorImplemented: false,
    enforcement: "external-oci-runtime-required",
    commandSpec,
    profile: Object.freeze({
      imageDigest: profile.imageDigest,
      uid: profile.uid,
      gid: profile.gid,
      readOnlyRootFilesystem: true,
      noNewPrivileges: true,
      dropAllCapabilities: true,
      seccompProfile: "runtime/default",
      networkMode: "none",
      envAllowlist: Object.freeze([]),
      workspaceMount: frozenMount,
      resourceLimits: frozenLimits,
    }),
  });
}
