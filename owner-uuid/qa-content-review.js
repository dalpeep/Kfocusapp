(() => {
  'use strict';
  const add = (parent, tag, text) => {
    const node = document.createElement(tag);
    node.textContent = text;
    parent.append(node);
    return node;
  };
  const kindLabels = {coupon:'쿠폰',event:'이벤트'};
  const stateLabels = {pending:'승인 대기',approved:'승인',rejected:'거절'};
  const keys = ['title','detail','description','start_at','end_at'];
  const labels = ['제목','혜택 또는 행사 장소','설명','시작 (UTC ISO 8601)','종료 (UTC ISO 8601)'];

  async function call(db, command) {
    const {data} = await db.auth.getSession();
    if (!data?.session) throw Error('다시 로그인해 주세요.');
    const response = await fetch('/.netlify/functions/owner-portal-uuid?content=review', {
      method:'POST', redirect:'error', headers:{
        Authorization:'Bearer '+data.session.access_token,'Content-Type':'application/json',
      }, body:JSON.stringify(command),
    });
    const payload = await response.json();
    if (!response.ok || payload.ok !== true) throw Object.assign(Error({
      400:'입력 내용과 기간을 확인해 주세요.',
      401:'다시 로그인해 주세요.',
      403:'해당 업소 또는 심사 건에 대한 권한이 없습니다.',
      409:'이미 처리됐거나 공개본이 변경됐습니다.',
      503:'QA 업주 시험 운영이 중지됐습니다.',
    }[response.status] || '처리 결과를 확인하지 못했습니다.'), {status:response.status});
    return payload.result;
  }

  function mount(parent, db, business) {
    const section = add(parent,'section','');
    section.hidden=true;
    add(section,'h3','쿠폰·이벤트 심사 신청');
    const form = add(section,'form','');
    const kind = add(add(form,'label','종류'),'select','');
    for (const [key,label] of Object.entries(kindLabels)) add(kind,'option',label).value=key;
    const inputs = keys.map((key,i) => {
      const input=add(add(form,'label',labels[i]),key==='description'?'textarea':'input','');
      input.required=key!=='description';
      input.maxLength=key==='description'?3000:160;
      if (key.endsWith('_at')) input.placeholder='2027-01-01T18:00:00Z';
      return input;
    });
    const submit=add(form,'button','심사 신청');
    const notice=add(section,'p',''); notice.setAttribute('role','status');
    const list=add(section,'div','');
    let target=null;
    let pending;
    async function refresh() {
      const rows=await call(db,{action:'list',business_id:business});
      section.hidden=false;
      list.replaceChildren();
      const shown = new Set();
      for (const row of rows) {
        const card=add(list,'article','');
        add(card,'p',kindLabels[row.kind]+' · '+row.payload.title+' · '+stateLabels[row.status]);
        if (row.review_reason) add(card,'p',row.review_reason);
        if (row.status==='approved' && row.published_id && !shown.has(row.published_id)) {
          shown.add(row.published_id);
          const edit=add(card,'button','수정 신청'); edit.type='button';
          edit.onclick=()=>{
            if (submit.disabled || pending) return;
            target=row.published_id;
            kind.value=row.kind;
            inputs.forEach((input,i)=>{input.value=row.payload[keys[i]]||'';});
            notice.textContent='수정 신청 · '+row.payload.title;
            inputs[0].focus();
          };
        }
      }
    }
    form.onsubmit=async event=>{
      event.preventDefault();
      if(submit.disabled)return;
      const command={action:'submit',kind:kind.value,business_id:business,
        fields:Object.fromEntries(keys.map((key,i)=>[key,inputs[i].value.trim()]))};
      if(target) command.target_id=target;
      const fingerprint=JSON.stringify(command);
      if(pending && pending.fingerprint!==fingerprint){
        notice.textContent='이전 저장 결과를 확인하려면 같은 내용으로 다시 신청하거나 새로고침해 주세요.';
        return;
      }
      pending??={key:crypto.randomUUID(),fingerprint};
      submit.disabled=true;
      try {
        const receipt=await call(db,{...command,key:pending.key});
        if(!receipt?.id)throw Error('접수 결과를 확인하지 못했습니다.');
        pending=null; target=null; form.reset();
        notice.textContent='신청이 접수되었습니다. 관리자 승인 대기 중입니다.';
        await refresh().catch(()=>{notice.textContent+=' 새로고침하여 목록을 확인해 주세요.';});
      }catch(error){
        if ([400,401,403,409].includes(error.status)) pending=null;
        notice.textContent=error.message;
      }
      finally{submit.disabled=false;}
    };
    void refresh().catch(error=>{if(error.status!==403){section.hidden=false;notice.textContent=error.message;}});
  }

  function mountAdmin(parent,db) {
    const section=add(parent,'section','');
    add(section,'h3','쿠폰·이벤트 승인 대기');
    const list=add(section,'div','');
    const notice=add(section,'p','');notice.setAttribute('role','status');
    async function refresh(){
      const rows=await call(db,{action:'admin_list'});
      list.replaceChildren();
      for(const row of rows){
        const card=add(list,'article','');
        add(card,'h4',row.business_name+' · '+kindLabels[row.kind]);
        add(card,'p','신청 계정 '+row.actor);
        keys.forEach((key,i)=>add(card,'p',labels[i]+' '+(row.payload[key]||'')));
        const reason=add(add(card,'label','처리 사유'),'textarea','');reason.maxLength=1000;
        const approve=add(card,'button','승인'),reject=add(card,'button','거절');
        async function decide(action){
          if(approve.disabled)return;
          if(action==='reject'&&!reason.value.trim()){notice.textContent='거절 사유를 입력해 주세요.';reason.focus();return;}
          approve.disabled=reject.disabled=true;
          try{
            await call(db,{action,request_id:row.id,reason:reason.value.trim()});
            notice.textContent=action==='approve'?'승인했습니다.':'거절했습니다.';
            card.remove();
          }catch(error){notice.textContent=error.message;approve.disabled=reject.disabled=false;}
        }
        approve.onclick=()=>decide('approve');reject.onclick=()=>decide('reject');
      }
      if(!rows.length)add(list,'p','승인 대기 신청이 없습니다.');
    }
    void refresh().catch(error=>{notice.textContent=error.message;});
  }
  window.QaContentReview={mount,mountAdmin};
})();
