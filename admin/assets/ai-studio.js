const $ = (id) => document.getElementById(id);
const esc = (s='') => String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

const ASSETS = [
  ['dalpick','📰','DalPick 기사','검색과 홈 노출의 중심 콘텐츠'],
  ['guide','📘','AI Guide','생활정보·절차·추천 가이드'],
  ['coupon','🎟️','쿠폰','할인·무료·특별 혜택'],
  ['banner','🖼️','메인 배너','홈 또는 업소 상세 광고'],
  ['social','📱','SNS','Instagram·Facebook 문안'],
  ['push','🔔','푸시 알림','짧고 즉각적인 공지'],
  ['video','🎬','숏폼 영상','30~45초 대본과 훅'],
  ['image_prompt','✨','대표 이미지','이미지 생성 프롬프트']
];
let analysis = null;
let suite = null;

function bridge(){ return window.KFocusAdminBridge || {}; }
function switchSection(name){
  if(typeof bridge().switchSection === 'function') bridge().switchSection(name);
  else document.querySelector(`[data-section="${name}"]`)?.click();
}
function setValue(id,v){ const el=$(id); if(el) el.value=v ?? ''; }
function setChecked(id,v){ const el=$(id); if(el) el.checked=!!v; }
function selectedTypes(){ return [...document.querySelectorAll('#ucsAssetSelector input:checked')].map(x=>x.value); }
function selectedThemes(){ return [...document.querySelectorAll('#ucsThemes input:checked')].map(x=>x.value); }
function setBusy(btn,busy,text){ if(!btn)return; if(!btn.dataset.original) btn.dataset.original=btn.textContent; btn.disabled=busy; btn.textContent=busy?text:btn.dataset.original; }
function notify(msg){ alert(msg); }

function populateBusinesses(){
  const rows = typeof bridge().getBusinesses === 'function' ? bridge().getBusinesses() : [];
  const el=$('ucsBusiness'); if(!el)return;
  const current=el.value;
  el.innerHTML='<option value="">연결 안 함</option>'+rows.map(b=>`<option value="${esc(b.id)}">${esc(b.name_ko||b.name_en||b.id)}</option>`).join('');
  el.value=current;
}

function renderAnalysis(a){
  analysis=a;
  $('ucsPlanSection')?.classList.remove('hidden');
  $('ucsResultsSection')?.classList.add('hidden');
  $('ucsIntentLabel').textContent=a.intent_label||a.intent_type||'-';
  $('ucsExplanation').textContent=a.explanation||'';
  setValue('ucsGoal',a.suggested_goal||'');
  setValue('ucsAudience',a.suggested_audience||'달라스 지역 한인');
  setValue('ucsTone',a.suggested_tone||'친근하고 신뢰감 있게');
  const help={none:'업소 연결 없이 진행할 수 있습니다.',optional:'관련 업소가 있으면 선택할 수 있습니다.',required:'이 주제는 연결 업소를 선택하는 것이 필요합니다.'};
  $('ucsBusinessHelp').textContent=help[a.business_requirement]||'';
  populateBusinesses();

  const themes=(a.recommended_themes||[]).slice(0,8);
  $('ucsThemes').innerHTML=themes.length?themes.map(t=>`<label class="ucs-chip"><input type="checkbox" value="${esc(t)}" checked>${esc(t)}</label>`).join(''):'<span class="muted">추천 테마 없음</span>';
  const recommended=new Set(a.recommended_types||[]);
  $('ucsAssetSelector').innerHTML=ASSETS.map(([key,icon,label,desc])=>{
    const on=recommended.has(key);
    const reason=(a.asset_reasons||[]).find(x=>x.type===key)?.reason || desc;
    return `<label class="ucs-asset-card ${on?'recommended':''}"><div class="ucs-asset-top"><input type="checkbox" value="${key}" ${on?'checked':''}><span>${icon}</span><strong>${label}</strong></div><small>${esc(reason)}</small></label>`;
  }).join('');
  $('ucsPlanSection').scrollIntoView({behavior:'smooth',block:'start'});
}

async function analyzeTopic(){
  const topic=$('ucsTopic')?.value.trim();
  if(!topic)return notify('무엇에 관한 콘텐츠인지 주제를 입력하세요.');
  const btn=$('ucsAnalyzeBtn'); setBusy(btn,true,'분석 중...');
  $('ucsAnalyzeStatus').textContent='AI가 콘텐츠 성격, 추천 테마와 제작물을 분석하고 있습니다...';
  try{
    const r=await fetch('/.netlify/functions/generate-content-suite',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'analyze',topic})});
    const j=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(j.error||'주제 분석 실패');
    renderAnalysis(j.analysis||{});
    $('ucsAnalyzeStatus').textContent='분석 완료 · 추천안을 확인하고 필요한 항목을 선택하세요.';
  }catch(e){ $('ucsAnalyzeStatus').textContent=`오류: ${e.message}`; notify(e.message); }
  finally{ setBusy(btn,false); }
}

function businessPayload(){
  const id=$('ucsBusiness')?.value||'';
  const rows=typeof bridge().getBusinesses==='function'?bridge().getBusinesses():[];
  const b=rows.find(x=>String(x.id)===String(id));
  if(!b)return null;
  return {id:b.id,name:b.name_ko||b.name_en||'',category:b.category_ko||'',address:b.address||'',phone:b.phone||'',website:b.website||'',description:b.description||'',image_url:b.image_url||''};
}

async function generateSuite(){
  const topic=$('ucsTopic')?.value.trim();
  const types=selectedTypes();
  if(!topic)return notify('주제를 입력하세요.');
  if(!analysis)return notify('먼저 AI 분석을 실행하세요.');
  if(!types.length)return notify('생성할 콘텐츠를 하나 이상 선택하세요.');
  if(analysis.business_requirement==='required'&&!$('ucsBusiness')?.value)return notify('이 주제는 연결 업소를 선택해야 합니다.');
  const btn=$('ucsGenerateBtn'); setBusy(btn,true,'생성 중...');
  try{
    const payload={topic,goal:$('ucsGoal')?.value.trim(),audience:$('ucsAudience')?.value.trim(),tone:$('ucsTone')?.value.trim(),instructions:[`선택 테마: ${selectedThemes().join(', ')}`,$('ucsInstructions')?.value.trim()].filter(Boolean).join('\n'),content_types:types,business:businessPayload(),analysis};
    const r=await fetch('/.netlify/functions/generate-content-suite',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const j=await r.json().catch(()=>({})); if(!r.ok)throw new Error(j.error||'콘텐츠 생성 실패');
    suite=j.suite||{}; renderResults(types,suite); $('ucsResultsSection')?.classList.remove('hidden'); $('ucsResultsSection').scrollIntoView({behavior:'smooth',block:'start'});
  }catch(e){notify(e.message);}finally{setBusy(btn,false);}
}

function stringifyAsset(type,s){
  if(type==='dalpick') return `${s.dalpick?.title||''}\n\n${s.dalpick?.summary||''}\n\n${s.dalpick?.content||''}`.trim();
  if(type==='guide') return `${s.guide?.title||''}\n\n${s.guide?.summary||''}\n\n${s.guide?.content||''}`.trim();
  if(type==='coupon') return `${s.coupon?.title||''}\n혜택: ${s.coupon?.discount_label||''}\n코드: ${s.coupon?.coupon_code||''}\n${s.coupon?.description||''}`.trim();
  if(type==='banner') return `${s.banner?.title||''}\n${s.banner?.description||''}\nCTA: ${s.banner?.button_label||''}\n\n이미지 프롬프트:\n${s.banner?.image_prompt||''}`.trim();
  if(type==='social') return `Instagram\n${s.social?.instagram||''}\n\nFacebook\n${s.social?.facebook||''}\n\n짧은 문구\n${s.social?.short_caption||''}`.trim();
  if(type==='push') return `${s.push?.title||''}\n${s.push?.message||''}`.trim();
  if(type==='video') return `HOOK\n${s.video?.hook||''}\n\nSCRIPT\n${s.video?.script||''}\n\nTHUMBNAIL\n${s.video?.thumbnail_text||''}`.trim();
  if(type==='image_prompt') return s.dalpick?.image_prompt||s.banner?.image_prompt||'';
  return '';
}

function renderResults(types,s){
  const score=Number(s.marketing_score||0);
  const checks=s.checklist||[];
  $('ucsScoreBox').innerHTML=`<div><span class="ucs-score-number">${score||'-'}점</span> <strong>AI 마케팅 점수</strong></div><div class="muted">${esc(s.strategy_summary||'')}</div><div class="ucs-checklist">${checks.map(c=>`<div class="ucs-check-${c.status}">${c.status==='pass'?'✓':c.status==='warning'?'⚠':'ℹ'} <b>${esc(c.label)}</b> · ${esc(c.message)}</div>`).join('')}</div>`;
  $('ucsResultStatus').textContent=`${types.length}개 콘텐츠 생성 완료 · 내용을 수정하거나 각 관리 화면으로 보내세요.`;
  $('ucsResults').innerHTML=types.map(type=>{
    const meta=ASSETS.find(x=>x[0]===type)||[type,'','콘텐츠',''];
    return `<article class="ucs-result-card" data-result="${type}"><div class="ucs-result-head"><strong>${meta[1]} ${meta[2]}</strong><div class="ucs-result-actions"><button class="btn ghost ucs-copy" data-type="${type}" type="button">복사</button>${actionButton(type)}</div></div><textarea id="ucsResult_${type}">${esc(stringifyAsset(type,s))}</textarea></article>`;
  }).join('');
  document.querySelectorAll('.ucs-copy').forEach(b=>b.addEventListener('click',()=>navigator.clipboard.writeText($(`ucsResult_${b.dataset.type}`)?.value||'').then(()=>notify('복사했습니다.'))));
  document.querySelectorAll('[data-send-asset]').forEach(b=>b.addEventListener('click',()=>sendAsset(b.dataset.sendAsset)));
}
function actionButton(type){
  const labels={dalpick:'DalPick 관리로 보내기',guide:'가이드 관리로 보내기',coupon:'쿠폰으로 등록',banner:'배너 관리로 보내기',push:'푸시 발송으로 보내기'};
  return labels[type]?`<button class="btn secondary" data-send-asset="${type}" type="button">${labels[type]}</button>`:'';
}

function sendAsset(type){
  if(!suite)return;
  const b=businessPayload();
  if(type==='dalpick'){
    switchSection('dalpick');
    setValue('dalpick_topic',$('ucsTopic')?.value||''); setValue('dalpick_category',suite.dalpick?.category||analysis?.suggested_dalpick_category||'themed');
    setValue('dalpick_title',suite.dalpick?.title); setValue('dalpick_summary',suite.dalpick?.summary); setValue('dalpick_content',suite.dalpick?.content); setValue('dalpick_business_id',b?.id||'');
    window.dispatchEvent(new Event('resize')); notify('DalPick 관리 화면에 내용을 채웠습니다. 검토 후 저장하세요.');
  } else if(type==='guide'){
    switchSection('board'); setValue('board_type','guide'); setValue('board_title',suite.guide?.title); setValue('board_content',`${suite.guide?.summary||''}\n\n${suite.guide?.content||''}`.trim()); setValue('board_business_id',b?.id||''); setValue('board_business_select',b?.id||''); setChecked('board_is_active',false); notify('가이드 관리 화면에 초안을 채웠습니다. 검토 후 저장하세요.');
  } else if(type==='coupon'){
    switchSection('coupon'); setValue('coupon_business_id',b?.id||''); setValue('coupon_title',suite.coupon?.title); setValue('coupon_discount_label',suite.coupon?.discount_label); setValue('coupon_description',suite.coupon?.description); setValue('coupon_code',suite.coupon?.coupon_code); notify('쿠폰 입력 화면에 내용을 채웠습니다. 기간과 이미지를 확인한 뒤 저장하세요.');
  } else if(type==='banner'){
    switchSection('banners'); setValue('bnTitle',suite.banner?.title); setValue('bnDescription',suite.banner?.description); setValue('bnButtonLabel',suite.banner?.button_label); setValue('bnBusinessId',b?.id||''); notify('배너 입력 화면에 문구를 채웠습니다. 이미지를 만든 뒤 저장하세요.');
  } else if(type==='push'){
    switchSection('push'); setValue('pushTitle',suite.push?.title); setValue('pushMessage',suite.push?.message); notify('푸시 발송 화면에 내용을 채웠습니다. 대상과 링크를 확인하세요.');
  }
}

function reset(){
  analysis=null;suite=null;setValue('ucsTopic','');setValue('ucsInstructions','');$('ucsPlanSection')?.classList.add('hidden');$('ucsResultsSection')?.classList.add('hidden');$('ucsAnalyzeStatus').textContent='주제를 입력하면 AI가 기획안을 제안합니다.';
}
function bind(){
  $('ucsAnalyzeBtn')?.addEventListener('click',analyzeTopic); $('ucsGenerateBtn')?.addEventListener('click',generateSuite); $('ucsResetBtn')?.addEventListener('click',reset);
  $('ucsSelectAll')?.addEventListener('click',()=>document.querySelectorAll('#ucsAssetSelector input').forEach(x=>x.checked=true));
  $('ucsClearAll')?.addEventListener('click',()=>document.querySelectorAll('#ucsAssetSelector input').forEach(x=>x.checked=false));
  window.addEventListener('kfocus:businesses-loaded',populateBusinesses); populateBusinesses();
}
document.addEventListener('DOMContentLoaded',bind);
