const test=require('node:test');
const assert=require('node:assert/strict');
const auth=require('../assets/admin-authorization.js');

const user=(role,area,source='user_metadata')=>({id:'synthetic-user',[source]:{role,area}});

test('existing valid profile remains authoritative',()=>{
  const result=auth.resolve({user:user('regional_editor','colorado'),profile:{role:'regional_editor',area:'dallas'}});
  assert.deepEqual({...result},{ok:true,role:'regional_editor',area:'dallas',source:'profile'});
});
test('missing profile row uses explicit valid metadata',()=>assert.equal(auth.resolve({user:user('regional_editor','dallas'),profile:null,error:null}).ok,true));
test('missing profiles schema-cache error uses explicit valid metadata',()=>assert.equal(auth.resolve({user:user('regional_editor','dallas'),error:{code:'PGRST205',message:"Could not find the table 'public.profiles' in the schema cache"}}).ok,true));
test('missing profiles table without admin metadata is denied',()=>assert.equal(auth.resolve({user:{id:'ordinary'},error:{code:'42P01',message:'relation public.profiles does not exist'}}).ok,false));
test('ordinary authenticated user is denied',()=>assert.equal(auth.resolve({user:user('member','dallas'),profile:null}).ok,false));
test('regional editor is limited to Dallas scope',()=>{const access=auth.resolve({user:user('regional_editor','dallas')});assert.equal(auth.permitsArea(access,'dallas'),true);assert.equal(auth.permitsArea(access,'colorado'),false);});
test('regional editor with unsupported area is denied',()=>assert.equal(auth.resolve({user:user('regional_editor','houston')}).ok,false));
test('invalid profile role is denied without metadata fallback',()=>assert.equal(auth.resolve({user:user('super_admin','all'),profile:{role:'member',area:'dallas'}}).ok,false));
test('transient profile lookup error fails closed',()=>assert.deepEqual(auth.resolve({user:user('super_admin','all'),error:{code:'503',message:'network unavailable'}}).reason,'profile_lookup_failed'));
test('super admin behavior remains unrestricted',()=>{const access=auth.resolve({user:user('super_admin','all','app_metadata')});assert.equal(access.ok,true);assert.equal(auth.permitsArea(access,'dallas'),true);assert.equal(auth.permitsArea(access,'colorado'),true);});
