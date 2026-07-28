exports.handler = async function () {
  const supabaseUrl = process.env.SUPABASE_URL;
  const cronSecret = process.env.NEWSROOM_CRON_SECRET;
  const functionName = process.env.NEWSROOM_FUNCTION_NAME || 'newsroom';
  if (!supabaseUrl || !cronSecret) return { statusCode: 500, body: 'Missing SUPABASE_URL or NEWSROOM_CRON_SECRET' };
  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/${encodeURIComponent(functionName)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-cron-secret': cronSecret },
    body: JSON.stringify({ action: 'collect', region: 'dallas', scheduled: true })
  });
  const body = await response.text();
  if (!response.ok) return { statusCode: response.status, body };
  return { statusCode: 200, body };
};
exports.config = { schedule: '0 11 * * *' }; // 06:00 Dallas during CDT; see release notes for DST
