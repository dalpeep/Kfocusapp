const CLEANUP_DELAY_MS=7*86400000;
const {POLICY}=require('./community-retention');
const cleanupAfter=(now=new Date())=>new Date(now.getTime()+CLEANUP_DELAY_MS).toISOString();

function adminStatusChanges(post,status,now=new Date()){
  if(status==='hidden'){
    if(post.status!=='approved')throw Object.assign(new Error('게시 중인 글만 숨길 수 있습니다.'),{status:400});
    return{status:'hidden',approved_at:null,cleanup_after:null};
  }
  if(status==='approved'&&post.status==='hidden'&&POLICY[post.category]&&
    (post.category==='marketplace'&&!Number.isFinite(Date.parse(post.expires_at))||
      post.expires_at&&Date.parse(post.expires_at)<=now.getTime()))
    throw Object.assign(new Error('만료된 숨김 글은 수정 후 재검토가 필요합니다.'),{status:400});
  const changes={status,approved_at:status==='approved'?now.toISOString():null};
  if(status==='approved'){
    changes.cleanup_after=POLICY[post.category]&&post.expires_at
      ?new Date(Date.parse(post.expires_at)+7*86400000).toISOString()
      :post.category==='marketplace'
        ?new Date(Date.parse(post.created_at)+37*86400000).toISOString()
      :null;
  }else{
    changes.cleanup_after=post.status===status&&post.cleanup_after
      ?post.cleanup_after:cleanupAfter(now);
  }
  return changes;
}

module.exports={cleanupAfter,adminStatusChanges};
