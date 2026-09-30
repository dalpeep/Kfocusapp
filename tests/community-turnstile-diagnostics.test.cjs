const test=require('node:test');
const assert=require('node:assert/strict');
const S=require('../netlify/functions/lib/community-security.js');

process.env.SUPABASE_URL='https://example.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY='test-only';
process.env.COMMUNITY_STORAGE_BUCKET='community-images';
process.env.COMMUNITY_TURNSTILE_SECRET_KEY='test-secret-not-for-logs';

async function runSiteverify(json,{status=200,token='test-token-not-for-logs'}={}){
  const previousFetch=global.fetch,previousInfo=console.info,lines=[];
  global.fetch=async()=>({ok:status>=200&&status<300,status,json:async()=>json});
  console.info=(...parts)=>lines.push(parts.join(' '));
  try{
    let error;
    try{await S.verifyTurnstile({headers:{'x-nf-client-connection-ip':'192.0.2.11'}},token)}catch(caught){error=caught}
    assert.equal(lines.length,1);
    if(token)assert.ok(!lines[0].includes(token));
    assert.ok(!lines[0].includes('test-secret-not-for-logs'));
    assert.ok(!lines[0].includes('192.0.2.11'));
    return{diagnostic:JSON.parse(lines[0].replace(/^\[community-turnstile\] /,'')),error};
  }finally{global.fetch=previousFetch;console.info=previousInfo}
}

test('successful Siteverify logs only approved diagnostics and preserves acceptance',async()=>{
  const {diagnostic,error}=await runSiteverify({success:true,hostname:'daltownmap.com',action:''});
  assert.equal(error,undefined);
  assert.deepEqual(diagnostic,{
    token_present:true,siteverify_http_status:200,siteverify_success:true,
    siteverify_error_codes:[],hostname_matches:true,action_empty:true
  });
});

test('failed Siteverify retains 403 and emits sanitized error codes only',async()=>{
  const {diagnostic,error}=await runSiteverify({success:false,'error-codes':['timeout-or-duplicate','unsafe value: secret']});
  assert.equal(error?.status,403);
  assert.equal(error?.message,'보안 확인에 실패했습니다.');
  assert.deepEqual(diagnostic.siteverify_error_codes,['timeout-or-duplicate']);
  assert.equal(diagnostic.siteverify_success,false);
  assert.equal(diagnostic.hostname_matches,false);
});

test('empty token and non-2xx Siteverify remain blocked',async()=>{
  const {diagnostic,error}=await runSiteverify({success:true,hostname:'other.invalid',action:'post_create'},{status:500,token:''});
  assert.equal(error?.status,403);
  assert.equal(diagnostic.token_present,false);
  assert.equal(diagnostic.siteverify_http_status,500);
  assert.equal(diagnostic.hostname_matches,false);
  assert.equal(diagnostic.action_empty,false);
});
