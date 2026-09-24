const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const lifecycle=require('../netlify/functions/lib/community-lifecycle');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const now=new Date('2026-09-24T00:00:00Z');

test('approved post hides without cleanup and preserves media/comment rows',()=>{
  const changes=lifecycle.adminStatusChanges({status:'approved',category:'qna'},'hidden',now);
  assert.deepEqual(changes,{status:'hidden',approved_at:null,cleanup_after:null});
  assert.doesNotMatch(read('netlify/functions/lib/community-cleanup.js'),/\['expired','sold','deleted','rejected','hidden'\]/);
});
test('hidden unhide respects marketplace expiry',()=>{
  assert.throws(()=>lifecycle.adminStatusChanges({status:'hidden',category:'marketplace',expires_at:'2026-09-23T00:00:00Z'},'approved',now),/만료된/);
  const changes=lifecycle.adminStatusChanges({status:'hidden',category:'marketplace',expires_at:'2026-09-25T00:00:00Z'},'approved',now);
  assert.equal(changes.cleanup_after,'2026-10-02T00:00:00.000Z');
});
test('hidden author/admin deletion retains seven-day cleanup',()=>{
  assert.equal(lifecycle.adminStatusChanges({status:'hidden',category:'qna'},'deleted',now).cleanup_after,'2026-10-01T00:00:00.000Z');
  assert.match(read('netlify/functions/lib/community-mutate.js'),/status:'deleted',cleanup_after:L\.cleanupAfter\(\)/);
});
test('migration is additive and keeps public RPC approved-only',()=>{
  const sql=read('supabase/community-hidden-moderation-phase1.sql');
  assert.match(sql,/status in \('pending','approved','rejected','expired','sold','deleted','hidden'\)/);
  assert.match(sql,/status = 'hidden'/);
  assert.doesNotMatch(sql.slice(0,sql.indexOf('create or replace function')),/update public\.community_posts\s+set|delete from public\.community_posts/i);
  const base=read('supabase/community-phase1.sql');
  for(const name of ['community_list_public','community_get_public','community_comments_public']){
    const section=base.slice(base.indexOf(`function public.${name}`));
    assert.match(section.slice(0,2000),/status='approved'/);
  }
});
test('hidden content only leaves server after Turnstile, rate limit and password',()=>{
  const source=read('netlify/functions/community-post-owner.js');
  assert.match(source,/await S\.verifyTurnstile/);
  assert.match(source,/await S\.rateLimit/);
  assert.match(source,/\.eq\('status','hidden'\)/);
  assert.match(source,/S\.verifyPassword/);
  assert.match(source,/const \{password_hash,moderation_note,community_post_images,/);
  assert.doesNotMatch(read('assets/community.js'),/community_post_images.*password_hash/);
});
test('owner endpoint never returns hidden contents for a wrong password',async()=>{
  const security=require('../netlify/functions/lib/community-security');
  const original={client:security.client,verifyTurnstile:security.verifyTurnstile,rateLimit:security.rateLimit,verifyPassword:security.verifyPassword};
  const post={id:'00000000-0000-4000-8000-000000000001',status:'hidden',title:'private title',body:'private body',password_hash:'hash',moderation_reason:'off_topic',moderation_note:'internal memo',community_post_images:[]};
  security.client=()=>({from:()=>({select:()=>({eq(){return this},maybeSingle:async()=>({data:post,error:null})})})});
  security.verifyTurnstile=async()=>{};security.rateLimit=async()=>{};security.verifyPassword=value=>value==='correct';
  try{
    const handler=require('../netlify/functions/community-post-owner').handler;
    const request=password=>({httpMethod:'POST',body:JSON.stringify({id:post.id,password,turnstile_token:'test'}),headers:{}});
    const denied=await handler(request('wrong'));
    assert.equal(denied.statusCode,403);
    assert.doesNotMatch(denied.body,/private title|private body|internal memo/);
    const allowed=await handler(request('correct'));
    assert.equal(allowed.statusCode,200);
    assert.equal(JSON.parse(allowed.body).post.body,'private body');
    assert.doesNotMatch(allowed.body,/password_hash|internal memo/);
  }finally{Object.assign(security,original)}
});
test('admin endpoint hides with reason, unhides, and refuses expired marketplace restore',async()=>{
  const security=require('../netlify/functions/lib/community-security');
  const original=security.verifyAdmin;
  const id='00000000-0000-4000-8000-000000000002';
  const post={id,region:'dallas',category:'qna',status:'approved',created_at:now.toISOString(),expires_at:null,cleanup_after:null};
  const updates=[];
  const db={from:()=>({
    select:()=>({eq:()=>({single:async()=>({data:{...post},error:null})})}),
    update:changes=>{updates.push(changes);return{eq(){return this},select:async()=>({data:[{id}],error:null})}}
  })};
  security.verifyAdmin=async()=>({db,role:'regional_editor',area:'dallas'});
  try{
    const handler=require('../netlify/functions/community-admin').handler;
    const request=(status,extra={})=>({httpMethod:'POST',headers:{},body:JSON.stringify({action:'status',id,region:'dallas',status,...extra})});
    assert.equal((await handler(request('hidden',{reason:'off_topic',note:'internal only'}))).statusCode,200);
    assert.deepEqual({status:updates.at(-1).status,reason:updates.at(-1).moderation_reason,note:updates.at(-1).moderation_note,cleanup:updates.at(-1).cleanup_after},
      {status:'hidden',reason:'off_topic',note:'internal only',cleanup:null});
    post.status='hidden';
    assert.equal((await handler(request('approved'))).statusCode,200);
    assert.equal(updates.at(-1).moderation_reason,null);
    assert.equal(updates.at(-1).moderation_note,null);
    post.category='marketplace';post.expires_at='2000-01-01T00:00:00.000Z';
    assert.equal((await handler(request('approved'))).statusCode,400);
  }finally{security.verifyAdmin=original}
});
test('image edit uses an atomic hidden-to-pending wrapper and existing Storage contract',()=>{
  const js=read('netlify/functions/lib/community-image-edit.js');
  const sql=read('supabase/community-hidden-moderation-phase1.sql');
  assert.match(js,/post\.status==='hidden'\?'community_apply_hidden_post_image_edit'/);
  assert.match(sql,/community_apply_post_image_edit\(/);
  assert.match(sql,/where id=p_post_id and status='pending'/);
  assert.doesNotMatch(sql,/storage\.objects|storage\.buckets/);
});
