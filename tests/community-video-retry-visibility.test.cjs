const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const S=require('../netlify/functions/lib/community-security');
const availability=require('../netlify/functions/community-video-retry-availability');

const siteId='e2667e40-0999-42a3-892b-2b2edff61434';
const id='05618ea9-85d5-4078-b169-05325c4eee83';
const event=(postId=id)=>({httpMethod:'POST',headers:{host:'daltownmap.com'},body:JSON.stringify({post_id:postId})});
const result=response=>JSON.parse(response.body);

test('only a real failed MP4 job without another unresolved job is retryable',()=>{
  const canRetry=availability.retryableJobs;
  assert.equal(canRetry([]),false);
  for(const status of ['pending','uploading','processing','uploaded','needs_review'])
    assert.equal(canRetry([{status,youtube_video_id:null}]),false,status);
  assert.equal(canRetry([{status:'failed',youtube_video_id:null}]),true);
  assert.equal(canRetry([{status:'failed',youtube_video_id:'video-id'}]),false);
  assert.equal(canRetry([{status:'failed',youtube_video_id:null},{status:'processing',youtube_video_id:null}]),false);
  assert.equal(canRetry([{status:'failed',youtube_video_id:null},{status:'failed',youtube_video_id:null}]),true);
});

test('availability is production-only and validates post ID before database access',async()=>{
  const previous=process.env.SITE_ID;
  try{
    process.env.SITE_ID='other-site';
    assert.equal((await availability.handler(event())).statusCode,404);
    process.env.SITE_ID=siteId;
    assert.equal((await availability.handler(event('bad-id'))).statusCode,400);
    assert.equal((await availability.handler({...event(),httpMethod:'GET'})).statusCode,405);
  }finally{if(previous===undefined)delete process.env.SITE_ID;else process.env.SITE_ID=previous}
});

test('public detail availability exposes only a boolean for approved marketplace and housing',async()=>{
  const previousId=process.env.SITE_ID,previousClient=S.client;
  process.env.SITE_ID=siteId;
  let post={id,category:'marketplace',status:'approved',video_url:null,video_provider:null};
  let jobs=[];let queriedJobs=0;
  S.client=()=>({from:table=>{
    if(table==='community_posts')return{select:()=>({eq:()=>({maybeSingle:async()=>({data:post,error:null})})})};
    if(table==='community_video_upload_jobs')return{select:()=>({eq:async()=>{queriedJobs++;return{data:jobs,error:null}}})};
    throw new Error('Unexpected table');
  }});
  try{
    for(const category of ['marketplace','housing']){
      post={...post,category};
      jobs=[];
      assert.equal(result(await availability.handler(event())).retryable,false);
      jobs=[{status:'failed',youtube_video_id:null,object_key:'secret-object',ticket_hash:'secret-ticket'}];
      const response=result(await availability.handler(event()));
      assert.deepEqual(response,{ok:true,retryable:true});
      for(const status of ['pending','uploading','processing','uploaded','needs_review']){
        jobs=[{status,youtube_video_id:null}];
        assert.equal(result(await availability.handler(event())).retryable,false,status);
      }
      jobs=[{status:'failed',youtube_video_id:null}];
      post={...post,video_url:'https://www.youtube.com/watch?v=video-id',video_provider:'youtube'};
      const before=queriedJobs;
      assert.equal(result(await availability.handler(event())).retryable,false);
      assert.equal(queriedJobs,before);
      post={...post,video_url:null,video_provider:null};
    }
    for(const status of ['sold','pending','deleted']){
      post={...post,status};
      assert.equal(result(await availability.handler(event())).retryable,false);
    }
  }finally{
    S.client=previousClient;
    if(previousId===undefined)delete process.env.SITE_ID;else process.env.SITE_ID=previousId;
  }
});

test('detail UI asks the availability endpoint before adding retry, while retry authorization is unchanged',()=>{
  const ui=fs.readFileSync(path.join(__dirname,'../assets/community.js'),'utf8');
  const admit=fs.readFileSync(path.join(__dirname,'../netlify/functions/community-video-upload-admit.js'),'utf8');
  const gate=ui.indexOf("availability=await api('community-video-retry-availability',{post_id:id})");
  const button=ui.indexOf("button.textContent='동영상 다시 업로드'");
  assert.ok(gate>0&&button>gate);
  assert.match(ui,/if\(availability\.retryable!==true\)return/);
  assert.match(admit,/await S\.verifyTurnstile/);
  assert.match(admit,/S\.verifyPassword\(body\.password,post\.password_hash\)/);
  assert.match(admit,/job\.status!=='failed'/);
  assert.match(admit,/if\(inserted\.error\.code==='23505'\)/);
});
