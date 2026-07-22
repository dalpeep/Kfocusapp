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
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DalTownMapBot/1.0)' }
    });
    if (!res.ok) return { url, ok: false, error: `HTTP ${res.status}`, text: '' };
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      return { url, ok: false, error: `unsupported_content_type:${contentType}`, text: '' };
    }
    const raw = await res.text();
    return { url: res.url || url, ok: true, text: stripHtml(raw).slice(0, 12000) };
  } catch (error) {
    return { url, ok: false, error: error.name === 'AbortError' ? 'timeout' : error.message, text: '' };
  } finally {
    clearTimeout(timer);
  }
}

async function searchGooglePlaces(query, count = 5) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    throw new Error('Google 장소 확인을 위해 Netlify 환경변수 GOOGLE_MAPS_API_KEY가 필요합니다.');
  }

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
      pageSize: Math.min(Math.max(count, 1), 10),
      languageCode: 'en',
      regionCode: 'US'
    })
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || `Google Places API 오류 ${res.status}`);
  return (json.places || []).map(place => ({
    id: place.id || '',
    name: place.displayName?.text || '',
    address: place.formattedAddress || '',
    phone: place.nationalPhoneNumber || '',
    website: place.websiteUri || '',
    google_maps_url: place.googleMapsUri || '',
    rating: Number.isFinite(place.rating) ? place.rating : null,
    review_count: Number.isFinite(place.userRatingCount) ? place.userRatingCount : null,
    business_status: place.businessStatus || '',
    primary_type: place.primaryType || '',
    types: place.types || [],
    query
  }));
}

function isPlaceBasedTopic(category, topic) {
  if (['health', 'education', 'business'].includes(category)) return true;
  return /(병원|의원|클리닉|의사|치과|약국|학교|학원|대학|식당|업소|가게|매장|변호사|회계사|보험|목록|리스트|추천|가까운|주소|전화번호)/i.test(topic);
}

function uniquePlaces(items) {
  const seen = new Set();
  return items.filter(place => {
    const key = place.id || `${place.name}|${place.address}`.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function verifyPlacesFromArticle(article, topic) {
  if (!process.env.GOOGLE_MAPS_API_KEY) return { checked: false, matches: [], warning: 'GOOGLE_MAPS_API_KEY 미설정' };
  const text = `${topic}\n${article.title}\n${article.content}`;
  const candidateLines = text.split(/\n/).map(v => v.trim()).filter(Boolean)
    .filter(v => /(clinic|hospital|medical|dental|law|school|academy|센터|병원|의원|클리닉|내과|치과|학교|학원)/i.test(v))
    .slice(0, 12);
  const matches = [];
  for (const line of candidateLines.slice(0, 6)) {
    const q = line.replace(/^[-*•\d.\s]+/, '').slice(0, 180);
    try {
      const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri'
        },
        body: JSON.stringify({ textQuery: `${q} Dallas Texas` })
      });
      const json = await res.json();
      const p = json.places?.[0];
      matches.push({ query: q, found: !!p, place: p ? {
        name: p.displayName?.text || '', address: p.formattedAddress || '', phone: p.nationalPhoneNumber || '',
        website: p.websiteUri || '', google_maps_url: p.googleMapsUri || ''
      } : null });
    } catch (_) {
      matches.push({ query: q, found: false, place: null });
    }
  }
  return { checked: true, matches };
}

const planSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    intent_type: { type: 'string' }, user_goal: { type: 'string' },
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
    score: { type: 'integer' }, intent_match: { type: 'integer' }, relevance: { type: 'integer' },
    unsupported_claim_risk: { type: 'integer' },
    problems: { type: 'array', items: { type: 'string' } }, revised_article: articleSchema
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

    const plan = await askOpenAI({
      name: 'guide_intent_plan', schema: planSchema,
      system: '당신은 사용자의 질문 의도를 분류하고 주제 이탈을 막는 콘텐츠 기획자입니다.',
      prompt: `다음 요청을 분석해 기사 작성 계획을 만드세요.\n\n주제: ${topic}\n분야: ${categoryNames[category] || category}\n추가 지시: ${instructions || '없음'}\n\n규칙:\n- 제목에 특징, 장점, 비교, 이유가 있으면 절차·준비물 중심 글로 바꾸지 마세요.\n- 제목에 방법, 신청, 등록, 준비물, 절차가 있을 때만 절차형으로 분류하세요.\n- search_queries는 Google 검색에 적합한 영어 중심 4~6개로 만들고 지역명 Dallas/Fort Worth 또는 주제의 실제 도시명을 포함하세요.\n- 병원·의사·학교·업소 목록 주제라면 official, address, phone, website 같은 검증 키워드를 포함하세요.\n- outline은 사용자 질문에 직접 답하는 순서로 구성하세요.`
    });

    const placeBased = isPlaceBasedTopic(category, topic);
    const placeResults = [];
    if (placeBased) {
      for (const query of plan.search_queries.slice(0, 4)) {
        const localizedQuery = /Dallas|Fort Worth|DFW|Texas/i.test(query) ? query : `${query} Dallas Fort Worth Texas`;
        const results = await searchGooglePlaces(localizedQuery, 6);
        placeResults.push(...results);
      }
    }
    const verifiedPlaces = uniquePlaces(placeResults).slice(0, 18);

    const providedPages = await Promise.all(sources.slice(0, 6).map(fetchPageText));
    const readableProvided = providedPages.filter(p => p.ok && p.text);

    if (sources.length && readableProvided.length === 0) {
      throw new Error('입력한 참고 URL의 내용을 읽지 못했습니다. 주소가 공개 웹페이지인지 확인해 주세요. 잘못된 내용을 추측해 작성하지 않도록 생성을 중단했습니다.');
    }
    if (!placeBased && readableProvided.length === 0) {
      throw new Error('이 주제는 장소 검색만으로 사실을 확인하기 어렵습니다. 공식기관 또는 신뢰할 수 있는 참고 URL을 하나 이상 입력해 주세요.');
    }
    if (placeBased && verifiedPlaces.length === 0 && readableProvided.length === 0) {
      throw new Error('Google Maps/Places에서 확인 가능한 장소를 찾지 못했습니다. 검색 주제나 지역명을 더 구체적으로 입력하거나 공식 참고 URL을 추가해 주세요.');
    }

    const officialWebsiteUrls = [...new Set(verifiedPlaces.map(p => p.website).filter(isHttpUrl))].slice(0, 8);
    const officialPages = await Promise.all(officialWebsiteUrls.map(fetchPageText));
    const readableOfficialPages = officialPages.filter(p => p.ok && p.text);

    const evidence = [
      ...readableProvided.map((p, i) => `[사용자 제공 출처 ${i + 1}]\nURL: ${p.url}\n본문: ${p.text}`),
      ...verifiedPlaces.map((p, i) => `[Google Maps/Places 확인 ${i + 1}]\n이름: ${p.name}\n주소: ${p.address}\n전화: ${p.phone || '미제공'}\n웹사이트: ${p.website || '미제공'}\nGoogle 지도: ${p.google_maps_url || '미제공'}\n평점: ${p.rating ?? '미제공'}\n리뷰 수: ${p.review_count ?? '미제공'}\n영업 상태: ${p.business_status || '미제공'}`),
      ...readableOfficialPages.map((p, i) => `[장소 공식 웹사이트 ${i + 1}]\nURL: ${p.url}\n본문: ${p.text}`)
    ].join('\n\n').slice(0, 85000);

    const draft = await askOpenAI({
      name: 'daltown_guide_draft', schema: articleSchema,
      system: '당신은 달라스 한인 지역 미디어의 사실 검증형 한국어 편집자입니다. 제공된 Google Maps/Places 검증 자료와 읽은 공식 웹페이지 안에 명시된 사실만 사용합니다.',
      prompt: `아래 기획서와 실제 검증 근거만으로 한국어 가이드 초안을 작성하세요.\n\n[사용자 요청]\n${topic}\n\n[기획서]\n기사 유형: ${plan.intent_type}\n목표: ${plan.user_goal}\n반드시 포함: ${plan.must_cover.join(' / ')}\n반드시 제외: ${plan.must_avoid.join(' / ')}\n개요: ${plan.outline.join(' > ')}\n\n[Google Maps/Places 검증 자료 및 URL 본문]\n${evidence}\n\n[절대 규칙]\n- 근거에 없는 병원명, 의사명, 학교명, 주소, 전화번호, 운영시간, 비용, 후기, 순위는 절대로 만들지 마세요.\n- 555 전화번호나 예시 주소를 작성하지 마세요.\n- Dallas/Texas 주제에 타주 주소를 넣지 마세요.\n- Google Places와 공식 홈페이지가 충돌하면 공식 홈페이지의 최신 정보를 우선하되, 해결되지 않으면 해당 정보를 생략하세요.\n- 사용자 제공 URL은 실제 본문이 제공되었으므로 가장 우선적으로 반영하세요.\n- 목록형 장소 정보는 각 항목에 확인 가능한 이름과 주소가 있을 때만 포함하세요.\n- 확인할 수 없는 내용은 추측하지 말고 생략하거나 '공식 홈페이지에서 재확인 필요'라고 쓰세요.\n- source_url에는 가장 핵심적인 공식 출처 URL 하나를 넣으세요.\n- 모바일에서 읽기 좋은 소제목과 짧은 문단을 사용하세요.`
    });

    const placeVerification = placeBased
      ? { checked: true, matches: verifiedPlaces.map(p => ({ query: p.query, found: true, place: p })) }
      : { checked: false, matches: [] };

    const review = await askOpenAI({
      name: 'guide_quality_review', schema: reviewSchema,
      system: '당신은 Google Places·공식 URL 근거와 기사 초안을 대조하여 허위 고유명사·주소·전화번호를 제거하는 엄격한 팩트체커입니다.',
      prompt: `다음 초안을 실제 Google 검색 근거와 대조해 검수하고 revised_article에 완성본 전체를 반환하세요.\n\n사용자 요청: ${topic}\n목표: ${plan.user_goal}\n반드시 포함: ${plan.must_cover.join(' / ')}\n반드시 제외: ${plan.must_avoid.join(' / ')}\n\n[검증 근거]\n${evidence}\n\n[Google Places 보조검증]\n${JSON.stringify(placeVerification)}\n\n[초안]\n${JSON.stringify(draft)}\n\n규칙:\n- 검색 근거에 없는 병원, 의사, 학교, 업소, 주소, 전화번호를 모두 삭제하세요.\n- Google Places에서 found=false인 후보는 검색 근거에 공식 출처가 명확하지 않으면 삭제하세요.\n- 555 번호, 타주 주소, 출처 불명의 후기·평판은 반드시 삭제하세요.\n- 사용자 의도 일치 35점, 검색 근거 일치 40점, 고유정보 검증 20점, 표현 품질 5점으로 채점하세요.\n- unsupported_claim_risk는 위험이 높을수록 높은 점수입니다.\n- score 85 미만 또는 unsupported_claim_risk 20 초과면 근거 있는 내용만 남겨 재작성하세요.`
    });

    const usedSources = [
      ...readableProvided.map(p => ({ title: '사용자 제공 참고 URL', url: p.url, type: 'provided_url' })),
      ...verifiedPlaces.slice(0, 12).map(p => ({ title: p.name, url: p.google_maps_url || p.website, type: 'google_place', address: p.address })),
      ...readableOfficialPages.map(p => ({ title: '공식 웹사이트', url: p.url, type: 'official_website' }))
    ];
    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        article: review.revised_article,
        category,
        category_name: categoryNames[category] || category,
        quality: {
          score: review.score, intent_match: review.intent_match, relevance: review.relevance,
          unsupported_claim_risk: review.unsupported_claim_risk, problems: review.problems,
          intent_type: plan.intent_type, search_queries: plan.search_queries,
          google_search_used: false,
          google_places_used: placeBased,
          google_places_count: verifiedPlaces.length,
          provided_urls_read: readableProvided.length,
          official_pages_read: readableOfficialPages.length,
          places_checked: placeVerification.checked,
          sources: usedSources
        }
      })
    };
  } catch (error) {
    console.error('generate-guide error', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message || 'AI 글 생성 오류' }) };
  }
};
