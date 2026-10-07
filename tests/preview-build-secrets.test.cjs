const test=require('node:test');
const assert=require('node:assert/strict');
const project=require('../scripts/preview-build-env.cjs');
const {assertTestPreview}=require('../netlify/functions/lib/test-preview-guard');
const valid={TEST_PREVIEW_MODE:'true',SITE_ID:'test',TEST_NETLIFY_SITE_ID:'test',SITE_NAME:'test',TEST_SUPABASE_PROJECT_REF:'aaikttogoejfvxbosktg',SUPABASE_URL:'https://aaikttogoejfvxbosktg.supabase.co',SUPABASE_ANON_KEY:'test.'+Buffer.from(JSON.stringify({ref:'aaikttogoejfvxbosktg',role:'anon'})).toString('base64url')+'.test',APP_PUBLIC_URL:'https://test.netlify.app',COUPON_EMAIL_MODE:'dry-run'};
test('All-scopes build never reads four server secrets',()=>{
 const env={...valid};
 for(const key of ['SUPABASE_SERVICE_ROLE_KEY','COMMUNITY_PASSWORD_PEPPER','COMMUNITY_RATE_LIMIT_HMAC_SECRET','COMMUNITY_TURNSTILE_SECRET_KEY'])Object.defineProperty(env,key,{get(){throw new Error('Secret read');}});
 assert.equal(assertTestPreview(project(env),{requireService:false}),true);
});
for(const key of ['RESEND_API_KEY','SUPABASE_SERVICE_KEY'])test('Build rejects forbidden '+key+' without reading its value',()=>{
 const env={...valid};Object.defineProperty(env,key,{get(){throw new Error('Credential read');}});
 assert.throws(()=>assertTestPreview(project(env),{requireService:false}));
});
