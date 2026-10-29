'use strict';
// V2 dispatch only. Legacy handlers remain byte-for-byte unchanged.
const {requireOwnerUuidEnvironment}=require('./owner-uuid-environment');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const reply=(statusCode,body)=>({statusCode,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},body:JSON.stringify(body)});
function client(){return require('@supabase/supabase-js').createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});}
function makeDispatch(kind,legacy,{getClient=client,enabled=()=>{requireOwnerUuidEnvironment();return process.env.OWNER_COUPON_V2_ENABLED==='true';}}={}){
 return async event=>{
  if(kind==='enter'&&event.httpMethod==='GET'&&event.queryStringParameters?.protocol_probe==='1'){
   const id=event.queryStringParameters.coupon_id;if(!UUID.test(id||''))return reply(400,{ok:false,error:'COUPON_ID_REQUIRED'});
   try{const found=await getClient().from('coupons').select('owner_coupon_protocol').eq('id',id).maybeSingle();
    if(found.error&&found.error.code!=='42703')throw Error('PROTOCOL_LOOKUP_FAILED');
    return reply(200,{ok:true,protocol:!found.error&&found.data?.owner_coupon_protocol==='v2'?'v2':'legacy'});
   }catch{return reply(503,{ok:false,error:'V2_UNAVAILABLE'});}
  }
  if(event.httpMethod!=='POST')return legacy(event);
  let body;try{body=JSON.parse(event.body||'{}');}catch{return legacy(event);}
  if(kind==='admin'&&body.action==='list_all'){
   // Legacy global lists must not disclose the separate Owner V2 ledger.
   const response=await legacy(event);if(response.statusCode!==200)return response;
   try{
    const out=JSON.parse(response.body);if(!Array.isArray(out.entries))throw Error('LEGACY_RESPONSE_INVALID');
    const ids=[...new Set(out.entries.map(x=>String(x.coupon_id).toLowerCase()).filter(x=>UUID.test(x)))],privateIds=new Set();
    // Bound each lookup to the returned list, rather than relying on the REST
    // server's default page size for the site's entire V2 coupon inventory.
    for(let offset=0;offset<ids.length;offset+=100){
     const v2=await getClient().from('coupons').select('id').in('id',ids.slice(offset,offset+100)).eq('owner_coupon_protocol','v2');
     if(v2.error){if(v2.error.code==='42703')return response;throw Error('PROTOCOL_LOOKUP_FAILED');}
     for(const row of v2.data||[])privateIds.add(String(row.id).toLowerCase());
    }
    return {...response,body:JSON.stringify({...out,entries:out.entries.filter(x=>!privateIds.has(String(x.coupon_id).toLowerCase()))})};
   }catch{return reply(503,{ok:false,error:'V2_UNAVAILABLE'});}
  }
  // Existing clients send coupon_id. Explicit protocol prevents an ambiguous
  // no-id admin request from falling through into a privileged Legacy action.
  const explicit=body.protocol==='v2';
  if(!UUID.test(body.coupon_id||''))return explicit?reply(400,{ok:false,error:'COUPON_ID_REQUIRED'}):legacy(event);
  try{
   const db=getClient();
   const found=await db.from('coupons').select('owner_coupon_protocol,business_id').eq('id',body.coupon_id).maybeSingle();
   if(found.error){if(found.error.code==='42703'&&!explicit)return legacy(event);throw Error('PROTOCOL_LOOKUP_FAILED');}
   if(found.data?.owner_coupon_protocol!=='v2')return explicit?reply(403,{ok:false,error:'V2_REQUIRED'}):legacy(event);
   if(!enabled())return reply(503,{ok:false,error:'OWNER_COUPON_V2_DISABLED'});
   const canary=require('./owner-canary');if(!canary.businessAllowed(found.data.business_id))return reply(403,{ok:false,error:'CANARY_BUSINESS_REQUIRED'});
   // No raffle action can enter this path, irrespective of subscription tier.
   const allowed=kind==='enter'?['reserve']:kind==='notify'?['notify']:['list','redeem'];
   const action=kind==='enter'?'reserve':kind==='notify'?'notify':body.action;
   if(!allowed.includes(action))return reply(403,{ok:false,error:'V2_ACTION_DENIED'});
   let actor=null;
   if(kind!=='enter'){
    const auth=Object.entries(event.headers||{}).find(([k])=>k.toLowerCase()==='authorization')?.[1];
    const token=/^Bearer ([^\s]+)$/.exec(auth||'')?.[1];
    if(!token)return reply(401,{ok:false,error:'AUTH_REQUIRED'});
    const verified=await db.auth.getUser(token);
    if(verified.error||!verified.data?.user?.email_confirmed_at)return reply(401,{ok:false,error:'AUTH_REQUIRED'});
    actor=verified.data.user.id;if(!canary.actorAllowed(actor))return reply(403,{ok:false,error:'CANARY_ACTOR_REQUIRED'});
   }
   const command={action,coupon_id:body.coupon_id};
   if(action==='reserve'){
    if(typeof body.email!=='string'||body.email.length>254||!/^\S+@\S+\.\S+$/.test(body.email))return reply(400,{ok:false,error:'EMAIL_REQUIRED'});
    if(!UUID.test(body.request_key||''))return reply(400,{ok:false,error:'REQUEST_KEY_REQUIRED'});
    if(!canary.recipientAllowed(body.email))return reply(403,{ok:false,error:'CANARY_RECIPIENT_REQUIRED'});
    Object.assign(command,{email:body.email.trim().toLowerCase(),key:body.request_key});
   }
   if(action==='redeem'){
    if(!UUID.test(body.entry_id||'')||!UUID.test(body.request_key||''))return reply(400,{ok:false,error:'REQUEST_KEY_REQUIRED'});
    Object.assign(command,{entry_id:body.entry_id,key:body.request_key});
   }
   if(action==='notify'){
    if(!UUID.test(body.use_id||''))return reply(400,{ok:false,error:'USE_RECORD_REQUIRED'});
    const queued=await db.rpc('owner_notification_use_status',{p_actor:actor,p_coupon:body.coupon_id,p_use:body.use_id});
    if(queued.error)return reply(queued.error.code==='OP403'?403:503,{ok:false,error:queued.error.code==='OP403'?'OP403':'NOTIFICATION_QUEUE_UNAVAILABLE'});
    return reply(200,{ok:true,protocol:'v2',...queued.data});
   }
   const result=await db.rpc('owner_coupon_v2_command',{p_actor:actor,p_command:command});
   if(result.error){const code=result.error.code;return reply(code==='OP403'?403:code==='OP409'?409:code==='OP400'?400:503,{ok:false,error:['OP403','OP409','OP400'].includes(code)?code:'V2_UNAVAILABLE'});}
   return reply(200,{ok:true,protocol:'v2',...result.data});
  }catch{return reply(503,{ok:false,error:'V2_UNAVAILABLE'});}
 };
}
module.exports={makeDispatch};
