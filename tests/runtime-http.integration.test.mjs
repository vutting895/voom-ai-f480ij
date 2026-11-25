import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { after, before, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";

const baseUrl = "http://127.0.0.1:3000";
const userA = "00000000-0000-4000-8000-00000000000a";
const userB = "00000000-0000-4000-8000-00000000000b";
const tokenA = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMGEiLCJhdWQiOiJhdXRoZW50aWNhdGVkIn0.signatureA";
const tokenB = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMGIiLCJhdWQiOiJhdXRoZW50aWNhdGVkIn0.signatureB";
let server;
let authServer;

async function apiRequest({ token, path = "/api/auth/me", method = "GET", headers = {}, body }) {
  const requestHeaders = { ...headers };
  if (token) requestHeaders.authorization = `Bearer ${token}`;
  return fetch(baseUrl + path, { method, headers: requestHeaders, body });
}

before(async () => {
  authServer = createServer((req, res) => {
    if (req.url !== "/auth/v1/user") {
      res.writeHead(404).end();
      return;
    }
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (token === "auth-provider-error-token") {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ message: "Auth service unavailable" }));
      return;
    }
    const users = {
      [tokenA]: { id: userA, aud: "authenticated", role: "authenticated" },
      [tokenB]: { id: userB, aud: "authenticated", role: "authenticated" },
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
      SUPABASE_PUBLISHABLE_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.signature",
      VOOM_ADMIN_TOKEN: "integration-test-admin-token",
    },
    stdio: ["ignore", "ignore", "pipe"],
  });

  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (server.exitCode !== null) throw new Error("Runtime server exited before startup.");
    try {
      const response = await apiRequest({});
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
  const response = await apiRequest({});
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "UNAUTHORIZED");
});

test("API denies access tokens rejected by the Supabase Auth endpoint", async () => {
  const response = await apiRequest({ token: "invalid-token" });
  assert.equal(response.status, 401);
});

test("API returns 503 when the Supabase Auth provider is unavailable", async () => {
  const response = await apiRequest({ token: "auth-provider-error-token" });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "AUTH_PROVIDER_UNAVAILABLE");
});

test("API rejects oversized unauthenticated bodies before JSON parsing", async () => {
  const response = await apiRequest({
    path: "/api/chat",
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ padding: "x".repeat(100_000) }),
  });
  assert.equal(response.status, 401);
});

test("verified Supabase token resolves to its own immutable user identity", async () => {
  const response = await apiRequest({ token: tokenA });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { userId: userA, authenticated: true });
});

test("caller-supplied user ID query cannot override the verified Supabase identity", async () => {
  const response = await apiRequest({
    token: tokenA,
    path: `/api/auth/me?userId=${userB}`,
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).userId, userA);
});

test("different Supabase token resolves to a different user identity", async () => {
  const response = await apiRequest({ token: tokenB });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { userId: userB, authenticated: true });
});

test("legacy shared service token is not accepted as user identity", async () => {
  const response = await apiRequest({ token: "integration-test-service-token" });
  assert.equal(response.status, 401);
});

test("security administration still requires its separate admin token", async () => {
  const response = await apiRequest({ token: tokenA, path: "/api/security-status" });
  assert.equal(response.status, 403);
});

test("verified user plus admin token can read simulated security status", async () => {
  const response = await apiRequest({
    token: tokenA,
    path: "/api/security-status",
    headers: { "x-voom-admin-token": "integration-test-admin-token" },
  });
  assert.equal(response.status, 200);
  assert.equal(typeof (await response.json()).activeProtection, "boolean");
});
