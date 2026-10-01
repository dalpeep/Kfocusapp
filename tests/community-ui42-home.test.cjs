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
const rows=['marketplace','housing','job_hiring','job_seeking','neighborhood','qna','marketplace'].map((category,index)=>({id:String(index+1),category,title:`${category} ${index}`,area:'dallas',created_at:now,details:{},total_count:7,...(index<2?{image_url:'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='}:{})}));

test('main Community restores three tabs and nests seven board categories in Dallas Life',()=>{
  const home=html.slice(html.indexOf('community-home-card'),html.indexOf('id="page-business"'));
  assert.match(home,/id="communityTabs"/);
  assert.match(home,/data-board="notice">행사안내/);
  assert.match(home,/class="community-tab active" data-board="life">달라스 라이프/);
  assert.match(home,/data-board="business_story">업소탐방/);
  assert.match(home,/id="communityHomeFilters" class="community-category-filters life-category-filters"/);
  assert.match(home,/class="community-home-write" type="button" data-community-write/);
  assert.match(app,/let selectedBoardType = 'life'/);
  assert.match(app,/classList\.toggle\('hidden',!life\)/);
  assert.match(app,/if\(life\)\{\s*globalThis\.DtmCommunity\?\.renderHome\(homeBoardList,selectedHomeCommunityCategory\)/);
  assert.match(app,/boardPostsByType\(type\)\.slice\(0,4\)/);
  assert.match(app,/rows\.map\(boardListItemHTML\)/);
  assert.match(app,/if\(selectedBoardType!=='life'\)\{showBoard\(selectedBoardType\);return;\}/);
  assert.match(app,/DtmCommunity\?\.renderHome\(homeBoardList,selectedHomeCommunityCategory\)/);
  assert.match(app,/data-community-home-category/);
  assert.match(app,/selectedHomeCommunityCategory=selectedHomeCommunityCategory===category\?'all':category/);
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
    await page.setContent('<html><head><meta name="robots" content="index,follow"></head><body><div class="app-shell"><main><section class="card section-card community-home-card"><div class="section-head compact-head"><h3 class="section-title">커뮤니티</h3><div class="community-home-actions"><button class="community-home-write" data-community-write>＋ 글쓰기</button><button class="text-link community-full-btn">전체보기</button></div></div><div id="communityTabs" class="community-tabs"><button class="community-tab">행사안내</button><button class="community-tab active">달라스 라이프</button><button class="community-tab">업소탐방</button></div><div id="communityHomeFilters" class="community-category-filters life-category-filters"></div><div id="homeBoardList" class="home-board-list"></div></section></main></div></body></html>');
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
    assert.deepEqual(await page.locator('#communityHomeFilters button').allTextContents(),labels.slice(1));
    assert.equal(await page.locator('#communityHomeFilters button.active').count(),0);
    assert.deepEqual(await page.locator('#communityCategoryFilters button').allTextContents(),labels);
    assert.equal(await page.locator('#homeBoardList .community-ui4-card').count(),3);
    assert.equal(await page.locator('#homeBoardList .community-ui4-card').first().evaluate(el=>el.outerHTML),await page.locator('#communityResults .community-ui4-card').first().evaluate(el=>el.outerHTML));
    const style=await page.evaluate(()=>{
      const home=getComputedStyle(document.querySelector('#communityHomeFilters button'));
      return {height:home.height,scrollbar:getComputedStyle(document.getElementById('communityHomeFilters')).scrollbarWidth,overflow:getComputedStyle(document.getElementById('communityHomeFilters')).overflowX};
    });
    assert.deepEqual(style,{height:'32px',scrollbar:'none',overflow:'auto'});
    const lastChip=await page.locator('#communityHomeFilters button').last().evaluate(el=>({text:el.textContent,right:el.getBoundingClientRect().right,containerRight:el.parentElement.getBoundingClientRect().right}));
    assert.equal(lastChip.text,'질문정보');
    assert.ok(lastChip.right<=lastChip.containerRight,JSON.stringify(lastChip));
    const header=await page.locator('.community-home-card .section-head').evaluate(el=>{const title=el.querySelector('.section-title').getBoundingClientRect(),write=el.querySelector('.community-home-write').getBoundingClientRect(),more=el.querySelector('.community-full-btn').getBoundingClientRect();return {oneLine:Math.abs(title.top-write.top)<10&&Math.abs(write.top-more.top)<10,separated:more.left-write.right>=5,within:more.right<=el.getBoundingClientRect().right}});
    assert.deepEqual(header,{oneLine:true,separated:true,within:true});
    const geometry=await page.evaluate(()=>{
      const box=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,height:r.height}};
      const card=document.querySelector('.community-home-card');
      const head=box(card.querySelector('.section-head'));
      const tabs=box(card.querySelector('#communityTabs'));
      const chips=box(card.querySelector('#communityHomeFilters'));
      const cards=[...card.querySelectorAll('#homeBoardList>.community-ui4-card')].map(box);
      const buttons=[...card.querySelectorAll('#communityTabs button')].map(box);
      const firstChip=box(card.querySelector('#communityHomeFilters button:first-child'));
      const lastChip=box(card.querySelector('#communityHomeFilters button:last-child'));
      return {card:box(card),head,tabs,chips,cards,buttons,firstChip,lastChip,space:getComputedStyle(card).getPropertyValue('--community-space').trim(),scrollWidth:document.documentElement.scrollWidth};
    });
    const same=(a,b)=>Math.abs(a-b)<=1;
    assert.ok([geometry.tabs,geometry.chips,...geometry.cards].every(box=>same(box.left,geometry.head.left)&&same(box.right,geometry.head.right)),JSON.stringify(geometry));
    assert.ok(geometry.buttons.every(box=>same(box.height,geometry.buttons[0].height)),JSON.stringify(geometry));
    assert.ok(same(geometry.firstChip.left,geometry.chips.left)&&same(geometry.lastChip.right,geometry.chips.right),JSON.stringify(geometry));
    assert.ok(same(geometry.tabs.top-geometry.head.bottom,10)&&same(geometry.chips.top-geometry.tabs.bottom,10)&&same(geometry.cards[0].top-geometry.chips.bottom,10),JSON.stringify(geometry));
    assert.ok(same(geometry.cards[1].top-geometry.cards[0].bottom,10),JSON.stringify(geometry));
    assert.ok(geometry.card.right-geometry.head.right>=12&&geometry.head.left-geometry.card.left>=12,JSON.stringify(geometry));
    assert.ok(geometry.scrollWidth<=390,JSON.stringify(geometry));
    const imageCardAlignment=await page.locator('#homeBoardList .community-ui4-card.has-image').evaluateAll(cards=>cards.map(card=>({badge:card.querySelector('.community-ui4-badges').getBoundingClientRect().left,title:card.querySelector('.community-ui4-title').getBoundingClientRect().left})));
    assert.ok(imageCardAlignment.length===2&&imageCardAlignment.every(pair=>same(pair.badge,pair.title)),JSON.stringify(imageCardAlignment));
    for(const width of [425,360]){
      await page.setViewportSize({width,height:844});
      const layout=await page.evaluate(()=>{
        const rect=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {left:r.left,right:r.right}};
        const chips=document.getElementById('communityHomeFilters');
        chips.scrollLeft=chips.scrollWidth;
        return {head:rect('.community-home-card .section-head'),tabs:rect('#communityTabs'),chips:rect('#communityHomeFilters'),list:rect('#homeBoardList'),last:rect('#communityHomeFilters button:last-child'),pageWidth:document.documentElement.scrollWidth,chipScrollWidth:chips.scrollWidth};
      });
      assert.ok([layout.tabs,layout.chips,layout.list].every(box=>same(box.left,layout.head.left)&&same(box.right,layout.head.right)),JSON.stringify(layout));
      assert.ok(layout.last.right<=layout.chips.right+1,JSON.stringify(layout));
      assert.ok(layout.pageWidth<=width,JSON.stringify(layout));
    }
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(async()=>DtmCommunity.renderHome(document.getElementById('homeBoardList'),'job_hiring'));
    assert.equal(await page.locator('#homeBoardList .community-ui4-card').count(),1);
    assert.equal(await page.locator('#communityHomeFilters button.active').innerText(),'구인');
    await page.evaluate(async()=>DtmCommunity.renderHome(document.getElementById('homeBoardList'),'housing'));
    assert.equal(await page.locator('#homeBoardList .community-ui4-card').count(),1);
    await page.evaluate(async()=>DtmCommunity.renderHome(document.getElementById('homeBoardList'),'marketplace'));
    assert.equal(await page.locator('#homeBoardList .community-ui4-marketplace').count(),2);
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
