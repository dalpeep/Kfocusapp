const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');

const root=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(root,'app-v99.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const start=app.indexOf('function renderHomeBoardSection(type=');
const end=app.indexOf('const GUIDE_SUBTYPE_KEY',start);
const renderSource=app.slice(start,end);

test('home write CTA is detached outside Dallas Life and reinserted before full view',async()=>{
  assert.ok(start>=0&&end>start);
  assert.match(html,/app-v99\.js\?v=269\.14-community-ui46-write-cta/);
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844}});
    await page.setContent('<main><section class="community-home-card"><div class="section-head"><h3>커뮤니티</h3><div class="community-home-actions"><button class="community-home-write" data-community-write>＋ 글쓰기</button><button class="community-full-btn">전체보기</button></div></div><div id="communityTabs"><button class="community-tab" data-board="notice">행사안내</button><button class="community-tab" data-board="life">달라스 라이프</button><button class="community-tab" data-board="business_story">업소탐방</button></div><div id="communityHomeFilters"></div><div id="homeBoardList"></div></section></main>');
    const states=await page.evaluate(source=>{
      let selectedBoardType='life';
      const selectedHomeCommunityCategory='all';
      const homeBoardList=document.getElementById('homeBoardList');
      const homeCommunityWrite=document.querySelector('.community-home-write');
      const homeCommunityActions=document.querySelector('.community-home-actions');
      const $=selector=>document.querySelector(selector);
      const $$=selector=>[...document.querySelectorAll(selector)];
      const boardPostsByType=()=>[{id:'legacy'}];
      const boardListItemHTML=()=>'<article>기존 콘텐츠</article>';
      const boardLabel=type=>type;
      globalThis.DtmCommunity={renderHome:()=>{homeBoardList.innerHTML='<article>게시판 미리보기</article>'}};
      eval(source);
      const snapshot=()=>({writeCount:document.querySelectorAll('.community-home-write').length,actions:[...homeCommunityActions.children].map(el=>el.textContent.trim()),active:document.querySelector('#communityTabs .active')?.dataset.board,filtersHidden:document.getElementById('communityHomeFilters').classList.contains('hidden'),content:homeBoardList.textContent});
      renderHomeBoardSection('life');const life=snapshot();
      renderHomeBoardSection('notice');const notice=snapshot();
      renderHomeBoardSection('life');const lifeAgain=snapshot();
      renderHomeBoardSection('business_story');const businessStory=snapshot();
      renderHomeBoardSection('life');const lifeAfterBusiness=snapshot();
      return {life,notice,lifeAgain,businessStory,lifeAfterBusiness};
    },renderSource);
    assert.deepEqual(states.life.actions,['＋ 글쓰기','전체보기']);
    assert.equal(states.life.writeCount,1);
    assert.equal(states.life.active,'life');
    assert.equal(states.life.filtersHidden,false);
    for(const [state,name] of [[states.notice,'notice'],[states.businessStory,'business_story']]){
      assert.equal(state.writeCount,0,name);
      assert.deepEqual(state.actions,['전체보기'],name);
      assert.equal(state.active,name);
      assert.equal(state.filtersHidden,true);
      assert.equal(state.content,'기존 콘텐츠');
    }
    for(const state of [states.lifeAgain,states.lifeAfterBusiness]){
      assert.equal(state.writeCount,1);
      assert.deepEqual(state.actions,['＋ 글쓰기','전체보기']);
      assert.equal(state.filtersHidden,false);
      assert.equal(state.content,'게시판 미리보기');
    }
  }finally{await browser.close()}
});
