const S=require('./lib/community-security');
exports.handler=S.handler(async event=>{
  if(event.httpMethod!=='POST')return S.response(405,{ok:false,error:'Method not allowed.'});const body=S.parse(event),db=S.client();
  await S.verifyTurnstile(event,body.turnstile_token);await S.rateLimit(db,event,'post_create',3,3600);
  const post=S.validatePost(body),password_hash=S.hashPassword(body.password),uploads=Array.isArray(body.upload_ids)?[...new Set(body.upload_ids.map(String))]:[];
  if(uploads.length>(S.IMAGE_LIMITS[post.category]||0))throw Object.assign(new Error('이미지 개수 제한을 초과했습니다.'),{status:400});
  const now=new Date(),expiry=post.category==='marketplace'?new Date(now.getTime()+30*86400000):null,cleanup=expiry?new Date(expiry.getTime()+7*86400000):null;
  const inserted=await db.from('community_posts').insert({...post,password_hash,status:'pending',expires_at:expiry?.toISOString()||null,cleanup_after:cleanup?.toISOString()||null}).select('id').single();if(inserted.error)throw inserted.error;
  try{
    if(uploads.length){const fp=S.fingerprint(event),found=await db.from('community_upload_drafts').select('*').in('id',uploads).eq('ip_fingerprint',fp).eq('draft_id',body.draft_id).eq('status','reserved');if(found.error||found.data.length!==uploads.length)throw Object.assign(new Error('업로드 확인에 실패했습니다.'),{status:400});
      await S.verifyUploadedObjects(db,found.data);await db.from('community_upload_drafts').update({status:'uploaded'}).in('id',uploads);
      const rows=found.data.map((u,i)=>({post_id:inserted.data.id,storage_path:u.storage_path,image_url:`${S.env().url}/storage/v1/object/public/${S.env().bucket}/${u.storage_path}`,width:u.width,height:u.height,byte_size:u.byte_size,sort_order:i}));const images=await db.from('community_post_images').insert(rows);if(images.error)throw images.error;await db.from('community_upload_drafts').update({status:'linked',post_id:inserted.data.id}).in('id',uploads);
    }
  }catch(error){await db.from('community_posts').delete().eq('id',inserted.data.id);throw error}
  return S.response(201,{ok:true,id:inserted.data.id,status:'pending',message:'게시글이 접수되었습니다. 관리자 확인 후 게시됩니다.'});
});
