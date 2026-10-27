import fs from'node:fs';import{createHash}from'node:crypto';
export function verify(){const b=JSON.parse(fs.readFileSync('release-baseline/production.json'));const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');for(const f of b.sources)if(hash(f.path)!==f.sha256)throw Error('LEGACY_SOURCE_CHANGED:'+f.path);
 const entries=fs.readdirSync('netlify/functions').filter(n=>/\.(?:js|mjs|cjs)$/.test(n)).map(n=>n.replace(/\.(?:js|mjs|cjs)$/,'')).sort();if(JSON.stringify(entries)!==JSON.stringify(b.functions.map(f=>f.name).sort()))throw Error('FUNCTION_INVENTORY_CHANGED');
 if(process.versions.node!==fs.readFileSync('.node-version','utf8').trim())throw Error('NODE_VERSION_MISMATCH');
 if(!fs.existsSync('package-lock.json'))throw Error('LOCKFILE_REQUIRED');
 return {result:'PASS',functions:entries.length,sourceFiles:b.sources.length,schedules:b.schedules.length,node:process.versions.node};}
if(process.argv[1]?.endsWith('verify-preservation.mjs'))console.log(JSON.stringify(verify()));
