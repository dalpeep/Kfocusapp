// Test Project ONLY. Run with OWNER_TEST_URL, OWNER_TEST_ANON_KEY,
// OWNER_TEST_SERVICE_KEY and OWNER_TEST_{ADMIN,USER,OWNER_A,OWNER_B}_PASSWORD.
// No values are printed or stored. Usage: node 05-migration-a-tests.cjs before|after|rollback
const assert = require('node:assert/strict');
const stage = process.argv[2];
if (!['before','after','rollback'].includes(stage)) throw new Error('Expected before|after|rollback');
const base = (process.env.OWNER_TEST_URL || '').replace(/\/$/,'');
const anon = process.env.OWNER_TEST_ANON_KEY || '';
const service = process.env.OWNER_TEST_SERVICE_KEY || '';
// Keep synthetic IDs inside int4 while avoiding collisions on repeated runs.
// The fixed 7000/8000/9000 IDs made a second after run report false failures
// for Special inserts because those test-only rows intentionally remain.
const runIdBase = 100000000 + Math.floor(Math.random() * 100000000);
assert.match(base, /^https:\/\/[a-z0-9-]+\.supabase\.co$/);
assert.ok(anon && service, 'Missing Test Project credentials');
assert.ok(!base.includes('ydrxuqmjzayejlnjzzew'), 'Production project is forbidden');
const output = [];
const check = (name, actual, expected) => {
  const ok = actual === expected;
  output.push({name, result: ok ? 'PASS' : 'FAIL', actual, expected});
};
async function request(path, method, key, token, body, extra={}) {
  const r = await fetch(base+path,{method,headers:{apikey:key,Authorization:`Bearer ${token}`,
    ...(body !== undefined ? {'Content-Type':'application/json'}:{}),...extra},
    body:body === undefined ? undefined : JSON.stringify(body)});
  return {status:r.status, body:await r.text()};
}
async function login(email, password) {
  assert.ok(password, `Missing password for ${email}`);
  const r=await request('/auth/v1/token?grant_type=password','POST',anon,anon,{email,password});
  assert.equal(r.status,200,`Synthetic Auth login failed for ${email}`);
  return JSON.parse(r.body).access_token;
}
const pass = (status) => status >= 200 && status < 300;
async function main() {
  const admin=await login('admin@test.invalid',process.env.OWNER_TEST_ADMIN_PASSWORD);
  const user=await login('user@test.invalid',process.env.OWNER_TEST_USER_PASSWORD);
  await login('owner-a@test.invalid',process.env.OWNER_TEST_OWNER_A_PASSWORD);
  await login('owner-b@test.invalid',process.env.OWNER_TEST_OWNER_B_PASSWORD);
  const roles=[['anon',anon,anon],['user',anon,user],['admin',anon,admin],['service',service,service]];
  const narrowed=stage==='after';
  for (const [name,key,token] of roles) {
    const businessRead=await request('/rest/v1/businesses?select=id&id=eq.1001','GET',key,token);
    check(`${name} business read`,pass(businessRead.status),true);
    const req=await request('/rest/v1/business_requests','POST',key,token,
      {business_name:`[TEST] ${stage} ${name}`,region:'dallas'});
    check(`${name} new-business request`,pass(req.status),true);
    if (name==='anon' || name==='user') {
      const b=await request('/rest/v1/businesses','POST',key,token,
        {name_ko:`[TEST] unauthorized ${name}`,region:'dallas'});
      check(`${name} business direct insert`,pass(b.status),!narrowed);
      const c=await request('/rest/v1/coupons','POST',key,token,
        {business_id:1001,title:`[TEST] unauthorized ${name}`});
      check(`${name} coupon direct insert`,pass(c.status),!narrowed);
      const p=await request('/rest/v1/posts','POST',key,token,
        {business_id:1001,type:'event',title:`[TEST] unauthorized ${name}`});
      check(`${name} post direct insert`,pass(p.status),!narrowed);
    }
    if (name==='anon') {
      const community=await request('/rest/v1/rpc/owner_test_community_create','POST',key,token,
        {p_title:'[TEST] anonymous Community',p_body:'Synthetic content'});
      check('anon Community server-path stand-in',pass(community.status),true);
    }
    if (name==='admin' || name==='service') {
      const idBase=runIdBase+(name==='admin'?0:100);
      for (const [offset,table,payload,change] of [
        [1,'businesses',{name_ko:`[TEST] ${stage} ${name}`,region:'dallas'},{name_ko:'[TEST] changed'}],
        [2,'coupons',{business_id:1001,title:`[TEST] ${stage} ${name}`},{title:'[TEST] changed'}],
        [3,'posts',{business_id:1001,type:'event',title:`[TEST] ${stage} ${name}`},{title:'[TEST] changed'}]
      ]) {
        const id=idBase+offset;
        const created=await request(`/rest/v1/${table}`,'POST',key,token,{id,...payload});
        check(`${name} ${table} insert`,pass(created.status),true);
        const updated=await request(`/rest/v1/${table}?id=eq.${id}`,'PATCH',key,token,change,
          {Prefer:'return=representation'});
        check(`${name} ${table} update`,pass(updated.status) && JSON.parse(updated.body||'[]').length===1,true);
        const deleted=await request(`/rest/v1/${table}?id=eq.${id}`,'DELETE',key,token,undefined,
          {Prefer:'return=representation'});
        check(`${name} ${table} delete`,pass(deleted.status) && JSON.parse(deleted.body||'[]').length===1,true);
      }
      const special=await request('/rest/v1/business_specials','POST',key,token,
        {id:idBase+4,business_id:1001,type:'lunch_special',title:'[TEST] Lunch'});
      check(`${name} Lunch Special insert`,pass(special.status),true);
      const happy=await request('/rest/v1/business_specials','POST',key,token,
        {id:idBase+5,business_id:1002,type:'happy_hour',title:'[TEST] Happy'});
      check(`${name} Happy Hour insert`,pass(happy.status),true);
    }
  }
  for (const [bucket,role,key,token,expected] of [
    ['public-images','anon',anon,anon,!narrowed],
    ['public-images','admin',anon,admin,true],
    ['community-images','service',service,service,true]
  ]) {
    const object=`migration-a/${stage}-${role}-${Date.now()}.txt`;
    const r=await fetch(`${base}/storage/v1/object/${bucket}/${object}`,{
      method:'POST',headers:{apikey:key,Authorization:`Bearer ${token}`,'Content-Type':'text/plain','x-upsert':'false'},body:'test'});
    check(`${role} ${bucket} upload`,pass(r.status),expected);
    if (pass(r.status)) {
      const d=await fetch(`${base}/storage/v1/object/${bucket}/${object}`,{
        method:'DELETE',headers:{apikey:key,Authorization:`Bearer ${token}`}});
      check(`${role} ${bucket} delete`,pass(d.status),role!=='anon' || !narrowed);
    }
  }
  // A service-created legacy object proves anonymous UPDATE/DELETE are denied
  // even when anonymous INSERT itself is denied after Migration A.
  const protectedPath=`migration-a/${stage}-protected-${Date.now()}.txt`;
  const seed=await fetch(`${base}/storage/v1/object/public-images/${protectedPath}`,{
    method:'POST',headers:{apikey:service,Authorization:`Bearer ${service}`,
      'Content-Type':'text/plain','x-upsert':'false'},body:'seed'});
  assert.ok(pass(seed.status),'Could not seed synthetic Storage object');
  const overwrite=await fetch(`${base}/storage/v1/object/public-images/${protectedPath}`,{
    method:'PUT',headers:{apikey:anon,Authorization:`Bearer ${anon}`,
      'Content-Type':'text/plain','x-upsert':'true'},body:'tamper'});
  check('anon Storage overwrite',pass(overwrite.status),!narrowed);
  const remove=await fetch(`${base}/storage/v1/object/public-images/${protectedPath}`,{
    method:'DELETE',headers:{apikey:anon,Authorization:`Bearer ${anon}`}});
  check('anon Storage delete',pass(remove.status),!narrowed);
  for (const row of output) console.log(`${row.result} ${row.name} (actual=${row.actual}, expected=${row.expected})`);
  if (output.some(x=>x.result==='FAIL')) process.exitCode=1;
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
