const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

test('file upload remains disabled in public UI and both server endpoints require production identity',()=>{
  assert.match(source('netlify/functions/config.js'),/COMMUNITY_VIDEO_UPLOAD_UI_ENABLED\s*:\s*process\.env\.COMMUNITY_VIDEO_UPLOAD_UI_ENABLED === 'true'/);
  assert.match(source('assets/community.js'),/if\(cfg\(\)\.COMMUNITY_VIDEO_UPLOAD_UI_ENABLED===true\)/);
  assert.match(source('netlify/functions/community-video-upload-admit.js'),
    /if\(!config\)return S\.response\(404/);
  assert.match(source('netlify/functions/community-video-upload-status.js'),
    /if\(!productionConfig\.forRequest\(event\)\)return S\.response\(404/);
  assert.match(source('netlify/functions/lib/community-video-production-config.js'),
    /env\.SITE_ID!==PRODUCTION_SITE_ID/);
  assert.match(source('cloudrun/community-video-staging/server.js'),/process\.env\.YOUTUBE_UPLOAD_ENABLED==='true'/);
});

test('temporary smoke and author diagnostic paths are removed without changing external video links',()=>{
  const ui=source('assets/community.js');
  const admission=source('netlify/functions/community-video-upload-admit.js');
  assert.doesNotMatch(ui,/Production Video Smoke Test|SMOKE_UI_POST_ID|communityProductionSmokeForm/);
  assert.doesNotMatch(admission,/SMOKE_POST_ID|SMOKE_ADMISSION_URL|smokeAdmission/);
  assert.equal(fs.existsSync(path.join(__dirname,'../netlify/functions/community-video-author-diagnostic.js')),false);
  assert.match(ui,/youtube\.com\/embed/);
  assert.match(ui,/Instagram에서 영상 보기/);
  assert.match(ui,/Facebook에서 영상 보기/);
});

test('runtime sources contain no Preview 19 origin, staging Supabase ref or staging bucket',()=>{
  for(const file of ['assets/community.js','cloudrun/community-video-staging/server.js',
    'netlify/functions/community-video-upload-admit.js','netlify/functions/community-video-upload-status.js']){
    const text=source(file);
    assert.doesNotMatch(text,/deploy-preview-19--|rhfypnxzlwdyosbszjcv|daltownmap-youtube-video-staging/);
  }
});

test('production migration has production object keys and additive objects only',()=>{
  const sql=source('supabase/community-video-upload-phase2-production.sql');
  assert.match(sql,/production\/[' ]*\|\| id::text/);
  assert.doesNotMatch(sql,/staging\//);
  assert.doesNotMatch(sql,/\b(delete from|update public\.community_posts set)\b/i);
  assert.match(sql,/begin;[\s\S]*to_regclass\('public\.community_video_upload_jobs'\) is not null[\s\S]*create table public\.community_video_upload_jobs/);
  assert.doesNotMatch(sql,/create or replace function public\.community_video_\w+\s*\(/i, 'function creation must not silently replace existing functions');
});
