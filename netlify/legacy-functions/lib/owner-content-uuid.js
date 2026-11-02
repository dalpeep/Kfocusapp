'use strict';
const {requireOwnerUuidEnvironment}=require('./owner-uuid-environment');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIELDS={
 profile:['description','hours','website','website_url','youtube_url','order_url','delivery_url','reservation_url','image_url','gallery_urls','description_images','business_hours','monday','tuesday','wednesday','thursday','friday','saturday','sunday','tagline'],
 coupon:['title','description','image_url','template_design','coupon_code','discount_label','start_at','end_at','delivery_mode','raffle_end_at','winner_count','one_per_email','marketing_opt_in_enabled','is_active','is_today_coupon','issue_limit'],
 event:['title','content','image_url','start_at','end_at','venue_name','address','external_url','is_active'],
 special:['type','title','description','price_text','days_of_week','start_time','end_time','start_date','end_date','image_url','is_active']
};
function invalid(){throw Object.assign(Error('입력 형식과 필수 정보를 확인해 주세요.'),{status:400});}
function validate(c){
 if(!c||typeof c!=='object'||Array.isArray(c)||Object.keys(c).some(k=>!['key','kind','action','business_id','record_id','changes','items'].includes(k))||!UUID.test(c.key||'')||!UUID.test(c.business_id||'')||!Object.hasOwn(FIELDS,c.kind)||!['save','end'].includes(c.action))invalid();
 if(c.record_id!==undefined&&(typeof c.record_id!=='string'||(c.kind==='special'?!/^[1-9][0-9]{0,18}$/.test(c.record_id):!UUID.test(c.record_id))))invalid();
 if(c.action==='end'&&(!c.record_id||c.kind==='profile'||c.changes||c.items))invalid();
 if(c.action==='save'){
  const p=c.changes;if(!p||typeof p!=='object'||Array.isArray(p)||!Object.keys(p).length||Object.entries(p).some(([k,v])=>!FIELDS[c.kind].includes(k)||(v===null&&k!=='issue_limit'&&!(c.kind==='special'&&require('./owner-content-validation').specialNullable.includes(k)))||(typeof v==='string'&&v.length>5000)))invalid();
  if(c.kind!=='profile'&&(!c.record_id||Object.hasOwn(p,'title'))&&(!(typeof p.title==='string')||!p.title.trim()||p.title.length>160))invalid();
  require('./owner-content-validation').validateDates(c.kind,p);
  for(const [k,v]of Object.entries(p)){
   if(v===null&&c.kind==='special'&&require('./owner-content-validation').specialNullable.includes(k))continue;
   if(['is_active','is_today_coupon','one_per_email','marketing_opt_in_enabled'].includes(k)){if(typeof v!=='boolean')invalid();}
   else if(k==='winner_count'){if(!Number.isInteger(v)||v<1||v>100)invalid();}
   else if(k==='issue_limit'){if(v!==null&&(!Number.isInteger(v)||v<1||v>1000000))invalid();}
   else if(k==='days_of_week'){if(!Array.isArray(v)||v.length>7||v.some(d=>!Number.isInteger(d)||d<0||d>6))invalid();}
   else if(['gallery_urls','description_images'].includes(k)){if(!Array.isArray(v)||v.length>12||v.some(x=>typeof x!=='string'))invalid();}
   else if(k==='business_hours'){if(!v||typeof v!=='object'||Array.isArray(v)||JSON.stringify(v).length>4000)invalid();}
   else if(typeof v!=='string')invalid();
  }
  // Owner raffle authoring remains closed until the independent atomic rollout.
  if(p.delivery_mode==='raffle'||['raffle_end_at','winner_count'].some(k=>Object.hasOwn(p,k)))throw Object.assign(Error('추첨 기능은 아직 사용할 수 없습니다.'),{status:403});
  if(p.delivery_mode&&!['display','instant_email'].includes(p.delivery_mode))invalid();
  // New V2 campaigns use the separate email issuance ledger. Existing Legacy
  // display coupons retain their original editing and redemption path.
  if(c.kind==='coupon'&&!c.record_id&&p.delivery_mode!=='instant_email')throw Object.assign(Error('신규 쿠폰은 이메일 발급을 선택해 주세요.'),{status:400});
  if(p.type&&!['lunch_special','happy_hour','discount'].includes(p.type))invalid();
 }
 if(c.items!==undefined&&(c.kind!=='special'||!Array.isArray(c.items)||c.items.length>20||c.items.some(i=>!i||typeof i!=='object'||Array.isArray(i)||Object.keys(i).some(k=>!['item_name','description','price_text'].includes(k))||typeof i.item_name!=='string'||!i.item_name.trim()||i.item_name.length>160||Object.values(i).some(v=>typeof v!=='string'||v.length>5000))))invalid();
 return c;
}
function makeHandler({getClient}={}){return async event=>{
 const reply=(status,body)=>({statusCode:status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},body:JSON.stringify(body)});
 try{
  if(!['GET','POST'].includes(event.httpMethod))return reply(405,{error:'허용되지 않은 메서드입니다.'});
  let db;if(getClient)db=getClient();else{requireOwnerUuidEnvironment();db=require('@supabase/supabase-js').createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});}
  const token=Object.entries(event.headers||{}).find(([k])=>k.toLowerCase()==='authorization')?.[1]?.match(/^Bearer ([^\s]+)$/)?.[1];
  if(!token)return reply(401,{error:'로그인이 필요합니다.'});
  const {data,error}=await db.auth.getUser(token);if(error||!data?.user?.email_confirmed_at)return reply(401,{error:'인증된 로그인이 필요합니다.'});
  const canary=require('./owner-canary');if(!canary.actorAllowed(data.user.id))return reply(403,{error:'Canary 테스트 계정만 이용할 수 있습니다.'});
  const params={p_actor:data.user.id};let rpc;
  if(event.httpMethod==='GET'){const q=event.queryStringParameters||{};if(Object.keys(q).some(k=>k!=='business_id')||!UUID.test(q.business_id||''))invalid();params.p_business=q.business_id;rpc='owner_content_read';}
  else{if(event.isBase64Encoded||Buffer.byteLength(event.body||'')>30000)invalid();let c;try{c=JSON.parse(event.body);}catch{invalid();}params.p_command=validate(c);rpc='owner_content_command';}
  if(!canary.businessAllowed(params.p_business||params.p_command?.business_id))return reply(403,{error:'Canary 테스트 업소만 이용할 수 있습니다.'});
  if(rpc==='owner_content_command'&&params.p_command.kind==='coupon'&&params.p_command.action==='save'){
   params.p_command=await require('./owner-coupon-template').prepareCoupon(db,data.user.id,params.p_command);
  }
  const out=await db.rpc(rpc,params);
  if(!out.error&&rpc==='owner_content_read'){
   const policy=await db.rpc('owner_coupon_policy',{p_actor:data.user.id,p_business:params.p_business});
   if(policy.error)return reply(503,{error:'쿠폰 이용 권한을 확인하지 못했습니다.'});
   out.data.coupon_policy=policy.data;for(const c of out.data.coupons||[])c.template_design=policy.data.coupon_designs?.[c.image_url]||null;
  }if(out.error){const code=out.error.code;if(code==='OP403')return reply(403,{code:'OWNER_CONTENT_FORBIDDEN',error:'이 업소 콘텐츠를 관리할 권한이 없습니다.'});if(code==='OP409'||code==='23505')return reply(409,{code:'OWNER_CONTENT_CONFLICT',error:'요청 충돌입니다. 새로고침해 주세요.'});if(code==='OP400'||/^22/.test(code)||code==='23514'||code==='23502')return reply(400,{code:'OWNER_CONTENT_INVALID',error:'입력 내용과 기간을 확인해 주세요.'});return reply(503,{error:'콘텐츠 연결을 확인해 주세요.'});}
  return reply(200,{ok:true,result:out.data});
 }catch(e){return reply(e.status||503,{error:e.status?e.message:'콘텐츠 연결을 확인해 주세요.'});}
};}
module.exports={makeHandler,validate,FIELDS};

