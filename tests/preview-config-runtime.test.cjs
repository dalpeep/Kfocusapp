const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');

test('Test config imports without env, then validates runtime env and keeps diagnostics private',()=>{
  const script=`
    const assert=require('node:assert/strict');
    const config=require('./netlify/test-functions/config');
    const key=role=>'test.'+Buffer.from(JSON.stringify({ref:'aaikttogoejfvxbosktg',role})).toString('base64url')+'.synthetic';
    Object.assign(process.env,{
      TEST_PREVIEW_MODE:'true',SITE_ID:'test',TEST_NETLIFY_SITE_ID:'test',SITE_NAME:'test',
      TEST_SUPABASE_PROJECT_REF:'aaikttogoejfvxbosktg',SUPABASE_URL:'https://aaikttogoejfvxbosktg.supabase.co',
      SUPABASE_ANON_KEY:key('anon'),APP_PUBLIC_URL:'https://test.netlify.app',COUPON_EMAIL_MODE:'dry-run',
      COMMUNITY_PASSWORD_PEPPER:'private-pepper-canary',COMMUNITY_RATE_LIMIT_HMAC_SECRET:'private-hmac-canary'
    });
    (async()=>{
      const logs=[]; console.error=(...args)=>logs.push(args);
      const failed=await config.handler();
      assert.equal(failed.statusCode,503);
      assert.equal(logs[0][1].SUPABASE_ANON_KEY,'present');
      assert.equal(logs[0][1].SUPABASE_SERVICE_ROLE_KEY,'missing');
      assert.equal(logs[0][1].COMMUNITY_TURNSTILE_SECRET_KEY,'missing');
      for(const secret of [key('anon'),'private-pepper-canary','private-hmac-canary'])
        assert.ok(!JSON.stringify({failed,logs}).includes(secret));
      assert.ok(!failed.body.includes('SUPABASE'));
      process.env.SUPABASE_SERVICE_ROLE_KEY=key('service_role');
      const good=await config.handler();
      assert.equal(good.statusCode,200);
      assert.ok(!good.body.includes(key('service_role')));
      process.env.SUPABASE_URL='https://ydrxuqmjzayejlnjzzew.supabase.co';
      assert.equal((await config.handler()).statusCode,503);
    })().catch(()=>{process.exitCode=1});
  `;
  const run=spawnSync(process.execPath,['-e',script],{
    cwd:path.resolve(__dirname,'..'),env:{},encoding:'utf8'
  });
  assert.equal(run.status,0,'Isolated runtime contract failed');
  assert.equal(run.stdout,'');
  assert.equal(run.stderr,'');
});
