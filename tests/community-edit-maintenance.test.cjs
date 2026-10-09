const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const gate=require('../netlify/functions/lib/community-edit-maintenance');
const S=require('../netlify/functions/lib/community-security');
const ref='aaikttogoejfvxbosktg';
const jwt=role=>'e30.'+Buffer.from(JSON.stringify({ref,role})).toString('base64url')+'.synthetic';
const env={TEST_PREVIEW_MODE:'true',TEST_COMMUNITY_EDIT_PAUSED:'true',SITE_ID:'synthetic-site',TEST_NETLIFY_SITE_ID:'synthetic-site',TEST_SUPABASE_PROJECT_REF:ref,SUPABASE_URL:`https://${ref}.supabase.co`,SUPABASE_ANON_KEY:jwt('anon'),SUPABASE_SERVICE_ROLE_KEY:jwt('service_role'),APP_PUBLIC_URL:'https://synthetic-preview.netlify.app',SITE_NAME:'synthetic-preview',COUPON_EMAIL_MODE:'dry-run'};
async function configured(fn){const before={...process.env};for(const key of ['RESEND_API_KEY','VITE_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_KEY','VITE_SUPABASE_ANON_KEY','NEXT_PUBLIC_SUPABASE_ANON_KEY'])delete process.env[key];Object.assign(process.env,env);try{await fn()}finally{for(const key of Object.keys(process.env))if(!(key in before))delete process.env[key];Object.assign(process.env,before)}}
test('pause requires verified Test identity and flag; Production unaffected',()=>{
 assert.equal(gate.blocked(env),true);assert.equal(gate.blocked({...env,TEST_COMMUNITY_EDIT_PAUSED:'false'}),false);
 assert.equal(gate.blocked({TEST_COMMUNITY_EDIT_PAUSED:'true'}),false);
 assert.throws(()=>gate.blocked({...env,SITE_ID:'wrong'}));
});
for(const [name,payload] of [['plain',{}],['image',{image_plan:[]}],['video',{video_url:'https://youtu.be/synthetic'}],['details',{details:{topic:'QA'}}]])test(name+' edit returns 503 before DB, rate limit or network',()=>configured(async()=>{
 const old={client:S.client,rateLimit:S.rateLimit,verifyTurnstile:S.verifyTurnstile},fetchBefore=global.fetch;let calls=0;
 const forbidden=()=>{calls++;throw Error('Must not reach DB/network')};S.client=forbidden;S.rateLimit=forbidden;S.verifyTurnstile=forbidden;global.fetch=forbidden;
 try{const out=await require('../netlify/functions/community-post-update').handler({httpMethod:'POST',body:JSON.stringify(payload)});assert.equal(out.statusCode,503);assert.equal(out.headers['Retry-After'],'60');assert.equal(JSON.parse(out.body).code,'COMMUNITY_EDIT_PAUSED');assert.match(JSON.parse(out.body).error,/다시 시도/);assert.equal(calls,0)}finally{Object.assign(S,old);global.fetch=fetchBefore}
}));
test('edit upload authorization and direct video admission blocked before client',()=>configured(async()=>{
 const old=S.client;let calls=0;S.client=()=>{calls++;throw Error('DB forbidden')};try{
 for(const [file,body] of [['community-upload-authorize',{post_id:'synthetic'}],['community-video-upload-admit',{}]]){const out=await require('../netlify/functions/'+file).handler({httpMethod:'POST',body:JSON.stringify(body)});assert.equal(out.statusCode,503)}assert.equal(calls,0);
 }finally{S.client=old}
}));
test('new upload and unpaused requests delegate without payload modification',()=>configured(async()=>{
 let calls=0;const wrapped=gate.wrap(async e=>{calls++;return e},{upload:true});const e={httpMethod:'POST',body:'{}'};assert.equal(await wrapped(e),e);assert.equal(calls,1);
 process.env.TEST_COMMUNITY_EDIT_PAUSED='false';const edit={httpMethod:'POST',body:'{"post_id":"QA"}'};assert.equal(await wrapped(edit),edit);assert.equal(calls,2);
}));
test('status is no-store and reveals no secrets',()=>configured(async()=>{const out=await require('../netlify/functions/community-edit-status').handler({httpMethod:'GET'});assert.equal(JSON.parse(out.body).edit_paused,true);assert.equal(out.headers['Cache-Control'],'no-store');assert.doesNotMatch(out.body,/synthetic-site|service_role|supabase/)}));
test('read/create/comments/admin endpoints have no maintenance imports; UI notice is separate',()=>{
 for(const name of ['community-post-create','community-comment-create','community-comment-update','community-comment-delete'])assert.doesNotMatch(fs.readFileSync(__dirname+'/../netlify/functions/'+name+'.js','utf8'),/community-edit-maintenance/);
 const ui=fs.readFileSync(__dirname+'/../assets/community-edit-maintenance.js','utf8');assert.match(ui,/data-owner-action="update"/);assert.match(ui,/임시 중단/);assert.match(ui,/stopImmediatePropagation/);
});
