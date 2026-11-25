# Headless Agent Execution — Development Slice

## Supported command shape

The adapter builds (but does not execute) a non-interactive Ollama Launch command:

```bash
ollama launch claude --model qwen3.5 --yes -- -p "Review this repository and report risks." --permission-mode plan --no-session-persistence --output-format json
```

- `--yes` skips interactive model selection; `--model` is explicit.
- Arguments after `--` are forwarded to Claude Code.
- `-p` enables print/non-interactive mode.
- `--permission-mode plan` is the default read-only permission mode.
- `--no-session-persistence` avoids retaining the CLI session.
- JSON output is selected for machine parsing.

## Current implementation boundary

`buildOllamaClaudeCommand` validates the model and prompt, requires an explicit workspace allowlist, and returns a structured command specification. It does not spawn a process, access a repository, or run shell commands.

The workspace check is **lexical path validation only**. It resolves `..` segments and verifies that the resulting path is under one of the supplied absolute roots. It does not resolve symlinks, pin a filesystem object, prevent time-of-check/time-of-use races, or enforce filesystem permissions. It is not a sandbox and must not be treated as one.

## Read-only execution contract — not yet implemented

Any future executor must fail closed unless all of these controls are independently enforced and tested:

1. Use a disposable, unprivileged container or equivalent OS sandbox.
2. Resolve the workspace with filesystem-aware canonicalization, reject symlinks that escape the approved root, and mount the approved workspace read-only. Avoid check-then-use races by enforcing the boundary at mount time.
3. Use a fixed executable path and argument vector; never invoke a shell or interpolate user input into a command string.
4. Restrict filesystem visibility to the minimum required; do not mount host home directories, Docker sockets, credentials, SSH keys, cloud metadata, production files, or broker configuration.
5. Disable network egress by default. If Ollama must be reached, allow only a narrowly scoped endpoint and block all other destinations.
6. Use a minimal environment with an explicit environment-variable allowlist.
7. Enforce CPU, memory, process-count, file-size, wall-clock, stdout, and stderr limits.
8. Capture exit code, timeout state, bounded stdout/stderr, and an auditable execution ID.
9. Keep plan/read-only mode as defense in depth. It is not a substitute for OS isolation.
10. Do not support write mode in this slice. Any future write-enabled mode requires separate explicit approval, disposable branch/worktree isolation, and independent review.

## Not implemented

- Process spawning or a remote execution service.
- Filesystem-aware workspace canonicalization or OS-enforced read-only mounts.
- Network, environment, resource, or process isolation.
- Automatic repository checkout or branch creation.
- Write-enabled coding agent.
- Deployment, merge, production database, broker, or trading access.

## Validation

Unit tests cover argument construction and lexical workspace allowlist validation. They do not prove symlink safety, OS-level sandboxing, Ollama availability, or Claude Code execution. No real process is started by this adapter.
