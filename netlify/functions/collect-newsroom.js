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
  const prompt=`You are the source collector for DalTownMap, a Korean-language Dallas-Fort Worth daily-life guide. Current UTC time: ${now.toISOString()}.
Search broadly for useful items published or materially updated since ${since}, plus clearly dated upcoming events and promotions within the next 14 days. Keep an item when it could help or interest a Korean resident today or this week, even if it is not major news.

Prioritize Korean-community sources and organizations: KTN, Weekly Focus Dallas (주간포커스 달라스), Korea Daily / 미주중앙일보 Dallas, Dalsaram, Korean Society of Dallas, Korean consular notices, Korean schools, cultural groups, public community events from churches, and Korean grocery stores such as H Mart, Zion Market and Komart.

Also search official or reliable sources for banks and personal finance: Hanmi Bank, Bank of Hope, Open Bank, PCB Bank, CBB Bank, Chase, Bank of America, Wells Fargo, Capital One, local credit unions, SBA, IRS, mortgage rates, CD/savings promotions, remittance and small-business programs. Prefer first-party bank, government or regulator pages for rates, fees, eligibility and deadlines. Do not present financial promotions as recommendations or guaranteed benefits.

Include practical DFW information from cities, counties, DART, TxDOT, police/fire, school districts, NWS Fort Worth, airports, libraries, parks, museums, sports schedules, performing-arts venues, family activities, health events, traffic, road closures, new Korean businesses, grocery sales and useful local promotions. Keep a balanced mix across community, finance, shopping, food, family, education, health, events, weather, traffic, business and public notices.

Exclude expired items, undated evergreen pages presented as new, duplicate URLs, pure opinion, sports recaps, unverifiable claims and promotions without clear terms or dates. Do not write a Korean article yet. Return raw reviewable records only. For events or promotions, include exact dates in the summary.
Return ONLY valid JSON:
{"items":[{"original_title":"","original_summary":"1-3 factual sentences in the source language","original_url":"https://...","source_name":"","source_kind":"official or media","source_published_at":"ISO or null","area":"Dallas-Fort Worth"}]}`;
  const payload={model:process.env.NEWSROOM_OPENAI_MODEL||'gpt-5-mini',tools:[{type:'web_search_preview'}],input:prompt};
  const res=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(payload)});
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
      rows.push({region,original_title:String(x.original_title).slice(0,500),original_summary:x.original_summary||null,original_url:x.original_url,source_name:x.source_name||null,source_kind:x.source_kind==='media'?'media':'official',source_published_at:x.source_published_at||null,area:x.area||'Dallas-Fort Worth',suggested_destination:null,destination:null,status:'collected',confidence:0,fact_status:'needs_review',duplicate_key:key,ai_title:null,ai_summary:null,ai_content:null,category_keywords:[],event_data:{},collected_at:new Date().toISOString(),updated_at:new Date().toISOString()});
    }
    const inserted=await insertRows(rows);return out(200,{ok:true,found:items.length,inserted:inserted.length,skipped});
  }catch(e){console.error(e);return out(500,{ok:false,error:e.message});}
};
