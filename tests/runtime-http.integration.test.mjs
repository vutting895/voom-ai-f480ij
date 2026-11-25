import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { after, before, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";

const baseUrl = "http://127.0.0.1:3000";
let server;

before(async () => {
  server = spawn(process.execPath, ["server.js"], {
    cwd: new URL("../", import.meta.url),
    env: {
      ...process.env,
      VOOM_API_AUTH_TOKEN: "integration-test-service-token",
      VOOM_ADMIN_TOKEN: "integration-test-admin-token",
    },
    stdio: ["ignore", "ignore", "pipe"],
  });

  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (server.exitCode !== null) throw new Error("Runtime server exited before startup.");
    try {
      const response = await fetch(baseUrl + "/api/security-status");
      if (response.status === 401) {
        ready = true;
        break;
      }
    } catch {}
    await delay(100);
  }
  if (!ready) {
    server.kill("SIGTERM");
    throw new Error("Runtime server did not become ready on the isolated test port.");
  }
});

after(async () => {
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await new Promise((resolve) => server.once("exit", resolve));
  }
});

test("HTTP API denies requests without a bearer token", async () => {
  const response = await fetch(baseUrl + "/api/security-status");
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "UNAUTHORIZED");
});

test("HTTP API denies invalid bearer tokens", async () => {
  const response = await fetch(baseUrl + "/api/security-status", {
    headers: { authorization: "Bearer invalid-token" },
  });
  assert.equal(response.status, 401);
});

test("HTTP API rejects oversized unauthenticated bodies at the auth boundary", async () => {
  const response = await fetch(baseUrl + "/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ padding: "x".repeat(100_000) }),
  });
  assert.equal(response.status, 401);
});

test("security administration requires its separate admin token", async () => {
  const response = await fetch(baseUrl + "/api/security-status", {
    headers: { authorization: "Bearer integration-test-service-token" },
  });
  assert.equal(response.status, 403);
});

test("authorized admin can read simulated security status", async () => {
  const response = await fetch(baseUrl + "/api/security-status", {
    headers: {
      authorization: "Bearer integration-test-service-token",
      "x-voom-admin-token": "integration-test-admin-token",
    },
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(typeof body.activeProtection, "boolean");
});
