const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const selection=require('../assets/home-selection.js');

const now=Date.parse('2026-09-11T15:10:53Z');
const day='2026-09-11';
const row=(id,extra={})=>({id,name:id,address:`${id} address`,phone:`555${id}`,region:'dallas',is_active:true,list_visible:true,created_at:new Date(now-3600000).toISOString(),lat:32.9,lng:-96.8,...extra});
const ids=rows=>rows.map(item=>item.id);
const engine=options=>selection.create({now,...options});

test('administrator direct selection preserves configured order and six-item cap',()=>{
  const rows=Array.from({length:8},(_,index)=>row(`b${index}`));
  assert.deepEqual(ids(engine().recommend({business_mode:'direct',business_ids:['b4','b1','b7']},rows,6)),['b4','b1','b7']);
  assert.equal(engine().recommend({business_mode:'direct',business_ids:[]},rows,6).length,0);
});

test('paid businesses lead their assigned automatic section',()=>{
  const rows=[row('free-near',{lat:32.901}),row('paid-rotating',{paid_active:true,is_featured:true}),row('paid-fixed',{paid_active:true,is_featured:true,rotation_enabled:false,featured_rank:1})];
  assert.deepEqual(ids(engine({origin:{lat:32.9,lng:-96.8}}).recommend({business_mode:'featured'},rows,6)).slice(0,2),['paid-fixed','paid-rotating']);
});

test('administrator direct mode remains authoritative when unrelated paid businesses exist',()=>{
  const rows=[row('paid',{paid_active:true,is_featured:true}),row('manual')];
  assert.deepEqual(ids(engine().recommend({business_mode:'direct',business_ids:['manual']},rows,6)),['manual']);
});

test('featured, new, and popular modes consume their canonical groups',()=>{
  const rows=[row('featured-paid',{paid_active:true,is_featured:true}),row('fresh'),row('clicked')];
  const e=engine({clickCounts:new Map([['clicked',9],['fresh',1]])});
  assert.equal(e.recommend({business_mode:'featured'},rows,6)[0].id,'featured-paid');
  assert.ok(ids(e.recommend({business_mode:'new'},rows,6)).includes('fresh'));
  assert.equal(e.recommend({business_mode:'popular'},rows,6)[0].id,'clicked');
});

test('free featured businesses use GPS distance order',()=>{
  const rows=[row('far',{lat:33.5}),row('near',{lat:32.901}),row('middle',{lat:33.0})];
  assert.deepEqual(ids(engine({origin:{lat:32.9,lng:-96.8}}).recommend({business_mode:'featured'},rows,6)),['near','middle','far']);
});

test('free featured businesses use deterministic fallback without GPS',()=>{
  const rows=Array.from({length:12},(_,index)=>row(`b${index}`));
  const first=ids(engine().recommend({business_mode:'featured'},rows,6));
  const second=ids(engine().recommend({business_mode:'featured'},rows,6));
  assert.deepEqual(first,second);
  assert.equal(first.length,6);
});

test('new mode includes ages below 168 hours and excludes the exact boundary',()=>{
  const rows=[row('inside',{created_at:new Date(now-(168*3600000)+1).toISOString()}),row('boundary',{created_at:new Date(now-168*3600000).toISOString()}),row('old',{created_at:new Date(now-169*3600000).toISOString()})];
  assert.deepEqual(ids(engine().recommend({business_mode:'new'},rows,6)),['inside']);
});

test('popular mode follows weekly click counts',()=>{
  const rows=[row('low'),row('high'),row('middle')];
  assert.deepEqual(ids(engine({clickCounts:new Map([['high',20],['middle',5],['low',1]])}).recommend({business_mode:'popular'},rows,6)),['high','middle','low']);
});

test('same business is deduplicated by normalized name and address',()=>{
  const rows=[row('first',{name:'Same',address:'1 Main'}),row('duplicate',{name:' same ',address:'1 main'}),row('other')];
  const result=engine().recommend({business_mode:'featured'},rows,6);
  assert.equal(result.filter(item=>item.name.trim().toLowerCase()==='same').length,1);
});

test('every automatic section and recommendation mode is capped at six',()=>{
  const rows=Array.from({length:20},(_,index)=>row(`b${index}`,{is_featured:true,is_new:true,is_popular:true}));
  const e=engine({clickCounts:new Map(rows.map((item,index)=>[item.id,index]))});
  for(const mode of ['featured','new','popular']) assert.equal(e.recommend({business_mode:mode},rows,6).length,6);
});

test('V200 no longer fetches, selects, observes, or schedules a replacement pool',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app-v99.js'),'utf8');
  const start=source.indexOf('// === V200 compatibility facade');
  const end=source.indexOf('// V241:',start);
  const block=source.slice(start,end);
  assert.ok(block.includes("authority:'DtmHomeSelection'"));
  assert.ok(block.includes('v45RenderAuthoritativeRecommendation'));
  for(const forbidden of ['loadRows','buildPool','MutationObserver','setTimeout','setInterval','fetch(']) assert.equal(block.includes(forbidden),false,forbidden);
});

test('all recommendation DOM installation paths use the shared authoritative renderer',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app-v99.js'),'utf8');
  assert.ok(source.includes('function v45RenderAuthoritativeRecommendation'));
  assert.equal((source.match(/v37RecommendationItems=biz\.map/g)||[]).length,1);
  assert.equal(source.includes('v37RecommendationItems=payload.recommendations'),false);
  assert.equal((source.match(/v45RenderAuthoritativeRecommendation\(v45HomeConfig/g)||[]).length,3);
});
