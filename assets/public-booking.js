(()=>{'use strict';let generation=0,last='';const card=document.getElementById('detailCard');if(!card)return;
async function refresh(){
const request=++generation,id=window.DtmOwnerMediaSelection?.().business_id;
const current=()=>request===generation&&id===window.DtmOwnerMediaSelection?.().business_id;
const clear=()=>{last='';card.querySelector('[data-booking-entry]')?.remove();};
const old=card.querySelector('[data-booking-entry]');
if(!id||old&&old.dataset.bookingEntry!==id)clear();
if(!id)return;
try{
const auth=window.supabaseClient?.auth;
const session=(await auth?.getSession?.())?.data?.session;
if(!current())return;
const headers=session?.access_token?{Authorization:'Bearer '+session.access_token}:{};
const r=await fetch('/.netlify/functions/booking-uuid?business_id='+encodeURIComponent(id),{headers});
if(!current())return;
if(!r.ok){clear();return;}
const out=await r.json();
if(!current())return;
if(out.ok!==true){clear();return;}
const key=id+':'+(session?.user?.id||'')+':'+!!out.result.bookable,previous=card.querySelector('[data-booking-entry]');
if(key===last&&previous)return;
previous?.remove();const box=document.createElement('section');box.dataset.bookingEntry=id;
const href=window.DtmLocalPreview?'/booking/?business_id='+encodeURIComponent(id):'/?booking_business='+encodeURIComponent(id);
const open=async event=>{if(window.DtmLocalPreview)return;event.preventDefault();const client=window.supabaseClient;if(!client?.auth?.getSession){window.openUserLoginModal?.();return;}const session=(await client.auth.getSession()).data?.session;if(!session){window.openUserLoginModal?.();return;}let host=box.querySelector('[data-booking-form]');if(!host){host=document.createElement('div');host.dataset.bookingForm='true';box.append(host);await window.DtmBookingUI?.mount(host,{session:{role:'customer'},bid:id,getSession:async()=>(await client.auth.getSession()).data?.session});}};
const a=document.createElement('a');if(out.result.bookable){a.textContent='온라인 예약하기';a.href=href;a.onclick=open;}else{a.textContent='전화로 예약 문의';a.href='tel:'+String(out.result.phone||'').replace(/[^+\d]/g,'');}box.append(a);const mine=document.createElement('a');mine.textContent='내 예약 조회·취소';mine.href=href;mine.onclick=open;box.append(document.createTextNode(' · '),mine);card.append(box);last=key;}catch{if(current())clear();}}
window.supabaseClient?.auth?.onAuthStateChange?.(event=>{
 if(event==='SIGNED_OUT'){
  generation++;last='';card.querySelector('[data-booking-entry]')?.remove();
 }else if(event==='SIGNED_IN'){
  setTimeout(refresh,0);
 }
});
window.DtmRefreshBookingEntry=refresh;new MutationObserver(()=>{if(!card.querySelector('[data-booking-entry]'))refresh();}).observe(card,{childList:true});window.addEventListener('focus',refresh);window.addEventListener('hashchange',refresh);window.addEventListener('daltown:ready',refresh);setInterval(()=>{if(!document.hidden)refresh();},15000);refresh();})();
