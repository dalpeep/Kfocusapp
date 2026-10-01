const test=require('node:test');
const assert=require('node:assert/strict');
const R=require('../netlify/functions/lib/community-retention');

const now=new Date('2026-10-01T00:00:00.000Z');
const post=(category,overrides={})=>({id:'00000000-0000-4000-8000-000000000001',category,status:'approved',extension_count:0,expires_at:R.initialRetention(category,now).expires_at,...overrides});

test('marketplace starts at 30 days and one extension adds 30 days',()=>{
  const initial=R.initialRetention('marketplace',now);
  assert.equal(initial.expires_at,'2026-10-31T00:00:00.000Z');
  const next=R.extension(post('marketplace'),new Date('2026-10-02T00:00:00.000Z'));
  assert.equal(next.expires_at,'2026-11-30T00:00:00.000Z');
  assert.equal(next.cleanup_after,'2026-12-07T00:00:00.000Z');
  assert.throws(()=>R.extension(post('marketplace',{extension_count:1})),/1회만/);
  assert.throws(()=>R.extension(post('marketplace',{status:'sold'})),/연장할 수 없습니다/);
});

test('housing starts at 90 days, extends once by 90 days and keeps approval',()=>{
  const initial=R.initialRetention('housing',now);
  assert.equal(initial.expires_at,'2026-12-30T00:00:00.000Z');
  const next=R.extension(post('housing'),new Date('2026-10-02T00:00:00.000Z'));
  assert.equal(next.expires_at,'2027-03-30T00:00:00.000Z');
  assert.equal(next.extension_count,1);
  assert.equal(post('housing').status,'approved');
  assert.throws(()=>R.extension(post('housing',{extension_count:1})),/1회만/);
});

test('legacy housing with no deadline and already expired posts fail closed',()=>{
  assert.throws(()=>R.extension(post('housing',{expires_at:null})),/관리자 확인/);
  assert.throws(()=>R.extension(post('housing'),new Date('2027-01-01T00:00:00.000Z')),/이미 만료/);
});

test('wrong password cannot reach an extension write',async()=>{
  const S=require('../netlify/functions/lib/community-security');
  const original={client:S.client,verifyTurnstile:S.verifyTurnstile,verifyPassword:S.verifyPassword,rateLimit:S.rateLimit};
  let writes=0;
  S.client=()=>({from:()=>({select:()=>({eq:()=>({single:async()=>({data:{...post('marketplace'),password_hash:'hash'},error:null})})}),update:()=>{writes++;throw new Error('must not write')}})});
  S.verifyTurnstile=async()=>{};S.verifyPassword=()=>false;S.rateLimit=async()=>{};
  try{
    const result=await require('../netlify/functions/community-post-extend').handler({httpMethod:'POST',body:JSON.stringify({id:post('marketplace').id,password:'wrong'}),headers:{}});
    assert.equal(result.statusCode,403);assert.equal(writes,0);
  }finally{Object.assign(S,original)}
});
