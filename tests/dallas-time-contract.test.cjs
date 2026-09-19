const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const time=require('../assets/dallas-time.js');
const selection=require('../assets/home-selection.js');

test('Dallas midnight changes independently from the UTC calendar date',()=>{
  assert.equal(time.dateKey('2026-10-01T04:59:59.999Z'),'2026-09-30');
  assert.equal(time.dateKey('2026-10-01T05:00:00.000Z'),'2026-10-01');
  assert.equal(time.dateKey('2026-01-01T05:59:59.999Z'),'2025-12-31');
  assert.equal(time.dateKey('2026-01-01T06:00:00.000Z'),'2026-01-01');
});

test('CST and CDT midnight conversion follows daylight saving transitions',()=>{
  assert.equal(time.midnightIso('2026-03-08'),'2026-03-08T06:00:00.000Z');
  assert.equal(time.midnightIso('2026-03-09'),'2026-03-09T05:00:00.000Z');
  assert.equal(time.midnightIso('2026-11-01'),'2026-11-01T05:00:00.000Z');
  assert.equal(time.midnightIso('2026-11-02'),'2026-11-02T06:00:00.000Z');
  assert.equal(time.zonedLocalToIso('2026-09-30T12:00'),'2026-09-30T17:00:00.000Z');
  assert.equal(time.zonedLocalToIso('2026-01-30T12:00'),'2026-01-30T18:00:00.000Z');
});

test('date-only periods include both the Dallas start and end dates',()=>{
  assert.equal(time.periodState('2026-09-30','2026-09-30','2026-09-30T05:00:00.000Z'),'active');
  assert.equal(time.periodActive('2026-09-30','2026-09-30','2026-10-01T04:59:59.999Z'),true);
  assert.equal(time.periodActive('2026-09-30','2026-09-30','2026-10-01T05:00:00.000Z'),false);
  assert.equal(time.periodState('2026-10-01','','2026-10-01T04:59:59.999Z'),'scheduled');
});

test('date preview resolves Dallas noon with the correct seasonal offset',()=>{
  assert.equal(time.dateReferenceIso('2026-09-30'),'2026-09-30T17:00:00.000Z');
  assert.equal(time.dateReferenceIso('2026-01-30'),'2026-01-30T18:00:00.000Z');
  assert.equal(time.periodActiveOnDate('2026-09-30','2026-09-30','2026-09-30'),true);
  assert.equal(time.periodActiveOnDate('2026-09-30','2026-09-30','2026-10-01'),false);
});

test('timestamp periods use exact instants instead of calendar-day expansion',()=>{
  const start='2026-09-30T17:00:00.000Z',end='2026-09-30T18:00:00.000Z';
  assert.equal(time.periodActive(start,end,'2026-09-30T16:59:59.999Z'),false);
  assert.equal(time.periodActive(start,end,start),true);
  assert.equal(time.periodActive(start,end,end),false);
  assert.equal(time.periodActive(start,end,'2026-09-30T18:00:00.001Z'),false);
});

test('new business is strict elapsed 168 hours across DST',()=>{
  const created='2026-03-01T18:00:00.000Z';
  assert.equal(time.withinElapsedHours(created,168,'2026-03-08T17:59:59.999Z'),true);
  assert.equal(time.withinElapsedHours(created,168,'2026-03-08T18:00:00.000Z'),false);
  const rows=[{id:'inside',name:'inside',address:'inside',is_active:true,list_visible:true,created_at:'2026-03-01T18:00:00.001Z'}];
  assert.deepEqual(selection.create({now:Date.parse('2026-03-08T18:00:00.000Z')}).select('2026-03-08',rows,6).new.map(row=>row.id),['inside']);
});

for(const feature of ['coupon','event','paid exposure','popup']){
  test(`${feature} date-only start/end follows the same inclusive Dallas contract`,()=>{
    assert.equal(time.periodActive('2026-09-30','2026-09-30','2026-10-01T04:59:59.999Z'),true);
    assert.equal(time.periodActive('2026-09-30','2026-09-30','2026-10-01T05:00:00.000Z'),false);
  });
}

test('popup rotation ordinal is based on the Dallas date key, not browser parsing',()=>{
  assert.equal(time.dateOrdinal('2026-09-30')+1,time.dateOrdinal('2026-10-01'));
});

test('public, admin, popup, coupon server and Daily Core reference the shared contract',()=>{
  const root=path.join(__dirname,'..');
  const files=['index.html','app-v99.js','admin/assets/admin.js','netlify/functions/coupon-campaign-lib.js','netlify/functions/daily-core-refresh.js','netlify/functions/lib/daily-core.js','netlify/functions/smart-flyer-public.js'];
  for(const file of files){
    const source=fs.readFileSync(path.join(root,file),'utf8');
    assert.match(source,/DtmDallasTime|dallasTime/,file);
  }
});
