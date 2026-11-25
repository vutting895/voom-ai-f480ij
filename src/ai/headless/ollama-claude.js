const DEFAULT_MAX_PROMPT_LENGTH = 12_000;
const MODEL_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/;

/**
 * Build a non-interactive, read-only Claude Code invocation backed by Ollama.
 * This returns an argument vector only; it deliberately does not spawn a process.
 */
export function buildOllamaClaudeCommand({
  model,
  prompt,
  workspace,
  maxPromptLength = DEFAULT_MAX_PROMPT_LENGTH,
}) {
  if (typeof model !== "string" || !MODEL_PATTERN.test(model)) {
    throw new TypeError("A valid Ollama model name is required");
  }
  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    throw new TypeError("A non-empty prompt is required");
  }
  if (prompt.length > maxPromptLength) {
    throw new RangeError(`Prompt exceeds ${maxPromptLength} characters`);
  }
  if (typeof workspace !== "string" || !workspace.trim()) {
    throw new TypeError("An explicit workspace path is required");
  }

  return Object.freeze({
    command: "ollama",
    args: Object.freeze([
      "launch",
      "claude",
      "--model",
      model,
      "--yes",
      "--",
      "-p",
      prompt,
      "--permission-mode",
      "plan",
      "--no-session-persistence",
      "--output-format",
      "json",
    ]),
    cwd: workspace,
    permissionMode: "plan",
    interactive: false,
    executesProcess: false,
  });
}
