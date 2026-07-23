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
  const timer = setTimeout(() => controller.abort(), 24000);
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
    if(e.name==='AbortError') throw new Error('웹 검색이 24초 안에 끝나지 않았습니다. 검색어를 더 구체적으로 입력해 주세요.');
    throw e;
  } finally { clearTimeout(timer); }
}
async function searchGooglePlaces(query,count=3) {
  const key=process.env.GOOGLE_MAPS_API_KEY;
  if(!key) return [];
  const res=await fetch('https://places.googleapis.com/v1/places:searchText',{
    method:'POST',
    headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.rating,places.userRatingCount,places.businessStatus'},
    body:JSON.stringify({textQuery:query,pageSize:count,languageCode:'en',regionCode:'US'})
  });
  const json=await res.json();
  if(!res.ok) return [];
  return (json.places||[]).map(p=>({id:p.id||'',name:p.displayName?.text||'',address:p.formattedAddress||'',phone:p.nationalPhoneNumber||'',website:p.websiteUri||'',google_maps_url:p.googleMapsUri||'',rating:p.rating??null,review_count:p.userRatingCount??null,business_status:p.businessStatus||''}));
}
function bestPlace(candidate, places, city) {
  const cn=normalize(candidate.name);
  return places.find(p=>{
    const pn=normalize(p.name);
    const nameOk = pn && cn && (pn.includes(cn)||cn.includes(pn)||(candidate.aliases||[]).some(a=>pn.includes(normalize(a))));
    const cityOk = !city || normalize(p.address).includes(normalize(city));
    return nameOk && cityOk;
  }) || null;
}
const schema={type:'object',additionalProperties:false,properties:{
  interpreted_request:{type:'string'},
  queries_used:{type:'array',items:{type:'string'}},
  candidates:{type:'array',items:{type:'object',additionalProperties:false,properties:{
    name:{type:'string'},aliases:{type:'array',items:{type:'string'}},city:{type:'string'},specialty:{type:'string'},
    qualifier_evidence:{type:'string'},qualifier_confirmed:{type:'boolean'},confidence:{type:'integer'},
    source_urls:{type:'array',items:{type:'string'}},source_titles:{type:'array',items:{type:'string'}}
  },required:['name','aliases','city','specialty','qualifier_evidence','qualifier_confirmed','confidence','source_urls','source_titles']}}
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
        {role:'system',content:[{type:'input_text',text:'당신은 달라스 한인 지역정보 검색 편집자입니다. 사용자의 지역, 언어/민족, 전문분야 조건을 절대 약화하거나 삭제하지 않습니다. 실제 웹 검색 근거가 있는 후보만 구조화해 반환합니다.'}]},
        {role:'user',content:[{type:'input_text',text:`요청: ${topic}\n고정 도시: ${city||'원문에서 판단'}\n필수 조건: ${qualifierLabels.join(', ')||'없음'}\n참고 URL: ${sources.join('\n')||'없음'}\n\n검색 지침:\n1) 원문 그대로의 한국어 검색, 영어 번역 검색, 동의어 검색을 합쳐 6~10개 검색어를 실제로 사용하세요.\n2) '한인/한국어'가 있으면 Korean, Korean-speaking, 한국어 진료, 한인 의사 등의 명시적 근거가 있는 후보만 qualifier_confirmed=true로 표시하세요. 이름만 한국계처럼 보여서 추정하지 마세요.\n3) 요청 도시 밖 일반 업소를 대체하지 마세요.\n4) 후보마다 근거 URL을 최소 1개 포함하세요.\n5) 광고성 목록만으로 단정하지 말고 공식 소개, 의료진 프로필, 신뢰할 수 있는 지역 디렉터리를 교차 확인하세요.\n6) 결과가 적으면 억지로 채우지 말고 정확한 후보만 반환하세요.`}]}
      ],
      text:{format:{type:'json_schema',name:'guide_search_results_v12',strict:true,schema}}
    });
    const text=outputText(response);
    if(!text) throw new Error('웹 검색 결과가 비어 있습니다.');
    const research=JSON.parse(text);
    let candidates=(research.candidates||[]).filter(c=>c.name&&c.qualifier_confirmed!==false&&Number(c.confidence)>=45);
    if(city) candidates=candidates.filter(c=>!c.city||normalize(c.city).includes(normalize(city))||normalize(city).includes(normalize(c.city)));

    const placeGroups=await Promise.all(candidates.slice(0,8).map(c=>searchGooglePlaces(`${c.name} ${city||c.city||'Texas'}`,3).catch(()=>[])));
    const verified=candidates.map((c,i)=>{
      const place=bestPlace(c,placeGroups[i]||[],city);
      return {...c,place_verified:!!place,place:place||null};
    }).filter(c=>c.place_verified || !process.env.GOOGLE_MAPS_API_KEY);

    return {statusCode:200,headers,body:JSON.stringify({
      topic,requested_city:city,hard_qualifiers:qualifiers.map(q=>q.key),interpreted_request:research.interpreted_request,
      queries_used:research.queries_used,candidates:verified,
      message:verified.length?`${verified.length}개의 검증 후보를 찾았습니다.`:'필수 조건과 지역을 함께 충족하는 검증 후보를 찾지 못했습니다.'
    })};
  } catch(error) {
    console.error('search-guide error',error);
    return {statusCode:500,headers,body:JSON.stringify({error:error.message||'검색 오류'})};
  }
};
