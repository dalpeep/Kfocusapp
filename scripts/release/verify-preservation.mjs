import{verifyOwnerBase}from'./verify-owner-base.mjs';
import fs from'node:fs';import{createHash}from'node:crypto';
export function verify(){const b=JSON.parse(fs.readFileSync('release-baseline/production.json'));const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
 const patches=JSON.parse(fs.readFileSync('release-baseline/community-security-patches.json')).patches;
 const allowed=new Set(['netlify/legacy-functions/community-admin.js','netlify/legacy-functions/lib/community-security.js','netlify/functions/lib/community-security.js']);
 if(patches.length!==3||new Set(patches.map(p=>p.path)).size!==3||patches.some(p=>!allowed.has(p.path)))throw Error('UNAPPROVED_SECURITY_PATCH');
 for(const f of b.sources){const p=f.path.startsWith('netlify/functions/')?'netlify/legacy-functions/'+f.path.slice('netlify/functions/'.length):f.path,patch=patches.find(v=>v.path===p);if(patch&&patch.baselineSha256!==f.sha256)throw Error('SECURITY_BASELINE_CHANGED');if(hash(p)!==(patch?.sha256??f.sha256))throw Error('LEGACY_SOURCE_CHANGED:'+f.path);}
 for(const f of b.sources)if(fs.existsSync(f.path)){const patch=patches.find(p=>p.path===f.path);if(patch&&patch.baselineSha256!==f.sha256)throw Error('SECURITY_BASELINE_CHANGED');if(hash(f.path)!==(patch?.sha256??f.sha256))throw Error('RETAINED_SOURCE_CHANGED:'+f.path);}
 const entries=fs.readdirSync('netlify/functions').filter(n=>/\.(?:js|mjs|cjs)$/.test(n)).map(n=>n.replace(/\.(?:js|mjs|cjs)$/,'')).sort();verifyOwnerBase();
 if(process.versions.node!==fs.readFileSync('.node-version','utf8').trim())throw Error('NODE_VERSION_MISMATCH');
 if(!fs.existsSync('package-lock.json'))throw Error('LOCKFILE_REQUIRED');
 return {result:'PASS',functions:entries.length,sourceFiles:b.sources.length,schedules:b.schedules.length,node:process.versions.node};}
if(process.argv[1]?.endsWith('verify-preservation.mjs'))console.log(JSON.stringify(verify()));
