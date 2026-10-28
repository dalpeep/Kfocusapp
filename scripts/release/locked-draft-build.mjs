import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {verify} from './verify-preservation.mjs';

// Build-only harness. Never invoke deployed Functions or run migrations.
const baseline=JSON.parse(fs.readFileSync('release-baseline/draft-build.json'));
const sha=(file,algorithm='sha256')=>createHash(algorithm).update(fs.readFileSync(file)).digest('hex');
let stage='context';
try {
  if(process.env.CONTEXT!=='production'||process.env.SITE_ID!==baseline.siteId)throw Error();
  stage='approved-source';
  for(const f of baseline.fingerprint)if(sha(f.path)!==f.sha256)throw Error();
  const preservation=verify();
  console.log(JSON.stringify({stage:'preservation',...preservation}));
  if(process.argv.includes('--verify-only'))process.exit(0);
  stage='seo-readonly';
  const env={...process.env};
  // SEO may use only the already configured public anonymous credential.
  delete env.SUPABASE_SERVICE_ROLE_KEY;
  const key=env.SUPABASE_ANON_KEY||env.VITE_SUPABASE_ANON_KEY||env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(!(env.SUPABASE_URL||env.VITE_SUPABASE_URL||env.NEXT_PUBLIC_SUPABASE_URL)||!key)throw Error();
  // Raw SEO errors/responses must never be written into hosted build logs.
  const seo=spawnSync(process.execPath,['scripts/generate-seo.js'],{env,encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:8*1024*1024});
  if(seo.error||seo.status!==0||seo.stderr?.trim())throw Error();
  if(!/\[SEO\] Generated \d+ business pages, \d+ category pages, \d+ coupon sitemap entries, \d+ post sitemap entries\./.test(seo.stdout))throw Error();
  console.log('SEO_GENERATION_COMPLETED');
  stage='public-output';
  const out='.public-build';
  if(fs.existsSync(out))throw Error();
  fs.mkdirSync(out);
  const copy=(source,target)=>{
    if(target.startsWith('/')||target.split('/').includes('..')||target.includes('\\'))throw Error();
    const destination=path.join(out,target);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.copyFileSync(source,destination);
  };
  // Preserve existing public paths, including legacy source paths already public.
  // Do not publish the new runtime wrappers, diagnostics, tests or migrations.
  for(const f of baseline.files)copy(f.source,f.target);
  for(const directory of ['business','category'])if(fs.existsSync(directory))for(const file of fs.readdirSync(directory))if(file.endsWith('.html'))copy(path.join(directory,file),directory+'/'+file);
  for(const file of ['seo.html','sitemap.xml','business-index.json','seo-index.json','robots.txt','llms.txt'])if(fs.existsSync(file))copy(file,file);
  const files=[];
  const walk=dir=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else files.push(file);}};
  walk(out);
  const secretPatterns=[/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/sb_secret_[A-Za-z0-9_-]{20,}/,/postgres(?:ql)?:\/\/[^\s/]+:[^\s@]+@/];
  for(const file of files)if(/\.(?:js|mjs|json|html|txt|toml|ya?ml|sql)$/.test(file)){
    const text=fs.readFileSync(file,'utf8');
    if(secretPatterns.some(pattern=>pattern.test(text)))throw Error();
    for(const match of text.matchAll(/\beyJ[A-Za-z0-9_-]+\.(eyJ[A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g)){
      let payload;try{payload=JSON.parse(Buffer.from(match[1],'base64url'));}catch{throw Error();}
      if(payload.role!=='anon')throw Error();
    }
  }
  const changed=baseline.files.filter(f=>sha(path.join(out,f.target),'sha1')!==f.publishedSha1).map(f=>f.target);
  const approved=new Set(['app-v99.js','assets/community.js','index.html','styles.css','netlify.toml','package.json','robots.txt','seo-index.json','seo.html','sitemap.xml','business-index.json','llms.txt',...files.map(p=>p.replaceAll('\\','/').replace(out+'/','')).filter(p=>/^(?:business|category)\/[^/]+\.html$/.test(p))]);
  if(changed.some(file=>!approved.has(file)))throw Error();
  fs.mkdirSync('.release-artifacts',{recursive:true});
  fs.writeFileSync('.release-artifacts/hosted-public-audit.json',JSON.stringify({existingPaths:baseline.files.length,files:files.length,changed,secretScan:'PASS',newPrivatePaths:false},null,2));
  console.log(JSON.stringify({stage:'public-output',existingPaths:baseline.files.length,files:files.length,secretScan:'PASS'}));
}catch{
  console.error(JSON.stringify({error:'LOCKED_DRAFT_BUILD_STOPPED',stage,detailsSuppressed:true}));
  process.exitCode=1;
}
