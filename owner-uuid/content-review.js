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

  function localInput(iso) {
    const date=new Date(iso);
    if (!iso || !Number.isFinite(date.getTime())) return '';
    const pad=value=>String(value).padStart(2,'0');
    return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  function utcInput(value, original) {
    const date=new Date(value);
    const normalized=value.length===16 ? value+':00' : value;
    if (!Number.isFinite(date.getTime()) || localInput(date.toISOString())!==normalized) {
      throw Error('선택한 현지 시간을 확인해 주세요.');
    }
    return original && localInput(original)===normalized ? new Date(original).toISOString() : date.toISOString();
  }

  function mount(parent, request, business, kind) {
    const section = add(parent,'div','');
    section.className='owner-review';
    const approvalNotice=add(section,'aside','');
    approvalNotice.className='owner-review-notice';
    approvalNotice.setAttribute('aria-label','쿠폰·이벤트 승인 안내');
    add(approvalNotice,'p','일반 업주는 쿠폰·이벤트 등록 및 수정 시 관리자 승인 후 게시됩니다.');
    const premium=add(approvalNotice,'div','');
    premium.className='owner-review-premium';
    add(premium,'strong','👑 프리미엄 업주는 관리자 승인 없이 즉시 게시할 수 있습니다.');
    add(premium,'p','프리미엄 서비스는 추후 오픈 예정이며, 서비스 시작 시 별도로 안내해 드립니다.');
    const label=kindLabels[kind];
    const form = add(section,'form','');
    const heading=add(form,'h3',label+' 등록 신청');
    const dateFields=add(form,'div','');
    dateFields.className='owner-review-dates';
    const inputs = keys.map((key,i) => {
      const date=key.endsWith('_at');
      const fieldLabel=date ? (key==='start_at'?'시작':'종료') : key==='detail' ? (kind==='coupon'?'쿠폰 혜택':'행사 장소') : labels[i];
      const input=add(add(date ? dateFields : form,'label',fieldLabel),key==='description'?'textarea':'input','');
      input.required=key!=='description';
      if (date) { input.type='datetime-local'; input.step='1'; }
      else input.maxLength=key==='description'?3000:160;
      return input;
    });
    form.append(dateFields);
    add(form,'small','날짜와 시간은 이 기기의 현지 시간으로 표시됩니다.');
    const actions=add(form,'div','');
    actions.className='owner-review-actions';
    const submit=add(actions,'button','심사 신청');
    const notice=add(section,'p',''); notice.setAttribute('role','status');
    add(section,'h3',label+' 신청 내역');
    const list=add(section,'div','');
    list.className='owner-listing';
    let target=null;
    let originals={};
    let pending;
    let loading;
    let loaded=false;
    function editPublished(publishedId, fields) {
      if (submit.disabled || pending) return;
      target=publishedId;
      originals=fields;
      heading.textContent=label+' 수정 신청';
      inputs.forEach((input,i)=>{const key=keys[i];input.value=key.endsWith('_at')?localInput(fields[key]):fields[key]||'';});
      notice.textContent='수정 신청 · '+fields.title;
      inputs[0].focus();
    }
    async function refresh() {
      const rows=await request({action:'list',business_id:business});
      list.replaceChildren();
      const shown = new Set();
      for (const row of rows) {
        if (row.kind!==kind) continue;
        const card=add(list,'article','');
        card.className='owner-listing-card';
        card.dataset.state=row.status;
        const info=add(card,'div','');
        info.className='owner-listing-info';
        add(info,'h4',row.payload.title);
        add(info,'span',stateLabels[row.status]).className='owner-listing-badge';
        const date=new Date(row.created_at);
        if (row.created_at && Number.isFinite(date.getTime())) {
          add(info,'p','신청일 · '+new Intl.DateTimeFormat('ko-KR',{dateStyle:'medium'}).format(date));
        }
        const details=add(info,'details','');
        add(details,'summary','상세');
        if (row.review_reason) add(details,'p','거절 사유 · '+row.review_reason);
        if (row.payload.detail) add(details,'p',row.payload.detail);
        if (row.payload.description) add(details,'p',row.payload.description);
        const actions=add(card,'div','');
        actions.className='owner-listing-actions';
        if (row.status==='approved' && row.published_id && !shown.has(row.published_id)) {
          shown.add(row.published_id);
          const edit=add(actions,'button','수정 신청'); edit.type='button';
          edit.onclick=()=>editPublished(row.published_id,row.payload);
        }
      }
      if (!list.childElementCount) add(list,'p','신청 내역이 없습니다.');
      loaded=true;
    }
    function clearForm() {
      target=null;
      originals={};
      heading.textContent=label+' 등록 신청';
      form.reset();
    }
    form.onsubmit=async event=>{
      event.preventDefault();
      if(submit.disabled)return;
      let fields;
      try {
        fields=Object.fromEntries(keys.map((key,i)=>[key,key.endsWith('_at')?utcInput(inputs[i].value,originals[key]):inputs[i].value.trim()]));
        if (fields.end_at<=fields.start_at) throw Error('종료 시간은 시작 시간 이후로 선택해 주세요.');
      } catch(error) { notice.textContent=error.message; return; }
      const command={action:'submit',kind,business_id:business,fields};
      if(target) command.target_id=target;
      const fingerprint=JSON.stringify(command);
      if(pending && pending.fingerprint!==fingerprint){
        notice.textContent='이전 저장 결과를 확인하려면 같은 내용으로 다시 신청하거나 새로고침해 주세요.';
        return;
      }
      pending??={key:crypto.randomUUID(),fingerprint};
      submit.disabled=true;
      try {
        const receipt=await request({...command,key:pending.key});
        if(!receipt?.id)throw Error('접수 결과를 확인하지 못했습니다.');
        pending=null;
        clearForm();
        notice.textContent='신청이 접수되었습니다. 관리자 승인 대기 중입니다.';
        await refresh().catch(()=>{loaded=false;notice.textContent+=' 새로고침하여 목록을 확인해 주세요.';});
      }catch(error){
        if ([400,401,403,409].includes(error.status)) pending=null;
        notice.textContent=error.message;
      }
      finally{submit.disabled=false;}
    };
    const reset=add(actions,'button','새 신청');
    reset.type='button';
    reset.onclick=()=>{
      if (submit.disabled || pending) return;
      clearForm();
      notice.textContent='';
    };
    function load() {
      if (loaded || loading) return loading;
      loading=refresh().catch(error=>{notice.textContent=error.message;}).finally(()=>{loading=null;});
      return loading;
    }
    return {editPublished,load};
  }

  function mountAdmin(parent,request) {
    const section=add(parent,'section','');
    add(section,'h3','쿠폰·이벤트 승인 대기');
    const list=add(section,'div','');
    const notice=add(section,'p','');notice.setAttribute('role','status');
    async function refresh(){
      const rows=await request({action:'admin_list'});
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
            await request({action,request_id:row.id,reason:reason.value.trim()});
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
  window.OwnerContentReview={mount,mountAdmin};
})();
