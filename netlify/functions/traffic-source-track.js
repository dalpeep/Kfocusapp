const crypto=require('crypto');

function json(status, body){
  return {statusCode:status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},body:JSON.stringify(body)};
}
function env(){
  const base=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
  const service=String(process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_KEY||'').trim();
  if(!base||!service) throw new Error('Supabase server environment variables are missing.');
  return {base,service};
}
async function rest(path,opt={}){
  const {base,service}=env();
  const r=await fetch(`${base}/rest/v1/${path}`,{...opt,headers:{apikey:service,Authorization:`Bearer ${service}`,'Content-Type':'application/json',...(opt.headers||{})}});
  const t=await r.text();
  if(!r.ok) throw new Error(t||`Supabase HTTP ${r.status}`);
  return t?JSON.parse(t):null;
}
function clean(v,max){return String(v||'').trim().toLowerCase().replace(/[^a-z0-9._-]/g,'-').replace(/-+/g,'-').slice(0,max||80)}
async function verifyAdmin(event){
  const auth=String(event.headers?.authorization||event.headers?.Authorization||'');
  const token=auth.replace(/^Bearer\s+/i,'').trim();
  if(!token) throw new Error('관리자 로그인 토큰이 없습니다.');
  const {base,service}=env();
  const ures=await fetch(`${base}/auth/v1/user`,{headers:{apikey:service,Authorization:`Bearer ${token}`}});
  const user=await ures.json().catch(()=>null);
  if(!ures.ok||!user?.id) throw new Error('관리자 로그인을 확인할 수 없습니다.');
  const rows=await rest(`profiles?select=role&user_id=eq.${encodeURIComponent(user.id)}&limit=1`);
  const p=Array.isArray(rows)?rows[0]:null;
  if(!p||!['super_admin','regional_editor','regional_admin','admin'].includes(String(p.role||''))) throw new Error('관리자 권한이 없습니다.');
  return user;
}
function countBy(rows,key,filter){
  const m=new Map();
  for(const row of rows){
    if(filter&&!filter(row)) continue;
    const v=String(row[key]||'').trim(); if(!v) continue;
    m.set(v,(m.get(v)||0)+1);
  }
  return [...m.entries()].map(([k,count])=>({[key]:k,count})).sort((a,b)=>b.count-a.count);
}
function normalizePrivateKey(value){
  let key=String(value||'').trim();
  try{
    const parsed=JSON.parse(key);
    if(typeof parsed==='string') key=parsed;
    else if(parsed&&typeof parsed.private_key==='string') key=parsed.private_key;
  }catch(_error){
    if((key.startsWith('"')&&key.endsWith('"'))||(key.startsWith("'")&&key.endsWith("'"))) key=key.slice(1,-1);
  }
  key=key.replace(/\\+r\\+n/g,'\n').replace(/\\+n/g,'\n');
  if(!/-----BEGIN (?:RSA )?PRIVATE KEY-----/.test(key)&&/^[A-Za-z0-9+/=\s]+$/.test(key)){
    try{const decoded=Buffer.from(key.replace(/\s/g,''),'base64').toString('utf8');if(/-----BEGIN (?:RSA )?PRIVATE KEY-----/.test(decoded)) key=decoded;}catch(_error){}
  }
  return key.replace(/\r\n/g,'\n').trim();
}
function ga4Env(){
  const propertyId=String(process.env.GA4_PROPERTY_ID||'').replace(/^properties\//,'').trim();
  const clientEmail=String(process.env.GA4_CLIENT_EMAIL||process.env.GOOGLE_CLIENT_EMAIL||'').trim();
  const privateKey=normalizePrivateKey(process.env.GA4_PRIVATE_KEY||process.env.GOOGLE_PRIVATE_KEY||'');
  if(!propertyId||!clientEmail||!privateKey) throw new Error('GA4 Data API 환경변수(GA4_PROPERTY_ID, GA4_CLIENT_EMAIL, GA4_PRIVATE_KEY)가 필요합니다.');
  return {propertyId,clientEmail,privateKey};
}
function base64url(value){return Buffer.from(value).toString('base64url')}
async function ga4AccessToken(){
  const {clientEmail,privateKey}=ga4Env();
  const now=Math.floor(Date.now()/1000);
  const header=base64url(JSON.stringify({alg:'RS256',typ:'JWT'}));
  const claim=base64url(JSON.stringify({iss:clientEmail,scope:'https://www.googleapis.com/auth/analytics.readonly',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600}));
  const unsigned=`${header}.${claim}`;
  const signature=crypto.createSign('RSA-SHA256').update(unsigned).end().sign(privateKey,'base64url');
  const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:`${unsigned}.${signature}`})});
  const body=await response.json().catch(()=>({}));
  if(!response.ok||!body.access_token) throw new Error(body.error_description||body.error||`GA4 인증 실패 (${response.status})`);
  return body.access_token;
}
async function ga4Report(token,body){
  const {propertyId}=ga4Env();
  const response=await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(data?.error?.message||`GA4 보고서 조회 실패 (${response.status})`);
  return data;
}
function metricMap(report,row){const result={};(report.metricHeaders||[]).forEach((header,index)=>{result[header.name]=Number(row?.metricValues?.[index]?.value||0)});return result;}
function rangeDates(raw){if(String(raw).toLowerCase()==='today') return {days:1,startDate:'today',endDate:'today'};const days=[7,30].includes(Number(raw))?Number(raw):30;return {days,startDate:`${days-1}daysAgo`,endDate:'today'};}
function supabaseSinceISOString(raw,now=Date.now()){const {days}=rangeDates(raw);const since=new Date(now-(days-1)*86400000);since.setUTCHours(0,0,0,0);return since.toISOString();}
async function loadGa4Analytics(raw){
  const dateRange=rangeDates(raw);const ga4DateRange={startDate:dateRange.startDate,endDate:dateRange.endDate};const token=await ga4AccessToken();
  const metrics=['totalUsers','sessions','screenPageViews','newUsers'].map(name=>({name}));
  const [summaryReport,trendReport,visitorTypeReport]=await Promise.all([
    ga4Report(token,{dateRanges:[ga4DateRange],metrics}),
    ga4Report(token,{dateRanges:[ga4DateRange],dimensions:[{name:'date'}],metrics,orderBys:[{dimension:{dimensionName:'date'}}],keepEmptyRows:true}),
    ga4Report(token,{dateRanges:[ga4DateRange],dimensions:[{name:'newVsReturning'}],metrics:[{name:'totalUsers'}]})
  ]);
  const summary=metricMap(summaryReport,summaryReport.rows?.[0]);let returningUsers=0;
  for(const row of visitorTypeReport.rows||[]){if(String(row.dimensionValues?.[0]?.value||'').toLowerCase()==='returning') returningUsers=metricMap(visitorTypeReport,row).totalUsers||0;}
  const trend=(trendReport.rows||[]).map(row=>({date:String(row.dimensionValues?.[0]?.value||''),...metricMap(trendReport,row)}));
  return {range:dateRange,summary:{...summary,returningUsers},trend};
}
exports.handler=async(event)=>{
  if(event.httpMethod==='OPTIONS') return json(200,{ok:true});
  try{
    if(event.httpMethod==='POST'){
      const b=JSON.parse(event.body||'{}');
      const source=clean(b.source,40);
      if(!source) return json(400,{ok:false,error:'source가 필요합니다.'});
      const place=clean(b.place,80)||null;
      const campaign=clean(b.campaign,80)||null;
      const path=String(b.path||'/').slice(0,300);
      let referrer=String(b.referrer||'').slice(0,500);
      try{ if(referrer){const u=new URL(referrer); referrer=`${u.origin}${u.pathname}`.slice(0,500);} }catch(_e){referrer='';}
      await rest('traffic_source_visits',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({source,place,campaign,path,referrer:referrer||null})});
      return json(200,{ok:true});
    }
    if(event.httpMethod==='GET'){
      await verifyAdmin(event);
      const raw=String(event.queryStringParameters?.days||'30').toLowerCase();
      const since=supabaseSinceISOString(raw);
      const filter=since?`&created_at=gte.${encodeURIComponent(since)}`:'';
      const rows=await rest(`traffic_source_visits?select=source,place,campaign,created_at${filter}&order=created_at.desc&limit=10000`);
      const arr=Array.isArray(rows)?rows:[];
      let analytics=null,analyticsError='';
      try{ analytics=await loadGa4Analytics(raw); }
      catch(error){analyticsError=error?.message||String(error);console.error('[traffic-source-track] GA4 unavailable; returning Supabase traffic data only',error);}
      return json(200,{ok:true,dataSource:analytics?'ga4':'supabase',analytics,analyticsError,total:arr.length,sources:countBy(arr,'source'),places:countBy(arr,'place',r=>String(r.source||'')==='flyer'),campaigns:countBy(arr,'campaign')});
    }
    return json(405,{ok:false,error:'GET/POST only'});
  }catch(e){
    console.error('[traffic-source-track]',e);
    return json(500,{ok:false,error:e.message||String(e)});
  }
};

exports._test={rangeDates,metricMap,normalizePrivateKey,supabaseSinceISOString};
