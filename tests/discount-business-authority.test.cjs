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
