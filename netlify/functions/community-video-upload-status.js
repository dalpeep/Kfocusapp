const crypto=require('crypto');
const S=require('./lib/community-security');

exports.handler=S.handler(async event=>{
  if(event.httpMethod!=='POST')return S.response(405,{ok:false,error:'Method not allowed.'});
  if(String(event.headers?.host||'').toLowerCase()!==
     'deploy-preview-19--comforting-shortbread-ee588e.netlify.app')
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
