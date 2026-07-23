const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function outputText(json) {
  return json.output_text || json.output?.flatMap(x => x.content || []).find(x => x.type === 'output_text')?.text || '';
}
function normalize(v = '') {
  return String(v).toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
}
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, Number(n) || 0));
}
function uniqueStrings(values = []) {
  return [...new Set(values.map(v => String(v || '').trim()).filter(Boolean))];
}

const KOREAN_COMMUNITY_SOURCES = [
  { key: 'dalsaram', label: '달사람 업소록', domains: ['dalsaram.com'], weight: 15 },
  { key: 'ktn', label: 'KTN 업소록', domains: ['ktnusa.com'], weight: 14 },
  { key: 'weeklyfocus', label: '주간포커스', domains: ['weeklyfocustx.com'], weight: 14 },
  { key: 'koreadaily_yp', label: '중앙일보 업소록', domains: ['yp.koreadaily.com'], weight: 15 },
  { key: 'koreadaily', label: '미주중앙일보', domains: ['koreadaily.com'], weight: 11 }
];
function sourceMeta(urls = []) {
  const found = [];
  for (const source of KOREAN_COMMUNITY_SOURCES) {
    if (urls.some(url => source.domains.some(domain => String(url || '').toLowerCase().includes(domain)))) {
      found.push({ key: source.key, label: source.label, weight: source.weight });
    }
  }
  const bonus = Math.min(18, found.reduce((sum, item) => sum + item.weight, 0));
  return { found, bonus };
}

function extractRequestedCity(topic = '') {
  const pairs = [
    ['캐롤튼', 'Carrollton'], ['캐롤톤', 'Carrollton'], ['플레이노', 'Plano'],
    ['프리스코', 'Frisco'], ['리차드슨', 'Richardson'], ['리처드슨', 'Richardson'],
    ['달라스', 'Dallas'], ['알렌', 'Allen'], ['루이스빌', 'Lewisville'],
    ['코펠', 'Coppell'], ['포트워스', 'Fort Worth'], ['리틀엘름', 'Little Elm'],
    ['그랜드프레리', 'Grand Prairie'], ['어빙', 'Irving'], ['갈랜드', 'Garland']
  ];
  const t = String(topic).toLowerCase();
  for (const [ko, en] of pairs) {
    if (t.includes(ko.toLowerCase()) || t.includes(en.toLowerCase())) return en;
  }
  return '';
}
function extractHardQualifiers(topic = '') {
  const rules = [
    { key: 'korean', re: /(한인|한국인|한국어|한글|korean(?:[- ]?speaking)?)/i, label: '한인·한국어' },
    { key: 'internal_medicine', re: /(내과|internal medicine|internist)/i, label: '내과' },
    { key: 'family_medicine', re: /(가정의학|family medicine|family practice)/i, label: '가정의학' },
    { key: 'pediatric', re: /(소아과|소아청소년과|pediatric)/i, label: '소아과' },
    { key: 'dental', re: /(치과|dentist|dental)/i, label: '치과' },
    { key: 'female', re: /(여의사|여성 의사|female doctor|woman doctor)/i, label: '여의사' }
  ];
  return rules.filter(r => r.re.test(String(topic)));
}
async function callResponses(payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 24000);
  try {
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error?.message || `OpenAI 오류 ${res.status}`);
    return json;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('웹 검색이 제한 시간 안에 끝나지 않았습니다. 잠시 후 다시 검색해 주세요.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
async function searchGooglePlaces(query, count = 5) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6500);
  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.rating,places.userRatingCount,places.businessStatus'
      },
      body: JSON.stringify({ textQuery: query, pageSize: count, languageCode: 'en', regionCode: 'US' })
    });
    const json = await res.json();
    if (!res.ok) return [];
    return (json.places || []).map(p => ({
      id: p.id || '',
      name: p.displayName?.text || '',
      address: p.formattedAddress || '',
      phone: p.nationalPhoneNumber || '',
      website: p.websiteUri || '',
      google_maps_url: p.googleMapsUri || '',
      rating: p.rating ?? null,
      review_count: p.userRatingCount ?? null,
      business_status: p.businessStatus || ''
    }));
  } catch (_) {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
function nameSimilarity(candidate, place) {
  const names = [candidate.name, ...(candidate.aliases || [])].map(normalize).filter(Boolean);
  const pn = normalize(place.name);
  if (!pn) return 0;
  if (names.some(n => n === pn)) return 100;
  if (names.some(n => pn.includes(n) || n.includes(pn))) return 82;
  const tokens = names.flatMap(n => n.match(/[a-z0-9가-힣]{3,}/g) || []);
  const hits = tokens.filter(t => pn.includes(t)).length;
  return tokens.length ? Math.round((hits / tokens.length) * 65) : 0;
}
function bestPlace(candidate, places, requestedCity) {
  let best = null;
  let bestScore = -1;
  for (const p of places) {
    let score = nameSimilarity(candidate, p);
    const candidateCity = candidate.city || requestedCity;
    if (candidateCity && normalize(p.address).includes(normalize(candidateCity))) score += 28;
    if (requestedCity && normalize(p.address).includes(normalize(requestedCity))) score += 12;
    if (p.business_status === 'OPERATIONAL') score += 5;
    if (score > bestScore) {
      best = p;
      bestScore = score;
    }
  }
  return bestScore >= 55 ? { ...best, _match_score: bestScore } : null;
}
function cityScore(candidate, place, requestedCity) {
  if (!requestedCity) return 20;
  const requested = normalize(requestedCity);
  const placeAddress = normalize(place?.address || '');
  const candidateCity = normalize(candidate.city || '');
  if (placeAddress.includes(requested)) return 25;
  if (candidateCity === requested || candidateCity.includes(requested) || requested.includes(candidateCity)) return 20;
  return 0;
}
function computeScore(candidate, place, requestedCity, qualifiers, communityBonus = 0) {
  const evidence = clamp(candidate.qualifier_evidence_score, 0, 40);
  const specialty = clamp(candidate.specialty_score, 0, 25);
  const locality = cityScore(candidate, place, requestedCity);
  const placeScore = place ? 10 : 0;
  const researchConfidence = clamp(candidate.confidence, 0, 100) * 0.1;
  let total = Math.round(evidence + specialty + locality + placeScore + researchConfidence + communityBonus);

  const koreanRequired = qualifiers.some(q => q.key === 'korean');
  const specialtyRequired = qualifiers.some(q => q.key !== 'korean' && q.key !== 'female');
  if (koreanRequired && evidence < 10) total -= 18;
  if (specialtyRequired && specialty < 8) total -= 12;
  if (requestedCity && locality === 0) total -= 18;
  return clamp(total, 0, 100);
}

const schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    interpreted_request: { type: 'string' },
    queries_used: { type: 'array', items: { type: 'string' } },
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          aliases: { type: 'array', items: { type: 'string' } },
          city: { type: 'string' },
          specialty: { type: 'string' },
          qualifier_evidence: { type: 'string' },
          qualifier_evidence_score: { type: 'integer' },
          specialty_score: { type: 'integer' },
          evidence_level: { type: 'string', enum: ['strong', 'moderate', 'weak', 'none'] },
          confidence: { type: 'integer' },
          source_urls: { type: 'array', items: { type: 'string' } },
          source_titles: { type: 'array', items: { type: 'string' } }
        },
        required: ['name', 'aliases', 'city', 'specialty', 'qualifier_evidence', 'qualifier_evidence_score', 'specialty_score', 'evidence_level', 'confidence', 'source_urls', 'source_titles']
      }
    }
  },
  required: ['interpreted_request', 'queries_used', 'candidates']
};

exports.handler = async event => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'POST only' }) };

  try {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY가 필요합니다.');
    const body = JSON.parse(event.body || '{}');
    const topic = String(body.topic || '').trim();
    const category = String(body.category || '').trim();
    const instructions = String(body.instructions || '').trim();
    const sources = Array.isArray(body.sources) ? uniqueStrings(body.sources) : [];
    if (!topic) return { statusCode: 400, headers, body: JSON.stringify({ error: '검색 주제를 입력하세요.' }) };

    const city = extractRequestedCity(topic);
    const qualifiers = extractHardQualifiers(topic);
    const qualifierLabels = qualifiers.map(q => q.label);
    const model = process.env.OPENAI_SEARCH_MODEL || process.env.OPENAI_MODEL || 'gpt-4.1-mini';

    const response = await callResponses({
      model,
      tools: [{ type: 'web_search', search_context_size: 'medium' }],
      tool_choice: 'auto',
      input: [
        {
          role: 'system',
          content: [{
            type: 'input_text',
            text: '당신은 달라스 한인 지역정보의 조사 편집자입니다. 후보를 넓게 수집하되, 한인·한국어 여부와 전문분야는 실제 웹 근거로만 평가합니다. 한국계 이름, 사진, 추측만으로 한인이라고 판정하지 마세요. 공식 사이트만 고집하지 말고 공식 의료진 프로필, 병원 프로필, 한인 업소록, 지역 언론, 보험사·의료 디렉터리 등 여러 출처를 교차 확인하세요.'
          }]
        },
        {
          role: 'user',
          content: [{
            type: 'input_text',
            text: `요청: ${topic}\n분야: ${category || '원문 기준'}\n요청 도시: ${city || '원문에서 판단'}\n필수 조건: ${qualifierLabels.join(', ') || '없음'}\n추가 지시: ${instructions || '없음'}\n사용자 참고 URL:\n${sources.join('\n') || '없음'}\n\n조사 규칙:\n1) 검색어를 먼저 10~14개 설계하고 실제 검색에 사용하세요. 원문 한국어, 정확한 영어 번역, Korean-speaking, Korean doctor, Korean directory, 한국어 진료, 한인 업소록 표현을 포함하세요.
1-1) 아래 한국 언론·한인 업소록을 반드시 별도 site 검색하세요. 각 사이트마다 한국어 검색어와 영어 검색어를 최소 1개씩 사용하세요.
- site:dalsaram.com (달사람 업소록)
- site:ktnusa.com (KTN 업소록)
- site:weeklyfocustx.com (주간포커스 텍사스)
- site:yp.koreadaily.com (중앙일보 업소록)
- site:koreadaily.com (미주중앙일보 기사·업소 정보)\n2) 예: “캐롤튼 한인 내과”라면 “Carrollton Korean internal medicine”, “Korean-speaking internist Carrollton TX”, “캐롤튼 한인 내과”, “Carrollton Korean doctor directory”와 함께 “site:dalsaram.com 캐롤튼 내과”, “site:ktnusa.com 캐롤튼 내과”, “site:weeklyfocustx.com 캐롤튼 내과”, “site:yp.koreadaily.com Carrollton internal medicine”를 사용하세요. 지역·한인·전문과목을 핵심 검색어에서 유지하세요.\n3) 같은 병원이나 의사의 중복 표기를 하나의 후보로 합치고 aliases에 넣으세요.\n4) 한인·한국어 근거 점수 0~40: 공식 사이트/의료진 프로필에 Korean 또는 한국어 명시 35~40, 달사람·KTN·주간포커스·중앙일보 업소록/기사의 직접 소개 25~34, 서로 독립적인 복수 한인 매체·디렉터리에서 일관된 표시 20~30, 일반 디렉터리 한 곳만 있으면 10~19, 이름·사진·추측뿐이면 0. 한인 업소록 등록은 한인 커뮤니티 관련성을 입증하는 근거로 사용하되 주소·전화는 Google Places 또는 공식 사이트로 다시 검증하세요.\n5) 전문분야 점수 0~25: 요청 전문과목이 공식 병원/의사 프로필에 명시 20~25, 관련 진료 분야가 확인 10~19, 불명확 0~9.\n6) 요청 도시와 정확히 일치하는 후보를 우선하세요. 인접 도시는 요청 도시 후보가 부족할 때만 포함하되 city에 실제 도시를 명시하고 근거 설명에 인접 도시임을 밝히세요.\n7) 후보를 0개로 만들기보다 weak 후보도 반환하되, 근거가 약하다는 점을 명확히 쓰세요. 단 source_urls가 없는 후보는 반환하지 마세요.\n8) source_urls에는 실제로 후보와 근거를 확인할 수 있는 URL만 넣고 최대 6개로 제한하세요. 가능하면 한인 업소록/언론 URL 1개 이상과 공식 사이트 또는 Google 검증에 도움이 되는 URL을 함께 포함하세요. 검색결과 페이지 URL은 피하세요.\n9) 후보는 최대 10개 반환하세요.`
          }]
        }
      ],
      text: { format: { type: 'json_schema', name: 'guide_search_results_v15', strict: true, schema } }
    });

    const text = outputText(response);
    if (!text) throw new Error('웹 검색 결과가 비어 있습니다.');
    const research = JSON.parse(text);
    const raw = (research.candidates || [])
      .filter(c => c.name && (c.source_urls || []).length)
      .map(c => ({
        ...c,
        source_urls: uniqueStrings(c.source_urls).slice(0, 6),
        source_titles: uniqueStrings(c.source_titles).slice(0, 6)
      }))
      .slice(0, 10);

    const placeGroups = await Promise.all(raw.map(c => {
      const specialty = c.specialty || qualifierLabels.filter(x => x !== '한인·한국어').join(' ');
      return searchGooglePlaces(`${c.name} ${specialty} ${city || c.city || 'Texas'}`, 5);
    }));

    const ranked = raw.map((c, i) => {
      const place = bestPlace(c, placeGroups[i] || [], city);
      const community = sourceMeta(c.source_urls || []);
      const finalScore = computeScore(c, place, city, qualifiers, community.bonus);
      const koreanRequested = qualifiers.some(q => q.key === 'korean');
      const evidenceScore = clamp(c.qualifier_evidence_score, 0, 40);
      const evidenceStatus = !koreanRequested
        ? 'not_required'
        : evidenceScore >= 25
          ? 'confirmed'
          : evidenceScore >= 12
            ? 'probable'
            : 'unconfirmed';
      return {
        ...c,
        place_verified: Boolean(place),
        place: place || null,
        final_score: finalScore,
        community_source_bonus: community.bonus,
        community_sources: community.found,
        evidence_status: evidenceStatus,
        city_match: cityScore(c, place, city) > 0
      };
    })
      .filter(c => c.final_score >= 22)
      .sort((a, b) => b.final_score - a.final_score);

    const exactCity = ranked.filter(c => c.city_match);
    const candidates = (exactCity.length >= 3 ? exactCity : ranked).slice(0, 8);
    const confirmedCount = candidates.filter(c => c.evidence_status === 'confirmed').length;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        topic,
        requested_city: city,
        hard_qualifiers: qualifiers.map(q => q.key),
        interpreted_request: research.interpreted_request,
        queries_used: uniqueStrings(research.queries_used),
        candidates,
        message: candidates.length
          ? `${candidates.length}개의 후보를 점수순으로 찾았습니다. 강한 한인·한국어 근거 ${confirmedCount}개입니다.`
          : '웹 근거가 있는 후보를 찾지 못했습니다. 참고 URL이나 알고 있는 병원·의사 이름을 추가해 다시 검색해 주세요.'
      })
    };
  } catch (error) {
    console.error('search-guide error', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message || '검색 오류' }) };
  }
};
