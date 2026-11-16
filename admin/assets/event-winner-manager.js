const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'
})[char]);
const emailLabel=status=>({
  not_sent:'당첨메일 발송 대기',sending:'당첨메일 발송 중',
  sent:'당첨메일 발송 완료',delivery_failed:'당첨메일 발송 실패',
  unknown:'당첨메일 상태 확인 필요'
})[status]||'당첨메일 상태 확인 필요';
const isoDate=value=>value?new Date(value).toLocaleString('ko-KR'):'';

export async function mountEventWinnerManager({root,eventId,request}){
  if(!root||!eventId)return;
  const oldDraw=root.querySelector('#ccmDraw');
  const oldDesignate=root.querySelector('#ccmDesignate');
  // The legacy buttons draw and email immediately. Never expose them beside
  // the staged draw workflow, including while its initial request is loading.
  oldDraw?.remove();
  oldDesignate?.remove();
  const panel=document.createElement('section');
  panel.className='event-winner-panel';
  panel.style.cssText='margin:20px 0;padding:16px;border:1px solid #ccd9ec;border-radius:14px;background:#f8fbff';
  panel.innerHTML='<strong>당첨자 추첨 · Starbucks eGift 발송 기록</strong><p>불러오는 중...</p>';
  root.prepend(panel);
  const act=async(payload)=>{
    const result=await request({event_id:eventId,...payload});
    await load();
    return result;
  };
  const drawModal=(count)=>{
    const overlay=document.createElement('div');
    overlay.style.cssText='position:fixed;inset:0;z-index:130000;background:#0009;display:grid;place-items:center;padding:16px';
    overlay.innerHTML=`<div role="dialog" aria-modal="true" aria-label="당첨자 추첨" style="background:white;padding:24px;border-radius:16px;max-width:420px;width:100%">
      <h3>당첨자 추첨</h3><p>정상 응모자: ${count}명</p>
      <label>당첨 인원 <input id="eventDrawCount" type="number" min="1" max="${Math.min(count,500)}" style="width:100%"></label>
      <p>추첨 결과는 확정 후 변경되지 않으며 이메일은 자동 발송되지 않습니다.</p>
      <div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" id="eventDrawClose">취소</button><button type="button" id="eventDrawRun">추첨 실행</button></div></div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#eventDrawClose').onclick=()=>overlay.remove();
    overlay.querySelector('#eventDrawRun').onclick=async()=>{
      const requested=Number(overlay.querySelector('#eventDrawCount').value);
      if(!Number.isInteger(requested)||requested<1||requested>count||requested>500)
        return alert('정상 응모자 수 이하의 당첨 인원을 입력해 주세요.');
      const button=overlay.querySelector('#eventDrawRun');
      button.disabled=true;
      try{await act({action:'draw',count:requested});overlay.remove()}
      catch(e){button.disabled=false;alert(e.message)}
    };
  };
  async function load(){
    try{
      const d=await request({action:'list',event_id:eventId});
      const winners=d.winners||[];
      const entries=new Map((d.entries||[]).map(e=>[e.id,e]));
      const initial=(d.batches||[]).find(batch=>batch.kind==='initial');
      const stats=d.stats||{};
      panel.innerHTML=`<div style="display:flex;gap:10px;justify-content:space-between;flex-wrap:wrap;align-items:center">
        <strong>당첨자 추첨 · Starbucks eGift 발송 기록</strong>
        <button type="button" data-action="draw" ${initial?'disabled':''}>당첨자 추첨</button></div>
        <p>전체 응모자 ${stats.total||0} · 정상 응모자 ${stats.eligible||0} · 당첨자 ${stats.winners||0} ·
          당첨메일 완료 ${stats.winner_emails_sent||0} · eGift 완료 ${stats.egifts_sent||0} ·
          eGift 미발송 ${Math.max(0,(stats.winners||0)-(stats.egifts_sent||0))}</p>
        ${initial?'<p>최초 추첨이 확정되었습니다. 재추첨은 미발송 당첨 취소 후 1명씩만 가능합니다.</p>':''}
        <div style="overflow-x:auto"><table class="ccm-table"><thead><tr><th>당첨자</th><th>상태</th><th>당첨메일</th><th>Starbucks eGift</th><th>조치</th></tr></thead>
        <tbody>${winners.map(w=>{
          const entry=entries.get(w.entry_id);
          const active=w.status==='winner';
          return `<tr><td>${escapeHtml(entry?.email||w.entry_id)}<br><small>${escapeHtml(isoDate(w.drawn_at))}</small></td>
            <td>${active?'🎉 당첨':'당첨 취소'}</td>
            <td>${escapeHtml(emailLabel(w.winner_email_status))}${w.winner_email_sent_at?'<br><small>'+escapeHtml(isoDate(w.winner_email_sent_at))+'</small>':''}</td>
            <td>☕ eGift ${w.gift_card_status==='sent'?'발송 완료':'발송 대기'}</td>
            <td style="min-width:220px">
              ${active&&['not_sent','delivery_failed'].includes(w.winner_email_status)?`<button type="button" data-action="send" data-winner="${w.id}">당첨메일 보내기</button>`:''}
              ${active&&w.winner_email_status==='sent'?`<button type="button" data-action="resend" data-winner="${w.id}">동일 안내메일 재발송</button>`:''}
              ${active&&w.winner_email_status==='sent'&&w.gift_card_status!=='sent'?`<button type="button" data-action="gift" data-winner="${w.id}">Starbucks eGift 발송 완료</button>`:''}
              ${active&&['not_sent','delivery_failed'].includes(w.winner_email_status)&&w.gift_card_status!=='sent'?`<button type="button" data-action="cancel" data-winner="${w.id}">당첨 취소</button>`:''}
            </td></tr>`}).join('')}</tbody></table></div>
        ${winners.some(w=>w.status==='cancelled')?
          '<button type="button" data-action="redraw">1명 재추첨</button>':''}`;
      panel.querySelectorAll('button[data-action]').forEach(button=>{
        button.onclick=async()=>{
          const action=button.dataset.action,winner_id=button.dataset.winner;
          if(action==='draw')return drawModal(stats.eligible||0);
          let payload={};
          if(action==='gift'){
            if(!confirm('Starbucks 공식 eGift 시스템에서 이 당첨자에게 실제로 발송했습니까?\n확인 후 발송 완료와 시간이 기록됩니다.'))return;
            payload={action:'mark_gift_sent',winner_id};
          }else if(action==='cancel'){
            const reason=prompt('당첨 취소 사유를 입력하세요. 이미 안내메일이나 eGift가 발송된 당첨자는 취소할 수 없습니다.');
            if(reason===null)return;
            payload={action:'cancel',winner_id,reason};
          }else if(action==='send')payload={action:'send_winner_email',winner_id};
          else if(action==='resend'){
            if(!confirm('기존 당첨 안내메일을 같은 주소로 다시 보내시겠습니까? eGift는 발송되지 않습니다.'))return;
            payload={action:'resend_winner_email',winner_id};
          }else if(action==='redraw'){
            if(!confirm('미발송 당첨 취소 자리 1명을 재추첨하시겠습니까?'))return;
            payload={action:'redraw'};
          }else return;
          button.disabled=true;
          try{await act(payload)}catch(e){button.disabled=false;alert(e.message)}
        };
      });
    }catch(e){panel.innerHTML='<strong>당첨자 추첨 · Starbucks eGift 발송 기록</strong><p>불러오기 실패: '+escapeHtml(e.message)+'</p>'}
  }
  await load();
}
