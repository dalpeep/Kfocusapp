const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function outputText(j) {
  return j.output_text || j.output?.flatMap(x => x.content || []).find(x => x.type === 'output_text')?.text || '';
}

const recommendationItem = {
  type: 'object',
  additionalProperties: false,
  properties: {
    type: { type: 'string', enum: ['coupon', 'banner', 'social', 'push', 'video', 'image_prompt'] },
    recommended: { type: 'boolean' },
    reason: { type: 'string' }
  },
  required: ['type', 'recommended', 'reason']
};

const checklistItem = {
  type: 'object',
  additionalProperties: false,
  properties: {
    key: { type: 'string' },
    label: { type: 'string' },
    status: { type: 'string', enum: ['pass', 'warning', 'info'] },
    message: { type: 'string' }
  },
  required: ['key', 'label', 'status', 'message']
};

const schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    campaign_title: { type: 'string' },
    strategy_summary: { type: 'string' },
    recommendations: { type: 'array', items: recommendationItem },
    dalpick: {
      type: 'object',
      additionalProperties: false,
      properties: {
        title: { type: 'string' },
        summary: { type: 'string' },
        content: { type: 'string' },
        category: { type: 'string' },
        image_prompt: { type: 'string' }
      },
      required: ['title', 'summary', 'content', 'category', 'image_prompt']
    },
    coupon: {
      type: 'object',
      additionalProperties: false,
      properties: {
        title: { type: 'string' },
        discount_label: { type: 'string' },
        description: { type: 'string' },
        coupon_code: { type: 'string' },
        button_label: { type: 'string' }
      },
      required: ['title', 'discount_label', 'description', 'coupon_code', 'button_label']
    },
    banner: {
      type: 'object',
      additionalProperties: false,
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        button_label: { type: 'string' },
        image_prompt: { type: 'string' }
      },
      required: ['title', 'description', 'button_label', 'image_prompt']
    },
    social: {
      type: 'object',
      additionalProperties: false,
      properties: {
        instagram: { type: 'string' },
        facebook: { type: 'string' },
        short_caption: { type: 'string' }
      },
      required: ['instagram', 'facebook', 'short_caption']
    },
    push: {
      type: 'object',
      additionalProperties: false,
      properties: {
        title: { type: 'string' },
        message: { type: 'string' }
      },
      required: ['title', 'message']
    },
    video: {
      type: 'object',
      additionalProperties: false,
      properties: {
        hook: { type: 'string' },
        script: { type: 'string' },
        thumbnail_text: { type: 'string' }
      },
      required: ['hook', 'script', 'thumbnail_text']
    },
    checklist: { type: 'array', items: checklistItem }
  },
  required: ['campaign_title', 'strategy_summary', 'recommendations', 'dalpick', 'coupon', 'banner', 'social', 'push', 'video', 'checklist']
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'POST only' }) };

  try {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY가 없습니다.');
    const b = JSON.parse(event.body || '{}');
    const topic = String(b.topic || '').trim();
    if (!topic) return { statusCode: 400, headers, body: JSON.stringify({ error: '주제를 입력하세요.' }) };

    const business = b.business && typeof b.business === 'object' ? b.business : null;
    const requestedTypes = Array.isArray(b.content_types) && b.content_types.length
      ? b.content_types
      : ['dalpick', 'coupon', 'banner', 'social', 'push', 'video', 'image_prompt'];

    const prompt = `DalTownMap의 DalPick 중심 AI 콘텐츠 캠페인을 설계하세요.

주제: ${topic}
캠페인 목표: ${String(b.goal || '홍보와 정보 제공')}
대상 고객: ${String(b.audience || '달라스 지역 한인')}
문체: ${String(b.tone || '친근하고 신뢰감 있게')}
관리자가 선택한 생성 항목: ${requestedTypes.join(', ')}
추가 지시: ${String(b.instructions || '없음')}
연결 업소: ${business ? JSON.stringify(business) : '없음'}

작업 순서:
1. DalPick 기사를 콘텐츠의 원본으로 먼저 작성합니다.
2. DalPick 기사에서 핵심 메시지, CTA, 대상 고객을 추출합니다.
3. 쿠폰·배너·SNS·푸시·영상·이미지 프롬프트가 기사와 같은 메시지를 유지하도록 파생 생성합니다.
4. 각 파생 콘텐츠가 이 캠페인에 필요한지 판단하여 recommendations에 추천 여부와 이유를 작성합니다.
5. 발행 전 checklist에 제목, CTA, 연락처/링크, 이미지, 사실 확인, 쿠폰 조건 등 점검 결과를 작성합니다.

필수 규칙:
- 모든 문구는 자연스러운 한국어
- 사실이 주어지지 않은 할인율, 가격, 기간, 의료·법률 효능, 수상 경력, 평점, 운영시간을 만들지 말 것
- 쿠폰 조건이 불명확하면 discount_label은 '특별 혜택', coupon_code는 빈 문자열
- DalPick은 모바일에서 읽기 쉬운 소제목과 짧은 문단으로 600~1,000자
- 배너 제목 28자 이내, 설명 70자 이내
- 푸시 제목 28자 이내, 메시지 80자 이내
- 영상 대본은 약 30~45초
- 이미지 프롬프트에는 실제 로고나 읽을 수 있는 글자를 만들지 말라고 명시
- 관리자가 선택하지 않은 콘텐츠도 JSON 스키마 때문에 필드는 반환하되, recommendations에서 필요성을 정직하게 평가
- checklist는 최소 6개 항목을 작성하고, 부족한 정보는 warning으로 표시`;

    const r = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        input: [
          { role: 'system', content: [{ type: 'input_text', text: '당신은 달라스 한인 지역 미디어 DalTownMap의 콘텐츠 전략가이자 책임 편집장입니다.' }] },
          { role: 'user', content: [{ type: 'input_text', text: prompt }] }
        ],
        text: { format: { type: 'json_schema', name: 'dalpick_content_pipeline', strict: true, schema } }
      })
    });

    const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || 'AI 요청 실패');
    const t = outputText(j);
    if (!t) throw new Error('AI 응답이 비어 있습니다.');
    return { statusCode: 200, headers, body: JSON.stringify({ suite: JSON.parse(t) }) };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message || '통합 콘텐츠 생성 오류' }) };
  }
};
