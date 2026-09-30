const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const config=require('../netlify/functions/lib/community-video-production-config');
const admission=require('../netlify/functions/community-video-upload-admit');
const status=require('../netlify/functions/community-video-upload-status');

const siteId='e2667e40-0999-42a3-892b-2b2edff61434';
const event=(host,body='{}',httpMethod='POST')=>({httpMethod,headers:{host},body});
const body=result=>JSON.parse(result.body);

test('production site and host both required for shared server configuration',()=>{
  const valid=event('daltownmap.com');
  assert.equal(config.forRequest(valid,{SITE_ID:siteId})?.objectPrefix,'production');
  assert.equal(config.forRequest(valid,{SITE_ID:'other-site'}),null);
  assert.equal(config.forRequest(event('deploy-preview-19--reliable-semifreddo-5d5b56.netlify.app'),{SITE_ID:siteId}),null);
  assert.equal(config.forRequest(event('branch--reliable-semifreddo-5d5b56.netlify.app'),{SITE_ID:siteId}),null);
  assert.equal(config.forRequest(valid,{}),null);
  assert.equal(config.forRequest(event('daltownmap.com.evil.example'),{SITE_ID:siteId}),null);
});

test('admission and status fail closed on wrong site, Preview, Branch and local',async()=>{
  const old=process.env.SITE_ID;
  try{
    for(const [id,host] of [['other-site','daltownmap.com'],[siteId,'deploy-preview-19--reliable-semifreddo-5d5b56.netlify.app'],
      [siteId,'branch--reliable-semifreddo-5d5b56.netlify.app'],['','localhost:8888']]){
      process.env.SITE_ID=id;
      for(const fn of [admission,status]){
        const result=await fn.handler(event(host));
        assert.equal(result.statusCode,404);
        assert.equal(body(result).error,'Unavailable.');
      }
    }
    process.env.SITE_ID=siteId;
    assert.equal((await admission.handler(event('daltownmap.com'))).statusCode,400);
    assert.equal((await status.handler(event('daltownmap.com'))).statusCode,400);
    assert.equal((await admission.handler(event('daltownmap.com','{}','GET'))).statusCode,405);
  }finally{
    if(old===undefined)delete process.env.SITE_ID;else process.env.SITE_ID=old;
  }
});

test('no credentials or legacy admission environment variables in server configuration',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../netlify/functions/lib/community-video-production-config.js'),'utf8');
  assert.doesNotMatch(source,/SUPABASE_SERVICE_ROLE_KEY|TURNSTILE_SECRET_KEY|YOUTUBE_.*(SECRET|TOKEN)|COMMUNITY_VIDEO_UPLOAD_ADMISSION_ENABLED/);
  assert.match(source,/community-video-admission-production-/);
  assert.match(source,/https:\/\/daltownmap\.com\//);
});
