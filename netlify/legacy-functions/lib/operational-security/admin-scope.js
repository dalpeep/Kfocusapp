'use strict';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const normalize=v=>String(v||'').trim().toLowerCase()==='denver'?'colorado':String(v||'').trim().toLowerCase();
const reply=(statusCode,error)=>({statusCode,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},body:JSON.stringify({ok:false,error})});
const failure=(status,code)=>Object.assign(Error(code),{status,code});
function client(){return require('@supabase/supabase-js').createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});}
async function verify(db,event){const raw=Object.entries(event.headers||{}).find(([k])=>k.toLowerCase()==='authorization')?.[1]||'';const m=/^Bearer\s+(.+)$/i.exec(raw);if(!m)throw failure(401,'ADMIN_AUTH_REQUIRED');const auth=await db.auth.getUser(m[1]);if(auth.error||!auth.data?.user?.id)throw failure(401,'ADMIN_AUTH_REQUIRED');const p=await db.from('profiles').select('role,area').eq('user_id',auth.data.user.id).maybeSingle();if(p.error)throw failure(503,'ADMIN_AUTH_UNAVAILABLE');const role=String(p.data?.role||''),area=normalize(p.data?.area);if(role==='super_admin')return {role,area};if(role==='regional_editor'&&['dallas','colorado'].includes(area))return {role,area};throw failure(403,'ADMIN_FORBIDDEN');}
async function allowedCoupon(db,id,access){if(!UUID.test(id||''))throw failure(400,'COUPON_ID_REQUIRED');const r=await db.from('coupons').select('id,business_id,business_ids').eq('id',id).maybeSingle();if(r.error)throw failure(503,'ADMIN_AUTH_UNAVAILABLE');if(!r.data)throw failure(403,'COUPON_FORBIDDEN');if(access.role==='super_admin')return;if(r.data.business_ids!=null&&!Array.isArray(r.data.business_ids))throw failure(403,'COUPON_FORBIDDEN');const ids=[r.data.business_id,...(Array.isArray(r.data.business_ids)?r.data.business_ids:[])].filter(Boolean);if(!ids.length||ids.some(x=>!UUID.test(String(x))))throw failure(403,'COUPON_FORBIDDEN');const wanted=[...new Set(ids.map(String))];const rows=await db.from('businesses').select('id,region').in('id',wanted);if(rows.error)throw failure(503,'ADMIN_AUTH_UNAVAILABLE');if(rows.data?.length!==wanted.length||rows.data.some(x=>normalize(x.region)!==access.area))throw failure(403,'COUPON_FORBIDDEN');}
async function paged(db,table,columns){const all=[];for(let offset=0;offset<10000;offset+=500){const r=await db.from(table).select(columns).order('id').range(offset,offset+499);if(r.error)throw failure(503,'ADMIN_AUTH_UNAVAILABLE');all.push(...r.data);if(r.data.length<500)return all;}throw failure(503,'ADMIN_SCOPE_TOO_LARGE');}
async function regionalList(db,access){
 const businesses=await paged(db,'businesses','id,region');
 const local=new Set(businesses.filter(b=>normalize(b.region)===access.area).map(b=>String(b.id)));
 let coupons;try{coupons=await paged(db,'coupons','id,business_id,business_ids,owner_coupon_protocol');}catch(e){
  // Retry without the optional V2 column only when metadata confirms it is absent.
  const probe=await db.from('coupons').select('owner_coupon_protocol').limit(1);
  if(probe.error?.code!=='42703')throw e;
  coupons=await paged(db,'coupons','id,business_id,business_ids');
 }
 const ids=coupons.filter(c=>c.owner_coupon_protocol!=='v2'&&[c.business_id,...(Array.isArray(c.business_ids)?c.business_ids:[])].filter(Boolean).length>0&&[c.business_id,...(Array.isArray(c.business_ids)?c.business_ids:[])].filter(Boolean).every(id=>local.has(String(id)))).map(c=>c.id);
 const entries=[];for(let offset=0;offset<ids.length;offset+=100){const r=await db.from('coupon_entries').select('*').in('coupon_id',ids.slice(offset,offset+100)).order('created_at',{ascending:false}).limit(2000);if(r.error)throw failure(503,'ADMIN_AUTH_UNAVAILABLE');entries.push(...r.data);}
 entries.sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));return {statusCode:200,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},body:JSON.stringify({ok:true,entries:entries.slice(0,2000)})};
}
function makeDispatch(kind,legacy,{getClient=client}={}){return async event=>{
 if(event.httpMethod!=='POST')return legacy(event);
 try{let body;try{body=JSON.parse(event.body||'{}')}catch{throw failure(400,'INVALID_JSON');}if(!body||Array.isArray(body)||typeof body!=='object')throw failure(400,'INVALID_REQUEST');const db=getClient(),access=await verify(db,event);
  // Query entries only for region-authorized coupons, including every linked business.
  if(kind==='campaign'){
   if((body.action||'list')==='list_all'){if(access.role!=='super_admin')return await regionalList(db,access);}
   else await allowedCoupon(db,body.coupon_id,access);
  }else{
   if(access.role!=='super_admin'){
    const input=body.ids??body.id;const ids=[...new Set((Array.isArray(input)?input:[input]).filter(Boolean).map(String))];
    if(!ids.length||ids.length>300||ids.some(x=>!UUID.test(x)))throw failure(400,'REDEMPTION_IDS_REQUIRED');
    const found=await db.from('coupon_redemptions').select('id,coupon_id').in('id',ids);if(found.error)throw failure(503,'ADMIN_AUTH_UNAVAILABLE');if(found.data?.length!==ids.length)throw failure(403,'REDEMPTION_FORBIDDEN');
    for(const cid of new Set(found.data.map(x=>x.coupon_id)))await allowedCoupon(db,cid,access);
   }
  }
  return legacy(event);
 }catch(e){return reply(e.status||503,e.code||'ADMIN_AUTH_UNAVAILABLE');}
};}
module.exports={makeDispatch,verify,allowedCoupon,regionalList,normalize};
