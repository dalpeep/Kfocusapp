const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');

const root=path.join(__dirname,'..');
const shots=path.join(root,'preview','community-retention-1.1');
const fixedNow='2026-10-01T12:00:00.000Z';
const uuid='00000000-0000-4000-8000-000000000001';
const row=(category,expiry,overrides={})=>({
  id:uuid,region:'dallas',area:'dallas',category,title:'[Fixture] 게시글',body:'Preview 전용 가상 게시글입니다.',
  author_name:'Preview',contact_type:null,contact_value:null,view_count:0,comment_count:0,
  created_at:fixedNow,images:[],video_url:null,
  video_provider:'youtube',details:{},status:'approved',expires_at:expiry,extension_count:0,...overrides
});

test('standalone fixture preview is self-contained and blocks remote HTTP requests',async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844}});
    const external=[];
    await page.route(/^https?:/,route=>{external.push(route.request().url());return route.abort()});
    await page.goto(pathToFileURL(path.join(shots,'index.html')).href);
    await page.locator('[data-guide="marketplace"]').click();
    assert.equal(await page.locator('.community-write-inline-guide h3').innerText(),'사고팔기 글쓰기 안내');
    await page.locator('.community-modal-x').click();
    await page.locator('[data-detail="housing90"]').click();
    assert.match(await page.locator('.community-retention-owner').innerText(),/90일 남음/);
    assert.equal(external.length,0);
  }finally{await browser.close()}
});

test('unmigrated Deploy Preview keeps v3 readers and never requests retention v4 RPCs',async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844}});
    const called=[];
    await page.route('**/*',route=>{
      const url=route.request().url();
      if(!url.startsWith('https://preview-fixture.invalid/rest/v1/rpc/'))return route.abort();
      const name=url.split('/').pop();called.push(name);
      assert.ok(['community_get_public_v3','community_comments_public_v3'].includes(name),name);
      return route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(name==='community_get_public_v3'?[row('marketplace','2026-10-31T12:00:00.000Z')]:[])});
    });
    await page.setContent('<meta name="robots" content="index,follow"><main class="app-main"></main>');
    await page.addStyleTag({path:path.join(root,'styles.css')});
    await page.evaluate(()=>{
      globalThis.KFOCUS_CONFIG={SUPABASE_URL:'https://preview-fixture.invalid',SUPABASE_ANON_KEY:'fixture-only',COMMUNITY_TURNSTILE_SITE_KEY:'fixture-only',COMMUNITY_RETENTION_RPC_V4_ENABLED:false};
      globalThis.turnstile={render:()=>1,remove:()=>{},reset:()=>{}};
      globalThis.DtmNavigatePage=()=>{};
    });
    await page.addScriptTag({path:path.join(root,'assets/community-contract.js')});
    await page.addScriptTag({path:path.join(root,'assets/community.js')});
    await page.evaluate(()=>DtmCommunity.openPost('00000000-0000-4000-8000-000000000001'));
    assert.ok(called.includes('community_get_public_v3'));
    assert.ok(called.includes('community_comments_public_v3'));
    assert.equal(await page.locator('.community-retention-owner').count(),0);
  }finally{await browser.close()}
});

test('390×844 fixture preview never reaches Production and renders all guide and retention states',async()=>{
  fs.mkdirSync(shots,{recursive:true});
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
    await page.clock.install({time:new Date(fixedNow)});
    let fixture=row('marketplace','2026-10-31T12:00:00.000Z');
    const called=[];
    await page.route('**/*',async route=>{
      const url=route.request().url();called.push(url);
      if(url.startsWith('https://preview-fixture.invalid/rest/v1/rpc/')){
        const name=new URL(url).pathname.split('/').pop();
        const data=name==='community_get_public_v4'?[fixture]:name==='community_comments_public_v4'?[]:name==='community_list_public_v4'?[]:null;
        assert.notEqual(data,null,`Unexpected RPC ${name}`);
        return route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(data)});
      }
      return route.abort();
    });
    await page.setContent('<meta name="robots" content="index,follow"><main class="app-main"></main>');
    await page.addStyleTag({path:path.join(root,'styles.css')});
    await page.evaluate(()=>{
      globalThis.KFOCUS_CONFIG={SUPABASE_URL:'https://preview-fixture.invalid',SUPABASE_ANON_KEY:'fixture-only',COMMUNITY_TURNSTILE_SITE_KEY:'fixture-only',COMMUNITY_VIDEO_UPLOAD_UI_ENABLED:false,COMMUNITY_RETENTION_RPC_V4_ENABLED:true};
      globalThis.turnstile={render:()=>1,remove:()=>{},reset:()=>{}};
      globalThis.DtmNavigatePage=()=>{};
    });
    await page.addScriptTag({path:path.join(root,'assets/community-contract.js')});
    await page.addScriptTag({path:path.join(root,'assets/community.js')});
    await page.evaluate(()=>DtmCommunity.ensureUI());

    const guides=[
      ['job_hiring','구인','구인 글쓰기 안내'],
      ['job_seeking','구직','구직 글쓰기 안내'],
      ['marketplace','사고팔기','사고팔기 글쓰기 안내'],
      ['housing','부동산','부동산 글쓰기 안내'],
      ['neighborhood','동네소식','동네소식 글쓰기 안내'],
      ['qna','질문정보','질문·정보 글쓰기 안내']
    ];
    await page.locator('#page-community [data-community-write]').first().dispatchEvent('click');
    assert.equal(await page.locator('#communityWriteForm').count(),1);
    assert.equal(await page.getByText('어떤 글을 작성하시나요?').count(),0);
    for(const [category,,title] of guides){
      await page.locator('#communityWriteForm [name=category]').selectOption(category);
      assert.equal(await page.locator('.community-write-inline-guide h3').innerText(),title);
      assert.equal(await page.locator('.community-write-inline-guide li').count(),5);
      await page.screenshot({path:path.join(shots,`guide-${category}-390x844.png`)});
    }
    await page.locator('#communityWriteForm [name=category]').selectOption('marketplace');
    assert.match(await page.locator('.community-guide-notice').innerText(),/만료 전에 작성자가 1회에 한해 30일 연장/);
    await page.locator('#communityWriteForm [name=category]').selectOption('housing');
    assert.match(await page.locator('.community-guide-notice').innerText(),/관리자 확인 후 공개/);
    assert.match(await page.locator('.community-guide-notice').innerText(),/만료 전에 작성자가 1회에 한해 90일 연장/);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.locator('[data-community-close]').last().click();

    async function detail(name,data,{button,warning=false,done=false}={}){
      fixture=data;
      await page.evaluate(id=>DtmCommunity.openPost(id),uuid);
      const area=page.locator('.community-retention-owner');
      await area.waitFor();
      await area.scrollIntoViewIfNeeded();
      assert.match(await area.innerText(),/게시 종료: 202[67]년/);
      if(button)assert.equal(await area.getByRole('button',{name:button}).count(),1);
      else assert.equal(await area.locator('[data-retention-extend]').count(),0);
      assert.equal(await area.getByText('게시기간이 7일 이내에 종료됩니다.').count(),warning?1:0);
      assert.equal(await area.getByText('게시기간 연장 완료').count(),done?1:0);
      await page.screenshot({path:path.join(shots,`${name}-390x844.png`)});
    }
    await detail('marketplace-30d',row('marketplace','2026-10-31T12:00:00.000Z'),{button:'게시기간 30일 연장'});
    assert.match(await page.locator('.community-retention-owner').innerText(),/30일 남음/);
    await detail('marketplace-extended',row('marketplace','2026-11-30T12:00:00.000Z',{extension_count:1}),{done:true});
    await detail('housing-90d',row('housing','2026-12-30T12:00:00.000Z'),{button:'게시기간 90일 연장'});
    assert.match(await page.locator('.community-retention-owner').innerText(),/90일 남음/);
    await detail('housing-extended',row('housing','2027-03-30T12:00:00.000Z',{extension_count:1}),{done:true});
    await detail('marketplace-seven-days',row('marketplace','2026-10-08T12:00:00.000Z'),{button:'게시기간 30일 연장',warning:true});
    await detail('marketplace-sold',row('marketplace','2026-10-31T12:00:00.000Z',{status:'sold'}));
    assert.ok(called.every(url=>url.startsWith('https://preview-fixture.invalid/')||url.startsWith('https://www.youtube.com/')),called.join('\n'));
  }finally{await browser.close()}
});
