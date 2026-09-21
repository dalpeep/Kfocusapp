const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const edit=require('../netlify/functions/lib/community-image-edit');

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
  assert.match(css,/community-edit-image/);
});

test('new uploads verify the signed draft instead of replaying a single-use Turnstile token',()=>{
  const create=read('netlify/functions/community-post-create.js'),upload=read('netlify/functions/community-upload-authorize.js');
  assert.match(create,/verifiedUploadDrafts\(db,event,uploads,body\.draft_id\)/);
  assert.match(create,/if\(!uploads\.length\)await S\.verifyTurnstile/);
  assert.match(upload,/S\.verifyPassword\(body\.password,post\.data\.password_hash\)/);
  assert.match(upload,/await S\.verifyTurnstile/);
});
