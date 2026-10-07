// Local All-scopes verification. Synthetic secrets only; no deployment or network.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
const key=role=>'eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({ref:'aaikttogoejfvxbosktg',role})).toString('base64url')+'.synthetic';
const secrets={SUPABASE_SERVICE_ROLE_KEY:key('service_role'),COMMUNITY_PASSWORD_PEPPER:'synthetic-private-pepper-1',COMMUNITY_RATE_LIMIT_HMAC_SECRET:'synthetic-private-hmac-2',COMMUNITY_TURNSTILE_SECRET_KEY:'synthetic-private-turnstile-3'};
const env={PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,ComSpec:process.env.ComSpec,TEMP:os.tmpdir(),TMP:os.tmpdir(),
 TEST_PREVIEW_MODE:'true',SITE_ID:'synthetic-test',TEST_NETLIFY_SITE_ID:'synthetic-test',SITE_NAME:'daltownmap-owner-preview',
 TEST_SUPABASE_PROJECT_REF:'aaikttogoejfvxbosktg',SUPABASE_URL:'https://aaikttogoejfvxbosktg.supabase.co',
 SUPABASE_ANON_KEY:key('anon'),APP_PUBLIC_URL:'https://daltownmap-owner-preview.netlify.app',COUPON_EMAIL_MODE:'dry-run',...secrets};
const out=path.join(root,'test-dist'),scratch=fs.mkdtempSync(path.join(os.tmpdir(),'owner-preview-verify-'));
const old=path.join(scratch,'previous-output');
if(fs.existsSync(out))fs.renameSync(out,old);
function inspect(content){
 for(const [name,value] of Object.entries(secrets)){
  assert.ok(!content.includes(value),'Secret value found: '+name);
  assert.ok(!content.includes(name),'Secret name found: '+name);
 }
 assert.doesNotMatch(content,/ydrxuqmjzayejlnjzzew|https:\/\/(?:www\.)?daltownmap\.com/);
 for(const match of content.matchAll(/eyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g)){
  const claims=JSON.parse(Buffer.from(match[1],'base64url').toString());
  assert.equal(claims.role,'anon');assert.equal(claims.ref,'aaikttogoejfvxbosktg');
 }
}
(async()=>{
 try{
  const result=spawnSync(process.platform==='win32'?'npm.cmd':'npm',['run','build:test-preview'],{cwd:root,env,encoding:'utf8',shell:process.platform==='win32'});
  assert.equal(result.status,0,'Synthetic npm build failed');
  inspect(result.stdout+result.stderr);
  let count=0;
  function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
   const file=path.join(dir,entry.name);
   if(entry.isDirectory())walk(file);else{inspect(fs.readFileSync(file).toString('utf8'));count++;}
  }}
  walk(out);
  const before={...process.env},oldFetch=global.fetch;
  try{
   for(const name of Object.keys(process.env))delete process.env[name];
   Object.assign(process.env,env);
   global.fetch=()=>{throw new Error('Network forbidden during verification');};
   const response=await require('../netlify/functions/config').handler();
   assert.equal(response.statusCode,200);inspect(response.body);
   assert.ok(response.body.includes(env.SUPABASE_URL));assert.ok(response.body.includes(env.SUPABASE_ANON_KEY));
   console.log('PASS: config response exposes Test URL/anon only; four secrets absent.');
  }finally{
   global.fetch=oldFetch;
   for(const name of Object.keys(process.env))delete process.env[name];Object.assign(process.env,before);
  }
  const reads=[];
  const projected=require('./preview-build-env.cjs')(new Proxy(env,{get(target,name){reads.push(name);if(name in secrets)throw new Error('Build read a server secret');return target[name];}}));
  assert.equal(require('../netlify/functions/lib/test-preview-guard').assertTestPreview(projected,{requireService:false}),true);
  for(const file of ['build-test-preview.cjs','assert-test-preview.cjs','preview-build-env.cjs']){
   const source=fs.readFileSync(path.join(__dirname,file),'utf8');
   for(const name of Object.keys(secrets))assert.ok(!source.includes(name),'Build source references secret: '+name);
  }
  console.log('PASS: build guard reads no server secret; npm run build:test-preview succeeds with All-scopes synthetic secrets.');
  console.log(`PASS: ${count} output files plus build logs inspected; four secrets and Production identity absent; no deployment.`);
 }finally{
  if(fs.existsSync(out))fs.renameSync(out,path.join(scratch,'verified-output'));
  if(fs.existsSync(old))fs.renameSync(old,out);
 }
})().catch(()=>{console.error('FAIL: preview verification failed; credentials not logged.');process.exitCode=1;});
