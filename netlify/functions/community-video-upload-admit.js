const crypto=require('crypto');
const S=require('./lib/community-security');

const MAX_BYTES=150*1024*1024;
// Temporary Production smoke gate. Remove immediately after the one-post test.
const SMOKE_POST_ID='6614c2d2-f806-4c4a-91c1-e1cdc715f99d';
const SMOKE_ADMISSION_URL='https://community-video-admission-production-729709801821.us-central1.run.app/';
const uploadOrigin=()=>String(process.env.COMMUNITY_VIDEO_UPLOAD_ORIGIN||'');
const uploadPrefix=()=>String(process.env.COMMUNITY_VIDEO_OBJECT_PREFIX||'');

exports.handler=S.handler(async event=>{
  if(event.httpMethod!=='POST')return S.response(405,{ok:false,error:'Method not allowed.'});
  let configuredHost='';
  try{const origin=new URL(uploadOrigin());if(origin.protocol==='https:'&&!origin.username&&!origin.password&&!origin.port&&origin.pathname==='/'&&!origin.search&&!origin.hash)configuredHost=origin.host}catch{}
  const requestHost=String(event.headers?.host||'').toLowerCase();
  const normalAdmission=process.env.COMMUNITY_VIDEO_UPLOAD_ADMISSION_ENABLED==='true'&&
    requestHost===configuredHost;
  const smokeAdmission=requestHost==='daltownmap.com';
  if(!normalAdmission&&!smokeAdmission)
    return S.response(404,{ok:false,error:'Unavailable.'});
  const body=S.parse(event);
  const postId=String(body.post_id||'');
  if(smokeAdmission&&postId!==SMOKE_POST_ID)
    return S.response(404,{ok:false,error:'Unavailable.'});
  const byteSize=Number(body.byte_size);
  if(!/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(postId)||
     !Number.isSafeInteger(byteSize)||byteSize<1||byteSize>MAX_BYTES||
     body.mime_type!=='video/mp4')
    return S.response(400,{ok:false,error:'MP4 파일은 최대 150 MiB까지 업로드할 수 있습니다.'});
  const admissionUrl=smokeAdmission?SMOKE_ADMISSION_URL:
    String(process.env.COMMUNITY_VIDEO_ADMISSION_URL||'');
  let admissionHost='',normalizedAdmissionUrl='';
  try{const parsed=new URL(admissionUrl);if(parsed.protocol==='https:'&&
      !parsed.username&&!parsed.password&&!parsed.port&&parsed.pathname==='/'&&
      !parsed.search&&!parsed.hash){admissionHost=parsed.hostname;
        normalizedAdmissionUrl=parsed.origin+'/'}}catch{}
  if((!smokeAdmission&&!/^community-video-admission-(staging|production)-[a-z0-9-]+\.run\.app$/.test(admissionHost))||
     (smokeAdmission&&normalizedAdmissionUrl!==SMOKE_ADMISSION_URL)||
     (!smokeAdmission&&!/^(staging|production)$/.test(uploadPrefix())))
    return S.response(503,{ok:false,error:'Video service unavailable.'});
  const objectPrefix=smokeAdmission?'production':uploadPrefix();

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
    object_key:`${objectPrefix}/${jobId}/${objectId}.mp4`,
    expected_byte_size:byteSize,
    ticket_hash:crypto.createHash('sha256').update(ticket).digest('hex'),
    expires_at:new Date(now+10*60*1000).toISOString(),
    cleanup_after:new Date(now+8*86400000).toISOString()
  }).select('id').single();
  if(inserted.error){
    if(inserted.error.code==='23505')return S.response(409,{ok:false,error:'이 게시글에는 이미 진행 중인 영상이 있습니다.'});
    throw inserted.error;
  }
  return S.response(201,{ok:true,job_id:jobId,post_id:postId,ticket,admission_url:normalizedAdmissionUrl,
    expires_in_seconds:600});
});
