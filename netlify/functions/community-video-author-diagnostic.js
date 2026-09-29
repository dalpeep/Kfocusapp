const S=require('./lib/community-security');

// Temporary read-only check for the one Production smoke post.
const SMOKE_POST_ID='a04221f7-06b6-448b-a21e-5c89a9dda24f';
const REASON='[community-video-author-diagnostic]';

exports.handler=S.handler(async event=>{
  if(event.httpMethod!=='POST')return S.response(405,{ok:false,error:'Method not allowed.'});
  const headers=event.headers||{};
  if(String(headers.host||'').toLowerCase()!=='daltownmap.com'||
     headers.origin!=='https://daltownmap.com')
    return S.response(404,{ok:false,error:'Unavailable.'});
  if(!/^application\/json(?:\s*;|$)/i.test(String(headers['content-type']||''))||
     !event.body||Buffer.byteLength(event.body,'utf8')>8192)
    return S.response(400,{ok:false,error:'Invalid request.'});
  const body=S.parse(event);
  if(!body||typeof body!=='object'||Array.isArray(body)||
     Object.keys(body).sort().join(',')!=='password,post_id,turnstile_token'||
     body.post_id!==SMOKE_POST_ID||typeof body.password!=='string'||
     typeof body.turnstile_token!=='string')
    return S.response(404,{ok:false,error:'Unavailable.'});

  await S.verifyTurnstile(event,body.turnstile_token);
  // Check only whether the setting exists; never inspect or log its value here.
  if(!Object.hasOwn(process.env,'COMMUNITY_PASSWORD_PEPPER')){
    console.info(REASON,'PASSWORD_CONFIG_MISSING');
    return S.response(200,{ok:false,status:'PASSWORD_CONFIG_MISSING'});
  }

  const row=await S.client().from('community_posts')
    .select('password_hash').eq('id',SMOKE_POST_ID).maybeSingle();
  if(row.error)throw new Error('Author diagnostic lookup failed.');
  const ok=Boolean(row.data)&&S.verifyPassword(body.password,row.data.password_hash);
  const status=ok?'AUTHOR_VERIFICATION_OK':'AUTHOR_VERIFICATION_FAILED';
  console.info(REASON,status);
  return S.response(200,{ok,status});
});
