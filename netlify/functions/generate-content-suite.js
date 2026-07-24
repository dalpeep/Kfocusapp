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
    type: { type: 'string', enum: ['dalpick', 'guide', 'coupon', 'banner', 'social', 'push', 'video', 'image_prompt'] },
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


const analysisSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    intent_type: { type: 'string', enum: ['information', 'business', 'mixed'] },
    intent_label: { type: 'string' },
    business_requirement: { type: 'string', enum: ['none', 'optional', 'required'] },
    explanation: { type: 'string' },
    suggested_goal: { type: 'string' },
    suggested_audience: { type: 'string' },
    suggested_tone: { type: 'string' },
    suggested_dalpick_category: { type: 'string', enum: ['local_info', 'lifestyle', 'themed', 'recommended', 'new_business', 'coupon', 'event', 'business_story'] },
    recommended_themes: { type: 'array', items: { type: 'string' } },
    asset_reasons: { type: 'array', items: recommendationItem },
    recommended_types: {
      type: 'array',
      items: { type: 'string', enum: ['dalpick', 'guide', 'coupon', 'banner', 'social', 'push', 'video', 'image_prompt'] }
    }
  },
  required: ['intent_type', 'intent_label', 'business_requirement', 'explanation', 'suggested_goal', 'suggested_audience', 'suggested_tone', 'suggested_dalpick_category', 'recommended_themes', 'asset_reasons', 'recommended_types']
};

const schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    campaign_title: { type: 'string' },
    strategy_summary: { type: 'string' },
    marketing_score: { type: 'integer', minimum: 0, maximum: 100 },
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
    guide: {
      type: 'object',
      additionalProperties: false,
      properties: {
        title: { type: 'string' },
        summary: { type: 'string' },
        content: { type: 'string' },
        category: { type: 'string' }
      },
      required: ['title', 'summary', 'content', 'category']
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
  required: ['campaign_title', 'strategy_summary', 'marketing_score', 'recommendations', 'dalpick', 'guide', 'coupon', 'banner', 'social', 'push', 'video', 'checklist']
};

exports.handler = async (event) => {
  let stage = 'request';
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'POST only' }) };

  try {
    stage = 'environment';
    if (!process.env.OPENAI_API_KEY) { const e=new Error('OPENAI_API_KEY가 없습니다.'); e.code='MISSING_OPENAI_API_KEY'; throw e; }
    stage = 'request_parse';
    const b = JSON.parse(event.body || '{}');
    const topic = String(b.topic || '').trim();
    if (!topic) return { statusCode: 400, headers, body: JSON.stringify({ error: '주제를 입력하세요.' }) };

    if (b.action === 'analyze') {
      const analysisPrompt = `DalTownMap 관리자용 콘텐츠 주제를 분석하세요.

주제: ${topic}

판단 기준:
- information: 생활정보, 여행, 교육, 행정, 행사, 계절 정보처럼 특정 업소 홍보가 중심이 아님
- business: 특정 업소, 프로모션, 신메뉴, 오픈, 인터뷰처럼 업소 연결이 핵심
- mixed: 정보 제공과 관련 업소 소개가 함께 필요한 주제

반환 규칙:
- business_requirement는 none, optional, required 중 하나
- 생활정보라면 none, 혼합형이면 optional, 특정 업소 홍보라면 required를 우선
- suggested_dalpick_category는 실제 DalPick 저장 분류로 추천: 여행·명소는 local_info, 행정·교육·보험·생활 절차는 lifestyle, 여러 업소 비교는 themed, 특정 업소 추천은 recommended, 신규 오픈은 new_business, 할인 혜택은 coupon, 지역 행사는 event, 인터뷰는 business_story
- recommended_themes에는 사용자가 선택하기 좋은 한국어 테마 키워드를 3~7개 제안
- asset_reasons에는 모든 제작물 유형(dalpick, guide, coupon, banner, social, push, video, image_prompt)의 추천 여부와 이유를 작성
- 생활 절차, 행정, 교육, 의료기관 찾기처럼 가이드형 주제에는 guide를 추천
- recommended_types에는 dalpick을 반드시 포함
- 쿠폰은 실제 할인이나 혜택 주제가 아니면 추천하지 말 것
- 배너와 푸시는 중요한 행사, 신규 오픈, 강한 홍보 목적일 때만 추천
- 자연스러운 한국어로 간결하게 작성`;
      stage = 'analysis_openai_request';
      const ar = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
          input: [
            { role: 'system', content: [{ type: 'input_text', text: '당신은 DalTownMap의 콘텐츠 기획 분류기입니다.' }] },
            { role: 'user', content: [{ type: 'input_text', text: analysisPrompt }] }
          ],
          text: { format: { type: 'json_schema', name: 'content_topic_analysis', strict: true, schema: analysisSchema } }
        })
      });
      stage = 'analysis_openai_response';
      const aj = await ar.json();
      if (!ar.ok) throw new Error(aj?.error?.message || '주제 분석 실패');
      const at = outputText(aj);
      if (!at) throw new Error('주제 분석 응답이 비어 있습니다.');
      stage = 'analysis_json_parse';
      return { statusCode: 200, headers, body: JSON.stringify({ analysis: JSON.parse(at) }) };
    }

    const business = b.business && typeof b.business === 'object' ? b.business : null;
    const requestedTypes = Array.isArray(b.content_types) && b.content_types.length
      ? b.content_types
      : ['dalpick', 'guide', 'coupon', 'banner', 'social', 'push', 'video', 'image_prompt'];

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
3. AI Guide·쿠폰·배너·SNS·푸시·영상·이미지 프롬프트가 기사와 같은 메시지를 유지하도록 파생 생성합니다.
4. guide는 생활정보·절차·추천 가이드 형식으로 제목, 요약, 본문을 작성합니다.
5. 각 파생 콘텐츠가 이 캠페인에 필요한지 판단하여 recommendations에 추천 여부와 이유를 작성합니다.
6. 발행 전 checklist에 제목, CTA, 연락처/링크, 이미지, 사실 확인, 쿠폰 조건 등 점검 결과를 작성합니다.

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
- marketing_score는 현재 입력 정보와 생성 결과의 발행 준비도를 0~100점으로 평가
- checklist는 최소 6개 항목을 작성하고, 부족한 정보는 warning으로 표시`;

    stage = 'content_openai_request';
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

    stage = 'content_openai_response';
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || 'AI 요청 실패');
    const t = outputText(j);
    if (!t) throw new Error('AI 응답이 비어 있습니다.');
    stage = 'content_json_parse';
    return { statusCode: 200, headers, body: JSON.stringify({ suite: JSON.parse(t) }) };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message || '통합 콘텐츠 생성 오류', stage, code: e.code || 'CONTENT_SUITE_ERROR', detail: e.name || 'Error' }) };
  }
};
