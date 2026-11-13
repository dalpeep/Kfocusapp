const labels = {pending:'신규 예약 신청',confirmed:'예약 확정',rejected:'예약 거절',cancelled:'예약 취소'};

export function reservationMailConfig(env) {
  const key=env.get('RESERVATION_RESEND_API_KEY');
  const from=env.get('RESEND_FROM_EMAIL')?.trim();
  return key&&from&&!/@resend\.dev\b/i.test(from)?{key,from}:null;
}

export async function deliverReservationMail(project, service, key, from, reservation, request=fetch) {
  const rpc = async (name, args) => {
    const response = await request(project+'/rest/v1/rpc/'+name,{
      method:'POST', redirect:'error', signal:AbortSignal.timeout(6000),
      headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'},
      body:JSON.stringify(args)
    });
    if(!response.ok)throw Error('RESERVATION_MAIL_RPC');
    return response;
  };
  const claimed = await rpc('claim_reservation_mail_v1',{
    p_reservation:reservation.id||null,p_number:reservation.number||null
  });
  for(const row of await claimed.json()){
    let delivery='failed';
    try{
      if(!/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(row.recipient||'')){
        delivery='skipped';
      }else{
        const when=new Intl.DateTimeFormat('ko-KR',{
          dateStyle:'full',timeStyle:'short',timeZone:row.zone
        }).format(new Date(row.starts_at));
        const url=row.audience==='owner'?'https://daltownmap.com/owner-uuid/':
          'https://daltownmap.com/business/'+encodeURIComponent(row.business)+
          (/^[A-F0-9]{20}$/.test(row.booking_number||'')?'#reservation='+row.booking_number:'');
        const label=row.event==='pending'&&row.audience==='customer'?'예약 신청 접수 · 업주 승인 대기':labels[row.event];
        const response=await request('https://api.resend.com/emails',{
          method:'POST',redirect:'error',signal:AbortSignal.timeout(6000),
          headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','Idempotency-Key':'reservation/'+row.id},
          body:JSON.stringify({from,to:[row.recipient],subject:'달타운맵 '+label,
            text:[label,when+' (업소 현지 시간)','예약 확인: '+url,
              row.booking_number?'조회 시 예약 PIN 또는 기존 비밀번호가 필요합니다.':''].filter(Boolean).join('\n')})
        });
        delivery=response.ok?'sent':'failed';
        await response.body?.cancel();
      }
    }catch{
      console.warn('RESERVATION_MAIL_DELIVERY_FAILED');
    }
    try{await rpc('finish_reservation_mail_v1',{p_id:row.id,p_delivery:delivery});}
    catch{console.warn('RESERVATION_MAIL_RESULT_FAILED');}
  }
}

export function scheduleReservationMail(project,service,reservation) {
  if(Deno.env.get('RESERVATION_EMAIL_ENABLED')!=='true')return;
  const config=reservationMailConfig(Deno.env);
  if(!(reservation?.id||reservation?.number)||!service||!config)return;
  EdgeRuntime.waitUntil(deliverReservationMail(project,service,config.key,config.from,reservation)
    .catch(()=>console.warn('RESERVATION_MAIL_QUEUE_FAILED')));
}
