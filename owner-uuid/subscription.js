(()=>{'use strict';const n=(t,s,p)=>{const e=document.createElement(t);e.textContent=s;p.append(e);return e;},labels={photos:'사진',menus:'메뉴',coupons:'쿠폰',events:'이벤트',specials:'스페셜',promotion:'홍보',statistics:'통계'};
const planLabel=plan=>plan==='PREMIUM'?'PREMIUM':'STANDARD';
const premiumPreparing='PREMIUM · 유료 서비스 · 준비 중';
function dashboard(parent,state){parent.querySelector(':scope > [data-subscription-dashboard]')?.remove();const box=n('section','',parent);box.dataset.subscriptionDashboard='true';n('h2',planLabel(state.plan||(state.tier==='paid'?'PREMIUM':'FREE'))+' 구독 현황',box);n('p','상태: '+({active:'사용 중',trial:'체험 중',scheduled:'시작 전',expired:'만료 · 자료 보존',free:'무료 서비스'}[state.status]||'무료 서비스'),box);if(state.premium_preparing===true){n('p',premiumPreparing+' · 현재 STANDARD 무료 서비스 이용 중',box);}else{n('p','월 구독: '+((state.price?.monthly_price_minor||0)/(state.price?.currency==='KRW'?1:100))+' '+(state.price?.currency||'USD')+' · 실제 결제 연결 없음',box);n('p','시작: '+(state.subscription?.starts_at||'기존 시작일 없음')+' / 만료: '+(state.subscription?.status==='trial'?state.subscription.trial_end_at:state.subscription?.ends_at||'해당 없음'),box);}for(const [k,v]of Object.entries(state.usage||{}))n('p',({cover:'대표사진',gallery:'매장 사진',menu_pages:'메뉴판',menu_items:'메뉴',coupons:'쿠폰',events:'이벤트',specials:'스페셜'}[k]||k)+': '+v+' / '+(state.limits?.[k]??'제한 없음'),box);n('p','기본 업소 등록·필수 정보 수정은 무료입니다. 만료되어도 기존 자료는 삭제하지 않습니다.',box);return box;}
function admin(parent,state,send){const panel=n('fieldset','',parent);n('legend','PREMIUM 월 구독 설정 · 결제 없음',panel);const controls={};for(const [key,label]of [['monthly_price_minor','월 구독 가격 (최소 통화 단위)'],['trial_days','기본 체험 일수']]){const l=n('label',label,panel),i=n('input','',l);i.type='number';i.name=key;i.value=(state.settings||DtmSubscription.defaults)[key];controls[key]=i;}const l=n('label','통화',panel),currency=n('select','',l);currency.setAttribute('aria-label','통화');for(const v of ['USD','KRW']){const o=n('option',v,currency);o.value=v;}currency.value=(state.settings||DtmSubscription.defaults).currency;for(const [group,keys]of [['premium_features',Object.keys(labels)],['booking_categories',['restaurant','salon','service']]]){controls[group]={};for(const key of keys){const l=n('label',(labels[key]||{restaurant:'식당',salon:'미용실',service:'일반 서비스'}[key])+' 허용',panel),i=n('input','',l);i.type='checkbox';i.name=group+'_'+key;i.checked=(state.settings||DtmSubscription.defaults)[group][key];controls[group][key]=i;}}const status=n('p','설정은 서버에서도 검증합니다.',panel),save=n('button','구독 가격·기능 저장',panel);save.type='button';save.dataset.adminAction='plan-settings';save.onclick=async()=>{save.disabled=true;try{const settings={monthly_price_minor:Number(controls.monthly_price_minor.value),trial_days:Number(controls.trial_days.value),currency:currency.value,premium_features:{booking:(state.settings||DtmSubscription.defaults).premium_features.booking},booking_categories:{}};for(const group of ['premium_features','booking_categories'])for(const [key,input]of Object.entries(controls[group]))settings[group][key]=input.checked;await send({action:'plan-settings',key:crypto.randomUUID(),settings});status.textContent='구독 가격·기능 저장 완료';}catch(e){status.textContent=e.message;}finally{save.disabled=false;}};const audit=n('button','구독 변경 감사 기록',panel);audit.type='button';audit.onclick=async()=>{try{const out=await send({action:'audit'});status.textContent=out.items.map(i=>(i.at||i.created_at||'시각 확인 필요')+' · '+i.action+' · '+i.actor).join('\n')||'변경 기록 없음';}catch(e){status.textContent=e.message;}};}
function action(parent,label,run){
 const button=n('button',label,parent);
 button.type='button';
 button.onclick=run;
 return button;
}
const quotaLabels={cover:'대표사진',gallery:'매장 사진',menu_pages:'메뉴판',menu_items:'개별 메뉴',coupons:'쿠폰',events:'이벤트',specials:'스페셜'};
const statusLabels={pending:'승인 대기 중',approved:'승인 완료',rejected:'거절',cancelled:'취소'};
const fmtPrice=price=>new Intl.NumberFormat('ko-KR',{style:'currency',currency:price.currency}).format(price.monthly_price_minor/(price.currency==='KRW'?1:100));
const dateTime=value=>value?new Date(value).toLocaleString('ko-KR'):'미설정';
const browserTime=value=>new Date(value-new Date(value).getTimezoneOffset()*60000).toISOString().slice(0,16);

function comparison(parent,state){
 const table=n('table','',parent);
 n('caption','STANDARD와 PREMIUM 기능 비교',table);
 const head=n('tr','',n('thead','',table));
 for(const name of ['기능','STANDARD','PREMIUM'])n('th',name,head).scope='col';
 const body=n('tbody','',table);
 function row(title,free,premium){
  const tr=n('tr','',body);
  n('th',title,tr).scope='row';
  n('td',free,tr);n('td',premium,tr);
 }
 row('서비스 안내','무료 서비스',state.premium_preparing?'유료 서비스 · 준비 중':'유료 서비스');
 if(state.premium_preparing){
  row('월 구독료','무료','출시 후 안내');
 }else row('월 구독료','무료',fmtPrice(state.price));
 row('업소 등록·정보 수정','이용 가능','이용 가능');
 row('온라인 예약·이메일 알림','이용 가능','이용 가능');
 row('기본 업소 통계','콘텐츠 사용량','콘텐츠 사용량');
 for(const [key,label] of Object.entries(quotaLabels)){
  const feature={cover:'photos',gallery:'photos',menu_pages:'menus',menu_items:'menus'}[key]||key;
  row(label,String((state.premium_preparing?state.limits:state.plans.free)[key]??'요금제 한도 없음'),state.plans.features[feature]===false?'관리자 설정으로 중지':String(state.plans.premium[key]??'제한 없음'));
 }
 row('예약 SMS','—',state.premium_preparing?'실제 발송 검증 후 제공':'수신 동의·월 한도 적용');
 row('상세 방문·클릭 통계','—',state.plans.features.statistics?'최근 30일 일별 집계':'관리자 설정으로 중지');
 row('PREMIUM 배지','—','대시보드에 표시');
 row('프리미엄 홍보·배너 신청 자격','—',state.plans.features.promotion&&state.plans.premium.promotion?'이용 가능':'관리자 설정으로 중지');
 n('p',state.premium_preparing?'PREMIUM 항목은 출시 예정 혜택입니다. 초기 무료 이용 기간에는 구독 신청과 결제를 받지 않습니다.':'PREMIUM 월 구독 하나로 설정된 혜택을 이용합니다. 신청 후 관리자 승인을 기다려 주세요. 기존 콘텐츠는 만료되어도 보존됩니다.',parent);
}

async function upgrade(parent,{business,send,readSms,open,admin=false}){
 const root=n('section','',parent);
 root.dataset.upgrade=admin?'admin':'owner';
 const status=n('p','신청 현황을 확인하는 중입니다.',root);
 status.setAttribute('role','status');
 const content=n('div','',root);
 let pendingCommand, running=false, poll;
 function watchPending(id){
  clearTimeout(poll);
  if(!id||admin)return;
  poll=setTimeout(async()=>{
   if(!root.isConnected)return;
   try{
    if(!running&&!document.hidden){
     const history=await send({action:'upgrade-list'});
     if(!history.items.some(item=>item.id===id&&item.status==='pending')){
      await load();
      status.textContent='관리자 검토 결과를 반영했습니다.';
      return;
     }
    }
   }catch{}
   watchPending(id);
  },15000);
 }
 async function mutate(command){
  if(running)return;
  if(pendingCommand&&JSON.stringify({...pendingCommand,key:undefined})!==JSON.stringify(command)){
   status.textContent='이전 요청과 같은 값으로 다시 시도하거나 최신 현황을 확인해 주세요.';
   return;
  }
  pendingCommand??={...command,key:crypto.randomUUID()};
  running=true;
  const controls=[...content.querySelectorAll('button,input,textarea')];
  const enabled=controls.filter(control=>!control.disabled);
  for(const control of enabled)control.disabled=true;
  try{
   const result=await send(pendingCommand);
   pendingCommand=null;
   status.textContent=result.status==='pending'?'신청 완료 · 관리자 승인 대기 중':statusLabels[result.status]||'처리 완료';
   await load();
  }catch(e){
   if([400,401,403,404,409].includes(e.status))pendingCommand=null;
   status.textContent=e.message;
  }finally{
   running=false;
   for(const control of enabled)control.disabled=false;
  }
 }
 async function load(){
  const [state,history]=await Promise.all([send({action:'read'}),send({action:'upgrade-list'})]);
  if(!root.isConnected)return;
  watchPending(history.items.find(item=>item.status==='pending')?.id);
  content.replaceChildren();
  n('h2',admin?'프리미엄 신청 관리':planLabel(state.plan)+' 구독 현황',content);
  n('p',(business.name_ko||business.name_en||business.id)+' · 현재 요금제 '+planLabel(state.plan)+(state.plan==='PREMIUM'?' · 유료 서비스':' · 무료 서비스'),content);
  if(state.premium_preparing){
   n('h3',premiumPreparing,content);
   n('p','초기에는 모든 일반 업소가 STANDARD 무료 서비스를 이용합니다. 사진·메뉴·쿠폰·이벤트·스페셜은 요금제 한도 없이 기존 공개 설정을 유지합니다. 온라인 예약을 이용할 수 있으며 예약 알림의 기본 채널은 이메일입니다. 파일·등록 안전 제한은 적용됩니다.',content);
   if(admin){
    const checklist=n('ul','',content);
    for(const item of ['월 구독료 결제·자동 청구·정산 검증','실제 예약 SMS 발송과 수신 동의·거부 검증','운영 전 권한·결제·알림 통합 확인 후 출시 설정 승인'])n('li',item,checklist);
   }
  }
  if(!admin){
   const paid=state.plan==='PREMIUM';
   const eligible=!state.premium_preparing&&!paid&&state.status!=='scheduled'&&!history.items.some(item=>item.status==='pending');
   const benefits=n('details','',content);
   n('summary','프리미엄 혜택 보기',benefits);
   benefits.open=open==='benefits';
   if(state.plans&&state.price)comparison(benefits,state);
   n('p',paid?'시작 '+dateTime(state.subscription.starts_at)+' · 만료 '+dateTime(state.subscription.status==='trial'?state.subscription.trial_end_at:state.subscription.ends_at)+' · 갱신은 관리자에게 문의하세요.':state.status==='scheduled'?'PREMIUM 시작 예정 · '+dateTime(state.subscription.starts_at):'무료 기능과 등록 한도는 혜택 비교에서 확인하세요.',content);
   const usage=n('details','',content);
   n('summary','기본 업소 통계 · 콘텐츠 사용량',usage);
   for(const [key,label] of Object.entries(quotaLabels))n('p',label+' '+(state.usage?.[key]??0)+' / '+(state.limits?.[key]??'제한 없음'),usage);
   if(paid){
    n('p',(state.status==='trial'?'체험 중':'사용 중')+' · 월 '+fmtPrice(state.price),content);
    n('p','PREMIUM 배지 · '+Object.entries(state.features||{}).filter(([key,on])=>on&&key!=='booking').map(([key])=>labels[key]||key).join(' · '),content);
    const sms=n('p','SMS 사용량 확인 중',content);
    if(readSms)readSms().then(data=>{sms.textContent='이번 달 SMS '+data.sms_used+' / '+data.settings.monthly_sms_limit+'건 · 남은 '+Math.max(0,data.settings.monthly_sms_limit-data.sms_used)+'건';}).catch(()=>{sms.textContent='SMS 사용량은 예약 알림 설정에서 확인해 주세요.';});
    else sms.textContent='SMS 사용량은 예약 알림 설정에서 확인해 주세요.';
    if(state.limits?.promotion)action(content,'프리미엄 홍보 자격 확인',async()=>{try{await send({action:'promotion-preview',key:crypto.randomUUID()});status.textContent='홍보·배너 신청 자격이 있습니다. 게시 여부는 별도 검토가 필요합니다.';}catch(e){status.textContent=e.message;}});
    if(state.features?.statistics){
     const activity=n('div','',content);
     action(content,'상세 방문·클릭 통계 보기',async()=>{
      try{
       const data=await send({action:'statistics'});
       activity.replaceChildren();
       n('h3','최근 30일 방문·클릭 · 달라스 기준',activity);
       for(const row of data.activity||[])n('p',row.day+' · 상세 방문 '+row.views+'회 · 업소 클릭 '+row.clicks+'회',activity);
       if(!data.activity?.length)n('p','해당 기간의 기록이 없습니다.',activity);
      }catch(e){status.textContent=e.message;}
     });
    }
   }else{
    action(content,'🔒 PREMIUM 홍보·SMS 혜택',()=>{benefits.open=true;benefits.querySelector('summary').focus();});
    if(state.premium_preparing)action(content,'프리미엄 업그레이드 신청 · 준비 중',()=>{}).disabled=true;
    if(eligible){
     const form=n('details','',content);
     n('summary','프리미엄 업그레이드 신청',form);
     form.open=open==='apply';
     n('p','신청 업소 '+(business.name_ko||business.name_en||business.id)+' · STANDARD → PREMIUM · 월 '+fmtPrice(state.price),form);
     n('p','확대된 콘텐츠 한도, SMS와 홍보 자격은 프리미엄 혜택 비교에서 확인하세요. 승인되면 관리자가 지정한 시작일에 혜택이 적용됩니다.',form);
     action(form,'업그레이드 신청 제출',()=>mutate({action:'upgrade-submit'}));
    }
   }
  }
  for(const item of history.items){
   const row=n('article','',content);
   n('h3',statusLabels[item.status],row);
   n('p',item.business_name+' · 요청 '+planLabel(item.plan)+' · 신청일 '+dateTime(item.created_at),row);
   if(item.reason)n('p','사유 '+item.reason,row);
   if(admin)n('p','업주 계정 ID '+item.applicant,row);
   if(item.notification)n('p','결과 알림 기록 · 모의 처리',row);
   if(!admin&&item.can_cancel)action(row,'업그레이드 신청 취소',()=>mutate({action:'upgrade-cancel',id:item.id}));
   if(admin&&item.status==='pending'){
    const start=n('input','',n('label','승인 시작일',row));
    const end=n('input','',n('label','승인 만료일',row));
    start.type=end.type='datetime-local';
    start.value=browserTime(Date.now());
    end.value=browserTime(Date.now()+30*86400000);
    const approval=action(row,'PREMIUM 승인',()=>{
     if(!start.value||!end.value){status.textContent='시작일과 만료일을 입력해 주세요.';return;}
     return mutate({action:'upgrade-approve',id:item.id,starts_at:new Date(start.value).toISOString(),ends_at:new Date(end.value).toISOString()});
    });
    approval.disabled=state.premium_preparing===true;
    const reason=n('textarea','',n('label','거절 사유',row));
    reason.maxLength=500;
    action(row,'신청 거절',()=>mutate({action:'upgrade-reject',id:item.id,reason:reason.value.trim()}));
   }
  }
  if(!history.items.length)n('p','등록된 업그레이드 신청이 없습니다.',content);
 }
 action(root,'신청·구독 상태 다시 조회',async()=>{if(running)return;try{await load();pendingCommand=null;status.textContent='최신 구독·신청 현황을 확인했습니다.';}catch(e){status.textContent=e.message;}});
 try{await load();status.textContent='최신 구독·신청 현황을 확인했습니다.';}catch(e){status.textContent=e.message;}
}

async function readSms(db,bid){
 const {data:{session}}=await db.auth.getSession();
 if(!session)throw Error('로그인이 필요합니다.');
 const response=await fetch('/.netlify/functions/booking-uuid',{method:'POST',headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify({action:'delivery-read',business_id:bid})});
 if(!response.ok)throw Error('예약 알림 설정에서 SMS 사용량을 확인해 주세요.');
 return (await response.json()).result;
}
window.OwnerSubscription={dashboard,admin,upgrade,readSms};})();
