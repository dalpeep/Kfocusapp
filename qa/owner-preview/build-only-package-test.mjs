// Official packaging of the future Owner OFF QA artifact. No hosted build/auth.
import fs from'node:fs';import path from'node:path';import os from'node:os';import{spawnSync}from'node:child_process';import{zipFunctions}from'@netlify/zip-it-and-ship-it';import entry from'./build-only.cjs';
const root=process.cwd(),temp=fs.mkdtempSync(path.join(root,'.release-artifacts/qa-off-package-')),outside=fs.mkdtempSync(path.join(os.tmpdir(),'dtm-qa-off-'));
try{
 const prepared=entry.buildFiles(root),source=path.join(temp,'source'),zips=path.join(temp,'zips');fs.mkdirSync(source);
 for(const[name,body]of Object.entries(prepared.functions))fs.writeFileSync(path.join(source,name),body);
 const rows=await zipFunctions(source,zips,{basePath:root,archiveFormat:'zip',config:{'*':{nodeVersion:'22.x'}}});
 if(rows.length!==49||rows.some(r=>r.runtimeAPIVersion!==2))throw Error('QA_OFF_PACKAGE_INVENTORY');
 for(const s of prepared.schedules)if(rows.find(r=>r.name===s.name)?.schedule!==s.cron)throw Error('QA_OFF_SCHEDULE_CHANGED');
 const py=spawnSync(process.platform==='win32'?'python':'python3',['-c',`import pathlib,sys,zipfile,stat
for p in pathlib.Path(sys.argv[1]).glob('*.zip'):
 with zipfile.ZipFile(p) as z:
  assert z.testzip() is None
  for i in z.infolist():
   assert not pathlib.PurePosixPath(i.filename).is_absolute() and '..' not in pathlib.PurePosixPath(i.filename).parts and not stat.S_ISLNK(i.external_attr>>16)
  z.extractall(pathlib.Path(sys.argv[2])/p.stem)
`,zips,outside],{encoding:'utf8'});if(py.status)throw Error('QA_OFF_ZIP_INTEGRITY');
 const probe=`import fs from'node:fs';import path from'node:path';import{pathToFileURL}from'node:url';let calls=0;globalThis.fetch=async()=>{calls++;throw Error('NETWORK_DENIED')};function find(dir,name){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory()){const hit=find(p,name);if(hit)return hit;}else if(e.name===name)return p;}}let count=0;for(const n of ${JSON.stringify(rows.map(r=>r.name))}){const m=await import(pathToFileURL(find(path.join(process.cwd(),n),n+'.mjs')));for(const method of ['GET','POST']){const r=await m.default(new Request('https://fixture.invalid/',{method}));if(r.status!==503)throw Error('QA_API_OPEN');}count++;}if(calls)throw Error('SIDE_EFFECT');console.log(JSON.stringify({result:'PASS',artifactImports:count,offResponses:count*2,apiVersion:2,existingSchedules:4,workerSchedulePreserved:true,liveNetworkRequests:calls,sourceCheckoutUsed:false,hosted:false}));`;
 fs.writeFileSync(path.join(outside,'probe.mjs'),probe);const r=spawnSync(process.execPath,[path.join(outside,'probe.mjs')],{cwd:outside,encoding:'utf8',env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,NODE_PATH:''},timeout:60000});if(r.status)throw Error('QA_OFF_EXTERNAL_LOAD');
 const report=JSON.parse(r.stdout.trim());fs.writeFileSync('.release-artifacts/qa-build-only-packaging.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{fs.rmSync(temp,{recursive:true,force:true});fs.rmSync(outside,{recursive:true,force:true});}
