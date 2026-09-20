const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const authority=require('../assets/discount-business-authority.js');

test('discount authority deduplicates multiple records and sources for one business',()=>{
  const records=[
    {kind:'promotion',businessIds:['a']},{kind:'promotion',businessIds:['a']},
    {kind:'promotion',businessIds:['a','b']},{kind:'event',businessIds:['c']}
  ];
  assert.deepEqual([...authority.activeDiscountBusinessIds(records)],['a','b']);
});
test('event authority uses the same unique-business contract',()=>{
  const records=[{kind:'event',businessIds:['a','a']},{kind:'event',businessIds:['b']},{kind:'promotion',businessIds:['c']}];
  assert.deepEqual([...authority.activeEventBusinessIds(records)],['a','b']);
});
test('main and map consume the canonical authorities without DOM counting',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app-v99.js'),'utf8');
  assert.match(source,/const discountCount=activeDiscountBusinessIds\(\)\.size/);
  assert.match(source,/const postCount=activeEventBusinessIds\(\)\.size/);
  assert.doesNotMatch(source,/querySelectorAll\([^\n]*restaurant-special-card[^\n]*length/);
});
test('market grouping remains separate and unchanged as a callable authority',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app-v99.js'),'utf8');
  assert.match(source,/function v247MarketBusinessGroups\(\)/);
  assert.doesNotMatch(source,/const discountCount=v247MarketBusinessGroups/);
});
test('badges render each active special kind instead of combined 할인 2',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app-v99.js'),'utf8');
  assert.match(source,/kinds\.map\(kind=>`<span class="business-special-badge"/);
  assert.doesNotMatch(source,/kinds\.length>1\?'할인 2'/);
});
test('canonical count ignores the pre-loader mainBanners DOM global',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app-v99.js'),'utf8');
  assert.match(source,/const bannerRows=Array\.isArray\(mainBanners\)\?mainBanners:\[\];/);
  assert.doesNotMatch(source,/\(mainBanners\|\|\[\]\)\.filter\(row=>mapContentActive\(row,now\)\)/);
});
test('Restaurant Specials enter the canonical discount authority while discoverable',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app-v99.js'),'utf8');
  assert.match(source,/DtmRestaurantSpecials\?\.discoverable\?\.\([^)]*businessSpecials/);
  assert.doesNotMatch(source,/DtmRestaurantSpecials\?\.activeRecords\?\.\([^)]*businessSpecials/);
});
test('coupon and discount shortcuts use separate shell modes and routes',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app-v99.js'),'utf8');
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  assert.match(source,/function v245OpenDiscounts\(\)/);
  assert.match(source,/v245Shortcut\('🏷️','할인',discountCount,'v245OpenDiscounts\(\)'\)/);
  assert.match(source,/const renderedPage=page==='discount'\?'coupon':page/);
  assert.match(html,/id="discountModeContent"[^>]*hidden/);
  assert.match(html,/id="couponModeContent"/);
});
test('business cards and detail header consume the same discoverable kind decoration',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app-v99.js'),'utf8');
  assert.match(source,/discoverableKindsForBusiness\(businessSpecials,b\.id,now\)/);
  assert.match(source,/biz-detail-special-badges">\$\{businessSpecialBadgesHTML\(b\)\}/);
});
