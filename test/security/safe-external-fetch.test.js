import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { safeExternalGet } from '../../src/security/safe-external-fetch.js';

const dnsPublic = async () => [{ address: '93.184.216.34', family: 4 }];
function fakeRequest(specs, captured = []) {
  let index = 0;
  return {
    captured,
    requestImpl(options, callback) {
      captured.push(options);
      const spec = specs[Math.min(index++, specs.length - 1)];
      const req = new EventEmitter();
      req.setTimeout = () => {};
      req.destroy = error => { if (error) queueMicrotask(() => req.emit('error', error)); };
      req.end = () => {
        const res = new EventEmitter();
        res.statusCode = spec.statusCode ?? 200;
        res.headers = spec.headers ?? {};
        res.destroy = () => {};
        res.resume = () => {};
        callback(res);
        queueMicrotask(() => { if (spec.body) res.emit('data', Buffer.from(spec.body)); res.emit('end'); });
      };
      return req;
    }
  };
}

test('blocks destinations outside the exact hostname allowlist before DNS', async () => {
  let lookedUp = false;
  await assert.rejects(safeExternalGet('https://evil.example/x', {
    allowedHosts: ['api.example.com'], lookupAll: async () => { lookedUp = true; return dnsPublic(); },
    requestImpl: fakeRequest([{ body: '{}' }]).requestImpl
  }), /not allowed/);
  assert.equal(lookedUp, false);
});

test('blocks loopback and mixed public/private DNS answers', async () => {
  for (const answers of [
    [{ address: '127.0.0.1', family: 4 }],
    [{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.8', family: 4 }]
  ]) {
    await assert.rejects(safeExternalGet('https://api.example.com/x', {
      allowedHosts: ['api.example.com'], lookupAll: async () => answers,
      requestImpl: fakeRequest([{ body: '{}' }]).requestImpl
    }), /non-public address/);
  }
});

test('pins DNS result and preserves TLS hostname verification', async () => {
  const fake = fakeRequest([{ body: '{"ok":true}' }]);
  const result = await safeExternalGet('https://api.example.com/x', {
    allowedHosts: ['api.example.com'], lookupAll: dnsPublic, requestImpl: fake.requestImpl
  });
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.toString(), '{"ok":true}');
  assert.equal(fake.captured[0].servername, 'api.example.com');
  fake.captured[0].lookup('api.example.com', {}, (err, address, family) => {
    assert.ifError(err); assert.equal(address, '93.184.216.34'); assert.equal(family, 4);
  });
});

test('blocks redirect to a hostname outside the allowlist', async () => {
  const fake = fakeRequest([{ statusCode: 302, headers: { location: 'https://evil.example/x' } }]);
  await assert.rejects(safeExternalGet('https://api.example.com/x', {
    allowedHosts: ['api.example.com'], lookupAll: dnsPublic, requestImpl: fake.requestImpl
  }), /not allowed/);
  assert.equal(fake.captured.length, 1);
});

test('re-resolves each allowlisted redirect target', async () => {
  const fake = fakeRequest([
    { statusCode: 302, headers: { location: 'https://cdn.example.com/x' } },
    { body: '{"ok":true}' }
  ]);
  const lookedUp = [];
  const result = await safeExternalGet('https://api.example.com/start', {
    allowedHosts: ['api.example.com', 'cdn.example.com'],
    lookupAll: async host => { lookedUp.push(host); return dnsPublic(); },
    requestImpl: fake.requestImpl
  });
  assert.equal(result.statusCode, 200);
  assert.deepEqual(lookedUp, ['api.example.com', 'cdn.example.com']);
  assert.equal(fake.captured.length, 2);
});

test('rejects HTTP, non-standard ports, and literal IP URLs', async () => {
  for (const url of ['http://api.example.com/x', 'https://api.example.com:8443/x', 'https://127.0.0.1/x']) {
    await assert.rejects(safeExternalGet(url, {
      allowedHosts: ['api.example.com', '127.0.0.1'], lookupAll: dnsPublic,
      requestImpl: fakeRequest([{ body: '{}' }]).requestImpl
    }));
  }
});

test('enforces a bounded response body', async () => {
  await assert.rejects(safeExternalGet('https://api.example.com/x', {
    allowedHosts: ['api.example.com'], lookupAll: dnsPublic,
    requestImpl: fakeRequest([{ body: '123456789' }]).requestImpl, maxBytes: 8
  }), /size limit/);
});
