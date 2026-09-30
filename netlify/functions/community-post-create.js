const S=require('./lib/community-security');
const {validateDetails}=require('./lib/community-details');
const {reviewPost}=require('./lib/community-review');
exports.handler=S.handler(async event=>{
  if(event.httpMethod!=='POST')return S.response(405,{ok:false,error:'Method not allowed.'});const body=S.parse(event),db=S.client();
  const uploads=Array.isArray(body.upload_ids)?[...new Set(body.upload_ids.map(String))]:[];
  // A signed upload draft is proof of the one-time Turnstile verification at
  // authorization. A second siteverify call with the same token must not be made.
  const verified=uploads.length?await S.verifiedUploadDrafts(db,event,uploads,body.draft_id):[];
  if(!uploads.length)await S.verifyTurnstile(event,body.turnstile_token);
  await S.rateLimit(db,event,'post_create',3,3600);
  const post=S.validatePost(body),details=validateDetails(post.category,body.details),password_hash=S.hashPassword(body.password);
  if(details?.external_video_url&&post.video_url)
    throw Object.assign(new Error('영상 입력을 확인해 주세요.'),{status:400});
  if(uploads.length>(S.IMAGE_LIMITS[post.category]||0))throw Object.assign(new Error('이미지 개수 제한을 초과했습니다.'),{status:400});
  const now=new Date(),expiry=post.category==='marketplace'?new Date(now.getTime()+30*86400000):null,cleanup=expiry?new Date(expiry.getTime()+7*86400000):null;
  const decision=reviewPost(post,details),initialStatus=uploads.length?'pending':decision.status;
  const inserted=await db.from('community_posts').insert({...post,details,password_hash,status:initialStatus,approved_at:initialStatus==='approved'?now.toISOString():null,expires_at:expiry?.toISOString()||null,cleanup_after:cleanup?.toISOString()||null}).select('id').single();if(inserted.error)throw inserted.error;
  try{
    if(uploads.length){
      const byId=new Map(verified.map(u=>[String(u.id),u]));
      const rows=uploads.map((id,i)=>{const u=byId.get(id);return{post_id:inserted.data.id,storage_path:u.storage_path,image_url:`${S.env().url}/storage/v1/object/public/${S.env().bucket}/${u.storage_path}`,width:u.width,height:u.height,byte_size:u.byte_size,sort_order:i}});const images=await db.from('community_post_images').insert(rows);if(images.error)throw images.error;const linked=await db.from('community_upload_drafts').update({status:'linked',post_id:inserted.data.id}).in('id',uploads);if(linked.error)throw linked.error;
    }
  }catch(error){await db.from('community_posts').delete().eq('id',inserted.data.id);throw error}
  if(uploads.length&&decision.status==='approved'){
    const published=await db.from('community_posts').update({status:'approved',approved_at:new Date().toISOString()}).eq('id',inserted.data.id).eq('status','pending').select('id');
    if(published.error||published.data?.length!==1)throw Object.assign(new Error('게시글 공개 상태를 확인하지 못했습니다.'),{status:503});
  }
  const message=decision.status==='approved'?'게시글이 등록되었습니다.':'게시글이 등록되었습니다. 내용 확인 후 공개될 수 있습니다.';
  return S.response(201,{ok:true,id:inserted.data.id,status:decision.status,message});
});
