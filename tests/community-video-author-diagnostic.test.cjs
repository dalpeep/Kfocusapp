const {test}=require('node:test');
const assert=require('node:assert/strict');
const S=require('../netlify/functions/lib/community-security');
const {handler}=require('../netlify/functions/community-video-author-diagnostic');

const postId='a04221f7-06b6-448b-a21e-5c89a9dda24f';
const event=(overrides={})=>({httpMethod:'POST',headers:{host:'daltownmap.com',
  origin:'https://daltownmap.com','content-type':'application/json'},
  body:JSON.stringify({post_id:postId,password:'test-only',turnstile_token:'test-token'}),
  ...overrides});

test('diagnostic rejects other posts and invalid requests before credential checks',async()=>{
  const absent=await handler(event({body:JSON.stringify({post_id:'00000000-0000-4000-8000-000000000001',
    password:'test-only',turnstile_token:'test-token'})}));
  assert.equal(absent.statusCode,404);
  assert.equal((await handler(event({httpMethod:'GET'}))).statusCode,405);
  assert.equal((await handler(event({headers:{host:'daltownmap.com',origin:'https://evil.example',
    'content-type':'application/json'}}))).statusCode,404);
  assert.equal((await handler(event({headers:{host:'daltownmap.com',origin:'https://daltownmap.com',
    'content-type':'text/plain'}}))).statusCode,400);
});

test('diagnostic only verifies Turnstile and reads one hash; no job or ticket',async()=>{
  const original={client:S.client,verifyTurnstile:S.verifyTurnstile,verifyPassword:S.verifyPassword};
  const prior=process.env.COMMUNITY_PASSWORD_PEPPER;
  const calls=[];const logs=[];const oldInfo=console.info;
  process.env.COMMUNITY_PASSWORD_PEPPER='test-only-pepper';
  S.verifyTurnstile=async()=>{calls.push('turnstile')};
  S.client=()=>({from(name){assert.equal(name,'community_posts');return{select(columns){
    assert.equal(columns,'password_hash');return{eq(column,id){
      assert.equal(column,'id');assert.equal(id,postId);return{async maybeSingle(){
        calls.push('select');return{data:{password_hash:'test-hash'}}}}}}}}}});
  S.verifyPassword=(value,stored)=>{calls.push('verify');assert.equal(value,'test-only');
    assert.equal(stored,'test-hash');return true};
  console.info=(...args)=>logs.push(args);
  try{
    const result=await handler(event());
    assert.equal(result.statusCode,200);
    assert.deepEqual(JSON.parse(result.body),{ok:true,status:'AUTHOR_VERIFICATION_OK'});
    assert.deepEqual(calls,['turnstile','select','verify']);
    assert.deepEqual(logs,[['[community-video-author-diagnostic]','AUTHOR_VERIFICATION_OK']]);
    assert.doesNotMatch(result.body,/test-only|test-hash|pepper|ticket|job/);
    S.verifyPassword=()=>false;
    const failed=await handler(event());
    assert.deepEqual(JSON.parse(failed.body),{ok:false,status:'AUTHOR_VERIFICATION_FAILED'});
  }finally{
    Object.assign(S,original);console.info=oldInfo;
    if(prior===undefined)delete process.env.COMMUNITY_PASSWORD_PEPPER;
    else process.env.COMMUNITY_PASSWORD_PEPPER=prior;
  }
});

test('missing pepper name is reported without reading its value or querying the DB',async()=>{
  const original={client:S.client,verifyTurnstile:S.verifyTurnstile};
  const prior=process.env.COMMUNITY_PASSWORD_PEPPER;const oldInfo=console.info;
  delete process.env.COMMUNITY_PASSWORD_PEPPER;
  S.verifyTurnstile=async()=>{};
  S.client=()=>{throw new Error('DB must not be called')};
  console.info=()=>{};
  try{
    const result=await handler(event());
    assert.deepEqual(JSON.parse(result.body),{ok:false,status:'PASSWORD_CONFIG_MISSING'});
  }finally{
    Object.assign(S,original);console.info=oldInfo;
    if(prior!==undefined)process.env.COMMUNITY_PASSWORD_PEPPER=prior;
  }
});
