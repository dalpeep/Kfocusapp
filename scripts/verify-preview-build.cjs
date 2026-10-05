// Local static verification only. No deploy or network calls.
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
const key=role=>'test.'+Buffer.from(JSON.stringify({ref:'aaikttogoejfvxbosktg',role})).toString('base64url')+'.synthetic';
const env={PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,
  TEST_PREVIEW_MODE:'true',SITE_ID:'synthetic-test',TEST_NETLIFY_SITE_ID:'synthetic-test',SITE_NAME:'isolated-test',
  TEST_SUPABASE_PROJECT_REF:'aaikttogoejfvxbosktg',SUPABASE_URL:'https://aaikttogoejfvxbosktg.supabase.co',
  SUPABASE_ANON_KEY:key('anon'),APP_PUBLIC_URL:'https://isolated-test.netlify.app',COUPON_EMAIL_MODE:'dry-run'};
const result=spawnSync(process.execPath,['scripts/build-test-preview.cjs'],{cwd:root,env,encoding:'utf8'});
assert.equal(result.status,0,result.stderr);
let count=0;
function inspect(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  const file=path.join(dir,entry.name);
  if(entry.isDirectory()){inspect(file);continue}
  if(!/\.(js|html|css|json|xml|txt)$/.test(entry.name))continue;
  const content=fs.readFileSync(file,'utf8');
  assert.doesNotMatch(content,/ydrxuqmjzayejlnjzzew|https:\/\/(?:www\.)?daltownmap\.com|SUPABASE_SERVICE_ROLE_KEY/);
  assert.ok(!content.includes(key('service_role')));
  for(const match of content.matchAll(/eyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g)){
    const claims=JSON.parse(Buffer.from(match[1],'base64url').toString());
    assert.notEqual(claims.role,'service_role');assert.notEqual(claims.ref,'ydrxuqmjzayejlnjzzew');
  }
  count++;
}}
inspect(path.join(root,'test-dist'));
console.log(`PASS: ${count} static files inspected; synthetic build, no deployment.`);
