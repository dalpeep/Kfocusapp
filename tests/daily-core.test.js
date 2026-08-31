const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const libPath=path.join(root,'netlify/functions/lib/daily-core.js');
const readPath=path.join(root,'netlify/functions/daltown-daily-core.js');
const refreshPath=path.join(root,'netlify/functions/daily-core-refresh.js');

function clear(...paths){for(const p of paths)delete require.cache[require.resolve(p)];}
function mockLib(exports){
  clear(libPath,readPath,refreshPath);
  require.cache[require.resolve(libPath)]={id:libPath,filename:libPath,loaded:true,exports};
}
function emptyRows(){return {today:'2026-08-31',byCategory:new Map()};}

test('public read endpoint never invokes generation, including repeated empty reads',async()=>{
  let reads=0;
  mockLib({loadTodayRows:async()=>{reads++;return emptyRows();},ensureDailyCore:async()=>{throw new Error('must not run');}});
  const {handler}=require(readPath);
  for(let i=0;i<4;i++){
    const response=await handler({httpMethod:'GET',queryStringParameters:{region:'dallas'}});
    const body=JSON.parse(response.body);
    assert.equal(response.statusCode,200);
    assert.equal(body.count,0);
    assert.equal(body.repaired,false);
    assert.deepEqual(body.missing,['weather','traffic']);
  }
  assert.equal(reads,4);
});

test('refresh rejects an unauthenticated force request without calling ensureDailyCore',async()=>{
  let calls=0;
  mockLib({ensureDailyCore:async()=>{calls++;}});
  delete process.env.DAILY_CORE_REFRESH_SECRET;
  const {handler}=require(refreshPath);
  const response=await handler({httpMethod:'GET',headers:{},queryStringParameters:{force:'1'}});
  assert.equal(response.statusCode,403);
  assert.equal(calls,0);
});

test('scheduled invocation calls ensureDailyCore and ignores force query parameter',async()=>{
  const args=[];
  mockLib({ensureDailyCore:async(region,options)=>{args.push({region,options});return {ok:true,generated:false};}});
  const {handler,config}=require(refreshPath);
  const response=await handler({httpMethod:'POST',body:JSON.stringify({next_run:'2026-09-01T11:15:00Z'}),headers:{},queryStringParameters:{force:'1'}});
  assert.equal(response.statusCode,200);
  assert.deepEqual(args,[{region:'dallas',options:{force:false}}]);
  assert.equal(config.schedule,'15 11 * * *');
});

test('authenticated manual refresh is allowed and force remains explicit',async()=>{
  const args=[];
  mockLib({ensureDailyCore:async(region,options)=>{args.push({region,options});return {ok:true};}});
  process.env.DAILY_CORE_REFRESH_SECRET='test-secret';
  const {handler}=require(refreshPath);
  const response=await handler({httpMethod:'POST',headers:{authorization:'Bearer test-secret'},queryStringParameters:{force:'1'}});
  assert.equal(response.statusCode,200);
  assert.deepEqual(args,[{region:'dallas',options:{force:true}}]);
  delete process.env.DAILY_CORE_REFRESH_SECRET;
});

test('existing weather and traffic skip lock and OpenAI calls',async()=>{
  clear(libPath);
  process.env.SUPABASE_URL='https://supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY='service-key';
  process.env.OPENAI_API_KEY='openai-key';
  let openaiCalls=0;
  const originalFetch=global.fetch;
  global.fetch=async url=>{
    if(String(url).includes('api.openai.com')){openaiCalls++;throw new Error('unexpected OpenAI call');}
    return new Response(JSON.stringify([
      {id:1,duplicate_key:'daily-core-weather-2026-08-31',event_data:{category:'weather'},status:'classified',updated_at:'2026-08-31T12:00:00Z',region:'dallas'},
      {id:2,duplicate_key:'daily-core-traffic-2026-08-31',event_data:{category:'traffic'},status:'classified',updated_at:'2026-08-31T12:00:00Z',region:'dallas'}
    ]),{status:200,headers:{'Content-Type':'application/json'}});
  };
  try{
    const {ensureDailyCore}=require(libPath);
    const result=await ensureDailyCore('dallas');
    assert.equal(result.generated,false);
    assert.equal(openaiCalls,0);
  }finally{
    global.fetch=originalFetch;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.OPENAI_API_KEY;
    clear(libPath);
  }
});

test('a contending DB lock prevents OpenAI generation',async()=>{
  clear(libPath);
  process.env.SUPABASE_URL='https://supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY='service-key';
  process.env.OPENAI_API_KEY='openai-key';
  let openaiCalls=0;
  const originalFetch=global.fetch;
  global.fetch=async(url,options={})=>{
    if(String(url).includes('api.openai.com')){openaiCalls++;throw new Error('unexpected OpenAI call');}
    const body=String(url).includes('/rpc/claim_daily_core_generation_lock')?'false':'[]';
    return new Response(body,{status:200,headers:{'Content-Type':'application/json'}});
  };
  try{
    const {ensureDailyCore}=require(libPath);
    const result=await ensureDailyCore('dallas');
    assert.equal(result.generated,false);
    assert.equal(result.locked,true);
    assert.equal(openaiCalls,0);
  }finally{
    global.fetch=originalFetch;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.OPENAI_API_KEY;
    clear(libPath);
  }
});
