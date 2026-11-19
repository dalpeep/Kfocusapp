export default async function handler() {
  const { ADMIN_MAIL_WORKER_SECRET, ADMIN_MAIL_EDGE_URL } = process.env;
  if (!ADMIN_MAIL_WORKER_SECRET || !ADMIN_MAIL_EDGE_URL) {
    return new Response(null, { status: 503 });
  }
  const response = await fetch(ADMIN_MAIL_EDGE_URL, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(25000),
    headers: {
      Authorization: 'Bearer ' + ADMIN_MAIL_WORKER_SECRET,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'work' }),
  });
  await response.body?.cancel();
  return new Response(null, { status: response.ok ? 204 : 502 });
}

export const config = { schedule: '*/2 * * * *' };
