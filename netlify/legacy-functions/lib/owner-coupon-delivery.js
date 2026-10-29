'use strict';
// Provider-neutral, explicit dependency injection. No production provider or
// recipient is enabled by this module. Never log payloads, addresses or codes.
async function deliverUse({db,actor,couponId,useId,transport,allowlist=[]}){
 if(typeof transport!=='function'||!allowlist.length)return {state:'disabled'};
 const call=async action=>db.rpc('owner_coupon_v2_command',{p_actor:actor,p_command:{coupon_id:couponId,use_id:useId,...action}});
 const claim=await call({action:'claim_notification'});
 if(claim.error)return {state:'unavailable'};
 if(!claim.data?.claimed)return {state:'already_claimed'};
 const payload=claim.data.payload;
 const recipients=String(payload.notify_emails||'').split(/[,;\n]/).map(x=>x.trim().toLowerCase()).filter(Boolean);
 const approved=new Set(allowlist.map(x=>String(x).toLowerCase()));
 let accepted=false;
 try{if(!recipients.length||recipients.some(x=>!approved.has(x)))throw Error('RECIPIENT_NOT_APPROVED');const result=await transport({payload:{...payload,notify_emails:recipients},idempotencyKey:claim.data.idempotency_key});accepted=result?.accepted===true;}catch{/* safe durable retry below */}
 const saved=await call({action:'finish_notification',lease:claim.data.lease,accepted});
 return {state:saved.error?'ack_pending':accepted?'accepted':'retry'};
}
async function deliverIssue({db,entryId,transport,allowlist=[]}){
 if(typeof transport!=='function'||!allowlist.length)return {state:'disabled'};
 const call=command=>db.rpc('owner_coupon_campaign',{p_command:{entry_id:entryId,...command}});
 const claim=await call({action:'claim_mail'});if(claim.error)return {state:'unavailable'};if(!claim.data?.claimed)return {state:'already_claimed'};
 let accepted=false;
 try{if(!allowlist.map(x=>x.toLowerCase()).includes(String(claim.data.payload?.to).toLowerCase()))throw Error('RECIPIENT_NOT_APPROVED');accepted=(await transport({payload:claim.data.payload,idempotencyKey:claim.data.idempotency_key}))?.accepted===true;}catch{}
 const saved=await call({action:'finish_mail',lease:claim.data.lease,accepted,error_code:'MAIL_TRANSPORT_ERROR'});
 return {state:saved.error?'ack_pending':accepted?'accepted':'retry'};
}
module.exports={deliverUse,deliverIssue};
