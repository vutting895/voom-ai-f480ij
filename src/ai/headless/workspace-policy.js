import path from "node:path";

/**
 * Resolve a workspace against an explicit lexical allowlist.
 *
 * This is input validation only. It does not resolve symlinks, pin an inode,
 * prevent TOCTOU races, or create an OS security boundary. An executor must
 * independently realpath the workspace and enforce isolation at the mount/OS
 * layer before opening any files or starting a process.
 */
export function resolveWorkspaceWithinAllowedRoots({ workspace, allowedRoots }) {
  if (typeof workspace !== "string" || workspace.length === 0 || workspace !== workspace.trim()) {
    throw new TypeError("An absolute workspace path is required");
  }
  if (workspace.includes("\0") || !path.isAbsolute(workspace)) {
    throw new TypeError("Workspace must be an absolute path without NUL bytes");
  }
  if (!Array.isArray(allowedRoots) || allowedRoots.length === 0) {
    throw new TypeError("At least one allowed workspace root is required");
  }

  const resolvedWorkspace = path.resolve(workspace);
  const resolvedRoots = allowedRoots.map((root) => {
    if (typeof root !== "string" || root.length === 0 || root !== root.trim()
      || root.includes("\0") || !path.isAbsolute(root)) {
      throw new TypeError("Every allowed workspace root must be an absolute path");
    }
    return path.resolve(root);
  });

  const isContained = resolvedRoots.some((root) => {
    const relative = path.relative(root, resolvedWorkspace);
    return relative === ""
      || (relative !== ".."
        && !relative.startsWith(`..${path.sep}`)
        && !path.isAbsolute(relative));
  });

  if (!isContained) {
    throw new RangeError("Workspace is outside the allowed workspace roots");
  }

  return resolvedWorkspace;
}
