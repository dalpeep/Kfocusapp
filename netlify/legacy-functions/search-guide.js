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



function classifyRequest(topic = '', category = '') {
  const t = String(topic).toLowerCase();
  const businessWords = /(추천|찾아|어디|업소|가게|식당|병원|내과|치과|소아과|한의원|약국|변호사|회계사|보험사|부동산|미용실|정비소|업체|회사|restaurant|clinic|doctor|dentist|attorney|lawyer|realtor|accountant|near me)/i;
  const infoWords = /(방법|절차|신청|갱신|등록|자격|조건|준비물|서류|비용|기간|규정|법|정책|혜택|발급|예약 방법|어떻게|무엇을|언제|학교 등록|운전면허|차량 등록|세금|메디케어|메디케이드|aca|비자|여권|이민|시민권|유틸리티|쓰레기 수거|공식|deadline|requirements|apply|renew|registration|eligibility|rules|law|policy)/i;
  const hasBusiness = businessWords.test(t);
  const hasInfo = infoWords.test(t);
  if (hasBusiness && hasInfo) return 'mixed';
  if (hasBusiness) return 'business';
  if (hasInfo) return 'information';
  // 카테고리가 생활정보 성격이면 기본적으로 정보형으로 처리하되, 구체 업종명이 있으면 업소형
  if (['driving','education','housing','immigration'].includes(category)) return 'information';
  return 'business';
}

function officialDomainHints(category = '', topic = '') {
  const map = {
    driving: ['txdmv.gov', 'dps.texas.gov', 'texas.gov', 'ntta.org'],
    health: ['medicare.gov', 'medicaid.gov', 'healthcare.gov', 'hhs.texas.gov', 'cdc.gov', 'nih.gov'],
    education: ['tea.texas.gov', 'pisd.edu', 'friscoisd.org', 'cfbisd.edu', 'dallasisd.org', 'ed.gov'],
    business: ['irs.gov', 'comptroller.texas.gov', 'sos.state.tx.us', 'sba.gov', 'twc.texas.gov'],
    housing: ['plano.gov', 'cityofcarrollton.com', 'dallascityhall.com', 'collincountytx.gov', 'dentoncounty.gov', 'puc.texas.gov'],
    immigration: ['uscis.gov', 'travel.state.gov', 'kr.usembassy.gov', 'overseas.mofa.go.kr']
  };
  const hints = [...(map[category] || [])];
  const t = String(topic).toLowerCase();
  if (/plano isd|플레이노.*학교/.test(t)) hints.unshift('pisd.edu');
  if (/carrollton|캐롤/.test(t)) hints.unshift('cityofcarrollton.com');
  if (/collin county|콜린/.test(t)) hints.unshift('collincountytx.gov');
  if (/denton county|덴튼/.test(t)) hints.unshift('dentoncounty.gov');
  return uniqueStrings(hints);
}

const infoSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    interpreted_request: { type: 'string' },
    queries_used: { type: 'array', items: { type: 'string' } },
    candidates: { type: 'array', items: { type: 'object', additionalProperties: false,
      properties: {
        name: { type: 'string' },
        city: { type: 'string' },
        specialty: { type: 'string' },
        qualifier_evidence: { type: 'string' },
        confidence: { type: 'integer' },
        source_urls: { type: 'array', items: { type: 'string' } },
        source_titles: { type: 'array', items: { type: 'string' } },
        published_or_updated: { type: 'string' },
        official_source: { type: 'boolean' }
      },
      required: ['name','city','specialty','qualifier_evidence','confidence','source_urls','source_titles','published_or_updated','official_source']
    }}
  }, required: ['interpreted_request','queries_used','candidates']
};

async function searchInformation(topic, category, instructions, sources, model) {
  const domains = officialDomainHints(category, topic);
  const response = await callResponses({
    model,
    tools: [{ type: 'web_search', search_context_size: 'high' }], tool_choice: 'auto',
    input: [
      { role: 'system', content: [{ type: 'input_text', text: '당신은 달라스·텍사스 한인 생활정보 사실 검증 편집자입니다. 정부기관, 시·카운티, 교육청, 공공기관 및 공식 전문기관을 최우선으로 검색하세요. 최신 날짜와 관할 지역을 확인하고, 커뮤니티 글이나 광고성 페이지는 공식 근거를 보조할 때만 사용하세요.' }] },
      { role: 'user', content: [{ type: 'input_text', text: `생활정보 요청: ${topic}\n분야: ${category || '원문 기준'}\n추가 지시: ${instructions || '없음'}\n사용자 참고 URL:\n${sources.join('\n') || '없음'}\n공식 도메인 우선 후보: ${domains.join(', ') || '미지정'}\n\n검색 규칙:\n- 현재 시행 중인 정보인지 확인하고 가능한 경우 공식 페이지의 갱신일을 확인하세요.\n- 연방/텍사스/카운티/시/교육청 등 관할이 다르면 구분하세요.\n- 신청 방법, 자격, 준비 서류, 비용, 처리 기간, 공식 연락처 중 실제 확인된 것만 근거 요약에 포함하세요.\n- 같은 내용을 반복하는 페이지는 합치고, 핵심 공식 출처를 최대 8개 반환하세요.\n- name은 기관명 또는 공식 페이지 제목으로 작성하세요.\n- source_urls에는 실제로 확인한 URL만 넣으세요.` }] }
    ],
    text: { format: { type: 'json_schema', name: 'daltown_information_search_v18', strict: true, schema: infoSchema } }
  });
  const text = outputText(response);
  if (!text) throw new Error('생활정보 웹 검색 결과가 비어 있습니다.');
  const research = JSON.parse(text);
  const candidates = (research.candidates || []).filter(c => c.name && c.source_urls?.length).map((c, i) => ({
    ...c,
    candidate_kind: 'information',
    aliases: [],
    qualifier_evidence_score: c.official_source ? 40 : 24,
    specialty_score: 20,
    evidence_level: c.official_source ? 'strong' : 'moderate',
    final_score: clamp((c.confidence || 60) + (c.official_source ? 10 : 0), 0, 100),
    evidence_status: c.official_source ? 'confirmed' : 'probable',
    place_verified: false,
    place: null,
    community_sources: [],
    community_source_bonus: 0,
    source_urls: uniqueStrings(c.source_urls).slice(0, 5),
    source_titles: uniqueStrings(c.source_titles).slice(0, 5),
    phone: '', address: '', website: c.source_urls?.[0] || '',
    info_order: i + 1
  })).sort((a,b) => b.final_score - a.final_score).slice(0, 8);
  return { research, candidates, domains };
}

async function searchBusinesses(topic, category, instructions, sources, model) {
  const city = extractRequestedCity(topic);
  const qualifiers = extractHardQualifiers(topic);
  const qualifierLabels = qualifiers.map(q => q.label);
  const [dbRows, webResponse] = await Promise.all([
    fetchDalTownMapBusinesses(),
    callResponses({
      model,
      tools: [{ type: 'web_search', search_context_size: 'medium' }], tool_choice: 'auto',
      input: [
        { role: 'system', content: [{ type: 'input_text', text: '당신은 달라스 한인 지역정보 조사 편집자입니다. 달사람 온라인 업소록을 핵심 외부 자료로 사용하고, 공식 홈페이지와 Google 정보로 최신성을 교차 검증하세요. 주간포커스와 중앙일보 업소록은 검색하지 마세요.' }] },
        { role: 'user', content: [{ type: 'input_text', text: `요청: ${topic}\n분야: ${category || '원문 기준'}\n요청 도시: ${city || '원문에서 판단'}\n필수 조건: ${qualifierLabels.join(', ') || '없음'}\n추가 지시: ${instructions || '없음'}\n사용자 참고 URL:\n${sources.join('\n') || '없음'}\n\n반드시 달사람 업소록 ${DALSARAM_DIRECTORY_URL} 및 site:dalsaram.com/shop 검색을 한국어와 영어로 각각 수행하세요. 달사람 결과는 한인 커뮤니티 관련성 근거로 사용하고 주소·전화·영업 상태는 공식 사이트 또는 Google 정보로 검증하세요. 같은 업소의 표기 차이는 aliases로 합치세요. 최대 10개 후보, 실제 근거 URL만 반환하세요.` }] }
      ],
      text: { format: { type: 'json_schema', name: 'guide_search_results_v18_business', strict: true, schema } }
    })
  ]);
  const text = outputText(webResponse);
  if (!text) throw new Error('달사람 웹 검색 결과가 비어 있습니다.');
  const research = JSON.parse(text);
  const webCandidates = (research.candidates || []).filter(c => c.name).map(c => ({
    ...c, candidate_kind: 'business',
    source_urls: uniqueStrings(c.source_urls).slice(0, 6), source_titles: uniqueStrings(c.source_titles).slice(0, 6),
    local_sources: (c.source_urls || []).some(u => String(u).includes('dalsaram.com')) ? [LOCAL_SOURCE_META.dalsaram] : [],
    phone: '', address: '', website: '', local_match_score: 0
  }));
  const dbCandidates = searchDalTownMap(dbRows, topic, city, qualifiers).map(c => ({...c, candidate_kind:'business'}));
  const ktnCandidates = searchKtn(topic, city, qualifiers).map(c => ({...c, candidate_kind:'business'}));
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
    return {...c, candidate_kind:'business', place_verified:Boolean(place), place:place||null, final_score:finalScore,
      community_source_bonus:Math.min(25,(c.local_sources||[]).reduce((s,x)=>s+(x.weight||0),0)), community_sources:c.local_sources||[],
      evidence_status:evidenceStatus, city_match:cityScore(c,place,city)>0, cross_source_count:(c.local_sources||[]).length,
      source_origin:(c.local_sources||[]).map(s=>s.key)};
  }).filter(c => c.final_score >= 22).sort((a,b)=>b.final_score-a.final_score);
  const exactCity = ranked.filter(c => c.city_match);
  const candidates = (exactCity.length >= 3 ? exactCity : ranked).slice(0,8);
  return { research, candidates, city, qualifiers, dbRowsCount:dbRows.length, mergedCount:merged.length };
}

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
    const model = process.env.OPENAI_SEARCH_MODEL || process.env.OPENAI_MODEL || 'gpt-4.1-mini';
    const searchType = classifyRequest(topic, category);

    if (searchType === 'information') {
      const info = await searchInformation(topic, category, instructions, sources, model);
      return { statusCode: 200, headers, body: JSON.stringify({
        topic, search_type:'information', search_type_label:'생활정보', requested_city:extractRequestedCity(topic), hard_qualifiers:[],
        interpreted_request:info.research.interpreted_request,
        queries_used:uniqueStrings([...(info.research.queries_used||[]), ...info.domains.map(d=>`공식 출처: ${d}`)]),
        source_stats:{ official_sources:info.candidates.filter(c=>c.official_source).length, information_sources:info.candidates.length },
        candidates:info.candidates,
        message:info.candidates.length ? `${info.candidates.length}개의 생활정보 공식 근거를 찾았습니다.` : '공식 생활정보 근거를 찾지 못했습니다.'
      })};
    }

    if (searchType === 'mixed') {
      const [biz, info] = await Promise.all([
        searchBusinesses(topic, category, instructions, sources, model),
        searchInformation(topic, category, instructions, sources, model)
      ]);
      const candidates = [...info.candidates.slice(0,4), ...biz.candidates.slice(0,6)].slice(0,10);
      return { statusCode:200, headers, body:JSON.stringify({
        topic, search_type:'mixed', search_type_label:'생활정보 + 업소', requested_city:biz.city, hard_qualifiers:biz.qualifiers.map(q=>q.key),
        interpreted_request:`${info.research.interpreted_request} / ${biz.research.interpreted_request}`,
        queries_used:uniqueStrings([...(info.research.queries_used||[]), ...(biz.research.queries_used||[]), 'DalTownMap DB 내부 검색','KTN CSV 내부 검색',`달사람 업소록 ${DALSARAM_DIRECTORY_URL}`]),
        source_stats:{daltownmap_db_rows:biz.dbRowsCount,ktn_csv_rows:KTN_BUSINESSES.length,business_candidates:biz.candidates.length,information_sources:info.candidates.length},
        candidates,
        message:`생활정보 근거 ${info.candidates.length}개와 업소 후보 ${biz.candidates.length}개를 함께 찾았습니다.`
      })};
    }

    const biz = await searchBusinesses(topic, category, instructions, sources, model);
    return { statusCode:200, headers, body:JSON.stringify({
      topic, search_type:'business', search_type_label:'업소', requested_city:biz.city, hard_qualifiers:biz.qualifiers.map(q=>q.key),
      interpreted_request:biz.research.interpreted_request,
      queries_used:uniqueStrings([...(biz.research.queries_used||[]),'DalTownMap DB 내부 검색','KTN CSV 내부 검색',`달사람 업소록 ${DALSARAM_DIRECTORY_URL}`]),
      source_stats:{daltownmap_db_rows:biz.dbRowsCount,ktn_csv_rows:KTN_BUSINESSES.length,merged_candidates:biz.mergedCount},
      candidates:biz.candidates,
      message:biz.candidates.length ? `${biz.candidates.length}개의 업소 후보를 찾았습니다. 자체 DB, KTN 파일, 달사람을 교차 검색했습니다.` : '조건에 맞는 업소 후보를 찾지 못했습니다.'
    })};
  } catch (error) {
    console.error('search-guide v18 error', error);
    return { statusCode:500, headers, body:JSON.stringify({error:error.message||'검색 오류'}) };
  }
};
