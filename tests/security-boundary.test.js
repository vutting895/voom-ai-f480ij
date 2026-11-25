import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../server.js', import.meta.url), 'utf8');

test('chat and health endpoints require a verified Supabase session', () => {
  assert.match(source, /app\.post\('\/api\/chat',\s*authenticateSupabaseUser,/);
  assert.match(source, /app\.get\('\/api\/health-check',\s*authenticateSupabaseUser,/);
  assert.match(source, /\/auth\/v1\/user/);
  assert.match(source, /INVALID_SESSION/);
});

test('security administration endpoints require an authenticated admin role', () => {
  assert.match(source, /app\.get\('\/api\/security-status',\s*authenticateSupabaseUser,\s*requireAdmin,/);
  assert.match(source, /app\.post\('\/api\/security-status',\s*authenticateSupabaseUser,\s*requireAdmin,/);
  assert.match(source, /app_metadata/);
  assert.match(source, /FORBIDDEN/);
});

test('client-supplied forwarding headers are not trusted for rate limiting', () => {
  assert.doesNotMatch(source, /req\\.headers\\[['\"]x-forwarded-for/i);
  assert.match(source, /req\.socket\?\.remoteAddress/);
});

test('arbitrary custom API URLs are disabled to prevent SSRF', () => {
  assert.match(source, /CUSTOM_API_DISABLED/);
  assert.doesNotMatch(source, /url\s*=\s*customUrl\s*\|\|\s*customApiUrl/);
});

test('chat resource controls are bounded', () => {
  assert.match(source, /express\.json\(\{\s*limit:\s*'16kb'\s*\}\)/);
  assert.match(source, /Math\.min\(5, maxSteps\)/);
  assert.match(source, /Math\.min\(1, Math\.max\(0/);
});
