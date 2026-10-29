'use strict';
const {requireOwnerUuidEnvironment}=require('./owner-uuid-environment');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function makeHandler({getClient}={}){return async event=>{
 const reply=(s,b)=>({statusCode:s,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},body:JSON.stringify(b)});
 if(event.httpMethod!=='POST')return reply(405,{error:'POST 요청만 허용합니다.'});
 try{
  let c;try{if(event.isBase64Encoded||Buffer.byteLength(event.body||'')>3000)throw Error();c=JSON.parse(event.body);}catch{return reply(400,{error:'요청 형식 오류'});}
  const read=c?.action==='plan_read';
  if(read){if(Object.keys(c).some(k=>!['action','business_id'].includes(k))||!UUID.test(c.business_id||''))return reply(400,{error:'업소를 확인해 주세요.'});}
  else if(!c||typeof c!=='object'||Array.isArray(c)||!UUID.test(c.key||'')||typeof c.reason!=='string'||!c.reason.trim()||c.reason.length>1000)return reply(400,{error:'대상과 처리 사유를 확인해 주세요.'});
  const plan=c.action==='plan';
  if(!read&&(plan?(Object.keys(c).some(k=>!['action','key','business_id','tier','enabled','reason'].includes(k))||!UUID.test(c.business_id||'')||!['free','paid'].includes(c.tier)||typeof c.enabled!=='boolean'||(c.tier==='free'&&c.enabled)):(Object.keys(c).some(k=>!['action','key','user_id','reason'].includes(k))||!['disable','enable'].includes(c.action)||!UUID.test(c.user_id||''))))return reply(400,{error:'회원·업소와 등급 설정을 확인해 주세요.'});
  let db;if(getClient)db=getClient();else{requireOwnerUuidEnvironment();db=require('@supabase/supabase-js').createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});}
  const token=Object.entries(event.headers||{}).find(([k])=>k.toLowerCase()==='authorization')?.[1]?.match(/^Bearer ([^\s]+)$/)?.[1];if(!token)return reply(401,{error:'로그인이 필요합니다.'});
  const {data,error}=await db.auth.getUser(token);if(error||!data?.user?.email_confirmed_at)return reply(401,{error:'인증된 로그인이 필요합니다.'});
  const canary=require('./owner-canary');if(!canary.actorAllowed(data.user.id)||!canary.businessAllowed(c.business_id)||(canary.active(process.env)&&!['plan','plan_read'].includes(c.action)))return reply(403,{error:'Canary 업소의 등급 관리만 허용됩니다.'});
  const out=await db.rpc('owner_account_command',{p_actor:data.user.id,p_command:c});if(out.error)return reply(({OP403:403,OP400:400,OP409:409})[out.error.code]||503,{code:'OWNER_ACCOUNT_FORBIDDEN',error:'계정 처리 권한 또는 입력을 확인해 주세요.'});return reply(200,{ok:true,result:out.data});
 }catch{return reply(503,{error:'계정 관리 연결을 확인해 주세요.'});}
};}
module.exports={makeHandler};
