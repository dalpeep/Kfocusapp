'use strict';

const SITE_ID = 'ec0bc146-8184-4627-90e0-df82ec2b06f9';
const PROJECT_REF = 'hseaeafmmjnbynfyynao';
const SUPABASE_URL = 'https://' + PROJECT_REF + '.supabase.co';

function requireTarget(env) {
  if (env.QA_SUPABASE_URL !== SUPABASE_URL) throw Error('QA_SUPABASE_TARGET_REQUIRED');
  const key = env.QA_SUPABASE_PUBLIC_KEY || '';
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
    let claims;
    try {
      if (key.split('.').length === 3) claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url'));
    } catch {}
    if (claims?.role !== 'anon' || claims.ref !== PROJECT_REF) throw Error('QA_PUBLIC_KEY_REQUIRED');
  }
  return {SUPABASE_URL, SUPABASE_ANON_KEY: key, GOOGLE_MAPS_API_KEY: env.QA_GOOGLE_MAPS_API_KEY};
}

function qaRead(url, options) {
  const target = new URL(url);
  if (target.origin !== SUPABASE_URL || target.pathname !== '/rest/v1/newsroom_items') {
    throw Error('QA_READ_TARGET_REQUIRED');
  }
  return fetch(target, {method: 'GET', headers: options.headers, redirect: 'error'});
}

module.exports = {SITE_ID, SUPABASE_URL, requireTarget, qaRead};
