const S=require('./community-security'),L=require('./community-lifecycle');
async function post(event,action){
  if(event.httpMethod!=='POST')return S.response(405,{ok:false,error:'Method not allowed.'});const b=S.parse(event),db=S.client(),id=S.text(b.id,80);if(action!=='update'||!Array.isArray(b.image_plan))await S.verifyTurnstile(event,b.turnstile_token);
  const row=await db.from('community_posts').select('*').eq('id',id).single();if(row.error||!row.data)throw Object.assign(new Error('게시글을 찾을 수 없습니다.'),{status:404});
  if(!S.verifyPassword(b.password,row.data.password_hash)){await S.rateLimit(db,event,'password_fail',5,900,`post:${id}`);throw Object.assign(new Error('비밀번호가 일치하지 않습니다.'),{status:403})}
  if(action==='update'){if(Array.isArray(b.image_plan))return S.response(200,await require('./community-image-edit').edit(event,b,db,row.data));const next=S.validatePost({...row.data,...b},{partial:false});const out=await db.from('community_posts').update({...next,status:'pending',approved_at:null}).eq('id',id);if(out.error)throw out.error;return S.response(200,{ok:true,status:'pending'})}
  if(action==='sold'){if(row.data.category!=='marketplace')throw Object.assign(new Error('사고팔기 게시물만 판매완료할 수 있습니다.'),{status:400});const out=await db.from('community_posts').update({status:'sold',sold_at:new Date().toISOString(),cleanup_after:new Date(Date.now()+7*86400000).toISOString()}).eq('id',id);if(out.error)throw out.error;return S.response(200,{ok:true,status:'sold'})}
  const out=await db.from('community_posts').update({status:'deleted',cleanup_after:L.cleanupAfter()}).eq('id',id);if(out.error)throw out.error;return S.response(200,{ok:true,status:'deleted'});
}
module.exports={post};
