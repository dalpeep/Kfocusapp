import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import test from 'node:test';
import handler from '../../netlify/functions/coupon-used-notify.mjs';
import {makeCouponMailScheduler} from '../../supabase/functions/_shared/coupon-use-mail.mjs';

const redemption = '10000000-0000-4000-8000-000000000007';
const secret = 'fixture-only-internal-signing-secret';
const job = {
  redemption_id: redemption,
  recipient: 'owner@example.invalid',
  coupon_title: 'QA coupon',
  used_at: '2026-11-17T12:00:00Z',
};

test('signed coupon notification rejects tampering and stale requests before Resend', async t => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('Untrusted request reached Resend'));
  t.mock.method(Date, 'now', () => 1794916800000);
  const previous = process.env.COUPON_NOTIFY_INTERNAL_SECRET;
  process.env.COUPON_NOTIFY_INTERNAL_SECRET = secret;
  t.after(() => {
    if (previous === undefined) delete process.env.COUPON_NOTIFY_INTERNAL_SECRET;
    else process.env.COUPON_NOTIFY_INTERNAL_SECRET = previous;
  });

  const body = JSON.stringify(job);
  for (const [age, data] of [[0, body + ' '], [121, body]]) {
    const timestamp = String(Math.floor(Date.now() / 1000) - age);
    const signature = createHmac('sha256', secret).update(timestamp + '.' + body).digest('hex');
    const response = await handler(new Request('https://fixture.invalid', {
      method: 'POST',
      headers: {'X-Coupon-Mail-Time': timestamp, 'X-Coupon-Mail-Signature': signature},
      body: data,
    }));
    assert.equal(response.status, 401);
  }
});

test('coupon redemption mail records provider failure without a second send', async t => {
  const previous = Object.fromEntries(['COUPON_NOTIFY_INTERNAL_SECRET','RESEND_API_KEY','RESEND_FROM_EMAIL'].map(name => [name,process.env[name]]));
  Object.assign(process.env, {COUPON_NOTIFY_INTERNAL_SECRET:secret,RESEND_API_KEY:'fixture',RESEND_FROM_EMAIL:'sender@example.invalid'});
  t.after(() => {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  const provider = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.resend.com/emails');
    assert.equal(options.headers['Idempotency-Key'], 'coupon-use/' + redemption + '/owner');
    assert.deepEqual(JSON.parse(options.body).to, [job.recipient]);
    return new Response(null, {status: 503});
  });
  let claimed = false;
  const outcomes = [];
  const jobs = [];
  const request = async (url, options) => {
    if (url.endsWith('claim_owner_coupon_use_mail_v1')) {
      const result = claimed ? null : job;
      claimed = true;
      return Response.json(result);
    }
    if (url.endsWith('finish_owner_coupon_use_mail_v1')) {
      outcomes.push(JSON.parse(options.body));
      return Response.json(null);
    }
    assert.ok(url.endsWith('/coupon-used-notify'));
    return handler(new Request(url, options));
  };
  const schedule = makeCouponMailScheduler({
    project:'https://fixture.invalid', service:'fixture', secret,
    waitUntil: promise => jobs.push(promise), request,
  });
  schedule({actor:redemption,business:redemption,coupon:redemption,proof:'ABCDEF'});
  schedule({actor:redemption,business:redemption,coupon:redemption,proof:'ABCDEF'});
  await Promise.all(jobs);
  assert.equal(provider.mock.callCount(), 1);
  assert.deepEqual(outcomes, [{p_redemption:redemption,p_delivery:'failed'}]);
});
