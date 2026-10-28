import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {spawnSync,execFileSync} from 'node:child_process';
const require=createRequire(import.meta.url),auth=require('../../scripts/release/seo-public-auth.cjs');
const ref='aaaaaaaaaaaaaaaaaaaa',url=`https://${ref}.supabase.co`;
const key=(role='anon',project=ref,extra={})=>[Buffer.from('{}').toString('base64url'),Buffer.from(JSON.stringify({role,ref:project,...extra})).toString('base64url'),'fixture'].join('.');
const env=()=>({SUPABASE_URL:url,SUPABASE_ANON_KEY:key()});
test('explicit anonymous credential, no fetch',async()=>assert.equal((await auth.resolvePublicAuth(env(),()=>{throw Error()})).source,'public-environment'));
test('resolved shared Builds variables stay unchanged',async()=>{const e=Object.freeze(env());assert.equal((await auth.resolvePublicAuth(e)).source,'public-environment')});
for(const [label,e,f,code] of [
 ['missing URL',{},null,'SEO_PUBLIC_URL_MISSING'],
 ['ServiceRole env rejected',{...env(),SUPABASE_ANON_KEY:key('service_role')},null,'SEO_PUBLIC_KEY_INVALID'],
 ['user JWT rejected',{...env(),SUPABASE_ANON_KEY:key('authenticated')},null,'SEO_PUBLIC_KEY_INVALID'],
 ['wrong project',{...env(),SUPABASE_ANON_KEY:key('anon','bbbbbbbbbbbbbbbbbbbb')},null,'SEO_PUBLIC_KEY_INVALID'],
 ['expired',{...env(),SUPABASE_ANON_KEY:key('anon',ref,{exp:1})},null,'SEO_PUBLIC_KEY_INVALID'],
 ['secret key rejected',{...env(),SUPABASE_ANON_KEY:'sb_secret_fixture'},null,'SEO_PUBLIC_KEY_INVALID']
])test(label,async()=>assert.rejects(()=>auth.resolvePublicAuth(e),{code}));
test('ServiceRole-only environment fails without public key',async()=>assert.rejects(()=>auth.resolvePublicAuth({SUPABASE_URL:url,SUPABASE_SERVICE_ROLE_KEY:key('service_role')}),{code:'SEO_PUBLIC_KEY_MISSING'}));
const fixture={businesses:[{id:'10000000-0000-4000-8000-000000000001',name_ko:'가상 업소',name_en:'Fixture Shop',category:'식당',area:'Dallas',region:'dallas',description:'public fixture',phone:'214-555-0100',address:'QA fixture',is_active:true,list_visible:true,created_at:'2026-01-01T00:00:00Z'}],coupons:[{id:'20000000-0000-4000-8000-000000000001',is_active:true}],posts:[{id:'30000000-0000-4000-8000-000000000001',is_active:true}]};
function run(mode='normal',custom=fixture){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dtm-seo-'));fs.mkdirSync(path.join(dir,'scripts/release'),{recursive:true});fs.mkdirSync(path.join(dir,'business'));fs.mkdirSync(path.join(dir,'category'));fs.writeFileSync(path.join(dir,'business/stale-hidden.html'),'stale hidden fixture');
 for(const p of ['scripts/generate-seo.js','scripts/release/seo-public-auth.cjs'])fs.copyFileSync(p,path.join(dir,p));
 fs.writeFileSync(path.join(dir,'fixture.json'),JSON.stringify(custom));
 const preload=`const fs=require('fs');const rows=JSON.parse(fs.readFileSync('fixture.json'));const mode=${JSON.stringify(mode)};global.fetch=async(input,options)=>{if(options.method!=='GET')throw Error('WRITE_FORBIDDEN');const u=new URL(input),table=u.pathname.split('/').pop();if(u.searchParams.get('select').includes('coupon_code')||u.searchParams.get('select')==='*')throw Error('PROJECTION_FORBIDDEN');if(mode==='network')throw Error('private response fixture');if(mode==='http')return {ok:false,status:403};if(mode==='json')return {ok:true,headers:new Headers({'content-range':'0-0/1'}),json:async()=>{throw Error('private fixture')}};let data=rows[table]||[],count=data.length;if(mode==='empty')data=[],count=0;if(mode==='partial')count++;if(mode==='no-count')return {ok:true,headers:new Headers(),json:async()=>data};if(mode==='hidden')data=table==='businesses'?data.map(x=>({...x,list_visible:false})):data;if(mode==='inactive')data=table==='posts'?data.map(x=>({...x,is_active:false})):data;if(mode==='duplicate')data=[data[0],data[0]],count=2;const offset=Number(u.searchParams.get('offset'));if(mode==='page-change'&&offset)count++;data=data.slice(offset,offset+500);return {ok:true,headers:new Headers({'content-range':(data.length?offset+'-'+(offset+data.length-1):'*')+'/'+count}),json:async()=>data}};`;
 fs.writeFileSync(path.join(dir,'preload.cjs'),preload);
 const result=spawnSync(process.execPath,['--require','./preload.cjs','scripts/generate-seo.js'],{cwd:dir,encoding:'utf8',env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,SUPABASE_URL:url,SUPABASE_ANON_KEY:key()}});
 return {dir,result,clean:()=>fs.rmSync(dir,{recursive:true,force:true})};
}
test('full generator preserves public URLs and clears stale hidden output',()=>{const r=run();try{assert.equal(r.result.status,0);const x=JSON.parse(fs.readFileSync(path.join(r.dir,'seo-index.json')));assert.equal(x.business_count,1);assert.equal(x.coupon_count,1);assert.equal(x.post_count,1);assert.equal(x.categories.length,1);const map=fs.readFileSync(path.join(r.dir,'sitemap.xml'),'utf8');assert.match(map,/business\/fixture-shop-10000000\.html/);assert.match(map,/#coupon-detail\?id=/);assert.match(map,/#board-detail\?id=/);assert.equal(fs.existsSync(path.join(r.dir,'business/stale-hidden.html')),false)}finally{r.clean()}});
for(const [mode,code]of [['network','SEO_SOURCE_UNAVAILABLE'],['http','SEO_SOURCE_HTTP_403'],['json','SEO_SOURCE_JSON_INVALID'],['empty','SEO_PUBLIC_BUSINESSES_EMPTY'],['partial','SEO_SOURCE_INCOMPLETE'],['no-count','SEO_SOURCE_COUNT_MISSING'],['hidden','SEO_PRIVATE_BUSINESS_REJECTED'],['inactive','SEO_PRIVATE_CONTENT_REJECTED'],['duplicate','SEO_SOURCE_ID_INVALID']])test('fail closed '+mode,()=>{const r=run(mode);try{assert.notEqual(r.result.status,0);assert.match(r.result.stderr,new RegExp(code));assert.ok(!r.result.stderr.includes('private'));assert.equal(fs.existsSync(path.join(r.dir,'seo-index.json')),false);assert.equal(fs.readFileSync(path.join(r.dir,'business/stale-hidden.html'),'utf8'),'stale hidden fixture')}finally{r.clean()}});
test('pagination covers more than one server page',()=>{const data={...fixture,businesses:Array.from({length:501},(_,i)=>({...fixture.businesses[0],id:String(i).padStart(8,'0')+'-0000-4000-8000-000000000000'}))};const r=run('normal',data);try{assert.equal(r.result.status,0);assert.equal(JSON.parse(fs.readFileSync(path.join(r.dir,'business-index.json'))).length,501)}finally{r.clean()}});
test('concurrent source change blocks incomplete sitemap',()=>{const data={...fixture,businesses:Array.from({length:501},(_,i)=>({...fixture.businesses[0],id:String(i).padStart(8,'0')}))};const r=run('page-change',data);try{assert.notEqual(r.result.status,0);assert.match(r.result.stderr,/SEO_SOURCE_CHANGED/)}finally{r.clean()}});
test('rendering and slug functions match approved public format',()=>{const original=execFileSync('git',['show','8a61cb638d94430792bc0bc6b96c08e7dc296e0a:scripts/generate-seo.js'],{encoding:'utf8'}).replace(/main\(\)\.catch\(err => \{[\s\S]*$/,'');const context={require,console,process:{env:{}},__dirname:path.resolve('scripts')};vm.createContext(context);vm.runInContext(original,context);const current=require('../../scripts/generate-seo.js'),b=fixture.businesses[0],slug=current.businessSlug(b);assert.equal(slug,context.businessSlug(b));assert.equal(current.businessPage(b,slug),context.businessPage(b,slug));assert.equal(current.categoryPage('식당','Dallas',[b]),context.categoryPage('식당','Dallas',[b]));assert.equal(current.homeSeoPage(),context.homeSeoPage())});

test('existing Korean category URL collisions fail before output writes',()=>{const data={...fixture,businesses:[fixture.businesses[0],{...fixture.businesses[0],id:'10000001-0000-4000-8000-000000000001',category:'카페'}]};const r=run('normal',data);try{assert.notEqual(r.result.status,0);assert.match(r.result.stderr,/SEO_CATEGORY_URL_COLLISION/);assert.equal(fs.existsSync(path.join(r.dir,'seo-index.json')),false);assert.equal(fs.readFileSync(path.join(r.dir,'business/stale-hidden.html'),'utf8'),'stale hidden fixture')}finally{r.clean()}});
test('baseline ServiceRole fallback was optional, and HTTP errors became empty success',async()=>{
 const original=execFileSync('git',['show','8a61cb638d94430792bc0bc6b96c08e7dc296e0a:scripts/generate-seo.js'],{encoding:'utf8'}).replace(/main\(\)\.catch\(err => \{[\s\S]*$/,'');
 const warnings=[],context={require,console:{warn:(...args)=>warnings.push(args.join(' '))},process:{env:env()},__dirname:path.resolve('scripts'),fetch:async()=>({ok:false,status:400,text:async()=>'{"code":"42703"}'})};
 vm.createContext(context);vm.runInContext(original,context);const rows=await context.supabaseFetch('businesses','id,image');assert.equal(rows.length,0);assert.match(warnings[0],/400/);assert.match(original,/process\.env\.SUPABASE_SERVICE_ROLE_KEY/);assert.doesNotMatch(fs.readFileSync('scripts/generate-seo.js','utf8'),/process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
});
