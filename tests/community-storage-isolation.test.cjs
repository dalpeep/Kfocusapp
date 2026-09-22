const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const security=require('../netlify/functions/lib/community-security');

test('Community Storage fails closed without its dedicated bucket',()=>{
  const saved={url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY,bucket:process.env.COMMUNITY_STORAGE_BUCKET,generic:process.env.STORAGE_BUCKET};
  try{
    process.env.SUPABASE_URL='https://example.invalid';
    process.env.SUPABASE_SERVICE_ROLE_KEY='test-only';
    process.env.STORAGE_BUCKET='public-images';
    delete process.env.COMMUNITY_STORAGE_BUCKET;
    assert.throws(()=>security.env(),{status:503});
    process.env.COMMUNITY_STORAGE_BUCKET='public-images';
    assert.throws(()=>security.env(),{status:503});
    process.env.COMMUNITY_STORAGE_BUCKET='community-images';
    assert.equal(security.env().bucket,'community-images');
  }finally{
    for(const [key,value] of Object.entries({SUPABASE_URL:saved.url,SUPABASE_SERVICE_ROLE_KEY:saved.key,COMMUNITY_STORAGE_BUCKET:saved.bucket,STORAGE_BUCKET:saved.generic})){
      if(value===undefined)delete process.env[key];else process.env[key]=value;
    }
  }
});

test('every Community upload and cleanup path uses the dedicated authority',()=>{
  const browser=read('assets/community.js');
  assert.equal((browser.match(/\.storage\.from\(communityBucket\(\)\)/g)||[]).length,3);
  assert.doesNotMatch(browser,/cfg\(\)\.STORAGE_BUCKET|storage\.from\(['"]public-images['"]\)/);
  for(const file of ['community-post-create.js','community-upload-authorize.js','lib/community-image-edit.js','lib/community-cleanup.js']){
    const source=read('netlify/functions/'+file);
    assert.match(source,/S\.env\(\)\.bucket/);
    assert.doesNotMatch(source,/storage\.from\(['"]public-images['"]\)/);
  }
  const config=read('netlify/functions/config.js');
  assert.match(config,/COMMUNITY_STORAGE_BUCKET:[\s\S]*?process\.env\.COMMUNITY_STORAGE_BUCKET === 'community-images'/);
  assert.doesNotMatch(config,/COMMUNITY_TURNSTILE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY/);
});

test('Community hash routes are noindex and navigation restores the original robots value',()=>{
  const community=read('assets/community.js'),app=read('app-v99.js');
  assert.match(community,/const defaultRobots=document\.querySelector/);
  assert.match(community,/meta\.setAttribute\('content','noindex,follow'\)/);
  assert.match(community,/meta\.setAttribute\('content',defaultRobots\)/);
  assert.match(community,/root\.addEventListener\('hashchange',syncRobots\)/);
  assert.match(app,/DtmCommunity\?\.syncRobots\?\.\(\)/);
  assert.doesNotMatch(read('sitemap.xml'),/community\/post/);
  assert.match(read('admin/index.html'),/<meta name="robots" content="noindex,nofollow"/);
  const initial='index,follow,max-image-preview:large';
  const meta={content:initial,getAttribute(){return this.content},setAttribute(_name,value){this.content=value}};
  const state={document:{querySelector:()=>meta,addEventListener(){}},location:{hash:'#community'},addEventListener(){}};
  state.globalThis=state;state.window=state;
  vm.runInNewContext(community,state);
  assert.equal(meta.content,'noindex,follow');
  state.location.hash='#community/post/123e4567-e89b-12d3-a456-426614174000';
  state.DtmCommunity.syncRobots();
  assert.equal(meta.content,'noindex,follow');
  state.location.hash='#business';
  state.DtmCommunity.syncRobots();
  assert.equal(meta.content,initial);
});
