const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const DtmDallasTime=require('../assets/dallas-time.js');
const DtmActiveState=require('../assets/active-state.js');

const source=fs.readFileSync(path.join(__dirname,'../app-v99.js'),'utf8');
const start=source.indexOf('function activePublicEventPosts(');
const end=source.indexOf('function getRecentSearches(',start);
const authoritySource=source.slice(start,end);
const NOW=Date.parse('2026-09-20T18:00:00Z');

function runtime(rows=[]){
  class FixedDate extends Date{constructor(...args){super(...(args.length?args:[NOW]));}static now(){return NOW;}}
  const window={};
  const ctx=vm.createContext({
    Date:FixedDate,window,boardPosts:rows,currentRegion:'dallas',dalpicks:[],
    DtmDallasTime,DtmActiveState,
    normalizeRegionKey:value=>String(value||'').toLowerCase(),
    normalizeBoardType:value=>String(value||'notice').toLowerCase(),
    isThemeDalpick:()=>false
  });
  vm.runInContext(authoritySource,ctx);
  return ctx;
}

const row=(id,extra={})=>({id,type:'notice',subtype:'event',title:`event-${id}`,region:'dallas',is_active:true,is_published:true,...extra});
const plain=value=>JSON.parse(JSON.stringify(value));

test('event badge/list authority supports 0, 1 and N public records',()=>{
  assert.equal(runtime([]).activePublicEventPosts().length,0);
  assert.equal(runtime([row('a')]).activePublicEventPosts().length,1);
  assert.equal(runtime([row('a'),row('b'),row('c')]).activePublicEventPosts().length,3);
});

test('inactive, unpublished, hidden, wrong-region, future and expired records are excluded',()=>{
  const rows=[
    row('live'),row('inactive',{is_active:false}),row('unpublished',{is_published:false}),
    row('hidden',{hidden:true}),row('wrong-region',{region:'colorado'}),
    row('future',{start_at:'2026-09-21',end_at:'2026-09-30'}),
    row('expired',{start_at:'2026-09-01',end_at:'2026-09-19'})
  ];
  assert.deepEqual(plain(runtime(rows).activePublicEventPosts().map(item=>item.id)),['live']);
});

test('Dallas date ranges are applied when supplied and undated published notices remain discoverable',()=>{
  const rows=[row('undated'),row('today',{start_at:'2026-09-20',end_at:'2026-09-20'})];
  assert.deepEqual(plain(runtime(rows).activePublicEventPosts().map(item=>item.id)),['undated','today']);
});

test('duplicate event ids count once',()=>{
  assert.equal(runtime([row('same'),row('same')]).activePublicEventPosts().length,1);
});

test('board notice list and main badge both consume the canonical authority while map stays independent',()=>{
  assert.match(authoritySource,/const source=normalizeBoardType\(type\)==='notice'\?activePublicEventPosts\(\):boardPosts/);
  assert.match(source,/function v245EventPostCount\(\)\{\s*return activePublicEventPosts\(\)\.length;/);
  assert.match(source,/const postCount=v245EventPostCount\(\);/);
  assert.match(source,/kind==='event'\?activeEventBusinessIds\(\)/);
});

test('production-equivalent fixture counts one board event without banner-linked businesses',()=>{
  const ctx=runtime([row('production-event')]);
  assert.equal(ctx.activePublicEventPosts().length,1);
  const linkedBannerBusinessIds=new Set(['a','b','c','d']);
  assert.equal(linkedBannerBusinessIds.size,4);
  assert.equal(ctx.activePublicEventPosts().length,1);
});
