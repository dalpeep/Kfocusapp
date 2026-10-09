const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const edit=require('../netlify/functions/lib/community-image-edit');

test('image keep, replacement and removal plans retain the same post ID',async()=>{
  const S=require('../netlify/functions/lib/community-security');
  const original={validatePost:S.validatePost,verifiedUploadDrafts:S.verifiedUploadDrafts,verifyTurnstile:S.verifyTurnstile,env:S.env,fingerprint:S.fingerprint};
  const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const calls=[];
  S.validatePost=value=>value;S.verifyTurnstile=async()=>{};S.fingerprint=()=> 'synthetic';
  S.env=()=>({url:'https://test.invalid',bucket:'community-images'});
  S.verifiedUploadDrafts=async()=>[{id:id(3),storage_path:`community-posts/${id(1)}/${id(3)}.webp`}];
  const db={from:()=>({select:()=>({eq(){return this},maybeSingle:async()=>({data:null}),limit:async()=>({data:[]})})}),rpc:async(name,args)=>{calls.push({name,args});return{data:{ok:true,status:'pending'}}}};
  const post={id:id(1),status:'approved',updated_at:'2026-10-09T00:00:00Z',category:'qna',details:{post_type:'question',topic:'test'},title:'Synthetic title',body:'Synthetic body'};
  try{
    for(const plan of [[{kind:'existing',id:id(2)}],[{kind:'upload',id:id(3)}],[]]){
      const result=await edit.edit({}, {request_id:id(4),draft_id:id(5),image_plan:plan},db,post);
      assert.equal(result.ok,true);assert.equal(calls.at(-1).args.p_post_id,id(1));
      assert.deepEqual(calls.at(-1).args.p_plan.map(x=>({kind:x.kind,id:x.id})),plan);
    }
    assert.equal(calls[1].args.p_plan[0].image_url,`https://test.invalid/storage/v1/object/public/community-images/community-posts/${id(1)}/${id(3)}.webp`);
    assert.ok(calls.every(x=>x.name==='community_apply_post_details_image_edit'));
  }finally{Object.assign(S,original)}
});

test('image edit only cleans Community-owned draft paths',()=>{
  assert.equal(edit.validPath('community-posts/123e4567-e89b-12d3-a456-426614174000/123e4567-e89b-12d3-a456-426614174001.webp'),true);
  for(const candidate of ['public-images/test.webp','community-posts/../../private','community-posts/a/file.webp','community-posts/123e4567-e89b-12d3-a456-426614174000/123e4567-e89b-12d3-a456-426614174001.jpg'])assert.equal(edit.validPath(candidate),false);
});

test('image edit SQL commits relation, post update and cleanup queue atomically',()=>{
  const sql=read('supabase/community-image-edit-phase1.sql');
  assert.match(sql,/create or replace function public\.community_apply_post_image_edit/);
  assert.match(sql,/where id = p_post_id for update/);
  assert.match(sql,/community_image_edit_requests\(request_id, post_id, result\)/);
  assert.match(sql,/post_id = p_post_id/);
  assert.match(sql,/upload\.post_id is distinct from p_post_id/);
  assert.match(sql,/insert into public\.community_image_cleanup_queue/);
  assert.match(sql,/delete from public\.community_post_images/);
  assert.match(sql,/insert into public\.community_post_images/);
  assert.match(sql,/revoke all on function public\.community_apply_post_image_edit/);
  assert.match(sql,/grant execute on function public\.community_apply_post_image_edit[^;]+to service_role/);
});

test('image edit UI preserves existing previews and sends bounded ordered image plan',()=>{
  const js=read('assets/community.js'),css=read('styles.css');
  assert.match(js,/existing\.images\|\|\[\]/);
  assert.match(js,/이미지 교체/);
  assert.match(js,/이미지 제거/);
  assert.match(js,/새 이미지 추가/);
  assert.match(js,/IMAGE_LIMITS\[f\.category\.value\]/);
  assert.match(js,/community-post-update/);
  assert.match(js,/image_plan:entries\.map/);
  assert.match(js,/owner\.dataset\.ownerAction==='update'\)return openPostEdit\(\)/);
  assert.match(css,/community-edit-image/);
});

test('new uploads verify the signed draft instead of replaying a single-use Turnstile token',()=>{
  const create=read('netlify/functions/community-post-create.js'),upload=read('netlify/functions/community-upload-authorize.js');
  assert.match(create,/verifiedUploadDrafts\(db,event,uploads,body\.draft_id\)/);
  assert.match(create,/if\(!uploads\.length\)await S\.verifyTurnstile/);
  assert.match(upload,/S\.verifyPassword\(body\.password,post\.data\.password_hash\)/);
  assert.match(upload,/await S\.verifyTurnstile/);
});
