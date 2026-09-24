const S=require('./lib/community-security');

exports.handler=S.handler(async event=>{
  if(event.httpMethod!=='POST')return S.response(405,{ok:false});
  const body=S.parse(event),id=S.text(body.id,80),db=S.client();
  await S.verifyTurnstile(event,body.turnstile_token);
  await S.rateLimit(db,event,'hidden_owner_view',5,900,`post:${id}`);
  const result=await db.from('community_posts')
    .select('id,region,area,category,title,body,author_name,contact_type,contact_value,password_hash,status,moderation_reason,created_at,expires_at,community_post_images(id,image_url,sort_order)')
    .eq('id',id).eq('status','hidden').maybeSingle();
  if(result.error)throw result.error;
  if(!result.data||!S.verifyPassword(body.password,result.data.password_hash)){
    // A hidden post's existence and contents are not disclosed to anonymous callers.
    throw Object.assign(new Error('게시글을 확인할 수 없습니다.'),{status:403});
  }
  const {password_hash,moderation_note,community_post_images,...post}=result.data;
  return S.response(200,{ok:true,post:{...post,images:community_post_images||[]}});
});
