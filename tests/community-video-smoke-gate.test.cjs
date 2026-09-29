const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../netlify/functions/community-video-upload-admit.js'),'utf8');
const post='a04221f7-06b6-448b-a21e-5c89a9dda24f';

test('temporary smoke gate is one Production post only and adds no Netlify env',()=>{
  assert.match(source,/SMOKE_POST_ID='a04221f7-06b6-448b-a21e-5c89a9dda24f'/);
  assert.match(source,/smokeAdmission=requestHost==='daltownmap\.com'/);
  assert.match(source,/if\(smokeAdmission&&postId!==SMOKE_POST_ID\)\s*return S\.response\(404/);
  assert.match(source,/const objectPrefix=smokeAdmission\?'production':uploadPrefix\(\)/);
  assert.match(source,/post_id:postId,ticket,admission_url:normalizedAdmissionUrl/);
  assert.doesNotMatch(source,/process\.env\.COMMUNITY_VIDEO_SMOKE/);
});

test('another post cannot reach validation, reservation or ticket generation',async()=>{
  const {handler}=require('../netlify/functions/community-video-upload-admit');
  const response=await handler({httpMethod:'POST',headers:{host:'daltownmap.com'},
    body:JSON.stringify({post_id:'11111111-1111-4111-8111-111111111111',
      byte_size:100,mime_type:'video/mp4'})});
  assert.equal(response.statusCode,404);
  assert.doesNotMatch(response.body,/ticket|job_id/);
});

test('authorized post path retains Turnstile, rate, author and active-job checks',()=>{
  assert.match(source,/await S\.verifyTurnstile\(event,body\.turnstile_token\)/);
  assert.match(source,/await S\.rateLimit\(db,event,'video_upload_admit',3,3600,postId\)/);
  assert.match(source,/\.eq\('id',postId\)\.maybeSingle\(\)/);
  assert.match(source,/S\.verifyPassword\(body\.password,post\.password_hash\)/);
  assert.match(source,/inserted\.error\.code==='23505'/);
});

test('only the smoke post receives a ticket after all server checks',async()=>{
  const S=require('../netlify/functions/lib/community-security');
  const original={client:S.client,verifyTurnstile:S.verifyTurnstile,
    rateLimit:S.rateLimit,verifyPassword:S.verifyPassword};
  const calls=[];let inserted;
  S.verifyTurnstile=async()=>{calls.push('turnstile')};
  S.rateLimit=async()=>{calls.push('rate')};
  S.verifyPassword=()=>{calls.push('password');return true};
  S.client=()=>({from(table){
    if(table==='community_posts')return {select(){return {eq(_,id){
      assert.equal(id,post);return {async maybeSingle(){calls.push('post');
        return {data:{id:post,category:'marketplace',status:'pending',
          password_hash:'synthetic',video_url:null,video_provider:null}}}}
    }}}};
    if(table==='community_video_upload_jobs')return {insert(value){inserted=value;
      calls.push('reservation');return {select(){return {async single(){return {data:{id:value.id}}}}}}}};
    throw new Error('Unexpected table');
  }});
  try{
    const {handler}=require('../netlify/functions/community-video-upload-admit');
    const response=await handler({httpMethod:'POST',headers:{host:'daltownmap.com'},
      body:JSON.stringify({post_id:post,password:'synthetic',turnstile_token:'synthetic',
        byte_size:100,mime_type:'video/mp4'})});
    assert.equal(response.statusCode,201);
    assert.deepEqual(calls,['turnstile','rate','post','password','reservation']);
    assert.equal(inserted.post_id,post);
    assert.match(inserted.object_key,/^production\/[0-9a-f-]+\/[0-9a-f-]+\.mp4$/);
    const body=JSON.parse(response.body);
    assert.equal(body.post_id,post);
    assert.equal(body.ticket.length,43);
  }finally{Object.assign(S,original)}
});
