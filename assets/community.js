(function(root){'use strict';
const LABELS=root.DtmCommunityContract?.CATEGORIES||{job_hiring:'구인',job_seeking:'구직',marketplace:'사고팔기',housing:'렌트/부동산',qna:'질문/정보',neighborhood:'동네소식'};
const IMAGE_LIMITS=root.DtmCommunityContract?.IMAGE_LIMITS||{job_hiring:1,job_seeking:1,marketplace:3,housing:3,qna:2,neighborhood:3};
const AREAS=[['dallas','Dallas'],['carrollton','Carrollton'],['plano','Plano'],['frisco','Frisco'],['lewisville','Lewisville'],['richardson','Richardson'],['irving','Irving'],['coppell','Coppell'],['fort_worth','Fort Worth'],['other','Other']];
const BATCH=root.DtmCommunityContract?.BATCH_SIZE||20,PAGE=100;let all=[],filtered=[],visible=BATCH,filter='all',query='',total=0,current=null,legacy=[],legacyReady=false,nextOffset=0,complete=true,loading=false;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const el=id=>document.getElementById(id);const cfg=()=>root.KFOCUS_CONFIG||root.APP_CONFIG||{};
const defaultRobots=document.querySelector('meta[name="robots"]')?.getAttribute('content')??null;
function communityBucket(){if(cfg().COMMUNITY_STORAGE_BUCKET!=='community-images')throw new Error('Community storage is not configured.');return 'community-images'}
function syncRobots(){const meta=document.querySelector('meta[name="robots"]');if(!meta)return;if(/^#community(?:$|\/post\/[^/?#]+)/.test(location.hash))meta.setAttribute('content','noindex,follow');else if(defaultRobots!==null)meta.setAttribute('content',defaultRobots)}
syncRobots();root.addEventListener('hashchange',syncRobots);root.addEventListener('popstate',syncRobots);
function timeLabel(v){const ms=Date.now()-Date.parse(v);if(ms<3600000)return `${Math.max(1,Math.floor(ms/60000))}분 전`;if(ms<86400000)return `${Math.floor(ms/3600000)}시간 전`;return new Intl.DateTimeFormat('ko-KR',{timeZone:'America/Chicago',month:'short',day:'numeric'}).format(new Date(v))}
function ensureUI(){if(el('page-community'))return;const page=document.createElement('section');page.className='page';page.id='page-community';page.innerHTML=`<section class="card section-card community-page"><header class="community-page-head"><div><h2>달라스 라이프</h2><p>로그인 없이 함께 나누는 달라스 한인 생활 커뮤니티</p></div><button class="community-write" type="button" data-community-write>＋ 글쓰기</button></header><div class="community-tools"><div id="communityCategoryFilters" class="community-category-filters"></div><label class="community-search-field"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.6"></circle><path d="m16 16 5 5"></path></svg><input id="communitySearch" type="search" placeholder="제목, 내용, 지역 검색" aria-label="제목, 내용, 지역 검색"></label><button id="communitySearchBtn" type="button">검색</button></div><div id="communityResults" class="community-results"></div><div id="communityResultCount" class="community-result-count" hidden></div><button id="communityMore" class="community-more" type="button" hidden>더 보기</button><section class="community-legacy"><h3>기존 달라스 라이프</h3><p>운영자가 제공한 기존 생활정보입니다.</p><div id="communityLegacy"></div></section></section>`;document.querySelector('.app-main,.main-content,main')?.appendChild(page);
const modal=document.createElement('div');modal.id='communityModal';modal.className='community-modal hidden';modal.innerHTML=`<div class="community-modal-backdrop" data-community-close></div><div class="community-modal-panel" role="dialog" aria-modal="true"><button class="community-modal-x" type="button" data-community-close>×</button><div id="communityModalBody"></div></div>`;document.body.appendChild(modal);
  el('communitySearchBtn').onclick=()=>{query=el('communitySearch').value.trim();load()};el('communitySearch').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();query=e.target.value.trim();load()}};el('communityMore').onclick=()=>showMore();document.addEventListener('click',e=>{if(e.target.closest('[data-community-write]'))openWrite();if(e.target.closest('[data-community-close]'))closeModal();const card=e.target.closest('[data-community-post]');if(card)openPost(card.dataset.communityPost);const chip=e.target.closest('[data-community-category]');if(chip){filter=chip.dataset.communityCategory;visible=BATCH;renderFilters();load()}});renderFilters()}
function renderFilters(){const box=el('communityCategoryFilters');if(!box)return;box.innerHTML=[['all','전체'],...Object.entries(LABELS)].map(([k,v])=>`<button type="button" class="${filter===k?'active':''}" data-community-category="${k}">${v}</button>`).join('')}
function card(row){const area=AREAS.find(([key])=>key===String(row.area).toLowerCase())?.[1]||row.area;return `<button type="button" class="community-post-card${row.image_url?' has-image':''}" data-community-post="${esc(row.id)}">${row.image_url?`<img src="${esc(row.image_url)}" alt="" loading="lazy">`:''}<span class="community-post-copy"><span><em data-kind="${esc(row.category)}">${esc(LABELS[row.category]||row.category)}</em>${row.video_provider?'<span class="community-video-badge">▶ 영상</span>':''}</span><strong>${esc(row.title)}</strong><span class="community-post-preview">${esc(row.body_preview||'')}</span><small class="community-post-meta"><span class="community-post-place-time">${esc(area)} · ${timeLabel(row.created_at)}</span><span class="community-post-stats"><span class="community-post-stat"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l-2 2v-9.5A7.5 7.5 0 0 1 10.5 4h2A7.5 7.5 0 0 1 20 11.5Z"/></svg>${Number(row.comment_count)||0}</span><span class="community-post-stat"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></svg>${Number(row.view_count)||0}</span></span></small></span></button>`}
function renderList(){filtered=all;const shown=filtered.slice(0,visible),box=el('communityResults');if(box)box.innerHTML=shown.length?shown.map(card).join(''):'<div class="community-empty">조건에 맞는 게시글이 없습니다.</div>';const count=el('communityResultCount');if(count){count.textContent=`${shown.length} / ${total}개`;count.hidden=total<=BATCH}if(el('communityMore'))el('communityMore').hidden=shown.length>=total}
async function rpc(name,args){const c=cfg(),res=await fetch(`${c.SUPABASE_URL}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:c.SUPABASE_ANON_KEY,Authorization:`Bearer ${c.SUPABASE_ANON_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(args)});if(!res.ok)throw new Error('커뮤니티를 불러오지 못했습니다.');return res.json()}
async function load(){ensureUI();all=[];total=0;visible=BATCH;for(let offset=0,pages=0;pages<100;offset+=PAGE,pages++){const rows=await rpc('community_list_public_v2',{p_region:(cfg().APP_REGION||'dallas'),p_category:filter==='all'?null:filter,p_query:query||null,p_offset:offset,p_limit:PAGE});if(!Array.isArray(rows))break;if(rows.length){total=Number(rows[0].total_count)||rows.length;all.push(...rows.filter(r=>!all.some(x=>String(x.id)===String(r.id))))}if(rows.length<PAGE||all.length>=total)break}renderList();renderLegacy()}
function renderLegacy(){const box=el('communityLegacy');if(!box)return;if(!legacyReady){box.innerHTML='<div class="community-empty">기존 글을 불러오는 중입니다.</div>';return}box.innerHTML=legacy.length?legacy.map(p=>`<button type="button" class="community-legacy-card" data-legacy-id="${esc(p.id)}"><strong>${esc(p.title)}</strong><small>${timeLabel(p.created_at)}</small></button>`).join(''):'<div class="community-empty">기존 글이 없습니다.</div>';box.querySelectorAll('[data-legacy-id]').forEach(b=>b.onclick=()=>root.openBoardPost?.(b.dataset.legacyId))}
function setLegacyRows(rows){legacy=Array.isArray(rows)?rows.slice():[];legacyReady=true;renderLegacy()}
function openPage(legacyRows=[]){setLegacyRows(legacyRows);ensureUI();root.DtmNavigatePage?.('community');history.pushState({community:true},'',location.pathname+'#community');load().catch(showError)}
async function renderHome(container,legacyRows=[]){if(!container)return;try{const rows=await rpc('community_list_public_v2',{p_region:cfg().APP_REGION||'dallas',p_category:null,p_query:null,p_offset:0,p_limit:4});const cards=rows.map(card).join('');const old=legacyRows.slice(0,Math.max(0,4-rows.length)).map(p=>`<button type="button" class="board-row-btn" data-legacy-id="${esc(p.id)}"><span class="board-row-copy"><em class="board-row-badge">기존 달라스 라이프</em><strong>${esc(p.title)}</strong></span></button>`).join('');container.innerHTML=cards+old||'<div class="community-empty">등록된 글이 없습니다.</div>';container.querySelectorAll('[data-legacy-id]').forEach(b=>b.onclick=()=>root.openBoardPost?.(b.dataset.legacyId))}catch{container.innerHTML=legacyRows.slice(0,4).map(p=>`<button type="button" class="board-row-btn" data-legacy-id="${esc(p.id)}"><strong>${esc(p.title)}</strong></button>`).join('')}}
function turnstileBox(){return `<div class="community-turnstile" data-turnstile></div>`}
function openWrite(existing=null){ensureUI();const b=el('communityModalBody');b.innerHTML=`<form id="communityWriteForm"><h2>${existing?'게시글 수정':'글쓰기'}</h2><label>카테고리<select name="category">${Object.entries(LABELS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label><label>제목<input name="title" maxlength="120" required></label><label>내용<textarea name="body" maxlength="5000" rows="7" required></textarea></label><label>지역<select name="area">${AREAS.map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label><label>작성자/닉네임<input name="author_name" maxlength="40" required></label><div class="community-contact-row"><label>연락방법<select name="contact_type"><option value="">선택 안 함</option><option value="text">문자</option><option value="phone">전화</option><option value="email">이메일</option><option value="kakao">카카오톡</option><option value="other">기타</option></select></label><label>연락처<input name="contact_value" maxlength="200"></label></div><label>사진<input name="images" type="file" accept="image/jpeg,image/png,image/webp" multiple></label><div id="communityImagePreview" class="community-image-preview"></div><label>수정/삭제 비밀번호<input name="password" type="password" minlength="6" maxlength="72" required></label><label class="community-agree"><input name="agree" type="checkbox" required> 불법 거래, 사기성 게시물, 욕설·비방 및 타인의 개인정보가 포함된 글은 삭제될 수 있습니다.</label><p id="communityMarketplaceNote" hidden>사고팔기 게시물은 등록 후 30일 동안 게시됩니다.</p>${turnstileBox()}<div class="community-form-actions"><button type="button" data-community-close>취소</button><button type="submit">등록하기</button></div><div id="communityFormStatus"></div></form>`;showModal();const f=el('communityWriteForm');f.category.onchange=()=>{el('communityMarketplaceNote').hidden=f.category.value!=='marketplace'};f.images.onchange=()=>previewFiles(f);f.onsubmit=e=>submitPost(e,f);renderTurnstile(b)}
async function compress(file){if(file.size>15*1024*1024)throw new Error('원본 이미지는 15MB 이하만 선택할 수 있습니다.');if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('HEIC/HEIF는 지원하지 않습니다. JPG, PNG 또는 WebP를 선택해 주세요.');const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'}),scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();const blob=await new Promise((ok,no)=>canvas.toBlob(v=>v?ok(v):no(new Error('이미지 변환 실패')),'image/webp',.8));if(blob.size>1048576)throw new Error('압축 후 이미지가 너무 큽니다.');return{blob,width:canvas.width,height:canvas.height}}
async function previewFiles(f){const box=el('communityImagePreview'),files=[...f.images.files],limit=IMAGE_LIMITS[f.category.value]||0;if(files.length>limit){f.images.value='';box.textContent=`이 카테고리는 최대 ${limit}장까지 첨부할 수 있습니다.`;return}box.innerHTML=files.map(file=>`<span><img src="${URL.createObjectURL(file)}" alt="선택 이미지"><small>${esc(file.name)}</small></span>`).join('')}
let turnstileWidgetId=null,turnstileWidgetBox=null,turnstileToken='',turnstileGeneration=0,turnstileScriptPromise=null,turnstileConfigPromise=null;
function token(){return turnstileWidgetBox?.isConnected&&turnstileWidgetId!==null?turnstileToken:''}
function removeTurnstile(){turnstileGeneration++;turnstileToken='';if(turnstileWidgetId!==null&&root.turnstile){root.turnstile.remove(turnstileWidgetId)}turnstileWidgetId=null;turnstileWidgetBox=null}
function resetTurnstile(){turnstileToken='';if(turnstileWidgetId!==null&&root.turnstile)root.turnstile.reset(turnstileWidgetId)}
function loadTurnstileConfig(){if(cfg().COMMUNITY_TURNSTILE_SITE_KEY)return Promise.resolve();if(!turnstileConfigPromise)turnstileConfigPromise=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=`/.netlify/functions/config?community=${Date.now()}`;s.onload=resolve;s.onerror=reject;document.head.appendChild(s)}).catch(error=>{turnstileConfigPromise=null;throw error});return turnstileConfigPromise}
function loadTurnstileScript(){if(root.turnstile)return Promise.resolve();if(!turnstileScriptPromise)turnstileScriptPromise=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';s.async=true;s.defer=true;s.onload=resolve;s.onerror=reject;document.head.appendChild(s)}).catch(error=>{turnstileScriptPromise=null;throw error});return turnstileScriptPromise}
async function api(name,body){const generation=turnstileGeneration;try{const res=await fetch(`/.netlify/functions/${name}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),json=await res.json().catch(()=>({}));if(!res.ok)throw new Error(json.error||'요청에 실패했습니다.');return json}catch(error){if(generation===turnstileGeneration)resetTurnstile();throw error}}
async function submitPost(e,f){e.preventDefault();const submit=f.querySelector('[type="submit"]'),status=el('communityFormStatus');submit.disabled=true;try{const data=Object.fromEntries(new FormData(f)),files=[...f.images.files],draft=crypto.randomUUID(),ids=[];status.textContent=files.length?'이미지 준비 중...':'접수 중...';for(const file of files){const c=await compress(file),auth=await api('community-upload-authorize',{draft_id:draft,category:data.category,region:cfg().APP_REGION||'dallas',mime_type:'image/webp',byte_size:c.blob.size,width:c.width,height:c.height,turnstile_token:token()});const upload=await root.supabaseClient.storage.from(communityBucket()).uploadToSignedUrl(auth.upload.path,auth.upload.token,c.blob,{contentType:'image/webp'});if(upload.error)throw upload.error;ids.push(auth.upload.id)}await api('community-post-create',{...data,draft_id:draft,upload_ids:ids,region:cfg().APP_REGION||'dallas',turnstile_token:token()});status.textContent='게시글이 접수되었습니다. 관리자 확인 후 게시됩니다.';setTimeout(closeModal,1200)}catch(error){status.textContent=error.message;submit.disabled=false}}
async function openPost(id){ensureUI();const rows=await rpc('community_get_public',{p_post_id:id});if(!rows[0])return openHiddenGate(id);current=rows[0];const comments=await rpc('community_comments_public',{p_post_id:id});const p=current;removeTurnstile();el('communityModalBody').innerHTML=`<article class="community-detail"><em data-kind="${esc(p.category)}">${esc(LABELS[p.category])}</em><h2>${esc(p.title)}</h2><small>${esc(p.author_name)} · ${esc(p.area)} · ${timeLabel(p.created_at)} · 👁 ${p.view_count}</small>${(p.images||[]).map(i=>`<img src="${esc(i.image_url)}" alt="게시글 이미지">`).join('')}<p>${esc(p.body).replace(/\n/g,'<br>')}</p>${p.contact_value?`<button class="community-contact" type="button" data-contact="${esc(p.contact_value)}">${esc({phone:'전화하기',text:'문자 보내기',email:'이메일 보내기',kakao:'카카오톡 정보',other:'연락처 보기'}[p.contact_type]||'연락처 보기')}</button>`:''}<div class="community-owner-actions"><button type="button" data-owner-action="update">수정</button><button type="button" data-owner-action="delete">삭제</button>${p.category==='marketplace'?'<button type="button" data-owner-action="sold">판매완료</button>':''}<button type="button" data-community-share>공유</button></div><section><h3>댓글/답변 ${comments.length}</h3><div class="community-comments">${comments.map(c=>`<article><strong>${esc(c.author_name)}</strong><p>${esc(c.body)}</p><small>${timeLabel(c.created_at)}</small><button data-comment-delete="${esc(c.id)}">삭제</button></article>`).join('')}</div><form id="communityCommentForm"><input name="author_name" maxlength="40" placeholder="닉네임" required><textarea name="body" maxlength="1500" placeholder="댓글을 입력하세요" required></textarea><input name="password" type="password" minlength="6" placeholder="삭제 비밀번호" required>${turnstileBox()}<button type="submit">댓글 등록</button></form></section></article>`;showModal();renderTurnstile(el('communityModalBody'));el('communityCommentForm').onsubmit=async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target));try{await api('community-comment-create',{...data,post_id:id,turnstile_token:token()});openPost(id)}catch(err){resetTurnstile();alert(err.message)}};el('communityModalBody').onclick=detailClick}
const HIDDEN_REASONS={abuse:'욕설/비방',personal_info:'개인정보 포함',off_topic:'게시판 성격에 맞지 않음',promotion:'광고/홍보성 게시물',duplicate:'중복 게시물',other:'기타'};
function openHiddenGate(id){
  current=null;removeTurnstile();const body=el('communityModalBody');
  body.innerHTML=`<form id="communityHiddenGate"><h2>비공개 게시글 확인</h2><p>작성자라면 게시글 수정/삭제 비밀번호로 확인할 수 있습니다.</p><label>게시글 수정/삭제 비밀번호<input name="password" type="password" minlength="6" maxlength="72" required></label>${turnstileBox()}<div class="community-form-actions"><button type="button" data-community-close>취소</button><button type="submit">확인</button></div><p id="communityHiddenStatus" role="status"></p></form>`;
  showModal();renderTurnstile(body);
  const form=el('communityHiddenGate');form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('[type="submit"]');button.disabled=true;try{const result=await api('community-post-owner',{id,password:form.elements.password.value,turnstile_token:token()});renderHiddenPost(result.post)}catch(error){el('communityHiddenStatus').textContent=error.message;button.disabled=false}};
}
function renderHiddenPost(post){
  current=post;removeTurnstile();const body=el('communityModalBody');
  body.innerHTML=`<article class="community-detail"><h2>관리자에 의해 비공개 처리된 게시글입니다</h2><p>게시판 운영정책에 맞지 않는 내용이 포함되어 현재 다른 사용자에게 공개되지 않습니다. 내용을 수정하여 다시 검토받거나 게시글을 삭제해 주세요.</p><p>숨김 사유: ${esc(HIDDEN_REASONS[post.moderation_reason]||'기타')}</p><h3>${esc(post.title)}</h3><p>${esc(post.body).replace(/\n/g,'<br>')}</p>${(post.images||[]).map(image=>`<img src="${esc(image.image_url)}" alt="게시글 이미지">`).join('')}<div class="community-owner-actions"><button type="button" data-owner-action="update">수정 후 재검토 요청</button><button type="button" data-owner-action="delete">게시글 삭제</button></div></article>`;
  body.onclick=detailClick;
}
async function detailClick(e){const contact=e.target.closest('[data-contact]');if(contact){contact.textContent=contact.dataset.contact;return}const owner=e.target.closest('[data-owner-action]');if(owner){const password=prompt('수정/삭제 비밀번호를 입력하세요.');if(!password)return;try{if(owner.dataset.ownerAction==='update')return openWrite({...current,password});await api(`community-post-${owner.dataset.ownerAction}`,{id:current.id,password});closeModal();load()}catch(err){alert(err.message)}return}const del=e.target.closest('[data-comment-delete]');if(del){const password=prompt('댓글 삭제 비밀번호를 입력하세요.');if(password)try{await api('community-comment-delete',{id:del.dataset.commentDelete,password});openPost(current.id)}catch(err){alert(err.message)}}if(e.target.closest('[data-community-share]')){const url=`${location.origin}/#community/post/${current.id}`;if(navigator.share)await navigator.share({title:current.title,url});else{await navigator.clipboard.writeText(url);alert('링크를 복사했습니다.')}}}
async function renderTurnstile(rootEl){const box=rootEl?.querySelector('[data-turnstile]');if(!box)return;if(turnstileWidgetBox===box&&turnstileWidgetId!==null)return;removeTurnstile();const generation=turnstileGeneration;turnstileWidgetBox=box;box.textContent='보안 확인을 준비하는 중입니다.';try{await loadTurnstileConfig();const key=cfg().COMMUNITY_TURNSTILE_SITE_KEY;if(!key)throw new Error('설정되지 않았습니다.');await loadTurnstileScript();if(generation!==turnstileGeneration||!box.isConnected||el('communityModal')?.classList.contains('hidden'))return;box.textContent='';turnstileWidgetId=root.turnstile.render(box,{sitekey:key,theme:'light',callback:value=>{if(generation===turnstileGeneration)turnstileToken=value},'expired-callback':()=>{if(generation===turnstileGeneration)turnstileToken=''},'error-callback':()=>{if(generation===turnstileGeneration)turnstileToken=''}})}catch{if(generation===turnstileGeneration&&box.isConnected)box.textContent='보안 확인을 불러오지 못했습니다. 창을 닫고 다시 열어 주세요.'}}
function showModal(){if(turnstileWidgetBox&&!turnstileWidgetBox.isConnected)removeTurnstile();el('communityModal').classList.remove('hidden');document.body.style.overflow='hidden'}function closeModal(){removeTurnstile();el('communityModal')?.classList.add('hidden');document.body.style.overflow=''}function showError(e){const box=el('communityResults');if(box)box.innerHTML=`<div class="community-empty">${esc(e.message)}</div>`}
// Final Phase 1 editor supports owner updates without replacing existing images.
openWrite=function(existing=null){ensureUI();const b=el('communityModalBody');b.innerHTML=`<form id="communityWriteForm"><h2>${existing?'게시글 수정':'글쓰기'}</h2><label>카테고리<select name="category">${Object.entries(LABELS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label><label>제목<input name="title" maxlength="120" required></label><label>내용<textarea name="body" maxlength="5000" rows="7" required></textarea></label><label>지역<select name="area">${AREAS.map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label><label>작성자/닉네임<input name="author_name" maxlength="40" required></label><div class="community-contact-row"><label>연락방법<select name="contact_type"><option value="">선택 안 함</option><option value="text">문자</option><option value="phone">전화</option><option value="email">이메일</option><option value="kakao">카카오톡</option><option value="other">기타</option></select></label><label>연락처<input name="contact_value" maxlength="200"></label></div>${existing?'':'<label>사진<input name="images" type="file" accept="image/jpeg,image/png,image/webp" multiple></label><div id="communityImagePreview" class="community-image-preview"></div>'}<label>수정/삭제 비밀번호<input name="password" type="password" minlength="6" maxlength="72" required></label><label class="community-agree"><input name="agree" type="checkbox" required> 불법 거래, 사기성 게시물, 욕설·비방 및 타인의 개인정보가 포함된 글은 삭제될 수 있습니다.</label><p id="communityMarketplaceNote" hidden>사고팔기 게시물은 등록 후 30일 동안 게시됩니다.</p>${turnstileBox()}<div class="community-form-actions"><button type="button" data-community-close>취소</button><button type="submit">${existing?'수정 요청':'등록하기'}</button></div><div id="communityFormStatus"></div></form>`;showModal();const f=el('communityWriteForm');f.dataset.editId=existing?.id||'';if(existing)['category','title','body','area','author_name','contact_type','contact_value'].forEach(k=>{if(f.elements[k])f.elements[k].value=existing[k]||''});f.category.onchange=()=>{el('communityMarketplaceNote').hidden=f.category.value!=='marketplace'};f.category.onchange();if(f.images)f.images.onchange=()=>previewFiles(f);f.onsubmit=e=>submitPost(e,f);renderTurnstile(b)};
submitPost=async function(e,f){e.preventDefault();const submit=f.querySelector('[type="submit"]'),status=el('communityFormStatus');submit.disabled=true;try{const data=Object.fromEntries(new FormData(f)),turnstile_token=token();if(f.dataset.editId){await api('community-post-update',{...data,id:f.dataset.editId,region:cfg().APP_REGION||'dallas',turnstile_token});status.textContent='수정 내용이 접수되었습니다. 관리자 확인 후 게시됩니다.';return setTimeout(closeModal,1200)}const files=f.images?[...f.images.files]:[],draft=crypto.randomUUID(),ids=[],compressed=[];status.textContent=files.length?'이미지 준비 중...':'접수 중...';for(const file of files)compressed.push(await compress(file));if(compressed.length){const auth=await api('community-upload-authorize',{draft_id:draft,category:data.category,region:cfg().APP_REGION||'dallas',files:compressed.map(c=>({mime_type:'image/webp',byte_size:c.blob.size,width:c.width,height:c.height})),turnstile_token});for(let i=0;i<compressed.length;i++){const spec=auth.uploads[i],upload=await root.supabaseClient.storage.from(communityBucket()).uploadToSignedUrl(spec.path,spec.token,compressed[i].blob,{contentType:'image/webp'});if(upload.error)throw upload.error;ids.push(spec.id)}}await api('community-post-create',{...data,draft_id:draft,upload_ids:ids,region:cfg().APP_REGION||'dallas',turnstile_token});status.textContent='게시글이 접수되었습니다. 관리자 확인 후 게시됩니다.';setTimeout(closeModal,1200)}catch(error){status.textContent=error.message;submit.disabled=false}};
function openPostDelete(){
  const postId=current?.id;
  if(!postId)return;
  removeTurnstile();
  const body=el('communityModalBody');
  body.innerHTML=`<form id="communityPostDeleteForm" class="community-post-delete-form"><h2>게시글 삭제</h2><p>이 게시글을 삭제하시겠습니까? 삭제하면 즉시 공개되지 않습니다.</p><label>게시글 수정/삭제 비밀번호<input name="password" type="password" minlength="6" maxlength="72" autocomplete="off" required></label>${turnstileBox()}<div class="community-form-actions"><button type="button" data-delete-cancel>취소</button><button type="submit">게시글 삭제</button></div><p id="communityDeleteStatus" role="status" aria-live="polite"></p></form>`;
  renderTurnstile(body);
  const form=el('communityPostDeleteForm');
  form.querySelector('[data-delete-cancel]').onclick=()=>openPost(postId).catch(showError);
  form.onsubmit=async e=>{
    e.preventDefault();
    const button=form.querySelector('[type="submit"]'),status=el('communityDeleteStatus');
    button.disabled=true;
    try{
      await api('community-post-delete',{id:postId,password:form.elements.password.value,turnstile_token:token()});
      closeModal();
      await load();
    }catch(error){status.textContent=error.message;resetTurnstile();button.disabled=false}
  };
}
detailClick=async function(e){const contact=e.target.closest('[data-contact]');if(contact){contact.textContent=contact.dataset.contact;return}const owner=e.target.closest('[data-owner-action]');if(owner){if(owner.dataset.ownerAction==='update')return openWrite({...current});if(owner.dataset.ownerAction==='delete')return openPostDelete();const password=prompt('수정/삭제 비밀번호를 입력하세요.');if(!password)return;try{await api(`community-post-${owner.dataset.ownerAction}`,{id:current.id,password,turnstile_token:token()});closeModal();load()}catch(err){alert(err.message)}return}const del=e.target.closest('[data-comment-delete]');if(del){const password=prompt('댓글 삭제 비밀번호를 입력하세요.');if(password)try{await api('community-comment-delete',{id:del.dataset.commentDelete,password,turnstile_token:token()});openPost(current.id)}catch(err){alert(err.message)}}if(e.target.closest('[data-community-share]')){const url=`${location.origin}/#community/post/${current.id}`;if(navigator.share)await navigator.share({title:current.title,url});else{await navigator.clipboard.writeText(url);alert('링크를 복사했습니다.')}}};
// Image edits retain the original relation until the password-authorized,
// transactional image plan has committed. The editor never removes Storage files.
const originalOpenWrite=openWrite,originalSubmitPost=submitPost;
function editImageCount(f){const state=f._imageState;if(!state)return;const count=state.existing.filter(x=>!x.remove).length+state.added.length,max=IMAGE_LIMITS[f.category.value]||0;el('communityImageCount').textContent=`현재 ${count}장 / 최대 ${max}장`;f.elements.new_images.disabled=count>=max;return count<=max}
function renderEditImages(f){const state=f._imageState,box=el('communityEditImages');if(!state||!box)return;box.innerHTML=state.existing.map((item,index)=>`<div class="community-edit-image${item.remove?' is-removed':''}" data-edit-image="${index}"><img src="${esc(item.preview||item.image_url)}" alt="기존 이미지 ${index+1}"><div><strong>이미지 ${index+1}${item.remove?' · 제거 예정':''}</strong><label>이미지 교체<input type="file" accept="image/jpeg,image/png,image/webp" data-replace-image="${index}" ${item.remove?'disabled':''}></label><button type="button" data-remove-image="${index}">${item.remove?'제거 취소':'이미지 제거'}</button></div></div>`).join('')+state.added.map((item,index)=>`<div class="community-edit-image"><img src="${esc(item.preview)}" alt="추가 이미지 ${index+1}"><div><strong>새 이미지 ${index+1}</strong><button type="button" data-remove-added="${index}">추가 취소</button></div></div>`).join('');editImageCount(f)}
openWrite=function(existing=null){originalOpenWrite(existing);const f=el('communityWriteForm');const passwordNote=document.createElement('p');passwordNote.className='community-policy-note';passwordNote.textContent='게시글 수정·삭제 및 관리자 비공개 조치 후 본인 확인에 필요합니다. 비밀번호를 꼭 기억해 주세요.';f.elements.password.closest('label').after(passwordNote);if(!existing){const policy=document.createElement('aside');policy.className='community-policy-box';policy.innerHTML='<strong>게시글 작성 전 확인해 주세요</strong><p>욕설·비방, 타인의 개인정보가 포함된 글, 광고·홍보성 게시물 및 게시판 성격에 맞지 않는 글은 관리자에 의해 비공개 처리되거나 삭제될 수 있습니다.</p><p>비공개 처리된 글은 작성자가 비밀번호로 확인하여 수정 후 재검토를 요청하거나 직접 삭제할 수 있습니다.</p>';f.querySelector('.community-form-actions').before(policy);return}f.elements.password.value=existing.password||'';f._imageState={existing:(existing.images||[]).map(image=>({...image,remove:false,file:null,preview:null})),added:[]};const imageArea=document.createElement('section');imageArea.className='community-edit-image-area';imageArea.innerHTML='<h3>게시글 이미지</h3><p id="communityImageCount"></p><div id="communityEditImages"></div><label>새 이미지 추가<input name="new_images" type="file" accept="image/jpeg,image/png,image/webp" multiple></label>';f.elements.password.closest('label').before(imageArea);const oldCategoryChange=f.category.onchange;f.category.onchange=()=>{oldCategoryChange();editImageCount(f)};imageArea.onclick=e=>{const remove=e.target.closest('[data-remove-image]'),added=e.target.closest('[data-remove-added]');if(remove){const row=f._imageState.existing[Number(remove.dataset.removeImage)];row.remove=!row.remove;if(row.remove){row.file=null;row.preview=null}f._editAttempt=null;renderEditImages(f)}else if(added){const row=f._imageState.added.splice(Number(added.dataset.removeAdded),1)[0];if(row?.preview)URL.revokeObjectURL(row.preview);f._editAttempt=null;renderEditImages(f)}};imageArea.onchange=e=>{const replace=e.target.closest('[data-replace-image]');if(replace){const row=f._imageState.existing[Number(replace.dataset.replaceImage)];if(row.preview)URL.revokeObjectURL(row.preview);row.file=replace.files[0]||null;row.preview=row.file?URL.createObjectURL(row.file):null;f._editAttempt=null;renderEditImages(f)}else if(e.target.name==='new_images'){const files=[...e.target.files],max=IMAGE_LIMITS[f.category.value]||0;if(f._imageState.existing.filter(x=>!x.remove).length+f._imageState.added.length+files.length>max){el('communityFormStatus').textContent=`이 카테고리는 최대 ${max}장까지 첨부할 수 있습니다.`;e.target.value='';return}for(const file of files)f._imageState.added.push({file,preview:URL.createObjectURL(file)});e.target.value='';f._editAttempt=null;renderEditImages(f)}};renderEditImages(f);f.onsubmit=e=>submitPost(e,f)};
submitPost=async function(e,f){if(!f.dataset.editId)return originalSubmitPost(e,f);e.preventDefault();const submit=f.querySelector('[type="submit"]'),status=el('communityFormStatus');if(!editImageCount(f)){status.textContent='이미지 개수 제한을 확인해 주세요.';return}submit.disabled=true;try{const data=Object.fromEntries(new FormData(f)),state=f._imageState,region=cfg().APP_REGION||'dallas',turnstile_token=token();delete data.new_images;let attempt=f._editAttempt;if(!attempt){const entries=[...state.existing.filter(x=>!x.remove).map(x=>x.file?{kind:'file',file:x.file}:{kind:'existing',id:x.id}),...state.added.map(x=>({kind:'file',file:x.file}))],files=entries.filter(x=>x.kind==='file'),draft_id=crypto.randomUUID(),request_id=crypto.randomUUID(),compressed=[];status.textContent=files.length?'이미지 준비 중...':'수정 요청 중...';for(const entry of files)compressed.push(await compress(entry.file));let uploads=[];if(compressed.length){const auth=await api('community-upload-authorize',{post_id:f.dataset.editId,password:data.password,draft_id,category:data.category,region,files:compressed.map(c=>({mime_type:'image/webp',byte_size:c.blob.size,width:c.width,height:c.height})),turnstile_token});uploads=auth.uploads;for(let i=0;i<compressed.length;i++){const spec=uploads[i],uploaded=await root.supabaseClient.storage.from(communityBucket()).uploadToSignedUrl(spec.path,spec.token,compressed[i].blob,{contentType:'image/webp'});if(uploaded.error)throw uploaded.error}}let nextUpload=0;attempt={draft_id,request_id,image_plan:entries.map(x=>x.kind==='existing'?{kind:'existing',id:x.id}:{kind:'upload',id:uploads[nextUpload++].id})};f._editAttempt=attempt}await api('community-post-update',{...data,id:f.dataset.editId,region,turnstile_token,...attempt});status.textContent=current?.status==='hidden'?'수정된 게시글이 관리자 재검토를 위해 접수되었습니다. 승인 후 다시 공개됩니다.':'수정 내용이 접수되었습니다. 관리자 확인 후 게시됩니다.';setTimeout(closeModal,1200)}catch(error){status.textContent=error.message;submit.disabled=false}};
async function page(offset,{replace=false}={}){const region=cfg().APP_REGION||'dallas',conditions={region,filter,query,offset},run=()=>rpc('community_list_public_v2',{p_region:region,p_category:filter==='all'?null:filter,p_query:query||null,p_offset:offset,p_limit:PAGE}),commit=rows=>{const incoming=Array.isArray(rows)?rows:[];total=Number(incoming[0]?.total_count||(replace?incoming.length:total));all=replace?[]:all;const seen=new Set(all.map(r=>String(r.id)));for(const row of incoming)if(row?.id&&!seen.has(String(row.id))){seen.add(String(row.id));all.push(row)}nextOffset=offset+incoming.length;complete=incoming.length<PAGE||nextOffset>=total;renderList();renderLegacy()};if(root.DtmRequestCoordinator)return root.DtmRequestCoordinator.run({scope:'community-list',resource:'community-posts',conditions,loader:run,commit,fallback:showError,ttl:5000});try{commit(await run());return{status:'committed'}}catch(e){showError(e);return{status:'failed',error:e}}}
async function showMore(){if(loading)return;loading=true;visible+=BATCH;try{while(all.length<visible&&!complete){const result=await page(nextOffset);if(result?.status!=='committed')break}renderList()}finally{loading=false}}
load=async function(){ensureUI();visible=BATCH;all=[];total=0;nextOffset=0;complete=false;return page(0,{replace:true})};
const videoBaseRpc=rpc;
rpc=(name,args)=>videoBaseRpc(name==='community_get_public'?'community_get_public_v2':name,args);
const videoBaseOpenWrite=openWrite;
openWrite=function(existing=null){
  videoBaseOpenWrite(existing);
  const form=el('communityWriteForm'),anchor=existing?form.querySelector('.community-edit-image-area'):el('communityImagePreview');
  const section=document.createElement('div');section.className='community-video-input';
  section.innerHTML='<label>영상 (선택)<small>YouTube, Instagram 또는 Facebook 영상 링크를 추가할 수 있습니다.</small><input name="video_url" type="url" maxlength="2048" placeholder="영상 링크 붙여넣기" inputmode="url"></label>';
  anchor.after(section);
  const input=form.elements.video_url;input.value=existing?.video_url||'';
  const previousChange=form.category.onchange;
  form.category.onchange=()=>{previousChange?.();const allowed=['marketplace','housing'].includes(form.category.value);section.hidden=!allowed;input.disabled=!allowed;if(!allowed)input.value=''};
  form.category.onchange();
};
function safeVideo(post){
  if(!['marketplace','housing'].includes(post?.category)||!post.video_url)return null;
  let url;try{url=new URL(post.video_url)}catch{return null}
  if(url.protocol!=='https:'||url.username||url.password||url.port)return null;
  if(post.video_provider==='youtube'&&url.hostname==='www.youtube.com'&&url.pathname==='/watch'){
    const id=url.searchParams.get('v');return /^[A-Za-z0-9_-]{11}$/.test(id||'')?{provider:'youtube',id}:null;
  }
  if(post.video_provider==='instagram'&&url.hostname==='www.instagram.com'&&/^\/(p|reel|tv)\/[A-Za-z0-9_-]{5,100}\/$/.test(url.pathname))return{provider:'instagram',url:url.href};
  if(post.video_provider==='facebook'&&url.hostname==='www.facebook.com'&&(/^\/(?:reel\/[A-Za-z0-9_.-]{3,100}|(?:[A-Za-z0-9_.-]+\/)?videos\/[A-Za-z0-9_.-]{3,100})\/$/.test(url.pathname)||/^\/[A-Za-z0-9_.-]+\/posts\/[A-Za-z0-9_.-]{3,100}\/$/.test(url.pathname)||url.pathname==='/watch/'))return{provider:'facebook',url:url.href};
  return null;
}
function appendVideo(post){
  const data=safeVideo(post),article=el('communityModalBody')?.querySelector('.community-detail');if(!data||!article)return;
  const box=document.createElement('section');box.className='community-video-detail';
  if(data.provider==='youtube'){
    const frame=document.createElement('iframe');frame.src=`https://www.youtube.com/embed/${data.id}`;frame.title='YouTube 영상';frame.loading='lazy';frame.allowFullscreen=true;frame.referrerPolicy='strict-origin-when-cross-origin';frame.allow='encrypted-media; picture-in-picture; web-share';box.appendChild(frame);
  }else{
    const link=document.createElement('a');link.href=data.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent=data.provider==='instagram'?'Instagram에서 영상 보기':'Facebook에서 영상 보기';box.appendChild(link);
  }
  article.querySelector('.community-owner-actions')?.before(box);
}
const videoBaseOpenPost=openPost;
openPost=async function(id){await videoBaseOpenPost(id);if(current?.id===id)appendVideo(current)};
const videoBaseHiddenPost=renderHiddenPost;
renderHiddenPost=function(post){videoBaseHiddenPost(post);appendVideo(post)};
// Phase 2 isolated Preview: direct-file upload remains entirely unavailable on Production.
if(location.host==='deploy-preview-19--comforting-shortbread-ee588e.netlify.app'){
  const phase2OpenWrite=openWrite,phase2SubmitPost=submitPost;
  const MAX_VIDEO_BYTES=150*1024*1024;
  openWrite=function(existing=null){
    phase2OpenWrite(existing);
    if(existing)return;
    const form=el('communityWriteForm'),link=form.elements.video_url;
    const area=document.createElement('div');area.className='community-video-file-input';
    area.innerHTML='<label>영상 파일 (선택, MP4 · 최대 90초 · 150 MiB)<input name="video_file" type="file" accept="video/mp4,.mp4"></label><small>영상 링크와 파일 중 하나만 선택할 수 있습니다. 파일은 게시글 접수 후 비공개 임시 공간에 업로드됩니다.</small>';
    form.querySelector('.community-video-input').after(area);
    const file=form.elements.video_file;
    const previousChange=form.category.onchange;
    form.category.onchange=()=>{previousChange?.();const allowed=['marketplace','housing'].includes(form.category.value);area.hidden=!allowed;file.disabled=!allowed;if(!allowed)file.value='';link.disabled=!allowed||Boolean(file.files.length)};
    file.onchange=()=>{if(file.files.length){link.value='';link.disabled=true}else link.disabled=false};
    link.oninput=()=>{if(link.value.trim())file.value=''};
    form.category.onchange();
    form.onsubmit=e=>submitPost(e,form);
  };
  async function inspectVideoFile(file){
    if(!/\.mp4$/i.test(file.name)||file.type!=='video/mp4'||file.size<1||file.size>MAX_VIDEO_BYTES)
      throw new Error('MP4 영상은 150 MiB 이하여야 합니다.');
    const url=URL.createObjectURL(file),video=document.createElement('video');
    try{
      video.preload='metadata';video.src=url;
      await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=()=>reject(new Error('MP4 정보를 읽을 수 없습니다.'))});
      if(!Number.isFinite(video.duration)||video.duration<=0||video.duration>90)
        throw new Error('영상 길이는 최대 90초입니다.');
    }finally{video.removeAttribute('src');video.load();URL.revokeObjectURL(url)}
  }
  function uploadObject(url,file,onProgress){
    return new Promise((resolve,reject)=>{
      const xhr=new XMLHttpRequest();xhr.open('PUT',url);xhr.setRequestHeader('Content-Type','video/mp4');
      xhr.upload.onprogress=e=>{if(e.lengthComputable)onProgress(Math.min(100,Math.round(e.loaded/e.total*100)))};
      xhr.onload=()=>xhr.status>=200&&xhr.status<300?resolve():reject(new Error('임시 영상 업로드에 실패했습니다.'));
      xhr.onerror=()=>reject(new Error('임시 영상 업로드 연결이 끊겼습니다.'));
      xhr.send(file);
    });
  }
  async function waitForVideoJob(jobId,ticket,status){
    for(let i=0;i<20;i++){
      await new Promise(resolve=>setTimeout(resolve,1500));
      const state=await api('community-video-upload-status',{job_id:jobId,ticket});
      if(state.status==='uploaded'){
        status.textContent='영상 업로드가 완료되었습니다. 게시글 승인 후 상세에서 볼 수 있습니다.';return}
      if(state.status==='needs_review'){
        status.textContent='영상 파일 검증 완료. 관리자 확인을 기다리고 있습니다.';return}
      if(state.status==='failed')throw new Error('영상 검증에 실패했습니다. 게시글과 사진은 유지됩니다.');
      status.textContent='영상 파일을 검증하고 있습니다…';
    }
    status.textContent='영상 처리가 계속 진행 중입니다. 게시글과 사진은 유지됩니다.';
  }
  submitPost=async function(e,f){
    const file=f.elements.video_file?.files?.[0];
    if(!file||f.dataset.editId)return phase2SubmitPost(e,f);
    e.preventDefault();
    const submit=f.querySelector('[type="submit"]'),status=el('communityFormStatus');
    submit.disabled=true;
    try{
      await inspectVideoFile(file);
      const data=Object.fromEntries(new FormData(f));delete data.video_file;delete data.video_url;
      const images=f.images?[...f.images.files]:[],draft=crypto.randomUUID(),ids=[],compressed=[];
      status.textContent='게시글과 사진을 접수하고 있습니다…';
      for(const image of images)compressed.push(await compress(image));
      const turnstile_token=token();
      if(compressed.length){
        const auth=await api('community-upload-authorize',{draft_id:draft,category:data.category,
          region:cfg().APP_REGION||'dallas',files:compressed.map(c=>({mime_type:'image/webp',
            byte_size:c.blob.size,width:c.width,height:c.height})),turnstile_token});
        for(let i=0;i<compressed.length;i++){
          const spec=auth.uploads[i],uploaded=await root.supabaseClient.storage.from(communityBucket())
            .uploadToSignedUrl(spec.path,spec.token,compressed[i].blob,{contentType:'image/webp'});
          if(uploaded.error)throw uploaded.error;ids.push(spec.id)
        }
      }
      const post=await api('community-post-create',{...data,draft_id:draft,upload_ids:ids,
        region:cfg().APP_REGION||'dallas',turnstile_token});
      removeTurnstile();
      el('communityModalBody').innerHTML='<section class="community-video-upload-step"><h2>영상 파일 업로드</h2><p>게시글은 접수되었습니다. 아래 보안 확인 후 영상 파일을 업로드하세요.</p>'+turnstileBox()+'<div class="community-form-actions"><button type="button" data-community-close>나중에 하기</button><button id="communityVideoUploadStart" type="button">영상 업로드 시작</button></div><p id="communityVideoUploadStatus" role="status"></p></section>';
      await renderTurnstile(el('communityModalBody'));
      const uploadStatus=el('communityVideoUploadStatus');
      el('communityVideoUploadStart').onclick=async event=>{
        event.currentTarget.disabled=true;
        try{
          uploadStatus.textContent='업로드 권한을 확인하고 있습니다…';
          const admit=await api('community-video-upload-admit',{post_id:post.id,password:data.password,
            byte_size:file.size,mime_type:'video/mp4',turnstile_token:token()});
          const claimed=await fetch(`${admit.admission_url}admit`,{method:'POST',
            headers:{'Content-Type':'application/json'},body:JSON.stringify({job_id:admit.job_id,ticket:admit.ticket})});
          if(!claimed.ok)throw new Error('영상 업로드 세션을 만들지 못했습니다.');
          const session=await claimed.json();
          await uploadObject(session.upload_url,file,p=>{uploadStatus.textContent=`임시 영상 업로드 ${p}%`});
          uploadStatus.textContent='영상 파일을 검증하고 있습니다…';
          await waitForVideoJob(admit.job_id,admit.ticket,uploadStatus);
        }catch(error){uploadStatus.textContent=`${error.message} 게시글과 사진은 유지됩니다.`}
      };
    }catch(error){status.textContent=error.message;submit.disabled=false}
  };
}
root.DtmCommunity={LABELS,BATCH,ensureUI,openPage,setLegacyRows,renderHome,load,openPost,compress,closeModal,syncRobots,_state:()=>({all:[...all],total,visible,filter})};
document.addEventListener('DOMContentLoaded',()=>{ensureUI();setTimeout(()=>{const match=location.hash.match(/^#community\/post\/([^/?]+)/);if(match){root.DtmNavigatePage?.('community',{skipRoute:true});openPost(decodeURIComponent(match[1])).catch(showError)}else if(location.hash==='#community'){root.DtmNavigatePage?.('community',{skipRoute:true});load().catch(showError)}},0)});window.addEventListener('popstate',()=>{const match=location.hash.match(/^#community\/post\/([^/?]+)/);if(match){root.DtmNavigatePage?.('community',{skipRoute:true});openPost(decodeURIComponent(match[1])).catch(showError)}else if(location.hash==='#community'){closeModal();root.DtmNavigatePage?.('community',{skipRoute:true});load().catch(showError)}else closeModal()});
})(globalThis);
