const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require('playwright');

const root=path.join(__dirname,'..');
const categories={job_hiring:'구인',job_seeking:'구직',marketplace:'사고팔기',housing:'부동산',neighborhood:'동네소식',qna:'질문정보'};

test('writing opens the existing form directly with a compact inline category guide at 390px',async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844}});
    await page.setContent('<meta name="robots" content="index,follow"><main class="app-main"></main>');
    await page.addStyleTag({path:path.join(root,'styles.css')});
    await page.addScriptTag({path:path.join(root,'assets/community-contract.js')});
    await page.addScriptTag({path:path.join(root,'assets/community.js')});
    await page.evaluate(()=>globalThis.DtmCommunity.ensureUI());
    await page.locator('#page-community [data-community-write]').first().dispatchEvent('click');
    assert.equal(await page.locator('#communityWriteForm').count(),1);
    assert.equal(await page.locator('.community-write-inline-guide').count(),1);
    assert.equal(await page.locator('[data-guide-category],.community-write-help,[data-guide-return]').count(),0);
    for(const [category,label] of Object.entries(categories)){
      await page.locator('#communityWriteForm [name=category]').selectOption(category);
      assert.equal(await page.locator('.community-write-inline-guide h3').innerText(),category==='qna'?'질문·정보 글쓰기 안내':`${label} 글쓰기 안내`);
      assert.equal(await page.locator('.community-write-inline-guide li').count(),5);
      assert.equal(await page.locator('.community-write-inline-guide .community-guide-badge').innerText(),label);
    }
    await page.locator('#communityWriteForm [name=category]').selectOption('marketplace');
    assert.match(await page.locator('.community-guide-notice').innerText(),/30일 동안 게시됩니다.*30일 연장/);
    await page.locator('#communityWriteForm [name=category]').selectOption('housing');
    assert.match(await page.locator('.community-guide-notice').innerText(),/90일 동안 게시됩니다.*90일 연장/);
    assert.doesNotMatch(await page.locator('.community-guide-notice').innerText(),/관리자 확인 후 공개/);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }finally{await browser.close()}
});

test('selected board chip starts the matching form and changing category updates only the guide',async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844}});
    await page.setContent('<meta name="robots" content="index,follow"><main class="app-main"></main>');
    await page.addStyleTag({path:path.join(root,'styles.css')});
    await page.addScriptTag({path:path.join(root,'assets/community-contract.js')});
    await page.addScriptTag({path:path.join(root,'assets/community.js')});
    await page.evaluate(()=>globalThis.DtmCommunity.ensureUI());
    await page.locator('[data-community-category="marketplace"]').dispatchEvent('click');
    await page.locator('#page-community [data-community-write]').first().dispatchEvent('click');
    assert.equal(await page.locator('#communityWriteForm [name=category]').inputValue(),'marketplace');
    await page.locator('#communityWriteForm [name=title]').fill('미제출 테스트');
    await page.locator('#communityWriteForm [name=category]').selectOption('housing');
    assert.equal(await page.locator('.community-write-inline-guide h3').innerText(),'부동산 글쓰기 안내');
    assert.equal(await page.locator('#communityWriteForm [name=title]').inputValue(),'미제출 테스트');
  }finally{await browser.close()}
});
