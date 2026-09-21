const crypto=require('crypto');
const S=require('./lib/community-security');
exports.handler=S.handler(async event=>{
  if(event.httpMethod!=='POST')return S.response(405,{ok:false,error:'Method not allowed.'});
  const body=S.parse(event),db=S.client();await S.verifyTurnstile(event,body.turnstile_token);await S.rateLimit(db,event,'upload',10,3600);
  const category=S.text(body.category,40);if(!S.CATEGORIES.has(category))throw Object.assign(new Error('Invalid category.'),{status:400});
  const files=Array.isArray(body.files)?body.files:[];
  if(files.length<1||files.length>(S.IMAGE_LIMITS[category]||0))throw Object.assign(new Error('이미지 개수 제한을 확인해 주세요.'),{status:400});
  const draftId=S.text(body.draft_id,80)||crypto.randomUUID();if(!/^[0-9a-f-]{36}$/i.test(draftId))throw Object.assign(new Error('Invalid draft.'),{status:400});
  const uploads=[];
  for(const file of files){
    const size=Number(file.byte_size),width=Number(file.width),height=Number(file.height);
    if(file.mime_type!=='image/webp'||!Number.isInteger(size)||size<1||size>1048576||width<1||width>1600||height<1||height>1600)throw Object.assign(new Error('압축 이미지 형식 또는 크기가 올바르지 않습니다.'),{status:400});
    const id=crypto.randomUUID(),path=`community-posts/${draftId}/${id}.webp`;
    const {data,error}=await db.storage.from(S.env().bucket).createSignedUploadUrl(path);if(error)throw error;
    const saved=await db.from('community_upload_drafts').insert({id,draft_id:draftId,region:S.text(body.region||'dallas',40),ip_fingerprint:S.fingerprint(event),storage_path:path,mime_type:'image/webp',byte_size:size,width,height}).select('id').single();if(saved.error)throw saved.error;
    uploads.push({id,path,token:data.token});
  }
  return S.response(200,{ok:true,draft_id:draftId,uploads});
});
