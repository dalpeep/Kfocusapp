const TEST_REF = 'aaikttogoejfvxbosktg';
const PRODUCTION_REF = 'ydrxuqmjzayejlnjzzew';

function refOf(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co')) return '';
    return url.hostname.split('.')[0];
  } catch { return ''; }
}

function assertTestPreview(env = process.env, {requireService = true} = {}) {
  if (env.TEST_PREVIEW_MODE !== 'true') {
    if (env.TEST_NETLIFY_SITE_ID || env.TEST_SUPABASE_PROJECT_REF)
      throw new Error('Incomplete Test Preview configuration.');
    return false;
  }
  const siteId = String(env.SITE_ID || '');
  const expectedSiteId = String(env.TEST_NETLIFY_SITE_ID || '');
  if (!siteId || !expectedSiteId || siteId !== expectedSiteId)
    throw new Error('Test Preview Netlify site identity mismatch.');
  if (String(env.TEST_SUPABASE_PROJECT_REF || '') !== TEST_REF)
    throw new Error('Test Preview project identity mismatch.');
  const candidates = [env.SUPABASE_URL, env.VITE_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_URL]
    .filter(Boolean);
  if (!candidates.length || candidates.some(url => refOf(url) !== TEST_REF))
    throw new Error('Test Preview Supabase URL mismatch.');
  if (candidates.some(url => refOf(url) === PRODUCTION_REF))
    throw new Error('Production Supabase URL is forbidden in Test Preview.');
  if (!env.SUPABASE_ANON_KEY || (requireService && !env.SUPABASE_SERVICE_ROLE_KEY))
    throw new Error('Test Preview Supabase keys are missing.');
  for (const [key, role] of [[env.SUPABASE_ANON_KEY,'anon'], [env.SUPABASE_SERVICE_ROLE_KEY,'service_role']]) {
    if (!key) continue;
    let claims;
    try { claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8')); }
    catch { throw new Error('Test Preview requires project-verifiable legacy JWT keys.'); }
    if (claims.ref !== TEST_REF || claims.role !== role)
      throw new Error('Test Preview Supabase key project or role mismatch.');
  }
  if (env.SUPABASE_SERVICE_ROLE_KEY && env.SUPABASE_ANON_KEY === env.SUPABASE_SERVICE_ROLE_KEY)
    throw new Error('Test Preview Supabase roles must use distinct keys.');
  if (env.SUPABASE_SERVICE_KEY || env.VITE_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    throw new Error('Test Preview legacy Supabase aliases are forbidden.');
  let appUrl;
  try { appUrl = new URL(String(env.APP_PUBLIC_URL || '')); } catch { appUrl = null; }
  if (!appUrl || appUrl.protocol !== 'https:' || !env.SITE_NAME ||
      appUrl.hostname !== `${env.SITE_NAME}.netlify.app`)
    throw new Error('Test Preview public URL must use the isolated Netlify site.');
  if (env.COUPON_EMAIL_MODE !== 'dry-run' || env.RESEND_API_KEY)
    throw new Error('Test Preview must use coupon email dry-run without Resend credentials.');
  return true;
}

function requireTestPreview(env = process.env) {
  if (!assertTestPreview(env)) throw new Error('This Function is Test Preview only.');
  return true;
}

module.exports = { TEST_REF, PRODUCTION_REF, refOf, assertTestPreview, requireTestPreview };
