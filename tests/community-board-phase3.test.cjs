const test=require('node:test');
const assert=require('node:assert/strict');
const {validateDetails}=require('../netlify/functions/lib/community-details');

const cases={
  job_hiring:{business_name:'가게',occupation:'서버',employment_type:'part_time',pay:'$20',work_area:'Dallas'},
  job_seeking:{occupation:'디자인',experience:'2년',preferred_area:'Plano',employment_type:'contract'},
  marketplace:{listing_type:'sell',item_name:'책상',price:'$50',item_condition:'used',trade_area:'Carrollton'},
  neighborhood:{news_type:'event',event_date:'2026-10-01',venue:'도서관'},
  qna:{post_type:'question',topic:'학교',resolved:false}
};
for(const [category,input] of Object.entries(cases)){
  test(`${category} accepts category details`,()=>assert.deepEqual(validateDetails(category,input),{...input,...(category==='marketplace'?{negotiable:false}:{})}));
  test(`${category} rejects missing required field`,()=>{
    const missing={...input};delete missing[Object.keys(missing)[0]];
    assert.throws(()=>validateDetails(category,missing),{status:400});
  });
}
test('legacy posts with no details remain editable',()=>assert.equal(validateDetails('job_hiring',null,{legacy:true}),null));
test('unknown detail keys are rejected',()=>assert.throws(()=>validateDetails('qna',{...cases.qna,password_hash:'not allowed'}),{status:400}));
test('non-HTTPS external links are rejected',()=>assert.throws(()=>validateDetails('neighborhood',{news_type:'event',external_url:'http://example.com'}),{status:400}));
test('invalid calendar dates are rejected',()=>assert.throws(()=>validateDetails('neighborhood',{news_type:'event',event_date:'2026-02-30'}),{status:400}));
test('housing stores an optional numeric dollar price in details',()=>assert.deepEqual(validateDetails('housing',{price:'250000'}),{price:'250000',price_on_request:false}));
test('housing supports price on request without a number',()=>assert.deepEqual(validateDetails('housing',{price_on_request:true}),{price_on_request:true}));
test('existing housing posts without price stay valid',()=>assert.deepEqual(validateDetails('housing',{}),{price_on_request:false}));
for(const price of ['0','-1','1.5','$250000','undefined'])test(`housing rejects invalid price ${price}`,()=>assert.throws(()=>validateDetails('housing',{price}),{status:400}));
test('housing rejects price and price on request together',()=>assert.throws(()=>validateDetails('housing',{price:'100',price_on_request:true}),{status:400}));
