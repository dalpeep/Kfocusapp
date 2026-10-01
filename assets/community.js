(function(root){'use strict';
const LABELS=root.DtmCommunityContract?.CATEGORIES||{job_hiring:'구인',job_seeking:'구직',marketplace:'사고팔기',housing:'렌트/부동산',qna:'질문/정보',neighborhood:'동네소식'};
const IMAGE_LIMITS=root.DtmCommunityContract?.IMAGE_LIMITS||{job_hiring:1,job_seeking:1,marketplace:3,housing:3,qna:2,neighborhood:3};
const AREAS=[['dallas','Dallas'],['carrollton','Carrollton'],['plano','Plano'],['frisco','Frisco'],['lewisville','Lewisville'],['richardson','Richardson'],['irving','Irving'],['coppell','Coppell'],['fort_worth','Fort Worth'],['other','Other']];
const BATCH=root.DtmCommunityContract?.BATCH_SIZE||20,PAGE=100;let all=[],filtered=[],visible=BATCH,filter='all',query='',total=0,current=null,legacy=[],legacyReady=false,nextOffset=0,complete=true,loading=false;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const el=id=>document.getElementById(id);const cfg=()=>root.KFOCUS_CONFIG||root.APP_CONFIG||{};
function formPayload(f){const data=Object.fromEntries(new FormData(f)),details={};for(const input of f.querySelectorAll('[data-detail-key]')){if(input.disabled)continue;const key=input.dataset.detailKey;details[key]=input.type==='checkbox'?input.checked:input.value.trim()}data.details=details;return data}
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
function openPage(legacyRows=[],selectedCategory=null){setLegacyRows(legacyRows);ensureUI();if(selectedCategory&&ui4Categories.includes(selectedCategory)){filter=selectedCategory;renderFilters()}root.DtmNavigatePage?.('community');history.pushState({community:true},'',location.pathname+'#community');load().catch(showError)}
let renderHome;
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
async function submitPost(e,f){e.preventDefault();const submit=f.querySelector('[type="submit"]'),status=el('communityFormStatus');submit.disabled=true;try{const data=formPayload(f),files=[...f.images.files],draft=crypto.randomUUID(),ids=[];status.textContent=files.length?'이미지 준비 중...':'접수 중...';for(const file of files){const c=await compress(file),auth=await api('community-upload-authorize',{draft_id:draft,category:data.category,region:cfg().APP_REGION||'dallas',mime_type:'image/webp',byte_size:c.blob.size,width:c.width,height:c.height,turnstile_token:token()});const upload=await root.supabaseClient.storage.from(communityBucket()).uploadToSignedUrl(auth.upload.path,auth.upload.token,c.blob,{contentType:'image/webp'});if(upload.error)throw upload.error;ids.push(auth.upload.id)}const result=await api('community-post-create',{...data,draft_id:draft,upload_ids:ids,region:cfg().APP_REGION||'dallas',turnstile_token:token()});status.textContent=result.status==='approved'?'게시글이 등록되었습니다.':'게시글이 등록되었습니다. 내용 확인 후 공개될 수 있습니다.';setTimeout(()=>{closeModal();if(result.status==='approved')load().catch(showError)},1200)}catch(error){status.textContent=error.message;submit.disabled=false}}
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
submitPost=async function(e,f){e.preventDefault();const submit=f.querySelector('[type="submit"]'),status=el('communityFormStatus');submit.disabled=true;try{const data=Object.fromEntries(new FormData(f)),turnstile_token=token();if(f.dataset.editId){await api('community-post-update',{...data,id:f.dataset.editId,region:cfg().APP_REGION||'dallas',turnstile_token});status.textContent='수정 내용이 접수되었습니다. 관리자 확인 후 게시됩니다.';return setTimeout(closeModal,1200)}const files=f.images?[...f.images.files]:[],draft=crypto.randomUUID(),ids=[],compressed=[];status.textContent=files.length?'이미지 준비 중...':'접수 중...';for(const file of files)compressed.push(await compress(file));if(compressed.length){const auth=await api('community-upload-authorize',{draft_id:draft,category:data.category,region:cfg().APP_REGION||'dallas',files:compressed.map(c=>({mime_type:'image/webp',byte_size:c.blob.size,width:c.width,height:c.height})),turnstile_token});for(let i=0;i<compressed.length;i++){const spec=auth.uploads[i],upload=await root.supabaseClient.storage.from(communityBucket()).uploadToSignedUrl(spec.path,spec.token,compressed[i].blob,{contentType:'image/webp'});if(upload.error)throw upload.error;ids.push(spec.id)}}const result=await api('community-post-create',{...data,draft_id:draft,upload_ids:ids,region:cfg().APP_REGION||'dallas',turnstile_token});status.textContent=result.status==='approved'?'게시글이 등록되었습니다.':'게시글이 등록되었습니다. 내용 확인 후 공개될 수 있습니다.';setTimeout(()=>{closeModal();if(result.status==='approved')load().catch(showError)},1200)}catch(error){status.textContent=error.message;submit.disabled=false}};
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
// Direct-file upload is opt-in per deployment; external video links remain available.
{
  const phase2OpenWrite=openWrite,phase2SubmitPost=submitPost;
  const MAX_VIDEO_BYTES=150*1024*1024;
  function refreshVideoFlag(){
    return new Promise(resolve=>{
      const script=document.createElement('script');
      script.src=`/.netlify/functions/config?community_video_ui=${Date.now()}`;
      script.onload=()=>{script.remove();resolve(cfg().COMMUNITY_VIDEO_UPLOAD_UI_ENABLED===true)};
      script.onerror=()=>{script.remove();resolve(false)};
      document.head.appendChild(script);
    });
  }
  function attachVideoField(form){
    if(el('communityWriteForm')!==form||form.elements.video_file)return;
    const link=form.elements.video_url;
    const area=document.createElement('div');area.className='community-video-file-input';
    area.innerHTML='<label><span class="community-video-file-label">동영상 (선택)</span><input name="video_file" type="file" accept="video/mp4,.mp4"></label><small class="community-video-file-hint"></small>';
    area.querySelector('small').textContent='상품 상태를 보여주는 MP4 동영상 1개를 추가할 수 있습니다. 최대 150 MiB · 90초.';
    form.querySelector('.community-video-input').after(area);
    const file=form.elements.video_file;
    const previousChange=form.category.onchange;
    form.category.onchange=()=>{previousChange?.();const allowed=['marketplace','housing'].includes(form.category.value);area.hidden=!allowed;file.disabled=!allowed;if(!allowed)file.value='';area.querySelector('.community-video-file-label').textContent=form.category.value==='housing'?'매물 동영상 (선택)':'동영상 (선택)';area.querySelector('small').textContent=(form.category.value==='housing'?'매물 내부 또는 외부를 보여주는 MP4 동영상 1개를 추가할 수 있습니다.':'상품 상태를 보여주는 MP4 동영상 1개를 추가할 수 있습니다.')+' 최대 150 MiB · 90초.'};
    form.category.onchange();
  }
  openWrite=function(existing=null){
    phase2OpenWrite(existing);
    if(existing)return;
    const form=el('communityWriteForm');
    refreshVideoFlag().then(enabled=>{if(enabled)attachVideoField(form)});
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
  function uploadObject(url,file,headers,onProgress){
    return new Promise((resolve,reject)=>{
      const xhr=new XMLHttpRequest();xhr.open('PUT',url);xhr.setRequestHeader('Content-Type','video/mp4');
      for(const [name,value] of Object.entries(headers||{}))xhr.setRequestHeader(name,value);
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
        status.textContent='게시글이 등록되었습니다. 동영상 처리가 완료되었습니다.';return}
      if(state.status==='needs_review'){
       status.textContent='게시글은 등록되었지만 동영상은 확인이 필요합니다. 다시 제출하지 마세요.';return}
       if(state.status==='failed')throw new Error('게시글은 등록되었지만 동영상 처리에 실패했습니다. 다시 제출하지 마세요.');
       status.textContent='동영상을 업로드하고 있습니다. 잠시 기다려 주세요.';
    }
     status.textContent='게시글이 등록되었습니다. 동영상은 처리 후 자동으로 표시됩니다.';
  }
  submitPost=async function(e,f){
    const file=f.elements.video_file?.files?.[0];
    if(!file||f.dataset.editId)return phase2SubmitPost(e,f);
    e.preventDefault();
    const submit=f.querySelector('[type="submit"]'),status=el('communityFormStatus');
     if(f._videoSubmitStarted)return;
     f._videoSubmitStarted=true;submit.disabled=true;
     let postCreateAttempted=false;
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
       postCreateAttempted=true;
       const post=await api('community-post-create',{...data,draft_id:draft,upload_ids:ids,
        region:cfg().APP_REGION||'dallas',turnstile_token});
      removeTurnstile();
       el('communityModalBody').innerHTML='<section class="community-video-upload-step"><h2>동영상 업로드</h2><p>게시글이 등록되었습니다. 동영상은 처리 후 자동으로 표시됩니다. 아래 보안 확인을 완료해 주세요.</p>'+turnstileBox()+'<div class="community-form-actions"><button type="button" data-community-close>나중에 하기</button><button id="communityVideoUploadStart" type="button">동영상 업로드 시작</button></div><p id="communityVideoUploadStatus" role="status"></p></section>';
      await renderTurnstile(el('communityModalBody'));
      const uploadStatus=el('communityVideoUploadStatus');
      el('communityVideoUploadStart').onclick=async event=>{
        event.currentTarget.disabled=true;
        try{
           uploadStatus.textContent='동영상을 업로드하고 있습니다. 잠시 기다려 주세요.';
          const admit=await api('community-video-upload-admit',{post_id:post.id,password:data.password,
            byte_size:file.size,mime_type:'video/mp4',turnstile_token:token()});
          const claimed=await fetch(`${admit.admission_url}admit`,{method:'POST',
            headers:{'Content-Type':'application/json'},body:JSON.stringify({job_id:admit.job_id,post_id:post.id,ticket:admit.ticket})});
          if(!claimed.ok)throw new Error('영상 업로드 세션을 만들지 못했습니다.');
          const session=await claimed.json();
          await uploadObject(session.upload_url,file,session.upload_headers,p=>{uploadStatus.textContent=`임시 영상 업로드 ${p}%`});
          uploadStatus.textContent='영상 파일을 검증하고 있습니다…';
          await waitForVideoJob(admit.job_id,admit.ticket,uploadStatus);
         }catch(error){uploadStatus.textContent=`${error.message} 게시글과 사진은 유지됩니다. 같은 영상을 다시 제출하지 마세요.`}
      };
     }catch(error){status.textContent=postCreateAttempted?'게시글 등록 결과를 확인할 수 없습니다. 다시 제출하지 마세요.':error.message;if(!postCreateAttempted){submit.disabled=false;f._videoSubmitStarted=false}}
  };
  // A video-only recovery never calls community-post-create. The author must
  // present a fresh challenge and password before a new bound ticket is issued.
  const videoUploadOpenPost=openPost;
  openPost=async function(id){
    await videoUploadOpenPost(id);
    const post=current,actions=el('communityModalBody')?.querySelector('.community-owner-actions');
    if(!post||post.id!==id||!actions||post.video_url||post.video_provider||
       !['marketplace','housing'].includes(post.category)||!(await refreshVideoFlag()))return;
    if(current?.id!==id||!actions.isConnected)return;
    const button=document.createElement('button');
    button.type='button';button.textContent='동영상 다시 업로드';actions.appendChild(button);
    button.onclick=()=>{
      removeTurnstile();
      const body=el('communityModalBody');
      body.innerHTML=`<form id="communityVideoRetryForm"><h2>동영상 다시 업로드</h2><p>게시글은 유지됩니다. 영상 업로드에 실패한 작성자만 수정/삭제 비밀번호로 다시 시도할 수 있습니다.</p><label>MP4 동영상 1개<input name="video_file" type="file" accept="video/mp4,.mp4" required></label><label>수정/삭제 비밀번호<input name="password" type="password" minlength="6" maxlength="72" required></label>${turnstileBox()}<div class="community-form-actions"><button type="button" data-community-close>취소</button><button type="submit">동영상 업로드 시작</button></div><p id="communityVideoRetryStatus" role="status"></p></form>`;
      renderTurnstile(body);
      const form=el('communityVideoRetryForm'),status=el('communityVideoRetryStatus');
      form.onsubmit=async event=>{
        event.preventDefault();
        if(form.dataset.attempted)return;
        form.dataset.attempted='true';form.querySelector('[type="submit"]').disabled=true;
        try{
          const file=form.elements.video_file.files[0];
          await inspectVideoFile(file);
          status.textContent='동영상을 업로드하고 있습니다. 잠시 기다려 주세요.';
          const admitted=await api('community-video-upload-admit',{
            post_id:id,password:form.elements.password.value,
            byte_size:file.size,mime_type:'video/mp4',turnstile_token:token()});
          const claimed=await fetch(`${admitted.admission_url}admit`,{method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({job_id:admitted.job_id,post_id:id,ticket:admitted.ticket})});
          if(!claimed.ok)throw new Error('영상 업로드 세션을 만들지 못했습니다.');
          const session=await claimed.json();
          await uploadObject(session.upload_url,file,session.upload_headers,p=>{status.textContent=`임시 영상 업로드 ${p}%`});
          status.textContent='영상 파일을 검증하고 있습니다…';
          await waitForVideoJob(admitted.job_id,admitted.ticket,status);
        }catch(error){status.textContent=`게시글은 등록되었습니다. 동영상 업로드에 실패했습니다. ${error.message} 같은 영상을 다시 제출하지 마세요.`}
      };
    };
  };
}
// Phase 3 extends the single Community form without changing legacy posts.
const DETAIL_FIELDS={
  job_hiring:[['business_name','회사/업소명','text',true],['occupation','모집 직종','text',true],['employment_type','고용 형태','select',true,{full_time:'Full-time',part_time:'Part-time',contract:'Contract',other:'기타'}],['pay','급여 (금액 또는 협의)','text',true],['work_area','근무지역','text',true],['work_hours','근무시간','text'],['deadline','마감일','date']],
  job_seeking:[['occupation','희망 직종','text',true],['experience','경력','text',true],['preferred_area','희망 근무지역','text',true],['employment_type','희망 근무형태','select',true,{full_time:'Full-time',part_time:'Part-time',contract:'Contract',other:'기타'}],['available_from','가능 시작일','date']],
  marketplace:[['listing_type','구분','select',true,{sell:'판매',buy:'구매'}],['item_name','상품명','text',true],['price','가격 ($ 또는 협의)','text',true],['negotiable','가격협의 가능','checkbox'],['item_condition','상품 상태','select',true,{new:'새상품',like_new:'거의 새것',used:'중고',other:'기타'}],['trade_area','거래지역','text',true]],
  housing:[['price','가격 ($)','number'],['price_on_request','가격 문의','checkbox']],
  neighborhood:[['news_type','소식 유형','select',true,{event:'행사',local:'지역소식',notice:'안내',other:'기타'}],['event_date','행사·일정 날짜','date'],['venue','장소','text'],['external_url','외부 링크','url']],
  qna:[['post_type','구분','select',true,{question:'질문',information:'정보공유'}],['topic','주제','text',true],['resolved','해결됨','checkbox']]
};
function detailControls(category,values={},legacy=false){return (DETAIL_FIELDS[category]||[]).map(([key,label,type,required,options])=>`<label>${esc(label)} ${required&&!legacy?'<b aria-label="필수">*</b>':'<small>(선택)</small>'}${type==='select'?`<select data-detail-key="${key}" ${required&&!legacy?'required':''}><option value="">선택</option>${Object.entries(options).map(([value,name])=>`<option value="${value}" ${values[key]===value?'selected':''}>${esc(name)}</option>`).join('')}</select>`:`<input data-detail-key="${key}" type="${type}" ${type==='number'?'min="1" max="9999999999" step="1"':`maxlength="${key==='external_url'?2048:160}"`} ${type==='checkbox'?(values[key]?'checked':''):`value="${esc(values[key]||'')}"`} ${required&&!legacy?'required':''}>`}</label>`).join('')}
const boardBaseOpenWrite=openWrite;
openWrite=function(existing=null){boardBaseOpenWrite(existing);const f=el('communityWriteForm'),field=f.elements.category,box=document.createElement('section');box.className='community-category-details';box.setAttribute('aria-label','카테고리별 추가 정보');field.closest('label').after(box);const hidden=document.createElement('input');hidden.type='hidden';hidden.name='details';box.after(hidden);const prior=field.onchange;const refresh=()=>{prior?.();const legacy=Boolean(existing&&!existing.details&&field.value===existing.category);box.innerHTML=detailControls(field.value,field.value===existing?.category?existing?.details||{}:{},legacy);box.hidden=!DETAIL_FIELDS[field.value]?.length};field.onchange=refresh;refresh();f.addEventListener('submit',()=>{const details={};for(const input of box.querySelectorAll('[data-detail-key]'))details[input.dataset.detailKey]=input.type==='checkbox'?input.checked:input.value.trim();hidden.value=JSON.stringify(details)},true)};
const boardBaseCard=card;
const housingPrice=d=>d?.price&&/^[1-9]\d{0,9}$/.test(String(d.price))?`$${Number(d.price).toLocaleString('en-US')}`:d?.price_on_request===true?'가격 문의':'';
const detailOption=(key,value)=>({employment_type:{full_time:'Full-time',part_time:'Part-time',contract:'Contract',other:'기타'},item_condition:{new:'새상품',like_new:'거의 새것',used:'중고',other:'기타'},news_type:{event:'행사',local:'지역소식',notice:'안내',other:'기타'},post_type:{question:'질문',information:'정보공유'},listing_type:{sell:'판매',buy:'구매'}}[key]?.[value]||value);
card=function(row){const d=row.details||{},bits=row.category==='job_hiring'?[d.occupation,d.business_name,d.work_area,detailOption('employment_type',d.employment_type),d.pay]:row.category==='job_seeking'?[d.occupation,d.experience,d.preferred_area,detailOption('employment_type',d.employment_type)]:row.category==='marketplace'?[d.price,d.item_condition&&detailOption('item_condition',d.item_condition),d.trade_area]:row.category==='housing'?[housingPrice(d)]:row.category==='neighborhood'?[detailOption('news_type',d.news_type),d.event_date,d.venue]:row.category==='qna'?[detailOption('post_type',d.post_type),d.topic]:[];let html=boardBaseCard(row);const summary=bits.filter(Boolean).map(esc).join(' · ');if(summary){const summaryHtml=`<span class="community-card-summary">${summary}</span>`,titleHtml=`<strong>${esc(row.title)}</strong>`;html=['housing','job_hiring','job_seeking','neighborhood','qna'].includes(row.category)?html.replace(titleHtml,`${summaryHtml}${titleHtml}`):html.replace('<span class="community-post-preview">',`${summaryHtml}<span class="community-post-preview">`)}html=html.replace('class="community-post-card',`class="community-post-card community-card-${esc(row.category)}`).replace('▶ 영상</span>','▶ 동영상</span>');if(row.status==='sold')html=html.replace('</em>', '</em><span class="community-state-badge">판매완료</span>');if(d.resolved===true)html=html.replace('</em>', '</em><span class="community-state-badge">✓ 해결됨</span>');return html};
function appendCategoryDetails(post){const article=el('communityModalBody')?.querySelector('.community-detail');if(!article)return;const d=post.details||{},fields=DETAIL_FIELDS[post.category]||[],rows=fields.filter(([key])=>d[key]!==undefined&&d[key]!==null&&d[key]!==''&&key!=='negotiable'&&key!=='resolved'&&key!=='price_on_request').map(([key,label,, ,options])=>`<div><dt>${esc(label)}</dt><dd>${esc(post.category==='housing'&&key==='price'?housingPrice(d):options?.[d[key]]||d[key])}</dd></div>`);if(post.category==='housing'&&d.price_on_request===true)rows.unshift('<div><dt>가격</dt><dd>가격 문의</dd></div>');if(post.category==='marketplace'&&d.negotiable)rows.push('<div><dt>가격협의</dt><dd>가능</dd></div>');if(rows.length){const section=document.createElement('section');section.className='community-detail-fields';section.innerHTML=`<h3>상세 정보</h3><dl>${rows.join('')}</dl>`;article.querySelector('.community-owner-actions')?.before(section)}if(post.status==='sold'){article.querySelector('h2')?.insertAdjacentHTML('beforebegin','<span class="community-state-badge">판매완료</span>');article.querySelector('.community-contact')?.remove();article.querySelector('#communityCommentForm')?.remove()}if(d.resolved===true)article.querySelector('h2')?.insertAdjacentHTML('beforebegin','<span class="community-state-badge">✓ 해결됨</span>')}
const boardBaseOpenPost=openPost;
const boardBaseAppendDetails=appendCategoryDetails;
appendCategoryDetails=function(post){boardBaseAppendDetails(post);if(post.category!=='neighborhood'||!post.details?.external_url)return;try{const url=new URL(post.details.external_url);if(url.protocol!=='https:'||url.username||url.password)return;const article=el('communityModalBody')?.querySelector('.community-detail');if(!article)return;const link=document.createElement('a');link.className='community-detail-external-link';link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';link.textContent='외부 링크 열기';article.querySelector('.community-owner-actions')?.before(link)}catch{}};
openPost=async function(id){await boardBaseOpenPost(id);if(current?.id===id)appendCategoryDetails(current)};
const boardBaseHiddenPost=renderHiddenPost;
renderHiddenPost=function(post){boardBaseHiddenPost(post);appendCategoryDetails(post)};
// Keep a user-supplied external link separate from the Worker-owned canonical
// video_url when a direct MP4 upload is selected. Both categories use the same
// community_posts.details JSONB column; no legacy row is rewritten.
const phase31OpenWrite=openWrite;
openWrite=function(existing=null){
  phase31OpenWrite(existing);
  const form=el('communityWriteForm'),link=form.elements.video_url;
  if(existing?.details?.external_video_url){
    link.value=existing.details.external_video_url;
    link.name='external_video_display';
    const canonical=document.createElement('input');canonical.type='hidden';canonical.name='video_url';
    canonical.value=existing.video_url||'';link.after(canonical);
  }
  form.addEventListener('submit',()=>{
    const file=form.elements.video_file?.files?.[0],external=link.value.trim();
    const detailsInput=form.elements.details;
    if(!detailsInput)return;
    const details=JSON.parse(detailsInput.value||'{}');
    if(['marketplace','housing'].includes(form.category.value)&&(file||existing?.details?.external_video_url)&&external)details.external_video_url=external;
    detailsInput.value=JSON.stringify(details);
  },true);
};
const phase31OpenPost=openPost;
const housingPriceOpenWrite=openWrite;
openWrite=function(existing=null){
  housingPriceOpenWrite(existing);
  const form=el('communityWriteForm');
  const bind=()=>{
    const price=form.querySelector('[data-detail-key="price"]'),onRequest=form.querySelector('[data-detail-key="price_on_request"]');
    if(!price||!onRequest)return;
    if(onRequest.checked)price.value='';
    price.disabled=onRequest.checked;
    onRequest.onchange=()=>{if(onRequest.checked)price.value='';price.disabled=onRequest.checked};
    price.oninput=()=>{if(price.value)onRequest.checked=false};
  };
  form.elements.category.addEventListener('change',bind);
  bind();
};
openPost=async function(id){
  await phase31OpenPost(id);
  if(current?.id===id&&current.details?.external_video_url&&current.details.external_video_url!==current.video_url){
    const external=current.details.external_video_url;
    let provider='';try{const host=new URL(external).hostname;provider=host.includes('youtube')?'youtube':host.includes('instagram')?'instagram':host.includes('facebook')?'facebook':''}catch{}
    if(provider)appendVideo({...current,video_url:external,video_provider:provider});
  }
};
const categoryLayoutOpenPost=openPost;
openPost=async function(id){
  await categoryLayoutOpenPost(id);
  if(current?.id!==id||!['housing','marketplace'].includes(current.category))return;
  const article=el('communityModalBody')?.querySelector('.community-detail'),body=article?.querySelector(':scope > p');
  if(!body)return;
  const facts=article.querySelector('.community-detail-fields'),video=article.querySelector('.community-video-detail');
  if(facts)body.before(facts);
  if(video)body.before(video);
};
const boardBaseRpc=rpc;
rpc=(name,args)=>boardBaseRpc(name==='community_get_public'||name==='community_get_public_v2'?'community_get_public_v3':name==='community_list_public_v2'?'community_list_public_v3':name==='community_comments_public'?'community_comments_public_v3':name,args);
// UI 4.0 keeps the Phase 3 data and mutation paths, but gives each category a
// distinct reading order in both the category feed and the mixed feed.
const ui4Labels={...LABELS,housing:'부동산',qna:'질문정보'};
const ui4Categories=['all','job_hiring','job_seeking','marketplace','housing','neighborhood','qna'];
const ui4RenderCategoryChips=(box,selected,attribute,includeAll=true)=>{if(box)box.innerHTML=(includeAll?ui4Categories:ui4Categories.slice(1)).map(key=>`<button type="button" class="${selected===key?'active':''}" ${attribute}="${key}">${key==='all'?'전체':ui4Labels[key]}</button>`).join('')};
renderFilters=function(){ui4RenderCategoryChips(el('communityCategoryFilters'),filter,'data-community-category')};
const ui4EnsureUI=ensureUI;
ensureUI=function(){ui4EnsureUI();const head=el('page-community')?.querySelector('.community-page-head');if(head&&!head.classList.contains('community-ui41-head')){head.classList.add('section-head','compact-head','community-ui41-head');head.innerHTML='<h2 class="section-title"><span class="section-title-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M7 8h4v4H7zM14 8h3M14 12h3M7 16h10"></path></svg></span><span>커뮤니티</span></h2><button class="text-link community-write" type="button" data-community-write>＋ 글쓰기</button>'}const chips=el('communityCategoryFilters');if(chips)chips.classList.add('life-category-filters')};
const ui4Text=value=>value===undefined||value===null?'':String(value).trim();
const ui4Parts=(...parts)=>parts.map(ui4Text).filter(Boolean).map(esc).join(' · ');
const ui4Price=value=>{const raw=ui4Text(value);return /^\d+(?:\.\d{1,2})?$/.test(raw)&&Number(raw)>0?`$${Number(raw).toLocaleString('en-US')}`:raw};
const ui4Badge=(label,kind='')=>`<span class="community-ui4-badge ${kind}">${esc(label)}</span>`;
const ui4Media=row=>row.image_url?`<img class="community-ui4-image" src="${esc(row.image_url)}" alt="" loading="lazy">`:'';
card=function(row){
  const d=row.details||{},category=row.category,area=AREAS.find(([key])=>key===String(row.area||'').toLowerCase())?.[1]||row.area;
  const recent=Date.now()-Date.parse(row.created_at)<86400000;
  const badges=[ui4Badge(ui4Labels[category]||category,'category')];
  if(recent)badges.push(ui4Badge('NEW'));
  if(['marketplace','housing'].includes(category)&&(row.video_url||row.video_provider||d.external_video_url))badges.push(ui4Badge('▶ 동영상'));
  if(category==='marketplace'&&row.status==='sold')badges.push(ui4Badge('판매완료'));
  if(category==='qna'&&d.resolved===true)badges.push(ui4Badge('✓ 해결됨'));
  const title=`<strong class="community-ui4-title">${esc(row.title||'')}</strong>`;
  const preview=row.body_preview?`<span class="community-ui4-preview">${esc(row.body_preview)}</span>`:'';
  let content='';
  if(category==='marketplace')content=`${ui4Media(row)}<span class="community-ui4-copy">${title}${d.price?`<b class="community-ui4-price">${esc(ui4Price(d.price))}</b>`:''}<span class="community-ui4-facts">${ui4Parts(detailOption('item_condition',d.item_condition),d.trade_area||area)}</span></span>`;
  else if(category==='housing')content=`${ui4Media(row)}<span class="community-ui4-copy">${housingPrice(d)?`<b class="community-ui4-price">${esc(housingPrice(d))}</b>`:''}${title}<span class="community-ui4-facts">${ui4Parts(d.listing_type&&detailOption('listing_type',d.listing_type),area,d.property_type,d.bedrooms&&`${d.bedrooms} bed`)}</span></span>`;
  else if(category==='job_hiring')content=`<span class="community-ui4-copy"><b class="community-ui4-lead">${esc(d.occupation||row.title||'')}</b>${d.occupation?title:''}<span class="community-ui4-facts">${ui4Parts(d.business_name,d.work_area||area,detailOption('employment_type',d.employment_type))}</span>${d.pay?`<span class="community-ui4-pay">${esc(d.pay)}</span>`:''}</span>`;
  else if(category==='job_seeking')content=`<span class="community-ui4-copy"><b class="community-ui4-lead">${esc(d.occupation||row.title||'')}</b>${d.occupation?title:''}<span class="community-ui4-facts">${ui4Parts(d.experience,d.preferred_area||area,detailOption('employment_type',d.employment_type))}</span></span>`;
  else if(category==='neighborhood')content=`<span class="community-ui4-copy">${d.news_type?ui4Badge(detailOption('news_type',d.news_type),'subtype'):''}${title}<span class="community-ui4-facts">${ui4Parts(d.event_date,d.venue)}</span>${preview}</span>${ui4Media(row)}`;
  else if(category==='qna')content=`<span class="community-ui4-copy">${d.post_type?ui4Badge(detailOption('post_type',d.post_type),'subtype'):''}${title}${preview}<span class="community-ui4-facts">댓글 ${Number(row.comment_count)||0} · ${esc(area||'')} · ${timeLabel(row.created_at)}</span></span>`;
  else content=`<span class="community-ui4-copy">${title}${preview}</span>`;
  const meta=category==='qna'?'':`<small class="community-ui4-meta">${['housing','job_hiring','job_seeking'].includes(category)?'':area?`${esc(area)} · `:''}${timeLabel(row.created_at)}</small>`;
  return `<button type="button" class="community-post-card community-ui4-card community-ui4-${esc(category)}${row.image_url?' has-image':''}" data-community-post="${esc(row.id)}"><span class="community-ui4-badges">${badges.join('')}</span><span class="community-ui4-layout">${content}</span>${meta}</button>`;
};
let ui42HomeRequest=0;
renderHome=async function(container,selectedCategory='all'){
  if(!container)return;
  ensureUI();
  const category=ui4Categories.includes(selectedCategory)?selectedCategory:'all';
  ui4RenderCategoryChips(el('communityHomeFilters'),category,'data-community-home-category',false);
  const request=++ui42HomeRequest;
  container.innerHTML='<div class="community-home-empty">커뮤니티 글을 불러오는 중입니다.</div>';
  try{
    const rows=await rpc('community_list_public_v2',{p_region:cfg().APP_REGION||'dallas',p_category:category==='all'?null:category,p_query:null,p_offset:0,p_limit:3});
    if(request!==ui42HomeRequest)return;
    if(!Array.isArray(rows))throw Error('Invalid Community response');
    container.innerHTML=rows.length?rows.slice(0,3).map(card).join(''):`<div class="community-home-empty">아직 등록된 ${esc(category==='all'?'커뮤니티':ui4Labels[category])} 글이 없습니다.<button type="button" data-community-write>＋ 글쓰기</button></div>`;
  }catch{
    if(request===ui42HomeRequest)container.innerHTML='<div class="community-home-empty">커뮤니티 글을 불러오지 못했습니다.</div>';
  }
};
const ui4RenderList=renderList;
renderList=function(){ui4RenderList();if(all.length||query)return;const box=el('communityResults');if(box)box.innerHTML=`<div class="community-empty"><p>아직 등록된 ${esc(filter==='all'?'커뮤니티':ui4Labels[filter]||'커뮤니티')} 글이 없습니다.</p><p>첫 번째 글을 등록해 보세요.</p><button class="community-write" type="button" data-community-write>＋ 글쓰기</button></div>`};
const ui4OpenWrite=openWrite;
openWrite=function(existing=null){
  ui4OpenWrite(existing);
  const form=el('communityWriteForm');if(!form)return;
  const categorySelect=form.elements.category;
  for(const option of categorySelect.options)if(ui4Labels[option.value])option.textContent=ui4Labels[option.value];
  categorySelect.append(categorySelect.querySelector('option[value="qna"]'));
  const section=(name,anchor)=>{const fieldset=document.createElement('fieldset');fieldset.className='community-ui4-form-section';fieldset.innerHTML=`<legend>${name}</legend>`;anchor.before(fieldset);return fieldset};
  const basic=section('기본 정보',form.elements.category.closest('label'));
  for(const name of ['category','title','body','area'])basic.append(form.elements[name].closest('label'));
  const details=form.querySelector('.community-category-details');if(details){const box=section('상세 정보',details);box.append(details)}
  const mediaAnchor=form.querySelector('.community-video-input,.community-edit-image-area,#communityImagePreview,label:has([name="images"])');
  let media;
  if(mediaAnchor){media=section('사진·영상',mediaAnchor);for(const node of [...form.children])if(node.matches?.('.community-video-input,.community-video-file-input,.community-edit-image-area,#communityImagePreview')||node.matches?.('label:has([name="images"])'))media.append(node)}
  const contact=section('연락 및 관리',form.elements.author_name.closest('label'));
  contact.append(form.elements.author_name.closest('label'));
  const contactRow=form.querySelector('.community-contact-row');if(contactRow)contact.append(contactRow);
  contact.append(form.elements.password.closest('label'));
  const passwordNote=form.querySelector('.community-policy-note');if(passwordNote)contact.append(passwordNote);
  if(media)media.after(contact);
};
// A short, optional guide precedes new posts only. Editing keeps its existing flow.
const WRITE_GUIDES={
  job_hiring:{title:'구인 글쓰기 안내',description:'좋은 인재를 찾을 수 있도록 근무 조건과 모집 내용을 구체적으로 작성해 주세요.',items:['업소·회사명, 모집 직종, 근무지역을 정확하게 작성해 주세요.','급여, 근무시간, Full-time/Part-time 등 근무 조건을 구체적으로 작성하면 지원자가 판단하는 데 도움이 됩니다.','지원자가 연락할 수 있는 방법을 정확하게 입력해 주세요.','주민등록번호, 신분증, 은행정보 등 불필요한 개인정보를 요구하지 마세요.','허위 채용, 불법적인 구인 또는 게시판 성격에 맞지 않는 글은 관리자에 의해 비공개 또는 삭제될 수 있습니다.'],notice:'채용이 완료되면 게시글을 수정하거나 삭제해 주세요.',cta:'구인 글쓰기'},
  job_seeking:{title:'구직 글쓰기 안내',description:'원하는 일자리를 찾는 데 도움이 되도록 희망 조건과 경력을 간단하고 정확하게 작성해 주세요.',items:['희망 직종, 경력, 희망 근무지역과 근무형태를 작성해 주세요.','가능한 근무시간이나 Full-time/Part-time 여부를 적으면 고용주가 판단하는 데 도움이 됩니다.','주민등록번호, 신분증, 은행계좌 등 민감한 개인정보는 게시글에 작성하지 마세요.','전화번호나 이메일 등 연락처는 필요한 경우 지정된 연락방법 항목을 이용해 주세요.','허위 내용이나 게시판 성격에 맞지 않는 글은 관리자에 의해 비공개 또는 삭제될 수 있습니다.'],notice:'취업이 완료되면 게시글을 수정하거나 삭제해 주세요.',cta:'구직 글쓰기'},
  marketplace:{title:'사고팔기 글쓰기 안내',description:'안전하고 편리한 거래를 위해 상품 정보와 거래 조건을 정확하게 작성해 주세요.',items:['상품명, 판매가격, 상품 상태와 거래 가능한 지역을 정확하게 작성해 주세요.','실제 상품 사진을 등록하면 구매자가 상품 상태를 확인하는 데 도움이 됩니다.','필요한 경우 상품 상태를 보여주는 짧은 MP4 동영상도 추가할 수 있습니다.','거래 전 상품 상태, 거래 장소와 결제방법을 서로 충분히 확인해 주세요.','사기성 거래, 허위 상품, 불법 판매품 또는 타인의 권리를 침해하는 게시물은 비공개 또는 삭제될 수 있습니다.'],notice:'판매가 완료되면 게시글을 판매완료로 변경해 주세요.',cta:'사고팔기 글쓰기'},
  housing:{title:'부동산 글쓰기 안내',description:'매물을 정확하게 확인할 수 있도록 가격과 지역, 매물 정보를 구체적으로 작성해 주세요.',items:['매매 또는 렌트 여부, 가격, 지역 등 실제 매물 정보를 정확하게 작성해 주세요.','가격이 정해지지 않은 경우 가격 문의를 선택할 수 있습니다.','실제 매물 사진과 동영상을 등록하면 매물 상태를 확인하는 데 도움이 됩니다.','개인 출입정보, 비밀번호 등 공개할 필요가 없는 민감한 정보는 게시하지 마세요.','허위 매물, 부정확한 정보 또는 게시판 성격에 맞지 않는 글은 비공개 또는 삭제될 수 있습니다.'],notice:'부동산 게시글은 관리자 확인 후 공개됩니다.',cta:'부동산 글쓰기'},
  neighborhood:{title:'동네소식 글쓰기 안내',description:'지역 주민들과 함께 나누고 싶은 행사, 안내, 생활정보와 주변 소식을 공유해 주세요.',items:['지역 주민에게 도움이 되는 행사, 안내, 생활정보와 주변 소식을 작성해 주세요.','행사나 모임이라면 날짜, 시간, 장소를 가능한 정확하게 적어 주세요.','출처가 필요한 정보는 확인할 수 있는 내용을 함께 작성해 주세요.','확인되지 않은 소문이나 타인의 개인정보를 게시하지 마세요.','반복적인 광고·홍보 또는 게시판 성격에 맞지 않는 글은 관리자에 의해 제한될 수 있습니다.'],notice:'많은 이웃에게 도움이 될 수 있도록 지역과 내용을 구체적으로 작성해 주세요.',cta:'동네소식 글쓰기'},
  qna:{title:'질문·정보 글쓰기 안내',description:'궁금한 점을 질문하거나 다른 이웃에게 도움이 되는 정보를 공유해 주세요.',items:['질문인지 정보공유인지 구분하고 내용을 알기 쉬운 제목으로 작성해 주세요.','질문할 때 지역이나 상황을 함께 작성하면 보다 정확한 답변을 받는 데 도움이 됩니다.','정보공유 글은 다른 사용자가 이해할 수 있도록 내용을 구체적으로 작성해 주세요.','타인의 개인정보를 게시하거나 확인되지 않은 내용을 사실처럼 단정하지 마세요.','욕설, 비방, 사기성 정보 또는 게시판 성격에 맞지 않는 글은 비공개 또는 삭제될 수 있습니다.'],notice:'답을 찾은 질문은 해결됨으로 표시해 주세요.',cta:'질문·정보 글쓰기'}
};
const WRITE_GUIDE_ORDER=['job_hiring','job_seeking','marketplace','housing','neighborhood','qna'];
const writeFormWithoutGuide=openWrite;
function guideContent(category){const guide=WRITE_GUIDES[category];return `<span class="community-guide-badge">${esc(ui4Labels[category])}</span><h3>${esc(guide.title)}</h3><p>${esc(guide.description)}</p><ul>${guide.items.map(item=>`<li>${esc(item)}</li>`).join('')}</ul><div class="community-guide-notice">${esc(guide.notice)}</div>`}
function openWriteGuide(){
  ensureUI();removeTurnstile();
  const body=el('communityModalBody');
  body.innerHTML=`<section class="community-write-guide" aria-labelledby="communityWriteGuideTitle"><span class="community-guide-eyebrow">글쓰기</span><h2 id="communityWriteGuideTitle">어떤 글을 작성하시나요?</h2><div class="community-guide-categories" role="group" aria-label="글쓰기 카테고리">${WRITE_GUIDE_ORDER.map(category=>`<button type="button" data-guide-category="${category}" aria-pressed="false">${esc(ui4Labels[category])}</button>`).join('')}</div><section class="community-guide-advice" id="communityGuideAdvice" hidden aria-live="polite"></section><div class="community-guide-actions"><button type="button" data-community-close>취소</button><button type="button" data-guide-start disabled>글쓰기</button></div></section>`;
  showModal();
  let selected=null;
  body.querySelectorAll('[data-guide-category]').forEach(button=>button.addEventListener('click',()=>{
    selected=button.dataset.guideCategory;
    body.querySelectorAll('[data-guide-category]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
    const advice=el('communityGuideAdvice');advice.hidden=false;advice.innerHTML=guideContent(selected);
    const start=body.querySelector('[data-guide-start]');start.disabled=false;start.textContent=WRITE_GUIDES[selected].cta;
  }));
  body.querySelector('[data-guide-start]').addEventListener('click',()=>{
    if(!selected)return;
    openWrite(null,selected);
  });
}
// Reopen the guide without replacing the connected form or its file inputs.
openWrite=function(existing=null,selectedCategory=null){
  if(!existing&&!selectedCategory)return openWriteGuide();
  writeFormWithoutGuide(existing);
  const form=el('communityWriteForm');if(!form)return;
  if(selectedCategory){form.elements.category.value=selectedCategory;form.elements.category.dispatchEvent(new Event('change',{bubbles:true}))}
  const heading=form.querySelector('h2');
  if(!heading||form.querySelector('.community-write-help'))return;
  const help=document.createElement('button');help.type='button';help.className='community-write-help';help.textContent='ⓘ 작성 안내';help.setAttribute('aria-expanded','false');
  heading.after(help);
  help.addEventListener('click',()=>{
    const category=form.elements.category.value;if(!WRITE_GUIDES[category])return;
    const modalPanel=el('communityModal')?.querySelector('.community-modal-panel');
    const previousScroll=modalPanel?.scrollTop||0;
    const guide=document.createElement('section');guide.className='community-write-resume-guide';
    guide.innerHTML=`<span class="community-guide-eyebrow">글쓰기</span><section class="community-guide-advice">${guideContent(category)}</section><div class="community-guide-actions"><button type="button" data-guide-return>작성 화면으로 돌아가기</button></div>`;
    form.after(guide);form.hidden=true;help.setAttribute('aria-expanded','true');
    if(modalPanel)modalPanel.scrollTop=0;
    guide.querySelector('[data-guide-return]').addEventListener('click',()=>{
      guide.remove();form.hidden=false;help.setAttribute('aria-expanded','false');
      if(modalPanel)modalPanel.scrollTop=previousScroll;
      help.focus();
    });
  });
};
const ui4OpenPost=openPost;
openPost=async function(id){
  await ui4OpenPost(id);if(current?.id!==id)return;
  const article=el('communityModalBody')?.querySelector('.community-detail');if(!article)return;
  article.classList.add('community-ui4-detail');
  const categoryBadge=article.querySelector(':scope > em');if(categoryBadge)categoryBadge.textContent=ui4Labels[current.category]||current.category;
  const fields=article.querySelector('.community-detail-fields'),images=[...article.querySelectorAll(':scope > img')],body=article.querySelector(':scope > p'),owner=article.querySelector('.community-owner-actions'),contact=article.querySelector('.community-contact');
  if(fields&&images[0])images[0].before(fields);
  const media=article.querySelector('.community-video-detail');if(media&&body)body.before(media);
  if(contact&&owner)owner.before(contact);
  if(owner)article.append(owner);
};
root.DtmCommunity={LABELS,BATCH,ensureUI,openPage,setLegacyRows,renderHome,load,openPost,compress,closeModal,syncRobots,_state:()=>({all:[...all],total,visible,filter})};
document.addEventListener('DOMContentLoaded',()=>{ensureUI();setTimeout(()=>{const match=location.hash.match(/^#community\/post\/([^/?]+)/);if(match){root.DtmNavigatePage?.('community',{skipRoute:true});openPost(decodeURIComponent(match[1])).catch(showError)}else if(location.hash==='#community'){root.DtmNavigatePage?.('community',{skipRoute:true});load().catch(showError)}},0)});window.addEventListener('popstate',()=>{const match=location.hash.match(/^#community\/post\/([^/?]+)/);if(match){root.DtmNavigatePage?.('community',{skipRoute:true});openPost(decodeURIComponent(match[1])).catch(showError)}else if(location.hash==='#community'){closeModal();root.DtmNavigatePage?.('community',{skipRoute:true});load().catch(showError)}else closeModal()});
})(globalThis);
