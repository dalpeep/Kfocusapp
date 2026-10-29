const S=require('./lib/community-security');
exports.handler=S.handler(async event=>{
  if(event.httpMethod!=='POST')return S.response(405,{ok:false});
  const b=S.parse(event),db=S.client(),id=S.text(b.id,80);await S.verifyTurnstile(event,b.turnstile_token);
  const row=await db.from('community_comments').select('id,password_hash').eq('id',id).single();if(row.error)throw Object.assign(new Error('댓글을 찾을 수 없습니다.'),{status:404});
  if(!S.verifyPassword(b.password,row.data.password_hash)){await S.rateLimit(db,event,'password_fail',5,900,`comment:${id}`);throw Object.assign(new Error('비밀번호가 일치하지 않습니다.'),{status:403})}
  const out=await db.from('community_comments').update({status:'deleted'}).eq('id',id);if(out.error)throw out.error;
  return S.response(200,{ok:true});
});
