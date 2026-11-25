import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");

test("API authentication uses verified Supabase user identity and fails closed", () => {
  assert.match(server, /SUPABASE_URL/);
  assert.match(server, /SUPABASE_PUBLISHABLE_KEY/);
  assert.match(server, /authClient\.auth\.getUser\(accessToken\)/);
  assert.match(server, /SUPABASE_AUTH_NOT_CONFIGURED/);
  assert.ok(server.includes("req.user = Object.freeze({ id: identity.userId });"));
  assert.ok(server.indexOf("app.use('/api',") < server.indexOf("app.use(express.json({ limit: '64kb' }))"), "authenticate before parsing the body");
});

test("security administration requires a separate admin token", () => {
  assert.match(server, /VOOM_ADMIN_TOKEN/);
  assert.match(server, /x-voom-admin-token/);
  assert.match(server, /ADMIN_AUTH_NOT_CONFIGURED/);
});

test("JSON request size is bounded and caller-controlled proxy headers are ignored", () => {
  assert.match(server, /express\.json\(\{ limit: '64kb' \}\)/);
  assert.match(server, /req\.socket\?\.remoteAddress/);
  assert.doesNotMatch(server, /forwarded\.split\(','\)/);
});

test("arbitrary custom URL fetch is not exposed as an AI tool", () => {
  assert.doesNotMatch(server, /customApiUrl|customUrl/);
  assert.match(server, /z\.enum\(\['crypto', 'joke', 'weather'\]\)/);
});

test("authenticated identity endpoint is mounted behind the Supabase API guard", () => {
  const guard = server.indexOf("app.use('/api',");
  const route = server.indexOf("app.get('/api/auth/me'");
  assert.ok(guard >= 0 && route > guard);
  assert.match(server, /userId: req\.user\.id/);
});
