const {json,rest,code,sendEmail,getCoupon,getBusiness,verifyAdmin}=require('./coupon-campaign-lib');
async function rows(couponId){return await rest(`coupon_entries?select=*&coupon_id=eq.${encodeURIComponent(String(couponId))}&order=created_at.desc&limit=2000`)}function shuffle(a){a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}async function issue(row,coupon,bizName){const now=new Date().toISOString();const cc=row.coupon_code||code('WIN',8);await rest(`coupon_entries?id=eq.${encodeURIComponent(row.id)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'winner',coupon_code:cc,won_at:now,issued_at:now,updated_at:now})});await sendEmail({to:row.email,subject:`🎉 당첨! ${coupon.title||'DalTownMap 이벤트'}`,title:'축하합니다! 이벤트에 당첨되었습니다.',bodyLines:[coupon.title||'DalTownMap 이벤트',bizName?`${bizName}에서 사용할 수 있는 당첨 쿠폰입니다.`:'',coupon.discount_label||coupon.description||'당첨 혜택을 확인해 주세요.',coupon.end_at?`사용 종료: ${new Date(coupon.end_at).toLocaleString('ko-KR',{timeZone:'America/Chicago'})}`:''].filter(Boolean),codeLabel:'WINNER COUPON',codeValue:cc,buttonUrl:process.env.APP_PUBLIC_URL||'https://daltownmap.com',imageUrl:coupon.winner_email_image_url||coupon.email_image_url||coupon.image_url||''});await rest(`coupon_entries?id=eq.${encodeURIComponent(row.id)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({emailed_at:new Date().toISOString(),updated_at:new Date().toISOString()})});return{...row,status:'winner',coupon_code:cc}}
exports.handler=async(event)=>{if(event.httpMethod==='OPTIONS')return json(200,{ok:true});if(event.httpMethod!=='POST')return json(405,{ok:false,error:'POST only'});try{await verifyAdmin(event);const b=JSON.parse(event.body||'{}');const action=String(b.action||'list');

if(action==='list_all'){
  const entries=await rest('coupon_entries?select=*&order=created_at.desc&limit=2000');
  return json(200,{ok:true,entries:Array.isArray(entries)?entries:[]});
}

const couponId=String(b.coupon_id||'').trim();if(!couponId)return json(400,{ok:false,error:'coupon_id가 필요합니다.'});const coupon=await getCoupon(couponId);if(!coupon)return json(404,{ok:false,error:'쿠폰을 찾을 수 없습니다.'});const biz=await getBusiness(coupon.business_id);const bizName=biz?.name_ko||biz?.name||biz?.name_en||'';if(action==='list'){const r=await rows(couponId);return json(200,{ok:true,coupon,stats:{total:r.length,entered:r.filter(x=>x.status==='entered').length,winners:r.filter(x=>['winner','coupon_issued','redeemed'].includes(x.status)).length,redeemed:r.filter(x=>x.status==='redeemed').length,marketing_opt_in:r.filter(x=>x.marketing_opt_in===true).length},entries:r})}if(action==='draw'){
  if(String(coupon.delivery_mode||'')!=='raffle')return json(400,{ok:false,error:'추첨형 쿠폰이 아닙니다.'});
  const r=await rows(couponId);
  const target=Math.max(1,Math.min(500,Number(coupon.winner_count||1)));
  const already=r.filter(x=>['winner','redeemed'].includes(String(x.status||''))).length;
  const remaining=Math.max(0,target-already);
  if(remaining<=0)return json(200,{ok:true,selected:0,winners:[],already,target,message:'설정된 당첨 인원이 이미 모두 선정되었습니다.'});
  const eligible=r.filter(x=>x.status==='entered');
  const requestCount=b.count==null?remaining:Math.max(1,Math.min(remaining,Number(b.count||remaining)));
  const sel=shuffle(eligible).slice(0,requestCount);
  const winners=[];
  for(const row of sel){
    try{winners.push(await issue(row,coupon,bizName))}
    catch(e){console.error('[manual raffle issue failed]',row?.id,e)}
  }
  return json(200,{ok:true,selected:winners.length,winners,already,target,remaining_after:Math.max(0,remaining-winners.length)});
}if(action==='designate'){
  const ids=Array.isArray(b.entry_ids)?b.entry_ids.map(String):[];
  if(!ids.length)return json(400,{ok:false,error:'당첨자로 지정할 응모자를 선택하세요.'});
  const r=await rows(couponId);
  const target=Math.max(1,Math.min(500,Number(coupon.winner_count||1)));
  const already=r.filter(x=>['winner','redeemed'].includes(String(x.status||''))).length;
  const remaining=Math.max(0,target-already);
  if(remaining<=0)return json(409,{ok:false,error:'설정된 당첨 인원이 이미 모두 선정되었습니다.'});
  const sel=r.filter(x=>ids.includes(String(x.id))&&x.status==='entered').slice(0,remaining);
  const winners=[];
  for(const row of sel){
    try{winners.push(await issue(row,coupon,bizName))}
    catch(e){console.error('[manual designate failed]',row?.id,e)}
  }
  return json(200,{ok:true,selected:winners.length,winners,already,target,remaining_after:Math.max(0,remaining-winners.length)});
}if(action==='delete_entries'){
  const r=await rows(couponId);
  if(!r.length)return json(200,{ok:true,deleted:0});
  await rest(`coupon_entries?coupon_id=eq.${encodeURIComponent(couponId)}`,{
    method:'DELETE',
    headers:{Prefer:'return=representation'}
  });
  return json(200,{ok:true,deleted:r.length});
}
if(action==='redeem'){
  const id=String(b.entry_id||'').trim();
  if(!id)return json(400,{ok:false,error:'entry_id가 필요합니다.'});
  const r=await rows(couponId);
  const row=r.find(x=>String(x.id)===id);
  if(!row)return json(404,{ok:false,error:'발급/당첨 기록을 찾을 수 없습니다.'});
  if(row.status==='redeemed')return json(200,{ok:true,existing:true,entry:row});
  if(!['coupon_issued','winner'].includes(String(row.status||''))){
    return json(409,{ok:false,error:'발급 완료 또는 당첨 쿠폰만 사용 처리할 수 있습니다.'});
  }

  const now=new Date().toISOString();

  // coupon_redemptions에 최종 사용 기록 저장
  await rest('coupon_redemptions',{
    method:'POST',
    headers:{Prefer:'return=representation'},
    body:JSON.stringify({
      coupon_id:couponId,
      business_id:String(coupon.business_id||''),
      coupon_title:String(coupon.title||''),
      business_name:String(bizName||''),
      notify_emails:String(row.email||''),
      notify_phones:null,
      used_by:'admin_confirm'
    })
  });

  // 이메일 발급/당첨 entry도 redeemed로 변경
  await rest(`coupon_entries?id=eq.${encodeURIComponent(row.id)}`,{
    method:'PATCH',
    headers:{Prefer:'return=minimal'},
    body:JSON.stringify({status:'redeemed',redeemed_at:now,updated_at:now})
  });

  // 쿠폰 used_count 증가
  const current=Number(coupon.used_count||0);
  await rest(`coupons?id=eq.${encodeURIComponent(couponId)}`,{
    method:'PATCH',
    headers:{Prefer:'return=minimal'},
    body:JSON.stringify({used_count:current+1})
  });

  return json(200,{ok:true,existing:false,entry_id:row.id,used_count:current+1});
}if(action==='resend'){const id=String(b.entry_id||'');const r=await rows(couponId);const row=r.find(x=>String(x.id)===id);if(!row)return json(404,{ok:false,error:'응모 기록을 찾을 수 없습니다.'});if(row.status==='entered')await sendEmail({to:row.email,subject:`🎫 ${coupon.title||'이벤트'} 응모 확인`,title:'이벤트 응모 확인',bodyLines:['응모가 정상적으로 접수되어 있습니다.','당첨 시 별도 이메일을 보내드립니다.'],codeLabel:'ENTRY CODE',codeValue:row.entry_code||'',buttonUrl:process.env.APP_PUBLIC_URL||'https://daltownmap.com',imageUrl:coupon.email_image_url||coupon.image_url||''});else await sendEmail({to:row.email,subject:`🎟️ ${coupon.title||'쿠폰'} 재발송`,title:'쿠폰 재발송',bodyLines:[coupon.discount_label||coupon.description||'쿠폰 혜택을 확인해 주세요.'],codeLabel:'COUPON CODE',codeValue:row.coupon_code||'',buttonUrl:process.env.APP_PUBLIC_URL||'https://daltownmap.com',imageUrl:coupon.email_image_url||coupon.image_url||''});await rest(`coupon_entries?id=eq.${encodeURIComponent(row.id)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({emailed_at:new Date().toISOString(),updated_at:new Date().toISOString()})});return json(200,{ok:true})}return json(400,{ok:false,error:'지원하지 않는 action입니다.'})}catch(e){console.error('[coupon-campaign-admin]',e);return json(500,{ok:false,error:e.message||String(e)})}};
