const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const source=fs.readFileSync(path.join(__dirname,'..','app-v99.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

test('badge-position build has an explicit runtime marker and asset version',()=>{
  assert.match(source,/__DTM_BADGE_POSITION_BUILD__='badge-position-v4-20260920'/);
  assert.match(html,/app-v99\.js\?v=269\.7-community-deep-link/);
});

test('special badges keep the canonical active-kind authority',()=>{
  assert.match(source,/discoverableKindsForBusiness\(businessSpecials,b\.id,now\)/);
  assert.match(source,/kinds\.map\(kind=>`<span class="business-special-badge"/);
  assert.doesNotMatch(source,/kinds\.length>1\?'할인 2'/);
});

test('common business title row renders name and every special kind together',()=>{
  assert.match(source,/function businessTitleRowHTML\(b,name='',options=\{\}\)/);
  assert.match(source,/class="business-title-specials">\$\{specials\}/);
  assert.match(source,/const nameClass=\['business-title-name'/);
});

test('home recommendation, new and popular cards use the title-row presentation',()=>{
  assert.match(source,/function homeBusinessItemHTML\(b\)[\s\S]*businessTitleRowHTML\(b,b\.name \|\| '이름 없음'/);
  assert.match(source,/home-biz-map-title-line[\s\S]*businessTitleRowHTML[\s\S]*home-biz-map-cat/);
  assert.match(source,/home-biz-map-meta-line[\s\S]*home-biz-map-location[\s\S]*home-biz-map-rating/);
  assert.match(source,/featured\.map\(homeBusinessItemHTML\)/);
  assert.match(source,/newList\.map\(homeBusinessItemHTML\)/);
  assert.match(source,/popularList\.map\(homeBusinessItemHTML\)/);
});

test('list, mini and search results use the common title row',()=>{
  assert.match(source,/function listCardHTML\(b\)[\s\S]*businessTitleRowHTML\(b,b\.name/);
  assert.match(source,/function miniCardHTML\(b\)[\s\S]*businessTitleRowHTML\(b,b\.name/);
  assert.match(source,/searchBusinessList\.innerHTML[\s\S]*businessTitleRowHTML\(b,b\.name/);
});

test('nearby, map list and map preview use the common title row',()=>{
  assert.match(source,/function nearbyBusinessItemHTML\(b\)[\s\S]*businessTitleRowHTML\(b,bizName/);
  assert.match(source,/function mapBottomItemHTML\(b\)[\s\S]*businessTitleRowHTML\(b,b\.name/);
  assert.match(source,/function mapBusinessPreviewHTML\(b\)[\s\S]*businessTitleRowHTML\(b,b\.name/);
});

test('category and non-special promotional badges remain intact',()=>{
  assert.match(source,/home-biz-map-cat/);
  assert.match(source,/getBusinessDisplayCategory\(b\)/);
  assert.match(source,/home-business-coupon-badge/);
  assert.match(source,/home-business-banner-badge/);
});

test('special badge and mobile overflow styles follow the title-row contract',()=>{
  assert.match(source,/\.business-special-badge\{[^}]*padding:5px 8px[^}]*font-size:11px[^}]*min-height:22px/);
  assert.match(source,/\.business-title-row\{[^}]*display:flex[^}]*align-items:center[^}]*min-width:0[^}]*max-width:100%/);
  assert.match(source,/\.business-title-name\{[^}]*flex:1 1 auto[^}]*overflow:hidden[^}]*text-overflow:ellipsis[^}]*white-space:nowrap/);
  assert.match(source,/\.business-title-specials \.business-special-badge\{flex:0 0 auto\}/);
  assert.match(source,/\.business-title-specials\{[^}]*flex:0 0 auto[^}]*white-space:nowrap/);
  assert.match(source,/@media\(max-width:640px\)[\s\S]*\.business-title-specials\{[^}]*flex-wrap:nowrap/);
});

test('special badges are no longer emitted in image overlays or side stacks',()=>{
  const home=source.match(/function homeBusinessItemHTML\(b\)\{[\s\S]*?\n\}/)?.[0]||'';
  const nearby=source.match(/function nearbyBusinessItemHTML\(b\)\{[\s\S]*?\n\}/)?.[0]||'';
  const stack=source.match(/function badgeStackHTML\(b, compact=true\)\{[\s\S]*?\n\}/)?.[0]||'';
  assert.doesNotMatch(home,/promoBadges = \[[\s\S]*businessSpecialBadgeHTML/);
  assert.doesNotMatch(nearby,/promoBadges = \[[\s\S]*businessSpecialBadgeHTML/);
  assert.doesNotMatch(stack,/businessSpecialBadgeHTML/);
});
