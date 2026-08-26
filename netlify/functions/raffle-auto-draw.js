const {rest,code,sendEmail,getBusiness}=require('./coupon-campaign-lib');

function shuffle(a){
  const x=[...a];
  for(let i=x.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [x[i],x[j]]=[x[j],x[i]];
  }
  return x;
}

async function claimWinner(row,coupon,bizName){
  const now=new Date().toISOString();
  const cc=row.coupon_code||code('WIN',8);

  // 같은 응모자를 수동/자동 추첨이 동시에 잡더라도 entered 상태일 때만 winner로 변경
  const claimed=await rest(
    `coupon_entries?id=eq.${encodeURIComponent(row.id)}&status=eq.entered`,
    {
      method:'PATCH',
      headers:{Prefer:'return=representation'},
      body:JSON.stringify({
        status:'winner',
        coupon_code:cc,
        won_at:now,
        issued_at:now,
        updated_at:now
      })
    }
  );

  if(!Array.isArray(claimed) || !claimed.length) return {claimed:false};

  try{
    const emailResult=await sendEmail({
      to:row.email,
      subject:`🎉 당첨! ${coupon.title||'DalTownMap 이벤트'}`,
      title:'축하합니다! 이벤트에 당첨되었습니다.',
      bodyLines:[
        coupon.title||'DalTownMap 이벤트',
        bizName?`${bizName}에서 사용할 수 있는 당첨 쿠폰입니다.`:'',
        coupon.discount_label||coupon.description||'당첨 혜택을 확인해 주세요.',
        coupon.end_at?`사용 종료: ${new Date(coupon.end_at).toLocaleString('ko-KR',{timeZone:'America/Chicago'})}`:''
      ].filter(Boolean),
      codeLabel:'WINNER COUPON',
      codeValue:cc,
      buttonUrl:process.env.APP_PUBLIC_URL||'https://daltownmap.com',
      imageUrl:coupon.email_image_url||coupon.image_url||''
    });

    await rest(`coupon_entries?id=eq.${encodeURIComponent(row.id)}`,{
      method:'PATCH',
      headers:{Prefer:'return=minimal'},
      body:JSON.stringify({
        emailed_at:new Date().toISOString(),
        updated_at:new Date().toISOString()
      })
    });

    return {claimed:true,emailed:true,resend_id:emailResult?.id||'',email:row.email};
  }catch(e){
    // 당첨자 선정은 유지하고 이메일 미접수로 남겨 관리자에서 재발송 가능
    console.error('[raffle-auto-draw email failed]',row.email,e);
    return {claimed:true,emailed:false,email:row.email,error:e.message||String(e)};
  }
}

exports.handler=async()=>{
  try{
    const now=new Date();
    const nowIso=now.toISOString();

    const coupons=await rest(
      `coupons?select=*&delivery_mode=eq.raffle&is_active=eq.true&raffle_end_at=not.is.null&order=raffle_end_at.asc`
    );

    const due=(Array.isArray(coupons)?coupons:[]).filter(c=>{
      const t=new Date(c.raffle_end_at||0).getTime();
      return Number.isFinite(t) && t<=now.getTime();
    });

    const report=[];

    for(const coupon of due){
      const couponId=String(coupon.id||'');
      if(!couponId) continue;

      const entries=await rest(
        `coupon_entries?select=*&coupon_id=eq.${encodeURIComponent(couponId)}&order=created_at.asc`
      );
      const rows=Array.isArray(entries)?entries:[];

      const target=Math.max(1,Math.min(500,Number(coupon.winner_count||1)));
      const already=rows.filter(x=>['winner','redeemed'].includes(String(x.status||''))).length;
      let remaining=Math.max(0,target-already);

      if(remaining<=0){
        report.push({coupon_id:couponId,title:coupon.title,status:'complete',target,already});
        continue;
      }

      const eligible=shuffle(rows.filter(x=>String(x.status||'')==='entered')).slice(0,remaining);
      const biz=await getBusiness(coupon.business_id);
      const bizName=biz?.name_ko||biz?.name||biz?.name_en||'';

      const results=[];
      for(const row of eligible){
        const r=await claimWinner(row,coupon,bizName);
        results.push(r);
      }

      const selected=results.filter(x=>x.claimed).length;
      const emailed=results.filter(x=>x.claimed&&x.emailed).length;

      report.push({
        coupon_id:couponId,
        title:coupon.title,
        target,
        already,
        selected,
        emailed,
        remaining_after:Math.max(0,remaining-selected),
        checked_at:nowIso
      });
    }

    console.log('[V255 raffle auto draw]',JSON.stringify(report));
    return {
      statusCode:200,
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ok:true,checked:due.length,report})
    };
  }catch(e){
    console.error('[V255 raffle auto draw fatal]',e);
    return {
      statusCode:500,
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ok:false,error:e.message||String(e)})
    };
  }
};
