const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const typeNames = {
  local_info: '지역 정보', lifestyle: '생활 정보', themed: '테마 추천',
  recommended: '추천 업소', new_business: '신규 업소', coupon: '쿠폰', event: '행사'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'POST only' }) };
  try {
    if (!process.env.OPENAI_API_KEY) throw new Error('Netlify 환경변수 OPENAI_API_KEY가 설정되지 않았습니다.');
    const body = JSON.parse(event.body || '{}');
    const topic = String(body.topic || '').trim();
    const category = String(body.category || 'local_info');
    const instructions = String(body.instructions || '').trim();
    const business = body.business && typeof body.business === 'object' ? body.business : null;
    const sources = Array.isArray(body.sources) ? body.sources.map(v => String(v).trim()).filter(Boolean) : [];
    if (!topic) return { statusCode: 400, headers, body: JSON.stringify({ error: '주제를 입력하세요.' }) };

    const businessText = business
      ? `연결 업소 정보:\n- 업소명: ${business.name || ''}\n- 업종: ${business.category || ''}\n- 지역: ${business.city || ''}\n- 설명: ${business.description || ''}`
      : '연결 업소 없음. 특정 업체를 홍보하거나 임의의 업체명을 만들지 마세요.';
    const sourceText = sources.length ? sources.map((u,i)=>`${i+1}. ${u}`).join('\n') : '제공된 출처 없음. 최신 정보가 필요한 사실은 추측하지 말고 확인 필요 문구를 포함하세요.';

    const prompt = `DalTownMap의 메인 추천 섹션 DalPick에 게시할 한국어 콘텐츠를 작성하세요.\n\n콘텐츠 유형: ${typeNames[category] || category}\n주제: ${topic}\n지역: Dallas–Fort Worth 및 Texas\n추가 지시: ${instructions || '모바일에서 읽기 쉽고 실용적으로 작성'}\n\n${businessText}\n\n참고 출처:\n${sourceText}\n\n작성 규칙:\n- 특정 업소 연결이 없으면 중립적인 지역 정보 기사로 작성하고 업체를 임의로 홍보하지 마세요.\n- 연결 업소가 있을 때만 해당 업소를 자연스럽게 언급하세요. 과장하거나 확인되지 않은 인기, 순위, 가격을 만들지 마세요.\n- 여행지·행사·생활 정보의 운영시간, 입장료, 규정은 변동 가능성을 알리고 공식 사이트 확인을 권고하세요.\n- title은 45자 이내, summary는 140자 이내입니다.\n- content는 500~900자 정도로, 짧은 문단과 소제목을 사용하세요.\n- 기사 마지막에 '방문 전 확인할 점'을 포함하세요.\n- 제공된 URL 외에는 링크를 만들지 마세요.\n- image_search_keywords에는 대표 이미지 검색에 쓸 한국어 또는 영어 키워드 3~6개를 쉼표로 작성하세요.`;

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        input: [
          { role: 'system', content: [{ type: 'input_text', text: '당신은 달라스 한인 지역 미디어의 정확하고 실용적인 한국어 편집자입니다.' }] },
          { role: 'user', content: [{ type: 'input_text', text: prompt }] }
        ],
        text: { format: { type: 'json_schema', name: 'dalpick_article', strict: true, schema: {
          type: 'object', additionalProperties: false,
          properties: {
            title: { type: 'string' }, summary: { type: 'string' }, content: { type: 'string' },
            image_search_keywords: { type: 'string' }
          }, required: ['title','summary','content','image_search_keywords']
        } } }
      })
    });
    const json = await response.json();
    if (!response.ok) throw new Error(json?.error?.message || 'AI 글 생성에 실패했습니다.');
    const outputText = json.output_text || json.output?.flatMap(x => x.content || []).find(x => x.type === 'output_text')?.text;
    if (!outputText) throw new Error('AI 응답이 비어 있습니다.');
    return { statusCode: 200, headers, body: JSON.stringify({ article: JSON.parse(outputText) }) };
  } catch (error) {
    console.error('generate-dalpick error', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message || 'AI 글 생성 오류' }) };
  }
};
