const CLEANUP_DELAY_MS=7*86400000;
const cleanupAfter=(now=new Date())=>new Date(now.getTime()+CLEANUP_DELAY_MS).toISOString();

function adminStatusChanges(post,status,now=new Date()){
  const changes={status,approved_at:status==='approved'?now.toISOString():null};
  if(status==='approved'){
    changes.cleanup_after=post.category==='marketplace'
      ?new Date(new Date(post.created_at).getTime()+37*86400000).toISOString()
      :null;
  }else{
    changes.cleanup_after=post.status===status&&post.cleanup_after
      ?post.cleanup_after:cleanupAfter(now);
  }
  return changes;
}

module.exports={cleanupAfter,adminStatusChanges};
