const {test}=require('node:test'),assert=require('node:assert/strict');
const {currentFlyers,isPublicFlyer}=require('../netlify/functions/smart-flyer-public')._test;
const day='2026-09-15';
const old={id:33,business_id:'zion',status:'active',show_on_home:true,start_date:'2026-09-10',end_date:'2026-09-16',created_at:'2026-09-10',updated_at:'2026-09-20'};
const latest={...old,id:36,status:'draft',start_date:'2026-09-11',end_date:'2026-09-17',created_at:'2026-09-14',market_main_image_url:'https://test/main.jpg'};
test('current explicitly published draft supersedes overlapping older active without deleting either',()=>{
 const rows=[old,latest,{...latest,id:35,business_id:'hmart',status:'active'}];const before=JSON.stringify(rows);
 assert.deepEqual(currentFlyers(rows,day).map(f=>f.id),[36,35]);assert.equal(JSON.stringify(rows),before);
});
test('archive, hidden, expired, future and unselected drafts stay excluded',()=>{
 for(const patch of [{status:'archived'},{show_on_home:false},{end_date:'2026-09-14'},{start_date:'2026-09-16'},{status:'draft',show_on_home:false}]){
  assert.equal(isPublicFlyer({...latest,...patch},day),false);
  assert.deepEqual(currentFlyers([old,{...latest,...patch}],day).map(f=>f.id),[33]);
 }
});
test('newer current flyer does not borrow an older image; image is a tie-break only',()=>{
 const withoutImage={...latest,id:40,created_at:'2026-09-15',market_main_image_url:null};
 assert.equal(currentFlyers([latest,withoutImage],day)[0],withoutImage);
 assert.equal(currentFlyers([{...latest,market_main_image_url:null,id:50},latest],day)[0],latest);
});
test('same-day reuploads choose newest creation independently of API update ordering',()=>{
 const newer={...latest,id:37,created_at:'2026-09-15'};assert.equal(currentFlyers([newer,latest],day)[0],newer);
});
test('Chicago end date is inclusive and unrelated businesses remain',()=>{
 assert.equal(isPublicFlyer({...latest,end_date:day},day),true);
 assert.equal(currentFlyers([latest,{...latest,id:90,business_id:'other'}],day).length,2);
});
