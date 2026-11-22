import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { registerHooks } from 'node:module';
import { chromium } from 'playwright';
import { featureKeys } from '../../region-platform/qa-features.mjs';
import { createRegion } from '../../region-platform/region-config.mjs';

test('Colorado QA feature forms, write guards, public projection and restore', { skip: !process.env.REGION_QA_FEATURE_TEST }, async () => {
  const values = new Map();
  globalThis.issue143MockStore = () => ({
      get: async key => values.get(key)?.data ?? null,
      getWithMetadata: async key => values.get(key) ?? null,
      setJSON: async (key,data,condition) => {
        const prior = values.get(key);
        if (prior ? condition.onlyIfMatch !== prior.etag : !condition.onlyIfNew) return {modified:false};
        values.set(key,{data,etag:String(Number(prior?.etag??0)+1)});
        return {modified:true};
      }
    });
  const hooks = registerHooks({resolve(specifier,context,next){
    if(specifier==='@netlify/blobs' && context.parentURL?.endsWith('/feature-store.mjs')) {
      return {url:'data:text/javascript,export const getStore=()=>globalThis.issue143MockStore()',shortCircuit:true};
    }
    return next(specifier,context);
  }});
  const { default: handler } = await import('../../region-platform/owner-test/functions/directory-qa.mjs');
  hooks.deregister();
  const host='https://colorado-qa--online-business-directory-qa-138.netlify.app';
  const region=createRegion({slug:'colorado',name:'콜로라도',center:{lat:39,lng:-105.5}});
  region.status='demo'; region.map.radiusKm=50;
  region.content.posts.push({title:'Fixture question',category:'생활정보·질문'});
  const id='00000000-0000-4000-8000-000000000001';
  region.businessQa={records:[{id,visible:true,approved:{name:'Fixture Business',lat:39,lng:-105.5,image:host+'/media/colorado/'+id},claims:[]}],categories:[]};
  const roles={'qa-central':{role:'superadmin'},'qa-regional':{role:'region-admin',region:'colorado'},'qa-owner':{role:'owner',region:'colorado'}};
  const authorization=role=>'Basic '+Buffer.from(role+':'+('0'.repeat(64))).toString('base64');
  process.env.DIRECTORY_QA_PUBLIC_KEY='qa';
  process.env.DIRECTORY_QA_GATE='0'.repeat(64);
  mock.method(globalThis,'fetch',async (_url,options)=>{
    const {op,actor,area}=JSON.parse(options.body);
    const result=op==='identity'?{status:200,...roles[actor],name:actor}:op==='list'?{status:200,regions:[region]}:
      area!=='colorado'?{status:404}:op==='image'?{status:200,type:'image/png',image:'AA=='}:{status:200,region,version:id};
    return Response.json(result);
  });
  const request=(path,role,body)=>handler(new Request(host+path,{method:body?'POST':'GET',headers:role?{authorization:authorization(role),origin:host}:{},body}));
  const route='/admin/features?region=colorado';
  const publicPath='/regions/colorado';
  assert.equal((await request(route)).status,401);
  assert.equal((await request(route,'qa-owner')).status,403);
  assert.equal((await request('/admin/features?region=austin','qa-regional')).status,404);
  const form=(changes,version='')=>new URLSearchParams({version,...Object.fromEntries(featureKeys.map(k=>[k,'inherit'])),...changes});
  assert.equal((await request('/admin/features?region=*','qa-central',form({banner:'off'}))).status,303);
  const detailPath=publicPath+'?business='+id;
  assert.equal((await request(detailPath)).status,200);
  assert.match(await (await request(detailPath)).text(),/id="business"/);
  assert.equal((await request(publicPath+'?business=unknown')).status,404);
  assert.equal((await request(route,'qa-central',form({directory:'off'}))).status,303);
  assert.equal((await request(detailPath)).status,404);
  assert.equal((await request(route,'qa-central',form({},'1'))).status,303);
  assert.match(await (await request(detailPath)).text(),/Fixture Business/);
  const unchanged=JSON.stringify(region);
  const browser=await chromium.launch({executablePath:process.env.REGION_QA_BROWSER});
  try {
    for(const [width,role] of [[390,'qa-regional'],[1440,'qa-central']]){
      const page=await browser.newPage({viewport:{width,height:900}});
      await page.route(host+'/**',async intercepted=>{
        const req=intercepted.request();
        let result=await handler(new Request(req.url(),{method:req.method(),headers:{...req.headers(),authorization:authorization(role),origin:host},body:req.postDataBuffer()??undefined}));
        if(result.status===303) result=await request(result.headers.get('location'),role);
        await intercepted.fulfill({status:result.status,headers:Object.fromEntries(result.headers),body:Buffer.from(await result.arrayBuffer())});
      });
      await page.goto(host+publicPath+'#directory');
      await page.locator('#directory').getByRole('link',{name:'Fixture Business',exact:true}).click();
      await page.getByRole('region',{name:'업소 상세'}).getByRole('heading',{name:'Fixture Business'}).waitFor();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.getByRole('link',{name:'업소 목록으로 돌아가기'}).click();
      await page.locator('#directory').getByRole('link',{name:'Fixture Business',exact:true}).waitFor();
      await page.goto(host+route);
      await page.locator('[name=boardHelp]').uncheck();
      await page.locator('[name=search]').uncheck();
      await page.locator('[name=registration]').uncheck();
      await page.locator('[name=photos]').uncheck();
      await page.getByRole('button',{name:'저장',exact:true}).click();
      await page.getByRole('status').waitFor();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      const html=await (await request(publicPath)).text();
      assert.doesNotMatch(html,/Fixture question|aria-label="검색 열기"|aria-label="메인 배너"/);
      assert.equal((await request(publicPath+'?q=Fixture')).status,404);
      assert.equal((await request(publicPath+'?board='+encodeURIComponent('생활정보·질문'))).status,404);
      assert.equal((await request('/media/colorado/'+id)).status,404);
      assert.equal((await request('/admin/businesses?region=colorado','qa-owner',new URLSearchParams({action:'create'}))).status,404);
      assert.equal((await request(route,'qa-regional',form({search:'on'}))).status,409);
      await page.goto(host+route);
      assert.equal(await page.locator('[name=boardHelp]').isChecked(), false);
      assert.equal(await page.locator('[name=banner]').isChecked(), false);
      for(const key of ['boardHelp','search','registration','photos'])await page.locator('[name="inherit:'+key+'"]').check();
      await page.getByRole('button',{name:'저장',exact:true}).click();
      await page.getByRole('status').waitFor();
      assert.match(await (await request(publicPath)).text(),/Fixture question/);
      assert.equal(values.get('region/colorado').data.flags.search,undefined);
      assert.equal((await request('/media/colorado/'+id)).status,200);
      await page.close();
    }
    assert.equal(JSON.stringify(region),unchanged);
  } finally { await browser.close(); }
});


