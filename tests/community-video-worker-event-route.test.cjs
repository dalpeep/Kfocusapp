const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const net=require('node:net');
const {spawn}=require('node:child_process');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const server=fs.readFileSync(path.join(root,'cloudrun/community-video-staging/server.js'),'utf8');
const dockerfile=fs.readFileSync(path.join(root,'cloudrun/community-video-staging/Dockerfile'),'utf8');

test('worker image includes the route helper imported by server.js',()=>{
  assert.match(dockerfile,/COPY package\.json server\.js worker-event-route\.js \.\//);
});

test('worker accepts only POST on the existing route or exact Eventarc GCS root route',async()=>{
  const {isWorkerEventRoute}=await import('../cloudrun/community-video-staging/worker-event-route.js');
  assert.equal(isWorkerEventRoute('POST','/event'),true);
  assert.equal(isWorkerEventRoute('POST','/?__GCP_CloudEventsMode=GCS_NOTIFICATION'),true);
  for(const [method,url] of [
    ['GET','/event'],['GET','/?__GCP_CloudEventsMode=GCS_NOTIFICATION'],
    ['POST','/'],['POST','/other'],['POST','/event?extra=1'],
    ['POST','/?__GCP_CloudEventsMode=OTHER'],
    ['POST','/?__GCP_CloudEventsMode=GCS_NOTIFICATION&extra=1']
  ])assert.equal(isWorkerEventRoute(method,url),false,`${method} ${url}`);
});

test('route diagnostic reveals only sanitized routing metadata',async()=>{
  const {safeRouteDiagnostic}=await import('../cloudrun/community-video-staging/worker-event-route.js');
  const result=safeRouteDiagnostic('POST',
    '/?__GCP_CloudEventsMode=GCS_NOTIFICATION&private_token=never-log-this','worker',true);
  assert.deepEqual(result,{
    method:'POST',pathname:'/',query_keys:['__GCP_CloudEventsMode','other'],
    eventarc_mode_matches:true,cloud_event_header_present:true,
    service_mode:'worker',raw_route_matches:false
  });
  assert.doesNotMatch(JSON.stringify(result),/private_token|never-log-this/);
  assert.equal(safeRouteDiagnostic('POST','/secret/path?token=value','worker',false).pathname,'other');
});

test('both routes use the same CloudEvent parser and duplicate-event guard',()=>{
  assert.match(server,/if\(!isWorkerEventRoute\(req\.method,req\.url\)\)return json\(res,404/);
  assert.match(server,/const item=req\.headers\['ce-type'\] \? event : \(event\.data\|\|\{\}\)/);
  assert.match(server,/if\(error\.status===404\)return json\(res,200,\{ok:true,duplicate_or_stale:true\}\)/);
  assert.match(server,/if\(!Array\.isArray\(claimed\)\|\|claimed\.length!==1\)\s*return json\(res,200,\{ok:true,duplicate_or_stale:true\}\)/);
});

test('local worker routes Eventarc root and /event POST to the same handler',async()=>{
  const listener=net.createServer();
  await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));
  const port=listener.address().port;
  await new Promise(resolve=>listener.close(resolve));
  const child=spawn(process.execPath,['server.js'],{
    cwd:path.join(root,'cloudrun/community-video-staging'),
    env:{...process.env,PORT:String(port),VIDEO_SERVICE_MODE:'worker',
      YOUTUBE_UPLOAD_ENABLED:'false',COMMUNITY_VIDEO_SITE_ORIGIN:'https://daltownmap.com',
      COMMUNITY_VIDEO_SUPABASE_URL:'https://localtest.supabase.co',
      COMMUNITY_VIDEO_BUCKET:'daltownmap-youtube-video-production',
      COMMUNITY_VIDEO_OBJECT_PREFIX:'production',GOOGLE_CLOUD_PROJECT:'daltownmap-youtube'},
    stdio:'ignore'
  });
  try{
    const base=`http://127.0.0.1:${port}`;
    let ready=false;
    for(let attempt=0;attempt<40;attempt++){
      if(child.exitCode!==null)throw new Error('Local worker exited before route test');
      try{await fetch(`${base}/`,{signal:AbortSignal.timeout(300)});ready=true;break}
      catch{await new Promise(resolve=>setTimeout(resolve,50))}
    }
    assert.equal(ready,true,'Local worker did not start');
    // A non-target bucket exercises routing and CloudEvent parsing without DB,
    // Storage, Eventarc, OAuth, or YouTube calls.
    const event=JSON.stringify({bucket:'local-test-only',name:'test.mp4'});
    for(const route of ['/event','/?__GCP_CloudEventsMode=GCS_NOTIFICATION']){
      const response=await fetch(base+route,{method:'POST',headers:{
        'Content-Type':'application/json','ce-type':'google.cloud.storage.object.v1.finalized'
      },body:event});
      assert.equal(response.status,200,route);
      assert.equal((await response.json()).ignored,true,route);
    }
    for(const [method,route] of [['POST','/'],['POST','/invalid'],['GET','/event']]){
      const response=await fetch(base+route,{method});
      assert.equal(response.status,404,`${method} ${route}`);
    }
  }finally{
    if(child.exitCode===null){
      child.kill();
      await new Promise(resolve=>child.once('exit',resolve));
    }
  }
});

test('duplicate delivery with an already-claimed job ACKs without media processing',async()=>{
  const start=server.indexOf('async function processEvent(req,res){');
  const end=server.indexOf('\nhttp.createServer(',start);
  assert.ok(start>=0&&end>start);
  const jobId='11111111-1111-4111-8111-111111111111';
  const objectId='22222222-2222-4222-8222-222222222222';
  const objectKey=`production/${jobId}/${objectId}.mp4`;
  let claims=0,mediaReads=0,tombstones=0;
  const context={
    BUCKET:'daltownmap-youtube-video-production',OBJECT_PREFIX:'production',uploadEnabled:true,
    MAX_BYTES:150*1024*1024,
    isWorkerEventRoute:(method,url)=>method==='POST'&&url==='/?__GCP_CloudEventsMode=GCS_NOTIFICATION',
    input:async()=>({bucket:'daltownmap-youtube-video-production',name:objectKey}),
    uuid:value=>/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/.test(value),
    storageGet:async(_key,altMedia=false)=>{
      if(altMedia)mediaReads++;
      return {json:async()=>({size:'149900',generation:'1',
        metadata:{'job-id':jobId,'worker-token':'synthetic-only'}})};
    },
    rpc:async name=>{assert.equal(name,'community_video_claim_processing');claims++;return []},
    storageTombstone:async()=>{tombstones++},
    json:(res,status,body)=>{res.status=status;res.body=body}
  };
  const handler=vm.runInNewContext(`${server.slice(start,end)}\nprocessEvent`,context);
  for(let delivery=0;delivery<2;delivery++){
    const response={};
    await handler({method:'POST',url:'/?__GCP_CloudEventsMode=GCS_NOTIFICATION',
      headers:{'ce-type':'google.cloud.storage.object.v1.finalized'}},response);
    assert.equal(response.status,200);
    assert.equal(response.body.duplicate_or_stale,true);
  }
  assert.equal(claims,2);
  assert.equal(mediaReads,0);
  assert.equal(tombstones,0);
});

test('locked worker returns retryable 503 before any DB, GCS, or YouTube work',async()=>{
  const start=server.indexOf('async function processEvent(req,res){');
  const end=server.indexOf('\nhttp.createServer(',start);
  const jobId='11111111-1111-4111-8111-111111111111';
  const objectKey=`production/${jobId}/22222222-2222-4222-8222-222222222222.mp4`;
  let externalCalls=0;
  const forbidden=async()=>{externalCalls++;throw new Error('External call from locked worker')};
  const context={
    BUCKET:'daltownmap-youtube-video-production',OBJECT_PREFIX:'production',uploadEnabled:false,
    isWorkerEventRoute:(method,url)=>method==='POST'&&
      (url==='/event'||url==='/?__GCP_CloudEventsMode=GCS_NOTIFICATION'),
    input:async()=>({bucket:'daltownmap-youtube-video-production',name:objectKey}),
    uuid:value=>/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/.test(value),
    storageGet:forbidden,storageTombstone:forbidden,rpc:forbidden,
    uploadYouTube:forbidden,youtubeAccessToken:forbidden,
    json:(res,status,body)=>{res.status=status;res.body=body}
  };
  const handler=vm.runInNewContext(`${server.slice(start,end)}\nprocessEvent`,context);
  for(const route of ['/event','/?__GCP_CloudEventsMode=GCS_NOTIFICATION']){
    const response={};
    await handler({method:'POST',url:route,headers:{'ce-type':'google.cloud.storage.object.v1.finalized'}},response);
    assert.equal(response.status,503,route);
    assert.equal(response.body.retryable,true,route);
  }
  assert.equal(externalCalls,0);
});
