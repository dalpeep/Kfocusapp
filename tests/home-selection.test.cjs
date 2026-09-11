const {test}=require('node:test');
const assert=require('node:assert/strict');
const shared=require('../assets/home-selection.js');
const legacy=require('./fixtures/home-selection-v312.cjs');
const now=Date.parse('2026-09-11T15:10:53Z'),day='2026-09-11';
const ids=g=>Object.fromEntries(['featured','new','popular'].map(k=>[k,Array.from(g[k],b=>b.id)]));
const row=(id,extra={})=>({id,name:id,address:id,region:'dallas',is_active:true,list_visible:true,created_at:new Date(now-3600000).toISOString(),lat:32.9,lng:-96.8,...extra});
function parity(rows,options={}){
  options={now,...options};
  const actual=shared.create(options).select(day,rows,6);
  assert.deepEqual(ids(actual),ids(legacy(options).select(day,rows,6)));
  return actual;
}
test('unchanged production selection for no GPS / GPS / click ties / mixed paid pools',()=>{
  for(let seed=0;seed<30;seed++){
    const rows=Array.from({length:40},(_,i)=>row(`b${i}`,{lat:32.7+i*.01,lng:-96.8,paid_active:i%7===0,is_new:i%3===0,is_featured:i%3===1,is_popular:i%3===2,rotation_enabled:i%2===0,paid_weight:1+i%4,new_rank:i,created_at:new Date(now-((i+seed)%12)*86400000).toISOString(),paid_end_at:i%11===0?'2026-09-10':null}));
    const clickCounts=new Map(rows.map((b,i)=>[b.id,(i+seed)%5]));
    parity(rows,{clickCounts});parity(rows,{origin:{lat:32.91,lng:-96.79},clickCounts});
  }
});
test('new: old paid fixed + old paid rotating first; free 168-hour boundary strict; no old free filler',()=>{
  const old=new Date(now-30*86400000).toISOString();
  const rows=[row('paid-fixed',{paid_active:true,is_new:true,rotation_enabled:false,created_at:old}),row('paid-rotating',{paid_active:true,is_new:true,created_at:old}),row('fresh'),row('boundary',{created_at:new Date(now-168*3600000).toISOString()}),row('legacy-free-fixed',{is_new:true,rotation_enabled:false,created_at:old}),row('future',{created_at:new Date(now+1).toISOString()})];
  assert.deepEqual(ids(parity(rows)).new,['paid-fixed','paid-rotating','fresh']);
  assert.deepEqual(ids(parity([row('only'),row('old',{created_at:old})])).new,['only']);
});
test('new: six paid consume all slots; expired/future paid do not bypass free age; group-specific paid',()=>{
  const old=new Date(now-30*86400000).toISOString();
  const rows=Array.from({length:7},(_,i)=>row(`paid${i}`,{paid_active:true,is_new:true,rotation_enabled:false,new_rank:i,created_at:old}));
  rows.push(row('free'),row('expired',{paid_active:true,is_new:true,paid_end_at:'2026-09-10',created_at:old}),row('scheduled',{paid_active:true,is_new:true,paid_start_at:'2026-09-12',created_at:old}));
  assert.deepEqual(ids(parity(rows)).new,rows.slice(0,6).map(b=>b.id));
});
test('popular uses clicks; per-group dedupe preserves cross-group appearances',()=>{
  const rows=[row('a'),row('duplicate',{name:'a',address:'a'}),row('b'),row('hidden',{list_visible:false})];
  const result=parity(rows,{clickCounts:new Map([['b',10],['a',2]])});
  assert.deepEqual(ids(result).popular,['b','a']);
  assert.ok(ids(result).new.includes('b'));
});
test('public load projection excludes inactive/hidden/other region and initial duplicate rows',()=>{
  const rows=[row('a',{name_ko:'업체'}),row('a-copy',{name_ko:'업체',address:'a'}),row('hidden',{list_visible:false}),row('inactive',{is_active:false}),row('other',{region:'colorado'})];
  const prepared=shared.prepareRows(rows,'dallas');
  assert.deepEqual(prepared.map(b=>b.id),['a']);
  assert.equal(prepared[0].name,'업체');
});
test('same snapshot repeats identically and Dallas week starts at local Monday midnight',()=>{
  const engine=shared.create({now});
  assert.equal(engine.day(),day);
  assert.equal(engine.midnight(engine.weekStart(day)),'2026-09-07T05:00:00.000Z');
  const rows=Array.from({length:20},(_,i)=>row(String(i)));
  assert.deepEqual(ids(engine.select(day,rows,6)),ids(engine.select(day,rows,6)));
});
