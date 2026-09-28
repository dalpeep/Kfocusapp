const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

test('file upload is disabled by default in public UI and both server endpoints',()=>{
  assert.match(source('netlify/functions/config.js'),/COMMUNITY_VIDEO_UPLOAD_UI_ENABLED\s*:\s*process\.env\.COMMUNITY_VIDEO_UPLOAD_UI_ENABLED === 'true'/);
  assert.match(source('assets/community.js'),/if\(cfg\(\)\.COMMUNITY_VIDEO_UPLOAD_UI_ENABLED===true\)/);
  for(const file of ['netlify/functions/community-video-upload-admit.js','netlify/functions/community-video-upload-status.js'])
    assert.match(source(file),/COMMUNITY_VIDEO_UPLOAD_ADMISSION_ENABLED!=='true'/);
  assert.match(source('cloudrun/community-video-staging/server.js'),/process\.env\.YOUTUBE_UPLOAD_ENABLED==='true'/);
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
