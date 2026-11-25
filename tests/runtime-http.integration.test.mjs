import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { after, before, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";

const baseUrl = "http://127.0.0.1:3000";
let server;
let authServer;

before(async () => {
  authServer = createServer((req, res) => {
    if (req.url !== "/auth/v1/user") {
      res.writeHead(404).end();
      return;
    }
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const users = {
      "user-a-access-token": { id: "00000000-0000-4000-8000-00000000000a", aud: "authenticated", role: "authenticated" },
      "user-b-access-token": { id: "00000000-0000-4000-8000-00000000000b", aud: "authenticated", role: "authenticated" },
    };
    const user = users[token];
    res.writeHead(user ? 200 : 401, { "content-type": "application/json" });
    res.end(JSON.stringify(user || { message: "Invalid JWT", code: 401 }));
  });
  await new Promise((resolve) => authServer.listen(3001, "127.0.0.1", resolve));

  server = spawn(process.execPath, ["server.js"], {
    cwd: new URL("../", import.meta.url),
    env: {
      ...process.env,
      SUPABASE_URL: "http://127.0.0.1:3001",
      SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
      VOOM_ADMIN_TOKEN: "integration-test-admin-token",
    },
    stdio: ["ignore", "ignore", "pipe"],
  });

  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (server.exitCode !== null) throw new Error("Runtime server exited before startup.");
    try {
      const response = await fetch(baseUrl + "/api/auth/me");
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
  if (authServer) await new Promise((resolve) => authServer.close(resolve));
});

test("API denies requests without a Supabase access token", async () => {
  const response = await fetch(baseUrl + "/api/auth/me");
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "UNAUTHORIZED");
});

test("API denies access tokens rejected by the Supabase Auth endpoint", async () => {
  const response = await fetch(baseUrl + "/api/auth/me", {
    headers: { authorization: "Bearer invalid-token" },
  });
  assert.equal(response.status, 401);
});

test("API rejects oversized unauthenticated bodies before JSON parsing", async () => {
  const response = await fetch(baseUrl + "/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ padding: "x".repeat(100_000) }),
  });
  assert.equal(response.status, 401);
});

test("verified Supabase token resolves to its own immutable user identity", async () => {
  const response = await fetch(baseUrl + "/api/auth/me", {
    headers: { authorization: "Bearer user-a-access-token" },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    userId: "00000000-0000-4000-8000-00000000000a",
    authenticated: true,
  });
});

test("different Supabase token resolves to a different user identity", async () => {
  const response = await fetch(baseUrl + "/api/auth/me", {
    headers: { authorization: "Bearer user-b-access-token" },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    userId: "00000000-0000-4000-8000-00000000000b",
    authenticated: true,
  });
});

test("legacy shared service token is not accepted as user identity", async () => {
  const response = await fetch(baseUrl + "/api/auth/me", {
    headers: { authorization: "Bearer integration-test-service-token" },
  });
  assert.equal(response.status, 401);
});

test("security administration still requires its separate admin token", async () => {
  const response = await fetch(baseUrl + "/api/security-status", {
    headers: { authorization: "Bearer user-a-access-token" },
  });
  assert.equal(response.status, 403);
});

test("verified user plus admin token can read simulated security status", async () => {
  const response = await fetch(baseUrl + "/api/security-status", {
    headers: {
      authorization: "Bearer user-a-access-token",
      "x-voom-admin-token": "integration-test-admin-token",
    },
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(typeof body.activeProtection, "boolean");
});
