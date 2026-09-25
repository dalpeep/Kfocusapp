const crypto=require('crypto');
const S=require('./lib/community-security');

const MAX_BYTES=150*1024*1024;
const STAGING_ORIGIN='https://deploy-preview-19--comforting-shortbread-ee588e.netlify.app';

exports.handler=S.handler(async event=>{
  if(event.httpMethod!=='POST')return S.response(405,{ok:false,error:'Method not allowed.'});
  // This endpoint cannot be used on Production or on another Preview.
  if(String(event.headers?.host||'').toLowerCase()!==new URL(STAGING_ORIGIN).host)
    return S.response(404,{ok:false,error:'Unavailable.'});
  const body=S.parse(event);
  const postId=String(body.post_id||'');
  const byteSize=Number(body.byte_size);
  if(!/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(postId)||
     !Number.isSafeInteger(byteSize)||byteSize<1||byteSize>MAX_BYTES||
     body.mime_type!=='video/mp4')
    return S.response(400,{ok:false,error:'MP4 파일은 최대 150 MiB까지 업로드할 수 있습니다.'});
  const admissionUrl=String(process.env.COMMUNITY_VIDEO_ADMISSION_STAGING_URL||'');
  let admissionHost='',normalizedAdmissionUrl='';
  try{const parsed=new URL(admissionUrl);if(parsed.protocol==='https:'&&
      !parsed.username&&!parsed.password&&!parsed.port&&parsed.pathname==='/'&&
      !parsed.search&&!parsed.hash){admissionHost=parsed.hostname;
        normalizedAdmissionUrl=parsed.origin+'/'}}catch{}
  if(!admissionHost.startsWith('community-video-admission-staging-')||
     !admissionHost.endsWith('.run.app'))
    return S.response(503,{ok:false,error:'Staging video service unavailable.'});

  const db=S.client();
  await S.verifyTurnstile(event,body.turnstile_token);
  await S.rateLimit(db,event,'video_upload_admit',3,3600,postId);
  const row=await db.from('community_posts')
    .select('id,category,status,password_hash,video_url,video_provider')
    .eq('id',postId).maybeSingle();
  if(row.error)throw row.error;
  const post=row.data;
  if(!post||!['marketplace','housing'].includes(post.category)||
     !['pending','approved'].includes(post.status)||post.video_url||post.video_provider||
     !S.verifyPassword(body.password,post.password_hash))
    return S.response(403,{ok:false,error:'게시글 또는 비밀번호를 확인해 주세요.'});

  const jobId=crypto.randomUUID(),objectId=crypto.randomUUID();
  const ticket=crypto.randomBytes(32).toString('base64url');
  const now=Date.now();
  const inserted=await db.from('community_video_upload_jobs').insert({
    id:jobId,post_id:postId,object_id:objectId,
    object_key:`staging/${jobId}/${objectId}.mp4`,
    expected_byte_size:byteSize,
    ticket_hash:crypto.createHash('sha256').update(ticket).digest('hex'),
    expires_at:new Date(now+10*60*1000).toISOString(),
    cleanup_after:new Date(now+8*86400000).toISOString()
  }).select('id').single();
  if(inserted.error){
    if(inserted.error.code==='23505')return S.response(409,{ok:false,error:'이 게시글에는 이미 진행 중인 영상이 있습니다.'});
    throw inserted.error;
  }
  return S.response(201,{ok:true,job_id:jobId,ticket,admission_url:normalizedAdmissionUrl,
    expires_in_seconds:600});
});
