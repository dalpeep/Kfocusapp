const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const items=require('../assets/restaurant-special-items.js');

test('zero and one structured item are supported',()=>{
  assert.deepEqual(items.forSpecial([],1),[]);
  assert.equal(items.forSpecial([{id:1,special_id:7,item_name:'비빔밥'}],7).length,1);
});
test('items sort deterministically and invalid empty names are excluded',()=>{
  const rows=[{id:3,special_id:1,item_name:'냉면',sort_order:2},{id:2,special_id:1,item_name:'',sort_order:0},{id:1,special_id:1,item_name:'갈비탕',sort_order:1}];
  assert.deepEqual(items.forSpecial(rows,1).map(row=>row.item_name),['갈비탕','냉면']);
});
test('card items are bounded to four and expose the remaining count',()=>{
  const rows=Array.from({length:8},(_,i)=>({id:i+1,special_id:3,item_name:`메뉴 ${i+1}`,sort_order:i}));
  assert.deepEqual(items.cardItems(rows,3),{rows:items.forSpecial(rows,3).slice(0,4),total:8,remaining:4});
});
test('items group by special without duplicates or cross-special leakage',()=>{
  const grouped=items.group([{id:1,special_id:1,item_name:'A'},{id:2,special_id:2,item_name:'B'}]);
  assert.equal(grouped.get('1').length,1);assert.equal(grouped.get('2')[0].item_name,'B');
});
test('migration is additive, cascades parent delete and protects anon writes',()=>{
  const sql=fs.readFileSync(path.join(__dirname,'..','supabase','business-special-items-phase1.sql'),'utf8');
  assert.match(sql,/create table if not exists public\.business_special_items/i);
  assert.match(sql,/references public\.business_specials\(id\) on delete cascade/i);
  assert.match(sql,/enable row level security/i);
  assert.match(sql,/grant select on public\.business_special_items to anon/i);
  assert.match(sql,/revoke insert,update,delete on public\.business_special_items from anon/i);
  assert.doesNotMatch(sql,/\b(?:drop table|truncate|delete from|update public\.business_specials|alter table public\.businesses)\b/i);
});
test('public loader batches items and legacy price text remains the fallback',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app-v99.js'),'utf8');
  assert.match(source,/DtmPagination\.fetchPostgrest\(\{url,signal:token\.controller\?\.signal,pageSize:1000/);
  assert.match(source,/row\.price_text\|\|row\.description\|\|'혜택 내용을 확인하세요\.'/);
});
