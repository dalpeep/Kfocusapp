import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync}from'node:child_process';import {verify,diagnostic}from './verify.mjs';
const QA='hseaeafmmjnbynfyynao',PROD='ydrxuqmjzayejlnjzzew';
const jwt=c=>'synthetic.'+Buffer.from(JSON.stringify(c)).toString('base64url')+'.synthetic';
const env=()=>({NETLIFY:'true',CONTEXT:'deploy-preview',SITE_ID:'ec0bc146-8184-4627-90e0-df82ec2b06f9',PULL_REQUEST:'true',REVIEW_ID:'54',QA_KEY_CHECK_REVIEW_ID:'54',HEAD:'dev/qa-key-verifier-guards-20261030',QA_KEY_CHECK_HEAD:'dev/qa-key-verifier-guards-20261030',BRANCH:'pull/54/head',COMMIT_REF:'a'.repeat(40),QA_KEY_CHECK_COMMIT:'a'.repeat(40),QA_KEY_CHECK_ONCE:'true',OWNER_UUID_ENABLED:'false',OWNER_NOTIFICATION_WORKER_ENABLED:'false',OWNER_NOTIFICATION_MODE:'mock',SUPABASE_URL:`https://${QA}.supabase.co`,SUPABASE_SERVICE_ROLE_KEY:jwt({ref:QA,role:'service_role',exp:4000000000})});
const cases=[
 ['NETLIFY_BLOCKED',{NETLIFY:''}],['CONTEXT_BLOCKED',{CONTEXT:'production'}],['SITE_BLOCKED',{SITE_ID:'production'}],['PR_BUILD_BLOCKED',{PULL_REQUEST:'false'}],
 ['REVIEW_BLOCKED',{REVIEW_ID:undefined}],['REVIEW_BLOCKED',{REVIEW_ID:'53'}],['REVIEW_BLOCKED',{QA_KEY_CHECK_REVIEW_ID:''}],
 ['HEAD_BLOCKED',{HEAD:''}],['HEAD_BLOCKED',{HEAD:'main'}],['HEAD_BLOCKED',{QA_KEY_CHECK_HEAD:undefined}],
 ['CHECKOUT_REF_BLOCKED',{BRANCH:undefined}],['CHECKOUT_REF_BLOCKED',{BRANCH:'pull/53/head'}],['CHECKOUT_REF_BLOCKED',{BRANCH:'main'}],['CHECKOUT_REF_BLOCKED',{BRANCH:'dev/qa-key-verifier-guards-20261030'}],
 ['COMMIT_BLOCKED',{COMMIT_REF:'b'.repeat(40)}],['COMMIT_BLOCKED',{QA_KEY_CHECK_COMMIT:undefined}],['APPROVAL_BLOCKED',{QA_KEY_CHECK_ONCE:undefined}],
 ['OWNER_MODE_BLOCKED',{OWNER_UUID_ENABLED:'true'}],['WORKER_MODE_BLOCKED',{OWNER_NOTIFICATION_WORKER_ENABLED:'true'}],['MOCK_MODE_BLOCKED',{OWNER_NOTIFICATION_MODE:'resend_test'}],
 ['PROVIDER_CREDENTIAL_BLOCKED',{RESEND_API_KEY:'synthetic'}],['PROVIDER_CREDENTIAL_BLOCKED',{OWNER_QA_RESEND_API_KEY:'synthetic'}],['PROVIDER_CREDENTIAL_BLOCKED',{ONESIGNAL_REST_API_KEY:'synthetic'}],
 ['QA_TARGET_BLOCKED',{SUPABASE_URL:`https://${PROD}.supabase.co`}],['QA_TARGET_BLOCKED',{SUPABASE_URL:`https://${QA}.supabase.co.evil.invalid`}],['QA_TARGET_BLOCKED',{SUPABASE_URL:undefined}],
 ['KEY_FORMAT_BLOCKED',{SUPABASE_SERVICE_ROLE_KEY:'masked'}],['KEY_FORMAT_BLOCKED',{SUPABASE_SERVICE_ROLE_KEY:undefined}],
 ['KEY_PROJECT_BLOCKED',{SUPABASE_SERVICE_ROLE_KEY:jwt({ref:PROD,role:'service_role',exp:4000000000})}],['KEY_PROJECT_BLOCKED',{SUPABASE_SERVICE_ROLE_KEY:jwt({ref:QA,role:'anon',exp:4000000000})}],['KEY_PROJECT_BLOCKED',{SUPABASE_SERVICE_ROLE_KEY:jwt({ref:QA,role:'service_role',exp:1})}],
];
cases.forEach(([code,patch],i)=>test(`${i+1}: ${code} fails closed before network`,async()=>{let calls=0;await assert.rejects(verify({...env(),...patch},{fetcher:async()=>{calls++;}}),e=>{const d=diagnostic(e);assert.equal(d.code,code);assert.ok(Object.values(d.checks).every(v=>typeof v==='boolean'));return true;});assert.equal(calls,0);}));
for(const ref of ['pull/54/head','refs/pull/54/head'])test('official checkout reference differs from HEAD: '+ref,async()=>{let calls=0;const e={...env(),BRANCH:ref};const out=await verify(e,{fetcher:async(url,o)=>{calls++;assert.equal(url,`https://${QA}.supabase.co/rest/v1/businesses?select=id&limit=0`);assert.equal(o.method,'GET');assert.equal(o.redirect,'error');assert.equal(o.headers.apikey,e.SUPABASE_SERVICE_ROLE_KEY);return new Response('[]',{headers:{'content-type':'application/json'}});}});assert.equal(calls,1);assert.equal(out.result,'PASS');assert.equal(out.productionRequests,0);assert.equal(out.storageRequests,0);assert.ok(!JSON.stringify(out).includes(e.SUPABASE_SERVICE_ROLE_KEY));});
for(const [name,fetcher,code]of [
 ['unauthorized',async()=>new Response('private',{status:401}),'QA_AUTH_BLOCKED'],
 ['HTML',async()=>new Response('private',{headers:{'content-type':'text/html'}}),'QA_AUTH_BLOCKED'],
 ['unexpected row',async()=>new Response('[{"id":"private"}]',{headers:{'content-type':'application/json'}}),'QA_RESPONSE_BLOCKED'],
 ['network',async()=>{throw Error('private token detail')},'QA_AUTH_UNAVAILABLE'],
 ['oversize',async()=>new Response('private',{headers:{'content-type':'application/json','content-length':'2048'}}),'QA_RESPONSE_BLOCKED'],
])test(name+' never leaks response or retries',async()=>{let calls=0;await assert.rejects(verify(env(),{fetcher:async(...a)=>{calls++;return fetcher(...a)}}),e=>{assert.equal(diagnostic(e).code,code);assert.ok(!JSON.stringify(diagnostic(e)).includes('private'));return true;});assert.equal(calls,1);});
test('unexpected exception diagnostic discards all details',()=>{assert.deepEqual(diagnostic(Object.assign(Error('private'),{safeCode:'private',checks:{key:'private',context:true,token:true}})),{result:'BLOCKED',code:'CHECK_BLOCKED',checks:{context:true}});});
test('CLI is always non-publishable and needs explicit metadata',()=>{const r=spawnSync(process.execPath,['verify.mjs'],{encoding:'utf8',env:{}});assert.equal(r.status,78);const d=JSON.parse(r.stderr);assert.equal(d.code,'NETLIFY_BLOCKED');assert.equal(d.checks.netlify,false);assert.equal(r.stdout,'');});
