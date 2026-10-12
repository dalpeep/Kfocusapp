(()=>{'use strict';
const $=id=>document.getElementById(id),cfg=window.APP_CONFIG||{},status=$('status');
if(!cfg.SUPABASE_URL||!cfg.SUPABASE_ANON_KEY){status.textContent='연결 설정을 확인해 주세요.';return;}
const db=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
let state=null,offset=0,auditOffset=0;
const kinds={new:'신규 업소',claim:'소유권',core:'핵심 정보'},statuses={pending:'대기',approved:'승인',rejected:'거절'},actions={submit:'신청',approve:'승인',reject:'거절',revoke:'권한 회수',update:'일반 정보 수정'};
const labels={name_ko:'업소명',address:'주소',phone:'전화',category_ko:'업종',description:'소개',hours:'영업시간',user_id:'대상 회원',active:'활성 권한'};
const fields=(value,parent)=>{for(const [k,v] of Object.entries(value||{}))text('p',`${labels[k]||k}: ${v??'없음'}`,parent);};
const date=value=>value?new Date(value).toLocaleString('ko-KR'):'없음';
const text=(tag,value,parent)=>{const e=document.createElement(tag);e.textContent=value;parent.append(e);return e;};
const button=(label,parent,fn)=>{const b=text('button',label,parent);b.type='button';b.onclick=()=>run(fn,b);return b;};
async function run(fn,b){if(b)b.disabled=true;try{await fn();}catch(e){status.textContent=e.message||'처리에 실패했습니다.';}finally{if(b)b.disabled=false;}}
async function api(command){const {data:{session}}=await db.auth.getSession();if(!session)throw Error('로그인이 필요합니다.');
 const query=new URLSearchParams({status:$('requestStatus').value,kind:$('requestKind').value,offset:String(offset),audit_offset:String(auditOffset)});
 const res=await fetch('/.netlify/functions/owner-portal'+(command?'':`?${query}`),{method:command?'POST':'GET',headers:{Authorization:`Bearer ${session.access_token}`,...(command?{'Content-Type':'application/json'}:{})},...(command?{body:JSON.stringify(command)}:{})});
 const json=await res.json();if(!res.ok)throw Error(json.error||'요청에 실패했습니다.');return json.result;}
async function command(value){await api({...value,key:crypto.randomUUID()});offset=0;auditOffset=0;status.textContent='처리했습니다.';await refresh();}
const values=form=>Object.fromEntries(new FormData(form));
function reason(){const v=prompt('처리 사유를 입력해 주세요.');if(!v?.trim())throw Error('처리 사유가 필요합니다.');return v.trim();}
async function refresh(){state=await api();$('auth').hidden=true;$('portal').hidden=false;$('admin').hidden=!state.is_admin;
 const c=state.counts||{};$('counts').textContent=`대기 ${c.pending||0} · 승인 ${c.approved||0} · 거절 ${c.rejected||0}`;
 $('pendingCounts').textContent=`승인 대기 ${c.pending||0}건 · 신규 ${c.new||0} · 소유권 ${c.claim||0} · 핵심 정보 ${c.core||0}`;
 for(const [prefix,start,total] of [['request',offset,state.request_total||0],['audit',auditOffset,state.audit_total||0]]){
  $(prefix+'Page').textContent=total?`${start+1}–${Math.min(start+20,total)} / ${total}건`:'0건';$(prefix+'Prev').disabled=start===0;$(prefix+'Next').disabled=start+20>=total;
 }
 for(const id of ['businesses','requests','queue','memberships','audit'])$(id).replaceChildren();
 for(const b of state.businesses){const a=text('article','',$('businesses'));text('h3',b.name_ko,a);text('p',`${b.address||''} · ${b.phone||''}`,a);
 const f=document.createElement('form');a.append(f);for(const [key,label] of [['description','소개'],['hours','영업시간']]){const l=text('label',label,f),i=document.createElement('textarea');i.name=key;i.value=b[key]||'';l.append(i);}button('일반 정보 저장',f,()=>command({action:'update',business_id:b.id,changes:values(f)}));
 button('핵심 정보 변경 신청',a,async()=>{const changes={},baseline={};for(const k of ['name_ko','address','phone','category_ko']){const v=prompt(`${({name_ko:'업소명',address:'주소',phone:'전화',category_ko:'업종'})[k]} 변경값`,b[k]||'');if(v===null)return;if(v!==b[k]){changes[k]=v;baseline[k]=b[k];}}if(!Object.keys(changes).length)throw Error('변경한 정보가 없습니다.');await command({action:'submit',kind:'core',business_id:b.id,changes,baseline});});}
 for(const r of state.requests){const a=text('article',`${kinds[r.kind]} · ${statuses[r.status]}`,$('requests'));text('p',`신청 ${r.id} · 업소 ${r.business_id||'승인 시 생성'} · ${r.region}`,a);text('p',`신청일 ${date(r.created_at)} · 처리일 ${date(r.reviewed_at)}`,a);fields(r.changes,a);if(r.reason)text('p',`처리 사유: ${r.reason}`,a);
 if(state.is_admin&&r.status==='pending'){const q=text('article',`${kinds[r.kind]} · ${r.region}`,$('queue'));text('p',`신청 ${r.id} · 회원 ${r.user_id} · 업소 ${r.business_id||'신규'}`,q);if(Object.keys(r.baseline||{}).length){text('h3','변경 전',q);fields(r.baseline,q);}text('h3','신청 내용',q);fields(r.changes,q);button('승인',q,()=>command({action:'approve',request_id:r.id,reason:reason()}));button('거절',q,()=>command({action:'reject',request_id:r.id,reason:reason()}));}}
 for(const m of state.memberships){const a=text('article',`${m.business_id} · ${m.user_id} · ${m.active?'활성':'회수'}`,$('memberships'));if(m.active)button('권한 회수',a,()=>command({action:'revoke',business_id:m.business_id,user_id:m.user_id,reason:reason()}));}
 for(const a of state.audit){const card=text('article',`${actions[a.action]||a.action} · ${date(a.created_at)}`,$('audit'));text('p',`처리자 ${a.actor} · 업소 ${a.business_id||'미생성'} · 신청 ${a.request_id||'없음'}`,card);if(a.before_value){text('h3','변경 전',card);fields(a.before_value,card);}if(a.after_value){text('h3','처리 내용',card);fields(a.after_value,card);}if(a.reason)text('p',`사유: ${a.reason}`,card);}
}
$('auth').onsubmit=e=>{e.preventDefault();run(async()=>{const f=values(e.target);const signup=e.submitter?.name==='signup';if(signup&&f.password.length<12)throw Error('회원가입 비밀번호는 12자 이상 입력해 주세요.');const {error}=signup?await db.auth.signUp({email:f.email,password:f.password}):await db.auth.signInWithPassword(f);if(error)throw Error('가입 또는 로그인 정보를 확인해 주세요.');e.target.reset();if(signup)status.textContent='인증 이메일을 확인한 뒤 로그인해 주세요.';else await refresh();},e.submitter);};
$('logout').onclick=()=>run(async()=>{const {error}=await db.auth.signOut();if(error)throw error;state=null;$('portal').hidden=true;$('auth').hidden=false;for(const id of ['businesses','requests','queue','memberships','audit','searchResults'])$(id).replaceChildren();});
$('refresh').onclick=()=>run(refresh);
for(const id of ['requestStatus','requestKind'])$(id).onchange=()=>{offset=0;run(refresh);};
for(const [id,step,isAudit] of [['requestPrev',-20,false],['requestNext',20,false],['auditPrev',-20,true],['auditNext',20,true]])$(id).onclick=()=>run(async()=>{if(isAudit)auditOffset=Math.max(0,auditOffset+step);else offset=Math.max(0,offset+step);await refresh();});
$('newBusiness').onsubmit=e=>{e.preventDefault();run(async()=>{const changes=values(e.target);await command({action:'submit',kind:'new',region:'texas',changes});e.target.reset();},e.submitter);};
$('search').onsubmit=e=>{e.preventDefault();run(async()=>{const q=values(e.target).query.trim();if(!q)throw Error('검색어를 입력해 주세요.');const {data,error}=await db.from('businesses').select('id,name_ko,address').ilike('name_ko',`%${q.replace(/[%_]/g,'')}%`).limit(20);if(error)throw Error('업소 검색에 실패했습니다.');$('searchResults').replaceChildren();for(const b of data){const a=text('article',`${b.name_ko} · ${b.address||''}`,$('searchResults'));button('소유권 신청',a,()=>command({action:'submit',kind:'claim',business_id:String(b.id)}));}},e.submitter);};
db.auth.getSession().then(({data})=>{if(data.session)run(refresh);});
})();
