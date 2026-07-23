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

async function callResponses(payload) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json?.error?.message || 'OpenAI 요청에 실패했습니다.');
  return json;
}

async function askOpenAI({ name, schema, system, prompt }) {
  const json = await callResponses({
    model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
    input: [
      { role: 'system', content: [{ type: 'input_text', text: system }] },
      { role: 'user', content: [{ type: 'input_text', text: prompt }] }
    ],
    text: { format: { type: 'json_schema', name, strict: true, schema } }
  });
  const text = outputText(json);
  if (!text) throw new Error('AI 응답 본문이 비어 있습니다.');
  return JSON.parse(text);
}

async function askOpenAIWithWebSearch({ name, schema, system, prompt }) {
  const model = process.env.OPENAI_SEARCH_MODEL || process.env.OPENAI_MODEL || 'gpt-4.1-mini';
  let json;
  try {
    json = await callResponses({
      model,
      tools: [{ type: 'web_search_preview', search_context_size: 'high' }],
      tool_choice: 'auto',
      input: [
        { role: 'system', content: [{ type: 'input_text', text: system }] },
        { role: 'user', content: [{ type: 'input_text', text: prompt }] }
      ],
      text: { format: { type: 'json_schema', name, strict: true, schema } }
    });
  } catch (firstError) {
    // Newer accounts may expose the tool as web_search rather than web_search_preview.
    json = await callResponses({
      model,
      tools: [{ type: 'web_search' }],
      tool_choice: 'auto',
      input: [
        { role: 'system', content: [{ type: 'input_text', text: system }] },
        { role: 'user', content: [{ type: 'input_text', text: prompt }] }
      ],
      text: { format: { type: 'json_schema', name, strict: true, schema } }
    });
  }
  const text = outputText(json);
  if (!text) throw new Error('OpenAI 웹 검색 결과가 비어 있습니다.');
  return JSON.parse(text);
}

function stripHtml(html = '') {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ').trim();
}

function isHttpUrl(value) {
  try { const u = new URL(value); return u.protocol === 'http:' || u.protocol === 'https:'; }
  catch (_) { return false; }
}

async function fetchPageText(url) {
  if (!isHttpUrl(url)) return { url, ok: false, error: 'invalid_url', text: '' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  try {
    const res = await fetch(url, { redirect: 'follow', signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DalTownMapBot/2.0)' } });
    if (!res.ok) return { url, ok: false, error: `HTTP ${res.status}`, text: '' };
    const type = res.headers.get('content-type') || '';
    if (!type.includes('text/html') && !type.includes('text/plain')) return { url, ok: false, error: `unsupported:${type}`, text: '' };
    return { url: res.url || url, ok: true, text: stripHtml(await res.text()).slice(0, 9000) };
  } catch (error) {
    return { url, ok: false, error: error.name === 'AbortError' ? 'timeout' : error.message, text: '' };
  } finally { clearTimeout(timer); }
}

function normalize(value = '') {
  return String(value).toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
}

function extractHardQualifiers(topic) {
  const t = String(topic || '');
  const rules = [
    { key: 'korean', re: /(한인|한국인|한국어|한글|korean(?:[- ]?speaking)?)/i, terms: ['한인', '한국어', 'Korean', 'Korean-speaking'] },
    { key: 'female', re: /(여의사|여성 의사|여자 의사|female doctor|woman doctor)/i, terms: ['여의사', 'female doctor'] },
    { key: 'pediatric', re: /(소아과|소아청소년과|pediatric)/i, terms: ['소아과', 'pediatric'] },
    { key: 'internal_medicine', re: /(내과|internal medicine)/i, terms: ['내과', 'internal medicine'] },
    { key: 'dental', re: /(치과|dentist|dental)/i, terms: ['치과', 'dentist'] }
  ];
  return rules.filter(r => r.re.test(t));
}

function extractRequestedCity(topic) {
  const pairs = [
    ['캐롤튼', 'Carrollton'], ['캐롤톤', 'Carrollton'], ['플레이노', 'Plano'], ['프리스코', 'Frisco'],
    ['리차드슨', 'Richardson'], ['리처드슨', 'Richardson'], ['달라스', 'Dallas'], ['알렌', 'Allen'],
    ['루이스빌', 'Lewisville'], ['코펠', 'Coppell'], ['포트워스', 'Fort Worth'], ['리틀엘름', 'Little Elm']
  ];
  const lower = String(topic || '').toLowerCase();
  for (const [ko, en] of pairs) if (lower.includes(ko.toLowerCase()) || lower.includes(en.toLowerCase())) return en;
  return '';
}

async function searchGooglePlaces(query, count = 5) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error('Netlify 환경변수 GOOGLE_MAPS_API_KEY가 필요합니다.');
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', 'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.rating,places.userRatingCount,places.businessStatus,places.primaryType,places.types'
    },
    body: JSON.stringify({ textQuery: query, pageSize: Math.min(Math.max(count, 1), 10), languageCode: 'en', regionCode: 'US' })
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || `Google Places API 오류 ${res.status}`);
  return (json.places || []).map(p => ({
    id: p.id || '', name: p.displayName?.text || '', address: p.formattedAddress || '', phone: p.nationalPhoneNumber || '',
    website: p.websiteUri || '', google_maps_url: p.googleMapsUri || '', rating: p.rating ?? null,
    review_count: p.userRatingCount ?? null, business_status: p.businessStatus || '', primary_type: p.primaryType || '', types: p.types || [], query
  }));
}

function uniquePlaces(items) {
  const seen = new Set();
  return items.filter(p => { const k = p.id || `${normalize(p.name)}|${normalize(p.address)}`; if (!k || seen.has(k)) return false; seen.add(k); return true; });
}

function placeMatchesCandidate(place, candidate) {
  const a = normalize(place.name); const b = normalize(candidate.name);
  return a && b && (a.includes(b) || b.includes(a) || (candidate.aliases || []).some(x => a.includes(normalize(x))));
}

const planSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    intent_type: { type: 'string' }, user_goal: { type: 'string' },
    must_cover: { type: 'array', items: { type: 'string' } }, must_avoid: { type: 'array', items: { type: 'string' } },
    search_queries: { type: 'array', items: { type: 'string' } }, outline: { type: 'array', items: { type: 'string' } }
  }, required: ['intent_type','user_goal','must_cover','must_avoid','search_queries','outline']
};

const researchSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    search_summary: { type: 'string' },
    queries_used: { type: 'array', items: { type: 'string' } },
    candidates: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      properties: {
        name: { type: 'string' }, aliases: { type: 'array', items: { type: 'string' } }, city: { type: 'string' },
        qualifier_evidence: { type: 'string' }, qualifier_confirmed: { type: 'boolean' },
        source_urls: { type: 'array', items: { type: 'string' } }, source_titles: { type: 'array', items: { type: 'string' } }
      }, required: ['name','aliases','city','qualifier_evidence','qualifier_confirmed','source_urls','source_titles']
    } }
  }, required: ['search_summary','queries_used','candidates']
};

const articleSchema = {
  type: 'object', additionalProperties: false,
  properties: { title: { type: 'string' }, summary: { type: 'string' }, content: { type: 'string' }, author_name: { type: 'string' }, link_label: { type: 'string' }, source_url: { type: 'string' } },
  required: ['title','summary','content','author_name','link_label','source_url']
};

const reviewSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    score: { type: 'integer' }, intent_match: { type: 'integer' }, relevance: { type: 'integer' }, unsupported_claim_risk: { type: 'integer' },
    problems: { type: 'array', items: { type: 'string' } }, revised_article: articleSchema
  }, required: ['score','intent_match','relevance','unsupported_claim_risk','problems','revised_article']
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

    const hardQualifiers = extractHardQualifiers(topic);
    const requestedCity = extractRequestedCity(topic);
    const qualifierText = hardQualifiers.flatMap(q => q.terms).join(', ');

    const plan = await askOpenAI({
      name: 'guide_intent_plan_v11', schema: planSchema,
      system: '당신은 사용자의 원문 조건을 절대 삭제하지 않는 검색 기획자입니다.',
      prompt: `주제: ${topic}\n분야: ${categoryNames[category] || category}\n추가 지시: ${instructions || '없음'}\n고정 지역: ${requestedCity || '원문에서 판단'}\n절대 유지 조건: ${qualifierText || '없음'}\n\n한국어 검색어와 영어 검색어를 각각 최소 4개씩, 총 8~12개 만드세요. 모든 검색어에 지역과 절대 유지 조건을 반복해 넣으세요. '한인'은 단순한 병원 종류가 아니라 필수 자격 조건입니다. 일반 병원으로 대체하지 마세요.`
    });

    const research = await askOpenAIWithWebSearch({
      name: 'guide_web_research_v11', schema: researchSchema,
      system: '당신은 한국어 지역 커뮤니티 검색 전문가입니다. 웹 검색을 실제로 사용하고, 사용자가 명시한 지역·민족·언어·전문과 조건을 모두 만족하는 후보만 반환합니다.',
      prompt: `다음 요청을 실시간 웹 검색으로 조사하세요.\n\n원문: ${topic}\n지역: ${requestedCity || '원문 그대로'}\n필수 조건: ${qualifierText || '없음'}\n검색어 후보:\n${plan.search_queries.join('\n')}\n사용자 참고 URL:\n${sources.join('\n') || '없음'}\n\n필수 규칙:\n1. 한국어 검색을 먼저 수행하고 영어 검색으로 교차검증하세요.\n2. '한인/한국어/Korean-speaking' 조건이 있으면 그 근거를 웹페이지, 디렉터리, 의료진 소개, 지역 한인 매체 등에서 명시적으로 찾아야 합니다.\n3. 지역이 Carrollton이면 Little Elm, Plano, Dallas의 일반 병원을 대체 후보로 넣지 마세요.\n4. 조건 근거가 없는 일반 병원은 candidates에서 제외하세요.\n5. 후보마다 실제 근거 URL과 근거 설명을 반환하세요.\n6. 사용자가 준 Google 검색 URL은 검색어와 검색 결과 방향을 파악하는 우선 단서로 사용하세요.`
    });

    let candidates = research.candidates.filter(c => c.name && c.qualifier_confirmed !== false);
    if (requestedCity) candidates = candidates.filter(c => !c.city || normalize(c.city).includes(normalize(requestedCity)) || normalize(requestedCity).includes(normalize(c.city)));
    if (hardQualifiers.length && !candidates.length) {
      throw new Error(`웹 검색에서 '${qualifierText}' 조건과 ${requestedCity || '요청 지역'}을 함께 확인할 수 있는 후보를 찾지 못했습니다. 일반 장소로 대체하지 않고 생성을 중단했습니다.`);
    }

    const placeQueries = candidates.slice(0, 8).map(c => `${c.name} ${requestedCity || c.city || 'Texas'}`);
    const placeGroups = await Promise.all(placeQueries.map(q => searchGooglePlaces(q, 3).catch(() => [])));
    const allPlaces = uniquePlaces(placeGroups.flat());
    const verified = [];
    for (const candidate of candidates) {
      const matches = allPlaces.filter(p => placeMatchesCandidate(p, candidate));
      const cityMatches = requestedCity ? matches.filter(p => normalize(p.address).includes(normalize(requestedCity))) : matches;
      const best = cityMatches[0] || null;
      if (best) verified.push({ candidate, place: best });
    }

    if (candidates.length && !verified.length && process.env.GOOGLE_MAPS_API_KEY) {
      throw new Error('웹 검색 후보는 찾았지만 Google Places에서 같은 이름과 요청 지역의 실제 장소를 확인하지 못했습니다. 잘못된 장소를 대신 넣지 않고 생성을 중단했습니다.');
    }

    const providedPages = await Promise.all(sources.slice(0, 4).map(fetchPageText));
    const readableProvided = providedPages.filter(p => p.ok && p.text);
    const evidenceUrls = [...new Set(candidates.flatMap(c => c.source_urls || []).filter(isHttpUrl))].slice(0, 5);
    const researchPages = await Promise.all(evidenceUrls.map(fetchPageText));
    const readableResearch = researchPages.filter(p => p.ok && p.text);
    const officialUrls = [...new Set(verified.map(v => v.place.website).filter(isHttpUrl))].slice(0, 3);
    const officialPages = await Promise.all(officialUrls.map(fetchPageText));
    const readableOfficial = officialPages.filter(p => p.ok && p.text);

    const evidence = [
      `[사용자 원문]\n${topic}\n요청 지역: ${requestedCity || '미지정'}\n필수 조건: ${qualifierText || '없음'}`,
      `[실시간 웹 검색 요약]\n${research.search_summary}\n사용 검색어: ${research.queries_used.join(' | ')}`,
      ...candidates.map((c, i) => `[웹 검색 후보 ${i + 1}]\n이름: ${c.name}\n별칭: ${(c.aliases || []).join(', ')}\n도시: ${c.city}\n필수조건 확인: ${c.qualifier_confirmed}\n근거: ${c.qualifier_evidence}\n출처: ${(c.source_urls || []).join(', ')}`),
      ...verified.map((v, i) => `[Google Places 확인 ${i + 1}]\n이름: ${v.place.name}\n주소: ${v.place.address}\n전화: ${v.place.phone || '미제공'}\n웹사이트: ${v.place.website || '미제공'}\n지도: ${v.place.google_maps_url || '미제공'}\n평점: ${v.place.rating ?? '미제공'}\n리뷰 수: ${v.place.review_count ?? '미제공'}\n웹 검색의 필수조건 근거: ${v.candidate.qualifier_evidence}`),
      ...readableProvided.map((p, i) => `[사용자 참고 URL ${i + 1}]\nURL: ${p.url}\n본문: ${p.text}`),
      ...readableResearch.map((p, i) => `[웹 검색 근거 페이지 ${i + 1}]\nURL: ${p.url}\n본문: ${p.text}`),
      ...readableOfficial.map((p, i) => `[공식 홈페이지 ${i + 1}]\nURL: ${p.url}\n본문: ${p.text}`)
    ].join('\n\n').slice(0, 85000);

    const draft = await askOpenAI({
      name: 'daltown_guide_draft_v11', schema: articleSchema,
      system: '당신은 달라스 한인 미디어의 엄격한 사실 검증 편집자입니다. 사용자 원문의 필수 조건을 만족하는 검증 후보만 기사에 포함합니다.',
      prompt: `[기획]\n목표: ${plan.user_goal}\n포함: ${plan.must_cover.join(' / ')}\n제외: ${plan.must_avoid.join(' / ')}\n개요: ${plan.outline.join(' > ')}\n\n[검증 근거]\n${evidence}\n\n절대 규칙:\n- '${qualifierText || '사용자 조건'}'을 충족하지 않는 일반 장소는 넣지 마세요.\n- ${requestedCity ? `${requestedCity} 이외 지역은 넣지 마세요.` : ''}\n- 이름·주소·전화는 Google Places 확인값을 사용하세요.\n- '한인/한국어 진료' 표시는 웹 검색 근거가 명시된 후보에만 사용하세요.\n- 근거 없는 의사명, 운영시간, 진료과목, 후기, 순위는 만들지 마세요.\n- 빈칸을 555 번호나 예시 주소로 채우지 마세요.\n- 후보 수가 적으면 적은 수만 정확히 소개하세요.\n- source_url은 가장 핵심적인 실제 출처 URL을 넣으세요.`
    });

    const review = await askOpenAI({
      name: 'guide_quality_review_v11', schema: reviewSchema,
      system: '당신은 원문의 필수 조건 누락과 엉뚱한 장소 대체를 가장 엄격하게 검사하는 팩트체커입니다.',
      prompt: `원문: ${topic}\n지역: ${requestedCity || '미지정'}\n필수 조건: ${qualifierText || '없음'}\n\n[근거]\n${evidence}\n\n[초안]\n${JSON.stringify(draft)}\n\n검수 규칙:\n- 필수 조건을 충족한다는 근거가 없는 장소는 삭제하세요.\n- 요청 도시 밖 장소는 삭제하세요.\n- Places 검증 없는 주소·전화는 삭제하세요.\n- 일반 병원을 한인 병원으로 표현하면 score를 0으로 하고 삭제하세요.\n- 수정된 완성 기사 전체를 revised_article에 반환하세요.`
    });

    const usedSources = [
      ...candidates.flatMap(c => (c.source_urls || []).map(url => ({ title: c.name, url, type: 'web_search_evidence' }))),
      ...verified.map(v => ({ title: v.place.name, url: v.place.google_maps_url || v.place.website, type: 'google_place', address: v.place.address })),
      ...readableProvided.map(p => ({ title: '사용자 제공 참고 URL', url: p.url, type: 'provided_url' }))
    ];

    return { statusCode: 200, headers, body: JSON.stringify({
      article: review.revised_article, category, category_name: categoryNames[category] || category,
      quality: {
        score: review.score, intent_match: review.intent_match, relevance: review.relevance,
        unsupported_claim_risk: review.unsupported_claim_risk, problems: review.problems,
        intent_type: plan.intent_type, search_queries: research.queries_used,
        google_search_used: true, openai_web_search_used: true,
        hard_qualifiers: hardQualifiers.map(q => q.key), requested_city: requestedCity,
        web_candidates_count: candidates.length, google_places_used: true, google_places_count: verified.length,
        provided_urls_read: readableProvided.length, official_pages_read: readableOfficial.length, sources: usedSources
      }
    }) };
  } catch (error) {
    console.error('generate-guide error', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message || 'AI 글 생성 오류' }) };
  }
};
