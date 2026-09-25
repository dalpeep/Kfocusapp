const crypto = require('node:crypto');
const { verifyAdmin } = require('./community-security');

const ORIGIN = 'https://daltownmap.com';
const REDIRECT_URI = `${ORIGIN}/.netlify/functions/community-youtube-oauth-callback`;
const SCOPE = 'https://www.googleapis.com/auth/youtube.upload';
const STATE_TTL_MS = 5 * 60 * 1000;
const AAD = Buffer.from('daltownmap-youtube-refresh-token-v1');

function reply(statusCode, body, extra = {}) {
  return { statusCode, headers: {
    'Cache-Control': 'no-store, max-age=0', Pragma: 'no-cache',
    'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox", ...extra
  }, body };
}
function json(statusCode, value) {
  return reply(statusCode, JSON.stringify(value), { 'Content-Type': 'application/json; charset=utf-8' });
}
function fail(statusCode) { return json(statusCode, { ok: false, error: 'OAuth bootstrap unavailable.' }); }
function configured(env) {
  return typeof env.COMMUNITY_YOUTUBE_OAUTH_CLIENT_ID === 'string' && !!env.COMMUNITY_YOUTUBE_OAUTH_CLIENT_ID &&
    typeof env.COMMUNITY_YOUTUBE_OAUTH_CLIENT_SECRET === 'string' && !!env.COMMUNITY_YOUTUBE_OAUTH_CLIENT_SECRET &&
    typeof env.COMMUNITY_YOUTUBE_OAUTH_STATE_SECRET === 'string' &&
    Buffer.byteLength(env.COMMUNITY_YOUTUBE_OAUTH_STATE_SECRET) >= 32;
}
function production(event, env) {
  return String(event.headers?.host || event.headers?.Host || '').toLowerCase() === 'daltownmap.com' &&
    (!env.CONTEXT || env.CONTEXT === 'production');
}
function publicKeyFromPem(pem) {
  if (typeof pem !== 'string' || pem.length > 2000 ||
      !/^-----BEGIN PUBLIC KEY-----\r?\n[\s\S]+\r?\n-----END PUBLIC KEY-----\s*$/.test(pem)) throw new Error('Invalid public key');
  const key = crypto.createPublicKey(pem);
  if (key.asymmetricKeyType !== 'rsa' || ![2048, 3072, 4096].includes(key.asymmetricKeyDetails?.modulusLength))
    throw new Error('Invalid public key');
  return key;
}
function signState(payload, secret) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', secret).update(`youtube-oauth-state-v1.${data}`).digest('base64url');
  return `${data}.${mac}`;
}
function verifyState(state, secret, now) {
  if (typeof state !== 'string' || state.length > 3500) throw new Error('Invalid state');
  const parts = state.split('.');
  if (parts.length !== 2) throw new Error('Invalid state');
  const [data, mac] = parts;
  const expected = crypto.createHmac('sha256', secret).update(`youtube-oauth-state-v1.${data}`).digest();
  const received = Buffer.from(mac, 'base64url');
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) throw new Error('Invalid state');
  const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
  if (payload.v !== 1 || !/^[A-Za-z0-9_-]{43}$/.test(payload.n || '') ||
      !Number.isSafeInteger(payload.iat) || now < payload.iat || now - payload.iat > STATE_TTL_MS ||
      typeof payload.pk !== 'string' || payload.pk.length > 1500) throw new Error('Expired state');
  const key = crypto.createPublicKey({ key: Buffer.from(payload.pk, 'base64url'), format: 'der', type: 'spki' });
  if (key.asymmetricKeyType !== 'rsa' || ![2048, 3072, 4096].includes(key.asymmetricKeyDetails?.modulusLength))
    throw new Error('Invalid public key');
  return key;
}
function encryptToken(token, key) {
  const symmetricKey = crypto.randomBytes(32), iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', symmetricKey, iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const encryptedKey = crypto.publicEncrypt({ key, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, symmetricKey);
  return JSON.stringify({ format: 'daltownmap-youtube-refresh-token-v1',
    encrypted_key: encryptedKey.toString('base64url'), iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'), ciphertext: ciphertext.toString('base64url') });
}
async function isTrustedSuperAdmin(auth) {
  if (auth.role !== 'super_admin' || !auth.user?.id || !auth.db) return false;
  const { data, error } = await auth.db.from('profiles').select('role').eq('user_id', auth.user.id).maybeSingle();
  if (error) return false;
  if (data) return data.role === 'super_admin';
  // Auth app_metadata is server-controlled; user_metadata is deliberately not trusted here.
  return auth.user.app_metadata?.role === 'super_admin';
}

function startHandler({ env = process.env, admin = verifyAdmin, now = Date.now } = {}) {
  return async event => {
    if (event.httpMethod !== 'POST') return fail(405);
    if (!production(event, env) || !configured(env) || env.COMMUNITY_YOUTUBE_REFRESH_TOKEN) return fail(503);
    const origin = event.headers?.origin || event.headers?.Origin;
    if (origin && origin !== ORIGIN) return fail(403);
    let auth;
    try { auth = await admin(event, 'dallas'); } catch { return fail(403); }
    try { if (!await isTrustedSuperAdmin(auth)) return fail(403); } catch { return fail(403); }
    let key;
    try {
      if (Buffer.byteLength(event.body || '') > 3000) return fail(400);
      key = publicKeyFromPem(JSON.parse(event.body || '{}').public_key);
    } catch { return fail(400); }
    const state = signState({ v: 1, n: crypto.randomBytes(32).toString('base64url'), iat: now(),
      pk: key.export({ format: 'der', type: 'spki' }).toString('base64url') }, env.COMMUNITY_YOUTUBE_OAUTH_STATE_SECRET);
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', env.COMMUNITY_YOUTUBE_OAUTH_CLIENT_ID);
    url.searchParams.set('redirect_uri', REDIRECT_URI);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', SCOPE);
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('state', state);
    return json(200, { ok: true, authorization_url: url.toString(), expires_in_seconds: STATE_TTL_MS / 1000 });
  };
}
function callbackHandler({ env = process.env, fetcher = fetch, now = Date.now } = {}) {
  return async event => {
    if (event.httpMethod !== 'GET') return fail(405);
    if (!production(event, env) || !configured(env) || env.COMMUNITY_YOUTUBE_REFRESH_TOKEN) return fail(503);
    let key, code;
    try {
      const url = new URL(event.rawUrl || `${ORIGIN}${event.path || '/'}${event.rawQuery ? `?${event.rawQuery}` : ''}`);
      if (url.origin !== ORIGIN || url.pathname !== '/.netlify/functions/community-youtube-oauth-callback' ||
          url.searchParams.getAll('state').length !== 1 || url.searchParams.getAll('code').length !== 1 ||
          url.searchParams.has('error')) return fail(400);
      code = url.searchParams.get('code');
      if (!code || code.length > 2048) return fail(400);
      key = verifyState(url.searchParams.get('state'), env.COMMUNITY_YOUTUBE_OAUTH_STATE_SECRET, now());
    } catch { return fail(400); }
    try {
      // One exchange attempt only: never retry an authorization code or log a token response.
      const res = await fetcher('https://oauth2.googleapis.com/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code, client_id: env.COMMUNITY_YOUTUBE_OAUTH_CLIENT_ID,
          client_secret: env.COMMUNITY_YOUTUBE_OAUTH_CLIENT_SECRET, redirect_uri: REDIRECT_URI,
          grant_type: 'authorization_code' }), signal: AbortSignal.timeout(10000)
      });
      const tokens = await res.json();
      if (!res.ok || typeof tokens.refresh_token !== 'string' || !tokens.refresh_token ||
          tokens.scope?.split(' ').includes(SCOPE) === false) return fail(502);
      const encrypted = encryptToken(tokens.refresh_token, key);
      return reply(200, encrypted, { 'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename="daltownmap-youtube-refresh-token.enc.json"' });
    } catch { return fail(502); }
  };
}

module.exports = { startHandler, callbackHandler, REDIRECT_URI, SCOPE };
