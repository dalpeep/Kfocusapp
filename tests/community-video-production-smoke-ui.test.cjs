const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const ui=fs.readFileSync(path.join(__dirname,'../assets/community.js'),'utf8');
const gate=fs.readFileSync(path.join(__dirname,'../netlify/functions/community-video-upload-admit.js'),'utf8');

test('temporary smoke UI is limited to the same Production post as the server gate',()=>{
  const id='6614c2d2-f806-4c4a-91c1-e1cdc715f99d';
  assert.match(ui,new RegExp(`SMOKE_UI_POST_ID='${id}'`));
  assert.match(gate,new RegExp(`SMOKE_POST_ID='${id}'`));
  assert.match(ui,/location\.hostname!=='daltownmap\.com'/);
  assert.match(ui,/cfg\(\)\.COMMUNITY_VIDEO_UPLOAD_UI_ENABLED===true/);
  assert.match(ui,/id!==SMOKE_UI_POST_ID/);
  assert.match(ui,/location\.hash!==`#community\/post\/\$\{SMOKE_UI_POST_ID\}`/);
});

test('smoke submission uses the existing server-side validation and bound ticket path',()=>{
  assert.match(ui,/api\('community-video-upload-admit',\{post_id:id,password:form\.elements\.password\.value,/);
  assert.match(ui,/turnstile_token:token\(\)/);
  assert.match(ui,/JSON\.stringify\(\{job_id:admit\.job_id,post_id:id,ticket:admit\.ticket\}\)/);
  assert.match(ui,/headers:\{'Content-Type':'video\/mp4',\.\.\.session\.upload_headers\},body:file/);
  assert.match(ui,/button\.disabled=true/);
  assert.match(ui,/form\.elements\.password\.value=''/);
  assert.doesNotMatch(ui.slice(ui.indexOf('// Temporary, one-post Production smoke control.')),
    /localStorage|console\.|sessionStorage/);
});
