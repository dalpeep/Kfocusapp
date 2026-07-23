const ASSET_SETTINGS = {
  banner: { size: '1536x1024', label: 'wide website advertising banner', ratio: '3:2 landscape' },
  coupon: { size: '1024x1024', label: 'square promotional coupon', ratio: '1:1 square' }
};

const STYLE_GUIDES = {
  premium: 'premium editorial advertising, refined composition, rich but restrained materials',
  modern: 'clean modern commercial design, bright natural lighting, minimal contemporary composition',
  luxury: 'luxury commercial photography, elegant dark neutrals, subtle gold accents, sophisticated lighting',
  food: 'appetizing food advertising photography, fresh ingredients, warm inviting restaurant atmosphere',
  medical: 'clean trustworthy healthcare advertising, bright clinical calm, soft natural blue and white atmosphere, no medical claims',
  beauty: 'polished beauty and wellness advertising, luminous soft lighting, elegant skincare editorial mood',
  kids: 'friendly family-oriented advertising, cheerful clean setting, playful but professional atmosphere'
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
    const category = String(body.category || '').trim();
    const styleKey = STYLE_GUIDES[body.style] ? body.style : 'premium';
    const notes = String(body.notes || '').trim();
    if (!businessName || !campaignName) return { statusCode: 400, headers, body: JSON.stringify({ error: '업소명과 제목이 필요합니다.' }) };

    const prompt = [
      `Create a polished ${settings.label} BACKGROUND for a Korean community business promotion in Dallas, Texas.`,
      `Business context: ${businessName}. Category context: ${category || 'local business'}. Campaign theme: ${campaignName}. Benefit concept: ${benefit || 'special promotion'}.`,
      `Visual direction: ${STYLE_GUIDES[styleKey]}. Professional commercial photography or premium advertising artwork, strong focal subject, realistic and tasteful.`,
      notes ? `Additional context: ${notes}` : '',
      `Composition: ${settings.ratio}. Keep a calm, uncluttered, high-contrast text-safe area on the lower third or left side because Korean headline and benefit text will be overlaid later by the website.`,
      'CRITICAL: background image only. Do not render any letters, Korean or English words, numbers, prices, percentages, logos, brand marks, storefront signs, captions, labels, UI, buttons, watermarks, or readable text.',
      'Do not invent claims, products, people, medical results, contact details, or brand identity. Avoid malformed hands and distorted products.'
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
    return { statusCode: 200, headers, body: JSON.stringify({ b64_json: b64, size: settings.size, asset, style: styleKey }) };
  } catch (error) {
    console.error('generate-campaign-image:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message || '이미지 생성 중 오류가 발생했습니다.' }) };
  }
};
