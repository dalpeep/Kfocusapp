function stop(code) { const error = new Error(code); error.code = code; throw error; }
function validate(url, key) {
  let parsed; try { parsed = new URL(url); } catch { stop('SEO_PUBLIC_URL_INVALID'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash || !/^[a-z0-9]{20}\.supabase\.co$/.test(parsed.hostname)) stop('SEO_PUBLIC_URL_INVALID');
  if (typeof key !== 'string' || !key) stop('SEO_PUBLIC_KEY_MISSING');
  if (key.startsWith('sb_publishable_')) return { url: parsed.origin, key };
  let claims; try { claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url')); } catch { stop('SEO_PUBLIC_KEY_INVALID'); }
  if (key.split('.').length !== 3 || claims.role !== 'anon' || claims.ref !== parsed.hostname.split('.')[0] || (claims.exp && claims.exp <= Date.now()/1000)) stop('SEO_PUBLIC_KEY_INVALID');
  return { url: parsed.origin, key };
}
async function resolvePublicAuth(env = process.env) {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url) stop('SEO_PUBLIC_URL_MISSING');
  // Includes Netlify shared variables already resolved for the Builds scope.
  // Never fall back to elevated credentials or a remote configuration endpoint.
  return { ...validate(url, key), source: 'public-environment' };
}
module.exports = { resolvePublicAuth, validate, stop };
