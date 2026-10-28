const { createClient } = require('@supabase/supabase-js');

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    },
    body: JSON.stringify(body)
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true });
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !serviceKey || !anonKey) return json(500, { ok: false, error: 'Supabase environment variables are missing.' });

  const region = String((event.queryStringParameters || {}).region || 'dallas').trim().toLowerCase();
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  try {
    if (event.httpMethod === 'GET') {
      const { data, error } = await admin.from('newsroom_settings').select('home_config,updated_at').eq('region', region).maybeSingle();
      if (error) throw error;
      return json(200, { ok: true, region, home_config: data?.home_config || {}, updated_at: data?.updated_at || null });
    }

    if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Method not allowed' });

    const authHeader = event.headers.authorization || event.headers.Authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) return json(401, { ok: false, error: '관리자 로그인 토큰이 없습니다.' });
    const authClient = createClient(url, anonKey, { auth: { persistSession: false } });
    const { data: userData, error: userError } = await authClient.auth.getUser(token);
    if (userError || !userData?.user) return json(401, { ok: false, error: '관리자 로그인 세션이 유효하지 않습니다.' });

    const body = JSON.parse(event.body || '{}');
    const incoming = body.home_config && typeof body.home_config === 'object' ? body.home_config : {};
    const { data: current, error: currentError } = await admin.from('newsroom_settings').select('home_config').eq('region', region).maybeSingle();
    if (currentError) throw currentError;
    const merged = { ...(current?.home_config || {}), ...incoming };
    const { data, error } = await admin.from('newsroom_settings').upsert({ region, home_config: merged, updated_at: new Date().toISOString() }, { onConflict: 'region' }).select('home_config,updated_at').single();
    if (error) throw error;
    return json(200, { ok: true, region, home_config: data.home_config || {}, updated_at: data.updated_at });
  } catch (error) {
    console.error('[runtime-settings]', error);
    return json(500, { ok: false, error: error.message || String(error) });
  }
};
