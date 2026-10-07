const { requireTestPreview } = require('../functions/lib/test-preview-guard');

exports.handler = async (...args) => {
    // Server logs only: never log values, JWT claims, lengths, or request data.
    const keys = [
      'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
      'COMMUNITY_PASSWORD_PEPPER', 'COMMUNITY_RATE_LIMIT_HMAC_SECRET',
      'COMMUNITY_TURNSTILE_SECRET_KEY'
    ];
    console.error('[Test Preview config] environment presence',
      Object.fromEntries(keys.map(key => [key, process.env[key] ? 'present' : 'missing'])));
  try {
    requireTestPreview();
  } catch {
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' },
      body: 'Test Preview configuration unavailable.'
    };
  }
  return require('../functions/config').handler(...args);
};
