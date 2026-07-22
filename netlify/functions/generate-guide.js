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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const json = await response.json();
    if (!response.ok) throw new Error(json?.error?.message || `OpenAI 요청 실패 (${response.status})`);
    return json;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('OpenAI 검색 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function askOpenAIJson({ name, schema, system, prompt, webSearch = false }) {
  const payload = {
    model: process.env.OPENAI_SEARCH_MODEL || process.env.OPENAI_MODEL || 'gpt-4.1-mini',
    input: [
      { role: 'system', content: [{ type: 'input_text', text: system }] },
      { role: 'user', content: [{ type: 'input_text', text: prompt }] }
    ],
    text: { format: { type: 'json_schema', name, strict: true, schema } }
  };
  if (webSearch) payload.tools = [{ type: 'web_search' }];
  const json = await callResponses(payload);
  const text = outputText(json);
  if (!text) throw new Error('AI 응답 본문이 비어 있습니다.');
  try { return JSON.parse(text); }
  catch (_) { throw new Error('AI 검색 결과를 구조화하지 못했습니다.'); }
}

function stripHtml(html = '') {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function isHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch (_) { return false; }
}

async function fetchPageText(url) {
  if (!isHttpUrl(url)) return { url, ok: false, error: 'invalid_url', text: '' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  try {
    const res = await fetch(url, {
      redirect: 'follow', signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DalTownMapBot/2.0)' }
    });
    if (!res.ok) return { url, ok: false, error: `HTTP ${res.status}`, text: '' };
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      return { url, ok: false, error: `unsupported:${contentType}`, text: '' };
    }
    const raw = await res.text();
    return { url: res.url || url, ok: true, text: stripHtml(raw).slice(0, 10000) };
  } catch (error) {
    return { url, ok: false, error: error.name === 'AbortError' ? 'timeout' : error.message, text: '' };
  } finally { clearTimeout(timer); }
}

async function searchGooglePlaces(query, count = 3) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return [];
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': [
        'places.id','places.displayName','places.formattedAddress','places.nationalPhoneNumber',
        'places.websiteUri','places.googleMapsUri','places.rating','places.userRatingCount',
        'places.businessStatus','places.primaryType','places.types'
      ].join(',')
    },
    body: JSON.stringify({
      textQuery: query,
      pageSize: Math.min(Math.max(count, 1), 5),
      languageCode: 'en', regionCode: 'US'
    })
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || `Google Places API 오류 ${res.status}`);
  return (json.places || []).map(place => ({
    id: place.id || '', name: place.displayName?.text || '', address: place.formattedAddress || '',
    phone: place.nationalPhoneNumber || '', website: place.websiteUri || '',
    google_maps_url: place.googleMapsUri || '', rating: Number.isFinite(place.rating) ? place.rating : null,
    review_count: Number.isFinite(place.userRatingCount) ? place.userRatingCount : null,
    business_status: place.businessStatus || '', primary_type: place.primaryType || '', types: place.types || [], query
  }));
}

function isPlaceBasedTopic(category, topic) {
  if (['health', 'business'].includes(category)) return true;
  return /(병원|의원|클리닉|의사|치과|약국|학교|학원|대학|식당|업소|가게|매장|변호사|회계사|목록|리스트|추천|가까운|주소|전화번호)/i.test(topic);
}

function extractTargetCity(text) {
  const known = [
    ['캐롤튼', 'Carrollton'], ['캐럴턴', 'Carrollton'], ['프리스코', 'Frisco'], ['플레이노', 'Plano'],
    ['리처드슨', 'Richardson'], ['달라스', 'Dallas'], ['알렌', 'Allen'], ['맥키니', 'McKinney'],
    ['루이스빌', 'Lewisville'], ['코펠', 'Coppell'], ['그레이프바인', 'Grapevine'],
    ['Carrollton', 'Carrollton'], ['Frisco', 'Frisco'], ['Plano', 'Plano'], ['Richardson', 'Richardson'],
    ['Dallas', 'Dallas'], ['Allen', 'Allen'], ['McKinney', 'McKinney'], ['Lewisville', 'Lewisville']
  ];
  const hit = known.find(([needle]) => text.toLowerCase().includes(needle.toLowerCase()));
  return hit ? hit[1] : '';
}

const researchSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    intent_type: { type: 'string' }, user_goal: { type: 'string' }, target_city: { type: 'string' },
    hard_qualifiers: { type: 'array', items: { type: 'string' } },
    must_cover: { type: 'array', items: { type: 'string' } },
    must_avoid: { type: 'array', items: { type: 'string' } },
    outline: { type: 'array', items: { type: 'string' } },
    facts: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
      claim: { type: 'string' }, source_title: { type: 'string' }, source_url: { type: 'string' }, confidence: { type: 'integer' }
    }, required: ['claim','source_title','source_url','confidence'] } },
    place_candidates: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
      name: { type: 'string' }, city: { type: 'string' }, reason_matches: { type: 'string' },
      source_title: { type: 'string' }, source_url: { type: 'string' }, confidence: { type: 'integer' }
    }, required: ['name','city','reason_matches','source_title','source_url','confidence'] } },
    sources: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
      title: { type: 'string' }, url: { type: 'string' }, source_type: { type: 'string' }
    }, required: ['title','url','source_type'] } }
  },
  required: ['intent_type','user_goal','target_city','hard_qualifiers','must_cover','must_avoid','outline','facts','place_candidates','sources']
};

const finalSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    article: { type: 'object', additionalProperties: false, properties: {
      title: { type: 'string' }, summary: { type: 'string' }, content: { type: 'string' },
      author_name: { type: 'string' }, link_label: { type: 'string' }, source_url: { type: 'string' }
    }, required: ['title','summary','content','author_name','link_label','source_url'] },
    score: { type: 'integer' }, intent_match: { type: 'integer' }, relevance: { type: 'integer' },
    unsupported_claim_risk: { type: 'integer' }, problems: { type: 'array', items: { type: 'string' } }
  },
  required: ['article','score','intent_match','relevance','unsupported_claim_risk','problems']
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

    const readableProvided = (await Promise.all(sources.slice(0, 4).map(fetchPageText))).filter(p => p.ok && p.text);
    if (sources.length && readableProvided.length === 0) {
      throw new Error('입력한 참고 URL의 내용을 읽지 못했습니다. 공개 웹페이지 주소인지 확인해 주세요.');
    }

    const explicitCity = extractTargetCity(`${topic} ${instructions}`);
    const providedEvidence = readableProvided.map((p, i) => `[사용자 제공 URL ${i + 1}]\n${p.url}\n${p.text}`).join('\n\n').slice(0, 28000);

    let research;
    try {
      research = await askOpenAIJson({
        name: 'daltown_web_research', schema: researchSchema, webSearch: true,
        system: '당신은 실시간 웹 검색을 사용하는 달라스 한인 지역 미디어 리서처입니다. 질문의 한국어 지역명과 한인·한국어 같은 필수 조건을 절대 약화하지 않습니다. 검색 결과에 없는 장소나 사실을 만들지 않습니다.',
        prompt: `다음 주제를 실시간 웹 검색으로 조사하세요. 한국어 검색과 영어 검색을 모두 수행하고, 공식 사이트·Google 지도/비즈니스 페이지·지역 한인 매체·신뢰할 수 있는 디렉터리를 교차 확인하세요.\n\n주제: ${topic}\n분야: ${categoryNames[category] || category}\n추가 지시: ${instructions || '없음'}\n사용자가 명시한 도시: ${explicitCity || '자동 판별'}\n\n${providedEvidence ? `[사용자 제공 URL 본문 — 최우선 근거]\n${providedEvidence}` : ''}\n\n필수 규칙:\n- '캐롤튼 한인 내과'처럼 도시+한인+진료과가 있으면 세 조건을 모두 만족하는 후보만 place_candidates에 넣으세요.\n- 검색 결과가 풍부하다는 이유로 다른 도시나 일반 영어권 업소를 대신 선택하지 마세요.\n- 한국어 이름, 영문 이름, 별칭을 함께 검색하세요.\n- 각 사실과 후보에는 실제로 확인한 source_url을 넣으세요.\n- 전화번호·주소·운영시간은 검색 요약만으로 단정하지 말고 이후 Places/공식 사이트 검증 대상으로 남기세요.\n- 확실하지 않으면 후보를 적게 반환하세요. 0개도 허용됩니다.\n- 입학/등록 절차를 묻지 않았는데 절차형 기사로 바꾸지 마세요.`
      });
    } catch (error) {
      if (/web_search|tool|unsupported|not available/i.test(error.message)) {
        throw new Error('현재 OPENAI_API_KEY 또는 모델에서 OpenAI 웹 검색 도구를 사용할 수 없습니다. Netlify의 OPENAI_MODEL을 웹 검색 지원 모델로 설정해 주세요.');
      }
      throw error;
    }

    const placeBased = isPlaceBasedTopic(category, topic);
    const targetCity = explicitCity || research.target_city || '';
    let verifiedPlaces = [];

    if (placeBased && research.place_candidates.length) {
      const searches = research.place_candidates.slice(0, 8).map(async candidate => {
        const q = `${candidate.name} ${candidate.city || targetCity || 'Texas'}`;
        const results = await searchGooglePlaces(q, 3);
        const exact = results.find(p => {
          const cityOk = !targetCity || p.address.toLowerCase().includes(targetCity.toLowerCase());
          const nameWords = candidate.name.toLowerCase().split(/\s+/).filter(w => w.length > 2);
          const nameOk = nameWords.length === 0 || nameWords.some(w => p.name.toLowerCase().includes(w));
          return cityOk && nameOk;
        });
        return exact ? { ...exact, web_reason: candidate.reason_matches, web_source_url: candidate.source_url, web_confidence: candidate.confidence } : null;
      });
      verifiedPlaces = (await Promise.all(searches)).filter(Boolean);
    }

    if (placeBased && research.place_candidates.length && verifiedPlaces.length === 0) {
      throw new Error(`웹 검색 후보를 찾았지만 Google Places에서 ${targetCity || '요청 지역'}의 실제 장소로 확인하지 못했습니다. 다른 지역의 일반 장소로 대체하지 않고 생성을 중단했습니다.`);
    }

    const officialUrls = [...new Set(verifiedPlaces.map(p => p.website).filter(isHttpUrl))].slice(0, readableProvided.length ? 1 : 3);
    const officialPages = (await Promise.all(officialUrls.map(fetchPageText))).filter(p => p.ok && p.text);

    const evidence = [
      ...research.facts.map((f, i) => `[웹 검색 사실 ${i + 1}]\n주장: ${f.claim}\n출처: ${f.source_title}\nURL: ${f.source_url}\n신뢰도: ${f.confidence}`),
      ...readableProvided.map((p, i) => `[사용자 제공 출처 ${i + 1}]\nURL: ${p.url}\n본문: ${p.text}`),
      ...verifiedPlaces.map((p, i) => `[Google Places 검증 ${i + 1}]\n이름: ${p.name}\n주소: ${p.address}\n전화: ${p.phone || '미제공'}\n웹사이트: ${p.website || '미제공'}\n지도: ${p.google_maps_url || '미제공'}\n웹 검색 일치 근거: ${p.web_reason}\n웹 출처: ${p.web_source_url}`),
      ...officialPages.map((p, i) => `[공식 홈페이지 ${i + 1}]\nURL: ${p.url}\n본문: ${p.text}`)
    ].join('\n\n').slice(0, 78000);

    if (!evidence.trim()) throw new Error('웹 검색에서 기사 작성에 사용할 신뢰할 수 있는 근거를 확보하지 못했습니다.');

    const result = await askOpenAIJson({
      name: 'daltown_verified_article', schema: finalSchema,
      system: '당신은 달라스 한인 미디어의 엄격한 한국어 편집장입니다. 제공된 실시간 웹 검색, Google Places 검증, 공식 URL 본문에 있는 사실만 사용합니다.',
      prompt: `아래 근거만으로 최종 기사를 작성하고 동시에 자체 검수하세요.\n\n[사용자 요청]\n${topic}\n\n[검색 의도]\n유형: ${research.intent_type}\n목표: ${research.user_goal}\n대상 도시: ${targetCity || '문맥에 따름'}\n필수 조건: ${research.hard_qualifiers.join(' / ') || '없음'}\n반드시 포함: ${research.must_cover.join(' / ')}\n반드시 제외: ${research.must_avoid.join(' / ')}\n개요: ${research.outline.join(' > ')}\n\n[검증 근거]\n${evidence}\n\n절대 규칙:\n- 장소 기반 기사에서는 Google Places로 검증된 장소만 이름·주소·전화번호와 함께 소개하세요.\n- 웹 검색에서 '한인/한국어' 근거가 있고 Google Places에서 같은 장소로 확인된 후보만 한인 업소로 표현하세요.\n- 요청 도시가 ${targetCity || '특정 도시'}이면 다른 도시 장소로 대체하지 마세요.\n- 근거에 없는 의사명, 후기, 운영시간, 비용, 순위, 특징을 만들지 마세요.\n- 555 전화번호와 예시 주소를 절대 쓰지 마세요.\n- 사용자 제공 URL과 다른 근거가 충돌하면 공식 홈페이지/Places의 최신 고유정보를 우선하고 충돌 사실은 생략하세요.\n- 근거가 부족하면 항목 수를 줄이세요. 내용을 채우기 위해 추측하지 마세요.\n- source_url에는 가장 핵심적인 실제 출처 URL 하나를 넣으세요.\n- score는 의도 일치 35, 근거 일치 40, 고유정보 검증 20, 표현 5 기준으로 채점하세요.\n- unsupported_claim_risk가 15를 넘지 않도록 근거 없는 문장을 제거한 최종본만 반환하세요.`
    });

    const usedSources = [
      ...research.sources.filter(s => isHttpUrl(s.url)).map(s => ({ title: s.title, url: s.url, type: s.source_type })),
      ...readableProvided.map(p => ({ title: '사용자 제공 참고 URL', url: p.url, type: 'provided_url' })),
      ...verifiedPlaces.map(p => ({ title: p.name, url: p.google_maps_url || p.website, type: 'google_place', address: p.address })),
      ...officialPages.map(p => ({ title: '공식 웹사이트', url: p.url, type: 'official_website' }))
    ].filter((s, i, arr) => s.url && arr.findIndex(x => x.url === s.url) === i).slice(0, 20);

    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        article: result.article,
        category, category_name: categoryNames[category] || category,
        quality: {
          score: result.score, intent_match: result.intent_match, relevance: result.relevance,
          unsupported_claim_risk: result.unsupported_claim_risk, problems: result.problems,
          intent_type: research.intent_type,
          web_search_used: true,
          web_facts_count: research.facts.length,
          web_candidates_count: research.place_candidates.length,
          google_places_used: placeBased,
          google_places_count: verifiedPlaces.length,
          target_city: targetCity,
          hard_qualifiers: research.hard_qualifiers,
          provided_urls_read: readableProvided.length,
          official_pages_read: officialPages.length,
          sources: usedSources
        }
      })
    };
  } catch (error) {
    console.error('generate-guide error', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message || 'AI 글 생성 오류' }) };
  }
};
