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
const WORKFLOW_KEY = 'daltownmap_ai_studio_workflow_v1';
const ASSET_LABELS = {dalpick:'DalPick', guide:'AI Guide', coupon:'쿠폰', banner:'배너', social:'SNS', push:'푸시', video:'숏폼 영상', image_prompt:'대표 이미지'};
let workflowContext = null;

function saveWorkflowContext(ctx){
  workflowContext = ctx || null;
  if(workflowContext) localStorage.setItem(WORKFLOW_KEY, JSON.stringify(workflowContext));
  else localStorage.removeItem(WORKFLOW_KEY);
}
function readWorkflowContext(){
  try { return JSON.parse(localStorage.getItem(WORKFLOW_KEY) || 'null'); } catch { return null; }
}
function selectOnlyAsset(type){
  document.querySelectorAll('#ucsAssetSelector input').forEach(input => { input.checked = input.value === type; });
}
function waitForBusiness(businessId, attempt=0){
  populateBusinesses();
  const el=$('ucsBusiness');
  if(el && [...el.options].some(o=>String(o.value)===String(businessId))){
    el.value=String(businessId); el.dispatchEvent(new Event('change',{bubbles:true})); return;
  }
  if(attempt<20) setTimeout(()=>waitForBusiness(businessId,attempt+1),150);
}
function applyWorkflowContext(ctx){
  if(!ctx) return;
  workflowContext=ctx;
  if(ctx.businessId) waitForBusiness(ctx.businessId);
  if(ctx.topic) setValue('ucsTopic',ctx.topic);
  else if(ctx.businessName && !$('ucsTopic')?.value) setValue('ucsTopic',`${ctx.businessName} ${ASSET_LABELS[ctx.assetType]||'마케팅 콘텐츠'} 제작`);
  if(ctx.instructions) setValue('ucsInstructions',ctx.instructions);
  const status=$('ucsAnalyzeStatus');
  if(status) status.textContent=`${ctx.businessName||'선택 업소'}의 ${ASSET_LABELS[ctx.assetType]||'콘텐츠'} ${ctx.mode==='refresh'?'갱신':'신규 제작'} 요청이 연결되었습니다. AI 분석을 실행하세요.`;
  // Analysis has not rendered the selector yet; preserve desired type and apply after renderAnalysis.
}
function openFromWorkflow(ctx={}){
  saveWorkflowContext({...ctx, openedAt:new Date().toISOString()});
  switchSection('aiStudio');
  setTimeout(()=>applyWorkflowContext(workflowContext),120);
}
window.DalTownAIStudio = { open: openFromWorkflow, getContext:()=>workflowContext, clearContext:()=>saveWorkflowContext(null) };
window.addEventListener('daltown:open-ai-studio',e=>openFromWorkflow(e.detail||{}));

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

function truncateText(value,max=900){const t=String(value||'').trim();return t.length>max?t.slice(0,max)+'…':t;}
async function fetchJsonDetailed(url,options={},label='요청'){
  let response;
  try{response=await fetch(url,options);}catch(error){
    const e=new Error(`${label} 연결 실패: ${error.message||'네트워크 오류'}`);e.stage='network';throw e;
  }
  const raw=await response.text();
  let data={};
  try{data=raw?JSON.parse(raw):{};}catch(_){
    const e=new Error(`${label} 응답을 해석하지 못했습니다. HTTP ${response.status}\n${truncateText(raw)||'응답 본문 없음'}`);e.status=response.status;e.stage='parse';throw e;
  }
  if(!response.ok){
    const message=data.error||data.message||`${label} 실패`;
    const detail=[data.stage&&`단계: ${data.stage}`,data.code&&`코드: ${data.code}`,data.detail&&`상세: ${data.detail}`,`HTTP: ${response.status}`].filter(Boolean).join('\n');
    const e=new Error(`${message}${detail?'\n'+detail:''}`);e.status=response.status;e.stage=data.stage||'server';e.payload=data;throw e;
  }
  return data;
}
function showStudioError(title,error,statusEl){
  console.error(`[AI Studio] ${title}`,error);
  const message=error?.message||String(error||'알 수 없는 오류');
  if(statusEl)statusEl.textContent=`${title}: ${message.replace(/\n/g,' · ')}`;
  notify(`${title}\n\n${message}\n\nNetlify Functions 로그에서도 같은 시간의 오류를 확인할 수 있습니다.`);
}


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
  if(workflowContext?.assetType) selectOnlyAsset(workflowContext.assetType);
  $('ucsPlanSection').scrollIntoView({behavior:'smooth',block:'start'});
}

async function analyzeTopic(){
  const topic=$('ucsTopic')?.value.trim();
  if(!topic)return notify('무엇에 관한 콘텐츠인지 주제를 입력하세요.');
  const btn=$('ucsAnalyzeBtn'); setBusy(btn,true,'분석 중...');
  $('ucsAnalyzeStatus').textContent='AI가 콘텐츠 성격, 추천 테마와 제작물을 분석하고 있습니다...';
  try{
    const j=await fetchJsonDetailed('/.netlify/functions/generate-content-suite',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'analyze',topic})},'주제 분석');
    renderAnalysis(j.analysis||{});
    $('ucsAnalyzeStatus').textContent='분석 완료 · 추천안을 확인하고 필요한 항목을 선택하세요.';
  }catch(e){ showStudioError('주제 분석 실패',e,$('ucsAnalyzeStatus')); }
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
  const btn=$('ucsGenerateBtn'); setBusy(btn,true,'1/3 문구 생성 중...');
  const progress=$('ucsAnalyzeStatus');
  try{
    if(progress)progress.textContent='1/3 · AI가 캠페인 문구와 이미지 프롬프트를 생성하고 있습니다...';
    const payload={topic,goal:$('ucsGoal')?.value.trim(),audience:$('ucsAudience')?.value.trim(),tone:$('ucsTone')?.value.trim(),instructions:[`선택 테마: ${selectedThemes().join(', ')}`,$('ucsInstructions')?.value.trim()].filter(Boolean).join('\n'),content_types:types,business:businessPayload(),analysis};
    const j=await fetchJsonDetailed('/.netlify/functions/generate-content-suite',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)},'콘텐츠 문구 생성');
    suite=j.suite||{};
    if(!Object.keys(suite).length)throw new Error('서버 응답에 생성 결과(suite)가 없습니다.');
    if(progress)progress.textContent=types.includes('banner')?'2/3 · 문구 생성 완료. 1차 배너 이미지 준비 중...':'2/3 · 문구 생성 완료. 미리보기 준비 중...';
    renderResults(types,suite);
    $('ucsResultsSection')?.classList.remove('hidden');
    $('ucsResultsSection').scrollIntoView({behavior:'smooth',block:'start'});
    if(progress)progress.textContent=types.includes('banner')?'3/3 · 문구 미리보기 완료. 배너 이미지는 아래 생성 상태를 확인하세요.':'3/3 · 콘텐츠 생성과 미리보기 완료.';
  }catch(e){showStudioError('콘텐츠 생성 실패',e,progress);}finally{setBusy(btn,false);}
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

function injectPreviewStyles(){
  if(document.getElementById('ucsPreviewStyles')) return;
  const style=document.createElement('style');
  style.id='ucsPreviewStyles';
  style.textContent=`
    .ucs-result-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,.9fr);gap:18px;align-items:start}
    .ucs-result-editor textarea{width:100%;min-height:210px;resize:vertical}
    .ucs-preview-wrap{position:sticky;top:16px}
    .ucs-preview-title{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font-size:13px;color:#64748b}
    .ucs-preview-device{display:flex;gap:6px}
    .ucs-preview-device button{border:1px solid #dbe3ef;background:#fff;border-radius:999px;padding:5px 9px;font-size:12px;cursor:pointer}
    .ucs-preview-device button.active{background:#1d4ed8;color:#fff;border-color:#1d4ed8}
    .ucs-preview-stage{background:#eef3f9;border:1px solid #dbe3ef;border-radius:16px;padding:18px;overflow:hidden}
    .ucs-preview-stage.mobile{max-width:390px;margin:0 auto;padding:12px;border-radius:26px}
    .ucs-preview-card{background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(15,23,42,.10);border:1px solid #e5e7eb}
    .ucs-preview-image{min-height:155px;background:linear-gradient(135deg,#dbeafe,#eef2ff 55%,#fef3c7);display:flex;align-items:center;justify-content:center;padding:20px;text-align:center;color:#475569;font-size:13px}
    .ucs-preview-body{padding:18px}
    .ucs-preview-body h3{margin:0 0 8px;font-size:22px;line-height:1.25}
    .ucs-preview-body p{margin:6px 0;color:#475569;line-height:1.55;white-space:pre-wrap}
    .ucs-preview-chip{display:inline-flex;background:#eff6ff;color:#1d4ed8;border-radius:999px;padding:5px 10px;font-weight:700;font-size:12px;margin-bottom:10px}
    .ucs-preview-code{margin-top:12px;background:#f8fafc;border:1px dashed #94a3b8;border-radius:10px;padding:10px;font-weight:700}
    .ucs-preview-cta{display:inline-block;margin-top:14px;background:#2563eb;color:#fff;border-radius:10px;padding:10px 16px;font-weight:700}
    .ucs-coupon-ticket{position:relative;background:#fff7e8;border:2px solid #f59e0b;border-radius:22px;overflow:visible;box-shadow:0 12px 30px rgba(120,53,15,.16);font-family:inherit}
    .ucs-coupon-ticket:before,.ucs-coupon-ticket:after{content:'';position:absolute;top:58%;width:28px;height:28px;background:#eef3f9;border:2px solid #f59e0b;border-radius:50%;z-index:3}
    .ucs-coupon-ticket:before{left:-16px}.ucs-coupon-ticket:after{right:-16px}
    .ucs-coupon-hero{min-height:160px;padding:24px 26px 18px;background:radial-gradient(circle at 82% 18%,rgba(255,255,255,.45),transparent 28%),linear-gradient(135deg,#7c2d12,#c2410c 58%,#f59e0b);color:#fff;position:relative;overflow:hidden;border-radius:20px 20px 0 0}
    .ucs-coupon-hero:after{content:'COUPON';position:absolute;right:-8px;bottom:-14px;font-size:52px;font-weight:900;letter-spacing:4px;opacity:.11}
    .ucs-coupon-brand{font-size:13px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;opacity:.95}
    .ucs-coupon-hero h3{font-size:26px;line-height:1.2;margin:14px 0 10px;max-width:72%}
    .ucs-coupon-benefit{display:inline-flex;align-items:center;background:#fff;color:#9a3412;border-radius:999px;padding:7px 12px;font-weight:900;font-size:14px}
    .ucs-coupon-stamp{position:absolute;right:20px;top:22px;width:84px;height:84px;border-radius:50%;background:#fff7ed;color:#c2410c;border:3px solid rgba(255,255,255,.9);display:flex;align-items:center;justify-content:center;text-align:center;font-weight:950;font-size:15px;line-height:1.05;transform:rotate(8deg);box-shadow:0 6px 18px rgba(67,20,7,.25)}
    .ucs-coupon-main{padding:20px 24px 14px;background:#fffdf8}
    .ucs-coupon-desc{margin:0;color:#475569;line-height:1.6;white-space:pre-wrap}
    .ucs-coupon-cut{position:relative;margin:8px 0 0;border-top:2px dashed #f59e0b;text-align:center;height:16px}
    .ucs-coupon-cut span{position:relative;top:-13px;background:#fffdf8;color:#b45309;padding:0 10px;font-size:16px}
    .ucs-coupon-bottom{display:grid;grid-template-columns:1fr auto;gap:14px;align-items:center;padding:10px 24px 22px;background:#fffdf8;border-radius:0 0 20px 20px}
    .ucs-coupon-codebox small{display:block;color:#92400e;font-weight:800;letter-spacing:.08em;margin-bottom:4px}.ucs-coupon-codebox strong{font-size:20px;letter-spacing:.08em;color:#7c2d12}
    .ucs-coupon-button{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 18px;border-radius:12px;background:#c2410c;color:#fff;font-weight:900;box-shadow:0 6px 14px rgba(194,65,12,.22)}
    .ucs-preview-stage.mobile .ucs-coupon-ticket{border-radius:18px}.ucs-preview-stage.mobile .ucs-coupon-hero{padding:20px 18px 16px;min-height:145px}.ucs-preview-stage.mobile .ucs-coupon-hero h3{font-size:22px;max-width:68%}.ucs-preview-stage.mobile .ucs-coupon-stamp{width:68px;height:68px;right:14px;top:18px;font-size:13px}.ucs-preview-stage.mobile .ucs-coupon-bottom{grid-template-columns:1fr}.ucs-preview-stage.mobile .ucs-coupon-button{width:100%}
    .ucs-banner-preview{position:relative;min-height:230px;background:linear-gradient(120deg,#0f172a,#1e3a8a 55%,#0ea5e9);background-size:cover;background-position:center;color:#fff;display:flex;align-items:flex-end;padding:28px;overflow:hidden}
    .ucs-banner-image-status{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:10px;padding:10px 12px;border:1px solid #dbe3ef;border-radius:12px;background:#f8fafc;font-size:12px;color:#475569}
    .ucs-banner-image-status .btn{white-space:nowrap}
    .ucs-banner-preview:after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,.62),rgba(0,0,0,.08))}
    .ucs-banner-copy{position:relative;z-index:1;max-width:72%}.ucs-banner-copy h3{font-size:28px;margin:0 0 8px}.ucs-banner-copy p{color:#e2e8f0;margin:0}
    .ucs-article-preview .ucs-preview-body h3{font-size:24px}.ucs-article-summary{font-weight:600;color:#334155!important}
    .ucs-social-preview{padding:18px}.ucs-social-head{display:flex;align-items:center;gap:10px;margin-bottom:12px}.ucs-social-avatar{width:38px;height:38px;border-radius:50%;background:#dbeafe}.ucs-social-text{white-space:pre-wrap;line-height:1.55}
    .ucs-push-preview{padding:14px 16px;display:flex;gap:12px;align-items:flex-start}.ucs-push-icon{font-size:26px}.ucs-push-preview h4{margin:0 0 3px}.ucs-push-preview p{margin:0;color:#475569}
    @media(max-width:900px){.ucs-result-layout{grid-template-columns:1fr}.ucs-preview-wrap{position:static}}
  `;
  document.head.appendChild(style);
}
function textLines(type){
  const raw=$(`ucsResult_${type}`)?.value||'';
  return raw.split(/\n/).map(x=>x.trim());
}
function previewHtml(type){
  const b=businessPayload();
  const name=esc(b?.name||'연결 업소');
  const lines=textLines(type);
  const nonempty=lines.filter(Boolean);
  if(type==='coupon'){
    const title=esc(nonempty[0]||'쿠폰 제목');
    const rawBenefit=(lines.find(x=>x.startsWith('혜택:'))||'혜택: 특별 혜택').replace(/^혜택:\s*/,'').trim();
    const rawCode=(lines.find(x=>x.startsWith('코드:'))||'코드: 업소 문의').replace(/^코드:\s*/,'').trim();
    const benefit=esc(rawBenefit||'특별 혜택');
    const code=esc(rawCode||'업소 문의');
    const desc=esc(nonempty.filter(x=>!x.startsWith('혜택:')&&!x.startsWith('코드:')).slice(1).join('\n')||'쿠폰 설명이 여기에 표시됩니다.');
    const stamp=(rawBenefit||'SPECIAL').length>12?'SPECIAL':esc(rawBenefit||'SPECIAL');
    return `<div class="ucs-coupon-ticket">
      <div class="ucs-coupon-hero">
        <div class="ucs-coupon-brand">🎟 ${name}</div>
        <h3>${title}</h3>
        <span class="ucs-coupon-benefit">${benefit}</span>
        <div class="ucs-coupon-stamp">${stamp}<br>COUPON</div>
      </div>
      <div class="ucs-coupon-main"><p class="ucs-coupon-desc">${desc}</p><div class="ucs-coupon-cut"><span>✂</span></div></div>
      <div class="ucs-coupon-bottom"><div class="ucs-coupon-codebox"><small>COUPON CODE</small><strong>${code}</strong></div><span class="ucs-coupon-button">쿠폰 사용하기</span></div>
    </div>`;
  }
  if(type==='banner'){
    const title=esc(nonempty[0]||'배너 제목');
    const cta=esc((lines.find(x=>x.startsWith('CTA:'))||'CTA: 자세히 보기').replace(/^CTA:\s*/,''));
    const desc=esc(nonempty.filter(x=>!x.startsWith('CTA:')&&!x.startsWith('이미지 프롬프트:')).slice(1).filter(x=>!x.includes('프롬프트')).join(' ')||'배너 설명');
    const imageUrl=suite?.banner?.generated_image_url||'';
    const bg=imageUrl?` style="background-image:url('${esc(imageUrl)}')"`:'';
    return `<div class="ucs-preview-card ucs-banner-preview"${bg}><div class="ucs-banner-copy"><span class="ucs-preview-chip">${name}</span><h3>${title}</h3><p>${desc}</p><span class="ucs-preview-cta">${cta}</span></div></div>`;
  }
  if(type==='dalpick'||type==='guide'){
    const title=esc(nonempty[0]||'콘텐츠 제목');
    const summary=esc(nonempty[1]||'요약 문구가 여기에 표시됩니다.');
    const body=esc(nonempty.slice(2).join('\n')||'본문 미리보기');
    return `<div class="ucs-preview-card ucs-article-preview"><div class="ucs-preview-image">대표 이미지 미리보기</div><div class="ucs-preview-body"><span class="ucs-preview-chip">${type==='dalpick'?'DalPick':'AI Guide'}</span><h3>${title}</h3><p class="ucs-article-summary">${summary}</p><p>${body.slice(0,500)}${body.length>500?'…':''}</p></div></div>`;
  }
  if(type==='social') return `<div class="ucs-preview-card ucs-social-preview"><div class="ucs-social-head"><div class="ucs-social-avatar"></div><div><strong>${name}</strong><br><small>Sponsored</small></div></div><div class="ucs-preview-image">SNS 이미지 미리보기</div><p class="ucs-social-text">${esc(nonempty.slice(1).join('\n')||'SNS 문안 미리보기')}</p></div>`;
  if(type==='push') return `<div class="ucs-preview-card ucs-push-preview"><div class="ucs-push-icon">🔔</div><div><h4>${esc(nonempty[0]||'푸시 제목')}</h4><p>${esc(nonempty.slice(1).join(' ')||'푸시 메시지가 여기에 표시됩니다.')}</p></div></div>`;
  if(type==='video') return `<div class="ucs-preview-card"><div class="ucs-preview-image" style="aspect-ratio:9/16;min-height:360px">🎬 숏폼 영상 미리보기<br><small>${esc(nonempty[1]||'영상 훅과 대본')}</small></div></div>`;
  return `<div class="ucs-preview-card"><div class="ucs-preview-image">✨ 이미지 생성 프롬프트</div><div class="ucs-preview-body"><p>${esc(nonempty.join('\n')||'프롬프트가 여기에 표시됩니다.')}</p></div></div>`;
}
function updatePreview(type){
  const box=$(`ucsPreview_${type}`); if(box) box.innerHTML=previewHtml(type);
}
function renderResults(types,s){
  injectPreviewStyles();
  const score=Number(s.marketing_score||0);
  const checks=s.checklist||[];
  $('ucsScoreBox').innerHTML=`<div><span class="ucs-score-number">${score||'-'}점</span> <strong>AI 마케팅 점수</strong></div><div class="muted">${esc(s.strategy_summary||'')}</div><div class="ucs-checklist">${checks.map(c=>`<div class="ucs-check-${c.status}">${c.status==='pass'?'✓':c.status==='warning'?'⚠':'ℹ'} <b>${esc(c.label)}</b> · ${esc(c.message)}</div>`).join('')}</div>`;
  $('ucsResultStatus').textContent=`${types.length}개 콘텐츠 생성 완료 · 왼쪽에서 수정하면 오른쪽 미리보기에 바로 반영됩니다.`;
  $('ucsResults').innerHTML=types.map(type=>{
    const meta=ASSETS.find(x=>x[0]===type)||[type,'','콘텐츠',''];
    const bannerTools=type==='banner'?`<div class="ucs-banner-image-status"><span id="ucsBannerImageStatus">1차 AI 이미지를 자동 생성합니다.</span><button class="btn secondary" id="ucsBannerRegenerate" type="button">이미지 다시 생성</button></div>`:'';
    return `<article class="ucs-result-card" data-result="${type}"><div class="ucs-result-head"><strong>${meta[1]} ${meta[2]}</strong><div class="ucs-result-actions"><button class="btn ghost ucs-copy" data-type="${type}" type="button">복사</button>${actionButton(type)}</div></div><div class="ucs-result-layout"><div class="ucs-result-editor"><textarea id="ucsResult_${type}">${esc(stringifyAsset(type,s))}</textarea>${bannerTools}</div><div class="ucs-preview-wrap"><div class="ucs-preview-title"><strong>실시간 미리보기</strong><div class="ucs-preview-device"><button type="button" class="active" data-preview-mode="desktop" data-type="${type}">PC</button><button type="button" data-preview-mode="mobile" data-type="${type}">모바일</button></div></div><div class="ucs-preview-stage" id="ucsPreviewStage_${type}"><div id="ucsPreview_${type}"></div></div></div></div></article>`;
  }).join('');
  document.querySelectorAll('.ucs-copy').forEach(b=>b.addEventListener('click',()=>navigator.clipboard.writeText($(`ucsResult_${b.dataset.type}`)?.value||'').then(()=>notify('복사했습니다.'))));
  document.querySelectorAll('[data-send-asset]').forEach(b=>b.addEventListener('click',()=>sendAsset(b.dataset.sendAsset,b)));
  types.forEach(type=>{
    updatePreview(type);
    $(`ucsResult_${type}`)?.addEventListener('input',()=>updatePreview(type));
  });
  $('ucsBannerRegenerate')?.addEventListener('click',()=>generateBannerStudioImage(false));
  if(types.includes('banner')) setTimeout(()=>generateBannerStudioImage(true),120);
  document.querySelectorAll('[data-preview-mode]').forEach(btn=>btn.addEventListener('click',()=>{
    const type=btn.dataset.type;
    btn.closest('.ucs-preview-device')?.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===btn));
    $(`ucsPreviewStage_${type}`)?.classList.toggle('mobile',btn.dataset.previewMode==='mobile');
  }));
}

function bannerDataFromEditor(){
  const lines=textLines('banner');
  const nonempty=lines.filter(Boolean);
  const cta=(lines.find(x=>x.startsWith('CTA:'))||'').replace(/^CTA:\s*/,'').trim();
  const marker=lines.findIndex(x=>x.startsWith('이미지 프롬프트:'));
  const prompt=(marker>=0?lines.slice(marker+1).join('\n'):suite?.banner?.image_prompt||'').trim();
  const description=nonempty.filter(x=>!x.startsWith('CTA:')&&!x.startsWith('이미지 프롬프트:')).slice(1).filter(x=>!x.includes('프롬프트')).join(' ').trim();
  return {title:nonempty[0]||suite?.banner?.title||'',description:description||suite?.banner?.description||'',button_label:cta||suite?.banner?.button_label||'자세히 보기',image_prompt:prompt||suite?.banner?.image_prompt||''};
}
function dataUrlToBlobUcs(dataUrl){
  const [head,body]=String(dataUrl||'').split(',');
  const mime=(head.match(/data:([^;]+)/)||[])[1]||'image/png';
  const bin=atob(body||''); const bytes=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
  return new Blob([bytes],{type:mime});
}
async function generateBannerStudioImage(auto=false){
  if(!suite?.banner)return;
  if(auto&&suite.banner.generated_image_url)return;
  const data=bannerDataFromEditor();
  const status=$('ucsBannerImageStatus'); const btn=$('ucsBannerRegenerate');
  if(!data.title||!data.image_prompt){if(status)status.textContent='제목과 이미지 프롬프트를 확인해 주세요.';return;}
  if(btn){btn.disabled=true;btn.textContent=auto?'1차 이미지 생성 중...':'다시 생성 중...';}
  if(status)status.textContent=auto?'AI가 1차 배너 이미지를 생성하고 있습니다.':'수정된 프롬프트로 새 이미지를 생성하고 있습니다.';
  try{
    const b=businessPayload();
    const j=await fetchJsonDetailed('/.netlify/functions/generate-campaign-image',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({asset:'banner',businessName:b?.name||'DalTownMap local business',campaignName:data.title,benefit:data.description,category:b?.category||'',style:'premium',notes:data.image_prompt})},'배너 이미지 생성');
    const blob=dataUrlToBlobUcs(`data:image/png;base64,${j.b64_json}`);
    const upload=bridge().uploadGeneratedImage;
    if(typeof upload!=='function')throw new Error('이미지 업로드 기능이 준비되지 않았습니다.');
    const safe=(data.title||'banner').replace(/[^a-zA-Z0-9가-힣_-]+/g,'-').slice(0,45);
    const url=await upload(blob,`${safe}-${Date.now()}.png`);
    suite.banner.generated_image_url=url;
    suite.banner.image_prompt=data.image_prompt;
    updatePreview('banner');
    if(status)status.textContent='이미지 생성 완료 · 문구나 프롬프트를 수정한 뒤 다시 생성할 수 있습니다.';
  }catch(e){console.error('[AI Studio Banner Image]',e);if(status)status.textContent=`이미지 생성 실패: ${e.message.replace(/\n/g,' · ')}`;notify(`${auto?'1차 배너 이미지 자동 생성 실패':'AI 배너 이미지 생성 실패'}\n\n${e.message}\n\n문구와 프롬프트는 보존되었습니다. 아래 ‘이미지 다시 생성’ 버튼으로 재시도할 수 있습니다.`);}
  finally{if(btn){btn.disabled=false;btn.textContent='이미지 다시 생성';}}
}

function actionButton(type){
  const labels={dalpick:'DalPick 관리로 보내기',guide:'가이드 관리로 보내기',coupon:'쿠폰으로 등록',banner:'배너 관리로 보내기',push:'푸시 발송으로 보내기'};
  return labels[type]?`<button class="btn secondary" data-send-asset="${type}" type="button">${labels[type]}</button>`:'';
}

let html2CanvasPromise=null;
function ensureHtml2Canvas(){
  if(window.html2canvas) return Promise.resolve(window.html2canvas);
  if(html2CanvasPromise) return html2CanvasPromise;
  html2CanvasPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src='https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
    script.async=true;
    script.onload=()=>window.html2canvas?resolve(window.html2canvas):reject(new Error('이미지 변환 도구를 불러오지 못했습니다.'));
    script.onerror=()=>reject(new Error('이미지 변환 도구 다운로드에 실패했습니다. 인터넷 연결을 확인하세요.'));
    document.head.appendChild(script);
  });
  return html2CanvasPromise;
}
function couponDataFromEditor(){
  const lines=textLines('coupon');
  const nonempty=lines.filter(Boolean);
  const benefit=(lines.find(x=>x.startsWith('혜택:'))||'').replace(/^혜택:\s*/,'').trim();
  const code=(lines.find(x=>x.startsWith('코드:'))||'').replace(/^코드:\s*/,'').trim();
  const description=nonempty.filter(x=>!x.startsWith('혜택:')&&!x.startsWith('코드:')).slice(1).join('\n').trim();
  return {
    title:nonempty[0]||suite?.coupon?.title||'',
    discount_label:benefit||suite?.coupon?.discount_label||'',
    coupon_code:code||suite?.coupon?.coupon_code||'',
    description:description||suite?.coupon?.description||''
  };
}
async function captureCouponPreviewBlob(){
  updatePreview('coupon');
  const source=$('ucsPreview_coupon')?.querySelector('.ucs-coupon-ticket');
  if(!source) throw new Error('쿠폰 미리보기를 찾을 수 없습니다.');

  const html2canvas=await ensureHtml2Canvas();
  const exportWrap=document.createElement('div');
  exportWrap.setAttribute('aria-hidden','true');
  Object.assign(exportWrap.style,{
    position:'fixed',left:'-10000px',top:'0',width:'760px',padding:'44px',
    background:'#eef3f9',boxSizing:'border-box',zIndex:'-1'
  });
  const clone=source.cloneNode(true);
  clone.style.width='100%';
  clone.style.boxSizing='border-box';
  exportWrap.appendChild(clone);
  document.body.appendChild(exportWrap);

  try{
    if(document.fonts?.ready) await document.fonts.ready;
    const canvas=await html2canvas(exportWrap,{
      backgroundColor:'#eef3f9',scale:2,useCORS:true,allowTaint:false,
      logging:false,scrollX:0,scrollY:0,windowWidth:900
    });
    return await new Promise((resolve,reject)=>canvas.toBlob(
      blob=>blob?resolve(blob):reject(new Error('PNG 이미지 생성에 실패했습니다.')),
      'image/png',0.95
    ));
  } finally {
    exportWrap.remove();
  }
}
async function createAndUploadCouponImage(){
  const upload=bridge().uploadGeneratedImage;
  if(typeof upload!=='function') throw new Error('이미지 업로드 기능이 아직 준비되지 않았습니다. 잠시 후 다시 시도하세요.');
  const blob=await captureCouponPreviewBlob();
  const safeTitle=(couponDataFromEditor().title||'coupon').replace(/[^a-zA-Z0-9가-힣_-]+/g,'-').slice(0,50);
  return upload(blob,`${safeTitle||'coupon'}-${Date.now()}.png`);
}

async function sendAsset(type,actionBtn=null){
  if(!suite)return;
  const b=businessPayload();
  const sourceContext=workflowContext;
  if(type==='dalpick'){
    switchSection('dalpick');
    setValue('dalpick_topic',$('ucsTopic')?.value||''); setValue('dalpick_category',suite.dalpick?.category||analysis?.suggested_dalpick_category||'themed');
    setValue('dalpick_title',suite.dalpick?.title); setValue('dalpick_summary',suite.dalpick?.summary); setValue('dalpick_content',suite.dalpick?.content); setValue('dalpick_business_id',b?.id||'');
    window.dispatchEvent(new Event('resize')); notify('DalPick 관리 화면에 내용을 채웠습니다. 검토 후 저장하세요.');
  } else if(type==='guide'){
    switchSection('board'); setValue('board_type','guide'); setValue('board_title',suite.guide?.title); setValue('board_content',`${suite.guide?.summary||''}\n\n${suite.guide?.content||''}`.trim()); setValue('board_business_id',b?.id||''); setValue('board_business_select',b?.id||''); setChecked('board_is_active',false); notify('가이드 관리 화면에 초안을 채웠습니다. 검토 후 저장하세요.');
  } else if(type==='coupon'){
    const data=couponDataFromEditor();
    const status=$('ucsResultStatus');
    const oldStatus=status?.textContent||'';
    setBusy(actionBtn,true,'이미지 생성 중...');
    if(status) status.textContent='쿠폰 미리보기를 PNG로 만들고 있습니다...';
    try{
      const imageUrl=await createAndUploadCouponImage();
      if(status) status.textContent='쿠폰 이미지 업로드 완료 · 등록 화면으로 이동합니다.';
      switchSection('coupon');
      setValue('coupon_business_id',b?.id||'');
      setValue('coupon_title',data.title);
      setValue('coupon_discount_label',data.discount_label);
      setValue('coupon_description',data.description);
      setValue('coupon_code',data.coupon_code);
      setValue('coupon_image_url',imageUrl);
      notify('쿠폰 내용과 생성된 이미지를 입력 화면에 함께 채웠습니다. 기간을 확인한 뒤 저장하세요.');
    }catch(e){
      console.error('[AI Studio Coupon Export]',e);
      if(status) status.textContent=`쿠폰 이미지 처리 실패: ${e.message}`;
      notify(`쿠폰 이미지 처리에 실패했습니다.

${e.message}

버튼을 눌러 다시 시도할 수 있습니다.`);
      return;
    }finally{
      setBusy(actionBtn,false);
      if(status && status.textContent===oldStatus) status.textContent=oldStatus;
    }
  } else if(type==='banner'){
    const data=bannerDataFromEditor();
    switchSection('banners');
    setValue('bnTitle',data.title); setValue('bnDescription',data.description); setValue('bnButtonLabel',data.button_label); setValue('bnBusinessId',b?.id||'');
    setValue('bnAiPrompt',data.image_prompt); setValue('bnAiStyle','premium');
    if(suite.banner?.generated_image_url)setValue('bnImage',suite.banner.generated_image_url);
    setTimeout(()=>{window.renderBannerLivePreview?.();document.getElementById('bnImage')?.dispatchEvent(new Event('input',{bubbles:true}));},80);
    notify(suite.banner?.generated_image_url?'배너 문구·이미지·프롬프트를 모두 전달했습니다. 노출 위치를 확인한 뒤 저장하세요.':'배너 문구와 프롬프트를 전달했습니다. 이미지를 생성한 뒤 저장하세요.');
  } else if(type==='push'){
    switchSection('push'); setValue('pushTitle',suite.push?.title); setValue('pushMessage',suite.push?.message); notify('푸시 발송 화면에 내용을 채웠습니다. 대상과 링크를 확인하세요.');
  }
  if(sourceContext?.assetType===type) saveWorkflowContext(null);
}

function reset(){
  analysis=null;suite=null;saveWorkflowContext(null);setValue('ucsTopic','');setValue('ucsInstructions','');$('ucsPlanSection')?.classList.add('hidden');$('ucsResultsSection')?.classList.add('hidden');$('ucsAnalyzeStatus').textContent='주제를 입력하면 AI가 기획안을 제안합니다.';
}
function bind(){
  $('ucsAnalyzeBtn')?.addEventListener('click',analyzeTopic); $('ucsGenerateBtn')?.addEventListener('click',generateSuite); $('ucsResetBtn')?.addEventListener('click',reset);
  $('ucsSelectAll')?.addEventListener('click',()=>document.querySelectorAll('#ucsAssetSelector input').forEach(x=>x.checked=true));
  $('ucsClearAll')?.addEventListener('click',()=>document.querySelectorAll('#ucsAssetSelector input').forEach(x=>x.checked=false));
  window.addEventListener('kfocus:businesses-loaded',()=>{ populateBusinesses(); if(workflowContext?.businessId) waitForBusiness(workflowContext.businessId); }); populateBusinesses(); workflowContext=readWorkflowContext(); if(workflowContext) setTimeout(()=>applyWorkflowContext(workflowContext),100);
}
document.addEventListener('DOMContentLoaded',bind);
