function dallasParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  }).formatToParts(date);
  return Object.fromEntries(parts.map((p) => [p.type, p.value]));
}

exports.handler = async function () {
  const supabaseUrl = process.env.SUPABASE_URL;
  const cronSecret = process.env.NEWSROOM_CRON_SECRET;
  const functionName = process.env.NEWSROOM_FUNCTION_NAME || 'newsroom';
  if (!supabaseUrl || !cronSecret) return { statusCode: 500, body: 'Missing SUPABASE_URL or NEWSROOM_CRON_SECRET' };

  // 11:00/12:00 UTC 두 번 호출하되 Dallas 오전 6시에만 실행하여 DST를 자동 처리합니다.
  const local = dallasParts();
  if (Number(local.hour) !== 6) {
    return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: true, reason: 'not_6am_dallas', local }) };
  }

  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/${encodeURIComponent(functionName)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-cron-secret': cronSecret },
    body: JSON.stringify({ action: 'auto_run', region: 'dallas', scheduled: true })
  });
  const body = await response.text();
  if (!response.ok) return { statusCode: response.status, body };
  return { statusCode: 200, body };
};
exports.config = { schedule: '0 11,12 * * *' };
