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

`buildOllamaClaudeCommand` validates model, prompt length, and an explicit workspace, then returns a structured command specification. It does not spawn a process, access a repository, or run shell commands. This is deliberate: process execution requires a separately reviewed sandbox and OS-level isolation boundary.

## Security requirements before execution is enabled

1. Run only inside a disposable, unprivileged container or OS sandbox with a read-only workspace mount.
2. Use a fixed executable path and argument vector; never invoke a shell or interpolate user input into a command string.
3. Restrict filesystem visibility, network egress, environment variables, CPU, memory, process count, and wall-clock time.
4. Do not mount credentials, production files, SSH keys, cloud metadata, or broker configuration.
5. Enforce output-size limits and capture exit code, timeout, stdout, and stderr.
6. Keep plan/read-only mode as the default. Any write mode requires a separate explicit approval and a disposable branch/worktree.
7. Never enable `--dangerously-skip-permissions` or bypass permissions.

## Not implemented

- Process spawning or a remote execution service.
- Automatic repository checkout or branch creation.
- Write-enabled coding agent.
- Deployment, merge, production database, broker, or trading access.

## Validation

Unit tests cover argument construction and input validation. They do not prove Ollama or Claude Code is installed, nor do they prove OS-level sandboxing.
