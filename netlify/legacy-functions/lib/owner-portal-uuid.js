
const {requireOwnerUuidEnvironment}=require('./owner-uuid-environment');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CORE=['name_ko','name_en','address','phone','category_ko'];
const GENERAL=['description','hours'];
function fail(status,message){throw Object.assign(new Error(message),{status});}
function fields(value,allowed,required=[],allowEmpty=false){
  if(!value||typeof value!=='object'||Array.isArray(value))fail(400,'입력 형식을 확인해 주세요.');
  if(!Object.keys(value).length||Object.keys(value).some(k=>!allowed.includes(k)))fail(400,'허용되지 않은 필드입니다.');
  for(const [key,v] of Object.entries(value))if(typeof v!=='string'||v.length>(key==='description'?5000:500)||(!allowEmpty&&!v.trim()))fail(400,'입력 길이와 내용을 확인해 주세요.');
  if(required.some(k=>!value[k]?.trim()))fail(400,'필수 정보를 입력해 주세요.');
  return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,v.trim()]));
}
function validate(body){
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['action','key','business_id','request_id','user_id','kind','changes','reason','region','baseline','area','description_choice'].includes(k)))fail(400,'허용되지 않은 요청입니다.');
  if(body.description_choice!==undefined&&(body.action!=='submit'||body.kind!=='new'||typeof body.description_choice!=='string'||!/^[a-z0-9-]{2,100}$/.test(body.description_choice)))fail(400,'업종별 소개 문구를 선택해 주세요.');
  if(!UUID.test(body.key||''))fail(400,'요청 식별자가 필요합니다.');
  if(!['submit','approve','reject','revoke','update','cancel'].includes(body.action))fail(400,'지원하지 않는 작업입니다.');
  if(body.action==='cancel'&&Object.keys(body).some(k=>!['action','key','request_id'].includes(k)))fail(400,'취소 요청에는 신청 식별자만 지정해 주세요.');
  if(body.business_id!==undefined&&!UUID.test(String(body.business_id)))fail(400,'업소 식별자를 확인해 주세요.');
  for(const k of ['request_id','user_id'])if(body[k]!==undefined&&!UUID.test(body[k]))fail(400,'식별자를 확인해 주세요.');
  if(['approve','reject','cancel'].includes(body.action)&&!body.request_id)fail(400,'신청 식별자가 필요합니다.');
  if(['update','revoke'].includes(body.action)&&!body.business_id)fail(400,'업소 식별자가 필요합니다.');
  if(body.action==='revoke'&&!body.user_id)fail(400,'대상 회원을 확인해 주세요.');
  if(body.reason!==undefined&&(typeof body.reason!=='string'||body.reason.length>1000))fail(400,'사유는 1000자 이내로 입력해 주세요.');
  if(['reject','revoke'].includes(body.action)&&!body.reason?.trim())fail(400,'처리 사유를 입력해 주세요.');
  if(body.area!==undefined&&(body.action!=='approve'||typeof body.area!=='string'||!body.area.trim()||body.area.length>100))fail(400,'승인 지역을 확인해 주세요.');
  if(body.action==='approve')body.reason=body.reason?.trim()||'관리자 승인';
  if(body.action==='update')body.changes=fields(body.changes,GENERAL,[],true);
  if(body.action==='submit'){
    if(!['new','claim','core'].includes(body.kind))fail(400,'신청 유형을 확인해 주세요.');
    if(body.kind==='new'){
      if(body.business_id!==undefined||body.region!=='texas')fail(400,'달타운맵 신규 업소는 텍사스(Texas)만 등록할 수 있습니다.');
      // 달타운맵 Owner 신규 신청만 Texas -> 기존 DB 지역 코드로 변환한다.
      body.region='dallas';
      body.changes=fields(body.changes,CORE,['address','phone','category_ko'],true);
      if(!body.changes.name_ko&&!body.changes.name_en)fail(400,'한글명 또는 영문명을 입력해 주세요.');
    }else if(!body.business_id)fail(400,'기존 업소 식별자가 필요합니다.');
    if(body.kind==='core'){
      body.changes=fields(body.changes,CORE,[],true);
      if(Object.entries(body.changes).some(([k,v])=>!['name_ko','name_en'].includes(k)&&!v))fail(400,'핵심 정보를 비울 수 없습니다.');
      if(!body.baseline||typeof body.baseline!=='object'||Array.isArray(body.baseline)||Object.entries(body.baseline).some(([k,v])=>!CORE.includes(k)||(v!==null&&(typeof v!=='string'||v.length>500))))fail(400,'변경 전 정보를 확인해 주세요.');
      if(Object.keys(body.changes).sort().join()!==Object.keys(body.baseline).sort().join())fail(400,'변경 전 정보가 필요합니다.');
    }
    if(body.kind==='claim'&&(body.changes||body.baseline))fail(400,'소유권 신청은 업소 정보를 변경하지 않습니다.');
  }
  return body;
}
function makeHandler({getClient}={}){return async event=>{
  const reply=(status,body)=>({statusCode:status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},body:JSON.stringify(body)});
  try{
    if(!['GET','POST'].includes(event.httpMethod))return reply(405,{error:'허용되지 않은 메서드입니다.'});
    let db;
    if(getClient)db=getClient();else{
      requireOwnerUuidEnvironment();
      db=require('@supabase/supabase-js').createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
    }
    const authorization=Object.entries(event.headers||{}).find(([k])=>k.toLowerCase()==='authorization')?.[1];
    const match=/^Bearer ([^\s]+)$/.exec(authorization||'');
    if(!match)fail(401,'로그인이 필요합니다.');
    const {data,error}=await db.auth.getUser(match[1]);
    if(error||!data?.user?.id||!data.user.email_confirmed_at)fail(401,'이메일 인증 후 로그인해 주세요.');
    let params={p_actor:data.user.id},rpc='owner_portal_uuid_read';
    if(event.httpMethod==='GET'){
      const q=event.queryStringParameters||{};
      if(Object.keys(q).some(k=>!['status','kind','offset','audit_offset'].includes(k)))fail(400,'조회 조건을 확인해 주세요.');
      for(const [name,allowed] of [['status',['pending','approved','rejected','cancelled']],['kind',['new','claim','core']]]){
        if(q[name]&&!allowed.includes(q[name]))fail(400,'조회 조건을 확인해 주세요.');
        params[`p_${name}`]=q[name]||null;
      }
      for(const name of ['offset','audit_offset']){
        if(q[name]!==undefined&&!/^\d{1,6}$/.test(q[name]))fail(400,'페이지를 확인해 주세요.');
        params[`p_${name}`]=Number(q[name]||0);
      }
    }
    if(event.httpMethod==='POST'){
      if(event.isBase64Encoded||Buffer.byteLength(event.body||'')>20000)fail(400,'요청 크기를 확인해 주세요.');
      let body;try{body=JSON.parse(event.body||'{}');}catch{fail(400,'JSON 형식을 확인해 주세요.');}
      params.p_command=validate(body);rpc='owner_portal_uuid_command';
    }
    const result=await db.rpc(rpc,params);
    if(result.error){
      if(result.error.code==='OP409'&&result.error.message==='신청 제한')return reply(429,{ok:false,code:'OWNER_REQUEST_RATE_LIMIT',error:'1시간에 최대 5건까지 신청할 수 있습니다. 잠시 후 다시 신청해 주세요.'});
      // DB가 확정한 오류만 공개용 코드로 변환한다. 권한 판단은 RPC에 유지한다.
      const known={
        'OP403:본인 신청 승인 금지':['OWNER_SELF_REVIEW_BLOCKED','본인 신청은 처리할 수 없습니다. 다른 관리자가 처리해야 합니다.'],
        'OP403:관리자 권한 필요':['OWNER_ADMIN_REQUIRED','해당 지역의 관리자 권한이 필요합니다. 로그인 계정을 확인해 주세요.'],
        'OP403:활성 소유권 필요':['OWNER_MEMBERSHIP_REQUIRED','이 업소의 활성 소유권이 없습니다.'],
        'OP403:신청자 본인만 취소 가능':['OWNER_CANCEL_FORBIDDEN','신청자 본인만 신청을 취소할 수 있습니다.'],
        'OP409:대기 신청만 취소 가능':['OWNER_CANCEL_STATE_CONFLICT','이미 처리된 신청입니다. 대기 중인 신청만 취소할 수 있습니다.'],
        'OP409:이미 승인된 소유자 존재':['OWNER_OWNERSHIP_CONFLICT','이미 활성 소유자가 있는 업소입니다. 중복 소유권 승인은 처리할 수 없습니다.']
      }[`${result.error.code}:${result.error.message}`];
      if(known)return reply(result.error.code==='OP403'?403:409,{ok:false,code:known[0],error:known[1]});
      const status={OP403:403,OP409:409,OP400:400,'23505':409}[result.error.code]||503;
      fail(status,status===409?'이미 처리됐거나 정보가 변경됐습니다. 새로고침해 주세요.':status===403?'이 작업에 대한 권한이 없습니다.':'요청을 처리하지 못했습니다.');
    }
    if(rpc==='owner_portal_uuid_read'){
      const catalog=await db.rpc('owner_description_catalog');if(catalog.error||!Array.isArray(catalog.data?.groups)||!Array.isArray(catalog.data?.options))fail(503,'소개 문구 목록을 확인하지 못했습니다.');result.data.description_catalog=catalog.data;
      for(const b of result.data.businesses||[]){const policy=await db.rpc('owner_feature_policy',{p_actor:data.user.id,p_business:b.id});if(policy.error)fail(503,'업소 이용 권한을 확인하지 못했습니다.');b.feature_policy=policy.data;}
    }
    return reply(200,{ok:true,result:result.data});
  }catch(error){return reply(error.status||503,{ok:false,error:error.status?error.message:'서버 연결을 확인해 주세요.'});}
};}
module.exports={makeHandler,validate,CORE,GENERAL};
