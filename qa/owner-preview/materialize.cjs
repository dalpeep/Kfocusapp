'use strict';
// Pure artifact preparation. No deploy, network, SQL or environment mutation.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {requireQa,QA}=require('./runtime.cjs');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function replaceOne(source,from,to){if(source.split(from).length!==2)throw Error('QA_SOURCE_CONTRACT_CHANGED');return source.replace(from,to);}
function prepare({root,output,env,seal}){
 requireQa(env,seal);
 const base=fs.realpathSync(root),dest=path.resolve(output);
 if(fs.existsSync(dest)||dest===base||base.startsWith(dest+path.sep)||!dest.startsWith(path.join(base,'.release-artifacts')+path.sep))throw Error('QA_OUTPUT_SCOPE');
 const files={};
 const read=p=>fs.readFileSync(path.join(base,p),'utf8');
 // Override only the QA artifact's guard. Production guard remains byte-for-byte unchanged.
 const lib='netlify/legacy-functions/lib/';
 files[lib+'owner-qa-runtime.cjs']=read('qa/owner-preview/runtime.cjs');
 files[lib+'owner-qa-seal.json']=JSON.stringify(seal);
 files[lib+'owner-uuid-environment.js']=`'use strict';const {requireQa}=require('./owner-qa-runtime.cjs');const seal=require('./owner-qa-seal.json');exports.requireOwnerUuidEnvironment=(env=process.env)=>requireQa(env,seal);\n`;
 // SDK calls get a no-redirect QA-only transport, including inside existing factories.
 const makeClient=`require('@supabase/supabase-js').createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})`;
 const guardedClient=`require('@supabase/supabase-js').createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{global:{fetch:require('./owner-qa-runtime.cjs').qaFetch(process.env,require('./owner-qa-seal.json'))},auth:{persistSession:false,autoRefreshToken:false}})`;
 for(const name of ['owner-portal-uuid','owner-content-uuid','owner-account-uuid'])files[lib+name+'.js']=replaceOne(read(lib+name+'.js'),makeClient,guardedClient);
 const imagePath='netlify/legacy-functions/owner-image-uuid.js';
 const image=qaImageSource(read(imagePath));
 files[imagePath]=image;
 // Static public configuration is scoped to Owner HTML, not the legacy config Function.
 files['owner-uuid/qa-config.js']='window.APP_CONFIG='+JSON.stringify({SUPABASE_URL:`https://${QA}.supabase.co`,SUPABASE_ANON_KEY:env.SUPABASE_ANON_KEY,OWNER_UUID_ENV:'qa'})+';\n';
 files['owner-uuid/index.html']=replaceOne(read('owner-uuid/index.html'),'/.netlify/functions/config?v=owner-phase1','/owner-uuid/qa-config.js');
 const metadata=Object.entries(files).map(([name,data])=>({path:name,sha256:hash(data)}));
 fs.mkdirSync(dest,{recursive:true});for(const [name,data]of Object.entries(files)){const p=path.join(dest,name);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,data,{mode:0o600});}
 fs.writeFileSync(path.join(dest,'overlay-manifest.json'),JSON.stringify({kind:'QA_ONLY_OVERLAY_NOT_A_DEPLOY_DIRECTORY',files:metadata},null,2));
 return {files:metadata,deployable:false};
}
function qaImageSource(source){
 let image=replaceOne(source,"staging='owner-portal-quarantine',bucket='public-images'","staging='owner-image-quarantine',bucket='public-images'");
 image=replaceOne(image,"createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})","createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{global:{fetch:require('./lib/owner-qa-runtime.cjs').qaFetch(process.env,require('./lib/owner-qa-seal.json'))},auth:{persistSession:false,autoRefreshToken:false}})");
 // Owner QA only: administrator/legacy image branches cannot use an unguarded client.
 image=replaceOne(image,"if(parts[1]==='owner'){","if(parts[1]!=='owner')return answer(403,'QA_OWNER_PATH_REQUIRED');\n if(parts[1]==='owner'){");
 return image;
}
module.exports={prepare,replaceOne,qaImageSource};
