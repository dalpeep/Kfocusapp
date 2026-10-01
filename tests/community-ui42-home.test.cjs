const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const app=fs.readFileSync(path.join(root,'app-v99.js'),'utf8');
const source=fs.readFileSync(path.join(root,'assets/community.js'),'utf8');
const now=new Date().toISOString();
const rows=['marketplace','housing','job_hiring','job_seeking','neighborhood','qna','marketplace'].map((category,index)=>({id:String(index+1),category,title:`${category} ${index}`,area:'dallas',created_at:now,details:{},total_count:7}));

test('main Community navigation uses only the seven full-board categories',()=>{
  const home=html.slice(html.indexOf('community-home-card'),html.indexOf('id="page-business"'));
  assert.match(home,/id="communityHomeFilters" class="community-category-filters life-category-filters"/);
  assert.doesNotMatch(home,/id="communityTabs"|id="lifeCategoryFilters"|행사안내|달라스 라이프|업소탐방/);
  assert.match(app,/DtmCommunity\?\.renderHome\(homeBoardList,selectedHomeCommunityCategory\)/);
  assert.match(app,/data-community-home-category/);
  assert.match(app,/DtmCommunity\?\.openPage\(boardPostsByType\('life'\),selectedHomeCommunityCategory\)/);
  assert.match(source,/p_limit:3/);
  assert.doesNotMatch(source,/legacyRows\.slice\(0,Math\.max\(0,4-rows\.length\)\)/);
});

test('390px home and full board share chips, cards, filtering and empty state',async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844}});
    await page.route('https://ui42.test/',route=>route.fulfill({status:200,body:'<html><body></body></html>'}));
    await page.goto('https://ui42.test/');
    await page.setContent('<html><head><meta name="robots" content="index,follow"></head><body><div class="app-shell"><main><section class="card section-card community-home-card"><div id="communityHomeFilters" class="community-category-filters life-category-filters"></div><div id="homeBoardList" class="home-board-list"></div></section></main></div></body></html>');
    await page.addStyleTag({path:path.join(root,'styles.css')});
    await page.evaluate(data=>{
      window.APP_CONFIG={APP_REGION:'dallas',SUPABASE_URL:'https://example.invalid',SUPABASE_ANON_KEY:'test'};
      window.DtmNavigatePage=()=>{};
      window.__communityRows=data;
      window.fetch=async(_url,options)=>{const args=JSON.parse(options.body),filtered=window.__communityRows.filter(row=>!args.p_category||row.category===args.p_category);return {ok:true,json:async()=>filtered.slice(args.p_offset,args.p_offset+args.p_limit)}};
    },rows);
    await page.addScriptTag({path:path.join(root,'assets/community-contract.js')});
    await page.addScriptTag({path:path.join(root,'assets/community.js')});
    await page.evaluate(async()=>{await DtmCommunity.renderHome(document.getElementById('homeBoardList'),'all');await DtmCommunity.load()});
    const labels=['전체','구인','구직','사고팔기','부동산','동네소식','질문정보'];
    assert.deepEqual(await page.locator('#communityHomeFilters button').allTextContents(),labels);
    assert.deepEqual(await page.locator('#communityCategoryFilters button').allTextContents(),labels);
    assert.equal(await page.locator('#homeBoardList .community-ui4-card').count(),3);
    assert.equal(await page.locator('#homeBoardList .community-ui4-card').first().evaluate(el=>el.outerHTML),await page.locator('#communityResults .community-ui4-card').first().evaluate(el=>el.outerHTML));
    const style=await page.evaluate(()=>{
      const home=getComputedStyle(document.querySelector('#communityHomeFilters button'));
      const full=getComputedStyle(document.querySelector('#communityCategoryFilters button'));
      return {same:['height','borderRadius','fontSize','backgroundColor','paddingLeft','borderTopColor'].every(key=>home[key]===full[key]),scrollbar:getComputedStyle(document.getElementById('communityHomeFilters')).scrollbarWidth,overflow:getComputedStyle(document.getElementById('communityHomeFilters')).overflowX};
    });
    assert.deepEqual(style,{same:true,scrollbar:'none',overflow:'auto'});
    await page.evaluate(async()=>DtmCommunity.renderHome(document.getElementById('homeBoardList'),'job_hiring'));
    assert.equal(await page.locator('#homeBoardList .community-ui4-card').count(),1);
    assert.equal(await page.locator('#communityHomeFilters button.active').innerText(),'구인');
    await page.evaluate(async()=>DtmCommunity.renderHome(document.getElementById('homeBoardList'),'housing'));
    assert.equal(await page.locator('#homeBoardList .community-ui4-card').count(),1);
    await page.evaluate(async()=>DtmCommunity.renderHome(document.getElementById('homeBoardList'),'neighborhood'));
    assert.equal(await page.locator('#homeBoardList .community-ui4-card').count(),1);
    await page.evaluate(async()=>DtmCommunity.renderHome(document.getElementById('homeBoardList'),'job_hiring'));
    await page.evaluate(async()=>DtmCommunity.renderHome(document.getElementById('homeBoardList'),'qna'));
    assert.equal(await page.locator('#homeBoardList .community-ui4-qna').count(),1);
    await page.evaluate(async()=>DtmCommunity.renderHome(document.getElementById('homeBoardList'),'job_seeking'));
    assert.equal(await page.locator('#homeBoardList .community-ui4-job_seeking').count(),1);
    await page.evaluate(async()=>{window.__communityRows=window.__communityRows.filter(row=>row.category!=='job_hiring');await DtmCommunity.renderHome(document.getElementById('homeBoardList'),'job_hiring')});
    assert.match(await page.locator('#homeBoardList').innerText(),/아직 등록된 구인 글이 없습니다/);
    assert.equal(await page.locator('#homeBoardList [data-community-write]').count(),1);
    await page.evaluate(()=>DtmCommunity.openPage([], 'marketplace'));
    await page.locator('#communityCategoryFilters button.active').waitFor({state:'attached'});
    assert.equal(await page.locator('#communityCategoryFilters button.active').textContent(),'사고팔기');
    await page.evaluate(async()=>DtmCommunity.renderHome(document.getElementById('homeBoardList'),'all'));
    const overflow=await page.evaluate(()=>({width:window.innerWidth,scrollWidth:document.documentElement.scrollWidth,offenders:[...document.querySelectorAll('*')].filter(el=>el.getBoundingClientRect().right>window.innerWidth+1).slice(0,5).map(el=>({tag:el.tagName,className:el.className,right:el.getBoundingClientRect().right}))}));
    assert.ok(overflow.scrollWidth<=overflow.width,JSON.stringify(overflow));
    await page.close();
  }finally{await browser.close()}
});
