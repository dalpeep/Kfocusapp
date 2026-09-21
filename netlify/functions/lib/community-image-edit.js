const S=require('./community-security');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validPath=path=>typeof path==='string'&&/^community-posts\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/i.test(path);

async function flushOldObjects(db,postId){
  let queued;try{queued=await db.from('community_image_cleanup_queue').select('storage_path,attempts').eq('post_id',postId).limit(50)}catch{return 1}
  if(queued.error)return 1;
  let pending=0;
  for(const row of queued.data||[]){
    if(!validPath(row.storage_path)){pending++;continue}
    let removed;try{removed=await db.storage.from(S.env().bucket).remove([row.storage_path])}catch{removed={error:true}}
    if(removed.error){pending++;try{await db.from('community_image_cleanup_queue').update({attempts:(row.attempts||0)+1,updated_at:new Date().toISOString()}).eq('storage_path',row.storage_path)}catch{}continue}
    try{const gone=await db.from('community_image_cleanup_queue').delete().eq('storage_path',row.storage_path);if(gone.error)pending++}catch{pending++}
  }
  return pending;
}

async function discardNewDrafts(db,uploads){
  for(const row of uploads){
    if(!validPath(row.storage_path))continue;
    let removed;try{removed=await db.storage.from(S.env().bucket).remove([row.storage_path])}catch{removed={error:true}}
    if(removed.error){try{await db.from('community_upload_drafts').update({status:'cleanup_failed'}).eq('id',row.id).eq('status','reserved')}catch{}continue}
    try{await db.from('community_upload_drafts').delete().eq('id',row.id).eq('status','reserved')}catch{}
  }
}

async function edit(event,body,db,post){
  const requestId=String(body.request_id||''),draftId=String(body.draft_id||'');
  if(!UUID.test(requestId)||!UUID.test(draftId)||!Array.isArray(body.image_plan))
    throw Object.assign(new Error('Invalid image edit request.'),{status:400});
  const previous=await db.from('community_image_edit_requests').select('post_id,result').eq('request_id',requestId).maybeSingle();
  if(previous.error)throw previous.error;
  if(previous.data){
    if(previous.data.post_id!==post.id)throw Object.assign(new Error('Request identity conflict.'),{status:400});
    return {...previous.data.result,cleanup_pending:await flushOldObjects(db,post.id)};
  }
  const next=S.validatePost({...post,...body},{partial:false});
  const max=S.IMAGE_LIMITS[next.category]||0,plan=body.image_plan;
  if(plan.length>max||new Set(plan.map(x=>`${x?.kind}:${x?.id}`)).size!==plan.length)
    throw Object.assign(new Error('이미지 개수 제한 또는 중복을 확인해 주세요.'),{status:400});
  const uploadIds=plan.filter(x=>x?.kind==='upload').map(x=>String(x.id||''));
  if(plan.some(x=>!['existing','upload'].includes(x?.kind)||!UUID.test(String(x.id||''))))
    throw Object.assign(new Error('Invalid image plan.'),{status:400});
  const verified=uploadIds.length?await S.verifiedUploadDrafts(db,event,uploadIds,draftId,post.id):[];
  if(!uploadIds.length)await S.verifyTurnstile(event,body.turnstile_token);
  const byId=new Map(verified.map(row=>[String(row.id),row]));
  const safePlan=plan.map(item=>item.kind==='existing'?{kind:'existing',id:item.id}:(()=>{
    const upload=byId.get(String(item.id));
    if(!upload||!validPath(upload.storage_path))throw Object.assign(new Error('Invalid upload path.'),{status:400});
    return{kind:'upload',id:item.id,image_url:`${S.env().url}/storage/v1/object/public/${S.env().bucket}/${upload.storage_path}`};
  })());
  const args={p_request_id:requestId,p_post_id:post.id,p_post:next,p_plan:safePlan,p_draft_id:draftId,p_fingerprint:S.fingerprint(event)};
  const applied=await db.rpc('community_apply_post_image_edit',args);
  if(applied.error){
    // A lost RPC response may have committed. Never delete new objects unless
    // a second read proves this request did not commit.
    const check=await db.from('community_image_edit_requests').select('post_id,result').eq('request_id',requestId).maybeSingle();
    if(!check.error&&check.data?.post_id===post.id)return {...check.data.result,cleanup_pending:await flushOldObjects(db,post.id)};
    if(!check.error&&!check.data)await discardNewDrafts(db,verified);
    throw Object.assign(new Error('이미지 수정 요청을 저장하지 못했습니다.'),{status:['22023','P0002'].includes(applied.error.code)?400:500});
  }
  return {...applied.data,cleanup_pending:await flushOldObjects(db,post.id)};
}

module.exports={edit,flushOldObjects,discardNewDrafts,validPath};
