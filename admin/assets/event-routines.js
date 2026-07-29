const $ = (id) => document.getElementById(id);
const esc = (s='') => String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const ACTION_LABELS={recommendation:'달타운 추천',alert:'달타운 알림',ticker:'달타운 알림(이전 형식)',banner:'메인 배너',community:'커뮤니티',coupon:'쿠폰',article:'AI 기사',business:'업소 추천'};
const OPTION_LABELS={
 recommendation:{new:'신규',recommended:'추천',popular:'인기',coupon:'쿠폰',ai:'AI 추천',visit:'업소 탐방',admin:'관리자 지정',random:'랜덤'},
 alert:{life:'오늘의 생활',guide:'달라스 가이드',event:'행사안내',urgent:'긴급공지',weather:'날씨',traffic:'교통',business:'업소 광고',coupon:'쿠폰',new:'신규 오픈',promotion:'이벤트 광고',visit:'업소 탐방',ai:'AI 추천',admin:'관리자 작성',random:'랜덤'},
 ticker:{business:'업소 광고',coupon:'쿠폰',new:'신규 오픈',event:'이벤트',visit:'업소 탐방',ai:'AI 추천',admin:'관리자 작성',random:'랜덤'},
 banner:{general:'일반',event:'이벤트',season:'시즌',admin:'관리자 지정',random:'랜덤'},
 community:{notice:'행사안내',life:'달라스 라이프',guide:'달라스 가이드'},
 coupon:{today:'오늘의 쿠폰',new:'신규',popular:'인기',ending:'종료임박',random:'랜덤'},
 article:{local:'지역뉴스',life:'생활정보',realestate:'부동산',education:'교육',food:'맛집',shopping:'쇼핑',health:'건강',auto:'자동차'},
 business:{new:'신규 업체',popular:'인기 업체',rating:'평점 높은 업체',ad:'광고 업체',ai:'AI 추천',random:'랜덤'}
};
let routines=[]; let selectedId=null;
function region(){return String(window.APP_CONFIG?.APP_REGION||window.KFOCUS_CONFIG?.APP_REGION||'dallas').toLowerCase();}
function key(){return `kfocus_event_routines_v72_${region()}`;}
function activityKey(){return `kfocus_event_routine_activity_v72_${region()}`;}
function readActivity(){try{return JSON.parse(localStorage.getItem(activityKey())||'[]')}catch{return[]}}
function logActivity(message,type='updated'){const rows=readActivity();rows.unshift({id:`act-${Date.now()}`,message,type,at:new Date().toISOString()});localStorage.setItem(activityKey(),JSON.stringify(rows.slice(0,80)));renderDashboard();}
let serverSyncBusy=false;
function config(){return window.KFOCUS_CONFIG||window.APP_CONFIG||{};}
function getAuthClient(){
  const cfg=config();
  if(!cfg.SUPABASE_URL||!cfg.SUPABASE_ANON_KEY||!window.supabase?.createClient)return null;
  if(!window.__eventRoutineSupabase)window.__eventRoutineSupabase=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
  return window.__eventRoutineSupabase;
}
async function edgeCall(action,body={}){
  const cfg=config(),client=getAuthClient();
  if(!cfg.SUPABASE_URL||!cfg.SUPABASE_ANON_KEY||!client)throw new Error('Supabase 설정을 확인하세요.');
  const {data:{session}}=await client.auth.getSession();
  if(!session?.access_token)throw new Error('관리자 로그인 세션이 만료되었습니다. 다시 로그인하세요.');
  const functionName=String(cfg.NEWSROOM_FUNCTION_NAME||'newsroom').trim()||'newsroom';
  const res=await fetch(`${String(cfg.SUPABASE_URL).replace(/\/$/,'')}/functions/v1/${encodeURIComponent(functionName)}`,{method:'POST',headers:{'Content-Type':'application/json',apikey:cfg.SUPABASE_ANON_KEY,Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({action,region:region(),...body}),cache:'no-store'});
  const json=await res.json().catch(()=>({}));
  if(!res.ok||json.ok===false)throw new Error(json.error||json.message||`HTTP ${res.status}`);
  return json;
}
async function load(){
  try{
    const json=await edgeCall('get_settings',{region:region()});
    const cfg=json?.settings?.home_config||{};
    routines=Array.isArray(cfg.event_routines)?cfg.event_routines:[];
    localStorage.setItem(key(),JSON.stringify(routines));
  }catch(e){
    console.warn('[Event routines] server load failed, using cache',e);
    try{routines=JSON.parse(localStorage.getItem(key())||'[]');if(!Array.isArray(routines))routines=[];}catch{routines=[];}
  }
  render();publishRuntime();
}
async function save(){
  if(serverSyncBusy)return;
  serverSyncBusy=true;
  localStorage.setItem(key(),JSON.stringify(routines));
  publishRuntime();render();
  try{
    const current=await edgeCall('get_settings',{region:region()});
    const homeConfig=current?.settings?.home_config&&typeof current.settings.home_config==='object'?current.settings.home_config:{};
    const nextConfig={...homeConfig,event_routines:routines,event_routines_updated_at:new Date().toISOString()};
    const saved=await edgeCall('save_settings',{region:region(),home_config:nextConfig});
    const verified=saved?.settings?.home_config?.event_routines;
    if(Array.isArray(verified)){routines=verified;localStorage.setItem(key(),JSON.stringify(routines));}
    publishRuntime();render();
  }finally{serverSyncBusy=false;}
}
function publishRuntime(){const active=routines.filter(r=>statusOf(r)==='active');localStorage.setItem(`kfocus_active_event_routines_v72_${region()}`,JSON.stringify(active));window.dispatchEvent(new CustomEvent('kfocus:event-routines-updated',{detail:{region:region(),routines:active}}));renderDashboard();}
function nowLocal(){const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,16);}
function statusOf(r){if(r.enabled===false)return'paused';const now=Date.now(),s=r.start_at?new Date(r.start_at).getTime():null,e=r.end_at?new Date(r.end_at).getTime():null;if(s&&now<s)return'scheduled';if(e&&now>e)return'ended';return'active';}
function statusLabel(s){return({active:'진행 중',scheduled:'예약',paused:'일시중지',ended:'종료'})[s]||s;}
function dateText(r){if(r.schedule_type==='repeat')return `반복 · ${r.repeat_value||r.repeat_type||'설정 없음'}`;if(r.schedule_type==='open')return `${r.start_at?new Date(r.start_at).toLocaleString('ko-KR'):'즉시'}부터 계속`;if(r.schedule_type==='once')return r.start_at?new Date(r.start_at).toLocaleString('ko-KR'):'즉시 1회';return `${r.start_at?new Date(r.start_at).toLocaleString('ko-KR'):'시작 미정'} ~ ${r.end_at?new Date(r.end_at).toLocaleString('ko-KR'):'종료 미정'}`;}
function actionSummary(a,k){const selected=(a.options||[]).map(v=>OPTION_LABELS[k]?.[v]||v);const custom=a.custom_items||[];const parts=[];if(selected.length)parts.push(selected.join(' · '));if(custom.length)parts.push(`직접 문구 ${custom.length}개`);return parts.join(' + ')||a.detail||'기본 설정';}
function render(){const filter=$('erStatusFilter')?.value||'all';const list=$('erRoutineList');if(list){const rows=routines.slice().sort((a,b)=>String(a.start_at||'').localeCompare(String(b.start_at||''))).filter(r=>filter==='all'||statusOf(r)===filter);list.innerHTML=rows.length?rows.map(r=>{const st=statusOf(r);return `<div class="er-routine ${String(r.id)===String(selectedId)?'active':''}" data-er-id="${esc(r.id)}"><div class="er-routine-head"><div class="er-routine-title">${esc(r.name||'이름 없는 이벤트')}</div><span class="er-status ${st}">${statusLabel(st)}</span></div><div class="er-routine-meta">${esc(dateText(r))}<br>${esc(r.region||region())}</div><div class="er-tags">${Object.keys(r.actions||{}).map(k=>`<span class="er-tag">${esc(ACTION_LABELS[k]||k)}</span>`).join('')}</div></div>`}).join(''):'<div class="er-empty">등록된 이벤트 루틴이 없습니다.<br>새 이벤트 루틴을 추가하세요.</div>';list.querySelectorAll('[data-er-id]').forEach(el=>el.onclick=()=>edit(el.dataset.erId));}
 const counts={active:0,scheduled:0,paused:0,ended:0};routines.forEach(r=>counts[statusOf(r)]++);Object.entries(counts).forEach(([k,v])=>{const id={active:'erActiveCount',scheduled:'erScheduledCount',paused:'erPausedCount',ended:'erEndedCount'}[k];if($(id))$(id).textContent=v;});renderDashboard();}
function reset(){selectedId=null;$('erId').value='';$('erName').value='';$('erDescription').value='';$('erRegion').value=region()==='denver'?'colorado':region();$('erScheduleType').value='range';$('erEnabled').value='true';$('erStartAt').value=nowLocal();$('erEndAt').value='';$('erRepeatType').value='weekly';$('erRepeatValue').value='';document.querySelectorAll('#erActionGrid>label').forEach(l=>{const main=l.querySelector(':scope > input[type=checkbox]');main.checked=false;l.classList.remove('selected');l.querySelectorAll('[data-er-options] input[type=checkbox]').forEach(x=>x.checked=false);const interval=l.querySelector('[data-er-interval]');if(interval)interval.value='5';const custom=l.querySelector('[data-er-custom]');if(custom)custom.value='';const lt=l.querySelector('[data-er-link-type]');if(lt)lt.value='none';const lv=l.querySelector('[data-er-link-value]');if(lv)lv.value='';});$('erFormTitle').textContent='새 이벤트 루틴';$('erSaveBtn').textContent='이벤트 저장';$('erDeleteBtn').classList.add('hidden');$('erDuplicateBtn').classList.add('hidden');$('erPreview').classList.add('hidden');scheduleUI();render();}
function edit(id){const r=routines.find(x=>String(x.id)===String(id));if(!r)return;selectedId=r.id;$('erId').value=r.id;$('erName').value=r.name||'';$('erDescription').value=r.description||'';$('erRegion').value=r.region||region();$('erScheduleType').value=r.schedule_type||'range';$('erEnabled').value=String(r.enabled!==false);$('erStartAt').value=r.start_at||'';$('erEndAt').value=r.end_at||'';$('erRepeatType').value=r.repeat_type||'weekly';$('erRepeatValue').value=r.repeat_value||'';document.querySelectorAll('#erActionGrid>label').forEach(l=>{const cb=l.querySelector(':scope > input[type=checkbox]');let a=r.actions?.[cb.value];if(cb.value==='alert'&&r.actions?.ticker){const legacy=r.actions.ticker;a={...(a||{}),options:[...new Set([...(a?.options||[]),...(legacy.options||[])])],custom_items:[...(a?.custom_items||[]),...(legacy.custom_items||[])],interval_seconds:a?.interval_seconds||legacy.interval_seconds||5,link_type:a?.link_type||legacy.link_type||'none',link_value:a?.link_value||legacy.link_value||''};}cb.checked=!!a;l.classList.toggle('selected',!!a);l.querySelectorAll('[data-er-options] input[type=checkbox]').forEach(x=>x.checked=Array.isArray(a?.options)&&a.options.includes(x.value));const interval=l.querySelector('[data-er-interval]');if(interval)interval.value=String(a?.interval_seconds||5);const custom=l.querySelector('[data-er-custom]');if(custom)custom.value=(a?.custom_items||[]).map(x=>typeof x==='string'?x:x.text).filter(Boolean).join('\n');const lt=l.querySelector('[data-er-link-type]');if(lt)lt.value=a?.link_type||'none';const lv=l.querySelector('[data-er-link-value]');if(lv)lv.value=a?.link_value||'';});$('erFormTitle').textContent='이벤트 루틴 수정';$('erSaveBtn').textContent='변경 저장';$('erDeleteBtn').classList.remove('hidden');$('erDuplicateBtn').classList.remove('hidden');scheduleUI();render();}
function scheduleUI(){const t=$('erScheduleType').value;document.querySelectorAll('.er-repeat-field').forEach(x=>x.classList.toggle('hidden',t!=='repeat'));document.querySelectorAll('.er-date-field').forEach(x=>x.classList.remove('hidden'));if(t==='today'){const n=new Date(),pad=v=>String(v).padStart(2,'0'),day=`${n.getFullYear()}-${pad(n.getMonth()+1)}-${pad(n.getDate())}`;$('erStartAt').value=`${day}T00:00`;$('erEndAt').value=`${day}T23:59`;}if(t==='open')$('erEndAt').value='';}
function payload(){const name=$('erName').value.trim();if(!name)throw new Error('이벤트 이름을 입력하세요.');const actions={};document.querySelectorAll('#erActionGrid>label').forEach(l=>{const cb=l.querySelector(':scope > input[type=checkbox]');if(!cb.checked)return;const optionBox=l.querySelector('[data-er-options]');const options=optionBox?[...optionBox.querySelectorAll('input[type=checkbox]:checked')].map(x=>x.value):[];const custom=l.querySelector('[data-er-custom]');const customItems=(custom?.value||'').split('\n').map(x=>x.trim()).filter(Boolean).map(text=>({text}));if(!options.length&&!customItems.length)throw new Error(`${ACTION_LABELS[cb.value]}에서 유형을 선택하거나 직접 문구를 입력하세요.`);const interval=l.querySelector('[data-er-interval]');const linkType=l.querySelector('[data-er-link-type]')?.value||'none';const linkValue=l.querySelector('[data-er-link-value]')?.value.trim()||'';const action={options,custom_items:customItems,interval_seconds:Number(interval?.value||5),mode:'rotate',link_type:linkType,link_value:linkValue};action.detail=actionSummary(action,cb.value);actions[cb.value]=action;});if(!Object.keys(actions).length)throw new Error('실행할 영역을 하나 이상 선택하세요.');const t=$('erScheduleType').value,start=$('erStartAt').value,end=$('erEndAt').value;if(['range','today'].includes(t)&&(!start||!end))throw new Error('시작과 종료 날짜를 입력하세요.');if(start&&end&&new Date(end)<new Date(start))throw new Error('종료 날짜는 시작 날짜보다 빠를 수 없습니다.');return{id:$('erId').value||`event-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,name,description:$('erDescription').value.trim(),region:$('erRegion').value,schedule_type:t,enabled:$('erEnabled').value==='true',start_at:start||null,end_at:t==='open'?null:(end||null),repeat_type:$('erRepeatType').value,repeat_value:$('erRepeatValue').value.trim(),actions,updated_at:new Date().toISOString()};}
async function saveForm(){try{const r=payload(),i=routines.findIndex(x=>String(x.id)===String(r.id));const isEdit=i>=0;if(isEdit)routines[i]={...routines[i],...r};else routines.push({...r,created_at:new Date().toISOString()});await save();edit(r.id);logActivity(`${r.name} ${isEdit?'수정':'추가'} · ${Object.keys(r.actions).map(k=>ACTION_LABELS[k]).join(', ')}`,isEdit?'updated':'created');alert('이벤트 루틴을 저장했습니다. 선택 유형과 직접 문구는 함께 순환하도록 저장됩니다.');}catch(e){alert(e.message);}}
async function remove(){if(!selectedId||!confirm('이 이벤트 루틴을 삭제할까요?'))return;const r=routines.find(x=>String(x.id)===String(selectedId));routines=routines.filter(x=>String(x.id)!==String(selectedId));await save();logActivity(`${r?.name||'이벤트'} 삭제`,'deleted');reset();}
async function duplicate(){const r=routines.find(x=>String(x.id)===String(selectedId));if(!r)return;const copy=structuredClone(r);copy.id=`event-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;copy.name=`${r.name} 복사본`;copy.enabled=false;copy.created_at=new Date().toISOString();routines.push(copy);await save();logActivity(`${r.name} 복제본 생성`,'duplicated');edit(copy.id);}
function preview(){try{const r=payload();$('erPreview').innerHTML=`<strong>${esc(r.name)}</strong><br>${esc(dateText(r))}<br><br>${Object.entries(r.actions).map(([k,v])=>`• ${esc(ACTION_LABELS[k])}: ${esc(actionSummary(v,k))}${v.interval_seconds?` · ${esc(v.interval_seconds)}초마다 순환`:''}`).join('<br>')}<br><br><strong>동시 실행 규칙:</strong> 다른 이벤트를 덮어쓰지 않고 선택 콘텐츠와 직접 문구를 합쳐 순환합니다.`;$('erPreview').classList.remove('hidden');}catch(e){alert(e.message);}}
function renderDashboard(){const activeBox=$('erDashboardActive'),activityBox=$('erDashboardActivity'),upcomingBox=$('erDashboardUpcoming');if(activeBox){const active=routines.filter(r=>statusOf(r)==='active');activeBox.innerHTML=active.length?active.map(r=>`<div class="er-dashboard-item"><div class="er-dashboard-item-head"><strong>${esc(r.name)}</strong><span class="er-mini-status">적용 중</span></div><p>${Object.entries(r.actions||{}).map(([k,v])=>`${ACTION_LABELS[k]}: ${actionSummary(v,k)}`).join('<br>')}</p></div>`).join(''):'<div class="dashboard-empty">현재 적용 중인 이벤트가 없습니다.</div>';}
 if(activityBox){const rows=readActivity().slice(0,12);activityBox.innerHTML=rows.length?rows.map(x=>`<div class="er-activity-item"><time>${new Date(x.at).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit'})}</time><span>${esc(x.message)}</span></div>`).join(''):'<div class="dashboard-empty">활동 내역이 없습니다.</div>';}
 if(upcomingBox){const n=new Date(),start=new Date(n.getFullYear(),n.getMonth(),n.getDate()).getTime(),end=start+86400000;const items=[];routines.forEach(r=>{const s=r.start_at?new Date(r.start_at).getTime():0,e=r.end_at?new Date(r.end_at).getTime():0;if(s>=start&&s<end)items.push({time:s,label:`${r.name} 시작`});if(e>=start&&e<end)items.push({time:e,label:`${r.name} 종료`});});items.sort((a,b)=>a.time-b.time);upcomingBox.innerHTML=items.length?items.map(x=>`<div class="er-dashboard-item"><div class="er-dashboard-item-head"><strong>${esc(x.label)}</strong><span>${new Date(x.time).toLocaleTimeString('ko-KR',{hour:'numeric',minute:'2-digit'})}</span></div></div>`).join(''):'<div class="dashboard-empty">오늘 예정된 작업이 없습니다.</div>';}}
function init(){if(!$('section-eventRoutines'))return;try{['dallas','denver','colorado','all'].forEach(r=>{localStorage.removeItem(`kfocus_active_event_routines_v67_${r}`);localStorage.removeItem(`kfocus_active_event_routines_v63_${r}`);});}catch(e){}$('erNewBtn').onclick=reset;$('erSaveBtn').onclick=saveForm;$('erDeleteBtn').onclick=remove;$('erDuplicateBtn').onclick=duplicate;$('erPreviewBtn').onclick=preview;$('erStatusFilter').onchange=render;$('erScheduleType').onchange=scheduleUI;document.querySelectorAll('#erActionGrid>label').forEach(l=>{const cb=l.querySelector(':scope > input[type=checkbox]');if(!cb)return;cb.onchange=()=>l.classList.toggle('selected',cb.checked);l.querySelectorAll('[data-er-options] input[type=checkbox]').forEach(opt=>opt.onchange=()=>{if(opt.checked&&!cb.checked){cb.checked=true;l.classList.add('selected');}});const custom=l.querySelector('[data-er-custom]');if(custom)custom.oninput=()=>{if(custom.value.trim()&&!cb.checked){cb.checked=true;l.classList.add('selected');}};});reset();load();setInterval(()=>{publishRuntime();render();},60000);}
document.addEventListener('DOMContentLoaded',init);
window.KFocusEventRoutines={getAll:()=>structuredClone(routines),getActive:()=>routines.filter(r=>statusOf(r)==='active').map(r=>structuredClone(r)),refresh:load};
