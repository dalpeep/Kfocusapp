'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {authenticate}=require('./service-role-check.cjs');
const env={SUPABASE_URL:'https://hseaeafmmjnbynfyynao.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'SYNTHETIC_PRIVATE_DO_NOT_LOG'};
test('single QA read proves HTTP200 and logs only result fields',async()=>{let calls=0;const logs=[];const result=await authenticate(env,async(url,options)=>{calls++;assert.equal(new URL(url).origin,env.SUPABASE_URL);assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert(options.signal);assert.equal(options.headers.apikey,env.SUPABASE_SERVICE_ROLE_KEY);assert(!options.body);return new Response('{"users":[{"email":"private@example.test"}]}',{status:200,headers:{'x-private':'not logged'}})},row=>logs.push(row));assert.equal(calls,1);assert.deepEqual(result,{authenticated:true,qaProject:true});assert.deepEqual(logs,[{stage:'QA_SERVICE_ROLE_AUTH_RESULT',result:'PASS',code:'QA_READ_AUTH_OK',httpStatus:200,attempts:1,qaProject:true}]);assert(!JSON.stringify(logs).includes('private@example.test'));assert(!JSON.stringify(logs).includes(env.SUPABASE_SERVICE_ROLE_KEY));});
for(const status of [301,400,401,403,429,500,503])test('HTTP'+status+' fails once without raw body or headers in diagnostics',async()=>{let calls=0;const logs=[];await assert.rejects(authenticate(env,async()=>{calls++;return new Response('private failure '+env.SUPABASE_SERVICE_ROLE_KEY,{status,headers:{Authorization:'private'}})},row=>logs.push(row)),/^Error: QA_SERVICE_ROLE_AUTH_FAILED$/);assert.equal(calls,1);assert.equal(logs.length,1);assert.equal(logs[0].result,'FAIL');assert.equal(logs[0].httpStatus,status);assert(!JSON.stringify(logs).includes(env.SUPABASE_SERVICE_ROLE_KEY));});
for(const patch of [{SUPABASE_URL:'https://ydrxuqmjzayejlnjzzew.supabase.co'},{SUPABASE_URL:'https://hseaeafmmjnbynfyynao.supabase.co.attacker.test'},{SUPABASE_SERVICE_ROLE_KEY:''},{SUPABASE_URL:undefined}])test('target or credential presence mismatch prevents all requests '+Object.keys(patch)[0],async()=>{const logs=[];await assert.rejects(authenticate({...env,...patch},()=>assert.fail('no request allowed'),row=>logs.push(row)),/QA_SERVICE_ROLE_AUTH_FAILED/);assert.equal(logs[0].result,'NOT TESTED');assert.equal(logs[0].attempts,0);});
test('timeout/network original error is never propagated or retried',async()=>{let calls=0;const logs=[];await assert.rejects(authenticate(env,async()=>{calls++;throw Error('Bearer '+env.SUPABASE_SERVICE_ROLE_KEY)},row=>logs.push(row)),/^Error: QA_SERVICE_ROLE_AUTH_FAILED$/);assert.equal(calls,1);assert.equal(logs[0].code,'QA_AUTH_NETWORK_FAILED');assert(!JSON.stringify(logs).includes(env.SUPABASE_SERVICE_ROLE_KEY));});
test('unreadable response cannot be a successful authentication',async()=>{const logs=[];await assert.rejects(authenticate(env,async()=>({status:200,arrayBuffer(){throw Error('private')}}),row=>logs.push(row)),/QA_SERVICE_ROLE_AUTH_FAILED/);assert.equal(logs[0].code,'QA_AUTH_RESPONSE_FAILED');assert.equal(logs[0].result,'FAIL');});
test('denied authentication stops the real builder before creating any overlay or public artifact',async()=>{
 const fs=require('node:fs'),cp=require('node:child_process'),{fixture}=require('./synthetic.cjs'),{main}=require('./canary-build.cjs');
 const f=fixture();f.seal.commit=cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();f.env.COMMIT_REF=f.seal.commit;f.env.OWNER_QA_PREVIEW_APPROVAL=JSON.stringify(f.seal);
 const paths=['.qa-preview-public','.release-artifacts/approved-canary-overlay'],before=paths.map(p=>fs.existsSync(p)),logs=[];
 const originalFetch=global.fetch,originalLog=console.log;let calls=0;
 global.fetch=async()=>{calls++;return new Response('synthetic-private',{status:401})};console.log=line=>logs.push(JSON.parse(line));
 try{await assert.rejects(main(f.env),/^Error: QA_SERVICE_ROLE_AUTH_FAILED$/);}finally{global.fetch=originalFetch;console.log=originalLog;}
 assert.equal(calls,1);assert.deepEqual(paths.map(p=>fs.existsSync(p)),before);assert.equal(logs.length,1);assert.equal(logs[0].result,'FAIL');assert.equal(logs[0].httpStatus,401);
});

test('Owner OFF authentication-only reports once and stops before any artifact writes',async()=>{
 const fs=require('node:fs'),cp=require('node:child_process'),{main,SITE,QA,ORIGIN,HEAD}=require('./build-only.cjs');
 const sha=cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 const seal={buildApproved:true,runtimeApproved:false,pr:55,head:HEAD,commit:sha,serviceAuthenticationApproved:true,execution:'authenticate-only'};
 const e={SITE_ID:SITE,CONTEXT:'deploy-preview',NETLIFY:'true',PULL_REQUEST:'true',REVIEW_ID:'55',HEAD,BRANCH:'pull/55/head',COMMIT_REF:sha,DEPLOY_PRIME_URL:ORIGIN,OWNER_UUID_ORIGIN:ORIGIN,OWNER_UUID_PROJECT_REF:QA,SUPABASE_URL:`https://${QA}.supabase.co`,SUPABASE_ANON_KEY:'synthetic-public',SUPABASE_SERVICE_ROLE_KEY:env.SUPABASE_SERVICE_ROLE_KEY,OWNER_UUID_ENABLED:'false',OWNER_NOTIFICATION_WORKER_ENABLED:'false',OWNER_NOTIFICATION_MODE:'mock',OWNER_QA_BUILD_ONLY_APPROVAL:JSON.stringify(seal)};
 for(const status of [200,401]){
  const logs=[],originalFetch=global.fetch,originalLog=console.log,originalMkdir=fs.mkdirSync,originalWrite=fs.writeFileSync;let calls=0;
  global.fetch=async()=>{calls++;return new Response('synthetic-private-response',{status})};console.log=line=>logs.push(JSON.parse(line));
  fs.mkdirSync=fs.writeFileSync=()=>assert.fail('authentication-only must not write artifacts');
  try{await assert.rejects(main(e),status===200?/QA_AUTH_COMPLETE_NO_DEPLOY/:/QA_SERVICE_ROLE_AUTH_FAILED/);}finally{global.fetch=originalFetch;console.log=originalLog;fs.mkdirSync=originalMkdir;fs.writeFileSync=originalWrite;}
  assert.equal(calls,1);const result=logs.filter(x=>x.stage==='QA_SERVICE_ROLE_AUTH_RESULT');assert.equal(result.length,1);assert.equal(result[0].result,status===200?'PASS':'FAIL');assert.equal(result[0].httpStatus,status);assert(!JSON.stringify(logs).includes(env.SUPABASE_SERVICE_ROLE_KEY));assert(!JSON.stringify(logs).includes('synthetic-private-response'));
 }
});
