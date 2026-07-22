const ASSET_SETTINGS = {
  banner: { size: '1536x1024', label: 'wide website advertising banner', ratio: '3:2 landscape' },
  coupon: { size: '1024x1024', label: 'square promotional coupon', ratio: '1:1 square' },
  poster: { size: '1024x1536', label: 'vertical event poster', ratio: '2:3 portrait' },
  social: { size: '1024x1024', label: 'social media advertisement', ratio: '1:1 square' },
  thumbnail: { size: '1536x1024', label: 'video thumbnail', ratio: '3:2 landscape' }
};

exports.handler = async function handler(event) {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: { ...headers, Allow: 'POST' }, body: JSON.stringify({ error: 'POST 요청만 지원합니다.' }) };
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Netlify 환경변수 OPENAI_API_KEY를 먼저 설정하세요.' }) };

  try {
    const body = JSON.parse(event.body || '{}');
    const asset = String(body.asset || '').trim();
    const settings = ASSET_SETTINGS[asset];
    if (!settings) return { statusCode: 400, headers, body: JSON.stringify({ error: '지원하지 않는 이미지 종류입니다.' }) };

    const businessName = String(body.businessName || '').trim();
    const campaignName = String(body.campaignName || '').trim();
    const benefit = String(body.benefit || '').trim();
    const style = String(body.style || 'premium').trim();
    const notes = String(body.notes || '').trim();
    if (!businessName || !campaignName) return { statusCode: 400, headers, body: JSON.stringify({ error: '업소명과 캠페인명이 필요합니다.' }) };

    const prompt = [
      `Create a polished ${settings.label} background for a Korean community business campaign in Dallas.`,
      `Business context: ${businessName}. Campaign theme: ${campaignName}. Benefit concept: ${benefit || 'special promotion'}.`,
      `Visual style: ${style}, professional commercial photography, premium editorial art direction, strong focal subject, clean composition.`,
      notes ? `Additional visual context: ${notes}` : '',
      `Composition: ${settings.ratio}. Reserve a calm, high-contrast text-safe area on the left or lower third for Korean headline overlay added later by the website.`,
      'IMPORTANT: Generate the visual background only. Do not include any letters, words, logos, brand marks, numbers, UI, buttons, watermarks, signs, captions, or readable text.',
      'Avoid fake storefront signs and avoid inventing products, prices, percentages, contact details, or claims.'
    ].filter(Boolean).join('\n');

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-image-1', prompt, size: settings.size, quality: 'medium', output_format: 'png' })
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) return { statusCode: response.status || 500, headers, body: JSON.stringify({ error: json?.error?.message || 'OpenAI 이미지 생성에 실패했습니다.' }) };
    const b64 = json?.data?.[0]?.b64_json;
    if (!b64) return { statusCode: 502, headers, body: JSON.stringify({ error: '생성된 이미지 데이터가 없습니다.' }) };
    return { statusCode: 200, headers, body: JSON.stringify({ b64_json: b64, size: settings.size, asset }) };
  } catch (error) {
    console.error('generate-campaign-image:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message || '이미지 생성 중 오류가 발생했습니다.' }) };
  }
};
