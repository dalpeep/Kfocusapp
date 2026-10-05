const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const reset=read('supabase/owner-phase1b-test/08-preview-reset.sql');
const {assertIdentity,objectPattern,main}=require('../scripts/prepare-preview-storage.cjs');
test('Diagnostic errors expose only allowlisted reasons and numeric HTTP status',()=>{
  const {safeFailure}=require('../scripts/prepare-preview-storage.cjs');
  assert.equal(safeFailure(new Error('Wrong owner-test URL')),'Wrong owner-test URL');
  assert.equal(safeFailure(new Error('Test API HTTP 401')),'Test API HTTP 401');
  assert.equal(safeFailure(new Error('secret-value response payload')),'Test Storage preparation failed');
});
test('Actual owner-test ref is 20 characters and the truncated legacy ref is rejected locally',()=>{
  const ref='aaikttogoejfvxbosktg';
  assert.equal(ref.length,20);
  assert.equal(ref,'aaikttogoejfvxbosktg');
  const jwt=r=>'test.'+Buffer.from(JSON.stringify({ref:r,role:'service_role'})).toString('base64url')+'.synthetic';
  assert.doesNotThrow(()=>assertIdentity({OWNER_TEST_URL:`https://${ref}.supabase.co`,OWNER_TEST_SERVICE_KEY:jwt(ref)}));
  for(const mistaken of ['aaikttgoejfvxbosktg','aaikttgoejfvxbosktgg']) {
    assert.throws(()=>assertIdentity({OWNER_TEST_URL:`https://${ref}.supabase.co`,OWNER_TEST_SERVICE_KEY:jwt(mistaken)}),/Wrong Test JWT ref\/role/);
  }
  assert.throws(()=>assertIdentity({OWNER_TEST_URL:`https://${ref}.supabase.co`,OWNER_TEST_SERVICE_KEY:jwt(ref.slice(0,-1))}),/Wrong Test JWT ref\/role/);
});
test('Reset validates the actual Test baseline before any deletion and preserves managed schemas',()=>{
  const before=reset.slice(0,reset.indexOf('delete from public.business_special_items'));
  assert.match(before,/Original disposable Test marker required/);
  assert.match(before,/Wrong platform project ref/);
  assert.match(before,/Only the four known synthetic Auth users/);
  assert.match(before,/Fixture counts differ/);
  assert.match(before,/Reviewed inventory identities changed/);
  const approved=before.split('with expected(object_kind,object_id) as (values')[1].split('), actual as (')[0];
  assert.equal([...approved.matchAll(/\('[^']+','[^']+'\)/g)].length,66);
  assert.equal([...approved.matchAll(/\('storage:public-images','migration-a\/after-protected-[0-9]+[.]txt'\)/g)].length,3);
  assert.match(before,/select \* from actual except select \* from expected/);
  assert.match(before,/select \* from expected except select \* from actual/);
  assert.match(before,/Unrecognized\/customer-like row/);
  assert.match(before,/External fixture-table dependency/);
  assert.match(before,/Unrecognized Storage object/);
  assert.match(before,/Unknown Storage policy/);
  assert.doesNotMatch(reset,/delete\s+from\s+(auth\.|storage\.)|truncate\s|drop\s+(schema|table).*cascade/i);
  for(const table of ['coupons','businesses','posts','community_posts','business_requests','business_specials','business_special_items']){
    assert.match(reset,new RegExp('delete from public\\.'+table+' where'));
  }
  assert.match(reset,/drop table public.coupons restrict/);
  assert.match(reset,/drop function public.owner_test_admin_access\(bigint\) restrict/);
});
test('Migration A baseline policy names are retained but wildcard Storage writes are gone',()=>{
  const original=read('supabase/owner-phase1b-test/02-test-current-policies.sql');
  const migration=read('supabase/owner-phase1b-security-a.sql');
  const names=[...migration.matchAll(/\('storage','objects','([^']+)'\)/g)].map(m=>m[1]);
  assert.equal(names.length,17);
  for(const name of names){assert.ok(reset.includes("'"+name+"'"));assert.ok(original.includes("'"+name+"'"))}
  assert.match(reset,/predicate := 'bucket_id = ''public-images'' and name like ''migration-a\/%''';/);
  assert.match(reset,/as restrictive\s+for insert to anon,authenticated with check\(bucket_id <> 'community-images'\)/);
  assert.match(reset,/as restrictive\s+for update to anon,authenticated/);
  assert.match(reset,/as restrictive\s+for delete to anon,authenticated/);
  assert.doesNotMatch(reset,/grant truncate on storage/);
});
test('Storage API helper rejects Production identity and accepts only recorded legacy fixture paths',()=>{
  const jwt=(ref,role)=>'test.'+Buffer.from(JSON.stringify({ref,role})).toString('base64url')+'.synthetic';
  const valid={OWNER_TEST_URL:'https://aaikttogoejfvxbosktg.supabase.co',OWNER_TEST_SERVICE_KEY:jwt('aaikttogoejfvxbosktg','service_role')};
  assert.doesNotThrow(()=>assertIdentity(valid));
  assert.throws(()=>assertIdentity({...valid,OWNER_TEST_URL:'https://production.invalid'}));
  assert.throws(()=>assertIdentity({...valid,OWNER_TEST_SERVICE_KEY:jwt('ydrxuqmjzayejlnjzzew','service_role')}));
  assert.throws(()=>assertIdentity({...valid,OWNER_TEST_SERVICE_KEY:jwt('aaikttogoejfvxbosktg','anon')}));
  assert.ok(objectPattern.test('migration-a/rollback-protected-1234.txt'));
  for(const name of ['customer/avatar.png','migration-a/photo.jpg','migration-a/../../customer.txt','community-posts/user-image.webp'])assert.equal(objectPattern.test(name),false);
  const helper=read('scripts/prepare-preview-storage.cjs');
  assert.ok(helper.indexOf('if(!apply){')<helper.indexOf("'DELETE'"));
  assert.match(helper,/bucket\/community-images','PUT'/);
});
test('Storage plan uses read-only GET/list; apply deletes exact manifest paths then verifies before readiness',async()=>{
  const key='test.'+Buffer.from(JSON.stringify({ref:'aaikttogoejfvxbosktg',role:'service_role'})).toString('base64url')+'.synthetic';
  const env={OWNER_TEST_URL:'https://aaikttogoejfvxbosktg.supabase.co',OWNER_TEST_SERVICE_KEY:key};
  const calls=[];
  const fixturePaths=['migration-a/after-protected-1791089841006.txt','migration-a/after-protected-1791091355756.txt','migration-a/after-protected-1791091543255.txt'];
  let removed=false;
  const mock=async(url,opt)=>{
    calls.push({url,method:opt.method,body:opt.body&&JSON.parse(opt.body)});
    let data;
    if(url.includes('owner_test_preview_state')&&opt.method==='GET')data=[{project_ref:'aaikttogoejfvxbosktg',phase:'reset',storage_ready:false}];
    else if(url.includes('owner_test_preview_manifest'))data=fixturePaths.map(object_id=>({object_kind:'storage:public-images',object_id}));
    else if(url.endsWith('/storage/v1/bucket'))data=['public-images','community-images','media','business-media','coupon-media','banner-media','ktownad'].map(id=>({id,public:true}));
    else if(url.includes('/object/list/public-images')&&!removed)data=opt.body.includes('"prefix":"migration-a"')
      ?fixturePaths.map((p,i)=>({id:'fixture-'+i,name:p.slice('migration-a/'.length)})):[{id:null,name:'migration-a'}];
    else if(url.includes('/object/list/'))data=[];
    else if(opt.method==='PATCH')data=[{storage_ready:true}];
    else {if(opt.method==='DELETE')removed=true;data={ok:true};}
    return {ok:true,json:async()=>data};
  };
  await main(env,[],mock,()=>{});
  assert.ok(calls.every(c=>c.method==='GET'||(c.method==='POST'&&c.url.includes('/object/list/'))));
  calls.length=0;
  await main(env,['--apply'],mock,()=>{});
  const deletion=calls.find(c=>c.method==='DELETE');
  assert.deepEqual(deletion.body,{prefixes:fixturePaths});
  assert.equal(calls.at(-1).method,'PATCH');
  assert.ok(calls.some(c=>c.method==='PUT'&&c.body.public===true));
  calls.length=0;
  await assert.rejects(main(env,['--apply'],async(url,opt)=>{
    if(url.includes('/object/list/'))return {ok:true,json:async()=>[{name:'unexpected'}]};
    return mock(url,opt);
  },()=>{}));
  assert.ok(!calls.some(c=>c.method==='PATCH'));
  assert.ok(!calls.some(c=>c.method==='DELETE'||c.method==='PUT'));
  await assert.rejects(main(env,['--apply'],async(url,opt)=>{
    if(url.includes('owner_test_preview_manifest'))return {ok:true,json:async()=>[{object_kind:'storage:public-images',object_id:'migration-a/before-protected-123.txt'}]};
    return mock(url,opt);
  },()=>{}),/Exact approved three-object manifest/);
  await assert.rejects(main(env,['--plan'],async(url,opt)=>{
    if(url.includes('/object/list/'))return {ok:true,json:async()=>[{name:'unexpected'}]};
    return mock(url,opt);
  },()=>{}),/Unexpected live Storage path/);
});
test('Fixtures require the schema phase, empty tables, preserved Auth users and manual raffle',()=>{
  const seed=read('supabase/owner-phase1b-test/07-preview-fixtures.sql');
  assert.match(seed,/phase='schema' and storage_ready=true/);
  assert.match(seed,/Fixture tables must be empty/);
  assert.match(seed,/owner-a@test.invalid/);
  assert.match(seed,/array\[1001,1002\]::bigint\[\]/);
  assert.doesNotMatch(seed,/'auto'|insert into public.coupon_entries|delete from auth/);
});
