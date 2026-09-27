import http from 'node:http';
import {createHash,randomBytes} from 'node:crypto';
import {writeFile,unlink} from 'node:fs/promises';
import {spawn} from 'node:child_process';

const SITE_ORIGIN=process.env.COMMUNITY_VIDEO_SITE_ORIGIN||'';
const SUPABASE_URL=process.env.COMMUNITY_VIDEO_SUPABASE_URL||'';
const BUCKET=process.env.COMMUNITY_VIDEO_BUCKET||'';
const OBJECT_PREFIX=process.env.COMMUNITY_VIDEO_OBJECT_PREFIX||'';
const GOOGLE_PROJECT=process.env.GOOGLE_CLOUD_PROJECT||'';
for(const [name,value] of Object.entries({COMMUNITY_VIDEO_SITE_ORIGIN:SITE_ORIGIN,
  COMMUNITY_VIDEO_SUPABASE_URL:SUPABASE_URL,COMMUNITY_VIDEO_BUCKET:BUCKET,
  COMMUNITY_VIDEO_OBJECT_PREFIX:OBJECT_PREFIX,GOOGLE_CLOUD_PROJECT:GOOGLE_PROJECT}))
  if(!value)throw new Error(`${name} is required`);
const site=new URL(SITE_ORIGIN),database=new URL(SUPABASE_URL);
if(site.protocol!=='https:'||site.origin!==SITE_ORIGIN||site.username||site.password||site.port||
   database.protocol!=='https:'||database.origin!==SUPABASE_URL||
   !/^[a-z0-9]+\.supabase\.co$/.test(database.hostname)||
   !/^(staging|production)$/.test(OBJECT_PREFIX)||
   !/^daltownmap-youtube-video-(staging|production)$/.test(BUCKET)||
   BUCKET!==`daltownmap-youtube-video-${OBJECT_PREFIX}`)
  throw new Error('Video deployment configuration invalid');
const MAX_BYTES=150*1024*1024;
const SIGNED_UPLOAD_TTL_SECONDS=900;
const mode=process.env.VIDEO_SERVICE_MODE;
if(!['admission','worker'].includes(mode))throw new Error('VIDEO_SERVICE_MODE is required');
const uploadEnabled=process.env.YOUTUBE_UPLOAD_ENABLED==='true';
if(uploadEnabled&&(!/^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(
  process.env.COMMUNITY_YOUTUBE_OAUTH_CLIENT_ID||'')||mode!=='worker'))
  throw new Error('YouTube upload configuration invalid');

const json=(res,status,data,origin='')=>{
  const headers={'Content-Type':'application/json','Cache-Control':'no-store'};
  if(origin===SITE_ORIGIN){headers['Access-Control-Allow-Origin']=SITE_ORIGIN;headers.Vary='Origin'}
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
  const response=await fetch(`${SITE_ORIGIN}/.netlify/functions/config`,{headers:{Accept:'application/javascript'}});
  if(!response.ok)throw new Error('Site config unavailable');
  const text=await response.text();
  const match=text.match(/window\.APP_CONFIG\s*=\s*(\{[^\n]+\});/);
  if(!match)throw new Error('Site config invalid');
  const cfg=JSON.parse(match[1]);
  if(cfg.SUPABASE_URL!==SUPABASE_URL||!cfg.SUPABASE_ANON_KEY)
    throw new Error('Site database project mismatch');
  return cfg;
}
async function rpc(name,body){
  const cfg=await publicConfig();
  const response=await fetch(`${cfg.SUPABASE_URL}/rest/v1/rpc/${name}`,{
    method:'POST',headers:{apikey:cfg.SUPABASE_ANON_KEY,
      Authorization:`Bearer ${cfg.SUPABASE_ANON_KEY}`,
      'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!response.ok)throw new Error(`Video job RPC failed: ${response.status}`);
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
async function signedPut(objectKey,jobId,workerToken){
  const token=await googleAccessToken();
  const identity=await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email',
    {headers:{'Metadata-Flavor':'Google'}});
  if(!identity.ok)throw new Error('Signing identity unavailable');
  const email=(await identity.text()).trim();
  if(email!==`community-video-admission-${OBJECT_PREFIX==='staging'?'stg':'prod'}@${GOOGLE_PROJECT}.iam.gserviceaccount.com`)
    throw new Error('Signing identity invalid');
  const date=new Date().toISOString().replace(/[-:]|\.\d{3}/g,'');
  const day=date.slice(0,8),credential=`${email}/${day}/auto/storage/goog4_request`;
  const headers={
    'content-type':'video/mp4',
    'x-goog-content-length-range':`1,${MAX_BYTES}`,
    'x-goog-if-generation-match':'0',
    'x-goog-meta-job-id':jobId,
    'x-goog-meta-worker-token':workerToken
  };
  const signedHeaders=['host',...Object.keys(headers)].sort();
  const query=new URLSearchParams({
    'X-Goog-Algorithm':'GOOG4-RSA-SHA256',
    'X-Goog-Credential':credential,
    'X-Goog-Date':date,
    'X-Goog-Expires':String(SIGNED_UPLOAD_TTL_SECONDS),
    'X-Goog-SignedHeaders':signedHeaders.join(';')
  });
  const canonicalQuery=[...query].sort(([a],[b])=>a.localeCompare(b))
    .map(([key,value])=>`${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&');
  const path=`/${BUCKET}/${objectKey.split('/').map(encodeURIComponent).join('/')}`;
  const canonicalHeaders=signedHeaders.map(name=>`${name}:${name==='host'?'storage.googleapis.com':headers[name]}\n`).join('');
  const canonicalRequest=`PUT\n${path}\n${canonicalQuery}\n${canonicalHeaders}\n${signedHeaders.join(';')}\nUNSIGNED-PAYLOAD`;
  const scope=`${day}/auto/storage/goog4_request`;
  const stringToSign=`GOOG4-RSA-SHA256\n${date}\n${scope}\n${sha256(canonicalRequest)}`;
  const signed=await fetch(`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${email}:signBlob`,{
    method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify({payload:Buffer.from(stringToSign).toString('base64')})});
  if(!signed.ok)throw new Error(`Upload signing failed: ${signed.status}`);
  const signature=Buffer.from((await signed.json()).signedBlob||'','base64').toString('hex');
  if(!signature)throw new Error('Upload signing unavailable');
  return{url:`https://storage.googleapis.com${path}?${canonicalQuery}&X-Goog-Signature=${signature}`,
    headers:Object.fromEntries(Object.entries(headers).filter(([name])=>name!=='content-type'))};
}
async function admit(req,res){
  const origin=req.headers.origin||'';
  if(req.method==='OPTIONS'){
    if(origin!==SITE_ORIGIN)return json(res,403,{ok:false});
    res.writeHead(204,{'Access-Control-Allow-Origin':SITE_ORIGIN,
      'Access-Control-Allow-Methods':'POST, OPTIONS',
      'Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600',Vary:'Origin'});
    return res.end();
  }
  if(req.method!=='POST'||req.url!=='/admit'||origin!==SITE_ORIGIN)return json(res,403,{ok:false});
  const body=await input(req);
  if(!uuid(body.job_id)||typeof body.ticket!=='string'||body.ticket.length<40)
    return json(res,400,{ok:false},origin);
  const workerToken=randomBytes(32).toString('base64url');
  const claims=await rpc('community_video_claim_admission',{
    p_job_id:body.job_id,p_ticket:body.ticket,p_worker_token_hash:sha256(workerToken)});
  if(!Array.isArray(claims)||claims.length!==1)return json(res,409,{ok:false,error:'Invalid or consumed ticket.'},origin);
  const claim=claims[0];
  if(!new RegExp(`^${OBJECT_PREFIX}/[0-9a-f-]+/[0-9a-f-]+\\.mp4$`).test(claim.object_key)||
     claim.expected_byte_size<1||claim.expected_byte_size>MAX_BYTES)
    throw new Error('Invalid video reservation');
  let upload;
  try{upload=await signedPut(claim.object_key,body.job_id,workerToken)}
  catch(error){await rpc('community_video_fail_admission',{
      p_job_id:body.job_id,p_worker_token:workerToken}).catch(()=>{});throw error}
  return json(res,200,{ok:true,upload_url:upload.url,upload_headers:upload.headers,job_id:body.job_id,
    byte_size:claim.expected_byte_size},origin);
}
async function storageGet(objectKey,altMedia=false){
  const token=await googleAccessToken();
  const url=`https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${encodeURIComponent(objectKey)}`+
    (altMedia?'?alt=media':'');
  const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`}});
  if(!response.ok){const error=new Error(`Video object read failed: ${response.status}`);
    error.status=response.status;throw error}
  return response;
}
async function storageDelete(objectKey){
  const token=await googleAccessToken();
  const response=await fetch(`https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${encodeURIComponent(objectKey)}`,
    {method:'DELETE',headers:{Authorization:`Bearer ${token}`}});
  if(!response.ok&&response.status!==404)throw new Error(`Video object cleanup failed: ${response.status}`);
}
async function storageTombstone(objectKey,generation){
  if(!/^\d+$/.test(String(generation||'')))throw new Error('Object generation unavailable');
  const token=await googleAccessToken();
  // Atomic replacement removes the video bytes while retaining a live object
  // until lifecycle cleanup. A signed PUT with generation-match:0 cannot replay.
  const url=`https://storage.googleapis.com/upload/storage/v1/b/${BUCKET}/o?uploadType=media&name=${encodeURIComponent(objectKey)}&ifGenerationMatch=${generation}`;
  const response=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,
    'Content-Type':'application/octet-stream','Content-Length':'0'},body:''});
  if(!response.ok)throw new Error(`Video tombstone failed: ${response.status}`);
}
async function readSecret(name){
  if(!['daltownmap-youtube-client-secret','daltownmap-youtube-refresh-token'].includes(name))
    throw new Error('Secret name denied');
  const token=await googleAccessToken();
  const response=await fetch(`https://secretmanager.googleapis.com/v1/projects/${GOOGLE_PROJECT}/secrets/${name}/versions/latest:access`,
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
     (body.scope&&!['https://www.googleapis.com/auth/youtube.upload',
       'https://www.googleapis.com/auth/youtube.readonly'].every(scope=>body.scope.split(/\s+/).includes(scope))))
    throw new Error('YouTube dual scope unavailable');
  return body.access_token;
}
async function uploadYouTube(data,jobId){
  const token=await youtubeAccessToken();
  const metadata={snippet:{title:OBJECT_PREFIX==='staging'
    ?`DaltownMap Community Video E2E STAGING - DELETE (${jobId})`
    :`DaltownMap Community Video (${jobId})`,
    description:OBJECT_PREFIX==='staging'?'Temporary isolated staging API upload test. Safe to delete.':'DaltownMap Community video.'},
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
  if(item.bucket!==BUCKET||!new RegExp(`^${OBJECT_PREFIX}/[0-9a-f-]+/[0-9a-f-]+\\.mp4$`).test(item.name||''))
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
  // XML signed PUT normalizes custom metadata keys with hyphens; the older
  // JSON resumable path used underscores. Accept both during staging cutover.
  const workerToken=meta.metadata?.['worker-token']||meta.metadata?.worker_token;
  const actualSize=Number(meta.size);
  if((meta.metadata?.['job-id']||meta.metadata?.job_id)!==jobId||typeof workerToken!=='string'||
     !Number.isSafeInteger(actualSize)||actualSize<1)
    return json(res,200,{ok:true,ignored:true});
  if(actualSize>MAX_BYTES){
    await rpc('community_video_fail_admission',{p_job_id:jobId,p_worker_token:workerToken});
    await storageTombstone(item.name,meta.generation);
    return json(res,200,{ok:true,result:'oversize_rejected'});
  }
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
  if(finished!==true)throw new Error('Video job finish failed');
  await storageTombstone(item.name,meta.generation);
  return json(res,200,{ok:true,dry_run:!uploadEnabled,result});
}
http.createServer(async(req,res)=>{
  try{if(mode==='admission')await admit(req,res);else await processEvent(req,res)}
  catch(error){console.error('[community-video]',error.message);
    json(res,500,{ok:false,error:'Video request failed.'},req.headers.origin||'')}
}).listen(Number(process.env.PORT||8080),'0.0.0.0');
