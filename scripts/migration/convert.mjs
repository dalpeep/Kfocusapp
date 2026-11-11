import fs from 'node:fs';
const baseline=JSON.parse(fs.readFileSync('release-baseline/production.json'));
const selected=new Set(process.argv.slice(2));
for (const f of baseline.functions.filter(f=>f.apiVersion===1 && (!selected.size || selected.has(f.name)))) {
 const legacy='../legacy-functions/'+f.name+'.js';
 const source=fs.readFileSync('netlify/legacy-functions/'+f.name+'.js','utf8');
 // coupon-campaign-lib was deployed as a helper without a handler. Preserve its
 // failing invocation rather than invent a successful or data-returning API.
 const handler=f.name==='coupon-campaign-lib'?'(...args) => legacy.handler(...args)':'legacy.handler';
 fs.writeFileSync('netlify/functions/'+f.name+'.mjs',"import legacy from '"+legacy+"';\nimport { adapt } from '../migration/adapter.mjs';\nexport default adapt("+handler+");\n"+(f.schedule?'export const config = '+JSON.stringify({schedule:f.schedule})+';\n':''));
 if(fs.existsSync(f.entry)) fs.unlinkSync(f.entry);
}
