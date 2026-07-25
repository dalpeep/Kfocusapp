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
async function openai(payload: any){ const key=env('OPENAI_API_KEY'); if(!key) throw new Error('OPENAI_API_KEY가 Supabase Edge Function Secrets에 없습니다.'); const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(payload)}); const t=await r.text(); let j:any={}; try{j=JSON.parse(t)}catch{} if(!r.ok) throw new Error(j?.error?.message || `OpenAI 오류 ${r.status}: ${t.slice(0,180)}`); return parseJsonText(outputText(j)); }

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
async function cleanup(region='dallas'){
  const now=Date.now();
  const staleCandidateCutoff=now-36*60*60*1000;
  const oldSourceCutoff=now-14*24*60*60*1000;
  const {data:rows,error}=await admin.from('newsroom_items').select('id,status,collected_at,source_published_at,event_data').eq('region',region).limit(2000);
  if(error) throw error;
  const expiredIds:any[]=[];
  for(const item of rows||[]){
    if(['published','excluded'].includes(item.status)){expiredIds.push(item.id);continue;}
    const collectedAt=item.collected_at?new Date(item.collected_at).getTime():0;
    const publishedAt=item.source_published_at?new Date(item.source_published_at).getTime():0;
    const eventEnd=item.event_data?.end_at||item.event_data?.start_at;
    const eventEndAt=eventEnd?new Date(eventEnd).getTime():0;
    const eventExpired=eventEndAt>0 && eventEndAt<now-6*60*60*1000;
    const staleCandidate=['collected','classified','review'].includes(item.status) && collectedAt>0 && collectedAt<staleCandidateCutoff;
    const oldNonEvent=publishedAt>0 && publishedAt<oldSourceCutoff && !eventEndAt;
    if(eventExpired||staleCandidate||oldNonEvent) expiredIds.push(item.id);
  }
  let cleaned=0;
  for(let i=0;i<expiredIds.length;i+=100){
    const {data,error:de}=await admin.from('newsroom_items').delete().in('id',expiredIds.slice(i,i+100)).select('id');
    if(de) throw de; cleaned+=data?.length||0;
  }
  return {ok:true,cleaned};
}
async function runStatus(region='dallas'){
  const {data,error}=await admin.from('newsroom_runs').select('*').eq('region',region).order('started_at',{ascending:false}).limit(1).maybeSingle();
  if(error) throw error; return {ok:true,latest:data||null};
}
async function collect(region='dallas', scheduled=false){
  const triggerType=scheduled?'scheduled':'manual';
  const run=await startRun(region,triggerType);
  try{
    if(scheduled){const {data:setting}=await admin.from('newsroom_settings').select('auto_enabled').eq('region',region).maybeSingle();if(setting && setting.auto_enabled===false){await finishRun(run?.id,{status:'success',found:0,inserted:0,skipped:0,cleaned:0,note:'auto disabled'});return {ok:true,disabled:true,found:0,inserted:0,skipped:0,cleaned:0};}}
    const cleaned=(await cleanup(region)).cleaned;
    const now=new Date(), since=new Date(now.getTime()-30*60*60*1000).toISOString();
    const result=await openai({model:env('NEWSROOM_OPENAI_MODEL')||'gpt-5-mini',tools:[{type:'web_search'}],input:`You are the source collector for DalTownMap, a Korean-language Dallas-Fort Worth daily-life guide. Current UTC time: ${now.toISOString()}. Search broadly for useful items published or materially updated since ${since}, plus clearly dated upcoming events and promotions occurring within the next 14 days. The test is not "is this major news?" but "could this help or interest a Korean resident today or this week?"

Give strong priority to Korean-community sources and organizations, including KTN, Weekly Focus Dallas (주간포커스 달라스), Korea Daily / 미주중앙일보 Dallas, Dalsaram, Korean Society of Dallas, Korean consular notices, Korean schools, cultural groups, churches when the item is a public community event, and Korean grocery stores such as H Mart, Zion Market and Komart. Also search official or reliable sources for banks and personal finance: Hanmi Bank, Bank of Hope, Open Bank, PCB Bank, CBB Bank, Chase, Bank of America, Wells Fargo, Capital One, local credit unions, SBA, IRS, mortgage rates, CD/savings promotions, remittance and small-business programs. Prefer first-party bank, government or regulator pages for rates, fees, eligibility and deadlines; media may be used to discover an item but financial facts must be tied to an official source whenever possible.

Also include practical DFW information from cities, counties, DART, TxDOT, police/fire, school districts, NWS Fort Worth, airports, libraries, parks, museums, sports schedules, performing-arts venues, family activities, health events, traffic, road closures, new Korean businesses, grocery sales and useful local promotions. Keep a balanced mix across community, finance, shopping, food, family, education, health, events, weather, traffic, business and public notices. Do not reject a useful item merely because it is small or promotional; retain it when the dates, offer and source are verifiable and locally relevant. Exclude expired items, undated evergreen pages presented as new, duplicate URLs, pure opinion, sports recaps, unverifiable claims and promotions without clear terms or dates.

Do not write the Korean article yet and do not invent facts. Return raw reviewable records only. For events or promotions, include exact dates in the summary. Return ONLY JSON {"items":[{"original_title":"","original_summary":"1-3 factual sentences","original_url":"https://...","source_name":"","source_kind":"official or media","source_published_at":"ISO or null","area":"Dallas-Fort Worth"}]}`});
    const items=Array.isArray(result.items)?result.items:[];
    const {data:existing,error:e}=await admin.from('newsroom_items').select('original_url').eq('region',region).limit(1000); if(e) throw e;
    const seen=new Set((existing||[]).map((x:any)=>slug(x.original_url))); const rows:any[]=[]; let skipped=0;
    for(const x of items){ if(!x?.original_url||!x?.original_title){skipped++;continue;} const key=slug(x.original_url); if(seen.has(key)){skipped++;continue;} seen.add(key); rows.push({region,original_title:String(x.original_title).slice(0,500),original_summary:x.original_summary||null,original_url:x.original_url,source_name:x.source_name||null,source_kind:x.source_kind==='media'?'media':'official',source_published_at:x.source_published_at||null,area:x.area||'Dallas-Fort Worth',status:'collected',confidence:0,fact_status:'needs_review',duplicate_key:key,category_keywords:[],event_data:{},collected_at:new Date().toISOString(),updated_at:new Date().toISOString()}); }
    let insertedCount=0;
    if(rows.length){const {data:inserted,error}=await admin.from('newsroom_items').upsert(rows,{onConflict:'duplicate_key',ignoreDuplicates:true}).select('id'); if(error) throw error; insertedCount=inserted?.length||0;}
    await finishRun(run?.id,{status:'success',found:items.length,inserted:insertedCount,skipped,cleaned});
    return {ok:true,found:items.length,inserted:insertedCount,skipped,cleaned};
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

Deno.serve(async(req)=>{ if(req.method==='OPTIONS')return new Response('ok',{headers:cors}); try{const auth=await authorize(req);const body=await req.json().catch(()=>({}));const action=String(body.action||'');const region=String(body.region||'dallas').toLowerCase();if(action==='status')return json(await status(region));if(action==='run_status')return json(await runStatus(region));if(action==='cleanup')return json(await cleanup(region));if(action==='collect')return json(await collect(region,Boolean((auth as any).cron||body.scheduled)));if(action==='analyze')return json(await analyze(body));if(action==='draft')return json(await draft(body));if(action==='get_settings'){const {data,error}=await admin.from('newsroom_settings').select('*').eq('region',region).maybeSingle();if(error)throw error;return json({ok:true,settings:data||{region,auto_enabled:true}});}if(action==='save_settings'){const {data,error}=await admin.from('newsroom_settings').upsert({region,auto_enabled:Boolean(body.auto_enabled),updated_at:new Date().toISOString()},{onConflict:'region'}).select().single();if(error)throw error;return json({ok:true,settings:data});}return json({ok:false,error:'지원하지 않는 뉴스룸 작업입니다.'},400);}catch(e){console.error(e);return json({ok:false,error:e instanceof Error?e.message:String(e)},500);} });
