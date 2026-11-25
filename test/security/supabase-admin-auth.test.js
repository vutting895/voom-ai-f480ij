import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseAdminAuth } from '../../src/security/supabase-admin-auth.js';

const env = {
  SUPABASE_URL: 'https://project-ref.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key'
};

function harness({ authorization, fetchImpl, config = env } = {}) {
  const req = {
    headers: authorization ? { authorization } : {},
    get(name) { return this.headers[name.toLowerCase()]; }
  };
  const state = { status: null, body: null, headers: {}, nextCalled: false };
  const res = {
    set(name, value) { state.headers[name] = value; return this; },
    status(value) { state.status = value; return this; },
    json(value) { state.body = value; return this; }
  };
  const next = () => { state.nextCalled = true; };
  const middleware = createSupabaseAdminAuth({ env: config, fetchImpl });
  return { req, res, state, next, middleware };
}

test('rejects missing bearer token', async () => {
  const h = harness({ fetchImpl: async () => { throw new Error('must not fetch'); } });
  await h.middleware(h.req, h.res, h.next);
  assert.equal(h.state.status, 401);
  assert.equal(h.state.nextCalled, false);
});

test('fails closed when Supabase configuration is absent', async () => {
  const h = harness({ authorization: 'Bearer valid-token', config: {}, fetchImpl: async () => ({ ok: true }) });
  await h.middleware(h.req, h.res, h.next);
  assert.equal(h.state.status, 503);
  assert.equal(h.state.nextCalled, false);
});

test('authorizes only a server-verified app_metadata admin role', async () => {
  let request;
  const h = harness({
    authorization: 'Bearer signed-access-token',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 200, json: async () => ({ id: 'user-1', email: 'admin@example.test', app_metadata: { role: 'admin' } }) };
    }
  });
  await h.middleware(h.req, h.res, h.next);
  assert.equal(h.state.nextCalled, true);
  assert.deepEqual(h.req.adminUser, { id: 'user-1', email: 'admin@example.test' });
  assert.equal(request.url, 'https://project-ref.supabase.co/auth/v1/user');
  assert.equal(request.options.headers.Authorization, 'Bearer signed-access-token');
  assert.equal(request.options.headers.apikey, env.SUPABASE_PUBLISHABLE_KEY);
  assert.equal(request.options.redirect, 'error');
  assert.equal(h.state.headers['Cache-Control'], 'no-store');
});

test('does not trust user-editable user_metadata for admin authorization', async () => {
  const h = harness({
    authorization: 'Bearer signed-access-token',
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ id: 'user-2', user_metadata: { role: 'admin' }, app_metadata: { role: 'user' } }) })
  });
  await h.middleware(h.req, h.res, h.next);
  assert.equal(h.state.status, 403);
  assert.equal(h.state.nextCalled, false);
});

test('denies authenticated non-admin users', async () => {
  const h = harness({
    authorization: 'Bearer signed-access-token',
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ id: 'user-3', app_metadata: {} }) })
  });
  await h.middleware(h.req, h.res, h.next);
  assert.equal(h.state.status, 403);
});

test('rejects invalid or expired Supabase sessions', async () => {
  const h = harness({
    authorization: 'Bearer invalid-token',
    fetchImpl: async () => ({ ok: false, status: 401 })
  });
  await h.middleware(h.req, h.res, h.next);
  assert.equal(h.state.status, 401);
});

test('fails closed on Auth service/network errors', async () => {
  const h = harness({ authorization: 'Bearer token', fetchImpl: async () => { throw new Error('network'); } });
  await h.middleware(h.req, h.res, h.next);
  assert.equal(h.state.status, 503);
});

test('rejects non-HTTPS Supabase endpoints outside localhost', async () => {
  const h = harness({
    authorization: 'Bearer token',
    config: { SUPABASE_URL: 'http://example.com', SUPABASE_PUBLISHABLE_KEY: 'key' },
    fetchImpl: async () => { throw new Error('must not fetch'); }
  });
  await h.middleware(h.req, h.res, h.next);
  assert.equal(h.state.status, 503);
});
