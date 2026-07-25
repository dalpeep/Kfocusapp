import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } });
const env = (name: string) => Deno.env.get(name) || '';
const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

function outputText(v: any) { return v?.output_text || v?.output?.flatMap((x: any) => x.content || []).find((x: any) => x.type === 'output_text')?.text || ''; }
function parseJsonText(text = '') { const clean = String(text).replace(/^```json\s*/i, '').replace(/```$/,'').trim(); try { return JSON.parse(clean); } catch { const a=clean.indexOf('{'), b=clean.lastIndexOf('}'); if(a>=0&&b>a) return JSON.parse(clean.slice(a,b+1)); throw new Error('AI 응답을 JSON으로 해석하지 못했습니다.'); } }
function slug(v=''){ return String(v).toLowerCase().replace(/^https?:\/\//,'').replace(/[?#].*$/,'').replace(/\/$/,'').slice(0,500); }
async function openai(payload: any){
  const key=env('OPENAI_API_KEY');
  if(!key) throw new Error('OPENAI_API_KEY가 Supabase Edge Function Secrets에 없습니다.');
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),45000);
  try{
    const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({...payload,max_output_tokens:payload.max_output_tokens||2200}),signal:controller.signal});
    const t=await r.text(); let j:any={}; try{j=JSON.parse(t)}catch{}
    if(!r.ok) throw new Error(j?.error?.message || `OpenAI 오류 ${r.status}: ${t.slice(0,180)}`);
    return parseJsonText(outputText(j));
  }catch(e){
    if(e instanceof DOMException && e.name==='AbortError') throw new Error('AI 검색이 45초를 초과했습니다. 이 수집 분야만 건너뛰고 다시 시도해 주세요.');
    throw e;
  }finally{clearTimeout(timer);}
}

async function authorize(req: Request){
  const cronSecret=req.headers.get('x-cron-secret');
  if(cronSecret && cronSecret===env('NEWSROOM_CRON_SECRET')) return { cron:true };
  const auth=req.headers.get('Authorization')||'';
  if(!auth.startsWith('Bearer ')) throw new Error('관리자 로그인이 필요합니다.');
  const userClient=createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {global:{headers:{Authorization:auth}},auth:{persistSession:false}});
  const {data:{user},error}=await userClient.auth.getUser(); if(error||!user) throw new Error('로그인 세션을 확인하지 못했습니다.');
  const {data:profile,error:pe}=await admin.from('profiles').select('role,area').eq('user_id',user.id).maybeSingle();
  if(pe||!profile||!['super_admin','regional_editor'].includes(profile.role)) throw new Error('뉴스룸 관리자 권한이 없습니다.');
  return {user,profile};
}

async function startRun(region:string, triggerType:string){
  const {data,error}=await admin.from('newsroom_runs').insert({region,trigger_type:triggerType,status:'running',started_at:new Date().toISOString()}).select().single();
  if(error){console.warn('newsroom_runs start failed',error.message);return null;} return data;
}
async function finishRun(id:any, patch:any){if(!id)return;const {error}=await admin.from('newsroom_runs').update({...patch,finished_at:new Date().toISOString()}).eq('id',id);if(error)console.warn('newsroom_runs finish failed',error.message);}
function dallasDateKey(value: string | number | Date){
  const d=value instanceof Date?value:new Date(value);
  if(Number.isNaN(d.getTime())) return '';
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
  const get=(type:string)=>parts.find(x=>x.type===type)?.value||'';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
function dateMs(value:any){const n=value?new Date(value).getTime():0;return Number.isFinite(n)?n:0;}
function futureOrActiveEvent(eventData:any, now:number){
  const start=dateMs(eventData?.start_at);
  const end=dateMs(eventData?.end_at||eventData?.expires_at);
  return (end>now) || (!end && start>now);
}
async function cleanup(region='dallas'){
  const now=Date.now();
  const todayDallas=dallasDateKey(now);
  const undatedCutoff=now-24*60*60*1000;
  const {data:rows,error}=await admin.from('newsroom_items').select('id,status,collected_at,source_published_at,event_data').eq('region',region).limit(3000);
  if(error) throw error;
  const expiredIds:any[]=[];
  for(const item of rows||[]){
    if(['published','excluded'].includes(item.status)){expiredIds.push(item.id);continue;}
    const collectedAt=dateMs(item.collected_at);
    const publishedKey=item.source_published_at?dallasDateKey(item.source_published_at):'';
    const eventEnd=dateMs(item.event_data?.end_at||item.event_data?.expires_at||item.event_data?.start_at);
    const eventExpired=eventEnd>0 && eventEnd<now;
    const hasFutureEvent=futureOrActiveEvent(item.event_data,now);
    // 일반 기사·날씨·공지는 달라스 날짜 기준 오늘 것만 유지합니다.
    // 미래 행사나 아직 진행 중인 프로모션은 게시일이 어제여도 종료일까지 유지합니다.
    const oldPublished=Boolean(publishedKey && publishedKey<todayDallas && !hasFutureEvent);
    // 게시일이 없는 후보는 당일 수집분만 남겨 오래된 evergreen 페이지가 쌓이지 않게 합니다.
    const staleUndated=!publishedKey && !hasFutureEvent && collectedAt>0 && collectedAt<undatedCutoff;
    if(eventExpired||oldPublished||staleUndated) expiredIds.push(item.id);
  }
  let cleaned=0;
  for(let i=0;i<expiredIds.length;i+=100){
    const {data,error:de}=await admin.from('newsroom_items').delete().in('id',expiredIds.slice(i,i+100)).select('id');
    if(de) throw de; cleaned+=data?.length||0;
  }
  return {ok:true,cleaned,today_dallas:todayDallas};
}
async function runStatus(region='dallas'){
  const {data,error}=await admin.from('newsroom_runs').select('*').eq('region',region).order('started_at',{ascending:false}).limit(1).maybeSingle();
  if(error) throw error; return {ok:true,latest:data||null};
}
function scheduledLaneKey(){
  const keys=['korean','finance','shopping','events','practical'];
  const day=Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',weekday:'short'}).format(new Date()).split('').reduce((a,c)=>a+c.charCodeAt(0),0));
  return keys[day%keys.length];
}
const COLLECTION_LANES:Record<string,{label:string,focus:string}>={
  korean:{label:'한인 커뮤니티',focus:`Prioritize KTN Dallas, Weekly Focus Dallas / 주간포커스 달라스, Korea Daily / 미주중앙일보 Dallas, Dalsaram / 달사람, Korean Society of Dallas, Korean consular notices, Korean schools, cultural groups, and public Korean-community events. Search in both Korean and English. Include community notices, education, culture, public church events, new Korean businesses, and useful Korean-local reporting.`},
  finance:{label:'은행·금융',focus:`Search official sources for Hanmi Bank, Bank of Hope, Open Bank, PCB Bank, CBB Bank, Chase, Bank of America, Wells Fargo, Capital One, local credit unions, SBA and IRS. Include dated CD/savings offers, account promotions, mortgage or small-business programs, remittance information, tax deadlines and verified consumer notices. Use first-party bank, government or regulator pages for rates, fees, eligibility and deadlines.`},
  shopping:{label:'마트·업소·생활경제',focus:`Search H Mart, Zion Market, Komart and other Korean/Asian grocery stores, plus verifiable DFW shopping promotions, restaurant openings, Korean business openings and practical consumer information. Promotions must have clear active dates or terms.`},
  events:{label:'행사·가족·교육',focus:`Search Dallas, Plano, Frisco, Carrollton, McKinney, Allen and nearby city calendars, libraries, parks, museums, performing arts, sports schedules, school districts and family organizations. Include events, camps, festivals, classes, exhibitions and family activities happening within the next 30 days.`},
  practical:{label:'오늘의 실용정보',focus:`Search official DFW sources for NWS Fort Worth, TxDOT, DART, cities, counties, airports, police/fire and health agencies. Include today's weather warnings, road closures, transit disruptions, airport notices, health events and practical public-service updates. Keep only one representative item per same weather or traffic situation.`}
};
async function collectLane(now:Date,since:string,lane:string,focus:string){
  return await openai({model:env('NEWSROOM_OPENAI_MODEL')||'gpt-5-mini',tools:[{type:'web_search'}],input:`You collect source records for DalTownMap, a Korean-language Dallas-Fort Worth daily-life guide. Current UTC time: ${now.toISOString()}. Collection lane: ${lane}.

Search focus:
${focus}

Be inclusive rather than overly strict. The question is: could this be useful or interesting to a Korean resident today or during the next 30 days? Small community notices, public events, bank programs, grocery promotions, business openings and practical local updates are valid. Search items published or materially updated since ${since}, and also clearly dated future events or active promotions occurring within the next 30 days. Prefer original/first-party pages. Do not fill the lane with near-duplicates.

Exclude expired items, undated evergreen pages presented as new, pure opinion, sports recaps, unverifiable claims, and promotions whose dates or terms cannot be confirmed. Return 3-5 distinct records when available. Do not write a Korean article and do not invent facts.

Return ONLY JSON {"items":[{"original_title":"","original_summary":"1-3 factual sentences including exact dates/terms when relevant","original_url":"https://...","source_name":"","source_kind":"official or media","source_published_at":"ISO or null","area":"Dallas-Fort Worth","item_type":"news|event|promotion|finance|shopping|business|weather|traffic|community","event_start_at":"ISO or null","event_end_at":"ISO or null","expires_at":"ISO or null"}]}`});
}
async function collect(region='dallas', scheduled=false, laneKey='korean'){
  const lane=COLLECTION_LANES[laneKey]||COLLECTION_LANES.korean;
  const triggerType=scheduled?`scheduled:${laneKey}`:`manual:${laneKey}`;
  const run=await startRun(region,triggerType);
  try{
    if(scheduled){const {data:setting}=await admin.from('newsroom_settings').select('auto_enabled').eq('region',region).maybeSingle();if(setting && setting.auto_enabled===false){await finishRun(run?.id,{status:'success',found:0,inserted:0,skipped:0,cleaned:0,note:'auto disabled'});return {ok:true,disabled:true,lane:laneKey,found:0,inserted:0,skipped:0,cleaned:0};}}
    const now=new Date(), since=new Date(now.getTime()-72*60*60*1000).toISOString();
    const gathered:any[]=[];
    const result=await collectLane(now,since,lane.label,lane.focus);
    if(Array.isArray(result.items))gathered.push(...result.items);
    const {data:existing,error:e}=await admin.from('newsroom_items').select('original_url').eq('region',region).limit(2000); if(e) throw e;
    const seen=new Set((existing||[]).map((x:any)=>slug(x.original_url))); const rows:any[]=[]; let skipped=0;
    const todayDallas=dallasDateKey(now);
    for(const x of gathered){
      if(!x?.original_url||!x?.original_title){skipped++;continue;}
      const key=slug(x.original_url); if(seen.has(key)){skipped++;continue;}
      const eventData={start_at:x.event_start_at||null,end_at:x.event_end_at||null,expires_at:x.expires_at||null,item_type:x.item_type||'news'};
      const publishedKey=x.source_published_at?dallasDateKey(x.source_published_at):'';
      if(publishedKey && publishedKey<todayDallas && !futureOrActiveEvent(eventData,now.getTime())){skipped++;continue;}
      seen.add(key);
      rows.push({region,original_title:String(x.original_title).slice(0,500),original_summary:x.original_summary||null,original_url:x.original_url,source_name:x.source_name||null,source_kind:x.source_kind==='media'?'media':'official',source_published_at:x.source_published_at||null,area:x.area||'Dallas-Fort Worth',status:'collected',confidence:0,fact_status:'needs_review',duplicate_key:key,category_keywords:[],event_data:eventData,collected_at:new Date().toISOString(),updated_at:new Date().toISOString()});
    }
    let insertedCount=0;
    if(rows.length){const {data:inserted,error}=await admin.from('newsroom_items').upsert(rows,{onConflict:'duplicate_key',ignoreDuplicates:true}).select('id'); if(error) throw error; insertedCount=inserted?.length||0;}
    await finishRun(run?.id,{status:'success',found:gathered.length,inserted:insertedCount,skipped,cleaned:0});
    return {ok:true,lane:laneKey,lane_label:lane.label,found:gathered.length,inserted:insertedCount,skipped,cleaned:0};
  }catch(e){await finishRun(run?.id,{status:'failed',error_message:e instanceof Error?e.message:String(e)});throw e;}
}
async function analyzeOne(item:any){ return await openai({model:env('NEWSROOM_OPENAI_MODEL')||'gpt-5-mini',input:`Analyze one Dallas-Fort Worth source record for DalTownMap, a Korean daily-life guide. Do not write the full article yet. Title: ${item.original_title}
Summary: ${item.original_summary||''}
Source: ${item.source_name||''}
URL: ${item.original_url}
Published: ${item.source_published_at||''}
Area: ${item.area||''}
Return ONLY JSON with: suggested_destination exactly life, notice, guide, urgent, or exclude; confidence 0-100; fact_status official_verified or needs_review; priority_level exactly urgent, high, normal, or low; priority_score 0-100 where the score means Korean-community life usefulness, not conventional news importance; classification_reason in concise Korean explaining who may find it useful; concise Korean working title and 2-3 sentence Korean summary; category_keywords for related businesses; event_data fields name,start_at,end_at,venue,address,cost,organizer,registration_url. Keep small but useful Korean-community notices, bank programs, verified sales, family activities and local events. Use exclude only for expired or duplicate items, weak DFW relevance, missing verifiable terms/dates, pure advertising with no useful information, or unverifiable claims. Finance content must avoid recommendations or promises: state rates, deadlines and eligibility neutrally and mark needs_review unless clearly confirmed by an official bank, government or regulator source. General forecasts may remain low when they offer practical planning value; active warnings, closures, school disruptions and urgent public-safety notices are urgent. For tragedy, death, violent crime or active disaster, return empty category_keywords. {"suggested_destination":"life","confidence":90,"fact_status":"official_verified","priority_level":"high","priority_score":80,"classification_reason":"","ai_title":"","ai_summary":"","category_keywords":[],"event_data":{}}`}); }
async function analyze(body:any){ let q=admin.from('newsroom_items').select('*'); if(body.id) q=q.eq('id',body.id); else q=q.eq('region',String(body.region||'dallas').toLowerCase()).eq('status','collected').order('collected_at',{ascending:false}).limit(Math.min(20,Number(body.limit)||10)); const {data:rows,error}=await q;if(error)throw error; let analyzed=0,excluded=0; for(const item of rows||[]){const a=await analyzeOne(item);const dest=['life','notice','guide','urgent','exclude'].includes(a.suggested_destination)?a.suggested_destination:'life';const priority=['urgent','high','normal','low'].includes(a.priority_level)?a.priority_level:(dest==='urgent'?'urgent':dest==='exclude'?'low':'normal');const {error:u}=await admin.from('newsroom_items').update({suggested_destination:dest,destination:dest,confidence:Math.max(0,Math.min(100,Number(a.confidence)||0)),fact_status:a.fact_status==='official_verified'?'official_verified':'needs_review',priority_level:priority,priority_score:Math.max(0,Math.min(100,Number(a.priority_score)||0)),classification_reason:String(a.classification_reason||'').slice(0,1000),ai_title:a.ai_title||item.original_title,ai_summary:a.ai_summary||item.original_summary||'',category_keywords:Array.isArray(a.category_keywords)?a.category_keywords.slice(0,12):[],event_data:a.event_data&&typeof a.event_data==='object'?a.event_data:{},status:dest==='exclude'?'excluded':'classified',updated_at:new Date().toISOString()}).eq('id',item.id);if(u)throw u;analyzed++;if(dest==='exclude')excluded++;} return {ok:true,analyzed,excluded}; }
async function draft(body:any){ if(!body.id)throw new Error('기사 ID가 없습니다.');const {data:item,error}=await admin.from('newsroom_items').select('*').eq('id',body.id).single();if(error)throw error;const a=await openai({model:env('NEWSROOM_OPENAI_MODEL')||'gpt-5-mini',input:`Create an original Korean local-information article for Korean readers in Dallas-Fort Worth from the source record below. This is not a literal translation. Rewrite it as a concise, natural Korean news or public-information article. Do not copy source sentences and do not invent facts. Preserve exact dates, times, road names, school districts, agency names, addresses, costs and registration details. Explain unfamiliar local-government terms briefly when useful. Lead with what changed, when, where, and what readers should do. If the source is only a routine agenda or general forecast with little practical value, keep the draft very short and neutral. Destination: ${item.destination||item.suggested_destination||'life'}. Priority: ${item.priority_level||'normal'}. Original title: ${item.original_title}. Source summary: ${item.original_summary||''}. Source: ${item.source_name||''}. URL: ${item.original_url}. Working title: ${item.ai_title||''}. Working summary: ${item.ai_summary||''}. Return ONLY JSON {"ai_title":"clear Korean headline","ai_summary":"2-3 Korean sentences with the key takeaway","ai_content":"original Korean article body, normally 3-7 short paragraphs, without a source footer"}.`});const {error:u}=await admin.from('newsroom_items').update({ai_title:a.ai_title||item.ai_title||item.original_title,ai_summary:a.ai_summary||item.ai_summary||'',ai_content:a.ai_content||'',status:'review',draft_updated_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',item.id);if(u)throw u;return {ok:true}; }

async function status(region='dallas'){
  const checks:any={edge_function:true,openai_key:Boolean(env('OPENAI_API_KEY')),service_role_key:Boolean(env('SUPABASE_SERVICE_ROLE_KEY')),newsroom_items:false,newsroom_settings:false,newsroom_runs:false};
  const a=await admin.from('newsroom_items').select('id',{count:'exact',head:true}).eq('region',region);checks.newsroom_items=!a.error;
  const b=await admin.from('newsroom_settings').select('region',{count:'exact',head:true}).eq('region',region);checks.newsroom_settings=!b.error;
  const c=await admin.from('newsroom_runs').select('id',{count:'exact',head:true}).eq('region',region);checks.newsroom_runs=!c.error;
  const ok=Object.values(checks).every(Boolean);
  return {ok,checks,message:ok?'초기 설치가 완료되어 이후 운영은 관리자 화면에서 처리할 수 있습니다.':'SQL, Edge Function Secrets 또는 함수 배포 상태를 확인하세요.'};
}

Deno.serve(async(req)=>{ if(req.method==='OPTIONS')return new Response('ok',{headers:cors}); try{const auth=await authorize(req);const body=await req.json().catch(()=>({}));const action=String(body.action||'');const region=String(body.region||'dallas').toLowerCase();if(action==='status')return json(await status(region));if(action==='run_status')return json(await runStatus(region));if(action==='cleanup')return json(await cleanup(region));if(action==='collect'){const scheduled=Boolean((auth as any).cron||body.scheduled);const lane=String(body.lane||(scheduled?scheduledLaneKey():'korean'));return json(await collect(region,scheduled,lane));}if(action==='analyze')return json(await analyze(body));if(action==='draft')return json(await draft(body));if(action==='get_settings'){const {data,error}=await admin.from('newsroom_settings').select('*').eq('region',region).maybeSingle();if(error)throw error;return json({ok:true,settings:data||{region,auto_enabled:true}});}if(action==='save_settings'){const {data,error}=await admin.from('newsroom_settings').upsert({region,auto_enabled:Boolean(body.auto_enabled),updated_at:new Date().toISOString()},{onConflict:'region'}).select().single();if(error)throw error;return json({ok:true,settings:data});}return json({ok:false,error:'지원하지 않는 뉴스룸 작업입니다.'},400);}catch(e){console.error(e);return json({ok:false,error:e instanceof Error?e.message:String(e)},500);} });
