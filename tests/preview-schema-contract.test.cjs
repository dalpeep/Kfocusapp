const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const sql=read('supabase/owner-phase1b-test/06-preview-schema.sql');
test('Preview creates UUID coupons only after guarded empty reset and preserves API contracts',()=>{
  assert.match(sql,/project_ref='aaikttogoejfvxbosktg' and phase='reset' and storage_ready=true/);
  assert.match(sql,/Reset must leave application fixtures and Storage empty/);
  assert.match(sql,/create table public.coupons \(\s*id uuid/);
  assert.match(sql,/business_id bigint references public.businesses/);
  assert.match(sql,/business_ids bigint\[\]/);
  assert.doesNotMatch(sql,/alter column id type uuid|lpad\(id::text/);
  assert.match(sql,/coupon_id text not null/);
  assert.match(sql,/coupon_id uuid not null references public.coupons/);
  assert.match(sql,/entry_id uuid not null references public.coupon_entries/);
  assert.equal((sql.match(/^begin;/gm)||[]).length,1);
  assert.equal((sql.match(/^commit;/gm)||[]).length,1);
});
test('Community and winner canonical dependencies are embedded in order without drift',()=>{
  const generator=read('scripts/assemble-preview-schema.cjs');
  const files=[...new Set([...generator.matchAll(/'([^']+\.sql)'/g)].map(m=>m[1]).filter(f=>!f.includes('/')))];
  let last=0;
  for(const file of files){
    const expected=read('supabase/'+file).replace(/^\s*(begin|commit);\s*$/gmi,'').trim().replace('drop constraint community_marketplace_expiry_check','drop constraint if exists community_marketplace_expiry_check');
    const start=sql.indexOf('-- BEGIN SOURCE '+file);
    assert.ok(start>last,file);last=start;
    assert.ok(sql.includes(expected),file);
  }
  assert.match(sql,/community_rate_limit_take/);
  assert.match(sql,/community_retention_guard/);
  assert.match(sql,/business_specials_admin_access\(target_business_id text\)/);
});
test('Every allowlisted Function is guarded and Test config has no schedules',()=>{
  for(const name of fs.readdirSync(path.join(root,'netlify/test-functions'))){
    assert.match(read('netlify/test-functions/'+name),/requireTestPreview/);
  }
  const config=read('netlify/test-preview/netlify.toml');
  assert.doesNotMatch(config,/schedule\s*=/);
  assert.match(config,/netlify\/test-functions/);
  const raffle=read('netlify/test-functions/raffle-auto-draw.js');
  assert.match(raffle,/winner.handler/);
  assert.doesNotMatch(raffle,/coupon_entries|method:\s*['"]PATCH|schedule\s*[:=]/);
});
test('Test raffle accepts only explicit POST and authenticated canonical handler',async()=>{
  const guard=require('../netlify/functions/lib/test-preview-guard');
  const winner=require('../netlify/functions/event-winner-admin');
  const oldGuard=guard.requireTestPreview,oldHandler=winner.handler;
  guard.requireTestPreview=()=>true;
  let called=0;
  winner.handler=async event=>{called++;assert.equal(JSON.parse(event.body).action,'draw');return {statusCode:403}};
  try{
    const raffle=require('../netlify/test-functions/raffle-auto-draw');
    assert.equal((await raffle.handler({httpMethod:'GET'})).statusCode,405);
    assert.equal(called,0);
    assert.equal((await raffle.handler({httpMethod:'POST',body:'{}'})).statusCode,403);
    assert.equal(called,1);
  }finally{guard.requireTestPreview=oldGuard;winner.handler=oldHandler}
});
