import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");

test("API authentication fails closed when the service token is absent", () => {
  assert.match(server, /if \(!VOOM_API_AUTH_TOKEN\)/);
  assert.match(server, /API_AUTH_NOT_CONFIGURED/);
  assert.match(server, /authorization\.startsWith\('Bearer '\)/);
  assert.match(server, /timingSafeEqual/);
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

test("API endpoints cannot be used without service authentication", () => {
  const guard = server.indexOf("app.use('/api',");
  const route = server.indexOf("app.post('/api/chat'");
  assert.ok(guard >= 0 && route > guard);
});
