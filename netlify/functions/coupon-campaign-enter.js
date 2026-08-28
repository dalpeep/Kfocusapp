const {json,rest,emailOk,normalizedEmail,code,sendEmail,getCoupon,getBusiness,couponOpen}=require('./coupon-campaign-lib');

async function patchEntry(id, payload){
  if(!id) return;
  await rest(`coupon_entries?id=eq.${encodeURIComponent(id)}`,{
    method:'PATCH',
    headers:{Prefer:'return=minimal'},
    body:JSON.stringify(payload)
  });
}

async function sendInstantEmail({coupon,bizName,email,couponCode,appUrl}){
  return sendEmail({
    to:email,
    subject:`🎟️ ${coupon.title||'DalTownMap 쿠폰'} 발급 완료`,
    title:coupon.title||'쿠폰 발급 완료',
    bodyLines:[
      `${bizName} 쿠폰이 발급되었습니다.`,
      coupon.discount_label||coupon.description||'쿠폰 혜택을 확인해 주세요.',
      coupon.end_at?`사용 종료: ${new Date(coupon.end_at).toLocaleString('ko-KR',{timeZone:'America/Chicago'})}`:''
    ].filter(Boolean),
    codeLabel:'COUPON CODE',
    codeValue:couponCode,
    buttonUrl:appUrl,
    imageUrl:coupon.email_image_url||coupon.image_url||''
  });
}

async function sendRaffleEmail({coupon,bizName,email,entryCode,appUrl}){
  return sendEmail({
    to:email,
    subject:`🎫 ${coupon.title||'DalTownMap 이벤트'} 응모 완료`,
    title:coupon.title||'이벤트 응모 완료',
    bodyLines:[
      `${bizName} 이벤트 응모가 완료되었습니다.`,
      '당첨자는 추첨 후 별도 이메일로 당첨 쿠폰을 받게 됩니다.',
      coupon.raffle_end_at?`응모 마감: ${new Date(coupon.raffle_end_at).toLocaleString('ko-KR',{timeZone:'America/Chicago'})}`:''
    ].filter(Boolean),
    codeLabel:'ENTRY CODE',
    codeValue:entryCode,
    buttonUrl:appUrl,
    imageUrl:coupon.email_image_url||coupon.image_url||''
  });
}

exports.handler=async(event)=>{
  if(event.httpMethod==='OPTIONS') return json(200,{ok:true});
  if(event.httpMethod!=='POST') return json(405,{ok:false,error:'POST only'});

  try{
    const b=JSON.parse(event.body||'{}');
    const couponId=String(b.coupon_id||'').trim();
    const email=normalizedEmail(b.email);
    const marketing=!!b.marketing_opt_in;

    if(!couponId) return json(400,{ok:false,error:'coupon_id가 필요합니다.'});
    if(!emailOk(email)) return json(400,{ok:false,error:'올바른 이메일 주소를 입력하세요.'});

    const coupon=await getCoupon(couponId);
    if(!coupon) return json(404,{ok:false,error:'쿠폰을 찾을 수 없습니다.'});

    const mode=String(coupon.delivery_mode||'display');
    if(!['instant_email','raffle'].includes(mode)){
      return json(400,{ok:false,error:'이 쿠폰은 이메일 발급/응모형이 아닙니다.'});
    }

    const open=couponOpen(coupon);
    if(!open.ok) return json(409,{ok:false,error:open.reason});

    // 이메일 발송 환경이 없으면 DB 기록을 만들기 전에 즉시 실패시킵니다.
    if(!String(process.env.RESEND_API_KEY||'').trim()){
      return json(503,{
        ok:false,
        code:'EMAIL_CONFIG_MISSING',
        error:'이메일 발송 설정이 아직 준비되지 않았습니다. 관리자에게 문의해 주세요.'
      });
    }

    const biz=await getBusiness(coupon.business_id);
    const bizName=biz?.name_ko||biz?.name||biz?.name_en||'참여 업소';
    const appUrl=process.env.APP_PUBLIC_URL||'https://daltownmap.com';
    const now=new Date().toISOString();

    const existed=await rest(
      `coupon_entries?select=*&coupon_id=eq.${encodeURIComponent(couponId)}&email_normalized=eq.${encodeURIComponent(email)}&limit=1`
    );

    if(Array.isArray(existed) && existed[0]){
      const r=existed[0];

      // V250: 이전 시도에서 DB row만 만들어지고 이메일 발송이 실패한 경우
      // "이미 응모함"으로 끝내지 않고 같은 코드로 이메일을 재발송합니다.
      if(!r.emailed_at){
        if(mode==='instant_email'){
          const couponCode=r.coupon_code||code('DAL',8);
          if(!r.coupon_code) await patchEntry(r.id,{coupon_code:couponCode,updated_at:now});
          const emailResult=await sendInstantEmail({coupon,bizName,email,couponCode,appUrl});
          console.log('[V251 campaign email recovery accepted]',{mode,email,resend_id:emailResult?.id||''});
          await patchEntry(r.id,{emailed_at:new Date().toISOString(),updated_at:new Date().toISOString()});
          return json(200,{
            ok:true,
            existing:true,
            recovered:true,
            mode,
            status:r.status||'coupon_issued',
            coupon_code:couponCode,
            message:'이전 발급 기록의 이메일 발송을 완료했습니다.'
          });
        }

        const entryCode=r.entry_code||code('ENTRY',8);
        if(!r.entry_code) await patchEntry(r.id,{entry_code:entryCode,updated_at:now});
        try{
          const emailResult=await sendRaffleEmail({coupon,bizName,email,entryCode,appUrl});
          console.log('[V253 campaign email recovery accepted]',{mode,email,resend_id:emailResult?.id||''});
          await patchEntry(r.id,{emailed_at:new Date().toISOString(),updated_at:new Date().toISOString()});
          return json(200,{
            ok:true,
            existing:true,
            recovered:true,
            mode,
            status:r.status||'entered',
            entry_code:entryCode,
            email_sent:true,
            message:'기존 응모 기록의 확인 이메일 발송 요청이 접수되었습니다.'
          });
        }catch(mailErr){
          console.error('[V253 recovery confirmation failed]',mailErr);
          return json(200,{
            ok:true,
            existing:true,
            recovered:false,
            mode,
            status:r.status||'entered',
            entry_code:entryCode,
            email_sent:false,
            warning:mailErr?.message||String(mailErr),
            message:'응모 기록은 정상입니다. 확인 이메일은 아직 발송되지 않았습니다.'
          });
        }
      }

      return json(200,{
        ok:true,
        existing:true,
        mode,
        status:r.status,
        entry_code:r.entry_code||'',
        coupon_code:r.coupon_code||'',
        message:mode==='instant_email'
          ?'이미 발급된 쿠폰입니다.'
          :'이미 응모한 이메일입니다.'
      });
    }

    if(mode==='instant_email'){
      const couponCode=code('DAL',8);

      // 이메일을 먼저 보내고, 성공한 경우에만 신규 발급 기록을 저장합니다.
      const emailResult=await sendInstantEmail({coupon,bizName,email,couponCode,appUrl});
      console.log('[V251 campaign email accepted]',{mode,email,resend_id:emailResult?.id||''});

      const payload={
        coupon_id:couponId,
        business_id:String(coupon.business_id||''),
        email,
        email_normalized:email,
        coupon_code:couponCode,
        status:'coupon_issued',
        marketing_opt_in:marketing,
        source:String(b.source||'app'),
        issued_at:now,
        emailed_at:now,
        created_at:now,
        updated_at:now
      };

      await rest('coupon_entries',{
        method:'POST',
        headers:{Prefer:'return=representation'},
        body:JSON.stringify(payload)
      });

      return json(200,{
        ok:true,
        mode,
        status:'coupon_issued',
        coupon_code:couponCode,
        email_request_id:emailResult?.id||'',
        message:'쿠폰 이메일 발송 요청이 접수되었습니다.'
      });
    }

    const entryCode=code('ENTRY',8);

    // V253: 응모 기록은 먼저 안전하게 저장하고, 확인 메일은 즉시 시도합니다.
    // 메일 서비스 장애가 있어도 응모 자체가 사라지지 않습니다.
    const payload={
      coupon_id:couponId,
      business_id:String(coupon.business_id||''),
      email,
      email_normalized:email,
      entry_code:entryCode,
      status:'entered',
      marketing_opt_in:marketing,
      source:String(b.source||'app'),
      emailed_at:null,
      created_at:now,
      updated_at:now
    };

    const inserted=await rest('coupon_entries',{
      method:'POST',
      headers:{Prefer:'return=representation'},
      body:JSON.stringify(payload)
    });
    const entryId=Array.isArray(inserted)?inserted[0]?.id:null;

    try{
      const emailResult=await sendRaffleEmail({coupon,bizName,email,entryCode,appUrl});
      console.log('[V253 raffle confirmation accepted]',{email,resend_id:emailResult?.id||''});
      if(entryId){
        await patchEntry(entryId,{
          emailed_at:new Date().toISOString(),
          updated_at:new Date().toISOString()
        });
      }
      return json(200,{
        ok:true,
        mode,
        status:'entered',
        entry_code:entryCode,
        email_sent:true,
        email_request_id:emailResult?.id||'',
        message:'응모가 완료되었습니다. 응모 확인 이메일 발송 요청도 접수되었습니다.'
      });
    }catch(mailErr){
      console.error('[V253 raffle confirmation failed]',mailErr);
      return json(200,{
        ok:true,
        mode,
        status:'entered',
        entry_code:entryCode,
        email_sent:false,
        warning:mailErr?.message||String(mailErr),
        message:'응모는 정상적으로 완료되었습니다. 다만 확인 이메일 발송에 실패했습니다. 관리자에서 재발송할 수 있습니다.'
      });
    }

  }catch(e){
    console.error('[coupon-campaign-enter]',e);
    return json(500,{ok:false,error:e.message||String(e)});
  }
};
