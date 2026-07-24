const headers={
  'Content-Type':'application/json; charset=utf-8',
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'Content-Type, Authorization',
  'Access-Control-Allow-Methods':'GET, POST, OPTIONS'
};
function out(statusCode,body){return {statusCode,headers,body:JSON.stringify(body)};}
function textFromResponse(json){return json.output_text||json.output?.flatMap(x=>x.content||[]).find(x=>x.type==='output_text')?.text||'';}
function parseJsonText(text=''){
  const clean=String(text).replace(/^```json\s*/i,'').replace(/```$/,'').trim();
  try{return JSON.parse(clean);}catch(_){const a=clean.indexOf('{'),b=clean.lastIndexOf('}');if(a>=0&&b>a)return JSON.parse(clean.slice(a,b+1));throw new Error('AI 수집 결과를 JSON으로 해석하지 못했습니다.');}
}
function slug(v=''){return String(v).toLowerCase().replace(/^https?:\/\//,'').replace(/[?#].*$/,'').replace(/\/$/,'').slice(0,500);}
async function openaiCollect(region='dallas'){
  if(!process.env.OPENAI_API_KEY)throw new Error('OPENAI_API_KEY가 설정되지 않았습니다.');
  const now=new Date();const since=new Date(now.getTime()-30*60*60*1000).toISOString();
  const prompt=`You are the newsroom collection engine for a Korean-language local information app serving Dallas-Fort Worth.
Current UTC time: ${now.toISOString()}. Search for meaningful items published or materially updated since ${since}.
Prioritize FIRST-PARTY OFFICIAL sources only:
- City of Dallas official news and press releases
- Dallas County health, safety, emergency and public notices
- DART service alerts, news and rider updates
- TxDOT Dallas District construction, closures and traffic notices
- official city notices from Plano, Carrollton, Frisco, Allen, McKinney, Richardson, Irving, Garland, Coppell, Lewisville and Little Elm
- official police and fire department notices
- official school district notices including Plano ISD, Frisco ISD, Dallas ISD, Allen ISD, Carrollton-Farmers Branch ISD and Lewisville ISD
- National Weather Service Fort Worth for weather warnings
- official event and community information pages
Use reputable local media only when an important event has no adequate official source. Do not collect generic promotions, evergreen pages, old articles, sports recaps, politics without local service impact, or duplicates.
Return 2 to 12 high-value items. Each item must have a working source URL and must be rewritten, not copied.
For each item classify suggested_destination as exactly one of: life, notice, guide, urgent, exclude.
- life: current local news and public information
- notice: events with a start date, time or registration
- guide: durable procedural information or a rule change that should update a guide
- urgent: active severe weather, school closure, major road closure, public safety or emergency
- exclude: low relevance, advertising, duplicate or unverifiable
Also infer Korean article title, 2-3 sentence summary, concise original article body in Korean, confidence 0-100, fact_status official_verified or needs_review, area, category_keywords for related local businesses, and event_data.
Never present AI relevance as a consumer rating. Do not quote long passages. Preserve exact dates, times, road names and agency names.
Return ONLY valid JSON in this shape:
{"items":[{"original_title":"","original_summary":"","original_url":"https://...","source_name":"","source_kind":"official","source_published_at":"ISO or null","area":"","suggested_destination":"life","confidence":90,"fact_status":"official_verified","ai_title":"","ai_summary":"","ai_content":"","category_keywords":["에어컨","자동차"],"event_data":{"name":"","start_at":null,"end_at":null,"venue":"","address":"","cost":"","organizer":"","registration_url":""}}]}`;
  const res=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.NEWSROOM_OPENAI_MODEL||'gpt-5-mini',tools:[{type:'web_search_preview'}],input:prompt,temperature:0.2})});
  const json=await res.json();if(!res.ok)throw new Error(json?.error?.message||`OpenAI 오류 ${res.status}`);return parseJsonText(textFromResponse(json));
}
async function existingUrls(region){
  const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw new Error('Supabase 서비스 환경변수가 없습니다.');
  const endpoint=`${url.replace(/\/$/,'')}/rest/v1/newsroom_items?select=original_url&region=eq.${encodeURIComponent(region)}&limit=1000`;
  const res=await fetch(endpoint,{headers:{apikey:key,Authorization:`Bearer ${key}`}});if(!res.ok){const t=await res.text();throw new Error(`newsroom_items 조회 실패: ${t}`);}return new Set((await res.json()).map(x=>slug(x.original_url)));
}
async function insertRows(rows){
  if(!rows.length)return [];
  const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res=await fetch(`${url.replace(/\/$/,'')}/rest/v1/newsroom_items`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Prefer:'return=representation,resolution=ignore-duplicates'},body:JSON.stringify(rows)});
  if(!res.ok){const t=await res.text();throw new Error(`뉴스룸 저장 실패: ${t}`);}return await res.json();
}
exports.handler=async(event)=>{
  if(event.httpMethod==='OPTIONS')return out(200,{ok:true});
  try{
    const body=event.body?JSON.parse(event.body):{};const region=String(body.region||'dallas').toLowerCase();
    const result=await openaiCollect(region);const items=Array.isArray(result.items)?result.items:[];const seen=await existingUrls(region);let skipped=0;
    const rows=[];
    for(const x of items){if(!x?.original_url||!x?.original_title){skipped++;continue;}const key=slug(x.original_url);if(seen.has(key)){skipped++;continue;}seen.add(key);
      const destination=['life','notice','guide','urgent','exclude'].includes(x.suggested_destination)?x.suggested_destination:'life';
      rows.push({region,original_title:String(x.original_title).slice(0,500),original_summary:x.original_summary||null,original_url:x.original_url,source_name:x.source_name||null,source_kind:x.source_kind==='media'?'media':'official',source_published_at:x.source_published_at||null,area:x.area||'Dallas-Fort Worth',suggested_destination:destination,destination,status:destination==='exclude'?'excluded':'review',confidence:Math.max(0,Math.min(100,Number(x.confidence)||0)),fact_status:x.fact_status==='official_verified'?'official_verified':'needs_review',duplicate_key:key,ai_title:x.ai_title||x.original_title,ai_summary:x.ai_summary||x.original_summary||'',ai_content:x.ai_content||'',category_keywords:Array.isArray(x.category_keywords)?x.category_keywords.slice(0,12):[],event_data:x.event_data&&typeof x.event_data==='object'?x.event_data:{},collected_at:new Date().toISOString(),updated_at:new Date().toISOString()});
    }
    const inserted=await insertRows(rows);return out(200,{ok:true,found:items.length,inserted:inserted.length,skipped});
  }catch(e){console.error(e);return out(500,{ok:false,error:e.message});}
};
