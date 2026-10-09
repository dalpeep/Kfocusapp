const test=require('node:test'),assert=require('node:assert/strict');
const {prepareEdit,editError}=require('../netlify/functions/lib/community-edit-policy');
const base={status:'approved',updated_at:'2026-10-09T00:00:00Z',category:'qna',region:'dallas',area:'dallas',
 title:'Synthetic question',body:'Synthetic safe content',author_name:'QA',details:{post_type:'question',topic:'QA'}};
test('safe edits preserve server status/version without accepting publication overrides',()=>{
 for(const status of ['approved','pending','hidden']){
  const next=prepareEdit({...base,status},{title:'Edited safe title',status:'approved',approved_at:'forged',moderation_reason:null,_expected_status:'forged'});
  assert.equal(next._expected_status,status);assert.equal(next._expected_updated_at,base.updated_at);
  for(const field of ['status','approved_at','moderation_reason','expires_at','extension_count'])assert.equal(field in next,false);
 }
});
test('noneditable states and unsafe edits are rejected without a write',()=>{
 for(const status of ['rejected','deleted','expired','sold'])assert.throws(()=>prepareEdit({...base,status},{}),{status:409});
 for(const body of ['https://example.invalid unsafe external link','xxxxxxxxxx','guaranteed income promotion'])
  assert.throws(()=>prepareEdit(base,{body}),{status:400});
 assert.throws(()=>prepareEdit({...base,updated_at:null},{}),{status:409});
});
test('database moderation conflicts are surfaced as reload-required 409',()=>{
 assert.equal(editError({code:'40001'}).status,409);
 assert.equal(editError({code:'23514'}).status,400);
});
