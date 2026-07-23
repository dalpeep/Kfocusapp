const AM_BETA_MODE = true;
const AM_ALL_ASSETS = ['dalpick','guide','coupon','banner','social','push','video','image_prompt'];
const AM_PLANS = {
  free:{label:'무료 베타',price:0,assets:AM_ALL_ASSETS,limits:{}},
  basic:{label:'향후 Basic',price:0,assets:AM_ALL_ASSETS,limits:{}},
  business:{label:'향후 Business',price:0,assets:AM_ALL_ASSETS,limits:{}},
  premier:{label:'향후 Premier',price:0,assets:AM_ALL_ASSETS,limits:{}}
};
const AM_KEY = 'daltownmap_ai_manager_v24_admin2';
const AM_LEGACY_KEY = 'daltownmap_ai_manager_v23';
const AM_STYLE_LABELS = {auto:'업종 자동',premium:'Premium',modern:'Modern',luxury:'Luxury',food:'Food',medical:'Medical',beauty:'Beauty',kids:'Kids'};
const $am = id => document.getElementById(id);

function amLoadState(){
  const raw = localStorage.getItem(AM_KEY) || localStorage.getItem(AM_LEGACY_KEY) || '{"accounts":{},"drafts":[]}';
  try { return JSON.parse(raw); } catch (_) { return {accounts:{},drafts:[]}; }
}
let amState = amLoadState();
amState.accounts ||= {};
amState.drafts ||= [];

function amSave(){
  try { localStorage.setItem(AM_KEY, JSON.stringify(amState)); }
  catch(e){ console.error(e); alert('브라우저 저장 공간이 부족합니다. 큰 이미지 초안을 삭제하거나 게시 후 이미지를 URL로 전환해 주세요.'); }
}
function amBusinesses(){ return window.KFocusAdminBridge?.getBusinesses?.() || []; }
function amBusiness(id){ return amBusinesses().find(x => String(x.id) === String(id)); }
function amAccount(id){ return amState.accounts[id] || {plan:'free',status:'beta_active',mode:'review',renewal:'',manager:'',notes:'',usage:{}}; }
function amName(id){ const b=amBusiness(id); return b?.name_ko || b?.name_en || b?.name || id || '업소 미선택'; }
function amCategory(id){ const b=amBusiness(id)||{}; return b.category_ko || b.category || b.subcategory || b.business_type || ''; }
function amInferStyle(id){
  const t=`${amCategory(id)} ${amName(id)}`.toLowerCase();
  if(/식당|한식|중식|일식|음식|restaurant|food|bbq|카페|베이커리/.test(t)) return 'food';
  if(/병원|내과|치과|의원|클리닉|medical|dental|doctor|한의/.test(t)) return 'medical';
  if(/뷰티|미용|피부|성형|네일|스파|beauty|salon/.test(t)) return 'beauty';
  if(/학교|학원|키즈|어린이|교육|academy|school|child/.test(t)) return 'kids';
  if(/세라젬|마사지|가구|보석|쥬얼리|luxury/.test(t)) return 'luxury';
  return 'premium';
}
function amEscape(v=''){ return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function amStatusLabel(s){ return ({draft:'검토 대기',approved:'승인됨',published:'게시됨',rejected:'보류'})[s] || s; }

function amPopulate(){
  const sels=[$am('amBusiness'),$am('amDraftBusiness')].filter(Boolean);
  for(const el of sels){
    const v=el.value;
    el.innerHTML='<option value="">업소 선택</option>'+amBusinesses().map(b=>`<option value="${amEscape(b.id)}">${amEscape(amName(b.id))}</option>`).join('');
    el.value=v;
  }
  amRenderTable();
}
function amLoadAccount(){
  const id=$am('amBusiness').value;if(!id)return;
  const a=amAccount(id);
  $am('amPlan').value=a.plan;$am('amStatus').value=a.status;$am('amMode').value=a.mode;$am('amRenewal').value=a.renewal||'';$am('amManager').value=a.manager||'';$am('amNotes').value=a.notes||'';
  amRenderAllowance(id);
}
function amSaveAccount(){
  const id=$am('amBusiness').value;if(!id)return alert('업소를 선택하세요.');
  amState.accounts[id]={...amAccount(id),plan:$am('amPlan').value,status:$am('amStatus').value,mode:$am('amMode').value,renewal:$am('amRenewal').value,manager:$am('amManager').value.trim(),notes:$am('amNotes').value.trim()};
  amSave();amRenderAllowance(id);amRenderTable();amApplyStudioPermissions(id);alert('플랜과 AI 매니저 설정을 저장했습니다.');
}
function amRenderAllowance(id){ const el=$am('amAllowance');if(!el)return;el.innerHTML=AM_ALL_ASSETS.map(k=>`<span class="am-pill">${k} 사용 가능</span>`).join(''); }
function amRenderTable(){
  const box=$am('amAccountList');if(!box)return;
  const ids=[...new Set([...Object.keys(amState.accounts),...amBusinesses().map(b=>String(b.id))])];
  box.innerHTML=ids.map(id=>{const a=amAccount(id),p=AM_PLANS[a.plan]||AM_PLANS.free;return `<button type="button" class="am-account-row" data-am-account="${amEscape(id)}"><strong>${amEscape(amName(id))}</strong><span>${p.label}</span><span>무료 베타</span><span>${amEscape(a.status)}</span><span>${a.mode==='review'?'검토 후 승인':a.mode==='auto'?'자동 게시':'수동'}</span></button>`}).join('')||'<p class="muted">등록된 업소가 없습니다.</p>';
  box.querySelectorAll('[data-am-account]').forEach(b=>b.onclick=()=>{$am('amBusiness').value=b.dataset.amAccount;amLoadAccount();});
}
function amApplyStudioPermissions(id){
  document.querySelectorAll('#ucsAssetSelector input').forEach(input=>{input.disabled=false;input.closest('label')?.classList.remove('am-locked');});
  const note=$am('amStudioPlanNote');if(note)note.textContent=`${amName(id)} · 무료 베타 · 모든 제작 기능 사용 가능 · 검토 후 최종 게시`;
}

function amDraftTemplate(d){
  const style=d.style||amInferStyle(d.businessId);
  const canPublish=d.status==='approved';
  return `<article class="am-draft" data-draft="${d.id}">
    <div class="am-draft-head"><div><strong>${d.type==='coupon'?'🎟️ 쿠폰':'🖼️ 배너'} · ${amEscape(amName(d.businessId))}</strong><small>${amStatusLabel(d.status)} · ${AM_STYLE_LABELS[style]||style}</small></div><span class="am-status ${d.status}">${amStatusLabel(d.status)}</span></div>
    <div class="am-preview ${d.type}"><img src="${amEscape(d.image||'')}" alt="미리보기" onerror="this.style.display='none'"><div class="am-overlay"><b>${amEscape(d.title||'제목')}</b><span>${amEscape(d.subtitle||'설명 또는 혜택')}</span></div></div>
    <label>이미지 스타일<select data-field="style">${Object.entries(AM_STYLE_LABELS).filter(([k])=>k!=='auto').map(([k,v])=>`<option value="${k}" ${style===k?'selected':''}>${v}</option>`).join('')}</select></label>
    <label>제목<input data-field="title" value="${amEscape(d.title||'')}"></label>
    <label>설명/혜택<textarea data-field="subtitle">${amEscape(d.subtitle||'')}</textarea></label>
    <label>이미지 URL<input data-field="image" value="${amEscape((d.image||'').startsWith('data:')?'직접 업로드/AI 생성 이미지':d.image||'')}"></label>
    <div class="am-image-note">AI는 글자 없는 배경만 만들고 제목과 혜택은 별도 텍스트 레이어로 표시합니다.</div>
    <label class="am-upload">직접 이미지 교체<input type="file" accept="image/*" data-upload></label>
    <div class="am-actions">
      <button type="button" class="am-generate" data-action="generate">✨ AI 배경 생성</button>
      <button type="button" data-action="save">수정 저장</button>
      <button type="button" data-action="preview">미리보기</button>
      <button type="button" data-action="approve" ${d.status==='published'?'disabled':''}>승인</button>
      <button type="button" class="am-publish" data-action="publish" ${canPublish?'':'disabled'}>최종 게시</button>
      <button type="button" data-action="hold" ${d.status==='published'?'disabled':''}>보류</button>
    </div>
    ${d.status==='published'?`<div class="am-published-note">게시 완료 ${d.publishedAt?new Date(d.publishedAt).toLocaleString('ko-KR'):''}</div>`:''}
  </article>`;
}
function amReadCard(card,d){ card.querySelectorAll('[data-field]').forEach(el=>{if(el.dataset.field==='image'&&el.value==='직접 업로드/AI 생성 이미지')return;d[el.dataset.field]=el.value;}); }
async function amCompressDataUrl(dataUrl,max=1536,quality=.84){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{let w=img.width,h=img.height;const scale=Math.min(1,max/Math.max(w,h));w=Math.round(w*scale);h=Math.round(h*scale);const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);resolve(c.toDataURL('image/jpeg',quality));};img.onerror=reject;img.src=dataUrl;});}
async function amGenerateImage(card,d){
  amReadCard(card,d);if(!d.title)return alert('제목을 먼저 입력하세요.');
  const btn=card.querySelector('[data-action="generate"]');const old=btn.textContent;card.classList.add('am-busy');btn.textContent='⏳ AI 생성 중...';
  try{
    const res=await fetch('/.netlify/functions/generate-campaign-image',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({asset:d.type,businessName:amName(d.businessId),category:amCategory(d.businessId),campaignName:d.title,benefit:d.subtitle,style:d.style||amInferStyle(d.businessId),notes:'Background only. No letters, words, logos, Korean text or typography.'})});
    const json=await res.json().catch(()=>({}));if(!res.ok)throw new Error(json.error||'이미지 생성에 실패했습니다.');
    const raw=json.b64_json?`data:image/png;base64,${json.b64_json}`:json.image_url;
    if(!raw)throw new Error('생성된 이미지 데이터가 없습니다.');
    d.image=raw.startsWith('data:')?await amCompressDataUrl(raw,d.type==='banner'?1536:1200,.84):raw;
    d.imageSource='ai';d.generatedAt=new Date().toISOString();d.status='draft';amSave();amRenderDrafts();
  }catch(e){alert(e.message||'AI 이미지 생성 중 오류가 발생했습니다.');}
  finally{card.classList.remove('am-busy');btn.textContent=old;}
}

function amEnsureModal(){
  if($am('amPreviewModal'))return;
  document.body.insertAdjacentHTML('beforeend',`<div id="amPreviewModal" class="am-modal" hidden><div class="am-modal-card"><button type="button" class="am-modal-close" data-am-close>×</button><div id="amPreviewBody"></div></div></div>`);
  $am('amPreviewModal').addEventListener('click',e=>{if(e.target.id==='amPreviewModal'||e.target.closest('[data-am-close]'))$am('amPreviewModal').hidden=true;});
}
function amPreview(d,publishMode=false){
  amEnsureModal();
  const isCoupon=d.type==='coupon';
  const opts=d.publishOptions||{};
  $am('amPreviewBody').innerHTML=`<div class="am-preview-shell">
    <div class="am-preview-title"><div><strong>${isCoupon?'쿠폰':'배너'} 최종 미리보기</strong><span>${amEscape(amName(d.businessId))}</span></div><span class="am-status ${d.status}">${amStatusLabel(d.status)}</span></div>
    <div class="am-device"><div class="am-device-bar">DalTownMap</div><div class="am-live-preview ${isCoupon?'coupon':'banner'}"><img src="${amEscape(d.image||'')}" alt=""><div class="am-overlay"><b>${amEscape(d.title||'제목')}</b><span>${amEscape(d.subtitle||'')}</span></div></div><div class="am-preview-location">${isCoupon?'오늘의 쿠폰 / 쿠폰 페이지 / 연결 업소 상세':'연결 업소의 상세 페이지 전용 배너'}</div></div>
    ${publishMode?`<div class="am-publish-options">
      <h4>최종 게시 위치</h4>
      ${isCoupon?`
        <div class="am-placement-group am-placement-fixed">
          <div class="am-placement-heading"><strong>기본 게시 위치</strong><span>자동 적용 · 해제할 수 없음</span></div>
          <label><input type="checkbox" checked disabled> 쿠폰 페이지</label>
          <label><input type="checkbox" checked disabled> ${amEscape(amName(d.businessId))} 업소 상세</label>
        </div>
        <div class="am-placement-group">
          <div class="am-placement-heading"><strong>추가 노출</strong><span>필요한 경우에만 선택</span></div>
          <label><input type="checkbox" id="amPubToday" ${opts.today?'checked':''}> 메인 오늘의 쿠폰</label>
          <label><input type="checkbox" id="amPubDalpick" ${opts.dalpick?'checked':''}> 메인 DalPick 추천에도 표시</label>
        </div>
        <div id="amPublishSummary" class="am-publish-summary"></div>`:`
        <div class="am-placement-group am-placement-fixed">
          <div class="am-placement-heading"><strong>기본 게시 위치</strong><span>자동 적용 · 해제할 수 없음</span></div>
          <label><input type="checkbox" checked disabled> ${amEscape(amName(d.businessId))} 업소 상세</label>
        </div>
        <div class="am-placement-group">
          <div class="am-placement-heading"><strong>추가 노출</strong><span>필요한 경우에만 선택</span></div>
          <label><input type="checkbox" id="amPubHome" ${opts.home?'checked':''}> 메인 배너에도 표시</label>
        </div>
        <div id="amPublishSummary" class="am-publish-summary"></div>
        <p class="muted">카테고리 페이지에는 자동 게시되지 않습니다.</p>`}
      <button type="button" id="amConfirmPublish" class="btn primary">확인 후 실제 게시</button>
    </div>`:''}
  </div>`;
  $am('amPreviewModal').hidden=false;
  if(publishMode){
    const updateSummary=()=>{
      const summary=$am('amPublishSummary');
      if(!summary)return;
      if(isCoupon){
        const today=!!$am('amPubToday')?.checked;
        const dalpick=!!$am('amPubDalpick')?.checked;
        summary.innerHTML=`<strong>이 쿠폰은 다음 위치에 게시됩니다.</strong><ul><li>✓ 쿠폰 페이지</li><li>✓ ${amEscape(amName(d.businessId))} 업소 상세</li><li>${today?'✓':'✕'} 메인 오늘의 쿠폰</li><li>${dalpick?'✓':'✕'} 메인 DalPick 추천</li></ul>`;
      }else{
        const home=!!$am('amPubHome')?.checked;
        summary.innerHTML=`<strong>이 배너는 다음 위치에 게시됩니다.</strong><ul><li>✓ ${amEscape(amName(d.businessId))} 업소 상세</li><li>${home?'✓':'✕'} 메인 배너</li><li>✕ 카테고리 페이지</li></ul>`;
      }
    };
    ['amPubToday','amPubDalpick','amPubHome'].forEach(id=>$am(id)?.addEventListener('change',updateSummary));
    updateSummary();
    $am('amConfirmPublish').onclick=()=>amDoPublish(d);
  }
}

async function amDataUrlToBlob(dataUrl){ const res=await fetch(dataUrl); return res.blob(); }
async function amEnsurePublicImage(d){
  if(!d.image)throw new Error('게시할 이미지가 없습니다. AI 배경을 생성하거나 이미지를 업로드하세요.');
  if(!d.image.startsWith('data:'))return d.image;
  const uploader=window.KFocusAdminBridge?.uploadGeneratedImage;
  if(!uploader)throw new Error('Supabase 이미지 업로드 연결이 준비되지 않았습니다. 잠시 후 다시 시도하세요.');
  const blob=await amDataUrlToBlob(d.image);
  const url=await uploader(blob,`${d.type}-${d.id}.jpg`);
  d.image=url;amSave();return url;
}
async function amDoPublish(d){
  const btn=$am('amConfirmPublish');const old=btn.textContent;btn.disabled=true;btn.textContent='게시 중...';
  try{
    const imageUrl=await amEnsurePublicImage(d);
    const options=d.type==='coupon'?{today:$am('amPubToday')?.checked!==false,dalpick:!!$am('amPubDalpick')?.checked}:{home:!!$am('amPubHome')?.checked};
    const publisher=window.KFocusAdminBridge?.publishAIMarketingDraft;
    if(!publisher)throw new Error('관리자 게시 연결이 아직 준비되지 않았습니다.');
    const result=await publisher({...d,image:imageUrl},options);
    d.status='published';d.publishedAt=new Date().toISOString();d.publishOptions=options;d.publishedRecord=result||null;amSave();
    $am('amPreviewModal').hidden=true;amRenderDrafts();
    alert(d.type==='coupon'?'쿠폰이 실제 쿠폰 데이터에 게시되었습니다.':'배너가 연결 업소 상세에 게시되었습니다.');
  }catch(e){console.error(e);alert(`최종 게시 실패: ${e.message||e}`);}
  finally{btn.disabled=false;btn.textContent=old;}
}
function amRequestPublish(d){
  if(d.status!=='approved')return alert('먼저 초안을 승인하세요.');
  if(!d.businessId)return alert('연결 업소가 없습니다.');
  amPreview(d,true);
}

function amRenderDrafts(){
  const box=$am('amDraftList');if(!box)return;
  const f=$am('amDraftFilter')?.value||'all';
  const rows=amState.drafts.filter(d=>f==='all'||d.status===f);
  box.innerHTML=rows.map(amDraftTemplate).join('')||'<p class="muted">검토할 초안이 없습니다.</p>';
  box.querySelectorAll('.am-draft').forEach(card=>{
    const id=card.dataset.draft;const get=()=>amState.drafts.find(x=>x.id===id);
    card.querySelector('[data-action="generate"]').onclick=()=>amGenerateImage(card,get());
    card.querySelector('[data-action="save"]').onclick=()=>{const d=get();amReadCard(card,d);if(d.status==='approved')d.status='draft';amSave();amRenderDrafts();};
    card.querySelector('[data-action="preview"]').onclick=()=>{const d=get();amReadCard(card,d);amSave();amPreview(d,false);};
    card.querySelector('[data-action="approve"]').onclick=()=>{const d=get();amReadCard(card,d);if(!d.title||!d.image)return alert('제목과 이미지를 확인하세요.');d.status='approved';d.approvedAt=new Date().toISOString();amSave();amRenderDrafts();};
    card.querySelector('[data-action="publish"]').onclick=()=>amRequestPublish(get());
    card.querySelector('[data-action="hold"]').onclick=()=>{const d=get();d.status='rejected';amSave();amRenderDrafts();};
    card.querySelector('[data-upload]').onchange=e=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=async()=>{const d=get();d.image=await amCompressDataUrl(r.result,d.type==='banner'?1536:1200,.86);d.imageSource='upload';d.status='draft';amSave();amRenderDrafts();};r.readAsDataURL(f);};
  });
}
function amAddDraft(){
  const businessId=$am('amDraftBusiness').value;if(!businessId)return alert('업소를 선택하세요.');
  const selected=$am('amDraftStyle').value;
  amState.drafts.unshift({id:crypto.randomUUID(),businessId,type:$am('amDraftType').value,style:selected==='auto'?amInferStyle(businessId):selected,title:$am('amDraftTitle').value.trim(),subtitle:$am('amDraftSubtitle').value.trim(),image:$am('amDraftImage').value.trim(),status:'draft',createdAt:new Date().toISOString()});
  amSave();amRenderDrafts();
}
function amBindStudio(){
  document.addEventListener('change',e=>{if(e.target?.id==='ucsBusiness')amApplyStudioPermissions(e.target.value);});
  const studio=document.getElementById('ucsPlanSection');if(studio&&!$am('amStudioPlanNote'))studio.insertAdjacentHTML('afterbegin','<div id="amStudioPlanNote" class="am-studio-note">업소를 선택하면 제작 권한이 적용됩니다.</div>');
}
function amBind(){
  $am('amBusiness')?.addEventListener('change',amLoadAccount);$am('amSaveAccount')?.addEventListener('click',amSaveAccount);$am('amAddDraft')?.addEventListener('click',amAddDraft);$am('amDraftFilter')?.addEventListener('change',amRenderDrafts);
  window.addEventListener('kfocus:businesses-loaded',amPopulate);amPopulate();amRenderDrafts();amBindStudio();amEnsureModal();
}
document.addEventListener('DOMContentLoaded',amBind);
