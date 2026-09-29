const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const ui=fs.readFileSync(path.join(__dirname,'../assets/community.js'),'utf8');
const gate=fs.readFileSync(path.join(__dirname,'../netlify/functions/community-video-upload-admit.js'),'utf8');
const diagnostic=fs.readFileSync(path.join(__dirname,'../netlify/functions/community-video-author-diagnostic.js'),'utf8');

test('temporary author check is limited to the new Production post without changing the smoke gate',()=>{
  const id='a04221f7-06b6-448b-a21e-5c89a9dda24f';
  assert.match(ui,new RegExp(`SMOKE_UI_POST_ID='${id}'`));
  assert.match(gate,/SMOKE_POST_ID='6614c2d2-f806-4c4a-91c1-e1cdc715f99d'/);
  assert.match(diagnostic,new RegExp(`SMOKE_POST_ID='${id}'`));
  assert.match(ui,/location\.hostname!=='daltownmap\.com'/);
  assert.match(ui,/cfg\(\)\.COMMUNITY_VIDEO_UPLOAD_UI_ENABLED===true/);
  assert.match(ui,/id!==SMOKE_UI_POST_ID/);
  assert.match(ui,/location\.hash!==`#community\/post\/\$\{SMOKE_UI_POST_ID\}`/);
});

test('temporary UI checks only the password and cannot submit a video',()=>{
  const temporaryUi=ui.slice(ui.indexOf('// Temporary, one-post read-only author check.'));
  assert.match(temporaryUi,/api\('community-video-author-diagnostic',\{/);
  assert.match(temporaryUi,/post_id:id,password:form\.elements\.password\.value/);
  assert.match(ui,/turnstile_token:token\(\)/);
  assert.match(temporaryUi,/button\.disabled=true/);
  assert.match(temporaryUi,/form\.elements\.password\.value=''/);
  assert.doesNotMatch(temporaryUi,/community-video-upload-admit|video_file|upload_url|localStorage|console\.|sessionStorage/);
});
