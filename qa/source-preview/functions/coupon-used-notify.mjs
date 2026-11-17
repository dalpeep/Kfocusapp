import {createHmac, timingSafeEqual} from 'node:crypto';

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const email = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
const reply = status => new Response(null, {status, headers: {'Cache-Control': 'no-store'}});

export default async function handler(request) {
  const timestamp = request.headers.get('X-Coupon-Mail-Time');
  const signature = request.headers.get('X-Coupon-Mail-Signature');
  if (new URL(request.url).origin !== 'https://deploy-preview-59--daltownmap-owner-uuid-qa.netlify.app' ||
      process.env.SITE_ID !== 'ec0bc146-8184-4627-90e0-df82ec2b06f9') return reply(404);
  if (request.method !== 'POST') return reply(405);

  const secret = process.env.COUPON_NOTIFY_INTERNAL_SECRET;
  if (!secret || secret.length < 32 || !/^\d{10}$/.test(timestamp || '') || !/^[a-f0-9]{64}$/.test(signature || '')) return reply(401);
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 120) return reply(401);
  const body = await request.text();
  if (body.length > 4096) return reply(413);
  const expected = createHmac('sha256', secret).update(timestamp + '.' + body).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) return reply(401);

  let job;
  try { job = JSON.parse(body); } catch { return reply(400); }
  if (!job || !uuid.test(job.redemption_id || '') || !email.test(job.recipient || '') ||
      !Number.isFinite(Date.parse(job.used_at))) return reply(400);
  if (job.recipient !== process.env.QA_COUPON_NOTIFY_TO) return reply(403);
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!key || !from || /@resend\.dev\b/i.test(from)) return reply(503);
  try {
    const when = new Intl.DateTimeFormat('ko-KR', {dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Chicago'}).format(new Date(job.used_at));
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(6000),
      headers: {Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', 'Idempotency-Key': 'coupon-use/' + job.redemption_id + '/owner'},
      body: JSON.stringify({
        from, to: [job.recipient], subject: '[QA] 달타운맵 쿠폰 사용 확정',
        text: [job.business_name || '업소', job.coupon_title || '쿠폰', when + ' (Dallas)', '사용 내역 확인: https://deploy-preview-59--daltownmap-owner-uuid-qa.netlify.app/owner-uuid/'].join('\n'),
      }),
    });
    await response.body?.cancel();
    return reply(response.ok ? 204 : 502);
  } catch {
    return reply(502);
  }
}
