const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('draw schema tracks winners, email history and manual eGift only',()=>{
  const sql=read('supabase/event-winner-coupon-phase1.sql');
  assert.match(sql,/event_draw_batches/);
  assert.match(sql,/event_draw_winners/);
  assert.match(sql,/event_winner_email_attempts/);
  assert.match(sql,/gift_card_status/);
  assert.match(sql,/gift_card_sent_at/);
  assert.match(sql,/order by gen_random_uuid\(\)/i);
  assert.doesNotMatch(sql,/event_reward_inventory|coupon_code|coupon_image|barcode|card_pin/i);
  assert.doesNotMatch(sql,/update\s+public\.coupon_entries|delete\s+from\s+public\.coupon_entries/i);
});

test('new admin function separates draw, winner notice, and manual eGift',()=>{
  const source=read('netlify/functions/event-winner-admin.js');
  assert.match(source,/verifyAdmin\(event\)/);
  assert.match(source,/event_draw_run/);
  assert.match(source,/event_winner_email_begin/);
  assert.match(source,/event_winner_mark_gift_sent/);
  assert.match(source,/Idempotency|idempotencyKey/);
  assert.match(source,/Starbucks에서 발송되는 이메일/);
  assert.doesNotMatch(source,/Math\.random|WINNER COUPON|codeValue:/);
});

test('admin UI does not offer legacy immediate draw beside staged draw',()=>{
  const source=read('admin/assets/event-winner-manager.js');
  assert.match(source,/oldDraw\?\.remove\(\)/);
  assert.match(source,/oldDesignate\?\.remove\(\)/);
  assert.match(source,/당첨자 추첨/);
  assert.match(source,/당첨메일 보내기/);
  assert.match(source,/Starbucks eGift 발송 완료/);
  assert.match(source,/confirm\(/);
});

test('unauthenticated requests never reach the draw endpoint',async()=>{
  const {handler}=require('../netlify/functions/event-winner-admin.js');
  const result=await handler({httpMethod:'POST',headers:{},
    body:JSON.stringify({action:'draw',event_id:'00000000-0000-4000-8000-000000000000',count:1})});
  assert.equal(result.statusCode,403);
  assert.equal(JSON.parse(result.body).ok,false);
});

test('authenticated draw calls secure database RPC without sending email',async()=>{
  const previousFetch=global.fetch;
  const previousUrl=process.env.SUPABASE_URL;
  const previousKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const called=[];
  const eventId='00000000-0000-4000-8000-000000000001';
  const reply=(value,status=200)=>({ok:status<400,status,
    json:async()=>value,text:async()=>JSON.stringify(value)});
  process.env.SUPABASE_URL='https://example.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY='test-only-service-key';
  global.fetch=async(url,options={})=>{
    called.push(String(url));
    if(String(url).endsWith('/auth/v1/user'))return reply({id:'00000000-0000-4000-8000-000000000002'});
    if(String(url).includes('/profiles?'))return reply([{role:'admin'}]);
    if(String(url).includes('/coupons?'))return reply([{id:eventId,delivery_mode:'raffle'}]);
    if(String(url).includes('/rpc/event_draw_run'))return reply([{
      batch_id:'00000000-0000-4000-8000-000000000003',selected_count:1,eligible_count:11
    }]);
    throw new Error('unexpected test request');
  };
  try{
    const {handler}=require('../netlify/functions/event-winner-admin.js');
    const result=await handler({httpMethod:'POST',headers:{authorization:'Bearer test-admin-token'},
      body:JSON.stringify({action:'draw',event_id:eventId,count:1})});
    assert.equal(result.statusCode,200);
    assert.equal(JSON.parse(result.body).draw.selected_count,1);
    assert.equal(called.filter(url=>url.includes('/rpc/event_draw_run')).length,1);
    assert.equal(called.filter(url=>url.includes('resend.com')).length,0);
  }finally{
    global.fetch=previousFetch;
    if(previousUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=previousUrl;
    if(previousKey===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY=previousKey;
  }
});
