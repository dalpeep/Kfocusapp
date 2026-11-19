(()=>{'use strict';
const labels={pending:'신청 중 · 미확정',confirmed:'확정',rejected:'거절',change_requested:'변경 요청 · 고객 동의 필요',cancelled:'취소'},days=['일','월','화','수','목','금','토'];
const deliveryReason=reason=>({FREE_PLAN:'STANDARD 무료 서비스',SMS_NOT_ENTITLED:'SMS 이용 대상 아님'}[reason]||reason);
const n=(tag,text,parent)=>{const el=document.createElement(tag);if(text)el.textContent=text;parent.append(el);return el;};
const input=(parent,label,name,value='',type='text')=>{const l=n('label',label,parent),el=n(type==='textarea'?'textarea':'input','',l);if(type!=='textarea')el.type=type;el.name=name;if(type==='checkbox')el.checked=!!value;else el.value=value;return el;};
const select=(parent,label,name,options,value)=>{const l=n('label',label,parent),el=n('select','',l);el.name=name;el.setAttribute('aria-label',label);for(const [value,label]of options){const o=n('option',label,el);o.value=value;}if(value!=null)el.value=value;return el;};
const localTime=iso=>new Intl.DateTimeFormat('ko-KR',{timeZone:'America/Chicago',dateStyle:'medium',timeStyle:'short'}).format(new Date(iso));
async function mount(parent,{session,bid,getSession}){
 const root=n('section','',parent);root.className='booking-app';n('h2','온라인 예약',root);n('p','예약 시간은 달라스 시간(America/Chicago)입니다. 신청은 업주 승인 전까지 확정이 아닙니다.',root);const status=n('p','예약 정보를 확인하는 중입니다.',root);status.setAttribute('role','status');let busy=false,pending=null,list=[],version=0;const proposalDrafts=new Map();
 async function api(command){const token=getSession?(await getSession())?.access_token:session.token;if(!token)throw Error('로그인한 뒤 예약을 신청·조회해 주세요.');let r;try{r=await fetch('/.netlify/functions/booking-uuid',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({business_id:bid,...command})});}catch{throw Error('응답을 확인하지 못했습니다. 같은 버튼으로 저장 결과를 다시 확인해 주세요.');}let out;try{out=await r.json();}catch{throw Error('예약 응답을 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요.');}if(!r.ok)throw Object.assign(Error(out.error||'예약 연결을 확인해 주세요.'),{status:r.status});return out.result;}
 async function publicRead(query={}){
  const token=getSession?(await getSession())?.access_token:session.token;
  if(!token)throw Error('로그인한 뒤 예약 가능 시간을 확인해 주세요.');
  const q=new URLSearchParams({business_id:bid,...query});
  const r=await fetch('/.netlify/functions/booking-uuid?'+q,{headers:{Authorization:'Bearer '+token}});
  if(!r.ok)throw Error('예약 가능 시간을 확인하지 못했습니다.');
  return (await r.json()).result;
 }
 const button=(p,title,fn)=>{const b=n('button',title,p);b.type='button';b.onclick=fn;return b;};
 function lock(retry){for(const el of root.querySelectorAll('button,input,select,textarea'))el.disabled=el.hasAttribute('data-launch-disabled')||busy||!!pending&&el!==retry||!!el.closest('article[data-stale]')&&!el.dataset.draftCancel;if(pending&&!busy&&retry)retry.disabled=false;}
 async function mutate(b,command){if(busy)return;if(!pending)pending={button:b,command:{key:crypto.randomUUID(),...structuredClone(command)}};if(pending.button!==b)return;busy=true;lock(b);try{const command=pending.command,out=await api(command);pending=null;if(command.id)proposalDrafts.delete(command.id);if(command.action==='config-save'){meta=await publicRead();configForm(settingsHost.querySelector('details'),out);}status.textContent='처리 완료. 최신 예약 상태를 확인해 주세요.';await refresh();}catch(e){if([400,401,403,404,409,413,429].includes(e.status))pending=null;status.textContent=e.message;}finally{busy=false;lock(pending?.button);}}
 let meta;try{meta=await publicRead();}catch(e){status.textContent=e.message;return;}
 const manager=['owner','free','admin'].includes(session.role);
 const formHost=n('div','',root),settingsHost=n('div','',root),calendar=n('div','',root),records=n('div','',root),notices=n('details','',root);n('summary','내 예약 알림',notices);const noticeList=n('div','',notices);
 async function chooseSlot(host,{record,onSelect}){
  host.replaceChildren();const date=input(host,'예약 날짜','booking_date',DtmBooking.local(Date.now()+86400000).date,'date');
  const service=meta.category==='restaurant'?null:select(host,'서비스 종류','booking_service',meta.services.map(s=>[s.id,s.name+' · '+s.duration_minutes+'분']),record?.service_id);
  const staff=meta.category==='salon'&&meta.staff.length?select(host,'담당자','booking_staff',meta.staff.map(s=>[s.id,s.name]),record?.staff_id):null;
  const party=meta.category==='restaurant'?input(host,'예약 인원','booking_party',record?.party_size||1,'number'):null;if(party)party.min=1;
  const mode=meta.category==='service'?select(host,'방문/매장','booking_mode',[['store','매장 방문'],['visit','고객 방문 서비스']],record?.mode):null;
  const slots=select(host,'예약 가능 시간','booking_slot',[]);let available=[];button(host,'예약 가능 시간 조회',async()=>{try{const query={date:date.value,service_id:service?.value||'',staff_id:staff?.value||'',party_size:party?.value||'1',mode:mode?.value||'store'};const out=record?await api({action:'availability',id:record.id,query}):await publicRead(query);available=out.slots;slots.replaceChildren();for(const s of available){const o=n('option',s.label,slots);o.value=s.starts_at;}status.textContent=available.length?'예약 가능 시간을 선택해 주세요.':'선택한 조건에 예약 가능한 시간이 없습니다.';}catch(e){status.textContent=e.message;}});
  for(const el of [date,service,staff,party,mode].filter(Boolean))el.onchange=()=>{available=[];slots.replaceChildren();};
  onSelect(()=>{const found=available.find(s=>s.starts_at===slots.value);if(!found)throw Error('조건에 맞는 예약 가능 시간을 다시 조회해 주세요.');const {starts_at,service_id,staff_id,party_size,mode}=found;return {starts_at,service_id,staff_id,party_size,mode};});
 }
 if(!manager){if(!meta.bookable){const a=n('a','전화로 문의하기',formHost);a.href='tel:'+String(meta.phone).replace(/[^+\d]/g,'');n('p',meta.reason,formHost);}else{const form=n('section','',formHost);n('h3','예약 신청 · 업주 승인 후 확정',form);const times=n('div','',form);let selected;await chooseSlot(times,{onSelect:get=>selected=get});const name=input(form,'예약자 이름 (가상 데이터만)','booking_name');name.maxLength=80;const phone=input(form,'연락 전화번호 (가상 데이터만)','booking_phone','','tel');phone.maxLength=30;const consent=meta.sms_preparing?null:input(form,'예약 상태 SMS 수신 동의 (선택, PREMIUM 업소만)','booking_sms_consent',false,'checkbox');n('p',meta.sms_preparing?'STANDARD 무료 서비스의 예약 알림은 이메일이 기본입니다. PREMIUM 예약 SMS는 준비 중입니다.':'계정 이메일로 예약 알림을 받습니다. SMS 동의 시 +1 등 국가번호를 포함한 전화번호를 입력하세요. 내 예약에서 동의를 철회할 수 있습니다.',form);const note=input(form,'요청 내용 (민감정보 입력 금지)','booking_note','','textarea');note.maxLength=500;let submit;submit=button(form,'예약 신청하기',()=>{try{return mutate(submit,{action:'request',slot:selected(),name:name.value,phone:phone.value,note:note.value,sms_consent:consent?.checked===true});}catch(e){status.textContent=e.message;}});}}
 if(manager){const details=n('details','',settingsHost);n('summary','예약 영업시간·서비스·담당자 설정',details);const load=button(details,'예약 설정 조회',async()=>{try{const state=await api({action:'config-read'});configForm(details,state);}catch(e){status.textContent=e.message;}});load.click();}
 function configForm(parent,state){parent.querySelector('[data-booking-config]')?.remove();const box=n('section','',parent);box.dataset.bookingConfig='true';const c=structuredClone(state.config),enabled=input(box,'온라인 예약 접수','booking_enabled',c.enabled,'checkbox'),suspended=session.role==='admin'?input(box,'관리자 예약 이용 중지','booking_suspended',c.admin_suspended,'checkbox'):null;if(!suspended&&c.admin_suspended)n('p','관리자가 예약 이용을 중지했습니다.',box);const values={};for(const [key,title]of [['slot_minutes','예약 시작 간격(분)'],['duration_minutes','기본 예약 소요시간(분)'],['capacity','동시 수용 인원/예약 수'],['max_party','식당 최대 예약 인원'],['lead_minutes','최소 사전 신청(분)'],['horizon_days','최대 예약 가능 일수']])values[key]=input(box,title,key,c[key],'number');
  const weekly={};for(let day=0;day<7;day++){const group=n('fieldset','',box);n('legend',days[day]+'요일 영업시간 · 비우면 휴무',group);const rows=n('div','',group);weekly[day]=()=>[...rows.children].map(row=>({start:row.querySelector('[name=start]').value,end:row.querySelector('[name=end]').value}));const add=w=>{const row=n('div','',rows);input(row,'시작','start',w.start,'time');input(row,'종료','end',w.end,'time');button(row,'시간 구간 삭제',()=>row.remove());};c.weekly[day].forEach(add);button(group,'시간 구간 추가',()=>{if(rows.children.length<4)add({start:'09:00',end:'18:00'});});}
  const closed=input(box,'휴무일 (YYYY-MM-DD, 쉼표 구분)','closed_dates',c.closed_dates.join(','));
  const collections={};for(const [key,title]of [['services','서비스'],['staff','담당자']]){const group=n('fieldset','',box);n('legend',title+' 관리',group);const rows=n('div','',group);collections[key]=()=>[...rows.children].map(row=>({id:row.dataset.id,name:row.querySelector('[name=entry_name]').value,...key==='services'?{duration_minutes:Number(row.querySelector('[name=duration_minutes]').value)}:{}}));const add=item=>{const row=n('div','',rows);row.dataset.id=item.id;input(row,title+' 이름','entry_name',item.name);if(key==='services')input(row,'서비스 소요시간(분)','duration_minutes',item.duration_minutes,'number');button(row,title+' 삭제',()=>row.remove());};c[key].forEach(add);button(group,title+' 추가',()=>add({id:crypto.randomUUID(),name:'',duration_minutes:60}));}
  let save;save=button(box,'예약 설정 저장',()=>{try{const next={...c,enabled:enabled.checked,admin_suspended:suspended?suspended.checked:c.admin_suspended,weekly:Object.fromEntries(Object.entries(weekly).map(([k,get])=>[k,get()])),closed_dates:closed.value.split(',').map(s=>s.trim()).filter(Boolean),services:collections.services(),staff:collections.staff()};for(const [k,i]of Object.entries(values))next[k]=Number(i.value);return mutate(save,{action:'config-save',revision:state.revision,config:DtmBooking.config(next,c.category)});}catch(e){status.textContent=e.message;}});
 }
 if(manager){const stats=n('section','',root);button(stats,'PREMIUM 예약 통계',async()=>{try{const out=await api({action:'statistics'});stats.querySelector('[data-counts]')?.remove();const p=n('p',Object.entries(out.counts).map(([k,v])=>(labels[k]||k)+': '+v+'건').join(' · '),stats);p.dataset.counts='true';}catch(e){status.textContent=e.message;}});if(session.role==='admin'){const logs=n('div','',stats);button(stats,'예약 오류·감사 기록',async()=>{try{const out=await api({action:'audit'});logs.replaceChildren();for(const row of out.items)n('p',(row.created||'')+' · '+row.action+' · '+(row.code||row.next||''),logs);}catch(e){status.textContent=e.message;}});}}
 if(manager){
  const delivery=n('details','',settingsHost);
  n('summary','예약 알림 설정 · 모의 발송',delivery);
  const panel=n('div','',delivery);
  button(delivery,'알림 설정·사용량 조회',async()=>{
   try{
    const state=await api({action:'delivery-read'});
    panel.replaceChildren();
    n('p',state.month+' Dallas 기준 SMS 사용량 '+state.sms_used+' / '+state.settings.monthly_sms_limit,panel);
    n('p','STANDARD와 PREMIUM은 이메일을 기본 알림으로 사용합니다. PREMIUM SMS에는 수신 동의와 유효한 전화번호가 필요합니다.',panel);
    if(!state.sms_preparing&&(state.premium_sms||state.preference?.consent||session.role==='admin')){
    const phone=input(panel,'내 SMS 국제 전화번호','owner_sms_phone',state.preference?.phone||'','tel');
    const consent=input(panel,'내 예약 SMS 수신 동의','owner_sms_consent',state.preference?.consent,'checkbox');
    const save=button(panel,'내 SMS 수신 설정 저장',()=>mutate(save,{action:'sms-preference',phone:phone.value,consent:consent.checked}));
    }else n('p',state.sms_preparing?'PREMIUM 예약 SMS는 준비 중입니다. STANDARD는 이메일 알림을 사용합니다.':'🔒 SMS 수신 설정은 PREMIUM에서 사용할 수 있습니다.',panel);
    if(session.role==='admin'){
     const enabled=input(panel,'공통 온라인 예약 활성화 (STANDARD / PREMIUM)','common_booking_enabled',state.settings.enabled,'checkbox');
     const sms=input(panel,'PREMIUM SMS 활성화','premium_sms_enabled',state.settings.sms_enabled,'checkbox');
     if(state.sms_preparing){
      sms.dataset.launchDisabled='true';
      sms.disabled=true;
     }
     const limit=input(panel,'월 SMS 발송 한도','monthly_sms_limit',state.settings.monthly_sms_limit,'number');
     const savePolicy=button(panel,'예약 알림 정책 저장',()=>mutate(savePolicy,{action:'delivery-policy',settings:{enabled:enabled.checked,sms_enabled:sms.checked,monthly_sms_limit:Number(limit.value)}}));
     for(const job of state.jobs){
      const row=n('p',[job.kind,job.audience,job.channel,job.status,deliveryReason(job.reason),job.attempts+'회'].join(' · '),panel);
      for(const attempt of job.history||[]) n('small',attempt.at+' · '+attempt.number+'회 · '+attempt.status+' '+deliveryReason(attempt.reason),row);
     if(job.status==='failed'&&job.attempts<3&&!(state.sms_preparing&&job.channel==='sms')){
       const retry=button(row,'모의 재시도',()=>mutate(retry,{action:'delivery-retry',id:job.id}));
      }
     }
    }
   }catch(e){status.textContent=e.message;}
  });
 }
 let filterDate='';function draw(){records.replaceChildren();calendar.replaceChildren();if(manager){n('h3','예약 캘린더 · 달라스 시간',calendar);const grid=n('div','',calendar);grid.className='booking-calendar';for(let i=0;i<7;i++){const date=DtmBooking.local(Date.now()+i*86400000).date,count=list.filter(r=>DtmBooking.local(Date.parse(r.starts_at)).date===date&&DtmBooking.active.includes(r.status)).length;button(grid,date+' · '+count+'건',()=>{filterDate=date;draw();});}button(calendar,'전체 예약 보기',()=>{filterDate='';draw();});}n('h3',manager?'업소 예약 목록':'내 예약 상태',records);const shown=list.filter(r=>!filterDate||DtmBooking.local(Date.parse(r.starts_at)).date===filterDate);if(!shown.length)n('p','표시할 예약이 없습니다.',records);
  for(const r of shown){const draft=proposalDrafts.get(r.id);if(draft){records.append(draft.card);if(draft.revision!==r.revision&&!draft.card.dataset.stale){draft.card.dataset.stale='true';n('p','예약 상태가 변경되었습니다. 입력 초안은 보존했습니다. 제안 작성을 취소한 뒤 최신 예약을 확인해 주세요.',draft.card);for(const b of draft.card.querySelectorAll('button'))if(!b.dataset.draftCancel)b.disabled=true;}continue;}const card=n('article','',records);card.dataset.bookingId=r.id;n('h4',labels[r.status],card);n('p',localTime(r.starts_at)+' ~ '+localTime(r.ends_at),card);n('p','인원: '+r.party_size+' · '+(r.mode==='visit'?'고객 방문':'매장 방문'),card);if(r.service_id)n('p','서비스: '+(meta.services.find(s=>s.id===r.service_id)?.name||'이전 서비스'),card);if(r.staff_id)n('p','담당자: '+(meta.staff.find(s=>s.id===r.staff_id)?.name||'이전 담당자'),card);n('p',r.name+' · '+r.phone,card);if(r.note)n('p',r.note,card);if(r.proposal)n('p','제안된 시간: '+localTime(r.proposal.starts_at)+' · 아직 고객 동의 전입니다.',card);
   const action=(title,kind)=>{let b;b=button(card,title,()=>mutate(b,{action:kind,id:r.id,revision:r.revision}));};if(!manager&&r.sms_consent===true)action('SMS 동의 철회','sms-withdraw');if(DtmBooking.active.includes(r.status)){action('예약 취소','cancel');if(manager){if(r.status==='pending')action('신청 확정','confirm');action('예약 거절','reject');if(['pending','confirmed'].includes(r.status))button(card,'시간 변경 제안',async()=>{if(proposalDrafts.has(r.id))return;const proposal=n('section','',card);proposalDrafts.set(r.id,{card,revision:r.revision});let selected;await chooseSlot(proposal,{record:r,onSelect:get=>selected=get});const cancelDraft=button(proposal,'제안 작성 취소',()=>{proposalDrafts.delete(r.id);draw();});cancelDraft.dataset.draftCancel='true';let send;send=button(proposal,'변경 제안 보내기',()=>{try{return mutate(send,{action:'propose',id:r.id,revision:r.revision,slot:selected()});}catch(e){status.textContent=e.message;}});});}else if(r.status==='change_requested'){action('변경 수락','accept-change');action('변경 거절','decline-change');}}
  }
 }
 async function refresh(){const current=++version;let out;try{out=await api({action:'list'});}catch(e){if([401,403].includes(e.status)){list=[];proposalDrafts.clear();records.replaceChildren();calendar.replaceChildren();noticeList.replaceChildren();}throw e;}if(current!==version||!root.isConnected)return;list=out.items;draw();root.dataset.bookingRefresh=String(current);const messages=await api({action:'notifications'});if(current!==version)return;noticeList.replaceChildren();for(const row of messages.items){const p=n('p',row.created+' · '+row.kind,noticeList);if(!row.read_at){let b;b=button(p,'읽음',()=>mutate(b,{action:'notification-read',id:row.id}));}}}
 button(root,'예약 목록 새로고침',()=>refresh().catch(e=>status.textContent=e.message));try{await refresh();status.textContent=meta.bookable?'예약 접수 가능 · 신청 후 업주 승인을 기다려 주세요.':meta.reason;}catch(e){status.textContent=e.message;}root.dataset.bookingReady='true';
 const poll=()=>setTimeout(async()=>{if(!root.isConnected)return;if(!pending&&!busy)try{await refresh();}catch{}poll();},30000);poll();
}
window.DtmBookingUI={mount};})();
