'use strict';
// QA artifact only. Never imported by the production entrypoints.
const QA='hseaeafmmjnbynfyynao', PROD='ydrxuqmjzayejlnjzzew';
const SITE='ec0bc146-8184-4627-90e0-df82ec2b06f9';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
function claims(key){try{return JSON.parse(Buffer.from(key.split('.')[1],'base64url'));}catch{return {};}}
function ids(value){return String(value||'').split(',').map(x=>x.trim()).filter(Boolean).sort();}
function sameIds(value,expected){const actual=ids(value);return Array.isArray(expected)&&expected.length>0&&expected.every(x=>UUID.test(x))&&new Set(expected).size===expected.length&&JSON.stringify(actual)===JSON.stringify([...expected].sort());}
function assessBuild(env,seal){
 const pr=String(seal?.pr||''),anon=claims(env.SUPABASE_ANON_KEY||''),service=claims(env.SUPABASE_SERVICE_ROLE_KEY||'');
 const checks={
  approval:seal?.buildApproved===true&&seal?.runtimeApproved===true&&Object.keys(seal).every(k=>['buildApproved','runtimeApproved','site','project','pr','head','commit','actors','businesses'].includes(k)),
  qaSite:env.SITE_ID===SITE&&seal?.site===SITE,
  qaProject:seal?.project===QA&&QA!==PROD&&env.SUPABASE_URL===`https://${QA}.supabase.co`&&env.OWNER_UUID_PROJECT_REF===QA,
  context:env.CONTEXT==='deploy-preview'&&env.NETLIFY==='true'&&env.PULL_REQUEST==='true',
  pr:/^[1-9]\d*$/.test(pr)&&env.REVIEW_ID===pr,
  head:/^dev\/owner-qa-[a-z0-9-]+$/.test(seal?.head||'')&&env.HEAD===seal.head,
  checkout:env.BRANCH===`pull/${pr}/head`||env.BRANCH===`refs/pull/${pr}/head`,
  commit:/^[a-f0-9]{40}$/.test(seal?.commit||'')&&env.COMMIT_REF===seal.commit,
  origin:typeof env.DEPLOY_PRIME_URL==='string'&&/^https:\/\/deploy-preview-[1-9]\d*--daltownmap-owner-uuid-qa\.netlify\.app$/.test(env.DEPLOY_PRIME_URL)&&env.DEPLOY_PRIME_URL===`https://deploy-preview-${pr}--daltownmap-owner-uuid-qa.netlify.app`&&env.OWNER_UUID_ORIGIN===env.DEPLOY_PRIME_URL,
  owner:env.OWNER_UUID_ENABLED==='true'&&env.OWNER_UUID_ENV==='qa'&&env.OWNER_COUPON_PROTOCOL==='v2',
  canary:env.OWNER_UUID_CANARY_MODE==='true'&&sameIds(env.OWNER_NOTIFICATION_ACTORS,seal?.actors)&&sameIds(env.OWNER_NOTIFICATION_BUSINESSES,seal?.businesses),
  workerOff:env.OWNER_NOTIFICATION_WORKER_ENABLED==='false',
  mock:env.OWNER_NOTIFICATION_MODE==='mock',
  providersOff:!env.RESEND_API_KEY&&!env.OWNER_QA_RESEND_API_KEY&&!env.ONESIGNAL_REST_API_KEY&&!env.ONESIGNAL_API_KEY,
  credentialRouting:anon.ref===QA&&anon.role==='anon'&&service.ref===QA&&service.role==='service_role'&&env.SUPABASE_ANON_KEY!==env.SUPABASE_SERVICE_ROLE_KEY
 };
 const failed=Object.keys(checks).filter(k=>!checks[k]);
 return {allowed:failed.length===0,code:failed.length?'QA_RUNTIME_BLOCKED':'QA_RUNTIME_ROUTING_MATCH',checks,failed,serviceAuthentication:'NOT_TESTED'};
}
const META=['CONTEXT','NETLIFY','PULL_REQUEST','REVIEW_ID','HEAD','BRANCH','COMMIT_REF','DEPLOY_PRIME_URL'];
function sealBuild(env,approval){
 if(!assessBuild(env,approval).allowed)throw Error('QA_BUILD_BLOCKED');
 return {approval,build:Object.fromEntries(META.map(k=>[k,env[k]]))};
}
function assessRuntime(env,sealed){
 const build=sealed?.build,approval=sealed?.approval;
 if(!build||!approval||Object.keys(build).length!==META.length||Object.keys(build).some(k=>!META.includes(k)))return {allowed:false,code:'QA_RUNTIME_BLOCKED',checks:{sealedBuild:false},failed:['sealedBuild'],serviceAuthentication:'NOT_TESTED'};
 const drift=META.some(k=>env[k]!==undefined&&env[k]!==build[k]);
 const result=assessBuild({...env,...build},approval);
 result.checks.buildMetadataUnchanged=!drift;
 result.checks.runtimeSiteUrl=env.URL==='https://daltownmap-owner-uuid-qa.netlify.app';
 result.failed=Object.keys(result.checks).filter(k=>!result.checks[k]);result.allowed=result.failed.length===0;result.code=result.allowed?'QA_RUNTIME_ROUTING_MATCH':'QA_RUNTIME_BLOCKED';return result;
}
function requireQa(env,sealed){if(!assessRuntime(env,sealed).allowed)throw Error('QA_RUNTIME_BLOCKED');}
function requireRequest(request,env,sealed){requireQa(env,sealed);if(new URL(request.url).origin!==sealed.build.DEPLOY_PRIME_URL)throw Error('QA_REQUEST_ORIGIN_BLOCKED');}

function qaFetch(env,seal,transport=fetch){return async(input,init={})=>{
 requireQa(env,seal);
 const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
 if(url.origin!==`https://${QA}.supabase.co`||url.username||url.password)throw Error('QA_NETWORK_BLOCKED');
 // Never follow an authentication, Storage or REST redirect to another origin.
 const response=await transport(input,{...init,redirect:'error'});
 if(response.status>=300&&response.status<400)throw Error('QA_REDIRECT_BLOCKED');
 return response;
};}
module.exports={QA,PROD,SITE,assessBuild,sealBuild,assessRuntime,requireQa,requireRequest,qaFetch};
