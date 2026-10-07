const test=require('node:test'),assert=require('node:assert/strict');
const S=require('../netlify/functions/lib/community-security');
const M=require('../netlify/functions/lib/community-comment-mutate');

test('comment mutations verify ownership, preserve IDs and moderation, and fail closed',async()=>{
  const original={client:S.client,verifyTurnstile:S.verifyTurnstile,rateLimit:S.rateLimit,verifyPassword:S.verifyPassword};
  let status='active',parent={status:'approved',category:'qna'},turnstile=true,limited=false,race=false,reads=0;
  const writes=[],filters=[];
  S.client=()=>({from:table=>({
    select:()=>({eq(){return this},single:async()=>{reads++;return{data:table==='community_comments'?{id:'comment-test',post_id:'post-test',password_hash:'synthetic-hash',status}:parent}}}),
    update:changes=>{writes.push(changes);return{eq(key,value){filters.push([key,value]);return this},select:async()=>({data:race?[]:[{id:'comment-test'}]})}}
  })});
  S.verifyTurnstile=async()=>{if(!turnstile)throw Object.assign(new Error('Test challenge failed'),{status:400})};
  S.rateLimit=async()=>{if(limited)throw Object.assign(new Error('Test limit'),{status:429})};
  S.verifyPassword=value=>value==='synthetic-correct';
  const request=(password='synthetic-correct',body='Edited test comment')=>({httpMethod:'POST',headers:{},body:JSON.stringify({id:'comment-test',password,body,turnstile_token:'synthetic'})});
  try{
    await assert.rejects(M.comment(request('incorrect'),'update'),{status:403});assert.equal(writes.length,0);
    turnstile=false;await assert.rejects(M.comment(request(),'delete'),{status:400});assert.equal(writes.length,0);turnstile=true;
    limited=true;const before=reads;await assert.rejects(M.comment(request(),'update'),{status:429});assert.equal(reads,before);limited=false;
    assert.equal((await M.comment(request(),'update')).statusCode,200);assert.deepEqual(writes.at(-1),{body:'Edited test comment',status:'active'});
    assert.ok(filters.some(([k,v])=>k==='id'&&v==='comment-test'));assert.ok(filters.some(([k,v])=>k==='password_hash'&&v==='synthetic-hash'));
    await M.comment(request('synthetic-correct','https://example.invalid/test'),'update');assert.equal(writes.at(-1).status,'hidden');
    status='hidden';await M.comment(request(),'update');assert.equal(writes.at(-1).status,'hidden');
    parent={status:'approved',category:'housing',expires_at:'2000-01-01T00:00:00Z'};await assert.rejects(M.comment(request(),'update'),{status:400});
    parent={status:'approved',category:'qna'};await assert.rejects(M.comment(request('synthetic-correct',''),'update'),{status:400});
    race=true;await assert.rejects(M.comment(request(),'delete'),{status:409});race=false;
    const deleted=await M.comment(request(),'delete');assert.equal(deleted.statusCode,200);assert.deepEqual(writes.at(-1),{status:'deleted'});assert.doesNotMatch(deleted.body,/password|hash|synthetic/);
    status='deleted';const count=writes.length;await assert.rejects(M.comment(request(),'update'),{status:404});assert.equal(writes.length,count);
  }finally{Object.assign(S,original)}
});
