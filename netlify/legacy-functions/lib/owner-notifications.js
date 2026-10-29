'use strict';
const {requireOwnerUuidEnvironment}=require('./owner-uuid-environment');
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const list=v=>[...new Set(String(v||'').split(',').map(x=>x.trim()).filter(Boolean))];
function settings(env){
 if(env.OWNER_NOTIFICATION_WORKER_ENABLED!=='true')return null;
 requireOwnerUuidEnvironment(env);
 const mode=env.OWNER_NOTIFICATION_MODE,businesses=list(env.OWNER_NOTIFICATION_BUSINESSES),actors=list(env.OWNER_NOTIFICATION_ACTORS),recipients=list(env.OWNER_NOTIFICATION_RECIPIENTS).map(x=>x.toLowerCase());
 if(!['mock','resend_test'].includes(mode)||!businesses.length||!actors.length||!recipients.length||[...businesses,...actors].some(x=>!UUID.test(x))||recipients.some(x=>!/^\S+@\S+\.\S+$/.test(x)))throw Error('NOTIFICATION_CANARY_CONFIG');
 if(mode==='resend_test'&&(!env.RESEND_API_KEY||!/^.+@[^\s]+$/.test(env.RESEND_FROM_EMAIL||'')||/@resend\.dev$/i.test(env.RESEND_FROM_EMAIL)))throw Error('NOTIFICATION_PROVIDER_CONFIG');
 return {mode,businesses,actors,recipients};
}
function resendTransport({env=process.env,fetcher=fetch,recipients=[]}={}){
 return async(message,key)=>{
  if(!recipients.includes(String(message.to).toLowerCase()))throw Error('RECIPIENT_DENIED');
  if(!env.RESEND_API_KEY||!env.RESEND_FROM_EMAIL||!/^owner-notify\/[a-f0-9-]{36}$/.test(key))throw Error('PROVIDER_CONFIG');
  const response=await fetcher('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(5000),headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify({from:env.RESEND_FROM_EMAIL,to:[message.to],subject:message.subject,text:message.text})});
  if(!response.ok)throw Error(response.status===429?'PROVIDER_RATE_LIMIT':response.status>=500?'PROVIDER_TEMPORARY':'PROVIDER_REJECTED');
  // Provider acceptance is not an inbox-delivery claim. Never log its raw body.
  return {accepted:true};
 };
}
function makeWorker({env=process.env,getClient,config,transport,now=()=>Date.now()}={}){
 return async()=>{
  let cfg;try{cfg=config?config():settings(env);}catch{return {state:'config_blocked',processed:0};}
  if(!cfg)return {state:'disabled',processed:0};
  const db=getClient?getClient():require('@supabase/supabase-js').createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(3000)})}});
  const rpc=async(name,args)=>{try{return await db.rpc(name,args);}catch{return{error:{code:'RPC_UNAVAILABLE'}};}};
  const send=transport||resendTransport({env,recipients:cfg.recipients});const start=now();let processed=0,retry=0,accepted=0,mocked=0;
  // Below the Scheduled Function deadline. One row at a time avoids holding
  // leases for a batch that cannot finish before Netlify terminates the worker.
  while(processed<3&&now()-start<18000){
   const claim=await rpc('owner_notification_claim',{p_businesses:cfg.businesses,p_actors:cfg.actors,p_recipients:cfg.recipients});
   if(claim.error)return {state:'db_unavailable',processed,accepted,mocked,retry};
   const item=claim.data;if(!item?.claimed)break;
   let result='retry',error='TRANSPORT_FAILED';
   try{if(!cfg.recipients.includes(String(item.message?.to).toLowerCase()))throw Error('RECIPIENT_DENIED');if(cfg.mode==='mock'){result='mocked';}else if((await send(item.message,item.idempotency_key))?.accepted===true){result='accepted';}else throw Error('PROVIDER_REJECTED');}catch(e){error=['PROVIDER_REJECTED','RECIPIENT_DENIED'].includes(e.message)?e.message:'TRANSPORT_FAILED';result=error==='TRANSPORT_FAILED'?'retry':'review';}
   const ack=await rpc('owner_notification_finish',{p_id:item.id,p_lease:item.lease,p_result:result,p_error:result==='accepted'||result==='mocked'?null:error});
   processed++;if(ack.error)return {state:'ack_pending',processed,accepted,mocked,retry};
   if(result==='accepted')accepted++;else if(result==='mocked')mocked++;else retry++;
  }
  return {state:'done',processed,accepted,mocked,retry};
 };
}
module.exports={settings,resendTransport,makeWorker};
