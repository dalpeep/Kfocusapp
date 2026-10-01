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
      assert.equal(await page.locator('.community-write-resume-guide li').count(),5);
      assert.equal(await page.locator('[data-guide-category]').count(),0);
      assert.equal(await page.locator('[data-guide-return]').innerText(),'작성 화면으로 돌아가기');
      assert.equal(await page.locator('#communityWriteForm').isVisible(),false);
      if(category==='job_hiring')await page.screenshot({path:path.join(previewDir,'form-help-390.png')});
      await page.locator('[data-guide-return]').click();
      assert.equal(await page.locator('#communityWriteForm').isVisible(),true);
      await page.locator('.community-modal-x').click();
    }
  }finally{await browser.close()}
});

for(const [category,label] of [['marketplace','사고팔기'],['housing','부동산']]){
  test(`${label} in-form guide returns to the identical form with text, price and MP4 selection`,async()=>{
    const browser=await chromium.launch({channel:'msedge',headless:true});
    try{
      const page=await browser.newPage({viewport:{width:390,height:844}});
      await page.setContent('<meta name="robots" content="index,follow"><main class="app-main"></main>');
      await page.addStyleTag({path:path.join(root,'styles.css')});
      await page.addScriptTag({path:path.join(root,'assets/community-contract.js')});
      await page.addScriptTag({path:path.join(root,'assets/community.js')});
      await page.evaluate(()=>globalThis.DtmCommunity.ensureUI());
      await page.locator('[data-community-write]').first().dispatchEvent('click');
      await page.locator(`[data-guide-category="${category}"]`).click();
      await page.locator('[data-guide-start]').click();
      await page.locator('#communityWriteForm [name=title]').fill(`${label} 테스트 제목`);
      await page.locator('#communityWriteForm [name=body]').fill(`${label} 테스트 내용`);
      await page.locator('#communityWriteForm [data-detail-key=price]').fill('123');
      // Simulate the production-gated MP4 field without fetching runtime config.
      await page.evaluate(()=>{const form=document.querySelector('#communityWriteForm');if(!form.elements.video_file){const field=document.createElement('input');field.type='file';field.name='video_file';field.accept='video/mp4,.mp4';form.append(field)}});
      await page.locator('#communityWriteForm [name=video_file]').setInputFiles({name:'test.mp4',mimeType:'video/mp4',buffer:Buffer.from('synthetic')});
      await page.evaluate(()=>{globalThis.__guideFormReference=document.querySelector('#communityWriteForm')});
      await page.locator('.community-write-help').click();
      assert.equal(await page.locator('.community-write-resume-guide h3').innerText(),`${label} 글쓰기 안내`);
      assert.equal(await page.locator('[data-guide-category]').count(),0);
      await page.locator('[data-guide-return]').click();
      assert.equal(await page.evaluate(()=>document.querySelector('#communityWriteForm')===globalThis.__guideFormReference),true);
      assert.equal(await page.locator('#communityWriteForm [name=title]').inputValue(),`${label} 테스트 제목`);
      assert.equal(await page.locator('#communityWriteForm [name=body]').inputValue(),`${label} 테스트 내용`);
      assert.equal(await page.locator('#communityWriteForm [data-detail-key=price]').inputValue(),'123');
      assert.equal(await page.locator('#communityWriteForm [name=video_file]').evaluate(input=>input.files[0]?.name),'test.mp4');
    }finally{await browser.close()}
  });
}
