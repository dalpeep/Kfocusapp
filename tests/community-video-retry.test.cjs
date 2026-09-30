const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const S=require('../netlify/functions/lib/community-security');
const admit=require('../netlify/functions/community-video-upload-admit');

const postId='00000000-0000-4000-8000-000000000001';
const request=()=>({httpMethod:'POST',headers:{host:'daltownmap.com',origin:'https://daltownmap.com'},
  body:JSON.stringify({post_id:postId,password:'test-password',byte_size:1024,mime_type:'video/mp4',turnstile_token:'test-token'})});

test('video-only retry requires author credentials and rejects every non-failed prior job',async()=>{
  const original={client:S.client,verifyTurnstile:S.verifyTurnstile,rateLimit:S.rateLimit,verifyPassword:S.verifyPassword};
  const oldSite=process.env.SITE_ID;
  let prior=[],insertions=0,passwordValid=true;
  const post={id:postId,category:'marketplace',status:'approved',password_hash:'test-hash',video_url:null,video_provider:null};
  S.verifyTurnstile=async()=>{};
  S.rateLimit=async()=>{};
  S.verifyPassword=()=>passwordValid;
  S.client=()=>({from(){return{
    select(){return {eq(column){return column==='id'?{maybeSingle:async()=>({data:post,error:null})}:
      Promise.resolve({data:prior,error:null})}}},
    insert(){insertions++;return{select(){return{single:async()=>({data:{id:'new-job'},error:null})}}}}
  }}});
  process.env.SITE_ID='e2667e40-0999-42a3-892b-2b2edff61434';
  try{
    passwordValid=false;
    assert.equal((await admit.handler(request())).statusCode,403);
    assert.equal(insertions,0);
    passwordValid=true;
    for(const status of ['pending','uploading','processing','needs_review','uploaded']){
      prior=[{status,youtube_video_id:null}];
      assert.equal((await admit.handler(request())).statusCode,409,status);
    }
    prior=[{status:'failed',youtube_video_id:'already-uploaded'}];
    assert.equal((await admit.handler(request())).statusCode,409);
    assert.equal(insertions,0);
    prior=[];
    assert.equal((await admit.handler(request())).statusCode,201);
    assert.equal(insertions,1);
  }finally{
    Object.assign(S,original);
    if(oldSite===undefined)delete process.env.SITE_ID;else process.env.SITE_ID=oldSite;
  }
});

test('retry UI uses the existing Post ID without creating another post',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../assets/community.js'),'utf8');
  const retry=source.slice(source.indexOf('// A video-only recovery'),source.indexOf('// Phase 3 extends'));
  assert.match(retry,/post_id:id,password:form\.elements\.password\.value/);
  assert.match(retry,/turnstile_token:token\(\)/);
  assert.match(retry,/if\(form\.dataset\.attempted\)return/);
  assert.match(retry,/await uploadObject\(/);
  assert.doesNotMatch(retry,/api\('community-post-create'/);
});
