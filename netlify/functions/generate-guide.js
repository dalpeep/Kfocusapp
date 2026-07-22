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

async function askOpenAI({ name, schema, system, prompt, timeoutMs = 18000 }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', signal: controller.signal,
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
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('AI 응답 시간이 초과되었습니다. 주제를 조금 더 구체적으로 입력해 주세요.');
    throw error;
  } finally { clearTimeout(timer); }
}

function stripHtml(html = '') {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'").replace(/\s+/g, ' ').trim();
}

function isHttpUrl(value) {
  try { const u = new URL(value); return u.protocol === 'http:' || u.protocol === 'https:'; }
  catch (_) { return false; }
}

async function fetchPageText(url, timeoutMs = 4500) {
  if (!isHttpUrl(url)) return { url, ok: false, error: 'invalid_url', text: '' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { redirect: 'follow', signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DalTownMapBot/1.1)' } });
    if (!res.ok) return { url, ok: false, error: `HTTP ${res.status}`, text: '' };
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) return { url, ok: false, error: `unsupported:${contentType}`, text: '' };
    const raw = await res.text();
    return { url: res.url || url, ok: true, text: stripHtml(raw).slice(0, 7000) };
  } catch (error) {
    return { url, ok: false, error: error.name === 'AbortError' ? 'timeout' : error.message, text: '' };
  } finally { clearTimeout(timer); }
}

async function searchGooglePlaces(query, count = 4) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error('Netlify 환경변수 GOOGLE_MAPS_API_KEY가 필요합니다.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5500);
  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST', signal: controller.signal,
      headers: {
        'Content-Type': 'application/json', 'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.rating,places.userRatingCount,places.businessStatus,places.primaryType,places.types'
      },
      body: JSON.stringify({ textQuery: query, pageSize: Math.min(Math.max(count, 1), 6), languageCode: 'en', regionCode: 'US' })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error?.message || `Google Places API 오류 ${res.status}`);
    return (json.places || []).map(place => ({
      id: place.id || '', name: place.displayName?.text || '', address: place.formattedAddress || '',
      phone: place.nationalPhoneNumber || '', website: place.websiteUri || '', google_maps_url: place.googleMapsUri || '',
      rating: Number.isFinite(place.rating) ? place.rating : null,
      review_count: Number.isFinite(place.userRatingCount) ? place.userRatingCount : null,
      business_status: place.businessStatus || '', primary_type: place.primaryType || '', types: place.types || [], query
    }));
  } catch (error) {
    if (error.name === 'AbortError') return [];
    throw error;
  } finally { clearTimeout(timer); }
}

function isPlaceBasedTopic(category, topic) {
  if (['health', 'business'].includes(category)) return true;
  return /(병원|의원|클리닉|의사|치과|약국|학교|학원|대학|식당|업소|가게|매장|변호사|회계사|보험|목록|리스트|추천|가까운|주소|전화번호)/i.test(topic);
}

function uniquePlaces(items) {
  const seen = new Set();
  return items.filter(p => { const key = (p.id || `${p.name}|${p.address}`).toLowerCase(); if (!key || seen.has(key)) return false; seen.add(key); return true; });
}

const planSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    intent_type: { type: 'string' }, user_goal: { type: 'string' },
    must_cover: { type: 'array', items: { type: 'string' } }, must_avoid: { type: 'array', items: { type: 'string' } },
    search_queries: { type: 'array', items: { type: 'string' } }, outline: { type: 'array', items: { type: 'string' } }
  }, required: ['intent_type','user_goal','must_cover','must_avoid','search_queries','outline']
};

const finalSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    article: {
      type: 'object', additionalProperties: false,
      properties: { title:{type:'string'}, summary:{type:'string'}, content:{type:'string'}, author_name:{type:'string'}, link_label:{type:'string'}, source_url:{type:'string'} },
      required: ['title','summary','content','author_name','link_label','source_url']
    },
    quality: {
      type: 'object', additionalProperties: false,
      properties: { score:{type:'integer'}, intent_match:{type:'integer'}, relevance:{type:'integer'}, unsupported_claim_risk:{type:'integer'}, problems:{type:'array',items:{type:'string'}} },
      required: ['score','intent_match','relevance','unsupported_claim_risk','problems']
    }
  }, required: ['article','quality']
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

    const plan = await askOpenAI({
      name: 'guide_intent_plan', schema: planSchema, timeoutMs: 12000,
      system: '사용자의 질문 의도를 정확히 분류하고 주제 이탈을 막는 간결한 콘텐츠 기획자입니다.',
      prompt: `주제: ${topic}\n분야: ${categoryNames[category] || category}\n추가 지시: ${instructions || '없음'}\n\n특징·장점 요청을 절차형으로 바꾸지 마세요. search_queries는 최대 3개, 장소 목록이면 공식명·주소·전화 확인에 적합한 영어 검색어로 작성하세요. outline은 최대 6개로 간결하게 작성하세요.`
    });

    const placeBased = isPlaceBasedTopic(category, topic);
    const placeQueries = (plan.search_queries || []).slice(0, 3).map(q => /Dallas|Fort Worth|DFW|Texas/i.test(q) ? q : `${q} Dallas Fort Worth Texas`);
    const placeGroups = placeBased ? await Promise.all(placeQueries.map(q => searchGooglePlaces(q, 4).catch(() => []))) : [];
    const verifiedPlaces = uniquePlaces(placeGroups.flat()).slice(0, 10);

    const providedPages = await Promise.all(sources.slice(0, 3).map(url => fetchPageText(url, 5000)));
    const readableProvided = providedPages.filter(p => p.ok && p.text);
    if (sources.length && readableProvided.length === 0) throw new Error('입력한 참고 URL을 읽지 못했습니다. 공개 웹페이지 주소인지 확인해 주세요.');
    if (!placeBased && readableProvided.length === 0) throw new Error('이 주제는 공식기관 또는 신뢰할 수 있는 참고 URL이 필요합니다.');
    if (placeBased && verifiedPlaces.length === 0 && readableProvided.length === 0) throw new Error('Google Places에서 확인 가능한 장소를 찾지 못했습니다. 지역명이나 기관명을 더 구체적으로 입력해 주세요.');

    const officialLimit = readableProvided.length ? 1 : 3;
    const officialUrls = [...new Set(verifiedPlaces.map(p => p.website).filter(isHttpUrl))].slice(0, officialLimit);
    const officialPages = await Promise.all(officialUrls.map(url => fetchPageText(url, 4000)));
    const readableOfficialPages = officialPages.filter(p => p.ok && p.text);

    const evidence = [
      ...readableProvided.map((p,i)=>`[사용자 제공 출처 ${i+1}]\nURL: ${p.url}\n본문: ${p.text}`),
      ...verifiedPlaces.map((p,i)=>`[Google Places ${i+1}]\n이름: ${p.name}\n주소: ${p.address}\n전화: ${p.phone || '미제공'}\n웹사이트: ${p.website || '미제공'}\n지도: ${p.google_maps_url || '미제공'}\n평점: ${p.rating ?? '미제공'}\n리뷰수: ${p.review_count ?? '미제공'}\n상태: ${p.business_status || '미제공'}`),
      ...readableOfficialPages.map((p,i)=>`[공식 웹사이트 ${i+1}]\nURL: ${p.url}\n본문: ${p.text}`)
    ].join('\n\n').slice(0, 42000);

    const result = await askOpenAI({
      name: 'daltown_verified_guide', schema: finalSchema, timeoutMs: 20000,
      system: '달라스 한인 지역 미디어의 엄격한 사실 검증형 편집자입니다. 제공된 근거 밖의 고유명사·주소·전화번호를 절대 만들지 않습니다. 작성과 검수를 한 번에 수행합니다.',
      prompt: `사용자 요청: ${topic}\n목표: ${plan.user_goal}\n기사유형: ${plan.intent_type}\n반드시 포함: ${plan.must_cover.join(' / ')}\n반드시 제외: ${plan.must_avoid.join(' / ')}\n개요: ${plan.outline.join(' > ')}\n\n[검증 근거]\n${evidence}\n\n규칙:\n- 위 근거에 명시된 사실만 사용하세요.\n- 병원명, 의사명, 학교명, 주소, 전화번호, 운영시간, 비용, 후기, 순위를 추측하지 마세요.\n- 555 번호와 Texas 외 주소는 넣지 마세요.\n- 사용자 제공 URL을 가장 우선하세요.\n- 충돌하거나 확인되지 않는 정보는 생략하거나 공식 홈페이지 재확인 필요라고 표시하세요.\n- 초안을 만든 뒤 내부적으로 다시 대조하여 허위 가능 문장을 제거한 최종본만 article에 반환하세요.\n- quality.score는 사실근거 50, 의도일치 30, 표현 20 기준으로 채점하세요. 위험이 있으면 unsupported_claim_risk를 높이고 해당 문장은 article에서 삭제하세요.`
    });

    const usedSources = [
      ...readableProvided.map(p => ({ title:'사용자 제공 참고 URL', url:p.url, type:'provided_url' })),
      ...verifiedPlaces.map(p => ({ title:p.name, url:p.google_maps_url || p.website, type:'google_place', address:p.address })),
      ...readableOfficialPages.map(p => ({ title:'공식 웹사이트', url:p.url, type:'official_website' }))
    ];

    return { statusCode: 200, headers, body: JSON.stringify({
      article: result.article, category, category_name: categoryNames[category] || category,
      quality: { ...result.quality, intent_type: plan.intent_type, search_queries: plan.search_queries,
        google_search_used:false, google_places_used:placeBased, google_places_count:verifiedPlaces.length,
        provided_urls_read:readableProvided.length, official_pages_read:readableOfficialPages.length,
        places_checked:placeBased, optimized_pipeline:true, sources:usedSources }
    }) };
  } catch (error) {
    console.error('generate-guide error', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message || 'AI 글 생성 오류' }) };
  }
};
