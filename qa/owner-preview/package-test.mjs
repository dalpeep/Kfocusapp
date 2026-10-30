// Official bundler, QA overlay only; no hosting, credentials or outbound calls.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {spawnSync}from'node:child_process';import{zipFunctions}from'@netlify/zip-it-and-ship-it';
import materializer from './materialize.cjs';import synthetic from './synthetic.cjs';import{bundlingConfig}from'../../scripts/release/function-bundling-config.mjs';
const root=process.cwd(),temp=fs.mkdtempSync(path.join(root,'.release-artifacts/qa-packaging-')),extracted=fs.mkdtempSync(path.join(os.tmpdir(),'dtm-qa-overlay-'));
const names=['owner-portal-uuid','owner-content-uuid','owner-account-uuid','owner-image-uuid'];
try{
 const {env,seal}=synthetic.fixture(),overlay=path.join(temp,'overlay'),stage=path.join(temp,'stage'),zips=path.join(temp,'zips');
 materializer.prepare({root,output:overlay,env,seal});
 fs.mkdirSync(path.join(stage,'netlify/functions'),{recursive:true});
 for(const directory of ['legacy-functions','migration'])fs.cpSync(path.join(root,'netlify',directory),path.join(stage,'netlify',directory),{recursive:true});
 for(const row of JSON.parse(fs.readFileSync(path.join(overlay,'overlay-manifest.json'))).files){const target=path.join(stage,row.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(overlay,row.path),target);}
 const results=await zipFunctions(path.join(stage,'netlify/functions'),zips,{basePath:root,archiveFormat:'zip',config:bundlingConfig()});
 if(results.length!==4||results.some(r=>r.runtimeAPIVersion!==2)||names.some(n=>!results.some(r=>r.name===n)))throw Error('QA_PACKAGE_INVENTORY');
 const python=process.platform==='win32'?'python':'python3';
 const unzip=spawnSync(python,['-c',`import sys,pathlib,zipfile,stat
for p in pathlib.Path(sys.argv[1]).glob('*.zip'):
 with zipfile.ZipFile(p) as z:
  assert z.testzip() is None
  for i in z.infolist():
   assert '..' not in pathlib.PurePosixPath(i.filename).parts and not i.filename.startswith('/') and not stat.S_ISLNK(i.external_attr>>16)
  z.extractall(pathlib.Path(sys.argv[2])/p.stem)
`,zips,extracted],{encoding:'utf8'});if(unzip.status)throw Error('QA_ZIP_INTEGRITY');
 const probe=`import fs from 'node:fs';import path from 'node:path';import{pathToFileURL}from'node:url';
let requests=0;globalThis.fetch=async(input)=>{requests++;if(new URL(typeof input==='string'?input:input.url).hostname!=='hseaeafmmjnbynfyynao.supabase.co')throw Error('OUTBOUND_DENIED');return new Response(JSON.stringify({message:'Synthetic unauthorized'}),{status:401,headers:{'content-type':'application/json'}});};
function find(root,name){for(const entry of fs.readdirSync(root,{withFileTypes:true})){const p=path.join(root,entry.name);if(entry.isDirectory()){const hit=find(p,name);if(hit)return hit;}else if(entry.name===name)return p;}}
let loaded=0,blocked=0,auth=0;for(const name of ${JSON.stringify(names)}){const file=find(path.join(process.cwd(),name),name+'.mjs');if(!file)throw Error('QA_ENTRY_MISSING');const mod=await import(pathToFileURL(file));loaded++;const denied=await mod.default(new Request('https://daltownmap-owner-uuid-qa.netlify.app/.netlify/functions/'+name));if(denied.status!==503)throw Error('QA_ORIGIN_GATE');blocked++;const request=new Request('https://deploy-preview-999--daltownmap-owner-uuid-qa.netlify.app/.netlify/functions/'+name,{method:name==='owner-account-uuid'||name==='owner-image-uuid'?'POST':'GET',...(name==='owner-account-uuid'||name==='owner-image-uuid'?{body:JSON.stringify(name==='owner-account-uuid'?{action:'plan_read',business_id:'20000000-0000-4000-8000-000000000001'}:{action:'prepare'}),headers:{'Content-Type':'application/json'}}:{})});const response=await mod.default(request,{requestId:'synthetic',site:{id:'ec0bc146-8184-4627-90e0-df82ec2b06f9'}});if(response.status!==401)throw Error('QA_AUTH_BOUNDARY:'+name+':'+response.status);auth++;}
console.log(JSON.stringify({result:'PASS',qaArtifactImports:loaded,qaOriginBlocks:blocked,qaAnonymousDenials:auth,liveNetworkRequests:0,mockedSdkRequests:requests,sourceCheckoutUsed:false}));`;
 const probePath=path.join(extracted,'probe.mjs');fs.writeFileSync(probePath,probe);
 const runtimeEnv={PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,NODE_PATH:'',...env};
 // Build-only variables deliberately absent in the real runtime probe.
 for(const key of ['CONTEXT','NETLIFY','PULL_REQUEST','REVIEW_ID','HEAD','BRANCH','COMMIT_REF','DEPLOY_PRIME_URL'])delete runtimeEnv[key];
 const run=spawnSync(process.execPath,[probePath],{cwd:extracted,encoding:'utf8',env:runtimeEnv,timeout:60000});if(run.status){console.error(run.stderr.split('\n').filter(x=>/Error|QA_/.test(x)).slice(0,3).join('\n'));throw Error('QA_STANDALONE_RUNTIME');}
 const report=JSON.parse(run.stdout.trim());fs.writeFileSync('.release-artifacts/qa-overlay-packaging.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{fs.rmSync(temp,{recursive:true,force:true});fs.rmSync(extracted,{recursive:true,force:true});}
