const S=require('./community-security');
const {reviewPost}=require('./community-review');

async function comment(event,action){
  if(event.httpMethod!=='POST')return S.response(405,{ok:false});
  const body=S.parse(event),id=S.text(body.id,80),db=S.client();
  await S.verifyTurnstile(event,body.turnstile_token);
  await S.rateLimit(db,event,'comment_mutate',20,3600,`comment:${id}`);
  const row=await db.from('community_comments')
    .select('id,post_id,password_hash,status').eq('id',id).single();
  if(row.error||!row.data||!['active','hidden'].includes(row.data.status))
    throw Object.assign(new Error('댓글을 찾을 수 없습니다.'),{status:404});
  if(!S.verifyPassword(body.password,row.data.password_hash)){
    await S.rateLimit(db,event,'password_fail',5,900,`comment:${id}`);
    throw Object.assign(new Error('비밀번호가 일치하지 않습니다.'),{status:403});
  }
  let changes={status:'deleted'};
  if(action==='update'){
    const parent=await db.from('community_posts').select('status,category,expires_at')
      .eq('id',row.data.post_id).single();
    if(parent.error||!parent.data||parent.data.status!=='approved'||
      (['marketplace','housing'].includes(parent.data.category)&&parent.data.expires_at&&Date.parse(parent.data.expires_at)<=Date.now()))
      throw Object.assign(new Error('댓글을 수정할 수 없는 게시글입니다.'),{status:400});
    const content=String(body.body??'').trim();
    if(!content||content.length>1500)
      throw Object.assign(new Error('댓글은 1~1500자로 입력해 주세요.'),{status:400});
    const decision=reviewPost({category:'qna',title:'',body:content,author_name:''},{});
    // A previously moderated comment cannot make itself public by editing.
    changes={body:content,status:row.data.status==='hidden'||decision.status!=='approved'?'hidden':'active'};
  }
  const out=await db.from('community_comments').update(changes).eq('id',id)
    .eq('status',row.data.status).eq('password_hash',row.data.password_hash).select('id');
  if(out.error)throw out.error;
  if(out.data?.length!==1)throw Object.assign(new Error('댓글 상태가 변경되었습니다. 다시 확인해 주세요.'),{status:409});
  return S.response(200,{ok:true,status:changes.status});
}
module.exports={comment};
