const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const categoryNames = {
  driving: '운전·차량',
  health: '병원·보험',
  education: '학교·교육',
  business: '세금·비즈니스',
  housing: '주거·생활',
  immigration: '비자·여권'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'POST only' }) };

  try {
    if (!process.env.OPENAI_API_KEY) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Netlify 환경변수 OPENAI_API_KEY가 설정되지 않았습니다.' }) };
    }

    const body = JSON.parse(event.body || '{}');
    const topic = String(body.topic || '').trim();
    const category = String(body.category || 'driving').trim();
    const sources = Array.isArray(body.sources) ? body.sources.map(v => String(v).trim()).filter(Boolean) : [];
    const instructions = String(body.instructions || '').trim();
    const contentType = String(body.contentType || 'guide').trim();
    const businessName = String(body.businessName || '').trim();
    if (!topic) return { statusCode: 400, headers, body: JSON.stringify({ error: '작성 주제를 입력하세요.' }) };

    const sourceText = sources.length
      ? sources.map((url, i) => `${i + 1}. ${url}`).join('\n')
      : '제공된 출처 없음. 최신 수치, 비용, 법률·규정, 기관 연락처를 추측하지 말고 공식 확인 필요라고 표시할 것.';

    const typeNames = { dalpick:'메인 추천 콘텐츠 DalPick', event:'행사안내 기사', life:'달라스 라이프 기사', guide:'신규 이주자용 달라스 가이드', ai_pick:'업소 상세 상단의 짧은 AI Pick' };
    const prompt = `달라스 한인 생활정보 서비스 DalTownMap의 ${typeNames[contentType] || '한국어 콘텐츠'}를 작성하세요.\n\n주제: ${topic}\n분야: ${categoryNames[category] || category}\n대상 지역: Dallas–Fort Worth 및 Texas\n연결 업소: ${businessName || '없음'}\n추가 지시: ${instructions || '초보자도 이해하기 쉽게 실용적으로 작성'}\n\n참고 출처:\n${sourceText}\n\n작성 규칙:\n- 한국어로 작성하고 과장하지 마세요.\n- 제공된 출처 URL만 출처 목록에 사용하세요. 존재하지 않는 링크나 기관 정보를 만들지 마세요.\n- 법률, 세금, 의료, 보험, 이민 내용은 일반 정보임을 밝히고 전문가 또는 공식기관 확인을 권고하세요.\n- 현재 정보라고 단정할 수 없는 비용, 기간, 자격요건은 '공식 사이트에서 최신 정보 확인'이라고 표시하세요.\n- 본문은 모바일에서 읽기 쉽게 짧은 문단과 번호 형식을 사용하세요.\n- content에는 다음 순서를 포함하세요: 한눈에 보기, 대상, 준비사항, 단계별 방법, 주의사항, 공식 확인처, 정보 확인 안내.\n- title은 45자 이내, summary는 140자 이내로 작성하세요.`;

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        input: [
          { role: 'system', content: [{ type: 'input_text', text: '당신은 지역 생활정보를 정확하고 읽기 쉽게 편집하는 한국어 에디터입니다.' }] },
          { role: 'user', content: [{ type: 'input_text', text: prompt }] }
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'daltown_guide',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                title: { type: 'string' },
                summary: { type: 'string' },
                content: { type: 'string' },
                author_name: { type: 'string' },
                link_label: { type: 'string' },
                source_url: { type: 'string' }
              },
              required: ['title', 'summary', 'content', 'author_name', 'link_label', 'source_url']
            }
          }
        }
      })
    });

    const json = await response.json();
    if (!response.ok) {
      console.error('OpenAI error', json);
      return { statusCode: response.status, headers, body: JSON.stringify({ error: json?.error?.message || 'AI 글 생성에 실패했습니다.' }) };
    }

    const outputText = json.output_text || json.output?.flatMap(x => x.content || []).find(x => x.type === 'output_text')?.text;
    if (!outputText) throw new Error('AI 응답 본문이 비어 있습니다.');
    const article = JSON.parse(outputText);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ article, category, category_name: categoryNames[category] || category, content_type: contentType })
    };
  } catch (error) {
    console.error('generate-guide error', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message || 'AI 글 생성 오류' }) };
  }
};
