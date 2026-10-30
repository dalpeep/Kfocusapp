'use strict';
// Approved QA Deploy Preview only. Never imports SEO, providers or production DB.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {assessBuild,QA}=require('./runtime.cjs'),{prepare}=require('./materialize.cjs');
const BASE='5bff8fc780c31fadf2b55d1c544d658d0ae23a8d';
function approval(env){try{return JSON.parse(env.OWNER_QA_PREVIEW_APPROVAL||'');}catch{return null;}}
function preflight(env){const seal=approval(env),result=assessBuild(env,seal);if(!result.allowed)throw Error('QA_CANARY_CONTEXT_BLOCKED');return seal;}
async function authenticate(env,transport=fetch){
 const url=`https://${QA}.supabase.co/auth/v1/admin/users?page=1&per_page=1`;
 const response=await transport(url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(10000),headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY}});
 // Never parse/log user records, credentials, headers, tokens or original error.
 await response.arrayBuffer();if(response.status!==200)throw Error('QA_SERVICE_ROLE_AUTH_FAILED');
 return {authenticated:true,qaProject:true};
}
function disabledEntry(cron){return `export default async()=>new Response(JSON.stringify({error:'QA_LEGACY_DISABLED'}),{status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});\n${cron?'export const config='+JSON.stringify({schedule:cron})+';\n':''}`;}
async function main(){
 const env=process.env,seal=preflight(env);
 if(cp.spawnSync('git',['merge-base','--is-ancestor',BASE,'HEAD']).status!==0||cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()!==seal.commit)throw Error('QA_SOURCE_COMMIT_BLOCKED');
 for(const name of ['runtime.cjs','materialize.cjs'])if(!fs.readFileSync('qa/owner-preview/'+name).equals(cp.execFileSync('git',['show',BASE+':qa/owner-preview/'+name])))throw Error('QA_REVIEWED_RUNTIME_CHANGED');
 // Authentication occurs privately before creating any public artifact.
 const auth=await authenticate(env);console.log(JSON.stringify({stage:'QA_SERVICE_ROLE_AUTH',...auth}));
 const overlay=path.resolve('.release-artifacts/approved-canary-overlay');prepare({root:process.cwd(),output:overlay,env,seal});
 for(const f of JSON.parse(fs.readFileSync(path.join(overlay,'overlay-manifest.json'))).files){fs.mkdirSync(path.dirname(f.path),{recursive:true});fs.copyFileSync(path.join(overlay,f.path),f.path);}
 const baseline=JSON.parse(fs.readFileSync('release-baseline/production.json'));
 // Keep names/cron but disallow all unrelated API, coupon issuance and scheduled
 // work in this Preview artifact. Repository/Published sources stay untouched.
 for(const f of baseline.functions)fs.writeFileSync('netlify/functions/'+f.name+'.mjs',disabledEntry(baseline.schedules.find(s=>s.name===f.name)?.cron));
 fs.writeFileSync('netlify/functions/owner-notification-worker.mjs',disabledEntry('*/5 * * * *'));
 const publish='.qa-preview-public';fs.mkdirSync(path.join(publish,'assets'),{recursive:true});
 fs.cpSync('owner-uuid',path.join(publish,'owner-uuid'),{recursive:true});
 fs.copyFileSync('assets/validated-image-upload.js',path.join(publish,'assets/validated-image-upload.js'));
 fs.writeFileSync(path.join(publish,'index.html'),'<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><meta http-equiv="refresh" content="0;url=/owner-uuid/"><title>QA 업주센터</title><a href="/owner-uuid/">QA 업주센터</a></html>');
 fs.writeFileSync(path.join(publish,'404.html'),'<!doctype html><html lang="ko"><meta charset="utf-8"><title>QA 전용 화면</title><p>이 QA 검증에서는 업주센터만 사용할 수 있습니다.</p></html>');
 fs.writeFileSync(path.join(publish,'robots.txt'),'User-agent: *\nDisallow: /\n');
 fs.writeFileSync(path.join(publish,'_headers'),`/*\n  X-Robots-Tag: noindex, nofollow\n  Cache-Control: no-store\n  Content-Security-Policy: default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; connect-src 'self' https://${QA}.supabase.co; img-src 'self' data: blob: https://${QA}.supabase.co; font-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'self'\n`);
 const inventory=fs.readdirSync('netlify/functions').filter(n=>/\.(mjs|js|cjs)$/.test(n));if(inventory.length!==49)throw Error('QA_FUNCTION_INVENTORY');
 // Only public anon config can be present in this small static directory.
 const scan=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?scan(path.join(dir,e.name)):[path.join(dir,e.name)]);
 for(const p of scan(publish)){const data=fs.readFileSync(p,'utf8');if(data.includes(env.SUPABASE_SERVICE_ROLE_KEY)||data.includes('ydrxuqmjzayejlnjzzew'))throw Error('QA_STATIC_ISOLATION_FAILED');}
 console.log(JSON.stringify({stage:'QA_CANARY_PACKAGE_READY',functions:49,ownerFunctions:4,legacyApisDisabled:44,workerOff:true,notificationMode:'mock',scheduledNamesPreserved:baseline.schedules.length,publicStaticOwnerOnly:true,productionAccess:false}));
}
module.exports={approval,preflight,authenticate,disabledEntry};
if(require.main===module)main().catch(e=>{console.error(/^[A-Z0-9_]+$/.test(e.message)?e.message:'QA_CANARY_BUILD_FAILED');process.exitCode=78;});
