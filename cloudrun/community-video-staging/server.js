import http from 'node:http';
import {createHash,randomBytes} from 'node:crypto';
import {writeFile,unlink} from 'node:fs/promises';
import {spawn} from 'node:child_process';

const PREVIEW='https://deploy-preview-19--comforting-shortbread-ee588e.netlify.app';
const SUPABASE_REF='rhfypnxzlwdyosbszjcv';
const BUCKET='daltownmap-youtube-video-staging';
const MAX_BYTES=150*1024*1024;
const mode=process.env.VIDEO_SERVICE_MODE;
if(!['admission','worker'].includes(mode))throw new Error('VIDEO_SERVICE_MODE is required');
const uploadEnabled=process.env.YOUTUBE_UPLOAD_ENABLED==='true';
if(uploadEnabled&&(!/^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(
  process.env.COMMUNITY_YOUTUBE_OAUTH_CLIENT_ID||'')||mode!=='worker'))
  throw new Error('YouTube upload configuration invalid');

const json=(res,status,data,origin='')=>{
  const headers={'Content-Type':'application/json','Cache-Control':'no-store'};
  if(origin===PREVIEW){headers['Access-Control-Allow-Origin']=PREVIEW;headers.Vary='Origin'}
  res.writeHead(status,headers);res.end(JSON.stringify(data));
};
const sha256=v=>createHash('sha256').update(v).digest('hex');
const uuid=v=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v||''));
async function input(req,max=4096){
  const chunks=[];let bytes=0;
  for await(const chunk of req){bytes+=chunk.length;if(bytes>max)throw new Error('Request too large');chunks.push(chunk)}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
async function publicConfig(){
  const response=await fetch(`${PREVIEW}/.netlify/functions/config`,{headers:{Accept:'application/javascript'}});
  if(!response.ok)throw new Error('Preview config unavailable');
  const text=await response.text();
  const match=text.match(/window\.APP_CONFIG\s*=\s*(\{[^\n]+\});/);
  if(!match)throw new Error('Preview config invalid');
  const cfg=JSON.parse(match[1]);
  if(cfg.SUPABASE_URL!==`https://${SUPABASE_REF}.supabase.co`||!cfg.SUPABASE_ANON_KEY)
    throw new Error('Preview staging project mismatch');
  return cfg;
}
async function rpc(name,body){
  const cfg=await publicConfig();
  const response=await fetch(`${cfg.SUPABASE_URL}/rest/v1/rpc/${name}`,{
    method:'POST',headers:{apikey:cfg.SUPABASE_ANON_KEY,
      Authorization:`Bearer ${cfg.SUPABASE_ANON_KEY}`,
      'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!response.ok)throw new Error(`Staging job RPC failed: ${response.status}`);
  return response.json();
}
async function googleAccessToken(){
  const response=await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
    {headers:{'Metadata-Flavor':'Google'}});
  if(!response.ok)throw new Error('Service identity unavailable');
  const body=await response.json();
  if(!body.access_token)throw new Error('Service identity invalid');
  return body.access_token;
}
async function startResumable(objectKey,byteSize,jobId,workerToken){
  const token=await googleAccessToken();
  const url=`https://storage.googleapis.com/upload/storage/v1/b/${BUCKET}/o?uploadType=resumable&name=${encodeURIComponent(objectKey)}`;
  const response=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,
    'Content-Type':'application/json','X-Upload-Content-Type':'video/mp4',
    'X-Upload-Content-Length':String(byteSize),Origin:PREVIEW},
    body:JSON.stringify({name:objectKey,contentType:'video/mp4',metadata:{job_id:jobId,worker_token:workerToken}})});
  const location=response.headers.get('location');
  if(!response.ok||!location)throw new Error(`Upload session failed: ${response.status}`);
  return location;
}
async function admit(req,res){
  const origin=req.headers.origin||'';
  if(req.method==='OPTIONS'){
    if(origin!==PREVIEW)return json(res,403,{ok:false});
    res.writeHead(204,{'Access-Control-Allow-Origin':PREVIEW,
      'Access-Control-Allow-Methods':'POST, OPTIONS',
      'Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600',Vary:'Origin'});
    return res.end();
  }
  if(req.method!=='POST'||req.url!=='/admit'||origin!==PREVIEW)return json(res,403,{ok:false});
  const body=await input(req);
  if(!uuid(body.job_id)||typeof body.ticket!=='string'||body.ticket.length<40)
    return json(res,400,{ok:false},origin);
  const workerToken=randomBytes(32).toString('base64url');
  const claims=await rpc('community_video_claim_admission',{
    p_job_id:body.job_id,p_ticket:body.ticket,p_worker_token_hash:sha256(workerToken)});
  if(!Array.isArray(claims)||claims.length!==1)return json(res,409,{ok:false,error:'Invalid or consumed ticket.'},origin);
  const claim=claims[0];
  if(!/^staging\/[0-9a-f-]+\/[0-9a-f-]+\.mp4$/.test(claim.object_key)||
     claim.expected_byte_size<1||claim.expected_byte_size>MAX_BYTES)
    throw new Error('Invalid staging reservation');
  let uploadUrl;
  try{uploadUrl=await startResumable(claim.object_key,claim.expected_byte_size,body.job_id,workerToken)}
  catch(error){await rpc('community_video_fail_admission',{
      p_job_id:body.job_id,p_worker_token:workerToken}).catch(()=>{});throw error}
  return json(res,200,{ok:true,upload_url:uploadUrl,job_id:body.job_id,
    byte_size:claim.expected_byte_size},origin);
}
async function storageGet(objectKey,altMedia=false){
  const token=await googleAccessToken();
  const url=`https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${encodeURIComponent(objectKey)}`+
    (altMedia?'?alt=media':'');
  const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`}});
  if(!response.ok){const error=new Error(`Staging object read failed: ${response.status}`);
    error.status=response.status;throw error}
  return response;
}
async function storageDelete(objectKey){
  const token=await googleAccessToken();
  const response=await fetch(`https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${encodeURIComponent(objectKey)}`,
    {method:'DELETE',headers:{Authorization:`Bearer ${token}`}});
  if(!response.ok&&response.status!==404)throw new Error(`Staging object cleanup failed: ${response.status}`);
}
async function readSecret(name){
  if(!['daltownmap-youtube-client-secret','daltownmap-youtube-refresh-token'].includes(name))
    throw new Error('Secret name denied');
  const token=await googleAccessToken();
  const response=await fetch(`https://secretmanager.googleapis.com/v1/projects/daltownmap-youtube/secrets/${name}/versions/latest:access`,
    {headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error('Secret access unavailable');
  const body=await response.json();
  if(!body.payload?.data)throw new Error('Secret payload unavailable');
  return Buffer.from(body.payload.data,'base64').toString('utf8').trim();
}
async function youtubeAccessToken(){
  const [clientSecret,refreshToken]=await Promise.all([
    readSecret('daltownmap-youtube-client-secret'),
    readSecret('daltownmap-youtube-refresh-token')]);
  const response=await fetch('https://oauth2.googleapis.com/token',{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({client_id:process.env.COMMUNITY_YOUTUBE_OAUTH_CLIENT_ID,
      client_secret:clientSecret,refresh_token:refreshToken,grant_type:'refresh_token'}),
    signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error('YouTube token refresh unavailable');
  const body=await response.json();
  if(!body.access_token||
     (body.scope&&!body.scope.split(/\s+/).includes('https://www.googleapis.com/auth/youtube.upload')))
    throw new Error('YouTube upload scope unavailable');
  return body.access_token;
}
async function uploadYouTube(data,jobId){
  const token=await youtubeAccessToken();
  const metadata={snippet:{title:`CMT-STAGING-PHASE2-${jobId} - DELETE`,
    description:'Temporary isolated staging API upload test. Safe to delete.'},
    status:{privacyStatus:'unlisted'}};
  const start=await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',{
    method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json; charset=UTF-8',
      'X-Upload-Content-Length':String(data.length),'X-Upload-Content-Type':'video/mp4'},
    body:JSON.stringify(metadata),signal:AbortSignal.timeout(15000)});
  const session=start.headers.get('location');
  if(!start.ok||!session||!session.startsWith('https://www.googleapis.com/'))
    throw new Error('YouTube session unavailable');
  // Exactly one media PUT. Never retry an ambiguous response or Eventarc delivery.
  const uploaded=await fetch(session,{method:'PUT',headers:{Authorization:`Bearer ${token}`,
    'Content-Type':'video/mp4','Content-Length':String(data.length)},body:data,
    signal:AbortSignal.timeout(240000)});
  if(!uploaded.ok)throw new Error('YouTube insert response uncertain');
  const result=await uploaded.json();
  if(!/^[A-Za-z0-9_-]{11}$/.test(result.id||''))
    throw new Error('YouTube insert identity uncertain');
  let actual='unknown';
  try{
    const check=await fetch(`https://www.googleapis.com/youtube/v3/videos?part=status&id=${encodeURIComponent(result.id)}`,
      {headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)});
    if(check.ok){const body=await check.json();
      actual=body.items?.[0]?.status?.privacyStatus||'unknown'}
  }catch{}
  return{id:result.id,privacy:actual};
}
function ffprobe(path){
  return new Promise((resolve,reject)=>{
    const child=spawn('ffprobe',['-v','error','-show_entries',
      'format=format_name,duration:stream=codec_type,codec_name','-of','json',path],
      {stdio:['ignore','pipe','ignore']});
    const chunks=[];let size=0;
    child.stdout.on('data',chunk=>{size+=chunk.length;if(size<65536)chunks.push(chunk)});
    child.on('error',reject);
    child.on('close',code=>{
      if(code!==0||size>=65536)return reject(new Error('Invalid video format'));
      try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))}catch{reject(new Error('Invalid probe output'))}
    });
  });
}
function validVideo(probe){
  const streams=Array.isArray(probe.streams)?probe.streams:[];
  const video=streams.filter(s=>s.codec_type==='video');
  const audio=streams.filter(s=>s.codec_type==='audio');
  const duration=Number(probe.format?.duration);
  return String(probe.format?.format_name||'').split(',').includes('mp4')&&
    video.length===1&&video[0].codec_name==='h264'&&
    audio.length===1&&audio[0].codec_name==='aac'&&
    Number.isFinite(duration)&&duration>0&&duration<=90;
}
async function processEvent(req,res){
  if(req.method!=='POST'||req.url!=='/event')return json(res,404,{ok:false});
  // Eventarc sends CloudEvents in binary HTTP mode: the body is StorageObjectData.
  // Keep structured mode support for local contract tests.
  const event=await input(req,16384);
  const item=req.headers['ce-type'] ? event : (event.data||{});
  if(item.bucket!==BUCKET||!/^staging\/[0-9a-f-]+\/[0-9a-f-]+\.mp4$/.test(item.name||''))
    return json(res,200,{ok:true,ignored:true});
  const jobId=item.name.split('/')[1];
  if(!uuid(jobId))return json(res,200,{ok:true,ignored:true});
  let meta;
  try{meta=await (await storageGet(item.name)).json()}
  catch(error){
    // A duplicate finalized event can arrive after the successful worker has
    // already removed its temporary object. Ack it instead of retrying forever.
    if(error.status===404)return json(res,200,{ok:true,duplicate_or_stale:true});
    throw error;
  }
  const workerToken=meta.metadata?.worker_token;
  const actualSize=Number(meta.size);
  if(meta.metadata?.job_id!==jobId||typeof workerToken!=='string'||
     !Number.isSafeInteger(actualSize)||actualSize<1||actualSize>MAX_BYTES)
    return json(res,200,{ok:true,ignored:true});
  const claimed=await rpc('community_video_claim_processing',{
    p_job_id:jobId,p_worker_token:workerToken,p_object_key:item.name,
    p_actual_byte_size:actualSize});
  if(!Array.isArray(claimed)||claimed.length!==1)
    return json(res,200,{ok:true,duplicate_or_stale:true});
  const lock=claimed[0].processing_lock;
  const temp=`/tmp/${jobId}.mp4`;
  let result='validation_failed',video=null;
  try{
    const media=await storageGet(item.name,true);
    const data=Buffer.from(await media.arrayBuffer());
    if(data.length!==actualSize)throw new Error('Object size mismatch');
    await writeFile(temp,data,{flag:'wx'});
    const probe=await ffprobe(temp);
    if(validVideo(probe)){
      if(uploadEnabled){
        result='upload_uncertain';
        try{video=await uploadYouTube(data,jobId);
          result=video.privacy==='unlisted'?'uploaded':'needs_review'}catch{}
      }else result='dry_run_ready';
    }else result='invalid_format';
  }catch{result='validation_failed'}
  finally{await unlink(temp).catch(()=>{})}
  const finished=uploadEnabled&&['uploaded','needs_review','upload_uncertain'].includes(result)
    ?await rpc('community_video_finish_upload',{
      p_job_id:jobId,p_worker_token:workerToken,p_processing_lock:lock,
      p_video_id:video?.id||null,p_privacy_status:video?.privacy||null,
      p_result:result==='uploaded'?'uploaded':'needs_review'})
    :await rpc('community_video_finish_dry_run',{
      p_job_id:jobId,p_worker_token:workerToken,p_processing_lock:lock,p_result});
  if(finished!==true)throw new Error('Staging job finish failed');
  await storageDelete(item.name);
  return json(res,200,{ok:true,dry_run:!uploadEnabled,result});
}
http.createServer(async(req,res)=>{
  try{if(mode==='admission')await admit(req,res);else await processEvent(req,res)}
  catch(error){console.error('[community-video-staging]',error.message);
    json(res,500,{ok:false,error:'Staging video request failed.'},req.headers.origin||'')}
}).listen(Number(process.env.PORT||8080),'0.0.0.0');
