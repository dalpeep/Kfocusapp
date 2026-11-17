const notifyUrl = 'https://daltownmap.com/.netlify/functions/coupon-used-notify';
const encoder = new TextEncoder();
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const email = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

export function makeCouponMailScheduler({project, service, secret, waitUntil, request = fetch}) {
  const rpc = async (name, args) => {
    const response = await request(project + '/rest/v1/rpc/' + name, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(6000),
      headers: {apikey: service, Authorization: 'Bearer ' + service, 'Content-Type': 'application/json'},
      body: JSON.stringify(args),
    });
    if (!response.ok) throw Error('COUPON_MAIL_RPC');
    return response.json();
  };

  async function deliver({actor, business, coupon, proof}) {
    const job = await rpc('claim_owner_coupon_use_mail_v1', {
      p_actor: actor, p_business: business, p_coupon: coupon, p_code: proof,
    });
    if (!job || !uuid.test(job.redemption_id)) return;
    let delivery = 'failed';
    try {
      if (!email.test(job.recipient || '')) {
        delivery = 'skipped';
      } else {
        const body = JSON.stringify(job);
        const timestamp = String(Math.floor(Date.now() / 1000));
        const key = await crypto.subtle.importKey('raw', encoder.encode(secret), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
        const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(timestamp + '.' + body)));
        const signature = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
        const response = await request(notifyUrl, {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
          headers: {'Content-Type': 'application/json', 'X-Coupon-Mail-Time': timestamp, 'X-Coupon-Mail-Signature': signature},
          body,
        });
        delivery = response.status === 204 ? 'sent' : 'failed';
        await response.body?.cancel();
      }
    } catch {
      console.warn('COUPON_MAIL_DELIVERY_FAILED');
    }
    await rpc('finish_owner_coupon_use_mail_v1', {p_redemption: job.redemption_id, p_delivery: delivery});
  }

  return details => {
    if (!service || typeof secret !== 'string' || secret.length < 32) return;
    waitUntil(deliver(details).catch(() => console.warn('COUPON_MAIL_QUEUE_FAILED')));
  };
}
