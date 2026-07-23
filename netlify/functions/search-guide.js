const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function outputText(json) {
  return json.output_text || json.output?.flatMap(x => x.content || []).find(x => x.type === 'output_text')?.text || '';
}
function normalize(v='') { return String(v).toLowerCase().replace(/[^a-z0-9가-힣]/g, ''); }
function extractRequestedCity(topic='') {
  const pairs = [['캐롤튼','Carrollton'],['캐롤톤','Carrollton'],['플레이노','Plano'],['프리스코','Frisco'],['리차드슨','Richardson'],['리처드슨','Richardson'],['달라스','Dallas'],['알렌','Allen'],['루이스빌','Lewisville'],['코펠','Coppell'],['포트워스','Fort Worth'],['리틀엘름','Little Elm']];
  const t=String(topic).toLowerCase();
  for (const [ko,en] of pairs) if (t.includes(ko.toLowerCase()) || t.includes(en.toLowerCase())) return en;
  return '';
}
function extractHardQualifiers(topic='') {
  const rules=[
    {key:'korean',re:/(한인|한국인|한국어|한글|korean(?:[- ]?speaking)?)/i,label:'한인·한국어'},
    {key:'internal_medicine',re:/(내과|internal medicine)/i,label:'내과'},
    {key:'family_medicine',re:/(가정의학|family medicine)/i,label:'가정의학'},
    {key:'pediatric',re:/(소아과|소아청소년과|pediatric)/i,label:'소아과'},
    {key:'dental',re:/(치과|dentist|dental)/i,label:'치과'},
    {key:'female',re:/(여의사|여성 의사|female doctor|woman doctor)/i,label:'여의사'}
  ];
  return rules.filter(r=>r.re.test(String(topic)));
}
async function callResponses(payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch('https://api.openai.com/v1/responses', {
      method:'POST', signal:controller.signal,
      headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify(payload)
    });
    const json=await res.json();
    if(!res.ok) throw new Error(json?.error?.message || `OpenAI 오류 ${res.status}`);
    return json;
  } catch(e) {
    if(e.name==='AbortError') throw new Error('웹 검색이 제한 시간 안에 끝나지 않았습니다. 잠시 후 다시 검색해 주세요.');
    throw e;
  } finally { clearTimeout(timer); }
}
async function searchGooglePlaces(query,count=5) {
  const key=process.env.GOOGLE_MAPS_API_KEY;
  if(!key) return [];
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),7000);
  try {
    const res=await fetch('https://places.googleapis.com/v1/places:searchText',{
      method:'POST',signal:controller.signal,
      headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.rating,places.userRatingCount,places.businessStatus'},
      body:JSON.stringify({textQuery:query,pageSize:count,languageCode:'en',regionCode:'US'})
    });
    const json=await res.json();
    if(!res.ok) return [];
    return (json.places||[]).map(p=>({id:p.id||'',name:p.displayName?.text||'',address:p.formattedAddress||'',phone:p.nationalPhoneNumber||'',website:p.websiteUri||'',google_maps_url:p.googleMapsUri||'',rating:p.rating??null,review_count:p.userRatingCount??null,business_status:p.businessStatus||''}));
  } catch (_) { return []; }
  finally { clearTimeout(timer); }
}
function nameSimilarity(candidate, place) {
  const names=[candidate.name,...(candidate.aliases||[])].map(normalize).filter(Boolean);
  const pn=normalize(place.name);
  if(!pn) return 0;
  if(names.some(n=>n===pn)) return 100;
  if(names.some(n=>pn.includes(n)||n.includes(pn))) return 80;
  const tokens=names.flatMap(n=>n.match(/[a-z0-9가-힣]{3,}/g)||[]);
  const hits=tokens.filter(t=>pn.includes(t)).length;
  return tokens.length ? Math.round((hits/tokens.length)*60) : 0;
}
function bestPlace(candidate, places, city) {
  let best=null, bestScore=-1;
  for(const p of places){
    let score=nameSimilarity(candidate,p);
    if(city && normalize(p.address).includes(normalize(city))) score+=35;
    if(p.business_status==='OPERATIONAL') score+=5;
    if(score>bestScore){best=p;bestScore=score;}
  }
  return bestScore>=55 ? {...best,_match_score:bestScore} : null;
}
function computeScore(c, place, city, qualifiers) {
  const ai=Math.max(0,Math.min(100,Number(c.confidence)||0));
  const evidence=Math.max(0,Math.min(40,Number(c.qualifier_evidence_score)||0));
  const specialty=Math.max(0,Math.min(25,Number(c.specialty_score)||0));
  const locality=place && (!city || normalize(place.address).includes(normalize(city))) ? 25 : (c.city && (!city || normalize(c.city).includes(normalize(city))) ? 15 : 0);
  const placeScore=place ? 10 : 0;
  let total=Math.round(evidence+specialty+locality+placeScore+(ai*0.15));
  if(qualifiers.some(q=>q.key==='korean') && evidence===0) total-=25;
  return Math.max(0,Math.min(100,total));
}

const schema={type:'object',additionalProperties:false,properties:{
  interpreted_request:{type:'string'},
  queries_used:{type:'array',items:{type:'string'}},
  candidates:{type:'array',items:{type:'object',additionalProperties:false,properties:{
    name:{type:'string'},aliases:{type:'array',items:{type:'string'}},city:{type:'string'},specialty:{type:'string'},
    qualifier_evidence:{type:'string'},qualifier_evidence_score:{type:'integer'},specialty_score:{type:'integer'},
    evidence_level:{type:'string',enum:['strong','moderate','weak','none']},confidence:{type:'integer'},
    source_urls:{type:'array',items:{type:'string'}},source_titles:{type:'array',items:{type:'string'}}
  },required:['name','aliases','city','specialty','qualifier_evidence','qualifier_evidence_score','specialty_score','evidence_level','confidence','source_urls','source_titles']}}
},required:['interpreted_request','queries_used','candidates']};

exports.handler=async(event)=>{
  if(event.httpMethod==='OPTIONS') return {statusCode:204,headers,body:''};
  if(event.httpMethod!=='POST') return {statusCode:405,headers,body:JSON.stringify({error:'POST only'})};
  try {
    if(!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY가 필요합니다.');
    const body=JSON.parse(event.body||'{}');
    const topic=String(body.topic||'').trim();
    const sources=Array.isArray(body.sources)?body.sources.map(String).filter(Boolean):[];
    if(!topic) return {statusCode:400,headers,body:JSON.stringify({error:'검색 주제를 입력하세요.'})};
    const city=extractRequestedCity(topic);
    const qualifiers=extractHardQualifiers(topic);
    const qualifierLabels=qualifiers.map(q=>q.label);
    const model=process.env.OPENAI_SEARCH_MODEL||process.env.OPENAI_MODEL||'gpt-4.1-mini';
    const response=await callResponses({
      model,
      tools:[{type:'web_search',search_context_size:'medium'}],
      tool_choice:'auto',
      input:[
        {role:'system',content:[{type:'input_text',text:'당신은 달라스 한인 지역정보 조사 편집자입니다. 공식 홈페이지만 고집하지 않고, 공식 사이트·의료진 프로필·한인 업소록·지역 언론·신뢰할 수 있는 디렉터리의 증거를 합쳐 후보를 평가합니다. 한국계 이름만 보고 한인이라고 추정해서는 안 됩니다.'}]},
        {role:'user',content:[{type:'input_text',text:`요청: ${topic}\n요청 도시: ${city||'원문에서 판단'}\n중요 조건: ${qualifierLabels.join(', ')||'없음'}\n사용자 참고 URL: ${sources.join('\n')||'없음'}\n\n검색 지침:\n1) 원문 한국어, 영어 번역, 동의어, 업소록형 검색을 포함해 6~10개의 검색어를 실제로 사용하세요. 특히 '한인'을 Korean, Korean-speaking, 한국어 진료, 한인 의사, Korean directory 등으로 반드시 유지하세요.\n2) 후보를 0개로 만들기 전에 약한 근거 후보도 반환하세요. 단, 근거 강도를 strong/moderate/weak/none으로 명확히 구분하세요.\n3) 한인·한국어 근거 점수(0~40): 공식 프로필/홈페이지 명시 35~40, 신뢰 가능한 지역 언론·한인 업소록의 직접 소개 25~34, 복수 디렉터리의 일관된 표시 15~24, 이름이나 추정뿐이면 0.\n4) 전문분야 점수(0~25): 내과·가정의학 등 요청 분야가 공식 자료에 명확하면 20~25, 관련성만 있으면 10~19, 불명확하면 0~9.\n5) 요청 도시를 우선하되 인접 도시 후보를 섞지 마세요. 도시가 불확실하면 city에 실제 확인된 도시를 쓰세요.\n6) 각 후보에 실제 근거 URL을 넣고, 근거 문장에는 무엇이 확인됐고 무엇은 추가 확인이 필요한지 써 주세요.\n7) 광고성 목록 한 곳만으로 strong 판정을 하지 마세요.\n8) 후보는 최대 8개만 반환하세요.`}]}
      ],
      text:{format:{type:'json_schema',name:'guide_search_results_v13',strict:true,schema}}
    });
    const text=outputText(response);
    if(!text) throw new Error('웹 검색 결과가 비어 있습니다.');
    const research=JSON.parse(text);
    let raw=(research.candidates||[]).filter(c=>c.name && (c.source_urls||[]).length);
    if(city) raw=raw.filter(c=>!c.city || normalize(c.city).includes(normalize(city)) || normalize(city).includes(normalize(c.city)));

    const placeGroups=await Promise.all(raw.slice(0,8).map(c=>searchGooglePlaces(`${c.name} ${city||c.city||'Texas'}`,5)));
    const ranked=raw.slice(0,8).map((c,i)=>{
      const place=bestPlace(c,placeGroups[i]||[],city);
      const score=computeScore(c,place,city,qualifiers);
      const koreanRequested=qualifiers.some(q=>q.key==='korean');
      const evidenceStatus = !koreanRequested ? 'not_required' : Number(c.qualifier_evidence_score)>=25 ? 'confirmed' : Number(c.qualifier_evidence_score)>=15 ? 'probable' : 'unconfirmed';
      return {...c,place_verified:!!place,place:place||null,final_score:score,evidence_status:evidenceStatus};
    }).filter(c=>c.final_score>=35).sort((a,b)=>b.final_score-a.final_score);

    // 장소 검증 실패만으로 후보를 전부 없애지 않는다. Places는 연락처 검증용이지 한인 여부 판정용이 아니다.
    const candidates=ranked.slice(0,6);
    const confirmedCount=candidates.filter(c=>c.evidence_status==='confirmed').length;
    return {statusCode:200,headers,body:JSON.stringify({
      topic,requested_city:city,hard_qualifiers:qualifiers.map(q=>q.key),interpreted_request:research.interpreted_request,
      queries_used:research.queries_used,candidates,
      message:candidates.length?`${candidates.length}개의 후보를 점수순으로 찾았습니다. 강한 근거 ${confirmedCount}개입니다.`:'관련 후보를 찾지 못했습니다. 참고 URL이나 업소명을 추가해 다시 검색해 주세요.'
    })};
  } catch(error) {
    console.error('search-guide error',error);
    return {statusCode:500,headers,body:JSON.stringify({error:error.message||'검색 오류'})};
  }
};
