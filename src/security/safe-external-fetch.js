import { lookup as dnsLookup } from 'node:dns/promises';
import https from 'node:https';
import { isIP } from 'node:net';

const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const normalizeHost = value => String(value || '').toLowerCase().replace(/\.$/, '');

function isPublicIPv4(address) {
  if (isIP(address) !== 4) return false;
  const [a,b,c,d] = address.split('.').map(Number);
  if ([a,b,c,d].some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 0 || b === 168 || (b === 88 && c === 99))) return false;
  if (a === 192 && b === 0 && c === 2) return false;
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  if (a === 255 && b === 255 && c === 255 && d === 255) return false;
  return true;
}

function parseTarget(input, allowedHosts) {
  let url;
  try { url = new URL(input); } catch { throw new Error('Invalid external API URL'); }
  const host = normalizeHost(url.hostname);
  const allowed = new Set((allowedHosts || []).map(normalizeHost).filter(Boolean));
  if (url.protocol !== 'https:' || url.username || url.password || url.hash ||
      (url.port && url.port !== '443') || isIP(host) || !allowed.has(host)) {
    throw new Error('External API destination is not allowed');
  }
  return url;
}

function requestPinned(url, ip, { requestImpl, timeoutMs, maxBytes }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (err, value) => {
      if (settled) return;
      settled = true;
      err ? reject(err) : resolve(value);
    };
    let req;
    try {
      req = requestImpl({
        protocol: 'https:', hostname: url.hostname, port: 443, method: 'GET',
        path: url.pathname + url.search,
        headers: { Accept: 'application/json', 'User-Agent': 'VOOM-External-API/1.0' },
        servername: url.hostname, rejectUnauthorized: true, agent: false, maxHeaderSize: 16384,
        lookup: (hostname, options, callback) => {
          if (normalizeHost(hostname) !== normalizeHost(url.hostname)) return callback(new Error('Unexpected DNS lookup host'));
          callback(null, ip, 4);
        }
      }, res => {
        const statusCode = res.statusCode || 0, headers = res.headers || {};
        if (REDIRECTS.has(statusCode)) {
          const location = headers.location;
          res.resume?.();
          res.on('end', () => finish(null, { statusCode, headers, location, body: Buffer.alloc(0) }));
          res.on('error', error => finish(error));
          return;
        }
        const declared = Number(headers['content-length']);
        if (Number.isFinite(declared) && declared > maxBytes) {
          res.destroy?.();
          finish(new Error('External API response exceeds size limit'));
          return;
        }
        const chunks = [];
        let total = 0;
        res.on('data', chunk => {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          total += buf.length;
          if (total > maxBytes) {
            res.destroy?.();
            finish(new Error('External API response exceeds size limit'));
          } else chunks.push(buf);
        });
        res.on('end', () => finish(null, { statusCode, headers, body: Buffer.concat(chunks, total) }));
        res.on('error', error => finish(error));
        res.on('aborted', () => finish(new Error('External API response was aborted')));
      });
    } catch (error) { finish(error); return; }
    req.on('error', error => finish(error));
    req.setTimeout?.(timeoutMs, () => req.destroy(new Error('External API request timed out')));
    req.end();
  });
}

export async function safeExternalGet(input, {
  allowedHosts, lookupAll = host => dnsLookup(host, { family: 4, all: true, verbatim: true }),
  requestImpl = https.request, timeoutMs = 5000, maxBytes = 1024 * 1024, maxRedirects = 3
} = {}) {
  let current = parseTarget(input, allowedHosts);
  for (let redirects = 0; ; redirects += 1) {
    let records;
    try { records = await lookupAll(normalizeHost(current.hostname)); }
    catch { throw new Error('External API DNS resolution failed'); }
    if (!Array.isArray(records) || records.length === 0 || records.some(r => !r || !isPublicIPv4(r.address))) {
      throw new Error('External API destination resolved to a non-public address');
    }
    const response = await requestPinned(current, records[0].address, { requestImpl, timeoutMs, maxBytes });
    if (!REDIRECTS.has(response.statusCode)) return { ...response, url: current.toString() };
    if (!response.location || redirects >= maxRedirects) throw new Error('External API redirect limit exceeded');
    try { current = parseTarget(new URL(response.location, current).toString(), allowedHosts); }
    catch (error) { throw error instanceof Error ? error : new Error('Invalid external API redirect'); }
  }
}
