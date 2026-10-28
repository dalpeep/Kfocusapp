const {createHash}=require('node:crypto');
const {rest,sendEmail,getBusiness}=require('../legacy-functions/coupon-campaign-lib');
const rpc=(name,args)=>rest('rpc/'+name,{method:'POST',body:JSON.stringify(args)});
function requestKey(value,prefix='manual'){
 if(typeof value!=='string'||! /^[A-Za-z0-9_-]{8,100}$/.test(value))throw Object.assign(new Error('재시도 식별자가 필요합니다. 화면을 새로고침해 주세요.'),{code:'REQUEST_KEY_REQUIRED'});
 return prefix+'-'+createHash('sha256').update(value).digest('hex');
}
async function draw(couponId,{kind='manual',count=null,ids=null,key}){
 return rpc('coupon_raffle_draw_v1',{p_coupon_id:couponId,p_request_key:key,p_kind:kind,p_count:count,p_entry_ids:ids});
}
async function drain(couponId=null,limit=50){
 let sent=0,uncertain=0;const sentByCoupon={};
 for(let i=0;i<limit;i++){
  const job=await rpc('coupon_raffle_mail_claim_v1',{p_coupon_id:couponId});if(!job)break;
  let attempted=false;
  try{
   const {entry,coupon}=job.payload;
   const biz=await getBusiness(coupon.business_id),bizName=biz?.name_ko||biz?.name||biz?.name_en||'';
   attempted=true;
   const accepted=await sendEmail({to:entry.email,subject:`🎉 당첨! ${coupon.title||'DalTownMap 이벤트'}`,title:'축하합니다! 이벤트에 당첨되었습니다.',bodyLines:[coupon.title||'DalTownMap 이벤트',bizName?`${bizName}에서 사용할 수 있는 당첨 쿠폰입니다.`:'',coupon.discount_label||coupon.description||'당첨 혜택을 확인해 주세요.',coupon.end_at?`사용 종료: ${new Date(coupon.end_at).toLocaleString('ko-KR',{timeZone:'America/Chicago'})}`:''].filter(Boolean),codeLabel:'WINNER COUPON',codeValue:entry.coupon_code,buttonUrl:process.env.APP_PUBLIC_URL||'https://daltownmap.com',imageUrl:coupon.winner_email_image_url||coupon.email_image_url||coupon.image_url||'',idempotencyKey:job.idempotency_key});
   const finished=await rpc('coupon_raffle_mail_finish_v1',{p_id:job.id,p_token:job.token,p_status:'sent',p_provider_id:String(accepted?.id||''),p_failure_code:null});if(!finished)throw Error('ACK_NOT_COMMITTED');sent++;sentByCoupon[job.payload.coupon.id]=(sentByCoupon[job.payload.coupon.id]||0)+1;
  }catch(error){
   const knownRejected=!attempted||(Number(error?.status)>=400&&Number(error?.status)<500&&Number(error?.status)!==409);
   try{await rpc('coupon_raffle_mail_finish_v1',{p_id:job.id,p_token:job.token,p_status:knownRejected?'failed':'unknown',p_provider_id:null,p_failure_code:knownRejected?'DELIVERY_REJECTED':'DELIVERY_UNCERTAIN'});}catch{ /* Lease expiry parks the job as unknown. Never send again here. */ }
   uncertain+=knownRejected?0:1;
  }
 }
 return{sent,uncertain,sentByCoupon};
}
module.exports={rpc,draw,drain,requestKey};
