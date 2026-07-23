(() => {
  const KEY = 'daltownmap_business_crm_v21';
  const DEFAULT_RULES = { couponDays: 30, bannerDays: 60, dalpickDays: 30 };
  const $ = id => document.getElementById(id);
  let state = { rules: { ...DEFAULT_RULES }, manual: {} };
  try { state = { ...state, ...(JSON.parse(localStorage.getItem(KEY) || '{}')) }; } catch {}
  state.rules = { ...DEFAULT_RULES, ...(state.rules || {}) };
  state.manual ||= {};
  const save = () => localStorage.setItem(KEY, JSON.stringify(state));
  const esc = (v='') => String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const dateOf = row => row?.published_at || row?.start_at || row?.created_at || row?.updated_at || null;
  const daysAgo = value => value ? Math.floor((Date.now() - new Date(value).getTime()) / 86400000) : Infinity;
  const fmt = value => value ? new Date(value).toLocaleDateString('ko-KR') : '없음';
  const addDays = (value, days) => { if (!value) return null; const d = new Date(value); d.setDate(d.getDate()+Number(days)); return d; };
  const bridge = () => window.KFocusAdminBridge || {};
  const rowsFor = (rows, id) => (rows || []).filter(x => String(x.business_id) === String(id) && x.is_active !== false);
  const latest = rows => [...rows].sort((a,b)=>new Date(dateOf(b)||0)-new Date(dateOf(a)||0))[0] || null;

  function snapshot(){
    return {
      businesses: bridge().getBusinesses?.() || [],
      coupons: bridge().getCoupons?.() || [],
      banners: bridge().getBanners?.() || [],
      dalpicks: bridge().getDalpicks?.() || []
    };
  }
  function itemStatus(last, ruleDays){
    const age = daysAgo(dateOf(last));
    if (!last) return {ok:false, due:true, label:'없음', age};
    if (age >= ruleDays) return {ok:false, due:true, label:`${age}일 경과`, age};
    return {ok:true, due:false, label:`${age}일 전`, age};
  }
  function buildBusiness(b, data){
    const id=String(b.id), coupon=latest(rowsFor(data.coupons,id)), banner=latest(rowsFor(data.banners,id)), dalpick=latest(rowsFor(data.dalpicks,id));
    const checks={
      coupon:itemStatus(coupon,state.rules.couponDays),
      banner:itemStatus(banner,state.rules.bannerDays),
      dalpick:itemStatus(dalpick,state.rules.dalpickDays)
    };
    const manual=state.manual[id] || {};
    const manualKeys=['sns','push','video'];
    const score = [checks.coupon.ok,checks.banner.ok,checks.dalpick.ok].filter(Boolean).length*20 + manualKeys.filter(k=>manual[k]).length*(40/3);
    const tasks=[];
    if(checks.coupon.due) tasks.push({type:'coupon',label:coupon?'쿠폰 갱신':'첫 쿠폰 생성'});
    if(checks.banner.due) tasks.push({type:'banners',label:banner?'배너 교체':'첫 배너 생성'});
    if(checks.dalpick.due) tasks.push({type:'dalpick',label:dalpick?'DalPick 갱신':'DalPick 생성'});
    if(!manual.sns) tasks.push({type:'manual:sns',label:'SNS 제작 확인'});
    if(!manual.push) tasks.push({type:'manual:push',label:'Push 발송 확인'});
    return {id,b,name:b.name_ko||b.name_en||b.name||id,category:b.category_ko||b.category||'',coupon,banner,dalpick,checks,manual,score:Math.round(score),tasks};
  }
  function statusOf(score){ return score>=80?'good':score>=50?'warn':'risk'; }
  function statusLabel(s){ return s==='good'?'정상':s==='warn'?'주의':'관리 필요'; }
  function openSection(section,businessId){
    const btn=document.querySelector(`#adminNav [data-section="${section}"]`); if(btn) btn.click();
    if(businessId){
      setTimeout(()=>{
        const ids={coupon:'coupon_business_id',banners:'banner_business_id',dalpick:'dalpick_business_id'};
        const el=$(ids[section]); if(el){el.value=businessId;el.dispatchEvent(new Event('change',{bubbles:true}));}
      },150);
    }
  }
  function render(){
    const data=snapshot();
    const all=data.businesses.filter(b=>b.is_active!==false).map(b=>buildBusiness(b,data));
    const q=($('crmSearch')?.value||'').trim().toLowerCase(); const filter=$('crmStatusFilter')?.value||'all'; const sort=$('crmSort')?.value||'scoreAsc';
    let rows=all.filter(x=>(!q||`${x.name} ${x.category}`.toLowerCase().includes(q))&&(filter==='all'||statusOf(x.score)===filter));
    rows.sort(sort==='name'?(a,b)=>a.name.localeCompare(b.name,'ko'):sort==='taskDesc'?(a,b)=>b.tasks.length-a.tasks.length:a.score-b.score);
    $('crmBusinessCount') && ($('crmBusinessCount').textContent=all.length);
    $('crmGoodCount') && ($('crmGoodCount').textContent=all.filter(x=>statusOf(x.score)==='good').length);
    $('crmWarnCount') && ($('crmWarnCount').textContent=all.filter(x=>statusOf(x.score)==='warn').length);
    $('crmRiskCount') && ($('crmRiskCount').textContent=all.filter(x=>statusOf(x.score)==='risk').length);
    const tasks=all.flatMap(x=>x.tasks.filter(t=>!t.type.startsWith('manual:')).map(t=>({...t,business:x}))).slice(0,30);
    $('crmTaskCount') && ($('crmTaskCount').textContent=`${tasks.length}건`);
    if($('crmTaskList')) $('crmTaskList').innerHTML=tasks.length?tasks.map(t=>`<article class="crm-task"><div><strong>${esc(t.business.name)}</strong><span>${esc(t.label)}</span></div><button class="btn small" data-crm-go="${esc(t.type)}" data-business="${esc(t.business.id)}">바로가기</button></article>`).join(''):'<p class="crm-empty">오늘 마감된 필수 작업이 없습니다.</p>';
    if($('crmBusinessList')) $('crmBusinessList').innerHTML=rows.length?rows.map(cardHtml).join(''):'<p class="crm-empty">조건에 맞는 업소가 없습니다.</p>';
    bindDynamic();
  }
  function statusCell(key,label,last,check,id){
    const due=addDays(dateOf(last),state.rules[key+'Days']);
    return `<div class="crm-content-cell ${check.ok?'ok':'due'}"><div><strong>${label}</strong><span>${check.ok?'✓':'!'}</span></div><small>최근 ${fmt(dateOf(last))}</small><small>다음 권장 ${due?fmt(due):'지금 생성'}</small></div>`;
  }
  function cardHtml(x){ const s=statusOf(x.score); return `<article class="crm-business-card" data-status="${s}">
    <div class="crm-business-head"><div><span class="crm-dot ${s}"></span><strong>${esc(x.name)}</strong><small>${esc(x.category||'카테고리 없음')}</small></div><div class="crm-score ${s}"><b>${x.score}</b><span>점 · ${statusLabel(s)}</span></div></div>
    <div class="crm-content-grid">${statusCell('coupon','쿠폰',x.coupon,x.checks.coupon,x.id)}${statusCell('banner','배너',x.banner,x.checks.banner,x.id)}${statusCell('dalpick','DalPick',x.dalpick,x.checks.dalpick,x.id)}</div>
    <div class="crm-manual-row"><span>운영 체크</span>${['sns','push','video'].map(k=>`<label><input type="checkbox" data-crm-manual="${k}" data-business="${esc(x.id)}" ${x.manual[k]?'checked':''}> ${k==='sns'?'SNS':k==='push'?'Push':'영상'}</label>`).join('')}</div>
    <div class="crm-card-actions"><button class="btn ghost small" data-crm-go="coupon" data-business="${esc(x.id)}">쿠폰</button><button class="btn ghost small" data-crm-go="banners" data-business="${esc(x.id)}">배너</button><button class="btn ghost small" data-crm-go="dalpick" data-business="${esc(x.id)}">DalPick</button><button class="btn primary small" data-crm-go="aiStudio" data-business="${esc(x.id)}">AI 제작</button></div>
  </article>`; }
  function bindDynamic(){
    document.querySelectorAll('[data-crm-go]').forEach(btn=>btn.onclick=()=>openSection(btn.dataset.crmGo,btn.dataset.business));
    document.querySelectorAll('[data-crm-manual]').forEach(input=>input.onchange=()=>{const id=input.dataset.business;state.manual[id]||={};state.manual[id][input.dataset.crmManual]=input.checked;save();render();});
  }
  function loadRules(){ if($('crmCouponDays')) $('crmCouponDays').value=state.rules.couponDays;if($('crmBannerDays')) $('crmBannerDays').value=state.rules.bannerDays;if($('crmDalpickDays')) $('crmDalpickDays').value=state.rules.dalpickDays; }
  function bind(){
    loadRules();
    $('crmRefreshBtn')?.addEventListener('click',render);
    $('crmSaveRulesBtn')?.addEventListener('click',()=>{state.rules={couponDays:Math.max(1,Number($('crmCouponDays').value)||30),bannerDays:Math.max(1,Number($('crmBannerDays').value)||60),dalpickDays:Math.max(1,Number($('crmDalpickDays').value)||30)};save();render();alert('홍보 관리 기준을 저장했습니다.');});
    ['crmSearch','crmStatusFilter','crmSort'].forEach(id=>$(id)?.addEventListener(id==='crmSearch'?'input':'change',render));
    ['kfocus:businesses-loaded','kfocus:coupons-loaded','kfocus:banners-loaded','kfocus:dalpicks-loaded'].forEach(ev=>window.addEventListener(ev,render));
    setTimeout(render,700); setTimeout(render,2000);
  }
  document.addEventListener('DOMContentLoaded',bind);
})();
