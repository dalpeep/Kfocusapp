const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const {validateVideoLink}=require('../netlify/functions/lib/community-video-url');
const {validatePost}=require('../netlify/functions/lib/community-security');
const id='M7lc1UVf-VE';
const base={category:'marketplace',region:'dallas',area:'dallas',title:'영상 게시글',body:'영상 내용',author_name:'작성자'};

test('YouTube watch, Shorts and youtu.be normalize to one canonical ID',()=>{
  for(const url of [`https://www.youtube.com/watch?v=${id}&t=20`,`https://youtube.com/shorts/${id}`,`https://youtu.be/${id}?si=tracking`])
    assert.deepEqual(validateVideoLink(url,'marketplace'),{video_url:`https://www.youtube.com/watch?v=${id}`,video_provider:'youtube'});
});
test('Instagram Reel/post/video and Facebook video/reel/watch/post are bounded canonical links',()=>{
  const cases=[
    ['https://www.instagram.com/reel/ABCdef123/?igsh=tracking','instagram','https://www.instagram.com/reel/ABCdef123/'],
    ['https://instagram.com/p/ABCdef123/','instagram','https://www.instagram.com/p/ABCdef123/'],
    ['https://instagram.com/tv/ABCdef123/','instagram','https://www.instagram.com/tv/ABCdef123/'],
    ['https://www.facebook.com/page/videos/123456789/','facebook','https://www.facebook.com/page/videos/123456789/'],
    ['https://www.facebook.com/reel/123456789/','facebook','https://www.facebook.com/reel/123456789/'],
    ['https://www.facebook.com/watch/?v=123456789','facebook','https://www.facebook.com/watch/?v=123456789'],
    ['https://www.facebook.com/page/posts/123456789/','facebook','https://www.facebook.com/page/posts/123456789/']
  ];
  for(const [url,provider,canonical] of cases)assert.deepEqual(validateVideoLink(url,'housing'),{video_url:canonical,video_provider:provider});
});
test('unsupported category discards a stale video and empty input removes a link',()=>{
  assert.deepEqual(validateVideoLink(`https://youtu.be/${id}`,'qna'),{video_url:null,video_provider:null});
  assert.deepEqual(validateVideoLink('','marketplace'),{video_url:null,video_provider:null});
  assert.deepEqual(validatePost({...base,category:'qna',video_url:`https://youtu.be/${id}`}).video_url,null);
});
test('server rejects hostile schemes, HTML, spoofed hosts, ports and credentials',()=>{
  const bad=[
    'javascript:alert(1)','data:text/html,hi','<iframe src="https://youtube.com/watch?v=M7lc1UVf-VE"></iframe>',
    'https://www.youtube.com.evil.test/watch?v=M7lc1UVf-VE',
    'https://www.instagram.com.evil.test/reel/ABCdef123/',
    'https://www.facebook.com.evil.test/reel/123456789/',
    `https://user:password@www.youtube.com/watch?v=${id}`,
    `https://www.youtube.com:8443/watch?v=${id}`,
    'https://youtu.be/not-an-id','https://www.youtube.com/watch?v=bad',
    'http://www.youtube.com/watch?v=M7lc1UVf-VE',
    'https://www.instagram.com/stories/user/123',
    'https://example.com/video/123',
    'not a URL'
  ];
  for(const url of bad)assert.throws(()=>validateVideoLink(url,'marketplace'),{status:400},url);
  assert.deepEqual(validatePost({...base,video_url:`https://youtu.be/${id}`,video_provider:'facebook'}),{
    ...validatePost({...base,video_url:`https://youtu.be/${id}`})
  });
});
test('migration preserves existing RPC signatures and hidden gating',()=>{
  const sql=read('supabase/community-video-link-phase1.sql');
  assert.match(sql,/add column if not exists video_url text/);
  assert.match(sql,/add column if not exists video_provider text/);
  assert.doesNotMatch(sql.slice(0,sql.indexOf('create or replace function public.community_apply_post_video_image_edit')),/update\s+public\.community_posts\s+set/i);
  assert.doesNotMatch(sql,/drop\s+table|delete\s+from\s+public\.community_posts/i);
  assert.match(sql,/community_list_public_v2/);
  assert.match(sql,/community_get_public_v2/);
  assert.match(sql,/where p\.status\s*=\s*'approved'/);
  assert.match(sql,/where p\.id=p_post_id and p\.status='approved'/);
  assert.match(sql,/community_apply_hidden_post_image_edit/);
  assert.match(sql,/community_apply_post_image_edit/);
  assert.match(sql,/grant execute on function public\.community_apply_post_video_image_edit\([\s\S]*?to service_role/i);
});
test('video is linked through authenticated mutations and never uploaded to Storage',()=>{
  const security=read('netlify/functions/lib/community-security.js');
  const create=read('netlify/functions/community-post-create.js');
  const edit=read('netlify/functions/lib/community-image-edit.js');
  const owner=read('netlify/functions/community-post-owner.js');
  const ui=read('assets/community.js');
  assert.match(security,/validateVideoLink\(body\.video_url,category\)/);
  assert.match(create,/S\.validatePost\(body\)/);
  assert.match(edit,/community_apply_post_video_image_edit/);
  assert.match(owner,/\.eq\('status','hidden'\)/);
  assert.match(owner,/S\.verifyPassword/);
  assert.match(owner,/video_url,video_provider/);
  assert.match(ui,/community_list_public_v2/);
  assert.match(ui,/community_get_public_v2/);
  assert.match(ui,/community-video-badge/);
  assert.match(ui,/community-video-detail/);
  assert.match(ui,/aspect-ratio:16\/9|youtube\.com\/embed/);
  assert.doesNotMatch(read('netlify/functions/lib/community-video-url.js'),/\bfetch\s*\(/);
  assert.doesNotMatch(ui,/youtube\.com\/upload|storage\.from\([^\n]*video/);
});
