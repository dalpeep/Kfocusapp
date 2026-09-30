const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {validateDetails}=require('../netlify/functions/lib/community-details');
const {reviewPost}=require('../netlify/functions/lib/community-review');
const source=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

const marketplace={listing_type:'sell',item_name:'테스트 물품',price:'협의',item_condition:'used',trade_area:'Dallas'};
const cleanPost=category=>({category,title:'테스트 글',body:'정상 게시글 확인',author_name:'테스트 작성자'});

test('marketplace and housing can retain a separately validated external link',()=>{
  const external='https://youtu.be/dQw4w9WgXcQ';
  for(const [category,details] of [['marketplace',marketplace],['housing',{}]]){
    const validated=validateDetails(category,{...details,external_video_url:external});
    assert.equal(validated.external_video_url,'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    assert.equal(reviewPost(cleanPost(category),validated).status,category==='marketplace'?'approved':'pending');
  }
});

test('external video details fail closed on invalid URL and disallowed categories',()=>{
  assert.throws(()=>validateDetails('marketplace',{...marketplace,external_video_url:'https://evil.example/video'}));
  assert.throws(()=>validateDetails('qna',{post_type:'question',topic:'테스트',external_video_url:'https://youtu.be/dQw4w9WgXcQ'}));
  assert.equal(reviewPost(cleanPost('marketplace'),{...marketplace,item_name:'www.example.com'}).status,'pending');
});

test('direct MP4 UI stays opt-in and the existing bound admission restricts both categories',()=>{
  const ui=source('assets/community.js'),config=source('netlify/functions/config.js');
  const admit=source('netlify/functions/community-video-upload-admit.js');
  assert.match(config,/COMMUNITY_VIDEO_UPLOAD_UI_ENABLED\s*:\s*process\.env\.COMMUNITY_VIDEO_UPLOAD_UI_ENABLED === 'true'/);
  assert.match(ui,/refreshVideoFlag\(\)\.then\(enabled=>\{if\(enabled\)attachVideoField\(form\)\}\)/);
  assert.match(ui,/\['marketplace','housing'\]\.includes\(form\.category\.value\)/);
  assert.match(ui,/accept="video\/mp4,\.mp4"/);
  assert.match(ui,/if\(f\._videoSubmitStarted\)return/);
  assert.match(admit,/!\['marketplace','housing'\]\.includes\(post\.category\)/);
  assert.match(admit,/S\.verifyPassword\(body\.password,post\.password_hash\)/);
  assert.match(admit,/await S\.verifyTurnstile/);
});

test('file creation retains a second valid external link without replacing canonical video_url',()=>{
  const ui=source('assets/community.js'),create=source('netlify/functions/community-post-create.js');
  assert.match(ui,/details\.external_video_url=external/);
  assert.match(ui,/delete data\.video_url/);
  assert.match(ui,/current\.details\.external_video_url!==current\.video_url/);
  assert.match(create,/if\(details\?\.external_video_url&&post\.video_url\)/);
});
