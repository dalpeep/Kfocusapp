function centralDate(value=new Date()){
  return new Intl.DateTimeFormat('en-CA',{
    timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'
  }).format(value);
}
function textFromResponse(json){
  return json?.output_text || json?.output?.flatMap(x=>x.content||[]).find(x=>x.type==='output_text')?.text || '';
}
function parseJsonText(text=''){
  const clean=String(text).replace(/^```json\s*/i,'').replace(/```$/,'').trim();
  try{return JSON.parse(clean);}catch(_){
    const a=clean.indexOf('{'),b=clean.lastIndexOf('}');
    if(a>=0&&b>a)return JSON.parse(clean.slice(a,b+1));
    throw new Error('Daily Core AI 결과를 JSON으로 해석하지 못했습니다.');
  }
}
function env(){
  const base=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
  const key=String(process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_KEY||'').trim();
  if(!base||!key)throw new Error('SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다.');
  return {base,key};
}
async function sb(path,opt={}){
  const {base,key}=env();
  const res=await fetch(`${base}/rest/v1/${path}`,{
    ...opt,
    headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Accept:'application/json',...(opt.headers||{})}
  });
  const raw=await res.text();
  let data=null;
  try{data=raw?JSON.parse(raw):null;}catch{data=raw;}
  if(!res.ok)throw new Error(data?.message||data?.error||raw||`Supabase HTTP ${res.status}`);
  return data;
}
async function loadTodayRows(region='dallas'){
  const today=centralDate();
  const select=['id','ai_title','ai_summary','original_title','original_summary','original_url','source_name','duplicate_key','event_data','status','source_published_at','collected_at','created_at','updated_at','region'].join(',');
  const params=new URLSearchParams({select,region:`eq.${region}`,order:'updated_at.desc',limit:'160'});
  const rows=await sb(`newsroom_items?${params.toString()}`);
  const byCategory=new Map();
  for(const row of Array.isArray(rows)?rows:[]){
    let meta={};
    if(row?.event_data&&typeof row.event_data==='object')meta=row.event_data;
    else if(typeof row?.event_data==='string'&&row.event_data.trim()){try{meta=JSON.parse(row.event_data);}catch{}}
    const duplicateKey=String(row.duplicate_key||'').trim().toLowerCase();
    const probe=`${meta.category||meta.home_category||''} ${duplicateKey} ${row.ai_title||''} ${row.original_title||''} ${row.source_name||''}`.toLowerCase();
    let category='';
    if(/daily-core-weather|\bweather\b|national weather service|\bnws\b|날씨|기상/.test(probe))category='weather';
    else if(/daily-core-traffic|tra+f+ic|511dfw|txdot|traffic|교통|도로/.test(probe))category='traffic';
    if(!category)continue;
    const rowDate=String(row.updated_at||row.collected_at||row.created_at||row.source_published_at||'').slice(0,10);
    if(!duplicateKey.includes(`-${today}`)&&rowDate!==today)continue;
    if(String(row.status||'active').toLowerCase()==='inactive')continue;
    if(!byCategory.has(category))byCategory.set(category,row);
  }
  return {today,byCategory};
}
async function generateDailyCore(region='dallas'){
  if(!process.env.OPENAI_API_KEY)throw new Error('OPENAI_API_KEY가 설정되지 않았습니다.');
  const now=new Date();
  const today=centralDate(now);
  const prompt=`Create exactly two current Daily Core records for DalTownMap in Dallas-Fort Worth, Texas. Current time: ${now.toISOString()} (date in America/Chicago: ${today}).\n\nUse web search and prefer first-party official sources.\n1) WEATHER: use National Weather Service Fort Worth/Dallas (weather.gov / NWS) or another first-party official weather source. Describe today's practical DFW weather in concise Korean, including the most important condition or advisory.\n2) TRAFFIC: use TxDOT, DriveTexas, 511DFW, DART, City/County traffic alerts, or another first-party official transportation source. Describe today's practical DFW road/traffic condition in concise Korean. If there is no major incident or closure, explicitly say there is no major unusual road issue currently reported and advise checking live conditions before departure.\n\nDo not invent incidents. Return BOTH records even when conditions are normal. Each source_url must be an actual official URL found during search.\nReturn ONLY valid JSON:\n{"weather":{"title":"한국어 제목","summary":"한국어 1-2문장","source_name":"official source","source_url":"https://...","source_published_at":"ISO or null"},"traffic":{"title":"한국어 제목","summary":"한국어 1-2문장","source_name":"official source","source_url":"https://...","source_published_at":"ISO or null"}}`;
  const payload={model:process.env.NEWSROOM_OPENAI_MODEL||'gpt-5-mini',tools:[{type:'web_search_preview'}],input:prompt};
  const res=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const json=await res.json();
  if(!res.ok)throw new Error(json?.error?.message||`OpenAI 오류 ${res.status}`);
  const parsed=parseJsonText(textFromResponse(json));
  if(!parsed?.weather||!parsed?.traffic)throw new Error('Daily Core AI 결과에 weather 또는 traffic이 없습니다.');
  return {today,weather:parsed.weather,traffic:parsed.traffic};
}
async function saveCategory(region,today,category,item){
  const now=new Date().toISOString();
  const duplicateKey=`daily-core-${category}-${today}`;
  const params=new URLSearchParams({select:'id',region:`eq.${region}`,duplicate_key:`eq.${duplicateKey}`,limit:'1'});
  const existing=await sb(`newsroom_items?${params.toString()}`);
  const title=String(item?.title||'').trim()||(category==='weather'?'오늘의 날씨':'DFW 교통 정보');
  const summary=String(item?.summary||'').trim();
  const sourceUrl=String(item?.source_url||'').trim();
  const sourceName=String(item?.source_name||'').trim()||(category==='weather'?'National Weather Service':'TxDOT / 511DFW');
  const payload={
    region,
    original_title:title,
    original_summary:summary||null,
    original_url:sourceUrl||`https://www.daltownmap.com/#daily-core-${category}`,
    source_name:sourceName,
    source_kind:'official',
    source_published_at:item?.source_published_at||now,
    area:'Dallas-Fort Worth',
    suggested_destination:'life',
    destination:'life',
    status:'classified',
    confidence:95,
    fact_status:'official_verified',
    duplicate_key:duplicateKey,
    ai_title:title,
    ai_summary:summary,
    ai_content:null,
    category_keywords:[],
    event_data:{category,home_category:category,daily_core:true,date_key:today,generated_by:'daily-core-refresh'},
    updated_at:now
  };
  if(Array.isArray(existing)&&existing[0]?.id){
    await sb(`newsroom_items?id=eq.${encodeURIComponent(existing[0].id)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(payload)});
    return {category,id:existing[0].id,action:'updated'};
  }
  payload.collected_at=now;
  const inserted=await sb('newsroom_items',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(payload)});
  return {category,id:Array.isArray(inserted)?inserted[0]?.id:null,action:'inserted'};
}
async function ensureDailyCore(region='dallas',{force=false}={}){
  region=String(region||'dallas').trim().toLowerCase();
  const before=await loadTodayRows(region);
  const missing=['weather','traffic'].filter(k=>!before.byCategory.has(k));
  if(!force&&!missing.length)return {ok:true,date:before.today,region,generated:false,missing:[],items:['weather','traffic'].map(k=>before.byCategory.get(k)).filter(Boolean)};
  const generated=await generateDailyCore(region);
  const targets=force?['weather','traffic']:missing;
  const saved=[];
  for(const category of targets)saved.push(await saveCategory(region,generated.today,category,generated[category]));
  const after=await loadTodayRows(region);
  return {ok:true,date:after.today,region,generated:true,missing:['weather','traffic'].filter(k=>!after.byCategory.has(k)),saved,items:['weather','traffic'].map(k=>after.byCategory.get(k)).filter(Boolean)};
}
module.exports={centralDate,loadTodayRows,ensureDailyCore};
