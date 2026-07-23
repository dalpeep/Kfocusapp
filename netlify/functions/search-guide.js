const KTN_BUSINESSES = require('./data/ktn-businesses.json');

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
function normalizePhone(v = '') {
  const digits = String(v).replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}
function normalizeWebsite(v = '') {
  try {
    const u = new URL(String(v));
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch (_) {
    return String(v).toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0];
  }
}
function normalizeAddress(v = '') {
  return normalize(String(v)
    .replace(/suite|ste\.?|unit|#|road|rd\.?|street|st\.?|avenue|ave\.?|drive|dr\.?|boulevard|blvd\.?/gi, ' '));
}
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, Number(n) || 0));
}
function uniqueStrings(values = []) {
  return [...new Set(values.map(v => String(v || '').trim()).filter(Boolean))];
}
function tokenSet(v = '') {
  return new Set(String(v).toLowerCase().match(/[a-z0-9가-힣]{2,}/g) || []);
}
function overlapScore(a = '', b = '') {
  const A = tokenSet(a);
  const B = tokenSet(b);
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const x of A) if (B.has(x)) hit += 1;
  return hit / Math.max(A.size, B.size);
}

const DALSARAM_DIRECTORY_URL = 'https://www.dalsaram.com/shop/main_VER2.php';
const LOCAL_SOURCE_META = {
  daltownmap: { key: 'daltownmap', label: 'DalTownMap DB', weight: 18 },
  ktn_csv: { key: 'ktn_csv', label: 'KTN 과거 업소록', weight: 16 },
  dalsaram: { key: 'dalsaram', label: '달사람 업소록', weight: 16 }
};

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
function specialtyTerms(qualifiers = []) {
  const map = {
    internal_medicine: ['내과', '병원', '의원', 'clinic', 'medical', 'medicine', 'internist', 'doctor', 'md'],
    family_medicine: ['가정의학', '패밀리', 'family', 'clinic', 'medical', 'doctor', 'md'],
    pediatric: ['소아', '어린이', 'pediatric', 'children', 'kids', 'clinic'],
    dental: ['치과', '덴탈', 'dent', 'dental', 'dentist'],
    female: []
  };
  return uniqueStrings(qualifiers.flatMap(q => map[q.key] || []));
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

async function fetchDalTownMapBusinesses() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return [];
  const endpoint = `${url.replace(/\/$/, '')}/rest/v1/businesses?select=id,name_ko,name_en,category_ko,area,phone,website,address,languages,description,google_maps_url,rating,review_count,is_active,region&limit=5000`;
  try {
    const res = await fetch(endpoint, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }
    });
    if (!res.ok) return [];
    const rows = await res.json();
    return Array.isArray(rows) ? rows : [];
  } catch (_) {
    return [];
  }
}

function localRecordScore(record, topic, city, qualifiers, sourceKey) {
  const haystack = [record.name, record.name_ko, record.name_en, record.category, record.category_ko,
    record.address, record.area, record.languages, record.description].filter(Boolean).join(' ');
  const normHay = normalize(haystack);
  const normTopic = normalize(topic);
  let score = 0;
  if (city && normHay.includes(normalize(city))) score += 35;
  if (!city) score += 8;
  const terms = specialtyTerms(qualifiers);
  const termHits = terms.filter(t => normHay.includes(normalize(t))).length;
  score += Math.min(30, termHits * 8);
  const topicTokens = [...tokenSet(topic)].filter(t => !['한인', '한국어', '추천', '찾아줘', '업소', '병원'].includes(t));
  score += Math.min(20, topicTokens.filter(t => normHay.includes(normalize(t))).length * 6);
  if (sourceKey === 'daltownmap') score += 12;
  if (sourceKey === 'ktn_csv') score += 8;
  if (qualifiers.some(q => q.key === 'korean')) score += sourceKey === 'daltownmap' || sourceKey === 'ktn_csv' ? 10 : 0;
  if (normTopic && normalize(record.name || record.name_ko || record.name_en).includes(normTopic)) score += 30;
  return score;
}

function searchKtn(topic, city, qualifiers, limit = 35) {
  return KTN_BUSINESSES
    .map((r, index) => ({ ...r, _index: index, _score: localRecordScore(r, topic, city, qualifiers, 'ktn_csv') }))
    .filter(r => r.name && r._score >= (city ? 35 : 22))
    .sort((a, b) => b._score - a._score)
    .slice(0, limit)
    .map(r => ({
      name: r.name,
      aliases: [],
      city: extractRequestedCity(r.address) || city || '',
      specialty: '',
      qualifier_evidence: 'KTN 과거 업소록 파일에 등록된 한인 업소 후보입니다. 현재 영업 여부와 연락처는 별도 검증이 필요합니다.',
      qualifier_evidence_score: 24,
      specialty_score: Math.min(20, Math.round(r._score / 4)),
      evidence_level: 'moderate',
      confidence: Math.min(82, 45 + Math.round(r._score / 2)),
      source_urls: r.website ? [r.website] : [],
      source_titles: ['KTN 과거 업소록'],
      phone: r.phone || '',
      address: r.address || '',
      website: r.website || '',
      local_sources: [LOCAL_SOURCE_META.ktn_csv],
      local_match_score: r._score
    }));
}

function searchDalTownMap(rows, topic, city, qualifiers, limit = 35) {
  return rows
    .filter(r => r.is_active !== false)
    .map(r => ({ ...r, _score: localRecordScore(r, topic, city, qualifiers, 'daltownmap') }))
    .filter(r => (r.name_ko || r.name_en) && r._score >= (city ? 32 : 20))
    .sort((a, b) => b._score - a._score)
    .slice(0, limit)
    .map(r => ({
      name: r.name_ko || r.name_en,
      aliases: uniqueStrings([r.name_en, r.name_ko]).filter(x => x !== (r.name_ko || r.name_en)),
      city: r.area || extractRequestedCity(r.address) || city || '',
      specialty: r.category_ko || '',
      qualifier_evidence: `DalTownMap 자체 DB 등록 업소입니다.${r.languages ? ` 언어: ${r.languages}` : ''}`,
      qualifier_evidence_score: /한국|korean/i.test(`${r.languages || ''} ${r.description || ''}`) ? 36 : 28,
      specialty_score: r.category_ko ? 22 : 10,
      evidence_level: 'strong',
      confidence: 92,
      source_urls: uniqueStrings([r.website, r.google_maps_url]),
      source_titles: ['DalTownMap DB'],
      phone: r.phone || '',
      address: r.address || '',
      website: r.website || '',
      place: r.google_maps_url ? {
        name: r.name_en || r.name_ko || '',
        address: r.address || '', phone: r.phone || '', website: r.website || '',
        google_maps_url: r.google_maps_url || '', rating: r.rating ?? null,
        review_count: r.review_count ?? null, business_status: 'OPERATIONAL'
      } : null,
      local_sources: [LOCAL_SOURCE_META.daltownmap],
      local_match_score: r._score,
      daltownmap_id: r.id
    }));
}

function isSameBusiness(a, b) {
  const ap = normalizePhone(a.phone || a.place?.phone);
  const bp = normalizePhone(b.phone || b.place?.phone);
  if (ap && bp && ap === bp) return true;
  const aw = normalizeWebsite(a.website || a.place?.website);
  const bw = normalizeWebsite(b.website || b.place?.website);
  if (aw && bw && aw === bw && !['google.com', 'maps.google.com'].includes(aw)) return true;
  const aa = normalizeAddress(a.address || a.place?.address);
  const ba = normalizeAddress(b.address || b.place?.address);
  const an = normalize(a.name);
  const bn = normalize(b.name);
  if (aa && ba && (aa === ba || (aa.length > 12 && ba.length > 12 && (aa.includes(ba) || ba.includes(aa))))) return true;
  if (an && bn && (an === bn || an.includes(bn) || bn.includes(an)) && overlapScore(a.address || '', b.address || '') >= 0.35) return true;
  return false;
}
function mergeCandidate(base, incoming) {
  const mergedSources = [...(base.local_sources || []), ...(incoming.local_sources || [])];
  const sourceMap = new Map(mergedSources.map(s => [s.key, s]));
  return {
    ...base,
    name: base.name || incoming.name,
    aliases: uniqueStrings([...(base.aliases || []), ...(incoming.aliases || []), incoming.name]).filter(x => x !== base.name),
    city: base.city || incoming.city,
    specialty: base.specialty || incoming.specialty,
    qualifier_evidence: uniqueStrings([base.qualifier_evidence, incoming.qualifier_evidence]).join(' / '),
    qualifier_evidence_score: Math.max(base.qualifier_evidence_score || 0, incoming.qualifier_evidence_score || 0),
    specialty_score: Math.max(base.specialty_score || 0, incoming.specialty_score || 0),
    evidence_level: ['strong', 'moderate', 'weak', 'none'].indexOf(base.evidence_level) <= ['strong', 'moderate', 'weak', 'none'].indexOf(incoming.evidence_level) ? base.evidence_level : incoming.evidence_level,
    confidence: Math.max(base.confidence || 0, incoming.confidence || 0),
    source_urls: uniqueStrings([...(base.source_urls || []), ...(incoming.source_urls || [])]).slice(0, 8),
    source_titles: uniqueStrings([...(base.source_titles || []), ...(incoming.source_titles || [])]).slice(0, 8),
    phone: base.phone || incoming.phone,
    address: base.address || incoming.address,
    website: base.website || incoming.website,
    place: base.place || incoming.place || null,
    local_sources: [...sourceMap.values()],
    local_match_score: Math.max(base.local_match_score || 0, incoming.local_match_score || 0),
    daltownmap_id: base.daltownmap_id || incoming.daltownmap_id || null
  };
}
function dedupeCandidates(items = []) {
  const out = [];
  for (const item of items) {
    const idx = out.findIndex(x => isSameBusiness(x, item));
    if (idx >= 0) out[idx] = mergeCandidate(out[idx], item);
    else out.push(item);
  }
  return out;
}

async function searchGooglePlaces(query, count = 5) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6500);
  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.rating,places.userRatingCount,places.businessStatus' },
      body: JSON.stringify({ textQuery: query, pageSize: count, languageCode: 'en', regionCode: 'US' })
    });
    const json = await res.json();
    if (!res.ok) return [];
    return (json.places || []).map(p => ({
      id: p.id || '', name: p.displayName?.text || '', address: p.formattedAddress || '',
      phone: p.nationalPhoneNumber || '', website: p.websiteUri || '', google_maps_url: p.googleMapsUri || '',
      rating: p.rating ?? null, review_count: p.userRatingCount ?? null, business_status: p.businessStatus || ''
    }));
  } catch (_) { return []; } finally { clearTimeout(timer); }
}
function nameSimilarity(candidate, place) {
  const names = [candidate.name, ...(candidate.aliases || [])].map(normalize).filter(Boolean);
  const pn = normalize(place.name);
  if (!pn) return 0;
  if (names.some(n => n === pn)) return 100;
  if (names.some(n => pn.includes(n) || n.includes(pn))) return 82;
  return Math.round(Math.max(...names.map(n => overlapScore(n, pn)), 0) * 70);
}
function bestPlace(candidate, places, requestedCity) {
  let best = null;
  let bestScore = -1;
  for (const p of places) {
    let score = nameSimilarity(candidate, p);
    const cp = normalizePhone(candidate.phone);
    const pp = normalizePhone(p.phone);
    if (cp && pp && cp === pp) score += 80;
    const ca = normalizeAddress(candidate.address);
    const pa = normalizeAddress(p.address);
    if (ca && pa && (ca === pa || ca.includes(pa) || pa.includes(ca))) score += 60;
    if (requestedCity && normalize(p.address).includes(normalize(requestedCity))) score += 25;
    if (p.business_status === 'OPERATIONAL') score += 5;
    if (score > bestScore) { best = p; bestScore = score; }
  }
  return bestScore >= 55 ? { ...best, _match_score: bestScore } : null;
}
function cityScore(candidate, place, requestedCity) {
  if (!requestedCity) return 20;
  const requested = normalize(requestedCity);
  const placeAddress = normalize(place?.address || candidate.address || '');
  const candidateCity = normalize(candidate.city || '');
  if (placeAddress.includes(requested)) return 25;
  if (candidateCity === requested || candidateCity.includes(requested) || requested.includes(candidateCity)) return 20;
  return 0;
}
function computeScore(candidate, place, requestedCity, qualifiers) {
  const evidence = clamp(candidate.qualifier_evidence_score, 0, 40);
  const specialty = clamp(candidate.specialty_score, 0, 25);
  const locality = cityScore(candidate, place, requestedCity);
  const placeScore = place ? 10 : 0;
  const researchConfidence = clamp(candidate.confidence, 0, 100) * 0.1;
  const sourceBonus = Math.min(25, (candidate.local_sources || []).reduce((s, x) => s + (x.weight || 0), 0));
  let total = Math.round(evidence + specialty + locality + placeScore + researchConfidence + sourceBonus);
  if (qualifiers.some(q => q.key === 'korean') && evidence < 10) total -= 18;
  if (qualifiers.some(q => q.key !== 'korean' && q.key !== 'female') && specialty < 8) total -= 12;
  if (requestedCity && locality === 0) total -= 18;
  return clamp(total, 0, 100);
}

const schema = {
  type: 'object', additionalProperties: false,
  properties: {
    interpreted_request: { type: 'string' },
    queries_used: { type: 'array', items: { type: 'string' } },
    candidates: { type: 'array', items: { type: 'object', additionalProperties: false,
      properties: {
        name: { type: 'string' }, aliases: { type: 'array', items: { type: 'string' } }, city: { type: 'string' },
        specialty: { type: 'string' }, qualifier_evidence: { type: 'string' }, qualifier_evidence_score: { type: 'integer' },
        specialty_score: { type: 'integer' }, evidence_level: { type: 'string', enum: ['strong', 'moderate', 'weak', 'none'] },
        confidence: { type: 'integer' }, source_urls: { type: 'array', items: { type: 'string' } }, source_titles: { type: 'array', items: { type: 'string' } }
      },
      required: ['name','aliases','city','specialty','qualifier_evidence','qualifier_evidence_score','specialty_score','evidence_level','confidence','source_urls','source_titles']
    }}
  }, required: ['interpreted_request','queries_used','candidates']
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

    const [dbRows, webResponse] = await Promise.all([
      fetchDalTownMapBusinesses(),
      callResponses({
        model,
        tools: [{ type: 'web_search', search_context_size: 'medium' }], tool_choice: 'auto',
        input: [
          { role: 'system', content: [{ type: 'input_text', text: '당신은 달라스 한인 지역정보 조사 편집자입니다. 이번 검색에서는 달사람 온라인 업소록을 핵심 외부 자료로 사용하고, 공식 홈페이지와 Google 정보로 최신성을 교차 검증하세요. 주간포커스와 중앙일보 업소록은 검색하지 마세요.' }] },
          { role: 'user', content: [{ type: 'input_text', text: `요청: ${topic}\n분야: ${category || '원문 기준'}\n요청 도시: ${city || '원문에서 판단'}\n필수 조건: ${qualifierLabels.join(', ') || '없음'}\n추가 지시: ${instructions || '없음'}\n사용자 참고 URL:\n${sources.join('\n') || '없음'}\n\n반드시 달사람 업소록 ${DALSARAM_DIRECTORY_URL} 및 site:dalsaram.com/shop 검색을 한국어와 영어로 각각 수행하세요. 달사람 결과는 한인 커뮤니티 관련성 근거로 사용하고 주소·전화·영업 상태는 공식 사이트 또는 Google 정보로 검증하세요. 같은 업소의 표기 차이는 aliases로 합치세요. 최대 10개 후보, 실제 근거 URL만 반환하세요.` }] }
        ],
        text: { format: { type: 'json_schema', name: 'guide_search_results_v16', strict: true, schema } }
      })
    ]);

    const text = outputText(webResponse);
    if (!text) throw new Error('달사람 웹 검색 결과가 비어 있습니다.');
    const research = JSON.parse(text);
    const webCandidates = (research.candidates || []).filter(c => c.name).map(c => ({
      ...c,
      source_urls: uniqueStrings(c.source_urls).slice(0, 6),
      source_titles: uniqueStrings(c.source_titles).slice(0, 6),
      local_sources: (c.source_urls || []).some(u => String(u).includes('dalsaram.com')) ? [LOCAL_SOURCE_META.dalsaram] : [],
      phone: '', address: '', website: '', local_match_score: 0
    }));

    const dbCandidates = searchDalTownMap(dbRows, topic, city, qualifiers);
    const ktnCandidates = searchKtn(topic, city, qualifiers);
    let merged = dedupeCandidates([...dbCandidates, ...ktnCandidates, ...webCandidates]);
    merged = merged.sort((a,b) => (b.local_match_score || 0) - (a.local_match_score || 0)).slice(0, 18);

    const placeGroups = await Promise.all(merged.map(c => {
      if (c.place) return Promise.resolve([c.place]);
      const specialty = c.specialty || qualifierLabels.filter(x => x !== '한인·한국어').join(' ');
      return searchGooglePlaces(`${c.name} ${specialty} ${city || c.city || 'Texas'}`, 5);
    }));

    const ranked = merged.map((c, i) => {
      const place = c.place || bestPlace(c, placeGroups[i] || [], city);
      const finalScore = computeScore(c, place, city, qualifiers);
      const evidenceScore = clamp(c.qualifier_evidence_score, 0, 40);
      const koreanRequested = qualifiers.some(q => q.key === 'korean');
      const evidenceStatus = !koreanRequested ? 'not_required' : evidenceScore >= 25 ? 'confirmed' : evidenceScore >= 12 ? 'probable' : 'unconfirmed';
      return {
        ...c,
        place_verified: Boolean(place), place: place || null, final_score: finalScore,
        community_source_bonus: Math.min(25, (c.local_sources || []).reduce((s,x)=>s+(x.weight||0),0)),
        community_sources: c.local_sources || [], evidence_status: evidenceStatus,
        city_match: cityScore(c, place, city) > 0,
        cross_source_count: (c.local_sources || []).length,
        source_origin: (c.local_sources || []).map(s => s.key)
      };
    }).filter(c => c.final_score >= 22).sort((a,b) => b.final_score - a.final_score);

    const exactCity = ranked.filter(c => c.city_match);
    const candidates = (exactCity.length >= 3 ? exactCity : ranked).slice(0, 8);
    return { statusCode: 200, headers, body: JSON.stringify({
      topic, requested_city: city, hard_qualifiers: qualifiers.map(q => q.key),
      interpreted_request: research.interpreted_request,
      queries_used: uniqueStrings([...(research.queries_used || []), 'DalTownMap DB 내부 검색', 'KTN CSV 내부 검색', `달사람 업소록 ${DALSARAM_DIRECTORY_URL}`]),
      source_stats: { daltownmap_db_rows: dbRows.length, ktn_csv_rows: KTN_BUSINESSES.length, merged_candidates: merged.length },
      candidates,
      message: candidates.length
        ? `${candidates.length}개의 후보를 찾았습니다. DalTownMap DB, KTN 업소록 파일, 달사람 온라인 업소록을 교차 검색하고 중복을 합쳤습니다.`
        : '교차 검색 결과 조건에 맞는 후보를 찾지 못했습니다.'
    })};
  } catch (error) {
    console.error('search-guide error', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message || '검색 오류' }) };
  }
};
