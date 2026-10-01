const S=require('./community-security');
async function cleanup(now=new Date()){
  const db=S.client(),iso=now.toISOString(),summary={expired:0,deleted:0,objects:0,failures:0,heldVideo:0};
  const exp=await db.from('community_posts').update({status:'expired'}).in('category',['marketplace','housing']).in('status',['approved','pending']).lte('expires_at',iso).select('id');if(exp.error)throw exp.error;summary.expired=exp.data?.length||0;
  // Expiry only removes public visibility. A separate, future retention phase
  // must decide when to delete posts and their linked media.
  const doomed=await db.from('community_posts').select('id,video_provider,video_url').in('status',['sold','deleted','rejected']).lte('cleanup_after',iso).limit(500);if(doomed.error)throw doomed.error;
  postCleanup: for(const post of doomed.data||[]){
    // Do not cascade-delete video job audit rows or strand a YouTube/GCS asset.
    const jobs=await db.from('community_video_upload_jobs').select('id').eq('post_id',post.id).limit(1);
    if(jobs.error){summary.failures++;continue}
    if(jobs.data?.length||post.video_provider==='youtube'){
      summary.heldVideo++;continue;
    }
    const paths=new Set();
    for(const table of ['community_post_images','community_upload_drafts','community_image_cleanup_queue']){
      const rows=await db.from(table).select('storage_path').eq('post_id',post.id);
      if(rows.error){summary.failures++;continue postCleanup}
      for(const row of rows.data||[])if(row.storage_path)paths.add(row.storage_path);
    }
    if([...paths].some(path=>!require('./community-image-edit').validPath(path))){summary.failures++;continue}
    if(paths.size){const removed=await db.storage.from(S.env().bucket).remove([...paths]);if(removed.error){summary.failures++;continue}summary.objects+=paths.size}
    for(const table of ['community_upload_drafts','community_image_edit_requests','community_image_cleanup_queue']){
      const child=await db.from(table).delete().eq('post_id',post.id);
      if(child.error){summary.failures++;continue postCleanup}
    }
    const del=await db.from('community_posts').delete().eq('id',post.id);
    if(del.error){summary.failures++;continue}
    summary.deleted++;
  }
  const orphan=await db.from('community_upload_drafts').select('id,storage_path').in('status',['reserved','uploaded','cleanup_failed']).lte('expires_at',iso).limit(500);if(orphan.error)throw orphan.error;
  for(const item of orphan.data||[]){const removed=await db.storage.from(S.env().bucket).remove([item.storage_path]);if(removed.error){summary.failures++;await db.from('community_upload_drafts').update({status:'cleanup_failed'}).eq('id',item.id);continue}await db.from('community_upload_drafts').delete().eq('id',item.id);summary.objects++}
  const queued=await db.from('community_image_cleanup_queue').select('storage_path,attempts').limit(500);if(queued.error)throw queued.error;
  for(const item of queued.data||[]){if(!require('./community-image-edit').validPath(item.storage_path)){summary.failures++;continue}let removed;try{removed=await db.storage.from(S.env().bucket).remove([item.storage_path])}catch{removed={error:true}}if(removed.error){summary.failures++;await db.from('community_image_cleanup_queue').update({attempts:(item.attempts||0)+1,updated_at:iso}).eq('storage_path',item.storage_path);continue}const deleted=await db.from('community_image_cleanup_queue').delete().eq('storage_path',item.storage_path);if(deleted.error)summary.failures++;else summary.objects++}
  await db.from('community_rate_limits').delete().lt('updated_at',new Date(now.getTime()-2*86400000).toISOString());
  return summary;
}
module.exports={cleanup};
