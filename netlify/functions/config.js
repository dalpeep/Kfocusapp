exports.handler = async () => {
  const cfg = {
    SUPABASE_URL: process.env.SUPABASE_URL || "",
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || "",
    GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY || ""
  };

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-store"
    },
    body: `
window.APP_CONFIG = ${JSON.stringify(cfg)};
window.KFOCUS_CONFIG = ${JSON.stringify(cfg)};
`
  };
};