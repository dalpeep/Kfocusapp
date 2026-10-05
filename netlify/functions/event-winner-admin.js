const {json,rest,sendEmail,getCoupon,verifyAdmin}=require('./coupon-campaign-lib');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EVENT_MESSAGE='달타운맵 이벤트에 당첨되신 것을 축하드립니다. 경품으로 Starbucks eGift Card가 별도의 이메일로 발송될 예정입니다. Starbucks에서 발송되는 이메일도 확인해 주세요.';
const eventIdOf=b=>String(b.event_id||'').trim();
const okId=id=>UUID.test(id);
const rpc=(name,args)=>rest('rpc/'+name,{method:'POST',body:JSON.stringify(args)});
const byId=(table,id)=>rest(`${table}?id=eq.${encodeURIComponent(id)}&limit=1`);
const one=x=>Array.isArray(x)?x[0]||null:x;
const safeError=e=>e?.status===409?'발송 요청이 진행 중입니다. 상태를 새로고침해 주세요.':
  '요청을 완료하지 못했습니다. 상태를 확인한 뒤 다시 시도해 주세요.';

exports.handler=async event=>{
  if(event.httpMethod==='OPTIONS')return json(200,{ok:true});
  if(event.httpMethod!=='POST')return json(405,{ok:false,error:'POST only'});
  let admin;
  try{admin=await verifyAdmin(event)}
  catch{return json(403,{ok:false,error:'관리자 인증이 필요합니다.'})}
  let b;
  try{b=JSON.parse(event.body||'{}')}
  catch{return json(400,{ok:false,error:'Invalid JSON'})}
  const action=String(b.action||'list');
  const eventId=eventIdOf(b);
  if(!okId(eventId))return json(400,{ok:false,error:'이벤트 ID가 올바르지 않습니다.'});
  try{
    const campaign=await getCoupon(eventId);
    if(!campaign||campaign.delivery_mode!=='raffle')
      return json(404,{ok:false,error:'추첨 이벤트를 찾을 수 없습니다.'});
    if(action==='list'){
      const [entries,winners,batches,attempts]=await Promise.all([
        rest(`coupon_entries?select=id,email,status,entry_code,created_at&coupon_id=eq.${eventId}&order=created_at.desc&limit=2000`),
        rest(`event_draw_winners?select=*&event_id=eq.${eventId}&order=drawn_at.asc`),
        rest(`event_draw_batches?select=*&event_id=eq.${eventId}&order=drawn_at.asc`),
        rest('event_winner_email_attempts?select=id,winner_id,kind,status,created_at,completed_at,failure_code&order=created_at.desc&limit=2000')
      ]);
      const winnerIds=new Set((winners||[]).map(w=>w.id));
      return json(200,{ok:true,event:{id:campaign.id,title:campaign.title,raffle_draw_mode:campaign.raffle_draw_mode},
        entries,winners,batches,
        attempts:(attempts||[]).filter(a=>winnerIds.has(a.winner_id)),
        stats:{total:(entries||[]).length,eligible:(entries||[]).filter(e=>e.status==='entered'&&e.entry_code).length,
          winners:(winners||[]).filter(w=>w.status==='winner').length,
          winner_emails_sent:(winners||[]).filter(w=>w.status==='winner'&&w.winner_email_status==='sent').length,
          egifts_sent:(winners||[]).filter(w=>w.status==='winner'&&w.gift_card_status==='sent').length}});
    }
    if(action==='draw'||action==='redraw'){
      const count=action==='redraw'?1:Number(b.count);
      if(!Number.isInteger(count)||count<1||count>500)
        return json(400,{ok:false,error:'당첨 인원을 1~500명으로 입력해 주세요.'});
      const result=one(await rpc('event_draw_run',{p_event_id:eventId,p_count:count,
        p_admin_id:admin.user.id,p_kind:action==='redraw'?'redraw':'initial'}));
      return json(200,{ok:true,draw:result});
    }
    const winnerId=String(b.winner_id||'').trim();
    if(!okId(winnerId))return json(400,{ok:false,error:'당첨자 ID가 올바르지 않습니다.'});
    const winner=one(await byId('event_draw_winners',winnerId));
    if(!winner||winner.event_id!==eventId)
      return json(404,{ok:false,error:'해당 이벤트의 당첨자를 찾을 수 없습니다.'});
    if(action==='cancel'){
      await rpc('event_winner_cancel',{p_winner_id:winnerId,p_admin_id:admin.user.id,
        p_reason:String(b.reason||'').trim().slice(0,500)});
      return json(200,{ok:true});
    }
    if(action==='mark_gift_sent'){
      await rpc('event_winner_mark_gift_sent',{p_winner_id:winnerId,p_admin_id:admin.user.id});
      return json(200,{ok:true});
    }
    if(action==='send_winner_email'||action==='resend_winner_email'){
      const entry=one(await rest(`coupon_entries?select=id,email,coupon_id&id=eq.${winner.entry_id}&limit=1`));
      if(!entry||entry.coupon_id!==eventId)return json(409,{ok:false,error:'응모 정보를 확인할 수 없습니다.'});
      const kind=action==='resend_winner_email'?'resend':'initial';
      const attemptId=await rpc('event_winner_email_begin',{p_winner_id:winnerId,
        p_admin_id:admin.user.id,p_kind:kind});
      try{
        const result=await sendEmail({to:entry.email,
          subject:'축하합니다! 달타운맵 이벤트에 당첨되셨습니다 🎉',
          title:'달타운맵 이벤트 당첨 안내',
          bodyLines:[campaign.title||'달타운맵 이벤트',EVENT_MESSAGE],
          buttonUrl:process.env.APP_PUBLIC_URL||'https://daltownmap.com',
          idempotencyKey:`daltown-event-winner-${attemptId}`});
        await rpc('event_winner_email_finish',{p_attempt_id:attemptId,
          p_status:'accepted',p_provider_id:String(result?.id||''),p_failure_code:null});
        return json(200,{ok:true,status:'sent'});
      }catch(e){
        // A network timeout or 5xx may mean the provider accepted the email.
        // Never blindly send a second email while delivery is uncertain.
        const knownRejected=Number(e?.status)>=400&&Number(e?.status)<500&&Number(e?.status)!==409;
        await rpc('event_winner_email_finish',{p_attempt_id:attemptId,
          p_status:knownRejected?'failed':'unknown',p_provider_id:null,
          p_failure_code:knownRejected?`resend_http_${e.status}`:null});
        return json(knownRejected?502:409,{ok:false,
          error:knownRejected?'당첨 안내메일이 거절되었습니다. 관리자 상태를 확인해 주세요.':
            '이메일 접수 결과가 불확실합니다. 공급자 기록을 확인하기 전 재발송하지 마세요.'});
      }
    }
    return json(400,{ok:false,error:'지원하지 않는 action입니다.'});
  }catch(e){
    // Never log recipient addresses, provider response bodies, or credentials.
    console.error('[event-winner-admin]',action,e?.code||'request_failed');
    return json(409,{ok:false,error:safeError(e)});
  }
};
