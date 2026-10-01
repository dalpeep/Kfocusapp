const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..');
const image='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#d6e4f2"/></svg>');
const stamp=new Date().toISOString();
const rows=[
  {id:'1',category:'marketplace',title:'테스트 상품',area:'dallas',created_at:stamp,image_url:image,video_provider:'youtube',status:'sold',details:{price:'75',item_condition:'used',trade_area:'Carrollton'}},
  {id:'2',category:'housing',title:'테스트 매물',area:'dallas',created_at:stamp,image_url:image,video_provider:'youtube',details:{price:'250000'}},
  {id:'3',category:'job_hiring',title:'채용 안내',area:'dallas',created_at:stamp,details:{occupation:'바리스타',business_name:'카페',pay:'협의'}},
  {id:'4',category:'job_seeking',title:'구직 안내',area:'dallas',created_at:stamp,details:{occupation:'디자이너',experience:'3년',preferred_area:'Dallas'}},
  {id:'5',category:'neighborhood',title:'동네 행사',area:'dallas',created_at:stamp,body_preview:'함께 만나요',details:{news_type:'event',venue:'공원'}},
  {id:'6',category:'qna',title:'질문합니다',area:'dallas',created_at:stamp,body_preview:'도움 부탁드립니다',comment_count:2,details:{post_type:'question',resolved:true}},
  {id:'7',category:'housing',title:'기존 가격 없는 매물',area:'dallas',created_at:stamp,details:{}}
].map(row=>({...row,total_count:7}));

test('six mixed cards and sectional form render at 390px and desktop without horizontal overflow',async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    for(const width of [390,1280]){
      const page=await browser.newPage({viewport:{width,height:844}});
      await page.setContent('<html><head><meta name="robots" content="index,follow"></head><body><button class="life-category-chip">생활</button><main></main></body></html>');
      await page.addStyleTag({path:path.join(root,'styles.css')});
      await page.evaluate(data=>{
        window.APP_CONFIG={APP_REGION:'dallas',SUPABASE_URL:'https://example.invalid',SUPABASE_ANON_KEY:'test'};
        window.fetch=async()=>({ok:true,json:async()=>data});
      },rows);
      await page.addScriptTag({path:path.join(root,'assets/community-contract.js')});
      await page.addScriptTag({path:path.join(root,'assets/community.js')});
      await page.evaluate(async()=>{await DtmCommunity.load();document.getElementById('page-community').classList.add('active')});
      assert.equal(await page.locator('.community-ui4-card').count(),7);
      assert.deepEqual(await page.locator('#communityCategoryFilters button').allTextContents(),['전체','구인','구직','사고팔기','부동산','동네소식','질문정보']);
      assert.equal(await page.locator('.community-ui41-head .section-title').innerText(),'커뮤니티');
      assert.equal(await page.locator('.community-page-head p').count(),0);
      const chipDesign=await page.evaluate(()=>{
        const existing=getComputedStyle(document.querySelector('.life-category-chip'));
        const board=getComputedStyle(document.querySelector('#communityCategoryFilters button:nth-child(2)'));
        const strip=getComputedStyle(document.querySelector('#communityCategoryFilters'));
        return {match:['borderRadius','fontSize','paddingLeft','paddingRight','borderTopColor'].every(key=>existing[key]===board[key]),hiddenScrollbar:strip.scrollbarWidth==='none',swipeable:strip.overflowX==='auto'};
      });
      assert.deepEqual(chipDesign,{match:true,hiddenScrollbar:true,swipeable:true});
      if(width===390)assert.ok(await page.locator('.community-ui4-card').first().evaluate(el=>el.getBoundingClientRect().top)<260);
      for(const category of ['marketplace','housing','job_hiring','job_seeking','neighborhood','qna'])
        assert.ok(await page.locator('.community-ui4-'+category).count()>=1);
      assert.equal(await page.locator('.community-ui4-card iframe,.community-ui4-card video').count(),0);
      assert.equal(await page.locator('.community-ui4-housing').first().locator('.community-ui4-price').innerText(),'$250,000');
      assert.equal(await page.locator('[data-community-post="7"] .community-ui4-price').count(),0);
      assert.equal(await page.locator('.community-ui4-marketplace .community-ui4-price').innerText(),'$75');
      assert.equal(await page.locator('.community-ui4-qna').innerText().then(x=>x.includes('✓ 해결됨')),true);
      assert.equal(await page.locator('.community-ui4-marketplace').innerText().then(x=>x.includes('판매완료')),true);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
      await page.locator('[data-community-write]').first().click();
      assert.equal(await page.locator('#communityWriteForm').count(),1);
      assert.equal(await page.locator('[data-guide-category]').count(),0);
      for(const label of ['기본 정보','상세 정보','사진·영상','연락 및 관리'])
        assert.equal(await page.locator('.community-ui4-form-section legend').allTextContents().then(x=>x.includes(label)),true);
      assert.deepEqual(await page.locator('.community-ui4-form-section legend').allTextContents(),['기본 정보','상세 정보','사진·영상','연락 및 관리']);
      await page.locator('#communityWriteForm [name="category"]').selectOption('marketplace');
      assert.equal(await page.locator('#communityWriteForm [name="video_url"]').isEnabled(),true);
      await page.locator('#communityWriteForm [name="category"]').selectOption('job_hiring');
      assert.equal(await page.locator('#communityWriteForm [name="video_url"]').isEnabled(),false);
      assert.equal(await page.locator('#communityWriteForm [data-detail-key="occupation"]').count(),1);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
      await page.close();
    }
  }finally{await browser.close()}
});
