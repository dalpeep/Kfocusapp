const json = (statusCode, body) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  },
  body: JSON.stringify(body)
});

function splitEmails(value){
  const raw = Array.isArray(value) ? value.join('\n') : String(value || '');
  const seen = new Set();
  return raw
    .split(/[\n,;]+/)
    .map(v => v.trim())
    .filter(Boolean)
    .filter(email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    .filter(email => {
      const key = email.toLowerCase();
      if(seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function esc(value){
  return String(value || '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[ch]));
}

exports.handler = async (event) => {
  if(event.httpMethod === 'OPTIONS') return json(200, { ok:true });
  if(event.httpMethod !== 'POST') return json(405, { ok:false, error:'Method not allowed' });

  let payload = {};
  try {
    payload = JSON.parse(event.body || '{}');
  } catch(e){
    return json(400, { ok:false, error:'Invalid JSON body' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if(!apiKey){
    return json(500, { ok:false, error:'RESEND_API_KEY is not set in Netlify environment variables' });
  }

  const to = splitEmails(payload.notify_emails);
  if(!to.length){
    return json(200, { ok:true, skipped:true, reason:'No valid recipient emails' });
  }

  const from = process.env.RESEND_FROM_EMAIL || 'DalTownMap <onboarding@resend.dev>';
  const replyTo = process.env.RESEND_REPLY_TO || undefined;
  const businessName = payload.business_name || '업소';
  const couponTitle = payload.coupon_title || '쿠폰';
  const usedAt = new Date().toLocaleString('ko-KR', {
  timeZone: 'America/Chicago'
  });
  

  const subject = `🔔 [DalTownMap] ${businessName} 쿠폰 사용 알림`;
  const text = [
    'DalTownMap 쿠폰 사용 알림',
    '',
    `업소명: ${businessName}`,
    `쿠폰명: ${couponTitle}`,
    `사용시간: ${usedAt}`,
    
    '',
    '이 메일은 DalTownMap 쿠폰 사용 확인 버튼을 통해 자동 발송되었습니다.'
  ].filter(Boolean).join('\n');

  const html = `
    <div style="font-family:Arial,'Noto Sans KR',sans-serif;line-height:1.6;color:#0f172a;max-width:560px">
      <h2 style="margin:0 0 12px;color:#1d4ed8">DalTownMap 쿠폰 사용 알림</h2>
      <div style="border:1px solid #d9e2ef;border-radius:14px;padding:16px;background:#f8fbff">
        <p><b>업소명</b><br>${esc(businessName)}</p>
        <p><b>쿠폰명</b><br>${esc(couponTitle)}</p>
        <p><b>사용시간</b><br>${esc(usedAt)}</p>
        
      </div>
      <p style="font-size:12px;color:#64748b;margin-top:14px">
        이 메일은 DalTownMap 쿠폰 사용 확인 버튼을 통해 자동 발송되었습니다.
      </p>
    </div>
  `;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from,
        to,
        subject,
        text,
        html,
        ...(replyTo ? { reply_to: replyTo } : {})
      })
    });

    const resultText = await response.text();
    let result;
    try { result = JSON.parse(resultText); } catch { result = { raw: resultText }; }

    if(!response.ok){
      return json(response.status, { ok:false, error:'Resend API error', detail: result });
    }

    return json(200, { ok:true, sent_to: to, result });
  } catch(e){
    return json(500, { ok:false, error:e.message || String(e) });
  }
};
