(()=>{'use strict';
const $=id=>document.getElementById(id),cfg=window.APP_CONFIG||{},status=$('status');
if(!cfg.SUPABASE_URL||!cfg.SUPABASE_ANON_KEY){status.textContent='연결 설정을 확인해 주세요.';return;}
const db=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY,cfg.OWNER_UUID_ENV==='qa'?{auth:{storage:window.sessionStorage,persistSession:true}}:{});
window.installValidatedImageUpload?.(db);
document.querySelectorAll('.owner-nav a').forEach(a=>a.addEventListener('click',()=>{const target=document.querySelector(a.getAttribute('href'));const d=target?.closest('details');if(d)d.open=true;}));
let state=null,offset=0,auditOffset=0,actorId=null,claimEntryOpened=false;
const kinds={new:'신규 업소',claim:'소유권',core:'핵심 정보'},statuses={pending:'대기',approved:'승인',rejected:'거절',cancelled:'취소'},actions={submit:'신청',approve:'승인',reject:'거절',revoke:'권한 회수',update:'일반 정보 수정',cancel:'신청 취소'};
const labels={name_ko:'업소명(한글)',name_en:'업소명(영문)',address:'주소',phone:'전화',category_ko:'업종',description:'소개',hours:'영업시간',user_id:'대상 회원',active:'활성 권한'};
const fields=(value,parent)=>{for(const [k,v] of Object.entries(value||{}))text('p',`${labels[k]||k}: ${v??'없음'}`,parent);};
const date=value=>value?new Date(value).toLocaleString('ko-KR'):'없음';
const text=(tag,value,parent)=>{const e=document.createElement(tag);e.textContent=value;parent.append(e);return e;};
const button=(label,parent,fn)=>{const b=text('button',label,parent);b.type='button';b.onclick=()=>run(fn,b);return b;};
async function run(fn,b){if(b)b.disabled=true;try{await fn();}catch(e){status.textContent=e.message||'처리에 실패했습니다.';}finally{if(b)b.disabled=false;}}
function confirmCancellation(){return new Promise(resolve=>{const dialog=document.createElement('dialog'),title=document.createElement('h2'),message=document.createElement('p');title.id='owner-cancel-title';title.textContent='신청 취소 확인';dialog.setAttribute('aria-labelledby',title.id);message.textContent='이 신청을 취소하시겠습니까? 취소 이력은 보존됩니다.';dialog.append(title,message);let finished=false;const finish=value=>{if(finished)return;finished=true;dialog.close();dialog.remove();resolve(value);};const back=document.createElement('button');back.type='button';back.textContent='돌아가기';back.onclick=()=>finish(false);const submit=document.createElement('button');submit.type='button';submit.textContent='신청 취소 확정';submit.onclick=()=>finish(true);dialog.append(back,submit);dialog.addEventListener('cancel',e=>{e.preventDefault();finish(false);});document.body.append(dialog);dialog.showModal();back.focus();});}
async function api(command){const {data:{session}}=await db.auth.getSession();if(!session)throw Error('로그인이 필요합니다.');
 actorId=session.user?.id||null;
 const query=new URLSearchParams({status:$('requestStatus').value,kind:$('requestKind').value,offset:String(offset),audit_offset:String(auditOffset)});
 const res=await fetch('/.netlify/functions/owner-portal-uuid'+(command?'':`?${query}`),{method:command?'POST':'GET',headers:{Authorization:`Bearer ${session.access_token}`,...(command?{'Content-Type':'application/json'}:{})},...(command?{body:JSON.stringify(command)}:{})});
 const json=await res.json();if(!res.ok)throw Error(`HTTP ${res.status}${json.code?' ['+json.code+']':''}: ${json.error||'요청에 실패했습니다.'}`);return json.result;}
async function command(value){await api({...value,key:crypto.randomUUID()});offset=0;auditOffset=0;status.textContent=value.action==='update'?'저장 완료 — 소개와 영업시간이 바로 반영되었습니다.':value.action==='submit'?'신청 완료 — 관리자 검토 중입니다. 승인 결과는 신청 현황에서 확인하세요.':value.action==='cancel'?'신청을 취소했습니다. 기존 업소 정보는 변경되지 않았습니다.':'처리가 완료되었습니다.';await refresh();}
const values=form=>Object.fromEntries(new FormData(form));
function reasonInput(parent){const label=text('label','처리 사유 (승인: 선택 / 거절·권한 회수: 필수)',parent),input=document.createElement('textarea');input.maxLength=1000;label.append(input);return input;}
function reason(input,required=true){const v=input.value.trim();if(required&&!v){input.focus();throw Error('처리 사유가 필요합니다.');}return v;}
async function openClaimEntry(){
 const id=new URLSearchParams(location.search).get('claim');
 if(claimEntryOpened||!id)return;claimEntryOpened=true;
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)){status.textContent='업소 링크를 확인해 주세요.';return;}
 const {data,error}=await db.from('businesses').select('id,name_ko,name_en,address').eq('id',id).maybeSingle();
 if(error||!data){status.textContent='업소를 찾을 수 없습니다. 업소명으로 검색해 주세요.';return;}
 $('search').closest('details').open=true;
 $('search').elements.query.value=data.name_ko||data.name_en||'';
 $('searchResults').replaceChildren();
 const a=text('article',String(data.name_ko||data.name_en||'업소')+' · '+String(data.address||''),$('searchResults'));
 button('소유권 신청',a,()=>command({action:'submit',kind:'claim',business_id:String(data.id)}));
 status.textContent='선택한 업소를 확인한 뒤 소유권 신청을 눌러 주세요. 관리자 승인 후 관리할 수 있습니다.';
}
async function refresh(){state=await api();$('auth').hidden=true;$('portal').hidden=false;$('admin').hidden=!state.is_admin;
 let accountPanel=$('ownerAccountPanel');if(!accountPanel){accountPanel=document.createElement('section');accountPanel.id='ownerAccountPanel';$('admin').append(accountPanel);}accountPanel.replaceChildren();if(state.is_admin&&window.OwnerAccountPanel)window.OwnerAccountPanel.mount(accountPanel,db,state);
 const c=state.counts||{};$('counts').textContent=`대기 ${c.pending||0} · 승인 ${c.approved||0} · 거절 ${c.rejected||0}`;
 $('pendingCounts').textContent=`승인 대기 ${c.pending||0}건 · 신규 ${c.new||0} · 소유권 ${c.claim||0} · 핵심 정보 ${c.core||0}`;
 for(const [prefix,start,total] of [['request',offset,state.request_total||0],['audit',auditOffset,state.audit_total||0]]){
  $(prefix+'Page').textContent=total?`${start+1}–${Math.min(start+20,total)} / ${total}건`:'0건';$(prefix+'Prev').disabled=start===0;$(prefix+'Next').disabled=start+20>=total;
 }
 for(const id of ['businesses','requests','queue','memberships','audit'])$(id).replaceChildren();
 for(const b of [...state.businesses].sort((a,b)=>String(a.id).localeCompare(String(b.id)))){const a=text('article','',$('businesses'));a.dataset.businessId=b.id;a.dataset.ownerUi=window.OwnerUiPolicy.subscriber(b.feature_policy)?'subscriber':'basic';text('h3',b.name_ko||b.name_en||'이름 없음',a);if(b.name_ko&&b.name_en)text('p',b.name_en,a);text('p',`${b.address||''} · ${b.phone||''}`,a);
 const badge=text('p',window.OwnerUiPolicy.label(b.feature_policy),a);badge.className='owner-tier-badge';text('p',window.OwnerUiPolicy.subscriber(b.feature_policy)?'업소 정보와 사진·쿠폰·홍보 콘텐츠를 관리하세요.':'기본 정보·기본 쿠폰·텍스트 이벤트와 할인을 간편하게 관리하세요.',a);window.OwnerImages?.mount(a,b,db);if(window.OwnerContentPanel)window.OwnerContentPanel.mount(a,b.id,db);const f=document.createElement('form');a.append(f);text('h3','바로 수정하는 정보',f);text('p','소개·영업시간은 저장하면 바로 반영됩니다.',f);for(const [key,label] of [['description','소개'],['hours','영업시간']]){const l=text('label',label,f),restricted=key==='description'&&b.feature_policy?.free_description!==false,i=document.createElement(restricted?'select':'textarea');i.name=key;if(restricted){for(const v of [...new Set([b[key]||'','',...(b.feature_policy?.description_options||[])])]){const o=document.createElement('option');o.value=v;o.textContent=v||(v===b[key]?'소개 미등록':'소개 비우기');i.append(o);}text('p','관리자가 제공한 소개 문구를 선택하세요. 기존 소개는 그대로 유지할 수 있습니다.',f);}i.value=b[key]||'';l.append(i);}button('일반 정보 저장',f,()=>command({action:'update',business_id:b.id,changes:values(f)}));
 const core=document.createElement('form');core.className='core-request';a.append(core);text('h3','승인이 필요한 정보',core);text('p','업소명·주소·전화·업종은 관리자 승인 후 반영됩니다. 검토 중에는 기존 정보가 유지됩니다.',core);
 for(const k of ['name_ko','name_en','address','phone','category_ko']){const l=text('label',labels[k],core),i=document.createElement('input');i.name=k;i.value=b[k]||'';i.maxLength=500;i.required=!['name_ko','name_en'].includes(k);l.append(i);}
 const rl=text('label','변경 사유(선택)',core),ri=document.createElement('textarea');ri.name='reason';ri.maxLength=1000;rl.append(ri);
 const submit=text('button','핵심 정보 변경 신청',core);submit.type='submit';core.onsubmit=e=>{e.preventDefault();run(async()=>{const {reason:why,...v}=values(core),changes={},baseline={};if(!v.name_ko.trim()&&!v.name_en.trim())throw Error('한글명 또는 영문명을 입력해 주세요.');for(const [k,value] of Object.entries(v))if(value.trim()!==(b[k]||'')){changes[k]=value.trim();baseline[k]=b[k]??null;}if(!Object.keys(changes).length)throw Error('변경한 정보가 없습니다.');await command({action:'submit',kind:'core',business_id:b.id,changes,baseline,reason:why.trim()});},submit);};}
 for(const r of state.requests){const a=text('article',`${kinds[r.kind]} · ${r.status==='pending'?'승인 대기':statuses[r.status]}`,$('requests'));text('p',`신청 ${r.id} · 업소 ${r.business_id||'승인 시 생성'} · ${r.region}`,a);text('p',`신청일 ${date(r.created_at)} · 처리일 ${date(r.reviewed_at)}`,a);fields(r.changes,a);if(r.reason)text('p',`${r.status==='rejected'?'거절 사유 — 내용을 확인하고 다시 신청해 주세요':'처리 사유'}: ${r.reason}`,a);if(r.status==='pending'&&actorId&&r.user_id===actorId)button('신청 취소',a,async()=>{if(await confirmCancellation())return command({action:'cancel',request_id:r.id});});
 if(state.is_admin&&r.status==='pending'){const q=text('article',`${kinds[r.kind]} · ${r.region}`,$('queue'));text('p',`신청 ${r.id} · 회원 ${r.user_id} · 업소 ${r.business_id||'신규'}`,q);if(r.submission_reason)text('p',`신청 사유: ${r.submission_reason}`,q);for(const k of ['name_ko','name_en']){const before=Object.hasOwn(r.baseline||{},k)?r.baseline[k]:r.current_names?.[k];const after=Object.hasOwn(r.changes||{},k)?r.changes[k]:before;text('p',`${labels[k]}: ${before||'없음'} → ${after||'없음'}`,q);}if(Object.keys(r.baseline||{}).length){text('h3','변경 전',q);fields(r.baseline,q);}text('h3','신청 내용',q);fields(r.changes,q);const own=!!actorId&&r.user_id===actorId,conflict=r.kind==='claim'&&(state.memberships||[]).some(m=>String(m.business_id)===String(r.business_id)&&m.active);text('p','신청자 취소 가능: 신청자 본인이 신청 현황에서 취소할 수 있습니다.',q);if(own)text('p','다른 관리자가 처리해야 합니다.',q);if(conflict)text('p','이미 활성 소유자가 있는 업소입니다. 중복 소유권 승인은 처리할 수 없습니다.',q);const reviewReason=reasonInput(q);let approvalArea=null;if(r.kind==='new'){const l=text('label','운영 업소 지역(area, 필수)',q);approvalArea=document.createElement('input');approvalArea.maxLength=100;l.append(approvalArea);}const approve=button('승인',q,()=>command({action:'approve',request_id:r.id,reason:reason(reviewReason,false),...(approvalArea?{area:approvalArea.value.trim()}:{})})),reject=button('거절',q,()=>command({action:'reject',request_id:r.id,reason:reason(reviewReason)}));approve.disabled=own||conflict;reject.disabled=own;}}
 for(const m of state.memberships){const a=text('article',`${m.business_id} · ${m.user_id} · ${m.active?'활성':'회수'}`,$('memberships'));if(m.active){const revokeReason=reasonInput(a);button('권한 회수',a,()=>command({action:'revoke',business_id:m.business_id,user_id:m.user_id,reason:reason(revokeReason)}));}}
 for(const a of state.audit){const card=text('article',`${actions[a.action]||a.action} · ${date(a.created_at)}`,$('audit'));text('p',`처리자 ${a.actor} · 업소 ${a.business_id||'미생성'} · 신청 ${a.request_id||'없음'}`,card);if(a.before_value){text('h3','변경 전',card);fields(a.before_value,card);}if(a.after_value){text('h3','처리 내용',card);fields(a.after_value,card);}if(a.reason)text('p',`사유: ${a.reason}`,card);}
 await openClaimEntry();
}
// Recheck capabilities without discarding drafts when the policy is unchanged.
let policyCheckBusy=false;
const policyKey=s=>JSON.stringify((s?.businesses||[]).map(b=>[b.id,b.feature_policy]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));
async function recheckPolicy(){if(!state||policyCheckBusy||document.hidden)return;policyCheckBusy=true;try{const next=await api();if(policyKey(next)!==policyKey(state)){await refresh();status.textContent='관리자가 변경한 이용 권한을 확인하여 화면을 갱신했습니다. 저장 전 입력 내용을 다시 확인해 주세요.';}}catch{ $('businesses').replaceChildren();state=null;status.textContent='이용 권한을 확인하지 못했습니다. 새로고침 후 다시 이용해 주세요.';}finally{policyCheckBusy=false;}}
window.addEventListener('focus',recheckPolicy);document.addEventListener('visibilitychange',()=>{if(!document.hidden)recheckPolicy();});setInterval(recheckPolicy,30000);
$('auth').onsubmit=e=>{e.preventDefault();run(async()=>{const f=values(e.target);const signup=e.submitter?.name==='signup';if(signup&&f.password.length<12)throw Error('회원가입 비밀번호는 12자 이상 입력해 주세요.');const {error}=signup?await db.auth.signUp({email:f.email,password:f.password,options:{emailRedirectTo:location.origin+'/owner-uuid/'}}):await db.auth.signInWithPassword(f);if(error)throw Error('가입 또는 로그인 정보를 확인해 주세요.');e.target.reset();if(signup)status.textContent='인증 이메일을 확인한 뒤 로그인해 주세요.';else await refresh();},e.submitter);};
$('logout').onclick=()=>run(async()=>{const {error}=await db.auth.signOut();if(error)throw error;state=null;$('portal').hidden=true;$('auth').hidden=false;for(const id of ['businesses','requests','queue','memberships','audit','searchResults'])$(id).replaceChildren();});
$('refresh').onclick=()=>run(refresh);
for(const id of ['requestStatus','requestKind'])$(id).onchange=()=>{offset=0;run(refresh);};
for(const [id,step,isAudit] of [['requestPrev',-20,false],['requestNext',20,false],['auditPrev',-20,true],['auditNext',20,true]])$(id).onclick=()=>run(async()=>{if(isAudit)auditOffset=Math.max(0,auditOffset+step);else offset=Math.max(0,offset+step);await refresh();});
$('newBusiness').onsubmit=e=>{e.preventDefault();run(async()=>{const changes=values(e.target);if(!changes.name_ko.trim()&&!changes.name_en.trim())throw Error('한글명 또는 영문명을 입력해 주세요.');await command({action:'submit',kind:'new',region:'texas',changes});e.target.reset();},e.submitter);};
$('search').onsubmit=e=>{e.preventDefault();run(async()=>{const q=values(e.target).query.trim();if(!q)throw Error('검색어를 입력해 주세요.');const query=db.from('businesses').select('id,name_ko,name_en,address'),safe=q.replace(/[\\%_,()."']/g,'');if(!safe)throw Error('검색어를 확인해 주세요.');const {data,error}=await query.or(`name_ko.ilike.%${safe}%,name_en.ilike.%${safe}%`).limit(20);if(error)throw Error('업소 검색에 실패했습니다.');$('searchResults').replaceChildren();for(const b of data){const a=text('article',`${b.name_ko||b.name_en||'이름 없음'} · ${b.name_ko&&b.name_en?b.name_en+' · ':''}${b.address||''}`,$('searchResults'));button('소유권 신청',a,()=>command({action:'submit',kind:'claim',business_id:String(b.id)}));}},e.submitter);};
db.auth.getSession().then(({data})=>{if(data.session)run(refresh);});
})();







