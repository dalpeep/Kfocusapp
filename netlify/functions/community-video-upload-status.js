const crypto=require('crypto');
const S=require('./lib/community-security');

exports.handler=S.handler(async event=>{
  if(event.httpMethod!=='POST')return S.response(405,{ok:false,error:'Method not allowed.'});
  let configuredHost='';
  try{const origin=new URL(process.env.COMMUNITY_VIDEO_UPLOAD_ORIGIN||'');if(origin.protocol==='https:'&&!origin.username&&!origin.password&&!origin.port&&origin.pathname==='/'&&!origin.search&&!origin.hash)configuredHost=origin.host}catch{}
  if(process.env.COMMUNITY_VIDEO_UPLOAD_ADMISSION_ENABLED!=='true'||
     String(event.headers?.host||'').toLowerCase()!==configuredHost)
    return S.response(404,{ok:false,error:'Unavailable.'});
  const body=S.parse(event);
  const ticket=String(body.ticket||'');
  const jobId=String(body.job_id||'');
  if(ticket.length<40||ticket.length>128||
     !/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(jobId))
    return S.response(400,{ok:false,error:'Invalid request.'});
  const hash=crypto.createHash('sha256').update(ticket).digest('hex');
  const result=await S.client().from('community_video_upload_jobs')
    .select('status,error_category,updated_at')
    .eq('id',jobId).eq('ticket_hash',hash).maybeSingle();
  if(result.error)throw result.error;
  if(!result.data)return S.response(404,{ok:false,error:'Not found.'});
  return S.response(200,{ok:true,...result.data});
});
