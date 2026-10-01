const DAY_MS=86400000;
const POLICY=Object.freeze({marketplace:30,housing:90});
const MAX_AUTHOR_EXTENSIONS=1;

function initialRetention(category,now=new Date()){
  const days=POLICY[category];
  if(!days)return{expires_at:null,cleanup_after:null};
  const expires=new Date(now.getTime()+days*DAY_MS);
  return{expires_at:expires.toISOString(),cleanup_after:new Date(expires.getTime()+7*DAY_MS).toISOString()};
}

function extension(post,now=new Date()){
  const days=POLICY[post.category];
  if(!days||post.status!=='approved'||post.category==='marketplace'&&post.status==='sold')
    throw Object.assign(new Error('이 게시글은 기간을 연장할 수 없습니다.'),{status:400});
  if((post.extension_count||0)>=MAX_AUTHOR_EXTENSIONS)
    throw Object.assign(new Error('게시기간 연장은 1회만 가능합니다.'),{status:409});
  const current=Date.parse(post.expires_at);
  if(!Number.isFinite(current))throw Object.assign(new Error('기존 게시글의 만료일은 관리자 확인이 필요합니다.'),{status:409});
  if(current<=now.getTime())throw Object.assign(new Error('이미 만료된 게시글은 연장할 수 없습니다.'),{status:409});
  const expires=new Date(current+days*DAY_MS);
  return{expires_at:expires.toISOString(),cleanup_after:new Date(expires.getTime()+7*DAY_MS).toISOString(),extension_count:1};
}

module.exports={POLICY,MAX_AUTHOR_EXTENSIONS,initialRetention,extension};
