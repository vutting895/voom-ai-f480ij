# Read-only Sandbox Contract — Development Slice

## Purpose

Define a fail-closed, declarative policy for a future disposable OCI sandbox. The current implementation validates a proposed profile and produces a plan only. It does not create a container, verify an image, inspect mounts, apply Linux namespaces, enforce cgroups/seccomp, or start a process.

## Required policy

- Immutable container image identified by a `sha256` digest
- Non-root numeric UID/GID
- Read-only root filesystem
- Approved workspace mounted read-only at a fixed absolute target
- Workspace mount source must match the validated Headless command workspace
- No network egress (`networkMode: none`)
- Empty environment-variable allowlist
- No privilege escalation; all Linux capabilities dropped
- Runtime default seccomp profile
- Explicit CPU, memory, PID, wall-clock, and output limits

## Current implementation

`buildReadOnlySandboxPlan` validates these settings and returns an immutable object with:

- `executionAllowed: false`
- `executorImplemented: false`
- `enforcement: external-oci-runtime-required`

This is a contract validator, not a sandbox. A profile passing these unit tests does not prove the container runtime will enforce the declared settings. Only a separately implemented and independently tested OCI executor can establish that.

## Explicitly not implemented

- Container creation or process spawning
- Image pulling or digest verification
- Filesystem mount enforcement
- Namespace, seccomp, cgroup, or network policy enforcement
- Ollama network access from the sandbox
- Host environment or secret injection
- Writable workspaces or write-enabled agent mode

## Validation

Mock/unit tests exercise policy acceptance and fail-closed rejection paths. They do not start containers or prove OS isolation. No production resources, credentials, broker connections, or trading permissions are involved.
