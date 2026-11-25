const DEFAULT_TIMEOUT_MS = 5000;
const MAX_BEARER_TOKEN_LENGTH = 8192;

function jsonError(res, status, error) {
  res.set('Cache-Control', 'no-store');
  return res.status(status).json({ error });
}

function getBearerToken(header) {
  if (typeof header !== 'string') return null;
  const match = /^Bearer ([^\s]+)$/i.exec(header);
  if (!match || match[1].length > MAX_BEARER_TOKEN_LENGTH) return null;
  return match[1];
}

function getSupabaseConfig(env) {
  const rawUrl = env.SUPABASE_URL;
  const apiKey = env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY;
  if (!rawUrl || !apiKey) return null;

  let base;
  try {
    base = new URL(rawUrl);
  } catch {
    return null;
  }

  const localHttp = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  if (base.protocol !== 'https:' && !(localHttp && base.protocol === 'http:')) return null;
  if (base.username || base.password || base.search || base.hash) return null;

  return { userUrl: new URL('/auth/v1/user', base).toString(), apiKey };
}

/**
 * Authenticate an admin request using Supabase Auth's authoritative /user endpoint.
 * Authorization is based only on server-returned app_metadata, never user_metadata
 * or unverified JWT payloads. Missing configuration fails closed.
 */
export function createSupabaseAdminAuth({
  env = process.env,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  return async function requireSupabaseAdmin(req, res, next) {
    const config = getSupabaseConfig(env);
    if (!config || typeof fetchImpl !== 'function') {
      return jsonError(res, 503, 'Admin authentication is not configured');
    }

    const token = getBearerToken(req.get?.('authorization') || req.headers?.authorization);
    if (!token) return jsonError(res, 401, 'Authentication required');

    let response;
    try {
      response = await fetchImpl(config.userUrl, {
        method: 'GET',
        headers: {
          apikey: config.apiKey,
          Authorization: `Bearer ${token}`,
          Accept: 'application/json'
        },
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch {
      return jsonError(res, 503, 'Authentication service unavailable');
    }

    if (response.status === 401 || response.status === 403) {
      return jsonError(res, 401, 'Invalid or expired session');
    }
    if (!response.ok) {
      return jsonError(res, 503, 'Authentication service unavailable');
    }

    let user;
    try {
      user = await response.json();
    } catch {
      return jsonError(res, 503, 'Authentication service returned an invalid response');
    }

    if (!user || typeof user.id !== 'string' || !user.id ||
        !user.app_metadata || typeof user.app_metadata !== 'object' ||
        Array.isArray(user.app_metadata)) {
      return jsonError(res, 401, 'Invalid authenticated user');
    }

    if (user.app_metadata.role !== 'admin') {
      return jsonError(res, 403, 'Administrator role required');
    }

    req.adminUser = Object.freeze({ id: user.id, email: typeof user.email === 'string' ? user.email : null });
    res.set('Cache-Control', 'no-store');
    return next();
  };
}
