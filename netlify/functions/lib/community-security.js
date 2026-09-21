const crypto=require('crypto');

const CATEGORIES=new Set(['job_hiring','job_seeking','marketplace','housing','qna','neighborhood']);
const IMAGE_LIMITS={job_hiring:1,job_seeking:1,marketplace:3,housing:3,qna:2,neighborhood:3};
const CONTACT_TYPES=new Set(['phone','text','email','kakao','other']);
const AREAS=new Set(['dallas','carrollton','plano','frisco','lewisville','richardson','irving','coppell','fort_worth','other']);
const text=(v,max=5000)=>String(v??'').trim().slice(0,max);
function env(){
  const url=process.env.SUPABASE_URL||'';
  const service=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_KEY||'';
  if(!url||!service)throw Object.assign(new Error('Community service is not configured.'),{status:503});
  return{url,service,pepper:process.env.COMMUNITY_PASSWORD_PEPPER||'',rateSecret:process.env.COMMUNITY_RATE_LIMIT_HMAC_SECRET||'',turnstile:process.env.TURNSTILE_SECRET_KEY||'',bucket:process.env.STORAGE_BUCKET||'public-images'};
}
const client=()=>{const {createClient}=require('@supabase/supabase-js');const e=env();return createClient(e.url,e.service,{auth:{persistSession:false,autoRefreshToken:false}})};
function response(status,body){return{statusCode:status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},body:JSON.stringify(body)}}
function parse(event){try{return JSON.parse(event.body||'{}')}catch{throw Object.assign(new Error('Invalid JSON.'),{status:400})}}
function ip(event){return text((event.headers||{})['x-nf-client-connection-ip']||(event.headers||{})['x-forwarded-for']||'',200).split(',')[0].trim()||'unknown'}
function fingerprint(event){const secret=env().rateSecret;if(!secret)throw Object.assign(new Error('Community rate limit is not configured.'),{status:503});return crypto.createHmac('sha256',secret).update(ip(event)).digest('hex')}
async function rateLimit(db,event,action,limit,windowSeconds,target=''){
  const {data,error}=await db.rpc('community_rate_limit_take',{p_action:action,p_fingerprint:fingerprint(event),p_target:text(target,100),p_limit:limit,p_window_seconds:windowSeconds});
  if(error)throw Object.assign(new Error('Rate limit unavailable.'),{status:503});
  if(data!==true)throw Object.assign(new Error('요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.'),{status:429});
}
async function verifyTurnstile(event,token){
  const secret=env().turnstile;if(!secret)throw Object.assign(new Error('Turnstile is not configured.'),{status:503});
  const form=new URLSearchParams({secret,response:text(token,4000),remoteip:ip(event)});
  const res=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:form});
  const json=await res.json().catch(()=>({}));
  if(!res.ok||json.success!==true)throw Object.assign(new Error('보안 확인에 실패했습니다.'),{status:403});
}
function validatePassword(value){const p=String(value||'');if(p.length<6||p.length>72)throw Object.assign(new Error('수정/삭제 비밀번호는 6~72자로 입력해 주세요.'),{status:400});return p}
function hashPassword(value){const password=validatePassword(value),salt=crypto.randomBytes(16),pepper=env().pepper;const hash=crypto.scryptSync(password+pepper,salt,32);return `scrypt-v1$${salt.toString('base64url')}$${hash.toString('base64url')}`}
function verifyPassword(value,stored){try{const [version,salt,expected]=String(stored||'').split('$');if(version!=='scrypt-v1'||!salt||!expected)return false;const actual=crypto.scryptSync(validatePassword(value)+env().pepper,Buffer.from(salt,'base64url'),32);const target=Buffer.from(expected,'base64url');return actual.length===target.length&&crypto.timingSafeEqual(actual,target)}catch{return false}}
function validatePost(body,{partial=false}={}){
  const category=text(body.category,40),region=text(body.region||'dallas',40).toLowerCase(),area=text(body.area,40).toLowerCase();
  if(!partial&&!CATEGORIES.has(category))throw Object.assign(new Error('올바른 카테고리를 선택해 주세요.'),{status:400});
  if(category&&!CATEGORIES.has(category))throw Object.assign(new Error('Invalid category.'),{status:400});
  if(!partial&&!AREAS.has(area))throw Object.assign(new Error('올바른 지역을 선택해 주세요.'),{status:400});
  const title=text(body.title,121),content=text(body.body,5001),author=text(body.author_name,41);
  if(!partial&&(title.length<2||content.length<2||!author))throw Object.assign(new Error('제목, 내용, 작성자를 확인해 주세요.'),{status:400});
  const contactType=text(body.contact_type,20)||null,contactValue=text(body.contact_value,200)||null;
  if(contactType&&!CONTACT_TYPES.has(contactType))throw Object.assign(new Error('Invalid contact type.'),{status:400});
  if(Boolean(contactType)!==Boolean(contactValue))throw Object.assign(new Error('연락방법과 연락처를 함께 입력해 주세요.'),{status:400});
  if(contactType==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactValue))throw Object.assign(new Error('올바른 이메일 주소를 입력해 주세요.'),{status:400});
  if(['phone','text'].includes(contactType)&&!/^[+()\d\s.-]{7,30}$/.test(contactValue))throw Object.assign(new Error('올바른 전화번호를 입력해 주세요.'),{status:400});
  return{category,region,area,title,body:content,author_name:author,contact_type:contactType,contact_value:contactValue};
}
async function verifyUploadedObjects(db,uploads){
  for(const upload of uploads){
    const downloaded=await db.storage.from(env().bucket).download(upload.storage_path);
    if(downloaded.error||!downloaded.data)throw Object.assign(new Error('업로드된 이미지 파일을 확인할 수 없습니다.'),{status:400});
    const size=Number(downloaded.data.size||0),type=String(downloaded.data.type||'').toLowerCase();
    if(size!==Number(upload.byte_size)||size<1||size>1024*1024||type!=='image/webp')throw Object.assign(new Error('업로드된 이미지 파일 정보가 일치하지 않습니다.'),{status:400});
  }
}
async function verifyAdmin(event,region){
  const token=text((event.headers||{}).authorization,5000).replace(/^Bearer\s+/i,'');if(!token)throw Object.assign(new Error('Unauthorized.'),{status:401});
  const db=client(),{data,error}=await db.auth.getUser(token);if(error||!data?.user)throw Object.assign(new Error('Unauthorized.'),{status:401});
  const user=data.user;let profile=null,profileError=null;
  const lookup=await db.from('profiles').select('role,area').eq('user_id',user.id).maybeSingle();profile=lookup.data;profileError=lookup.error;
  const missing=profileError&&(['42P01','PGRST205'].includes(String(profileError.code))||/profiles.*(?:does not exist|schema cache|could not find)/i.test(profileError.message||''));
  if(profileError&&!missing)throw Object.assign(new Error('Authorization lookup failed.'),{status:503});
  const meta=user.app_metadata||{},fallback=user.user_metadata||{};const role=text(profile?.role||meta.role||fallback.role,30);const area=text(profile?.area||meta.area||fallback.area,30).toLowerCase();
  if(!['super_admin','regional_editor'].includes(role))throw Object.assign(new Error('Forbidden.'),{status:403});
  if(role==='regional_editor'&&area!==text(region,30).toLowerCase())throw Object.assign(new Error('Forbidden region.'),{status:403});
  return{db,user,role,area};
}
function handler(fn){return async event=>{if(event.httpMethod==='OPTIONS')return response(204,{});try{return await fn(event)}catch(error){const status=Number(error.status)||500;if(status>=500)console.error('[community]',error.message);return response(status,{ok:false,error:status>=500?'Community request failed.':error.message})}}}
module.exports={CATEGORIES,IMAGE_LIMITS,AREAS,text,env,client,response,parse,ip,fingerprint,rateLimit,verifyTurnstile,hashPassword,verifyPassword,validatePost,verifyUploadedObjects,verifyAdmin,handler};
