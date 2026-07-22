const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const categoryNames = {
  driving: '운전·차량', health: '병원·보험', education: '학교·교육',
  business: '세금·비즈니스', housing: '주거·생활', immigration: '비자·여권'
};

function outputText(json) {
  return json.output_text || json.output?.flatMap(x => x.content || []).find(x => x.type === 'output_text')?.text || '';
}

async function askOpenAI({ name, schema, system, prompt }) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      input: [
        { role: 'system', content: [{ type: 'input_text', text: system }] },
        { role: 'user', content: [{ type: 'input_text', text: prompt }] }
      ],
      text: { format: { type: 'json_schema', name, strict: true, schema } }
    })
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json?.error?.message || 'AI 요청에 실패했습니다.');
  const text = outputText(json);
  if (!text) throw new Error('AI 응답 본문이 비어 있습니다.');
  return JSON.parse(text);
}

const planSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    intent_type: { type: 'string' },
    user_goal: { type: 'string' },
    must_cover: { type: 'array', items: { type: 'string' } },
    must_avoid: { type: 'array', items: { type: 'string' } },
    search_queries: { type: 'array', items: { type: 'string' } },
    outline: { type: 'array', items: { type: 'string' } }
  },
  required: ['intent_type','user_goal','must_cover','must_avoid','search_queries','outline']
};

const articleSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    title: { type: 'string' }, summary: { type: 'string' }, content: { type: 'string' },
    author_name: { type: 'string' }, link_label: { type: 'string' }, source_url: { type: 'string' }
  },
  required: ['title','summary','content','author_name','link_label','source_url']
};

const reviewSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    score: { type: 'integer' },
    intent_match: { type: 'integer' },
    relevance: { type: 'integer' },
    unsupported_claim_risk: { type: 'integer' },
    problems: { type: 'array', items: { type: 'string' } },
    revised_article: articleSchema
  },
  required: ['score','intent_match','relevance','unsupported_claim_risk','problems','revised_article']
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'POST only' }) };

  try {
    if (!process.env.OPENAI_API_KEY) throw new Error('Netlify 환경변수 OPENAI_API_KEY가 설정되지 않았습니다.');
    const body = JSON.parse(event.body || '{}');
    const topic = String(body.topic || '').trim();
    const category = String(body.category || 'driving').trim();
    const sources = Array.isArray(body.sources) ? body.sources.map(v => String(v).trim()).filter(Boolean) : [];
    const instructions = String(body.instructions || '').trim();
    if (!topic) return { statusCode: 400, headers, body: JSON.stringify({ error: '작성 주제를 입력하세요.' }) };

    const sourceText = sources.length ? sources.map((url, i) => `${i + 1}. ${url}`).join('\n') : '제공된 출처 없음';

    const plan = await askOpenAI({
      name: 'guide_intent_plan', schema: planSchema,
      system: '당신은 사용자의 질문 의도를 분류하고, 주제 이탈을 막는 콘텐츠 기획자입니다.',
      prompt: `다음 요청을 분석해 기사 작성 계획을 만드세요.\n\n주제: ${topic}\n분야: ${categoryNames[category] || category}\n추가 지시: ${instructions || '없음'}\n\n규칙:\n- 제목에 "특징", "장점", "비교", "이유"가 있으면 절차·준비물 중심 글로 바꾸지 마세요.\n- 제목에 "방법", "신청", "등록", "준비물", "절차"가 있을 때만 절차형으로 분류하세요.\n- must_avoid에는 사용자가 요구하지 않은 대표적인 이탈 주제를 넣으세요.\n- search_queries는 영어 중심으로 4~7개 생성하고 사용자 의도 단어를 반드시 포함하세요.\n- outline은 사용자 질문에 직접 답하는 순서로 구성하세요.`
    });

    const draft = await askOpenAI({
      name: 'daltown_guide_draft', schema: articleSchema,
      system: '당신은 달라스 한인 지역 미디어의 정확하고 읽기 쉬운 한국어 편집자입니다. 기획서의 의도와 금지사항을 최우선으로 따릅니다.',
      prompt: `아래 기획서에 맞춰 한국어 가이드 초안을 작성하세요.\n\n[사용자 요청]\n${topic}\n\n[기획서]\n기사 유형: ${plan.intent_type}\n목표: ${plan.user_goal}\n반드시 포함: ${plan.must_cover.join(' / ')}\n반드시 제외: ${plan.must_avoid.join(' / ')}\n개요: ${plan.outline.join(' > ')}\n\n[참고 출처]\n${sourceText}\n\n[작성 규칙]\n- 반드시 사용자 질문에 직접 답하세요.\n- 기획서에 없는 등록 방법, 준비물, 신청 절차를 관성적으로 추가하지 마세요.\n- 제공된 URL만 출처로 사용하고, 확인되지 않은 최신 수치·순위·비용은 단정하지 마세요.\n- 법률·세금·의료·보험·이민은 일반 정보임을 밝히고 공식기관 확인을 권고하세요.\n- 모바일에서 읽기 좋은 소제목과 짧은 문단을 사용하세요.\n- title 45자 이내, summary 140자 이내.`
    });

    const review = await askOpenAI({
      name: 'guide_quality_review', schema: reviewSchema,
      system: '당신은 사용자 의도 불일치와 주제 이탈을 찾아 자동으로 고치는 엄격한 편집장입니다.',
      prompt: `다음 초안을 검수하고 필요하면 revised_article에서 고쳐 쓰세요. 점수가 높아도 revised_article은 완성본 전체를 반환하세요.\n\n사용자 요청: ${topic}\n목표: ${plan.user_goal}\n반드시 포함: ${plan.must_cover.join(' / ')}\n반드시 제외: ${plan.must_avoid.join(' / ')}\n\n초안:\n${JSON.stringify(draft)}\n\n채점 기준:\n- 사용자 의도 일치 45점\n- 핵심 내용 관련성 30점\n- 불필요한 주제 없음 15점\n- 과장·근거 없는 단정 없음 10점\n- 85점 미만이면 반드시 주제 이탈을 제거하고 재작성하세요.\n- 특히 특징·장점 요청을 등록 절차나 준비물 기사로 바꾸면 매우 낮게 채점하세요.`
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        article: review.revised_article,
        category,
        category_name: categoryNames[category] || category,
        quality: {
          score: review.score,
          intent_match: review.intent_match,
          relevance: review.relevance,
          unsupported_claim_risk: review.unsupported_claim_risk,
          problems: review.problems,
          intent_type: plan.intent_type,
          search_queries: plan.search_queries
        }
      })
    };
  } catch (error) {
    console.error('generate-guide error', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message || 'AI 글 생성 오류' }) };
  }
};
