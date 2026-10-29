(()=>{'use strict';
const spec={
 profile:[['website','웹사이트','url'],['youtube_url','유튜브·SNS 영상 링크','url'],['order_url','메뉴·서비스 안내 링크','url'],['tagline','메뉴·서비스 요약','text'],['image_url','대표 이미지 URL','url'],['gallery_urls','갤러리 URL(한 줄에 하나)','lines'],['description_images','소개 이미지 URL(한 줄에 하나)','lines'],...['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map((k,i)=>[k,['월','화','수','목','금','토','일'][i]+' 영업시간·휴무','text'])],
 coupon:[['title','쿠폰 제목','text'],['description','혜택·사용 조건·주의사항','textarea'],['image_url','쿠폰 이미지 URL','url'],['delivery_mode','발급 방식','delivery'],['issue_limit','총 발급·응모 수량(비우면 제한 없음)','limit'],['discount_label','혜택 표시','text'],['coupon_code','쿠폰 코드','text'],['start_at','시작일시','datetime-local'],['end_at','종료일시','datetime-local'],['raffle_end_at','응모 마감','datetime-local'],['winner_count','당첨 인원','number'],['one_per_email','이메일당 한 번','checkbox'],['marketing_opt_in_enabled','마케팅 동의 선택 제공','checkbox'],['is_today_coupon','오늘의 쿠폰','checkbox'],['is_active','활성','checkbox']],
 event:[['title','행사 제목','text'],['content','행사 상세 안내','textarea'],['venue_name','행사 장소','text'],['address','행사 주소','text'],['image_url','행사 이미지 URL','url'],['start_at','시작일시','datetime-local'],['end_at','종료일시','datetime-local'],['external_url','행사 안내 링크','url'],['is_active','활성','checkbox']],
 special:[['type','특선 유형','specialType'],['title','특선 제목','text'],['description','특선 설명','textarea'],['price_text','가격 안내','text'],['days_of_week','적용 요일(일=0…토=6, 쉼표 구분)','days'],['start_time','시작 시간','time'],['end_time','종료 시간','time'],['start_date','시작 날짜','date'],['end_date','종료 날짜','date'],['image_url','특선 이미지 URL','url'],['items','메뉴 목록 JSON','items'],['is_active','활성','checkbox']]
};
const names={profile:'이미지·링크·요일별 영업시간',coupon:'쿠폰',event:'이벤트',special:'점심특선·해피아워'};
const node=(tag,txt,parent)=>{const e=document.createElement(tag);if(txt)e.textContent=txt;parent.append(e);return e;};
async function readOwnerContentResponse(res,method){
 const stage=method==='POST'?'save':'refresh';
 const contentType=(res.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
 const requestId=res.headers.get('x-nf-request-id')||res.headers.get('x-request-id')||'';
 const diagnostic={stage,status:res.status,contentType,redirected:res.redirected===true,requestId:/^[A-Za-z0-9._:-]{1,160}$/.test(requestId)?requestId:null};
 const failure=code=>{const e=Error(res.status===401?'로그인이 만료되었거나 확인되지 않았습니다. 작성 내용을 유지한 채 로그인 상태를 확인해 주세요.':res.status===403?'접근이 차단되었습니다. QA 접근 보호 또는 업소 승인 상태를 확인해 주세요.':res.status===429?'요청이 많아 잠시 제한되었습니다. 저장 여부를 확인한 뒤 기다려 주세요.':'응답을 확인하지 못했습니다. 작성 내용은 유지됩니다. 중복 저장하지 말고 목록에서 저장 여부를 먼저 확인해 주세요.');e.code=code;e.diagnostic=diagnostic;throw e;};
 if(res.redirected)return failure('OWNER_RESPONSE_REDIRECT');
 if(!(contentType==='application/json'||/^application\/[a-z0-9.+-]+\+json$/.test(contentType)))return failure('OWNER_RESPONSE_NOT_JSON');
 let out;try{out=await res.json();}catch{return failure('OWNER_RESPONSE_INVALID_JSON');}
 if(!out||typeof out!=='object'||Array.isArray(out))return failure('OWNER_RESPONSE_INVALID_SHAPE');
 if(!res.ok){if([401,403,429].includes(res.status))return failure('OWNER_HTTP_'+res.status);const e=Error(res.status===400?'입력 내용·기간·이미지를 확인한 뒤 다시 저장해 주세요.':'저장 결과를 확인하지 못했습니다. 목록에서 저장 여부를 먼저 확인해 주세요.');e.code='OWNER_HTTP_'+res.status;e.diagnostic=diagnostic;throw e;}
 return out;
}

async function mount(parent,bid,db){
 const host=node('section','',parent);host.className='owner-content';const notice=node('p','',host);notice.setAttribute('role','status');
 const load=node('button','사진·메뉴 · 쿠폰 · 이벤트 · 점심특선·해피아워 관리',host);load.type='button';let data;
 async function api(command){const {data:{session},error}=await db.auth.getSession();if(error||!session)throw Error('로그인이 필요합니다.');const res=await fetch('/.netlify/functions/owner-content-uuid'+(command?'':'?business_id='+encodeURIComponent(bid)),{method:command?'POST':'GET',headers:{Authorization:'Bearer '+session.access_token,...(command?{'Content-Type':'application/json'}:{})},...(command?{body:JSON.stringify({...command,business_id:bid,key:crypto.randomUUID()})}:{})});const out=await readOwnerContentResponse(res,command?'POST':'GET');return out.result;}
 async function run(fn,button,success='저장 완료 — 입력한 내용이 반영되었습니다. 공개 여부와 기간을 확인해 주세요.'){button.disabled=true;try{await fn();notice.dataset.state='success';notice.textContent=success;if(success.startsWith('저장 완료'))window.dispatchEvent(new Event('owner-content-saved'));}catch(e){notice.dataset.state='error';notice.dataset.responseDiagnostic=e.diagnostic?JSON.stringify(e.diagnostic):'';notice.textContent='처리 실패 — '+e.message;}finally{const feedback=button.parentElement?.classList.contains('coupon-editor-actions')?button.parentElement.querySelector('.coupon-save-feedback'):null;if(feedback){feedback.textContent=notice.textContent;feedback.dataset.state=notice.dataset.state;}button.disabled=button.dataset.completed==='true';}}
 function form(kind,row={}){
  const serverPolicy=data.coupon_policy||{},subscribed=window.OwnerUiPolicy.subscriber(serverPolicy);const policy={...serverPolicy,images:subscribed,custom_image:subscribed,raffle:false};
  // Unreleased raffle authoring stays unavailable; historical rows remain untouched.
  if(kind==='coupon'&&row.delivery_mode==='raffle')return;  const details=node('details','',host);node('summary',`${kind==='profile'&&!policy.images?'웹사이트·요일별 영업시간':names[kind]} ${row.title||'등록·수정'}`,details);details.dataset.kind=kind;const f=node('form','',details);const controls={};
  for(const [k,label,type]of spec[kind]){
   if(kind==='coupon'&&['raffle_end_at','winner_count'].includes(k))continue;
   if(type==='items'){const group=node('fieldset','',f);node('legend','메뉴 목록',group);const rows=node('div','',group);const add=row=>{if(rows.children.length>=20)throw Error('메뉴는 최대 20개입니다.');const line=node('fieldset','',rows);for(const[key,title]of [['item_name','메뉴명'],['description','메뉴 설명'],['price_text','메뉴 가격']]){const l=node('label',title,line),input=node('input','',l);input.name=key;input.value=row[key]||'';input.maxLength=key==='price_text'?100:key==='item_name'?160:5000;if(key==='item_name')input.required=true;}const remove=node('button','메뉴 삭제',line);remove.type='button';remove.onclick=()=>line.remove();};for(const entry of row.items||[{item_name:''}])add(entry);const plus=node('button','메뉴 추가',group);plus.type='button';plus.onclick=()=>{try{add({});}catch(e){notice.textContent=e.message;}};controls[k]={get value(){return JSON.stringify([...rows.children].map(line=>Object.fromEntries([...line.querySelectorAll('input')].map(i=>[i.name,i.value.trim()]))));}};continue;}
   if(!policy.images&&kind==='profile'&&!['website','monday','tuesday','wednesday','thursday','friday','saturday','sunday'].includes(k))continue;
   const displayLabel=kind==='coupon'?({title:'상품·서비스명 / 쿠폰 제목',discount_label:'할인 혜택·가격',description:'사용 조건·상세 안내',issue_limit:'발급 수량 (비우면 제한 없음)',is_active:'활성화 — 고객에게 공개'}[k]||label):label;const l=node('label',displayLabel,f);let i;if(['delivery','specialType'].includes(type)){i=node('select','',l);const choices=type==='delivery'?[...(row.id&&row.owner_coupon_protocol!=='v2'?[['display','화면 표시']]:[]),['instant_email','이메일 발급'],...(policy.raffle?[['raffle','응모형 · 유료']]:[])]:[['lunch_special','점심특선'],['happy_hour','해피아워'],['discount','일반 할인']];for(const[v,t]of choices){const o=node('option',t,i);o.value=v;}}else{i=node(['textarea','lines'].includes(type)?'textarea':'input','',l);if(i.tagName==='INPUT')i.type=type==='days'?'text':type==='limit'?'number':type;}i.name=k;controls[k]=i;
   if(type==='checkbox')i.checked=row[k]??['one_per_email','marketing_opt_in_enabled'].includes(k);
   else if(type==='lines')i.value=(row[k]||[]).join('\n');
   else if(type==='items')i.value=JSON.stringify((row.items||[{item_name:'',description:'',price_text:''}]).map(x=>({item_name:x.item_name,description:x.description||'',price_text:x.price_text||''})),null,2);
   else if(type==='days')i.value=(row[k]||[]).join(',');
   else if(type==='datetime-local'&&row[k]){const d=new Date(row[k]);i.value=new Date(d-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
   else i.value=row[k]??(k==='winner_count'?1:type==='delivery'?'instant_email':type==='specialType'?'lunch_special':'');
   if(['title'].includes(k))i.required=true;if(i.type==='number'){i.min=1;i.max=type==='limit'?1000000:100;}if(i.tagName==='TEXTAREA')i.maxLength=5000;
  }
  const uploadImage=async image=>{if(!image)return;if(image.size>5242880||!['image/jpeg','image/png','image/webp'].includes(image.type))throw Error('PNG·JPEG·WebP 이미지와 5MB 제한을 확인해 주세요.');const{data:{session}}=await db.auth.getSession();if(!session)throw Error('로그인이 필요합니다.');if(!window.installValidatedImageUpload)throw Error('보안 이미지 업로더를 불러오지 못했습니다.');window.installValidatedImageUpload(db);const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[image.type];const profile=await db.from('profiles').select('role,area').eq('user_id',session.user.id).maybeSingle();const admin=['super_admin','regional_editor'].includes(profile.data?.role);const key=admin?`owner-v1/${data.business.region}/uploads/${crypto.randomUUID()}.${ext}`:`owner-v1/owner/${bid}/${session.user.id}/${crypto.randomUUID()}.${ext}`;const {data:uploaded,error}=await db.storage.from('public-images').upload(key,image,{upsert:false,contentType:image.type,...(kind==='coupon'?{purpose:'coupon',business_id:bid}:{})});if(error||!uploaded?.publicUrl)throw Error('이미지 검증·업로드에 실패했습니다. 기존 저장 내용은 유지됩니다.');return uploaded.publicUrl;};
  let uploadLabel;let design;const upload=async image=>{const url=await uploadImage(image);if(url&&controls.image_url)controls.image_url.value=url;};

  if(kind==='profile'&&policy.images)for(const key of ['gallery_urls','description_images']){
   const field=controls[key],group=node('fieldset','',f);node('legend',key==='gallery_urls'?'갤러리 사진 관리':'소개·메뉴 사진 관리',group);
   node('p','최대 12장. 추가·교체·순서 변경 후 아래 저장 버튼을 눌러 주세요. 연결을 제거해도 원본 파일은 보존됩니다.',group);
   const list=node('div','',group),pick=node('input','',group);pick.type='file';pick.multiple=true;pick.accept='image/png,image/jpeg,image/webp';pick.setAttribute('aria-label',key==='gallery_urls'?'갤러리 사진 여러 장 추가':'소개 사진 여러 장 추가');
   const values=()=>field.value.split('\n').map(x=>x.trim()).filter(Boolean);
   const set=urls=>{field.value=urls.join('\n');field.dispatchEvent(new Event('input',{bubbles:true}));render();};
   const render=()=>{list.replaceChildren();values().forEach((url,index)=>{const row=node('div','',list),img=node('img','',row);img.src=url;img.alt=`${index+1}번째 사진`;img.style.cssText='max-width:100%;width:160px;height:110px;object-fit:contain';
    for(const [title,delta]of [['위로',-1],['아래로',1]]){const button=node('button',title,row);button.type='button';button.disabled=index+delta<0||index+delta>=values().length;button.onclick=()=>{const urls=values();[urls[index],urls[index+delta]]=[urls[index+delta],urls[index]];set(urls);};}
    const remove=node('button','연결 제거',row);remove.type='button';remove.onclick=()=>set(values().filter((_,i)=>i!==index));
    const replacement=node('input','',row);replacement.type='file';replacement.accept=pick.accept;replacement.setAttribute('aria-label',`${index+1}번째 사진 교체`);replacement.onchange=()=>run(async()=>{const url=await uploadImage(replacement.files?.[0]);if(url){const urls=values();urls[index]=url;set(urls);}},submit,'교체 사진 검증 완료. 저장 버튼을 눌러 반영해 주세요.');
   });};
   pick.onchange=()=>run(async()=>{const files=[...pick.files];if(values().length+files.length>12)throw Error('사진은 최대 12장입니다.');const added=[];for(const image of files)added.push(await uploadImage(image));set([...values(),...added]);pick.value='';},submit,'사진 검증 완료. 저장 버튼을 눌러 반영해 주세요.');field.addEventListener('input',render);render();
  }
 if(kind==='coupon'){const advanced=node('details','',f);node('summary',policy.raffle?'발급·응모·수량 등 추가 설정':'기타 발급 설정',advanced);for(const k of ['image_url','coupon_code','raffle_end_at','winner_count','one_per_email','marketing_opt_in_enabled','is_today_coupon'])if(controls[k])advanced.append(controls[k].closest('label'));node('p','승인된 업주는 별도 쿠폰 승인 없이 공개할 수 있습니다. 공개를 선택하지 않으면 비공개로 저장됩니다.',f);}
 if(kind!=='profile'&&kind!=='coupon'&&!policy.images){controls.image_url.closest('label').hidden=true;controls.image_url.disabled=true;}
 if(kind==='coupon'&&!policy.custom_image){
  for(const k of ['image_url','delivery_mode','raffle_end_at','winner_count','marketing_opt_in_enabled','coupon_code','is_today_coupon']){if(controls[k]){controls[k].closest('label').hidden=true;controls[k].disabled=true;}}
  controls.delivery_mode.value='instant_email';controls.one_per_email.checked=true;controls.one_per_email.disabled=true;controls.marketing_opt_in_enabled.checked=false;
  for(const k of ['title','discount_label','start_at','end_at'])controls[k].required=true;
  node('p','기본 쿠폰 · 디자인 4종 · 이메일 발급 · 이메일당 중복 발급 방지',f);
 }
 if(kind==='coupon')design=window.OwnerCouponDesign?.mount(f,controls,row,upload,policy);
 if((kind==='coupon'&&policy.custom_image)||(kind!=='coupon'&&policy.images)){
 uploadLabel=node('label','이미지 업로드 (JPEG·PNG·WebP, 최대 5MB)',f);const file=node('input','',uploadLabel);file.type='file';file.accept='image/jpeg,image/png,image/webp';file.onchange=()=>run(async()=>{await upload(file.files?.[0]);design?.useUploaded();file.value='';},submit,'이미지를 업로드했습니다. 저장 버튼을 눌러 반영해 주세요.');
 }
  if(kind==='coupon'){
   f.classList.add('coupon-editor');const fields=node('div','',f);fields.className='coupon-editor-fields';
   for(const key of ['title','discount_label','start_at','end_at','issue_limit','is_active','description'])fields.append(controls[key].closest('label'));
   controls.title.placeholder='예: 점심 세트 / 헤어컷';controls.discount_label.placeholder='예: 20% 할인 · $25 → $20';
   const help=node('p','가격은 혜택 문구에 함께 입력합니다. 기존 쿠폰 저장 형식과 고객 화면을 유지합니다.',fields);help.className='coupon-field-help';controls.discount_label.closest('label').append(help);
   const preview=f.querySelector('.coupon-design-preview');const options=node('div','',fields);options.className='coupon-design-options';options.append(preview.querySelector('label'));
   if(uploadLabel){options.append(uploadLabel);design.bindUpload(uploadLabel);}
   for(const child of [...f.children])if(child!==fields&&child!==preview)fields.append(child);
   f.append(fields,preview);
  }
  const actions=node('div','',f);if(kind==='coupon')actions.className='coupon-editor-actions';const submit=node('button',`${names[kind]} 저장`,actions);submit.type='submit';if(kind==='coupon'){const feedback=node('p','',actions);feedback.className='coupon-save-feedback';feedback.setAttribute('role','status');}f.onsubmit=e=>{e.preventDefault();run(async()=>{await design?.prepare();if(kind==='coupon'&&controls.delivery_mode.value==='raffle'&&!controls.raffle_end_at.value)controls.raffle_end_at.value=controls.end_at.value;const changes={};let items;for(const[k,,type]of spec[kind]){const i=controls[k];if(!i)continue;if(type==='items'){items=JSON.parse(i.value);continue;}if(['datetime-local','date','time'].includes(type)&&!i.value)continue;if(kind==='coupon'&&!policy.custom_image&&['image_url','raffle_end_at','winner_count','marketing_opt_in_enabled','coupon_code','is_today_coupon'].includes(k))continue;changes[k]=type==='checkbox'?i.checked:type==='limit'?(i.value?Number(i.value):null):type==='number'?Number(i.value):type==='days'?i.value.split(',').map(x=>x.trim()).filter(Boolean).map(Number):type==='lines'?i.value.split('\n').map(x=>x.trim()).filter(Boolean):type==='datetime-local'?new Date(i.value).toISOString():i.value.trim();}if(!policy.images&&kind!=='coupon')delete changes.image_url;if(kind==='coupon'){if(design?.design)changes.template_design=design.design;if(!policy.custom_image){changes.delivery_mode='instant_email';changes.one_per_email=true;changes.marketing_opt_in_enabled=false;}}await api({action:'save',kind,...(row.id&&kind!=='profile'?{record_id:String(row.id)}:{}),changes,...(items?{items}:{})});try{await refresh();}catch(e){e.message='저장은 완료됐지만 목록을 갱신하지 못했습니다. 중복 저장하지 말고 로그인·QA 접근 상태를 확인한 뒤 목록을 새로고침해 주세요.';throw e;}},submit,kind==='coupon'?`저장 완료 — ${controls.is_active.checked?'고객에게 공개됩니다. 공개 기간을 확인해 주세요.':'비공개로 저장했습니다.'}`:undefined);};
  if(kind==='coupon'&&row.id&&row.owner_coupon_protocol==='v2'){
   const usage=node('details','',details);node('summary','발급·사용 관리',usage);const status=node('p','매장에서 이메일 쿠폰을 확인한 뒤 사용 처리해 주세요.',usage);status.setAttribute('role','status');
   const entries=node('div','',usage),read=node('button','발급 내역 조회',usage);read.type='button';
   async function usageApi(path,command){const {data:{session}}=await db.auth.getSession();if(!session)throw Error('로그인이 필요합니다.');const response=await fetch('/.netlify/functions/'+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify({protocol:'v2',coupon_id:row.id,...command})});const out=await readOwnerContentResponse(response,'POST');if(out.ok!==true)throw Error('처리 결과를 확인해 주세요.');return out;}
   read.onclick=()=>run(async()=>{const out=await usageApi('coupon-campaign-admin',{action:'list'});entries.replaceChildren();if(!out.entries?.length)node('p','현재 발급 내역이 없습니다.',entries);for(const entry of out.entries||[]){const line=node('div','',entries);node('p',`${entry.coupon_code||'코드 확인 필요'} · ${entry.status==='redeemed'?'사용 완료':'발급됨'}`,line);if(entry.status!=='coupon_issued')continue;const use=node('button','사용 확인',line);use.type='button';const key=crypto.randomUUID();use.onclick=()=>{if(!confirm('매장에서 쿠폰을 확인하셨나요? 사용 처리 후 취소할 수 없습니다.'))return;run(async()=>{const done=await usageApi('coupon-campaign-admin',{action:'redeem',entry_id:entry.id,request_key:key});use.dataset.completed='true';use.disabled=true;use.textContent='사용 완료';status.textContent='사용 기록을 저장했습니다. 알림 전송은 별도 처리됩니다.';try{await usageApi('coupon-used-notify',{use_id:done.use_id});}catch{status.textContent='사용 기록은 저장했습니다. 알림은 미처리 상태이며 쿠폰을 다시 사용 처리하지 마세요.';}},use,'사용 기록을 저장했습니다.');};}},read,'발급 내역을 불러왔습니다.');
  }
  if(row.id&&kind!=='profile'){const end=node('button','비활성화·종료',details);end.type='button';end.onclick=()=>run(async()=>{await api({action:'end',kind,record_id:String(row.id)});await refresh();},end);}
 }
 async function refresh(){data=await api();for(const e of [...host.children])if(e!==notice&&e!==load)e.remove();form('profile',data.business);for(const kind of ['coupon','event','special']){form(kind);for(const row of data[{coupon:'coupons',event:'events',special:'specials'}[kind]]||[])form(kind,row);}window.dispatchEvent(new Event('owner-content-rendered'));}
 load.onclick=()=>run(refresh,load,'관리 메뉴를 열었습니다.');
}
window.OwnerContentPanel={mount};
})();



