const S=require('./lib/community-security');
const {createHash}=require('node:crypto');

async function recordPublicView(event,db,id){
  const headers=event.headers||{},agent=S.text(headers['user-agent'],500);
  if(headers.origin!=='https://daltownmap.com'||(headers['sec-fetch-site']&&headers['sec-fetch-site']!=='same-origin'))
    return S.response(403,{ok:false});
  if(!agent||/bot\b|crawler|spider|preview|slurp|headless/i.test(agent)||
    /prefetch|prerender|preview/i.test([headers.purpose,headers['sec-purpose']].join(' ')))
    return S.response(200,{ok:true,counted:false});
  if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))
    return S.response(400,{ok:false,error:'Invalid post.'});
  const fingerprint=createHash('sha256').update(`community-view:${S.fingerprint(event)}:${agent}`).digest('hex');
  const result=await db.rpc('community_record_public_view',{p_post:id,p_fingerprint:fingerprint});
  if(result.error)throw result.error;
  if(!result.data)return S.response(404,{ok:false});
  return S.response(200,{ok:true,...result.data});
}

exports.handler=S.handler(async event=>{
  if(event.httpMethod!=='POST')return S.response(405,{ok:false});
  const body=S.parse(event),id=S.text(body.id,80),db=S.client();
  if(body.action==='record_view')return recordPublicView(event,db,id);
  await S.verifyTurnstile(event,body.turnstile_token);
  await S.rateLimit(db,event,'hidden_owner_view',5,900,`post:${id}`);
  const result=await db.from('community_posts')
    .select('id,region,area,category,title,body,author_name,contact_type,contact_value,video_url,video_provider,details,password_hash,status,moderation_reason,created_at,expires_at,community_post_images(id,image_url,sort_order)')
    .eq('id',id).eq('status','hidden').maybeSingle();
  if(result.error)throw result.error;
  if(!result.data||!S.verifyPassword(body.password,result.data.password_hash)){
    // A hidden post's existence and contents are not disclosed to anonymous callers.
    throw Object.assign(new Error('게시글을 확인할 수 없습니다.'),{status:403});
  }
  const {password_hash,moderation_note,community_post_images,...post}=result.data;
  return S.response(200,{ok:true,post:{...post,images:community_post_images||[]}});
});
