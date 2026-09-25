const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { startHandler, callbackHandler, REDIRECT_URI, SCOPE } = require('../netlify/functions/lib/community-youtube-oauth');

const env = { COMMUNITY_YOUTUBE_OAUTH_CLIENT_ID: 'test-client-id',
  COMMUNITY_YOUTUBE_OAUTH_CLIENT_SECRET: 'test-client-secret',
  COMMUNITY_YOUTUBE_OAUTH_STATE_SECRET: 'synthetic-state-secret-at-least-thirty-two-bytes' };
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const public_key = publicKey.export({ format: 'pem', type: 'spki' });
const startEvent = { httpMethod: 'POST', headers: { host: 'daltownmap.com', origin: 'https://daltownmap.com' },
  body: JSON.stringify({ public_key }) };
const callbackEvent = (state, code = 'one-use-code') => ({ httpMethod: 'GET', headers: { host: 'daltownmap.com' },
  rawUrl: `${REDIRECT_URI}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}` });
const superAdmin = async () => ({ role: 'super_admin', user: { id: 'test-admin' }, db: {
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: 'super_admin' }, error: null }) }) }) })
} });
async function authorized() {
  const result = await startHandler({ env, now: () => 1000000, admin: superAdmin })(startEvent);
  assert.equal(result.statusCode, 200);
  const url = new URL(JSON.parse(result.body).authorization_url);
  return url;
}

test('only Production super_admin can create a narrowly scoped offline consent URL', async () => {
  const url = await authorized();
  assert.equal(url.origin, 'https://accounts.google.com');
  assert.equal(url.searchParams.get('redirect_uri'), REDIRECT_URI);
  assert.equal(url.searchParams.get('scope'), SCOPE);
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.equal(url.searchParams.get('prompt'), 'consent');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal((await startHandler({ env, admin: async () => ({ role: 'regional_editor' }) })(startEvent)).statusCode, 403);
  assert.equal((await startHandler({ env, admin: async () => { throw new Error('auth'); } })(startEvent)).statusCode, 403);
  assert.equal((await startHandler({ env, admin: superAdmin })({ ...startEvent,
    headers: { host: 'deploy-preview-18--example.netlify.app' } })).statusCode, 503);
  assert.equal((await startHandler({ env: { ...env, COMMUNITY_YOUTUBE_REFRESH_TOKEN: 'existing' },
    admin: superAdmin })(startEvent)).statusCode, 503);
  assert.equal((await startHandler({ env, admin: async () => ({ role: 'super_admin', user: {
    id: 'forged', user_metadata: { role: 'super_admin' }
  }, db: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) } })
  })(startEvent)).statusCode, 403);
});

test('callback verifies state, exchanges code exactly once, and only delivers encrypted artifact', async () => {
  const url = await authorized();
  let calls = 0;
  const response = await callbackHandler({ env, now: () => 1000001, fetcher: async (endpoint, options) => {
    calls++;
    assert.equal(endpoint, 'https://oauth2.googleapis.com/token');
    assert.equal(options.body.get('grant_type'), 'authorization_code');
    assert.equal(options.body.get('redirect_uri'), REDIRECT_URI);
    assert.equal(options.body.get('client_secret'), env.COMMUNITY_YOUTUBE_OAUTH_CLIENT_SECRET);
    return { ok: true, json: async () => ({ access_token: 'synthetic-access-token',
      refresh_token: 'synthetic-refresh-token', scope: SCOPE }) };
  } })(callbackEvent(url.searchParams.get('state')));
  assert.equal(calls, 1);
  assert.equal(response.statusCode, 200);
  assert.match(response.headers['Content-Disposition'], /attachment/);
  assert.equal(response.headers['Cache-Control'], 'no-store, max-age=0');
  assert.doesNotMatch(response.body, /synthetic-(refresh|access)-token|test-client-secret/);
  const envelope = JSON.parse(response.body);
  const symmetricKey = crypto.privateDecrypt({ key: privateKey,
    padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
  Buffer.from(envelope.encrypted_key, 'base64url'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', symmetricKey, Buffer.from(envelope.iv, 'base64url'));
  decipher.setAAD(Buffer.from(envelope.format));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64url'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64url')), decipher.final()]).toString();
  assert.equal(plaintext, 'synthetic-refresh-token');
});

test('invalid, expired, duplicate or missing state never reaches Google token exchange', async () => {
  const state = (await authorized()).searchParams.get('state');
  let calls = 0;
  const fetcher = async () => { calls++; throw new Error('must not exchange'); };
  const handler = callbackHandler({ env, now: () => 1000001, fetcher });
  const bad = [callbackEvent(`${state}x`), callbackEvent(state, ''),
    { ...callbackEvent(state), rawUrl: `${callbackEvent(state).rawUrl}&state=again` },
    { ...callbackEvent(state), rawUrl: `${callbackEvent(state).rawUrl}&code=again` },
    { ...callbackEvent(state), rawUrl: `${callbackEvent(state).rawUrl}&error=access_denied` }];
  for (const event of bad) assert.equal((await handler(event)).statusCode, 400);
  assert.equal((await callbackHandler({ env, now: () => 1000000 + 6 * 60 * 1000,
    fetcher })(callbackEvent(state))).statusCode, 400);
  assert.equal(calls, 0);
});

test('missing refresh token fails closed without returning access token', async () => {
  const state = (await authorized()).searchParams.get('state');
  const result = await callbackHandler({ env, now: () => 1000001,
    fetcher: async () => ({ ok: true, json: async () => ({ access_token: 'must-not-leak' }) }) })(callbackEvent(state));
  assert.equal(result.statusCode, 502);
  assert.doesNotMatch(result.body, /must-not-leak/);
});
