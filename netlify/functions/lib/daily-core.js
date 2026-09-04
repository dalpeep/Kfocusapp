const crypto=require('crypto');

function audit(event,details={}){
  console.info('[daily-core]',JSON.stringify({event,...details}));
}
function auditError(event,error,details={}){
  console.error('[daily-core]',JSON.stringify({event,...details,message:error?.message||String(error)}));
}
function withStage(error,stage){
  if(error&&typeof error==='object'&&!error.dailyCoreStage)error.dailyCoreStage=stage;
  return error;
}

function centralDate(value=new Date()){
  return new Intl.DateTimeFormat('en-CA',{
    timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'
  }).format(value);
}
function textFromResponse(json){
  if(typeof json?.output_text==='string'&&json.output_text.trim())return json.output_text;
  return (Array.isArray(json?.output)?json.output:[])
    .filter(item=>item?.type==='message'&&(!item.role||item.role==='assistant'))
    .flatMap(item=>Array.isArray(item.content)?item.content:[])
    .filter(content=>content?.type==='output_text'&&typeof content.text==='string')
    .map(content=>content.text)
    .join('');
}
function parseJsonText(text=''){
  const clean=String(text).trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();
  try{return JSON.parse(clean);}catch(_){
    const a=clean.indexOf('{'),b=clean.lastIndexOf('}');
    if(a>=0&&b>a)return JSON.parse(clean.slice(a,b+1));
    throw new Error('Daily Core AI 결과를 JSON으로 해석하지 못했습니다.');
  }
}
function responseDiagnostics(json,text){
  const output=Array.isArray(json?.output)?json.output:[];
  const trimmed=String(text||'').trim();
  return {
    response_status:String(json?.status||''),
    incomplete_reason:String(json?.incomplete_details?.reason||''),
    output_item_types:output.map(item=>String(item?.type||'unknown')),
    assistant_message:output.some(item=>item?.type==='message'&&(!item.role||item.role==='assistant')),
    extracted_text_length:trimmed.length,
    starts_with_json:/^[\[{]/.test(trimmed.replace(/^```(?:json)?\s*/i,'')),
    ends_with_json:/[\]}](?:\s*```)?$/.test(trimmed),
    has_code_fence:/```/.test(trimmed)
  };
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
async function generateDailyCore(region='dallas',categories=['weather','traffic']){
  const now=new Date();
  const today=centralDate(now);
  const requested=[...new Set((Array.isArray(categories)?categories:[])
    .map(category=>String(category||'').trim().toLowerCase())
    .filter(category=>['weather','traffic'].includes(category)))];
  if(!requested.length){
    const error=new Error('생성할 Daily Core category가 없습니다.');
    auditError('generation_category_validation_failed',error,{dallas_date:today,region,categories:[]});
    throw withStage(error,'generation_category_validation');
  }
  if(!process.env.OPENAI_API_KEY){
    const error=new Error('OPENAI_API_KEY가 설정되지 않았습니다.');
    auditError('openai_configuration_failed',error,{dallas_date:today,region});
    throw withStage(error,'openai_configuration');
  }
  const instructions={
    weather:'WEATHER: Check today\'s practical DFW weather using National Weather Service Fort Worth/Dallas (weather.gov / NWS) or another first-party official weather source. Write a concise Korean title and 1-2 sentence summary with the most important condition or advisory.',
    traffic:'TRAFFIC: Check only current Dallas-Fort Worth road/transit conditions using TxDOT, DriveTexas, 511DFW, DART, or an official Dallas/DFW transportation source. Write a concise Korean title and 1-2 sentence summary. If no major incident or closure is officially reported, say so and advise checking live conditions before departure.'
  };
  const schema=Object.fromEntries(requested.map(category=>[category,{
    title:'한국어 제목',summary:'한국어 1-2문장',source_name:'official source',
    source_url:'https://...',source_published_at:'ISO or null'
  }]));
  const responseSchema={
    type:'object',
    properties:Object.fromEntries(requested.map(category=>[category,{
      type:'object',
      properties:{
        title:{type:'string'},summary:{type:'string'},source_name:{type:'string'},
        source_url:{type:'string'},source_published_at:{type:['string','null']}
      },
      required:['title','summary','source_name','source_url','source_published_at'],
      additionalProperties:false
    }])),
    required:requested,
    additionalProperties:false
  };
  const prompt=`Create only the requested current Daily Core record(s) for DalTownMap in Dallas-Fort Worth, Texas. Current time: ${now.toISOString()} (Dallas date: ${today}).\nRequested categories: ${requested.join(', ')}.\nUse web search only as needed and prefer the named first-party official sources. Do not research or return categories that were not requested. Do not invent incidents. Each source_url must be an actual official URL found during this search.\n${requested.map(category=>instructions[category]).join('\n')}\nReturn ONLY short valid JSON matching this shape:\n${JSON.stringify(schema)}`;
  const payload={
    model:process.env.NEWSROOM_OPENAI_MODEL||'gpt-5-mini',
    tools:[{type:'web_search_preview'}],
    max_output_tokens:1200,
    text:{format:{type:'json_schema',name:'daily_core_result',strict:true,schema:responseSchema}},
    input:prompt
  };
  audit('openai_call_started',{dallas_date:today,region,model:payload.model,categories:requested,max_output_tokens:payload.max_output_tokens});
  let res,json;
  try{
    res=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(payload)});
    json=await res.json();
    if(!res.ok)throw new Error(json?.error?.message||`OpenAI 오류 ${res.status}`);
    const extracted=textFromResponse(json);
    const diagnostics=responseDiagnostics(json,extracted);
    audit('openai_call_completed',{dallas_date:today,region,http_status:res.status,categories:requested,...diagnostics});
    if(json?.status&&json.status!=='completed'){
      const error=new Error(`OpenAI 응답이 완료되지 않았습니다: ${json.status}${diagnostics.incomplete_reason?` (${diagnostics.incomplete_reason})`:''}`);
      auditError('openai_response_incomplete',error,{dallas_date:today,region,categories:requested,...diagnostics});
      throw withStage(error,'openai_response_incomplete');
    }
  }catch(error){
    if(error?.dailyCoreStage==='openai_response_incomplete')throw error;
    auditError('openai_call_failed',error,{dallas_date:today,region,http_status:res?.status||null});
    throw withStage(error,'openai_call');
  }
  let parsed;
  try{
    parsed=parseJsonText(textFromResponse(json));
    audit('openai_parse_succeeded',{dallas_date:today,region});
  }catch(error){
    auditError('openai_parse_failed',error,{dallas_date:today,region});
    throw withStage(error,'openai_parse');
  }
  const detected=['weather','traffic'].filter(category=>Boolean(parsed?.[category]));
  audit('openai_categories_detected',{dallas_date:today,region,requested_categories:requested,categories:detected});
  const missingRequested=requested.filter(category=>!parsed?.[category]);
  if(missingRequested.length){
    const error=new Error(`Daily Core AI 결과에 요청 category가 없습니다: ${missingRequested.join(', ')}`);
    auditError('openai_category_validation_failed',error,{dallas_date:today,region,requested_categories:requested,categories:detected,missing:missingRequested});
    throw withStage(error,'openai_category_validation');
  }
  audit('openai_category_validation_succeeded',{dallas_date:today,region,requested_categories:requested,categories:detected});
  return {today,...Object.fromEntries(requested.map(category=>[category,parsed[category]]))};
}
async function claimGenerationLock(region,today){
  const token=crypto.randomUUID();
  const claimed=await sb('rpc/claim_daily_core_generation_lock',{
    method:'POST',
    body:JSON.stringify({p_region:region,p_date_key:today,p_lock_token:token,p_ttl_seconds:120})
  });
  return {claimed:claimed===true,token};
}
async function releaseGenerationLock(region,today,token){
  return await sb('rpc/release_daily_core_generation_lock',{
    method:'POST',
    body:JSON.stringify({p_region:region,p_date_key:today,p_lock_token:token})
  });
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
  let before;
  try{before=await loadTodayRows(region);}catch(error){
    auditError('initial_db_read_failed',error,{region});
    throw withStage(error,'initial_db_read');
  }
  const missing=['weather','traffic'].filter(k=>!before.byCategory.has(k));
  audit('initial_db_read_completed',{
    dallas_date:before.today,region,
    weather:before.byCategory.has('weather'),traffic:before.byCategory.has('traffic'),missing
  });
  if(!force&&!missing.length){
    audit('generation_skipped',{dallas_date:before.today,region,reason:'complete'});
    return {ok:true,date:before.today,region,generated:false,missing:[],items:['weather','traffic'].map(k=>before.byCategory.get(k)).filter(Boolean)};
  }
  let lock;
  try{lock=await claimGenerationLock(region,before.today);}catch(error){
    auditError('generation_lock_failed',error,{dallas_date:before.today,region});
    throw withStage(error,'generation_lock');
  }
  if(!lock.claimed){
    audit('generation_lock_denied',{
      dallas_date:before.today,region,reason:'another_invocation_holds_unexpired_lock',initial_missing:missing
    });
    let current;
    try{current=await loadTodayRows(region);}catch(error){
      auditError('lock_denied_db_read_failed',error,{dallas_date:before.today,region});
      throw withStage(error,'lock_denied_db_read');
    }
    const currentMissing=['weather','traffic'].filter(k=>!current.byCategory.has(k));
    audit('lock_denied_db_read_completed',{
      dallas_date:current.today,region,
      weather:current.byCategory.has('weather'),traffic:current.byCategory.has('traffic'),missing:currentMissing
    });
    return {ok:true,date:current.today,region,generated:false,locked:true,missing:['weather','traffic'].filter(k=>!current.byCategory.has(k)),items:['weather','traffic'].map(k=>current.byCategory.get(k)).filter(Boolean)};
  }
  audit('generation_lock_acquired',{dallas_date:before.today,region,initial_missing:missing});
  try{
    // 최초 조회와 잠금 획득 사이에 다른 실행이 저장했을 수 있으므로 잠금 안에서 다시 확인합니다.
    let current;
    try{current=await loadTodayRows(region);}catch(error){
      auditError('locked_db_read_failed',error,{dallas_date:before.today,region});
      throw withStage(error,'locked_db_read');
    }
    const currentMissing=['weather','traffic'].filter(k=>!current.byCategory.has(k));
    audit('locked_db_read_completed',{
      dallas_date:current.today,region,
      weather:current.byCategory.has('weather'),traffic:current.byCategory.has('traffic'),missing:currentMissing
    });
    if(!force&&!currentMissing.length){
      audit('generation_skipped',{dallas_date:current.today,region,reason:'completed_while_waiting_for_lock'});
      return {ok:true,date:current.today,region,generated:false,missing:[],items:['weather','traffic'].map(k=>current.byCategory.get(k)).filter(Boolean)};
    }
    let generated;
    try{generated=await generateDailyCore(region,currentMissing);}catch(error){throw withStage(error,error?.dailyCoreStage||'generation');}
    const targets=force?['weather','traffic']:currentMissing;
    const saved=[];
    for(const category of targets){
      audit('category_save_started',{dallas_date:generated.today,region,category});
      try{
        const result=await saveCategory(region,generated.today,category,generated[category]);
        saved.push(result);
        audit('category_save_succeeded',{dallas_date:generated.today,region,category,result:{id:result.id,action:result.action}});
      }catch(error){
        auditError('category_save_failed',error,{dallas_date:generated.today,region,category});
        throw withStage(error,`${category}_save`);
      }
    }
    let after;
    try{after=await loadTodayRows(region);}catch(error){
      auditError('final_db_read_failed',error,{dallas_date:generated.today,region});
      throw withStage(error,'final_db_read');
    }
    const finalMissing=['weather','traffic'].filter(k=>!after.byCategory.has(k));
    audit('final_db_read_completed',{
      dallas_date:after.today,region,
      weather:after.byCategory.has('weather'),traffic:after.byCategory.has('traffic'),missing:finalMissing,
      saved:saved.map(row=>({category:row.category,id:row.id,action:row.action}))
    });
    return {ok:true,date:after.today,region,generated:true,missing:finalMissing,saved,items:['weather','traffic'].map(k=>after.byCategory.get(k)).filter(Boolean)};
  }finally{
    try{
      const released=await releaseGenerationLock(region,before.today,lock.token);
      audit('generation_lock_released',{dallas_date:before.today,region,released:released!==false});
    }catch(error){
      console.warn('[daily-core]',JSON.stringify({event:'generation_lock_release_failed',dallas_date:before.today,region,message:error?.message||String(error)}));
    }
  }
}
module.exports={centralDate,loadTodayRows,ensureDailyCore,_test:{textFromResponse,parseJsonText,responseDiagnostics}};
