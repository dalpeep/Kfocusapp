const fs=require('node:fs');
const path=require('node:path');
const {assertTestPreview}=require('../netlify/functions/lib/test-preview-guard');
if(!assertTestPreview(process.env,{requireService:false}))throw new Error('TEST_PREVIEW_MODE=true is required.');

const root=path.resolve(__dirname,'..');
const out=path.join(root,'test-dist');
const appUrl=process.env.APP_PUBLIC_URL.replace(/\/$/,'');
const rootFiles=['index.html','privacy.html','manifest.json','robots.txt','_headers','_redirects'];
const rootPattern=/^(?:app(?:-v\d+)?|admin|config|main-banners|styles|v\d+-home-section-controls)\.(?:js|css)$/;
const dirs=['admin','assets','icons'];
if(fs.existsSync(out))throw new Error('test-dist already exists; refusing to overwrite it.');
fs.mkdirSync(out,{recursive:true});
for(const entry of fs.readdirSync(root,{withFileTypes:true})){
  if(entry.isFile()&&(rootFiles.includes(entry.name)||rootPattern.test(entry.name)))
    fs.copyFileSync(path.join(root,entry.name),path.join(out,entry.name));
}
for(const dir of dirs)fs.cpSync(path.join(root,dir),path.join(out,dir),{recursive:true});

function rewrite(folder){
  for(const entry of fs.readdirSync(folder,{withFileTypes:true})){
    const file=path.join(folder,entry.name);
    if(entry.isDirectory()){rewrite(file);continue}
    if(!/\.(?:html|js|css|json|xml|txt)$/.test(entry.name))continue;
    const source=fs.readFileSync(file,'utf8');
    let changed=source.replace(/https:\/\/(?:www\.)?daltownmap\.com/gi,appUrl);
    if(entry.name==='index.html'){
      changed=changed.replace(/<script async src="https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=[^"]+"><\/script>\s*<script>[\s\S]*?gtag\('config',[\s\S]*?<\/script>/,'');
      changed=changed.replace(/<script src="https:\/\/cdn\.onesignal\.com\/sdks\/web\/v16\/OneSignalSDK\.page\.js" defer><\/script>/,'');
      changed=changed.replace(/content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"/,'content="noindex,nofollow"');
    }
    if(/ydrxuqmjzayejlnjzzew|https:\/\/[^\s"']+\.supabase\.co/i.test(changed))
      throw new Error(`Unexpected Supabase reference in Test static bundle: ${path.relative(out,file)}`);
    if(process.env.SUPABASE_SERVICE_ROLE_KEY && changed.includes(process.env.SUPABASE_SERVICE_ROLE_KEY))
      throw new Error(`Service key appeared in Test static bundle: ${path.relative(out,file)}`);
    if(changed!==source)fs.writeFileSync(file,changed);
  }
}
rewrite(out);
fs.writeFileSync(path.join(out,'robots.txt'),'User-agent: *\nDisallow: /\n');
console.log('Test Preview static bundle: prepared from allowlisted files');
