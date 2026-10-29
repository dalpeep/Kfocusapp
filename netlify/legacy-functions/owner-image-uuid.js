'use strict';
const crypto=require('node:crypto');
const {createClient}=require('@supabase/supabase-js');
const {validateImage,LIMIT}=require('./lib/validated-image');
const {validateVideo,VIDEO_LIMIT}=require('./lib/validated-video');
const videoStaging='owner-portal-video-quarantine';
const staging='owner-portal-quarantine',bucket='public-images';
function makeHandler({getClient,checkEnvironment}={}){return async event=>{
 const answer=(s,code,extra={})=>({statusCode:s,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify({code,...extra})});
 try{if(checkEnvironment)checkEnvironment();else require('./lib/owner-uuid-environment').requireOwnerUuidEnvironment();}catch{return answer(503,'QA_ONLY');}
 if(event.httpMethod!=='POST'||(event.body||'').length>8192)return answer(400,'INVALID_REQUEST');
 const jwt=(event.headers?.authorization||event.headers?.Authorization||'').replace(/^Bearer /,'');
 const db=getClient?getClient():createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const user=(await db.auth.getUser(jwt)).data?.user;
 if(!user?.email_confirmed_at)return answer(401,'AUTH_REQUIRED');
 let body;try{body=JSON.parse(event.body);}catch{return answer(400,'INVALID_REQUEST');}
 // Coupon-purpose upload is checked server-side. Reusing a general gallery upload
 // as a coupon is separately rejected by the DB coupon policy wrapper.
 if(body.purpose==='coupon'){
  const policy=await db.rpc('owner_coupon_policy',{p_actor:user.id,p_business:body.business_id});
  if(policy.error||policy.data?.custom_image!==true)return answer(403,'COUPON_PAID_REQUIRED');
 }
 // Preserve legacy administrator MP4 uploads without reopening public-images writes.
 if(['prepare_video','publish_video','delete_video'].includes(body.action))return answer(403,'OWNER_VIDEO_DISABLED');
 if(false){
  const profile=await db.from('profiles').select('role,area').eq('user_id',user.id).single();
  if(profile.error||!['super_admin','regional_editor'].includes(profile.data?.role))return answer(403,'ADMIN_REGION_REQUIRED');
  const region=body.region==='all'?(profile.data.role==='super_admin'?'dallas':profile.data.area):body.region;
  if(!['dallas','colorado'].includes(region))return answer(403,'ADMIN_REGION_REQUIRED');
  const auth=getClient?getClient(jwt):createClient(process.env.SUPABASE_URL,process.env.SUPABASE_ANON_KEY,{global:{headers:{Authorization:'Bearer '+jwt}},auth:{persistSession:false,autoRefreshToken:false}});
  const allowed=await auth.rpc('owner_uuid_current_admin',{target_region:region});
  if(allowed.error||allowed.data!==true)return answer(403,'ADMIN_REGION_REQUIRED');
  if(body.action==='delete_video'){
   const path=String(body.path||'');if(!new RegExp('^promo-videos/'+region+'/[0-9a-f-]{36}\\.mp4$','i').test(path))return answer(400,'INVALID_VIDEO_PATH');
   const deleted=await db.storage.from('media').remove([path]);return deleted.error?answer(503,'VIDEO_DELETE_FAILED'):answer(200,'VIDEO_DELETED');
  }
  if(body.mime!=='video/mp4'||!Number.isInteger(body.size)||body.size<1||body.size>VIDEO_LIMIT)return answer(413,'VIDEO_SIZE_OR_MIME_INVALID');
  const media=await db.storage.getBucket('media');
  if(media.error)return answer(503,'MEDIA_BUCKET_UNAVAILABLE');
  if(!media.data.public)return answer(503,'MEDIA_BUCKET_NOT_PUBLIC');
  if(body.action==='publish_video'){
   const path=String(body.path||''),key=String(body.staging_path||'');
   if(!new RegExp('^promo-videos/'+region+'/[0-9a-f-]{36}\\.mp4$','i').test(path)||!new RegExp('^'+user.id+'/[0-9a-f-]{36}\\.mp4$','i').test(key))return answer(403,'VIDEO_SCOPE_REQUIRED');
   let result;
   try{const downloaded=await db.storage.from(videoStaging).download(key);if(downloaded.error)result=answer(404,'VIDEO_STAGING_NOT_FOUND');else{const bytes=validateVideo(Buffer.from(await downloaded.data.arrayBuffer()),body.size);const saved=await db.storage.from('media').upload(path,bytes,{contentType:'video/mp4',upsert:false,cacheControl:'3600'});result=saved.error?answer(503,'VIDEO_SAVE_FAILED'):answer(200,'VIDEO_VALIDATED',{path,publicUrl:db.storage.from('media').getPublicUrl(path).data.publicUrl});}}
   catch{result=answer(422,'VIDEO_REJECTED');}
   const removed=await db.storage.from(videoStaging).remove([key]);return removed.error?answer(503,'VIDEO_STAGING_CLEANUP_FAILED'):result;
  }
  const path='promo-videos/'+region+'/'+crypto.randomUUID()+'.mp4';
  const key=user.id+'/'+crypto.randomUUID()+'.mp4';
  const signed=await db.storage.from(videoStaging).createSignedUploadUrl(key,{upsert:false});
  return signed.error?answer(503,'VIDEO_PREPARE_FAILED'):answer(200,'VIDEO_PREPARED',{path,staging_path:key,upload_token:signed.data.token});
 }
 // QA diagnostics inserted only by QA packager.
 if(body.action==='attach'){
  const business=String(body.business_id||''),path=String(body.path||'');
  if(!/^[0-9a-f-]{36}$/i.test(business)||path.length>512||path&&(!path.startsWith('owner-v1/owner/'+business+'/'+user.id+'/')||path.split('/').some(p=>!p||p==='.'||p==='..')))return answer(400,'INVALID_IMAGE_PATH');
  const url=path?db.storage.from(bucket).getPublicUrl(path).data.publicUrl:'';
  const linked=await db.rpc('owner_uuid_image_link',{p_actor:user.id,p_business:business,p_path:path,p_url:url});
  return linked.error||linked.data!==true?answer(403,'IMAGE_LINK_DENIED'):answer(200,'IMAGE_LINKED',{publicUrl:url});
 }
 if(!['prepare','publish','delete'].includes(body.action))return answer(400,'INVALID_ACTION');
 let path=String(body.path||''),parts=path.split('/');
 if(body.action==='delete'){
 if(!path||path.length>512||parts.some(p=>!p||p==='.'||p==='..')||! /\.(png|jpe?g|webp)$/i.test(path))return answer(400,'INVALID_IMAGE_PATH');
 const url=db.storage.from(bucket).getPublicUrl(path).data.publicUrl;const access=await db.rpc('owner_uuid_image_delete_access',{p_actor:user.id,p_url:url});
 if(access.error||access.data!==true)return answer(403,'IMAGE_DELETE_SCOPE_REQUIRED');
 // Even administrators must unlink every business reference before deleting a blob.
 // Paginate deterministically; never treat a truncated/failed scan as unreferenced.
 const contains=value=>value===url||(Array.isArray(value)?value.some(contains):value&&typeof value==='object'?Object.values(value).some(contains):false);
 let complete=false;
 for(let offset=0;offset<50000;offset+=500){
  const refs=await db.from('businesses').select('id,image_url,image_urls,gallery_images,promo_image_url,promo_image,gallery_urls,description_image_url,description_images').order('id').range(offset,offset+499);
  if(refs.error||!Array.isArray(refs.data))return answer(503,'IMAGE_REFERENCE_CHECK_FAILED');
  if(refs.data.some(contains))return answer(409,'IMAGE_IN_USE');
  if(refs.data.length<500){complete=true;break;}
 }
 if(!complete)return answer(503,'IMAGE_REFERENCE_CHECK_LIMIT');
 const removed=await db.storage.from(bucket).remove([path]);return removed.error?answer(503,'IMAGE_DELETE_FAILED'):answer(200,'IMAGE_DELETED');
 }
 if(parts[0]!=='owner-v1'||path.length>512||parts.some(p=>!p||p==='.'||p==='..')||! /\.(png|jpe?g|webp)$/i.test(path))return answer(400,'INVALID_IMAGE_PATH');
 if(parts[1]==='owner'){
  if(parts.length!==5||parts[3]!==user.id||! /^[0-9a-f-]{36}$/i.test(parts[2]))return answer(403,'IMAGE_SCOPE_REQUIRED');
  const access=await db.rpc('owner_uuid_image_access',{p_actor:user.id,p_business:parts[2]});
  if(access.error||access.data!==true)return answer(403,'OWNER_MEMBERSHIP_REQUIRED');
 }else{
  if(parts.length!==4||!['dallas','colorado'].includes(parts[1])||!['business-description','business-gallery','uploads'].includes(parts[2]))return answer(403,'IMAGE_SCOPE_REQUIRED');
  const auth=getClient?getClient(jwt):createClient(process.env.SUPABASE_URL,process.env.SUPABASE_ANON_KEY,{global:{headers:{Authorization:'Bearer '+jwt}},auth:{persistSession:false,autoRefreshToken:false}});
  const allowed=await auth.rpc('owner_uuid_current_admin',{target_region:parts[1]});
  if(allowed.error||allowed.data!==true)return answer(403,'ADMIN_REGION_REQUIRED');
 }
 if(!['image/png','image/jpeg','image/webp'].includes(body.mime)||!Number.isInteger(body.size)||body.size<1||body.size>LIMIT)return answer(413,'IMAGE_SIZE_OR_MIME_INVALID');
 if(body.action==='prepare'){
  // Remove abandoned private uploads for this actor; never touch published/existing files.
  const list=await db.storage.from(staging).list(user.id,{limit:100});
  if(list.error)return answer(503,'STAGING_UNAVAILABLE');
  const stale=(list.data||[]).filter(o=>Date.parse(o.created_at)<Date.now()-3600000).map(o=>user.id+'/'+o.name);
  if(stale.length&&(await db.storage.from(staging).remove(stale)).error)return answer(503,'STAGING_CLEANUP_FAILED');
  if((list.data||[]).length-stale.length>=5)return answer(429,'IMAGE_UPLOAD_LIMIT');
  const key=user.id+'/'+crypto.randomUUID()+'.'+path.split('.').pop().toLowerCase();
  const signed=await db.storage.from(staging).createSignedUploadUrl(key,{upsert:false});
  if(signed.error)return answer(503,'STAGING_UNAVAILABLE');
  return answer(200,'IMAGE_PREPARED',{staging_path:key,upload_token:signed.data.token});
 }
 const key=String(body.staging_path||'');
 if(!new RegExp('^'+user.id+'/[0-9a-f-]{36}\\.(png|jpe?g|webp)$','i').test(key))return answer(403,'STAGING_SCOPE_REQUIRED');
 let result;
 try{
  const download=await db.storage.from(staging).download(key);
  if(download.error){result=answer(404,'STAGING_NOT_FOUND');}
  else{
   const bytes=Buffer.from(await download.data.arrayBuffer());
   if(bytes.length!==body.size)throw Error('IMAGE_SIZE_INVALID');
   const image=await validateImage(bytes,body.mime,path);
   // No public object is written until full decode succeeds. Immutable new name avoids unsafe replacement.
   const final=parts.slice(0,-1).join('/')+'/'+crypto.randomUUID()+'.'+(image.format==='jpeg'?'jpg':image.format);
   const saved=await db.storage.from(bucket).upload(final,image.bytes,{contentType:image.mime,upsert:false,cacheControl:'3600'});
   result=saved.error?answer(503,'IMAGE_SAVE_FAILED'):answer(200,'IMAGE_VALIDATED',{path:final,publicUrl:db.storage.from(bucket).getPublicUrl(final).data.publicUrl,width:image.width,height:image.height});
  }
 }catch(e){result=answer(422,['IMAGE_SIZE_INVALID','IMAGE_FORMAT_MISMATCH','IMAGE_DECODE_FAILED'].includes(e.message)?e.message:'IMAGE_REJECTED');}
 // Failed input exists only in private quarantine during validation and is deleted on success/failure.
 const removed=await db.storage.from(staging).remove([key]);
 return removed.error?answer(503,'STAGING_CLEANUP_FAILED'):result;
};}
exports.makeHandler=makeHandler;exports.handler=makeHandler();
