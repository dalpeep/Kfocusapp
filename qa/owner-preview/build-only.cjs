'use strict';
// QA-only future build entry. Automatic Netlify ignore stays exit 0.
// Import/tests are pure; authentication is never run without separate approval.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {assess}=require('./policy.cjs');
const {authenticate}=require('./canary-build.cjs');
const QA='hseaeafmmjnbynfyynao',SITE='ec0bc146-8184-4627-90e0-df82ec2b06f9',PR=55;
const ORIGIN=`https://deploy-preview-${PR}--daltownmap-owner-uuid-qa.netlify.app`;
const HEAD='dev/owner-qa-canary-20261030';
const SOURCE_BASE='a614918b2a5b0afda758999d0626d6dfb0281ac9';
function approval(env){try{return JSON.parse(env.OWNER_QA_BUILD_ONLY_APPROVAL||'');}catch{return null;}}
function preflight(env,seal=approval(env)){
 const existing=assess(env,seal),checks={...existing.checks,
  exactPr:seal?.pr===PR,exactHead:seal?.head===HEAD,
  project:env.OWNER_UUID_PROJECT_REF===QA,
  origin:env.OWNER_UUID_ORIGIN===ORIGIN&&env.DEPLOY_PRIME_URL===ORIGIN,
  providerOff:!env.ONESIGNAL_REST_API_KEY&&!env.ONESIGNAL_API_KEY,
  execution:seal?.execution==='authenticate-only'||seal?.execution==='preview-off',
  schema:!!seal&&Object.keys(seal).every(k=>['buildApproved','runtimeApproved','pr','head','commit','serviceAuthenticationApproved','execution'].includes(k))
 };
 const failed=Object.keys(checks).filter(k=>checks[k]!==true);
 return {allowed:failed.length===0,code:failed.length?'QA_BUILD_ONLY_BLOCKED':'QA_BUILD_ONLY_METADATA_MATCH',checks,failed,authentication:'NOT_TESTED',runtimeEnabled:false};
}
function disabledEntry(name,cron){
 const error=name==='owner-notification-worker'?'QA_WORKER_DISABLED':/^owner-(portal|content|account|image)-uuid$/.test(name)?'OWNER_DISABLED':'QA_LEGACY_DISABLED';
 return `export default async()=>new Response(JSON.stringify({error:${JSON.stringify(error)}}),{status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});\n${cron?'export const config='+JSON.stringify({schedule:cron})+';\n':''}`;
}
function buildFiles(root){
 const base=JSON.parse(fs.readFileSync(path.join(root,'release-baseline/production.json'))),owner=JSON.parse(fs.readFileSync(path.join(root,'release-baseline/owner-base.json')));
 const names=[...base.functions.map(x=>x.name),...owner.addedFunctions,'owner-notification-worker'];
 if(names.length!==49||new Set(names).size!==49)throw Error('QA_FUNCTION_INVENTORY');
 const schedules=[...base.schedules,{name:'owner-notification-worker',cron:'*/5 * * * *'}];
 const functions=Object.fromEntries(names.map(name=>[name+'.mjs',disabledEntry(name,schedules.find(x=>x.name===name)?.cron)]));
 return {functions,schedules,existingFunctions:44,ownerFunctions:4,workerFunctions:1,allDisabled:true};
}
async function main(env=process.env){
 const seal=approval(env);if(!preflight(env,seal).allowed)throw Error('QA_BUILD_ONLY_CONTEXT_BLOCKED');
 if(cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()!==seal.commit)throw Error('QA_SOURCE_COMMIT_BLOCKED');
 if(cp.spawnSync('git',['merge-base','--is-ancestor',SOURCE_BASE,'HEAD']).status!==0)throw Error('QA_OWNER_SOURCE_BASE_BLOCKED');
 if(seal.serviceAuthenticationApproved!==true)throw Error('QA_PRIVATE_AUTH_APPROVAL_REQUIRED');
 // Only this explicit future approval permits ONE private QA admin GET.
 const result=await authenticate(env);console.log(JSON.stringify({stage:'QA_PRIVATE_AUTH',...result}));
 if(seal.execution==='authenticate-only')throw Error('QA_AUTH_COMPLETE_NO_DEPLOY');
 const root=process.cwd(),prepared=buildFiles(root),publish=path.join(root,'.qa-preview-public');
 if(fs.existsSync(publish))throw Error('QA_OUTPUT_EXISTS');
 fs.mkdirSync(publish);fs.cpSync(path.join(root,'owner-uuid'),path.join(publish,'owner-uuid'),{recursive:true});
 fs.mkdirSync(path.join(publish,'assets'));fs.copyFileSync(path.join(root,'assets/validated-image-upload.js'),path.join(publish,'assets/validated-image-upload.js'));
 let html=fs.readFileSync(path.join(publish,'owner-uuid/index.html'),'utf8');
 html=html.replace('/.netlify/functions/config?v=owner-phase1','/owner-uuid/qa-config.js').replace('<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>','');
 fs.writeFileSync(path.join(publish,'owner-uuid/index.html'),html);
 // No URL/key is needed: availability gate gets OWNER_DISABLED before Auth init.
 fs.writeFileSync(path.join(publish,'owner-uuid/qa-config.js'),'window.APP_CONFIG={OWNER_UUID_ENV:"qa"};\n');
 fs.writeFileSync(path.join(publish,'index.html'),'<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>QA Owner OFF</title><a href="/owner-uuid/">업주센터 빌드 검증 — 기능 OFF</a>');
 fs.writeFileSync(path.join(publish,'robots.txt'),'User-agent: *\nDisallow: /\n');
 fs.writeFileSync(path.join(publish,'_headers'),"/*\n  X-Robots-Tag: noindex, nofollow\n  Cache-Control: no-store\n  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; frame-ancestors 'none'; form-action 'none'; base-uri 'self'\n");
 const scan=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?scan(path.join(dir,e.name)):[path.join(dir,e.name)]);
 for(const p of scan(publish)){const bytes=fs.readFileSync(p);for(const value of [env.SUPABASE_SERVICE_ROLE_KEY,env.SUPABASE_ANON_KEY,'ydrxuqmjzayejlnjzzew'])if(value&&bytes.includes(Buffer.from(value)))throw Error('QA_STATIC_ISOLATION_FAILED');}
 // Generated QA artifact only. Repository and Published originals are unchanged.
 for(const [name,source]of Object.entries(prepared.functions))fs.writeFileSync(path.join(root,'netlify/functions',name),source);
 console.log(JSON.stringify({stage:'QA_BUILD_ONLY_ARTIFACT',functions:49,allRuntimeDisabled:true,workerOff:true,notificationMode:'mock',existingSchedules:4,productionAccess:false}));
}
module.exports={QA,SITE,PR,ORIGIN,HEAD,SOURCE_BASE,approval,preflight,disabledEntry,buildFiles,main};
if(require.main===module)main().catch(e=>{console.error(/^[A-Z0-9_]+$/.test(e.message)?e.message:'QA_BUILD_ONLY_STOPPED');process.exitCode=78;});
