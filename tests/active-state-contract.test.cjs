const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const active=require('../assets/active-state.js');

const before='2026-09-29T18:00:00Z';
const during='2026-09-30T18:00:00Z';
const endOfDallasDay='2026-10-01T04:59:59.999Z';
const after='2026-10-01T05:00:00Z';

test('date-only start is inactive before and active on the Dallas start date',()=>{
  const row={start_at:'2026-09-30',end_at:'2026-10-02'};
  assert.equal(active.isActive(row,'coupon',before),false);
  assert.equal(active.isActive(row,'coupon',during),true);
});

test('date-only end includes the full Dallas end date and excludes the next day',()=>{
  const row={start_at:'2026-09-01',end_at:'2026-09-30'};
  assert.equal(active.isActive(row,'benefit',endOfDallasDay),true);
  assert.equal(active.isActive(row,'benefit',after),false);
});

test('timestamp start and end use exact inclusive/exclusive instants',()=>{
  const row={start_at:'2026-09-30T18:00:00Z',end_at:'2026-09-30T19:00:00Z'};
  assert.equal(active.isActive(row,'coupon','2026-09-30T17:59:59.999Z'),false);
  assert.equal(active.isActive(row,'coupon','2026-09-30T18:00:00Z'),true);
  assert.equal(active.isActive(row,'coupon','2026-09-30T18:59:59.999Z'),true);
  assert.equal(active.isActive(row,'coupon','2026-09-30T19:00:00Z'),false);
});

test('DST transition dates remain Dallas calendar dates',()=>{
  const row={start_at:'2026-03-08',end_at:'2026-03-08'};
  assert.equal(active.isActive(row,'coupon','2026-03-09T04:59:59.999Z'),true);
  assert.equal(active.isActive(row,'coupon','2026-03-09T05:00:00Z'),false);
});

test('missing dates keep coupons/benefits active but not undated events',()=>{
  assert.equal(active.isActive({is_active:true},'coupon',during),true);
  assert.equal(active.isActive({is_active:true},'benefit',during),true);
  assert.equal(active.isActive({is_active:true,is_published:true},'event',during),false);
});

test('invalid dates and every explicit inactive state remain inactive',()=>{
  assert.equal(active.isActive({start_at:'2026-02-30'},'coupon',during),false);
  for(const row of [{is_active:false},{isActive:false},{active:false},{enabled:false},{hidden:true},{deleted:true},{status:'draft'},{status:'expired'},{is_published:false}]){
    assert.equal(active.isActive({...row,event_start_at:'2026-09-01',event_end_at:'2026-10-01'},'event',during),false);
  }
});

test('raffle effective end uses raffle_end_at',()=>{
  const row={delivery_mode:'raffle',end_at:'2026-09-01',raffle_end_at:'2026-10-01'};
  assert.equal(active.bounds(row,'coupon').end,'2026-10-01');
  assert.equal(active.isActive(row,'coupon',during),true);
});

test('two coupons for one business are two records but one unique business',()=>{
  const rows=[{id:'c1',business_id:'a'},{id:'c2',business_ids:['a']}];
  assert.equal(active.recordCount(rows,'coupon',during),2);
  assert.equal(active.uniqueBusinessCount(rows,'coupon',during),1);
});

test('multiple businesses remain distinct and expired records are excluded',()=>{
  const rows=[{id:'c1',business_id:'a'},{id:'c2',business_id:'b'},{id:'old',business_id:'c',end_at:'2026-09-01'}];
  assert.equal(active.recordCount(rows,'coupon',during),2);
  assert.deepEqual(active.uniqueBusinessIds(rows,'coupon',during),['a','b']);
});

test('one business may concurrently expose coupon, event and benefit kinds',()=>{
  const coupon=[{business_id:'a'}];
  const event=[{business_id:'a',is_published:true,event_start_at:'2026-09-01',event_end_at:'2026-10-01'}];
  const benefit=[{business_id:'a',start_at:'2026-09-01',end_at:'2026-10-01'}];
  assert.equal(active.hasForBusiness(coupon,'a','coupon',during),true);
  assert.equal(active.hasForBusiness(event,'a','event',during),true);
  assert.equal(active.hasForBusiness(benefit,'a','benefit',during),true);
});

test('region is part of eligibility when a screen supplies region context',()=>{
  assert.equal(active.isActive({region:'colorado'},'coupon',during,{region:'dallas'}),false);
  assert.equal(active.isActive({region:'dallas'},'coupon',during,{region:'dallas'}),true);
});

test('the same fixture yields identical active kinds across every business surface',()=>{
  const fixture={
    coupons:[{id:'c1',business_id:'a'},{id:'c2',business_id:'a',end_at:'2026-09-01'}],
    events:[{id:'e1',business_id:'a',is_published:true,event_start_at:'2026-09-01',event_end_at:'2026-10-01'}],
    benefits:[{id:'b1',business_id:'a',start_at:'2026-09-01',end_at:'2026-10-01'}]
  };
  const kinds=id=>['coupon','event','benefit'].filter(type=>active.hasForBusiness(fixture[type==='coupon'?'coupons':type==='event'?'events':'benefits'],id,type,during));
  const expected=['coupon','event','benefit'];
  for(const surface of ['map','business-card','detail','nearby','coupon-event-benefit-pages','header']){
    assert.deepEqual(kinds('a'),expected,surface);
  }
});

test('public helper adapters reference the authoritative contract',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../app-v99.js'),'utf8');
  for(const name of ['mapContentActive','activeMapCoupons','mapEventActive','activeCoupons','businessHasActiveCoupon','businessHasActiveBanner','v245ActiveCoupons','v246ActivePromoRows']){
    const start=source.indexOf(`function ${name}`),end=source.indexOf('\n}',start);
    assert.notEqual(start,-1,name);
    assert.match(source.slice(start,end+2),/DtmActiveState/,name);
  }
  assert.match(source,/function v245EventPostCount\(\)\{\s*return activePublicEventPosts\(\)\.length;/);
});
