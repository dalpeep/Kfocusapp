const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path'),{createRequire}=require('module');
const securityPath=path.resolve('netlify/legacy-functions/lib/community-security.js'),realRequire=createRequire(securityPath);
function fixture({profile=null,app={},user={},profileError=null,invalid=false}={}){
 const calls=[],posts=[{id:'local',region:'dallas',status:'pending',category:'qna'},{id:'foreign',region:'austin',status:'pending',category:'qna'}];
 const db={auth:{getUser:async()=>invalid?{error:{}}:{data:{user:{id:'fixture',app_metadata:app,user_metadata:user}}}},from(table){
  let filters=[],write=null;const q={select(){return q},eq(k,v){filters.push([k,v]);return q},order(){return q},range(){return q},update(v){write=v;return q},maybeSingle:async()=>({data:profile,error:profileError}),single:async()=>({data:posts.find(p=>filters.every(([k,v])=>p[k]===v))||null,error:null}),then(resolve,reject){calls.push({table,filters,write});let rows=table==='community_posts'?posts.filter(p=>filters.every(([k,v])=>p[k]===v)):table==='community_comments'?[{id:'comment',post_id:filters.find(([k])=>k==='post_id')?.[1]}]:[];return Promise.resolve({data:rows,count:rows.length,error:null}).then(resolve,reject)}};return q}};
 const mod={exports:{}};vm.runInNewContext(fs.readFileSync(securityPath,'utf8'),{module:mod,exports:mod.exports,require:n=>n==='@supabase/supabase-js'?{createClient:()=>db}:realRequire(n),process:{env:{SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture',COMMUNITY_STORAGE_BUCKET:'community-images'}},Buffer,console:{error(){}}});
 const admin={exports:{}};vm.runInNewContext(fs.readFileSync('netlify/legacy-functions/community-admin.js','utf8'),{module:admin,exports:admin.exports,require:n=>n==='./lib/community-security'?mod.exports:{adminStatusChanges:(_p,status)=>({status})}});
 return{calls,verify:(region='dallas',headers={authorization:'Bearer fixture'})=>mod.exports.verifyAdmin({headers},region),call:(body)=>admin.exports.handler({httpMethod:'POST',headers:{authorization:'Bearer fixture'},body:JSON.stringify(body)})};
}
for(const role of ['super_admin','regional_editor','owner','paid','free'])test('untrusted role rejected: '+role,async()=>{await assert.rejects(fixture({user:{role,area:'dallas'}}).verify(),e=>e.status===403)});
for(const role of ['user','owner','free','paid'])test('profile non-admin cannot be overridden: '+role,async()=>{await assert.rejects(fixture({profile:{role},app:{role:'super_admin'},user:{role:'super_admin'}}).verify(),e=>e.status===403)});
test('trusted profile super_admin preserved',async()=>assert.equal((await fixture({profile:{role:'super_admin'}}).verify('austin')).role,'super_admin'));
test('trusted app_metadata super_admin preserved without profile',async()=>assert.equal((await fixture({app:{role:'super_admin'}}).verify('austin')).role,'super_admin'));
test('missing profiles compatibility permits trusted metadata',async()=>assert.equal((await fixture({app:{role:'super_admin'},profileError:{code:'42P01'}}).verify()).role,'super_admin'));
test('authorization lookup outage fails closed',async()=>assert.rejects(fixture({app:{role:'super_admin'},profileError:{code:'08006'}}).verify(),e=>e.status===503));
test('missing auth rejected',async()=>assert.rejects(fixture().verify('dallas',{}),e=>e.status===401));
test('invalid session rejected',async()=>assert.rejects(fixture({invalid:true}).verify(),e=>e.status===401));
test('regional scope cannot be taken from user metadata',async()=>assert.rejects(fixture({profile:{role:'regional_editor'},user:{area:'dallas'}}).verify(),e=>e.status===403));
test('role and area cannot be mixed across authorities',async()=>assert.rejects(fixture({profile:{role:'regional_editor'},app:{role:'super_admin',area:'dallas'}}).verify(),e=>e.status===403));
for(const authority of ['profile','app'])for(const action of ['list','comments','status','category','comment_status']){
 const config={[authority]:{role:'regional_editor',area:'dallas'}};
 test(authority+' regional '+action+' denies foreign target',async()=>{const f=fixture(config),r=await f.call({action,region:action==='list'?'austin':'dallas',id:'foreign',post_id:'foreign',comment_id:'comment',status:'approved',category:'qna'});assert.equal(r.statusCode,403);assert.equal(f.calls.filter(x=>x.write).length,0);assert.equal(f.calls.filter(x=>x.table==='community_comments').length,0)});
 test(authority+' regional '+action+' permits local target',async()=>{const f=fixture(config),r=await f.call({action,region:'dallas',id:'local',post_id:'local',comment_id:'comment',status:'approved',category:'qna'});assert.equal(r.statusCode,200);if(action==='list')assert.ok(JSON.parse(r.body).rows.every(p=>p.region==='dallas'))});
}
for(const action of ['list','comments','status','category','comment_status'])test('super_admin '+action+' permits other region',async()=>{const f=fixture({profile:{role:'super_admin'}}),r=await f.call({action,region:'austin',id:'foreign',post_id:'foreign',comment_id:'comment',status:'approved',category:'qna'});assert.equal(r.statusCode,200)});
test('nonexistent comment parent returns 404 before comments',async()=>{const f=fixture({profile:{role:'super_admin'}});assert.equal((await f.call({action:'comments',post_id:'missing'})).statusCode,404);assert.equal(f.calls.length,0)});
test('Modern adapter preserves authenticated regional access and JSON errors',async()=>{
 const {adapt}=await import('../../netlify/migration/adapter.mjs');
 for(const [id,status]of [['local',200],['foreign',403]]){
  const f=fixture({profile:{role:'regional_editor',area:'dallas'}});
  const response=await adapt(event=>f.call(JSON.parse(event.body)))(new Request('https://fixture.invalid/.netlify/functions/community-admin',{method:'POST',headers:{authorization:'Bearer fixture','content-type':'application/json'},body:JSON.stringify({action:'comments',region:'dallas',post_id:id})}),{requestId:'fixture',site:{id:'fixture'},deploy:{id:'fixture'}});
  assert.equal(response.status,status);assert.match(response.headers.get('content-type'),/application\/json/);assert.equal((await response.json()).ok,status===200);
 }
});
test('retained Native helper uses exactly the same hardened authorization',()=>assert.equal(fs.readFileSync('netlify/functions/lib/community-security.js','utf8'),fs.readFileSync(securityPath,'utf8')));
