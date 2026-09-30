const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const S=require('../netlify/functions/lib/community-security');
const {reviewPost}=require('../netlify/functions/lib/community-review');

const details={
  job_hiring:{business_name:'Test Shop',occupation:'Server',employment_type:'part_time',pay:'협의',work_area:'Dallas'},
  job_seeking:{occupation:'Designer',experience:'2 years',preferred_area:'Plano',employment_type:'contract'},
  marketplace:{listing_type:'sell',item_name:'Desk',price:'$50',item_condition:'used',trade_area:'Carrollton'},
  neighborhood:{news_type:'local'},
  qna:{post_type:'question',topic:'School'}
};
const body=(category,extra={})=>({category,region:'dallas',area:'dallas',title:'Local test post',body:'A normal community post about Dallas.',author_name:'Test Author',password:'test-only-password',details:details[category],turnstile_token:'test-token',...extra});

for(const category of Object.keys(details))test(`${category}: clean content is approved`,()=>{
  assert.deepEqual(reviewPost(body(category),details[category]),{status:'approved',reason:null});
});
test('housing remains on its existing review policy',()=>{
  assert.equal(reviewPost({category:'housing',title:'Rental',body:'Local apartment',author_name:'Test'},{}).status,'pending');
});
for(const sample of [
  {body:'Visit https://unknown.example for details.'},
  {body:'수익 보장 사업 홍보'},
  {body:'씨발 욕설'},
  {body:'AAAAAAAAAAAAAAAA'},
  {body:'Social security number 123-45-6789'}
])test('review signal keeps the post pending',()=>{
  assert.equal(reviewPost({...body('qna'),...sample},details.qna).status,'pending');
});
test('unstructured neighborhood event URL requires review; canonical video field is preserved',()=>{
  assert.equal(reviewPost(body('neighborhood'),{...details.neighborhood,external_url:'https://example.com/event'}).status,'pending');
  assert.equal(reviewPost({...body('marketplace'),video_url:'https://www.youtube.com/watch?v=abcdefghijk'},details.marketplace).status,'approved');
});

function dbFor(rows){
  let next=0;
  return{from(table){
    return{
      insert(payload){return{
        select(){return{async single(){
          const row={id:`00000000-0000-4000-8000-${String(++next).padStart(12,'0')}`,...payload};
          if(table==='community_posts')rows.push(row);
          return{data:{id:row.id},error:null};
        }}},
        then(resolve){return Promise.resolve({data:payload,error:null}).then(resolve)}
      }},
      update(patch){const filters=[];return{
        eq(key,value){filters.push(row=>row[key]===value);return this},
        in(){return Promise.resolve({error:null})},
        async select(){const selected=rows.filter(row=>filters.every(filter=>filter(row)));
          selected.forEach(row=>Object.assign(row,patch));
          return{data:selected.map(row=>({id:row.id})),error:null}}
      }},
      delete(){return{eq:async()=>({error:null})}}
    }
  }};
}

test('create handler publishes all five categories and returns the matching message',async()=>{
  const rows=[],db=dbFor(rows),original={client:S.client,verifyTurnstile:S.verifyTurnstile,rateLimit:S.rateLimit,hashPassword:S.hashPassword};
  S.client=()=>db;S.verifyTurnstile=async()=>{};S.rateLimit=async()=>{};S.hashPassword=()=> 'test-hash';
  try{
    const {handler}=require('../netlify/functions/community-post-create');
    for(const category of Object.keys(details)){
      const response=await handler({httpMethod:'POST',body:JSON.stringify(body(category)),headers:{}});
      assert.equal(response.statusCode,201,response.body);
      const result=JSON.parse(response.body);
      assert.equal(result.status,'approved');assert.equal(result.message,'게시글이 등록되었습니다.');
    }
    assert.equal(rows.length,5);assert.ok(rows.every(row=>row.status==='approved'&&row.approved_at));
    assert.ok(rows.every(row=>row.password_hash==='test-hash'));
  }finally{Object.assign(S,original)}
});

test('review stays pending and failed Turnstile/rate limit cannot create rows',async()=>{
  const rows=[],db=dbFor(rows),original={client:S.client,verifyTurnstile:S.verifyTurnstile,rateLimit:S.rateLimit,hashPassword:S.hashPassword};
  S.client=()=>db;S.verifyTurnstile=async()=>{};S.rateLimit=async()=>{};S.hashPassword=()=> 'test-hash';
  try{
    const {handler}=require('../netlify/functions/community-post-create');
    const request=extra=>({httpMethod:'POST',body:JSON.stringify(body('qna',extra)),headers:{}});
    const pending=await handler(request({body:'Visit https://example.com'}));
    assert.equal(pending.statusCode,201);assert.equal(JSON.parse(pending.body).status,'pending');
    assert.equal(rows[0].status,'pending');
    S.verifyTurnstile=async()=>{throw Object.assign(new Error('Turnstile failed'),{status:403})};
    assert.equal((await handler(request())).statusCode,403);assert.equal(rows.length,1);
    S.verifyTurnstile=async()=>{};S.rateLimit=async()=>{throw Object.assign(new Error('Rate limit'),{status:429})};
    assert.equal((await handler(request())).statusCode,429);assert.equal(rows.length,1);
  }finally{Object.assign(S,original)}
});

test('image-backed post becomes public only after verified image linking',async()=>{
  const rows=[],db=dbFor(rows);
  const original={client:S.client,verifyTurnstile:S.verifyTurnstile,rateLimit:S.rateLimit,hashPassword:S.hashPassword,verifiedUploadDrafts:S.verifiedUploadDrafts,env:S.env};
  S.client=()=>db;S.verifyTurnstile=async()=>{throw new Error('Token must not be verified twice')};
  S.rateLimit=async()=>{};S.hashPassword=()=> 'test-hash';
  S.env=()=>({url:'https://example.invalid',bucket:'community-images'});
  S.verifiedUploadDrafts=async()=>[{id:'draft-1',storage_path:'community-posts/draft-1/image.webp',width:100,height:100,byte_size:500}];
  try{
    const {handler}=require('../netlify/functions/community-post-create');
    const response=await handler({httpMethod:'POST',body:JSON.stringify(body('job_hiring',{upload_ids:['draft-1'],draft_id:'draft-1'})),headers:{}});
    assert.equal(response.statusCode,201,response.body);
    assert.equal(JSON.parse(response.body).status,'approved');
    assert.equal(rows.length,1);assert.equal(rows[0].status,'approved');
    assert.ok(rows[0].approved_at);
  }finally{Object.assign(S,original)}
});

test('no historical bulk mutation and direct video upload stays disabled',()=>{
  const create=fs.readFileSync(path.join(__dirname,'../netlify/functions/community-post-create.js'),'utf8');
  const config=fs.readFileSync(path.join(__dirname,'../netlify/functions/config.js'),'utf8');
  const ui=fs.readFileSync(path.join(__dirname,'../assets/community.js'),'utf8');
  const admin=fs.readFileSync(path.join(__dirname,'../admin/assets/community-admin.js'),'utf8');
  assert.doesNotMatch(create,/update\([^)]*\)\.neq\(/);
  assert.match(create,/initialStatus=uploads\.length\?'pending':decision\.status/);
  assert.match(config,/COMMUNITY_VIDEO_UPLOAD_UI_ENABLED/);
  assert.match(ui,/result\.status==='approved'\?'게시글이 등록되었습니다\.'/);
  assert.match(ui,/if\(result\.status==='approved'\)load\(\)\.catch\(showError\)/);
  assert.match(admin,/community-review-badge/);
});
