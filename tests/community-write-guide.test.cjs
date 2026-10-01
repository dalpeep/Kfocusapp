const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');

const root=path.join(__dirname,'..');
const categories={job_hiring:'구인',job_seeking:'구직',marketplace:'사고팔기',housing:'부동산',neighborhood:'동네소식',qna:'질문정보'};

test('six category guides precede new post, preserve form and stay compact at 390px',async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844}});
    await page.setContent('<meta name="robots" content="index,follow"><main class="app-main"></main>');
    await page.addStyleTag({path:path.join(root,'styles.css')});
    await page.addScriptTag({path:path.join(root,'assets/community-contract.js')});
    await page.addScriptTag({path:path.join(root,'assets/community.js')});
    await page.evaluate(()=>globalThis.DtmCommunity.ensureUI());
    const previewDir=path.join(root,'preview','community-write-guide');
    fs.mkdirSync(previewDir,{recursive:true});
    for(const [category,label] of Object.entries(categories)){
      await page.locator('[data-community-write]').first().dispatchEvent('click');
      if(category==='job_hiring')await page.screenshot({path:path.join(previewDir,'initial-390.png')});
      assert.equal(await page.locator('#communityWriteForm').count(),0);
      assert.equal(await page.locator('[data-guide-category]').count(),6);
      assert.equal(await page.locator('[data-guide-start]').isDisabled(),true);
      await page.locator(`[data-guide-category="${category}"]`).click();
      assert.equal(await page.locator('#communityGuideAdvice li').count(),5);
      assert.equal(await page.locator('[data-guide-start]').innerText(),category==='qna'?'질문·정보 글쓰기':`${label} 글쓰기`);
      assert.equal(await page.locator('#communityGuideAdvice .community-guide-notice').count(),1);
      await page.screenshot({path:path.join(previewDir,`${category}-390.png`)});
      await page.locator('[data-guide-start]').click();
      assert.equal(await page.locator('#communityWriteForm [name=category]').inputValue(),category);
      assert.equal(await page.locator('#communityWriteForm [type=submit]').innerText(),'등록하기');
      await page.locator('.community-write-help').click();
      assert.equal(await page.locator('.community-write-help-panel li').count(),5);
      if(category==='job_hiring')await page.screenshot({path:path.join(previewDir,'form-help-390.png')});
      await page.locator('.community-modal-x').click();
    }
  }finally{await browser.close()}
});
