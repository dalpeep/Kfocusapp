import {createHmac, timingSafeEqual} from 'node:crypto';
import legacy from '../legacy-functions/coupon-used-notify.js';
import {adapt} from '../migration/adapter.mjs';

const legacyHandler = adapt(legacy.handler);
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const email = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
const reply = status => new Response(null, {status, headers: {'Cache-Control': 'no-store'}});

export default async function handler(request, context) {
  const timestamp = request.headers.get('X-Coupon-Mail-Time');
  const signature = request.headers.get('X-Coupon-Mail-Signature');
  if (timestamp === null && signature === null) return legacyHandler(request, context);
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
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!key || !from || /@resend\.dev\b/i.test(from)) return reply(503);
  try {
    const when = new Intl.DateTimeFormat('ko-KR', {dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Chicago'}).format(new Date(job.used_at));
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(6000),
      headers: {Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', 'Idempotency-Key': 'coupon-use/' + job.redemption_id + '/owner'},
      body: JSON.stringify({
        from, to: [job.recipient], subject: '달타운맵 쿠폰 사용 확정',
        text: [job.business_name || '업소', job.coupon_title || '쿠폰', when + ' (Dallas)', '사용 내역 확인: https://daltownmap.com/owner-uuid/'].join('\n'),
      }),
    });
    await response.body?.cancel();
    return reply(response.ok ? 204 : 502);
  } catch {
    return reply(502);
  }
}
