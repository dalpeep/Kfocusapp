const S=require('./community-security');
async function cleanup(now=new Date()){
  const db=S.client(),iso=now.toISOString(),summary={expired:0,deleted:0,objects:0,failures:0};
  const exp=await db.from('community_posts').update({status:'expired'}).eq('category','marketplace').eq('status','approved').lte('expires_at',iso).select('id');if(exp.error)throw exp.error;summary.expired=exp.data?.length||0;
  const doomed=await db.from('community_posts').select('id').in('status',['expired','sold','deleted']).lte('cleanup_after',iso).limit(500);if(doomed.error)throw doomed.error;
  for(const post of doomed.data||[]){const imgs=await db.from('community_post_images').select('storage_path').eq('post_id',post.id);const paths=(imgs.data||[]).map(x=>x.storage_path).filter(Boolean);if(paths.length){const removed=await db.storage.from(S.env().bucket).remove(paths);if(removed.error){summary.failures++;continue}summary.objects+=paths.length}const del=await db.from('community_posts').delete().eq('id',post.id);if(del.error){summary.failures++;continue}summary.deleted++}
  const orphan=await db.from('community_upload_drafts').select('id,storage_path').in('status',['reserved','uploaded','cleanup_failed']).lte('expires_at',iso).limit(500);if(orphan.error)throw orphan.error;
  for(const item of orphan.data||[]){const removed=await db.storage.from(S.env().bucket).remove([item.storage_path]);if(removed.error){summary.failures++;await db.from('community_upload_drafts').update({status:'cleanup_failed'}).eq('id',item.id);continue}await db.from('community_upload_drafts').delete().eq('id',item.id);summary.objects++}
  await db.from('community_rate_limits').delete().lt('updated_at',new Date(now.getTime()-2*86400000).toISOString());
  return summary;
}
module.exports={cleanup};
