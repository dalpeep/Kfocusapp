// Project only public settings into the build guard; never read server secrets.
module.exports = function previewBuildEnv(env) {
  const keys = ['TEST_PREVIEW_MODE','SITE_ID','TEST_NETLIFY_SITE_ID','SITE_NAME',
    'TEST_SUPABASE_PROJECT_REF','SUPABASE_URL','SUPABASE_ANON_KEY','APP_PUBLIC_URL',
    'COUPON_EMAIL_MODE','VITE_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY','NEXT_PUBLIC_SUPABASE_ANON_KEY'];
  const projected = Object.fromEntries(keys.map(key => [key, env[key]]));
  // Reject forbidden credential/alias names without reading their values.
  for (const key of ['RESEND_API_KEY','SUPABASE_SERVICE_KEY']) {
    if (key in env) projected[key] = 'forbidden';
  }
  return projected;
};
