'use strict';

const SITE_ID = 'ec0bc146-8184-4627-90e0-df82ec2b06f9';
const PROJECT_REF = 'hseaeafmmjnbynfyynao';
const SUPABASE_URL = 'https://' + PROJECT_REF + '.supabase.co';
const PREVIEW_HOST = 'deploy-preview-56--daltownmap-owner-uuid-qa.netlify.app';

function tokenClaims(key) {
  try {
    if (key.split('.').length === 3) return JSON.parse(Buffer.from(key.split('.')[1], 'base64url'));
  } catch {}
}

function requireTarget(env) {
  if (env.QA_SUPABASE_URL !== SUPABASE_URL) throw Error('QA_SUPABASE_TARGET_REQUIRED');
  const key = env.QA_SUPABASE_PUBLIC_KEY || '';
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
    const claims = tokenClaims(key);
    if (claims?.role !== 'anon' || claims.ref !== PROJECT_REF) throw Error('QA_PUBLIC_KEY_REQUIRED');
  }
  return {
    SUPABASE_URL, SUPABASE_ANON_KEY: key, GOOGLE_MAPS_API_KEY: env.QA_GOOGLE_MAPS_API_KEY,
    COMMUNITY_TURNSTILE_SITE_KEY: env.QA_COMMUNITY_TURNSTILE_SITE_KEY,
  };
}

function requireCommunityWrite(env, url) {
  requireTarget(env);
  if (new URL(url).origin !== 'https://' + PREVIEW_HOST) throw Error('QA_PREVIEW_HOST_REQUIRED');
  const service = env.QA_COMMUNITY_SERVICE_ROLE_KEY || '';
  const claims = tokenClaims(service);
  if (claims?.role !== 'service_role' || claims.ref !== PROJECT_REF) throw Error('QA_SERVICE_KEY_REQUIRED');
  const {QA_COMMUNITY_PASSWORD_PEPPER: pepper, QA_COMMUNITY_RATE_LIMIT_HMAC_SECRET: rateSecret,
    QA_COMMUNITY_TURNSTILE_SECRET_KEY: turnstile, QA_COMMUNITY_TURNSTILE_SITE_KEY: siteKey} = env;
  if (![pepper, rateSecret, turnstile, siteKey].every(value => value?.trim())) {
    throw Error('QA_COMMUNITY_SECURITY_SETTINGS_REQUIRED');
  }
  return {url: SUPABASE_URL, service, pepper, rateSecret, turnstile, hostname: PREVIEW_HOST,
    transport: qaCommunityFetch};
}

function qaCommunityFetch(input, options) {
  const url = new URL(input instanceof Request ? input.url : input);
  if (url.origin !== SUPABASE_URL ||
      !(url.pathname.startsWith('/rest/v1/') || url.pathname === '/auth/v1/user')) {
    throw Error('QA_COMMUNITY_TARGET_REQUIRED');
  }
  return fetch(input, {...options, redirect: 'error'});
}

function qaRead(url, options) {
  const target = new URL(url);
  if (target.origin !== SUPABASE_URL || target.pathname !== '/rest/v1/newsroom_items') {
    throw Error('QA_READ_TARGET_REQUIRED');
  }
  return fetch(target, {method: 'GET', headers: options.headers, redirect: 'error'});
}

module.exports = {SITE_ID, SUPABASE_URL, tokenClaims, requireTarget, requireCommunityWrite, qaRead};
