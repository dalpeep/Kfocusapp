(function () {
  const existing = window.APP_CONFIG || window.KFOCUS_CONFIG || {};
  window.APP_CONFIG = {
    ...existing,
    APP_VERSION: existing.APP_VERSION || '6.0.0-alpha.1',
    APP_CITY: existing.APP_CITY || existing.app_city || 'dallas',
    APP_REGION: existing.APP_REGION || existing.app_region || existing.APP_CITY || 'dallas',
    SUPABASE_URL: existing.SUPABASE_URL || window.SUPABASE_URL || '',
    SUPABASE_ANON_KEY: existing.SUPABASE_ANON_KEY || window.SUPABASE_ANON_KEY || '',
    GOOGLE_MAPS_API_KEY: existing.GOOGLE_MAPS_API_KEY || window.GOOGLE_MAPS_API_KEY || ''
  };
  window.KFOCUS_CONFIG = window.APP_CONFIG;
})();
