(function(root,factory){const api=factory();root.DtmCommunityContract=api;if(typeof module==='object'&&module.exports)module.exports=api})(globalThis,function(){
  const CATEGORIES=Object.freeze({job_hiring:'구인',job_seeking:'구직',marketplace:'사고팔기',housing:'렌트/부동산',qna:'질문/정보',neighborhood:'동네소식'});
  const IMAGE_LIMITS=Object.freeze({job_hiring:1,job_seeking:1,marketplace:3,housing:3,qna:2,neighborhood:3});
  const BATCH_SIZE=20;
  function visible(rows,count=BATCH_SIZE){return (Array.isArray(rows)?rows:[]).slice(0,Math.max(0,count))}
  function filter(rows,category='all',query=''){const q=String(query||'').trim().toLowerCase();return (Array.isArray(rows)?rows:[]).filter(r=>(category==='all'||r.category===category)&&(!q||[r.title,r.body_preview,r.area].some(v=>String(v||'').toLowerCase().includes(q))))}
  function discoverable(row,now=Date.now()){if(!row||row.status!=='approved')return false;if(row.category==='marketplace'&&(!row.expires_at||Date.parse(row.expires_at)<=now))return false;return true}
  function expiry(createdAt){const created=new Date(createdAt);return{expires_at:new Date(created.getTime()+30*86400000).toISOString(),cleanup_after:new Date(created.getTime()+37*86400000).toISOString()}}
  return{CATEGORIES,IMAGE_LIMITS,BATCH_SIZE,visible,filter,discoverable,expiry};
});
