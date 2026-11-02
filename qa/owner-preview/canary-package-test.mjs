// Synthetic-only integration: actual selector/builder -> official 49 ZIPs -> outside-checkout runtime.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {spawnSync,execFileSync}from'node:child_process';
import{zipFunctions}from'@netlify/zip-it-and-ship-it';import selector from './preview.cjs';import synthetic from './synthetic.cjs';
import{bundlingConfig}from'../../scripts/release/function-bundling-config.mjs';
const root=process.cwd(),temp=fs.mkdtempSync(path.join(root,'.release-artifacts/qa-canary-packaging-')),outside=fs.mkdtempSync(path.join(os.tmpdir(),'dtm-canary-package-'));
const fetchBefore=globalThis.fetch,logBefore=console.log;
try{
 const stage=path.join(temp,'stage'),zips=path.join(temp,'zips');fs.mkdirSync(stage);
 for(const dir of ['netlify/functions','netlify/legacy-functions','netlify/migration','owner-uuid','qa/owner-preview','release-baseline'])fs.cpSync(path.join(root,dir),path.join(stage,dir),{recursive:true});
 fs.mkdirSync(path.join(stage,'assets'));fs.copyFileSync(path.join(root,'assets/validated-image-upload.js'),path.join(stage,'assets/validated-image-upload.js'));
 const {env,seal}=synthetic.fixture(),origin='https://deploy-preview-55--daltownmap-owner-uuid-qa.netlify.app';
 seal.commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();Object.assign(seal,{pr:55,head:'dev/owner-qa-canary-20261030',execution:'owner-canary',serviceAuthenticationApproved:true});
 Object.assign(env,{SUPABASE_ANON_KEY:'sb_publishable_SYNTHETIC_ONLY_NOT_A_REAL_KEY',REVIEW_ID:'55',HEAD:seal.head,BRANCH:'pull/55/head',COMMIT_REF:seal.commit,DEPLOY_PRIME_URL:origin,OWNER_UUID_ORIGIN:origin,OWNER_QA_CANARY_APPROVAL:JSON.stringify(seal)});
 const authLogs=[];let mockAuthRequests=0;
 globalThis.fetch=async(url,options)=>{mockAuthRequests++;if(new URL(url).hostname!=='hseaeafmmjnbynfyynao.supabase.co'||options.method!=='GET'||options.redirect!=='error')throw Error('SYNTHETIC_AUTH_CONTRACT');return new Response('{"users":[]}',{status:200});};
 console.log=line=>{const row=JSON.parse(line);if(row.stage==='QA_SERVICE_ROLE_AUTH_RESULT')authLogs.push(row);};
 process.chdir(stage);try{await selector.run(env);}finally{process.chdir(root);globalThis.fetch=fetchBefore;console.log=logBefore;}
 if(mockAuthRequests!==1||authLogs.length!==1||authLogs[0].result!=='PASS'||authLogs[0].httpStatus!==200)throw Error('SYNTHETIC_AUTH_EVIDENCE');
 const baseline=JSON.parse(fs.readFileSync(path.join(root,'release-baseline/production.json'))),owner=JSON.parse(fs.readFileSync(path.join(root,'release-baseline/owner-base.json')));
 const names=[...baseline.functions.map(x=>x.name),...owner.addedFunctions,'owner-notification-worker'];
 const rows=await zipFunctions(path.join(stage,'netlify/functions'),zips,{basePath:root,archiveFormat:'zip',config:bundlingConfig()});
 if(rows.length!==49||rows.some(r=>r.runtimeAPIVersion!==2)||names.some(n=>!rows.some(r=>r.name===n)))throw Error('CANARY_ZIP_INVENTORY');
 for(const s of [...baseline.schedules,{name:'owner-notification-worker',cron:'*/5 * * * *'}])if(rows.find(r=>r.name===s.name)?.schedule!==s.cron)throw Error('CANARY_SCHEDULE_CHANGED');
 const py=spawnSync(process.platform==='win32'?'python':'python3',['-c',`import pathlib,sys,zipfile,stat
for p in pathlib.Path(sys.argv[1]).glob('*.zip'):
 with zipfile.ZipFile(p) as z:
  assert z.testzip() is None
  for i in z.infolist():
   assert '..' not in pathlib.PurePosixPath(i.filename).parts and not i.filename.startswith('/') and not stat.S_ISLNK(i.external_attr>>16)
  z.extractall(pathlib.Path(sys.argv[2])/p.stem)
`,zips,outside],{encoding:'utf8'});if(py.status!==0)throw Error('CANARY_ZIP_INTEGRITY');
 const probe=`import fs from 'node:fs';import path from 'node:path';import{pathToFileURL}from'node:url';
let mocked=0;globalThis.fetch=async(input)=>{mocked++;if(new URL(typeof input==='string'?input:input.url).hostname!=='hseaeafmmjnbynfyynao.supabase.co')throw Error('CANARY_NETWORK_BLOCKED');return new Response(JSON.stringify({message:'Synthetic unauthorized'}),{status:401,headers:{'content-type':'application/json'}});};
function find(root,name){for(const e of fs.readdirSync(root,{withFileTypes:true})){const p=path.join(root,e.name);if(e.isDirectory()){const r=find(p,name);if(r)return r;}else if(e.name===name)return p;}}
let loaded=0,denied=0,disabled=0,origins=0;const owners=${JSON.stringify(owner.addedFunctions)};
for(const name of ${JSON.stringify(names)}){const file=find(path.join(process.cwd(),name),name+'.mjs');if(!file)throw Error('CANARY_ENTRY_MISSING');const mod=await import(pathToFileURL(file));loaded++;const own=owners.includes(name),post=['owner-account-uuid','owner-image-uuid'].includes(name);if(own){const wrong=await mod.default(new Request('https://daltownmap.com/.netlify/functions/'+name));if(wrong.status!==503)throw Error('CANARY_ORIGIN_DRIFT');origins++;}
const response=await mod.default(new Request('${origin}/.netlify/functions/'+name,{method:post?'POST':'GET',...(post?{headers:{'Content-Type':'application/json'},body:JSON.stringify(name==='owner-account-uuid'?{action:'plan_read',business_id:'20000000-0000-4000-8000-000000000001'}:{action:'prepare'})}:{})}),{requestId:'synthetic',site:{id:'ec0bc146-8184-4627-90e0-df82ec2b06f9'}});if(own){if(response.status!==401)throw Error('CANARY_ANONYMOUS_BOUNDARY');denied++;}else{if(response.status!==503)throw Error('CANARY_UNRELATED_API_ENABLED');disabled++;}}
console.log(JSON.stringify({result:'PASS',fixture:'synthetic only',canaryZipImports:loaded,ownerAnonymousDenials:denied,unrelatedApisDisabled:disabled,originBlocks:origins,mockedSdkRequests:mocked,liveNetworkRequests:0,sourceCheckoutUsed:false}));`;
 const probePath=path.join(outside,'probe.mjs');fs.writeFileSync(probePath,probe);
 const runtimeEnv={PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,NODE_PATH:'',...env};
 for(const key of ['CONTEXT','NETLIFY','PULL_REQUEST','REVIEW_ID','HEAD','BRANCH','COMMIT_REF','DEPLOY_PRIME_URL','OWNER_QA_CANARY_APPROVAL'])delete runtimeEnv[key];
 const result=spawnSync(process.execPath,[probePath],{cwd:outside,env:runtimeEnv,encoding:'utf8',timeout:60000});if(result.status!==0)throw Error('CANARY_STANDALONE_RUNTIME');
 const report={...JSON.parse(result.stdout.trim()),syntheticAuthRequests:mockAuthRequests,resultOnlyAuthEvidence:true,existingSchedules:4,workerSchedulePreserved:true};
 fs.writeFileSync(path.join(root,'.release-artifacts/qa-canary-packaging.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{process.chdir(root);globalThis.fetch=fetchBefore;console.log=logBefore;fs.rmSync(temp,{recursive:true,force:true});fs.rmSync(outside,{recursive:true,force:true});}
