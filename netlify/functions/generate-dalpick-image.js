exports.handler = async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: { Allow: 'POST' }, body: JSON.stringify({ error: 'POST 요청만 지원합니다.' }) };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Netlify 환경변수 OPENAI_API_KEY가 없습니다.' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const title = String(body.title || '').trim();
    const summary = String(body.summary || '').trim();
    const category = String(body.category || 'themed').trim();
    if (!title) return { statusCode: 400, body: JSON.stringify({ error: '기사 제목이 필요합니다.' }) };

    const prompt = [
      'Create a polished editorial hero image for a Dallas Korean community mobile app article.',
      `Article title: ${title}`,
      summary ? `Article summary: ${summary}` : '',
      `Content category: ${category}`,
      'Photorealistic magazine-style image, warm natural lighting, clean composition, no logos, no watermarks, no readable text, no UI elements.',
      'Landscape composition suitable for a compact article card and mobile hero crop.'
    ].filter(Boolean).join('\n');

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt,
        size: '1024x1024',
        quality: 'low',
        output_format: 'png'
      })
    });

    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = json?.error?.message || 'AI 이미지 생성 요청에 실패했습니다.';
      return { statusCode: response.status || 500, body: JSON.stringify({ error: message }) };
    }

    console.log('generate-dalpick-image OpenAI status:', response.status);
    const b64 = json?.data?.[0]?.b64_json;
    if (!b64) return { statusCode: 502, body: JSON.stringify({ error: '이미지 데이터가 반환되지 않았습니다.' }) };

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ b64_json: b64 })
    };
  } catch (error) {
    console.error('generate-dalpick-image:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message || '이미지 생성 중 오류가 발생했습니다.' }) };
  }
};
