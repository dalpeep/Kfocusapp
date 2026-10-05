const {test}=require('node:test');
const assert=require('node:assert/strict');
const {assertTestPreview,requireTestPreview}=require('../netlify/functions/lib/test-preview-guard');
const key=role=>'test.'+Buffer.from(JSON.stringify({ref:'aaikttogoejfvxbosktg',role})).toString('base64url')+'.synthetic';

const valid=()=>({
  TEST_PREVIEW_MODE:'true',SITE_ID:'test-site-id',SITE_NAME:'isolated-test',TEST_NETLIFY_SITE_ID:'test-site-id',
  TEST_SUPABASE_PROJECT_REF:'aaikttogoejfvxbosktg',
  SUPABASE_URL:'https://aaikttogoejfvxbosktg.supabase.co',
  SUPABASE_ANON_KEY:key('anon'),SUPABASE_SERVICE_ROLE_KEY:key('service_role'),
  APP_PUBLIC_URL:'https://isolated-test.netlify.app',COUPON_EMAIL_MODE:'dry-run'
});
test('isolated Test Preview identity succeeds without printing secrets',()=>{
  assert.equal(assertTestPreview(valid()),true);
});
test('Test-only Function rejects missing Test mode',()=>{
  assert.throws(()=>requireTestPreview({}));
});
test('public config exposes Test URL and anon key but not service key',async()=>{
  const before={...process.env};
  try{
    Object.assign(process.env,valid());
    const response=await require('../netlify/functions/config').handler();
    assert.equal(response.statusCode,200);
    assert.match(response.body,/aaikttogoejfvxbosktg\.supabase\.co/);
    assert.ok(response.body.includes(key('anon')));
    assert.ok(!response.body.includes(key('service_role')));
    assert.doesNotMatch(response.body,/synthetic-service|ydrxuqmjzayejlnjzzew|daltownmap\.com/);
  }finally{
    for(const key of Object.keys(process.env))if(!(key in before))delete process.env[key];
    Object.assign(process.env,before);
  }
});
test('coupon email dry-run never calls the provider',async()=>{
  const before={...process.env};
  const oldFetch=global.fetch;
  try{
    Object.assign(process.env,valid());
    global.fetch=()=>{throw new Error('External email request attempted')};
    const {sendEmail}=require('../netlify/functions/coupon-campaign-lib');
    const result=await sendEmail({to:'customer@example.com',subject:'test'});
    assert.equal(result.dry_run,true);
    await assert.rejects(sendEmail({to:'real.person@gmail.com',subject:'test'}));
    const notify=require('../netlify/functions/coupon-used-notify').handler;
    const notified=await notify({httpMethod:'POST',body:JSON.stringify({notify_emails:'admin@example.com'})});
    assert.equal(JSON.parse(notified.body).dry_run,true);
    assert.equal((await notify({httpMethod:'POST',body:JSON.stringify({notify_emails:'real.person@gmail.com'})})).statusCode,400);
  }finally{
    global.fetch=oldFetch;
    for(const key of Object.keys(process.env))if(!(key in before))delete process.env[key];
    Object.assign(process.env,before);
  }
});
for(const [name,change] of [
  ['production URL',{SUPABASE_URL:'https://ydrxuqmjzayejlnjzzew.supabase.co'}],
  ['wrong site',{SITE_ID:'production-site'}],
  ['wrong project marker',{TEST_SUPABASE_PROJECT_REF:'wrong'}],
  ['real mail credential',{RESEND_API_KEY:'synthetic-real-mail-key'}],
  ['production public URL',{APP_PUBLIC_URL:'https://daltownmap.com'}],
  ['missing service key',{SUPABASE_SERVICE_ROLE_KEY:''}],
  ['legacy URL alias',{VITE_SUPABASE_URL:'https://ydrxuqmjzayejlnjzzew.supabase.co'}]
  ,['production key with Test URL',{SUPABASE_ANON_KEY:'test.'+Buffer.from(JSON.stringify({ref:'ydrxuqmjzayejlnjzzew',role:'anon'})).toString('base64url')+'.synthetic'}]
  ,['service role as browser key',{SUPABASE_ANON_KEY:key('service_role')}]
  ,['unverifiable opaque key',{SUPABASE_ANON_KEY:'sb_publishable_synthetic'}]
])test(`Test Preview rejects ${name}`,()=>assert.throws(()=>assertTestPreview({...valid(),...change})));
