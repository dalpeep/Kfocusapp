// Paste this into the browser console on the logged-in admin page.
(async () => {
  const cfg = window.KFOCUS_CONFIG || {};
  const client = window.supabase;
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || !client) {
    console.error('Supabase configuration/client not found.');
    return;
  }
  const { data: { session } } = await client.auth.getSession();
  const token = session?.access_token || cfg.SUPABASE_ANON_KEY;
  const name = cfg.NEWSROOM_FUNCTION_NAME || 'newsroom';
  const response = await fetch(`${cfg.SUPABASE_URL.replace(/\/$/, '')}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: cfg.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action: 'version' }),
  });
  console.log('HTTP', response.status, await response.json());
})();
