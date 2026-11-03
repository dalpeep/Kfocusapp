'use strict';
const crypto=require('node:crypto');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COOKIE='dtm_coupon_session';
const reply=(statusCode,body,headers={})=>({statusCode,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers},body:JSON.stringify(body)});
const header=(event,name)=>Object.entries(event.headers||{}).find(([k])=>k.toLowerCase()===name)?.[1]||'';
const fail=(status,code)=>Object.assign(Error(code),{status,code});
function client(){const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_KEY;if(!url||!key)throw fail(503,'COUPON_SERVICE_UNAVAILABLE');return require('@supabase/supabase-js').createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});}
function config(){const key=process.env.COUPON_REDEMPTION_SIGNING_KEY;if(typeof key!=='string'||Buffer.byteLength(key)<32)throw fail(503,'COUPON_SERVICE_UNAVAILABLE');const origins=[process.env.URL,process.env.DEPLOY_PRIME_URL].filter(Boolean).map(v=>new URL(v).origin);if(!origins.length)throw fail(503,'COUPON_SERVICE_UNAVAILABLE');return {key,origins};}
function sign(text,key){return crypto.createHmac('sha256',key).update('coupon-session-v1:'+text).digest('base64url');}
function session(event,key,now){const raw=header(event,'cookie').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);if(!raw)return null;const [id,expires,signature,...extra]=raw.split('.');if(extra.length||!UUID.test(id||'')||!/^\d{10,13}$/.test(expires||''))return null;const expected=sign(id+'.'+expires,key);const a=Buffer.from(signature||''),b=Buffer.from(expected);if(a.length!==b.length||!crypto.timingSafeEqual(a,b)||+expires<=now)return null;return {id,expires,raw};}
function makeDispatch(legacy,{getClient=client,getConfig=config,now=()=>Date.now(),randomUUID=()=>crypto.randomUUID()}={}){
 return async event=>{
  let body;try{body=JSON.parse(event.body||'{}')}catch{body=null;}
  const handshake=event.httpMethod==='GET'&&event.queryStringParameters?.redemption_session==='1';
  if(!handshake&&body?.action!=='redeem_display')return legacy(event);
  try{
   if(event.httpMethod!=='POST'&&!handshake)throw fail(405,'METHOD_NOT_ALLOWED');
   const cfg=getConfig();const origin=header(event,'origin');const site=header(event,'sec-fetch-site');
   if((!handshake&&!cfg.origins.includes(origin))||(handshake&&origin&&!cfg.origins.includes(origin))||site==='cross-site')throw fail(403,'SAME_ORIGIN_REQUIRED');
   let s=session(event,cfg.key,now());
   if(handshake){if(!s){const id=randomUUID(),expires=String(now()+365*86400000);s={raw:id+'.'+expires+'.'+sign(id+'.'+expires,cfg.key)};}return reply(200,{ok:true},{'Set-Cookie':COOKIE+'='+s.raw+'; Path=/.netlify/functions/coupon-campaign-enter; Max-Age=31536000; HttpOnly; Secure; SameSite=Strict'});}
   if(!body||Object.keys(body).some(k=>!['action','coupon_id','request_key'].includes(k))||!UUID.test(body.coupon_id||'')||!UUID.test(body.request_key||''))throw fail(400,'INVALID_REDEMPTION_REQUEST');
   if(!s)throw fail(401,'COUPON_SESSION_REQUIRED');
   const db=getClient(),identity='browser:'+s.id;
   const fingerprint=crypto.createHmac('sha256',cfg.key).update('coupon-identity-v1:'+identity).digest('hex');
   const {data,error}=await db.rpc('security_legacy_display_redeem',{p_coupon:body.coupon_id,p_key:body.request_key,p_identity:fingerprint});
   if(error){const status={SC400:400,SC403:403,SC404:404,SC409:409,SC410:410}[error.code];throw fail(status||503,status?'COUPON_REDEMPTION_REJECTED':'COUPON_SERVICE_UNAVAILABLE');}
   if(!data||!UUID.test(data.redemption_id||'')||!Number.isSafeInteger(data.used_count)||typeof data.already_used!=='boolean')throw fail(503,'COUPON_SERVICE_UNAVAILABLE');
   return reply(200,{ok:true,redemption_id:data.redemption_id,used_count:data.used_count,already_used:data.already_used});
  }catch(e){return reply(e.status||503,{ok:false,error:e.code||'COUPON_SERVICE_UNAVAILABLE'});}
 };
}
module.exports={makeDispatch,session,sign};
