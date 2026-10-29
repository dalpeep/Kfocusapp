const S=require('./lib/community-security');
const productionConfig=require('./lib/community-video-production-config');

// Only a failed, ticketed MP4 job can be retried. Never expose job IDs,
// object keys, tickets, or private posts to the public detail page.
function retryableJobs(jobs){
  return jobs.length>0&&jobs.every(job=>job.status==='failed'&&!job.youtube_video_id);
}

exports.handler=S.handler(async event=>{
  if(event.httpMethod!=='POST')return S.response(405,{ok:false,error:'Method not allowed.'});
  if(!productionConfig.forRequest(event))return S.response(404,{ok:false,error:'Unavailable.'});
  const id=String(S.parse(event).post_id||'');
  if(!/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(id))
    return S.response(400,{ok:false,error:'Invalid request.'});
  const db=S.client();
  const post=await db.from('community_posts')
    .select('id,category,status,video_url,video_provider').eq('id',id).maybeSingle();
  if(post.error)throw post.error;
  if(!post.data||!['marketplace','housing'].includes(post.data.category)||
     post.data.status!=='approved'||post.data.video_url||post.data.video_provider)
    return S.response(200,{ok:true,retryable:false});
  const jobs=await db.from('community_video_upload_jobs')
    .select('status,youtube_video_id').eq('post_id',id);
  if(jobs.error)throw jobs.error;
  return S.response(200,{ok:true,retryable:retryableJobs(jobs.data||[])});
});

exports.retryableJobs=retryableJobs;
