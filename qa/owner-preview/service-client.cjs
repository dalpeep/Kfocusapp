'use strict';
// Only run in the network-none synthetic Auth/PostgREST/Storage namespace.
const fs=require('node:fs'),crypto=require('node:crypto'),Module=require('node:module'),path=require('node:path');
const {createClient}=require('@supabase/supabase-js');
const {QA,SITE,qaFetch,requireQa,assessRuntime,sealBuild}=require('./runtime.cjs');
const {qaImageSource}=require('./materialize.cjs');
const ids=JSON.parse(process.env.TEST_USERS),a='20000000-0000-4000-8000-000000000001',b='20000000-0000-4000-8000-000000000002';
const seal={buildApproved:true,runtimeApproved:true,site:SITE,project:QA,pr:999,head:'dev/owner-qa-synthetic',commit:'a'.repeat(40),actors:Object.values(ids),businesses:[a,b]};
Object.assign(process.env,{URL:'https://daltownmap-owner-uuid-qa.netlify.app',SITE_ID:SITE,SUPABASE_URL:`https://${QA}.supabase.co`,OWNER_UUID_PROJECT_REF:QA,CONTEXT:'deploy-preview',NETLIFY:'true',PULL_REQUEST:'true',REVIEW_ID:'999',HEAD:seal.head,BRANCH:'pull/999/head',COMMIT_REF:seal.commit,DEPLOY_PRIME_URL:'https://deploy-preview-999--daltownmap-owner-uuid-qa.netlify.app',OWNER_UUID_ORIGIN:'https://deploy-preview-999--daltownmap-owner-uuid-qa.netlify.app',OWNER_UUID_ENABLED:'true',OWNER_UUID_ENV:'qa',OWNER_COUPON_PROTOCOL:'v2',OWNER_UUID_CANARY_MODE:'true',OWNER_NOTIFICATION_ACTORS:Object.values(ids).join(','),OWNER_NOTIFICATION_BUSINESSES:[a,b].join(','),OWNER_NOTIFICATION_WORKER_ENABLED:'false',OWNER_NOTIFICATION_MODE:'mock',SUPABASE_ANON_KEY:process.env.TEST_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY:process.env.TEST_SERVICE_KEY});
const runtimeSeal=sealBuild(process.env,seal);
let requests=0;
// QA origin is routed to local real services; container has no external network.
const transport=qaFetch(process.env,runtimeSeal,async(input,options)=>{const u=new URL(input);let port,p;if(u.pathname.startsWith('/auth/v1/')){port=9999;p=u.pathname.slice(8);}else if(u.pathname.startsWith('/rest/v1/')){port=3000;p=u.pathname.slice(8);}else if(u.pathname.startsWith('/storage/v1/')){port=5000;p=u.pathname.slice(11);}else throw Error('PATH_DENIED');requests++;return fetch('http://127.0.0.1:'+port+p+u.search,options);});
const options={global:{fetch:transport},auth:{persistSession:false,autoRefreshToken:false}},db=createClient(process.env.SUPABASE_URL,process.env.TEST_SERVICE_KEY,options);
const checks=[],check=(name,ok)=>{if(!ok)throw Error('CHECK_'+name);checks.push({case:name,pass:true});};
(async()=>{
 check('QA routing approved only; real authentication still required',assessRuntime(process.env,runtimeSeal).allowed);
 const sessions={};
 for(const who of ['free','paid','other','pending','admin']){
  const link=await db.auth.admin.generateLink({type:'magiclink',email:who+'@owner.synthetic.invalid'});check(who+' local link generated without SMTP',!link.error);
  const client=createClient(process.env.SUPABASE_URL,process.env.TEST_ANON_KEY,options);
  const verified=await client.auth.verifyOtp({token_hash:link.data.properties.hashed_token,type:'magiclink'});check(who+' real Auth session',!verified.error&&verified.data.user.id===ids[who]);sessions[who]=verified.data.session.access_token;
  const refresh=await client.auth.refreshSession();check(who+' session refresh remains valid',!refresh.error&&refresh.data.user.id===ids[who]);sessions[who]=refresh.data.session.access_token;
 }
 const filename=path.resolve('netlify/legacy-functions/owner-image-uuid.js'),mod=new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));mod._compile(qaImageSource(fs.readFileSync(filename,'utf8')),filename);
 const handler=mod.exports.makeHandler({getClient:()=>db,checkEnvironment:()=>requireQa(process.env,runtimeSeal)});
 const make=(who,bid=a,extra={})=>({action:'prepare',purpose:'coupon',business_id:bid,path:`owner-v1/owner/${bid}/${ids[who]}/${crypto.randomUUID()}.png`,mime:'image/png',size:100,...extra});
 const call=(who,body)=>handler({httpMethod:'POST',headers:{Authorization:'Bearer '+sessions[who]},body:JSON.stringify(body)});
 for(const who of ['free','other','pending'])check(who+' coupon upload denied',(await call(who,make(who,who==='free'?b:a))).statusCode===403);
 check('Free introduction image denied',(await call('free',make('free',b,{purpose:'business'}))).statusCode===403);
 check('Paid foreign business denied',(await call('paid',make('paid',b))).statusCode===403);
 check('actor path impersonation denied',(await call('paid',make('free'))).statusCode===403);
 check('over 5MiB denied',(await call('paid',make('paid',a,{size:5242881}))).statusCode===413);
 check('unsupported MIME denied',(await call('paid',make('paid',a,{mime:'image/svg+xml'}))).statusCode===413);
 const limit=await call('paid',make('paid',a,{size:5242880}));check('exact 5MiB accepted by gateway',limit.statusCode===200);
 const limitToken=JSON.parse(limit.body);
 check('actual Storage rejects over 5MiB signed payload',!!(await db.storage.from('owner-image-quarantine').uploadToSignedUrl(limitToken.staging_path,limitToken.upload_token,Buffer.alloc(5242881),{contentType:'image/png'})).error);
 for(const format of ['jpeg','png','webp']){
  const mime='image/'+format,ext=format==='jpeg'?'jpg':format,bytes=await require('sharp')({create:{width:32,height:32,channels:4,background:'#146b55'}}).toFormat(format).toBuffer();
  const c=make('paid',a,{path:`owner-v1/owner/${a}/${ids.paid}/${crypto.randomUUID()}.${ext}`,size:bytes.length,mime});
  const prep=await call('paid',c);check(format+' QA bucket preparation',prep.statusCode===200);const p=JSON.parse(prep.body);
  const uploaded=await db.storage.from('owner-image-quarantine').uploadToSignedUrl(p.staging_path,p.upload_token,bytes,{contentType:mime});check(format+' actual mapped Storage signed upload',!uploaded.error);
  const result=await call('paid',{...c,action:'publish',staging_path:p.staging_path});check(format+' actual decode and publish',result.statusCode===200);const out=JSON.parse(result.body);
  const saved=await db.storage.from('public-images').download(out.path);check(format+' published bytes readable',!saved.error);
  check(format+' synthetic object cleanup',!(await db.storage.from('public-images').remove([out.path])).error);
 }
 const wrong=createClient(process.env.SUPABASE_URL,process.env.TEST_ANON_KEY,{...options,global:{fetch:transport,headers:{Authorization:'Bearer '+sessions.free}}});
 check('Free direct Storage write denied',!!(await wrong.storage.from('public-images').upload(`owner-v1/owner/${a}/${ids.free}/denied.png`,Buffer.from('invalid'),{contentType:'image/png'})).error);
 const before=requests;process.env.SUPABASE_URL='https://ydrxuqmjzayejlnjzzew.supabase.co';
 const stopped=await call('paid',make('paid'));check('production environment drift denied before network',stopped.statusCode===503&&requests===before);
 console.log(JSON.stringify({result:'PASS',pass:checks.length,fail:0,qaAdapter:true,realServices:['Auth','PostgREST','Storage','PostgreSQL'],externalDelivery:0,productionWrites:0,checks}));
})().catch(()=>{console.log(JSON.stringify({result:'FAIL',stage:'QA_ADAPTER_SERVICE_CHECK',completed:checks.length,checks}));process.exitCode=1;});
