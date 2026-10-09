const test=require('node:test'),assert=require('node:assert/strict');
const S=require('../netlify/functions/lib/community-security');
const M=require('../netlify/functions/lib/community-mutate');

test('post ownership and rate checks protect edit/delete; sold and expired states cannot be revived',async()=>{
  const original={client:S.client,verifyTurnstile:S.verifyTurnstile,rateLimit:S.rateLimit,verifyPassword:S.verifyPassword,validatePost:S.validatePost};
  const row={id:'post-test',status:'approved',category:'qna',password_hash:'synthetic-hash',details:null,updated_at:'2026-10-09T00:00:00Z'};
  const writes=[],ids=[];let limited=false;
  S.client=()=>({rpc:async(name,args)=>{assert.equal(name,'community_apply_post_text_edit');ids.push(args.p_post_id);return{data:{ok:true,status:row.status}}},from:()=>({
    select:()=>({eq(){return this},single:async()=>({data:{...row}})}),
    update:changes=>{writes.push(changes);return{eq(k,v){if(k==='id')ids.push(v);return this},select:async()=>({data:[{id:row.id}]})}}
  })});
  S.verifyTurnstile=async()=>{};S.rateLimit=async()=>{if(limited)throw Object.assign(new Error('Test limit'),{status:429})};
  S.verifyPassword=value=>value==='synthetic-correct';S.validatePost=value=>({category:value.category,title:'Edited title',body:'Edited body'});
  const request=password=>({httpMethod:'POST',headers:{},body:JSON.stringify({id:row.id,password,turnstile_token:'synthetic'})});
  try{
    for(const action of ['update','delete','sold','extend'])await assert.rejects(M.post(request('incorrect'),action),{status:403});
    assert.equal(writes.length,0);
    limited=true;await assert.rejects(M.post(request('synthetic-correct'),'delete'),{status:429});assert.equal(writes.length,0);limited=false;
    const edited=await M.post(request('synthetic-correct'),'update');assert.equal(edited.statusCode,200);assert.equal(JSON.parse(edited.body).status,'approved');assert.equal(writes.length,0);
    for(const status of ['deleted','sold','expired']){row.status=status;await assert.rejects(M.post(request('synthetic-correct'),'update'),{status:409})}
    row.status='approved';row.category='marketplace';row.expires_at='2000-01-01T00:00:00Z';
    await assert.rejects(M.post(request('synthetic-correct'),'sold'),{status:409});
    const deleted=await M.post(request('synthetic-correct'),'delete');assert.equal(deleted.statusCode,200);
    assert.equal(writes.at(-1).status,'deleted');assert.ok(writes.at(-1).cleanup_after);
    assert.ok(ids.every(id=>id===row.id));assert.doesNotMatch(deleted.body,/password|hash|synthetic/);
  }finally{Object.assign(S,original)}
});
