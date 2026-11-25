import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { app } from '../server.js';

test('API authentication and admin authorization fail closed with mocked Supabase Auth', async (t) => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalAnonKey = process.env.SUPABASE_ANON_KEY;
  process.env.SUPABASE_URL = 'https://supabase.mock';
  process.env.SUPABASE_ANON_KEY = 'mock-anon-key';

  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  const baseUrl = 'http://127.0.0.1:' + address.port;

  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.startsWith('https://supabase.mock/auth/v1/user')) {
      const authorization = new Headers(init.headers).get('Authorization');
      if (authorization === 'Bearer provider-down') throw new Error('mock auth provider unavailable');
      if (authorization === 'Bearer user-token') {
        return new Response(JSON.stringify({ id: 'user-1', app_metadata: { role: 'user' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (authorization === 'Bearer admin-token') {
        return new Response(JSON.stringify({ id: 'admin-1', app_metadata: { role: 'admin' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('{}', { status: 401 });
    }
    return originalFetch(input, init);
  };

  t.after(async () => {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalAnonKey === undefined) delete process.env.SUPABASE_ANON_KEY;
    else process.env.SUPABASE_ANON_KEY = originalAnonKey;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  const request = (path, options = {}) => originalFetch(baseUrl + path, options);

  const noSessionChat = await request('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(noSessionChat.status, 401);

  const noSessionAdmin = await request('/api/security-status');
  assert.equal(noSessionAdmin.status, 401);

  const ordinaryUserAdmin = await request('/api/security-status', {
    method: 'POST',
    headers: { Authorization: 'Bearer user-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ toggleProtection: false }),
  });
  assert.equal(ordinaryUserAdmin.status, 403);

  const providerDown = await request('/api/security-status', {
    headers: { Authorization: 'Bearer provider-down' },
  });
  assert.equal(providerDown.status, 503);

  const adminResponse = await request('/api/security-status', {
    method: 'POST',
    headers: { Authorization: 'Bearer admin-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ toggleProtection: false }),
  });
  assert.equal(adminResponse.status, 200);

  // Restore the in-memory protection flag so this test leaves no shared state behind.
  const restoreProtection = await request('/api/security-status', {
    method: 'POST',
    headers: { Authorization: 'Bearer admin-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ toggleProtection: true }),
  });
  assert.equal(restoreProtection.status, 200);
});
