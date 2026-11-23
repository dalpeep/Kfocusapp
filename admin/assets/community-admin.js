const LABELS={job_hiring:'구인',job_seeking:'구직',marketplace:'사고팔기',housing:'렌트/부동산',qna:'질문/정보',neighborhood:'동네소식',business_promotion:'업체홍보'};
const HIDE_REASONS={abuse:'욕설/비방',personal_info:'개인정보 포함',off_topic:'게시판 성격에 맞지 않음',promotion:'광고/홍보성 게시물',duplicate:'중복 게시물',other:'기타'};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));let status='pending',rows=[],dependencies=null,pageIndex=0,loadId=0;
async function call(body){if(!dependencies)throw new Error('관리자 로그인이 필요합니다.');const client=dependencies.getSupabaseClient?.();if(!client)throw new Error('관리자 로그인이 필요합니다.');const session=await dependencies.getSession?.(),token=session?.data?.session?.access_token;if(!token)throw new Error('관리자 로그인이 필요합니다.');const scope=dependencies.getAdminScope?.()||{};const res=await fetch('/.netlify/functions/community-admin',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({region:scope.role==='regional_editor'?scope.area:(window.getAppRegion?.()||'dallas'),...body})}),json=await res.json().catch(()=>({}));if(!res.ok)throw new Error(json.error||'요청 실패');return json}
function ensure(){if(document.getElementById('section-communityAdmin'))return;const nav=document.getElementById('adminNav'),anchor=nav?.querySelector('[data-section="board"]'),btn=document.createElement('button');btn.type='button';btn.className='nav-item';btn.dataset.section='communityAdmin';btn.textContent='커뮤니티 관리';anchor?.after(btn);const section=document.createElement('section');section.id='section-communityAdmin';section.className='admin-section';section.innerHTML=`<div class="panel-head"><div><h2>커뮤니티 관리</h2><p class="muted">익명 게시글 승인과 댓글 moderation</p></div></div><div id="communityAdminTabs" class="community-status-grid" aria-label="게시글 상태별 건수">${statusCards()}</div><p id="communityAdminFeedback" role="status" class="muted"></p><div id="communityAdminList" class="biz-list"></div><nav id="communityAdminPages" aria-label="커뮤니티 목록 페이지"></nav>`;document.querySelector('main.content')?.appendChild(section);btn.onclick=()=>{const bridge=window.KFocusAdminBridge;if(bridge?.switchSection)bridge.switchSection('communityAdmin');else{document.querySelectorAll('.admin-section').forEach(x=>x.classList.remove('active-section'));section.classList.add('active-section')}document.getElementById('pageTitle').textContent='커뮤니티 관리';load()};section.onclick=click;section.onchange=change;section.onsubmit=saveEdit;drawTabs()}
function drawTabs(){document.querySelectorAll('[data-community-status]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.communityStatus===status)))}
async function load(){const pass=++loadId,box=document.getElementById('communityAdminList'),totals=document.getElementById('communityAdminFeedback'),pages=document.getElementById('communityAdminPages');totals.textContent='전체 상태 건수 조회 중…';pages.replaceChildren();box.querySelectorAll('[data-promotion-edit]').forEach(disposePromotionEdit);rows=[];box.innerHTML='<div class="dashboard-empty">불러오는 중...</div>';try{const data=await call({action:'list',status,from:pageIndex*50,to:pageIndex*50+49});if(pass!==loadId)return;drawCounts(data.counts);if(pageIndex>0&&Number.isInteger(data.count)&&pageIndex*50>=data.count){pageIndex--;return load()}rows=data.rows||[];totals.textContent='';drawPages(pages,data.count);box.innerHTML=rows.length?rows.map(row=>`<article class="admin-card" data-community-admin-id="${esc(row.id)}" style="margin:10px 0"><div style="display:flex;justify-content:space-between;gap:10px"><div><span class="dashboard-status-chip">${esc(LABELS[row.category]||row.category)}</span><h3>${esc(row.title)}</h3><small>${esc(row.author_name)} · ${esc(row.area)} · ${esc(row.created_at)}</small></div><span class="dashboard-status-chip ${row.status==='approved'?'live':''}">${esc(row.status)}</span></div><p style="white-space:pre-wrap">${esc(row.body)}</p><div style="display:flex;gap:8px;overflow:auto">${(row.community_post_images||[]).map(i=>`<img src="${esc(i.image_url)}" alt="" style="width:120px;height:90px;object-fit:cover;border-radius:10px">`).join('')}</div><div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:10px"><select data-admin-category>${Object.entries(LABELS).map(([k,v])=>`<option value="${k}" ${k===row.category?'selected':''}>${v}</option>`).join('')}</select><button class="btn primary" data-admin-action="approved">승인</button><button class="btn ghost" data-admin-action="rejected">거절</button><button class="btn danger" data-admin-action="deleted">삭제</button><button class="btn ghost" data-admin-comments>댓글 관리</button>${row.category==='business_promotion'?'<button class="btn ghost" type="button" data-admin-edit>수정</button>':''}</div><div data-admin-comment-list></div></article>`).join(''):'<div class="dashboard-empty">해당 게시글이 없습니다.</div>'}catch(e){if(pass!==loadId)return;totals.textContent='';drawCounts(null);box.textContent=e.message}}
const baseLoad=load;
load=async function(){
  const pass=loadId+1;
  await baseLoad();
  if(pass!==loadId)return;
  for(const row of rows){
    const card=[...document.querySelectorAll('[data-community-admin-id]')].find(el=>el.dataset.communityAdminId===row.id);
    if(!card)continue;
    if(row.status==='pending'){
      const badge=card.querySelector('.dashboard-status-chip:last-child');
      if(badge){badge.textContent='검토 필요';badge.classList.add('community-review-badge')}
    }
    const approve=card.querySelector('[data-admin-action="approved"]'),reject=card.querySelector('[data-admin-action="rejected"]');
    if(row.status==='approved'){
      approve?.remove();reject?.remove();
      const controls=card.querySelector('[data-admin-action="deleted"]');
      const box=document.createElement('span');box.className='community-hide-controls';
      box.innerHTML=`<label>숨김 사유 <select data-admin-hide-reason>${Object.entries(HIDE_REASONS).map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select></label><input data-admin-hide-note maxlength="500" placeholder="관리자 내부 메모 (선택)"><button class="btn ghost" type="button" data-admin-action="hidden">숨김</button>`;
      controls?.before(box);
    }else if(row.status==='hidden'){
      if(approve)approve.textContent='숨김 해제';reject?.remove();
      const category=card.querySelector('[data-admin-category]');if(category)category.disabled=true;
      if(row.moderation_reason){const info=document.createElement('p');info.textContent=`숨김 사유: ${HIDE_REASONS[row.moderation_reason]||'기타'}`;card.querySelector('[data-admin-comment-list]')?.before(info)}
    }else if(row.status!=='pending'){approve?.remove();reject?.remove()}
  }
};
const videoBaseLoad=load;
load=async function(){
  const pass=loadId+1;
  await videoBaseLoad();
  if(pass!==loadId)return;
  for(const row of rows){
    if(!['marketplace','housing'].includes(row.category)||!row.video_url)continue;
    let url;try{url=new URL(row.video_url)}catch{continue}
    const host={youtube:'www.youtube.com',instagram:'www.instagram.com',facebook:'www.facebook.com'}[row.video_provider];
    if(url.protocol!=='https:'||url.hostname!==host||url.username||url.password||url.port)continue;
    const card=[...document.querySelectorAll('[data-community-admin-id]')].find(el=>el.dataset.communityAdminId===row.id);
    const anchor=card?.querySelector('[data-admin-category]')?.parentElement;if(!anchor)continue;
    const link=document.createElement('a');link.className='btn ghost';link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';
    link.textContent=`${{youtube:'YouTube',instagram:'Instagram',facebook:'Facebook'}[row.video_provider]} 영상 확인`;
    anchor.before(link);
  }
};
const retentionBaseLoad=load;
load=async function(){
  const pass=loadId+1;
  await retentionBaseLoad();
  if(pass!==loadId)return;
  for(const row of rows){
    if(!['marketplace','housing'].includes(row.category))continue;
    const card=[...document.querySelectorAll('[data-community-admin-id]')].find(el=>el.dataset.communityAdminId===row.id);
    const title=card?.querySelector('h3');if(!title)continue;
    const info=document.createElement('small');info.className='community-admin-retention';
    info.textContent=`게시 종료: ${row.expires_at?new Intl.DateTimeFormat('ko-KR',{dateStyle:'medium',timeZone:'America/Chicago'}).format(new Date(row.expires_at)):'기존 글 · 만료일 미설정'} · 연장 ${Number(row.extension_count)||0}회`;
    title.after(info);
  }
};
async function change(e){const category=e.target.closest('[data-admin-category]'),card=category?.closest('[data-community-admin-id]');if(!category||!card)return;try{await call({action:'category',id:card.dataset.communityAdminId,category:category.value});await load()}catch(err){alert(err.message)}}
async function click(e){const paging=e.target.closest('[data-community-page]');if(paging){pageIndex+=Number(paging.dataset.communityPage);return load()}const tab=e.target.closest('[data-community-status]');if(tab){status=tab.dataset.communityStatus;pageIndex=0;drawTabs();return load()}const card=e.target.closest('[data-community-admin-id]');if(!card)return;const id=card.dataset.communityAdminId,action=e.target.closest('[data-admin-action]');try{if(e.target.closest('[data-admin-edit]'))return openEdit(card,rows.find(row=>String(row.id)===id));if(e.target.closest('[data-admin-edit-cancel]'))return disposePromotionEdit(card.querySelector('[data-promotion-edit]'));if(action){const hidden=action.dataset.adminAction==='hidden';await call({action:'status',id,status:action.dataset.adminAction,...(hidden?{reason:card.querySelector('[data-admin-hide-reason]')?.value,note:card.querySelector('[data-admin-hide-note]')?.value}:{})});return load()}if(e.target.closest('[data-admin-comments]')){const data=await call({action:'comments',post_id:id}),box=card.querySelector('[data-admin-comment-list]');box.innerHTML=(data.rows||[]).map(c=>`<div style="padding:8px;border-top:1px solid #eee"><b>${esc(c.author_name)}</b> ${esc(c.body)} <button class="btn ghost" data-admin-comment="${esc(c.id)}" data-comment-status="hidden">숨김</button> <button class="btn danger" data-admin-comment="${esc(c.id)}" data-comment-status="deleted">삭제</button></div>`).join('')||'<small>댓글 없음</small>';return}const c=e.target.closest('[data-admin-comment]');if(c){await call({action:'comment_status',id,comment_id:c.dataset.adminComment,status:c.dataset.commentStatus});c.closest('div').remove()}}catch(err){alert(err.message)}}
const STATUS_LABELS={pending:'승인대기',approved:'게시중',hidden:'숨김',rejected:'거절',expired:'만료',sold:'판매완료'};
const AREA_LABELS={dallas:'Dallas',carrollton:'Carrollton',plano:'Plano',frisco:'Frisco',lewisville:'Lewisville',richardson:'Richardson',irving:'Irving',coppell:'Coppell',fort_worth:'Fort Worth',other:'기타'};
const CONTACT_LABELS={'':'연락처 없음',phone:'전화',text:'문자',email:'이메일',kakao:'카카오톡',other:'기타'};
const imageTypes=['image/jpeg','image/png','image/webp'];
const imageAccept=imageTypes.join(',');
const imageLimit=3;

async function compressPromotionImage(file){
  if(!imageTypes.includes(file.type)||file.size>12*1024*1024)throw Error('JPG, PNG 또는 WebP 형식의 12MB 이하 파일을 선택하세요.');
  const bitmap=await createImageBitmap(file);
  try{
    const ratio=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(bitmap.width*ratio));
    canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
    canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
    for(const quality of [0.85,0.7,0.5]){
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',quality));
      if(blob?.type==='image/webp'&&blob.size<=1048576)return {blob,width:canvas.width,height:canvas.height};
    }
    throw Error('이미지를 1MB 이하로 압축할 수 없습니다.');
  }finally{bitmap.close();}
}

function revokePreview(image){
  if(image.preview)URL.revokeObjectURL(image.preview);
}

function initPromotionImages(form,row){
  const original=[...(row.community_post_images||[])].sort((a,b)=>(a.sort_order??0)-(b.sort_order??0));
  const state={entries:original.map(image=>({id:image.id,url:image.image_url})),dirty:false,attempt:null};
  form.promotionImages=state;
  const gallery=form.querySelector('[data-promotion-gallery]');
  const feedback=form.querySelector('[data-edit-feedback]');
  function render(){
    gallery.innerHTML=state.entries.map((image,i)=>`<figure class="promotion-image">
      <img src="${esc(image.preview||image.url)}" alt="이미지 ${i+1} 미리보기">
      <button type="button" aria-label="이미지 ${i+1} 삭제" class="promotion-remove" data-promotion-remove="${i}">×</button>
      <label class="promotion-replace">교체 <input type="file" aria-label="이미지 ${i+1} 교체" data-promotion-replace="${i}" accept="${imageAccept}"></label>
    </figure>`).join('');
    form.querySelector('[data-promotion-image-count]').textContent=`${state.entries.length}/${imageLimit}장`;
  }
  function edited(){
    state.dirty=true;
    state.attempt=null;
    feedback.textContent='';
    render();
  }
  function imageEntry(file){
    return {file,preview:URL.createObjectURL(file)};
  }
  form.addEventListener('click',event=>{
    const remove=event.target.closest('[data-promotion-remove]');
    if(!remove)return;
    const [image]=state.entries.splice(Number(remove.dataset.promotionRemove),1);
    revokePreview(image);
    edited();
  });
  form.addEventListener('change',event=>{
    const input=event.target;
    const replace=input.dataset.promotionReplace;
    if(!input.hasAttribute('data-promotion-add')&&replace===undefined)return;
    const files=Array.from(input.files||[]);
    input.value='';
    if(!files.length)return;
    if(files.some(file=>!imageTypes.includes(file.type)||file.size>12*1024*1024)){
      feedback.textContent='JPG, PNG 또는 WebP 형식의 12MB 이하 파일을 선택하세요.';return;
    }
    if(replace===undefined){
      if(state.entries.length+files.length>imageLimit){feedback.textContent='이미지는 최대 3장까지 첨부할 수 있습니다.';return;}
      state.entries.push(...files.map(imageEntry));
    }else{
      revokePreview(state.entries[Number(replace)]);
      state.entries[Number(replace)]=imageEntry(files[0]);
    }
    edited();
  });
  render();
}

async function preparePromotionImages(form,id,updated_at,feedback){
  const state=form.promotionImages;
  if(!state.dirty)return {};
  if(state.attempt)return state.attempt;
  const draft_id=crypto.randomUUID(),request_id=crypto.randomUUID();
  const files=[];
  for(const item of state.entries){
    if(item.file)files.push(await compressPromotionImage(item.file));
  }
  let uploads=[];
  if(files.length){
    feedback.textContent='이미지 업로드 중…';
    const result=await call({action:'promotion_upload',id,updated_at,draft_id,
      files:files.map(({blob,width,height})=>({mime_type:'image/webp',byte_size:blob.size,width,height}))});
    uploads=result.uploads;
    const storage=dependencies.getSupabaseClient().storage.from('community-images');
    for(const [i,file] of files.entries()){
      const {path,token}=uploads[i];
      const uploaded=await storage.uploadToSignedUrl(path,token,file.blob,{contentType:'image/webp'});
      if(uploaded.error)throw Error('이미지 업로드에 실패했습니다. 기존 글은 유지됩니다.');
    }
  }
  let index=0;
  state.attempt={draft_id,request_id,image_plan:state.entries.map(item=>item.file
    ? {kind:'upload',id:uploads[index++].id}:{kind:'existing',id:item.id})};
  return state.attempt;
}

function disposePromotionEdit(form){
  if(!form)return;
  form.promotionImages?.entries.forEach(revokePreview);
  form.remove();
}

const STATUS_ICONS={pending:'◷',approved:'✓',hidden:'◐',rejected:'×',expired:'⌛',sold:'▣'};
function statusCards(){
  return Object.entries(STATUS_LABELS).map(([key,label])=>
    `<button type="button" class="community-status-card" data-community-status="${key}" aria-pressed="false" aria-label="${label}">
       <span class="community-status-icon" aria-hidden="true">${STATUS_ICONS[key]}</span>
       <span class="community-status-label">${label}</span>
       <strong data-community-total="${key}">—</strong>
     </button>`).join('');
}

function drawCounts(counts){
  for(const [key,label] of Object.entries(STATUS_LABELS)){
    const value=document.querySelector(`[data-community-total="${key}"]`);
    const count=counts?.[key];
    value.textContent=Number.isInteger(count)?count.toLocaleString('ko-KR'):'조회 실패';
    value.classList.toggle('count-error',!Number.isInteger(count));
    value.closest('button').setAttribute('aria-label',label+' '+(Number.isInteger(count)?count+'건':'조회 실패'));
  }
}

function drawPages(pages,count){
  const next=Number.isInteger(count)&&(pageIndex+1)*50<count;
  if(!pageIndex&&!next)return;
  pages.innerHTML=`<button type="button" class="btn ghost" data-community-page="-1" ${pageIndex?'':'disabled'}>이전</button>
    <span> ${pageIndex+1} 페이지 </span><button type="button" class="btn ghost" data-community-page="1" ${next?'':'disabled'}>다음</button>`;
}

function openEdit(card,row){
  if(!row||card.querySelector('[data-promotion-edit]'))return;
  const form=document.createElement('form');
  form.dataset.promotionEdit='';
  form.className='promotion-editor';
  form.setAttribute('aria-label','업체홍보 수정');
  const options=(choices,value)=>Object.entries(choices).map(([key,label])=>
    `<option value="${key}" ${key===value?'selected':''}>${label}</option>`).join('');
  form.innerHTML=`<h4>업체홍보 수정</h4>
    <input type="hidden" name="updated_at" value="${esc(row.updated_at)}">
    <div class="promotion-fields">
      <label class="promotion-span">제목 <input name="title" minlength="2" maxlength="120" value="${esc(row.title)}" required></label>
      <label class="promotion-span">본문 <textarea name="body" rows="6" minlength="2" maxlength="5000" required>${esc(row.body)}</textarea></label>
      <label>작성자 표시명 <input name="author_name" maxlength="40" value="${esc(row.author_name)}" required></label>
      <label>지역 <select name="area">${options(AREA_LABELS,row.area||'other')}</select></label>
      <label>연락 방법 <select name="contact_type">${options(CONTACT_LABELS,row.contact_type||'')}</select></label>
      <label class="promotion-span">연락처 <input name="contact_value" maxlength="200" value="${esc(row.contact_value)}"></label>
      <fieldset class="promotion-span promotion-images"><legend>이미지 <span data-promotion-image-count></span></legend>
        <div class="promotion-gallery" data-promotion-gallery></div>
        <label class="promotion-add">＋ 이미지 추가 <input data-promotion-add type="file" accept="${imageAccept}" multiple></label>
        <small>최대 3장 · 장당 1MB 이하 WebP로 저장</small>
      </fieldset>
      <details class="promotion-span promotion-preview"><summary>수정 내용 미리보기</summary><strong data-preview-title></strong><p data-preview-body style="white-space:pre-wrap;overflow-wrap:anywhere"></p></details>
      <p class="promotion-span" role="status" data-edit-feedback></p><div class="promotion-span promotion-actions"><button type="submit" class="btn primary">저장</button>
      <button type="button" class="btn ghost" data-admin-edit-cancel>취소</button></div>
    </div>`;
  const preview=()=>{
    form.querySelector('[data-preview-title]').textContent=form.elements.title.value;
    form.querySelector('[data-preview-body]').textContent=form.elements.body.value;
  };
  form.addEventListener('input',preview);
  preview();
  initPromotionImages(form,row);
  card.querySelector('[data-admin-comment-list]').before(form);
  form.elements.title.focus();
}

async function saveEdit(event){
  const form=event.target.closest('[data-promotion-edit]');
  if(!form)return;
  event.preventDefault();
  const save=form.querySelector('[type="submit"]');
  const cancel=form.querySelector('[data-admin-edit-cancel]');
  const feedback=form.querySelector('[data-edit-feedback]');
  if(save.disabled)return;
  const fields=Object.fromEntries(new FormData(form));
  const id=form.closest('[data-community-admin-id]').dataset.communityAdminId;
  save.disabled=cancel.disabled=true;
  const controls=[...form.querySelectorAll('input[type="file"],[data-promotion-remove]')];
  controls.forEach(control=>{control.disabled=true;});
  feedback.textContent='저장 중…';
  try{
    const images=await preparePromotionImages(form,id,fields.updated_at,feedback);
    await call({...fields,...images,action:'edit_promotion',id});
    disposePromotionEdit(form);
    await load();
    const totals=document.getElementById('communityAdminFeedback');
    totals.append(document.createTextNode(' 수정 내용을 저장했습니다.'));
  }catch(error){
    feedback.textContent=error.message;
    save.disabled=cancel.disabled=false;
    controls.forEach(control=>{control.disabled=false;});
  }
}

export function initCommunityAdmin(injected){
  if(!injected||typeof injected.getSupabaseClient!=='function'||typeof injected.getSession!=='function'||typeof injected.getAdminScope!=='function')throw new Error('Community admin authentication dependency is required.');
  dependencies=injected;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(ensure,800),{once:true});
  else setTimeout(ensure,0);
}
