# Local Inference Gateway — Design Decision (Dev/Test)

Status: proposed architecture only. No gateway, socket, proxy, container, or process executor is implemented by this document.

## Context

The current sandbox contract requires `networkMode: none`, while the current agent configuration targets Ollama's HTTP API (default `http://127.0.0.1:11434/v1`). A process in a no-network container cannot be assumed to reach an Ollama service on the host. Opening host networking or unrestricted bridge networking would weaken the isolation boundary and is not an acceptable shortcut.

Ollama documents Claude Code integration through its Anthropic Messages-compatible HTTP endpoint. Its documented setup uses `ANTHROPIC_BASE_URL=http://localhost:11434` and `ANTHROPIC_AUTH_TOKEN=ollama`. The documented `ollama launch claude` flow configures and launches the integration; it does not document a Unix-socket endpoint. Therefore, the CLI path needs a loopback HTTP shim if it is to run inside a network-isolated container.

The OpenAI Python client used by the Agents SDK accepts a custom HTTP client. The HTTPX2 transport documentation exposes a low-level `AsyncHTTPTransport(uds=...)` option for Unix Domain Sockets, and the OpenAI SDK accepts a custom async HTTP client. This establishes a documented transport path worth testing, but it does not prove that the exact pinned package set in this repository works end-to-end. An integration test against the committed dependency set remains mandatory.

## Proposed topology

1. Keep Ollama on the host and do not expose its listener to the sandbox.
2. Run a host-side, unprivileged inference gateway bound only to a dedicated Unix socket.
3. Bind-mount only that socket into the disposable sandbox. Do not mount the Docker/OCI control socket, host home, credentials, or broad runtime directories.
4. Make the gateway an allowlisted reverse proxy, not a general-purpose HTTP proxy. Permit only the required model-inference API paths and methods; reject arbitrary paths, redirects, URL overrides, and non-allowlisted models.
5. Authenticate the caller using a per-run capability/token and, where available, peer credentials. Apply request/response byte limits, concurrency limits, deadlines, and audit IDs.
6. For the Python Agents SDK, use an HTTPX2 async UDS transport with a fixed synthetic HTTP origin and a fixed socket path. Verify this with the exact locked OpenAI/HTTPX2 versions and test streaming, cancellation, timeouts, and response handling.
7. For Claude Code CLI, if retained, run a small in-sandbox loopback HTTP shim that accepts only loopback connections and forwards to the mounted UDS. Configure Claude Code to use that shim's fixed Anthropic-compatible base URL. The shim must not expose a listening interface on non-loopback addresses.
8. Keep the sandbox's external network disabled. The UDS gateway is the only explicitly mounted inference capability; it is not general network access.

## Security constraints

- The mounted socket grants the ability to request inference; a read-only filesystem mount does not make the socket's API read-only.
- The gateway must not expose Ollama administration, model management, filesystem, pull/push, or arbitrary proxy endpoints.
- Do not forward caller-supplied Host, Authorization, or forwarding headers blindly. Construct upstream requests from validated fields.
- Do not let the sandbox choose upstream host, port, scheme, model, or socket path.
- Use per-run rate, concurrency, body-size, token/output, and wall-clock limits.
- Fail closed if the gateway, socket permissions, peer identity, model allowlist, or policy configuration is missing.
- Do not pass broker credentials, trading APIs, production secrets, or write-capable tools into the agent.
- Keep workspace mounts read-only for this slice. Plan mode is defense in depth, not an OS security boundary.

## Required proof before implementation is considered complete

### Gateway unit and protocol tests
- Reject every method/path outside the explicit allowlist.
- Reject unknown models, oversized bodies, malformed JSON, excessive concurrency, and expired capabilities.
- Confirm no redirects or caller-selected upstream destinations are followed.
- Confirm upstream error bodies and secrets are not leaked to the caller or logs.
- Verify cancellation, streaming, timeout, and disconnect handling.

### UDS integration tests
- Verify the exact pinned HTTPX2 async transport can connect through the mounted UDS.
- Verify the host gateway forwards only approved inference requests to Ollama.
- Verify a sandbox with external networking disabled can complete a model request through UDS.
- Verify attempts to reach host TCP services, public IPs, DNS, and other sockets fail.
- Verify the socket is unavailable to unrelated containers and host users.

### Claude Code compatibility tests
- Verify the pinned Ollama and Claude Code versions.
- Verify the CLI honors the configured Anthropic-compatible base URL and token.
- Verify the loopback shim can reach only the UDS gateway and cannot proxy arbitrary HTTP.
- Verify plan mode and read-only workspace restrictions, including attempted file writes and subprocess/network operations.

### OCI runtime proof
- Run the actual container with non-root UID/GID, read-only root, read-only workspace, no-new-privileges, dropped capabilities, seccomp, cgroup limits, PID limits, output limits, and external networking disabled.
- Inspect the effective runtime configuration and test enforcement; do not treat a validated JSON policy object as evidence of enforcement.

## Implementation order

1. Add gateway contract and threat model tests without starting processes.
2. Implement host gateway and UDS transport for the Python Agents SDK; prove the pinned client works.
3. Add the loopback shim only if Claude Code CLI remains a required execution path.
4. Implement OCI executor with explicit runtime inspection and adversarial tests.
5. Keep execution disabled by default until all proofs pass and a separate approval is given.

## Current boundary

This is a design proposal only. No socket is created, no process is spawned, no inference is executed, no network policy is changed, and no sandbox runtime is enabled. PR CI success does not prove this architecture works end to end.

## Reference documentation

- Ollama Claude Code integration: https://docs.ollama.com/integrations/claude-code
- Ollama Anthropic API compatibility: https://docs.ollama.com/api/anthropic-compatibility
- HTTPX2 transport configuration (including async UDS): https://pydantic.dev/docs/httpx2/advanced/transports/
- OpenAI Python SDK custom HTTP client / HTTPX2 migration: https://github.com/openai/openai-python/blob/main/httpx2.md
