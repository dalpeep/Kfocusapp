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

test('response parsing handles plain JSON, JSON fences, and mixed web-search output',()=>{
  clear(libPath);
  const {_test}=require(libPath);
  const value={traffic:{title:'DFW 교통',summary:'정상',source_name:'TxDOT',source_url:'https://drivetexas.org',source_published_at:null}};
  const raw=JSON.stringify(value);
  assert.deepEqual(_test.parseJsonText(raw),value);
  assert.deepEqual(_test.parseJsonText('```json\n'+raw+'\n\n```'),value);
  assert.equal(_test.textFromResponse({
    output:[
      {type:'web_search_call',status:'completed'},
      {type:'message',role:'assistant',content:[{type:'output_text',text:raw}]}
    ]
  }),raw);
  assert.throws(()=>_test.parseJsonText('{"traffic":'),/JSON/);
  clear(libPath);
});

test('traffic-only request omits reasoning and minimizes verbosity, searches, and output',async()=>{
  clear(libPath);
  process.env.SUPABASE_URL='https://supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY='service-key';
  process.env.OPENAI_API_KEY='openai-key';
  let request=null,writes=0;
  const originalFetch=global.fetch;
  const weather={id:1,duplicate_key:'daily-core-weather-2026-09-04',event_data:{category:'weather'},status:'classified',updated_at:'2026-09-04T12:00:00Z',region:'dallas'};
  const traffic={id:2,duplicate_key:'daily-core-traffic-2026-09-04',event_data:{category:'traffic'},status:'classified',updated_at:'2026-09-04T12:01:00Z',region:'dallas'};
  global.fetch=async(url,options={})=>{
    const target=String(url);
    if(target.includes('api.openai.com')){
      request=JSON.parse(options.body);
      const result={traffic:{title:'DFW 교통',summary:'특이사항 없음',source_name:'TxDOT',source_url:'https://drivetexas.org',source_published_at:null}};
      return new Response(JSON.stringify({status:'completed',output:[{type:'web_search_call',status:'completed'},{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(result)}]}]}),{status:200,headers:{'Content-Type':'application/json'}});
    }
    if(target.includes('/rpc/claim_daily_core_generation_lock'))return new Response('true',{status:200});
    if(target.includes('/rpc/release_daily_core_generation_lock'))return new Response('true',{status:200});
    if(target.includes('duplicate_key=eq.daily-core-traffic'))return new Response('[]',{status:200,headers:{'Content-Type':'application/json'}});
    if(options.method==='POST'&&target.includes('/newsroom_items')){writes++;return new Response('[{"id":2}]',{status:200,headers:{'Content-Type':'application/json'}});}
    return new Response(JSON.stringify(writes?[weather,traffic]:[weather]),{status:200,headers:{'Content-Type':'application/json'}});
  };
  try{
    const {ensureDailyCore}=require(libPath);
    const result=await ensureDailyCore('dallas');
    assert.equal(Object.hasOwn(request,'reasoning'),false);
    assert.equal(request.text.verbosity,'low');
    assert.equal(request.max_tool_calls,1);
    assert.equal(request.max_output_tokens,600);
    assert.match(request.input,/Generate only: traffic/);
    assert.doesNotMatch(request.input,/WEATHER:/);
    assert.equal(writes,1);
    assert.deepEqual(result.missing,[]);
  }finally{
    global.fetch=originalFetch;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.OPENAI_API_KEY;
    clear(libPath);
  }
});

test('incomplete OpenAI response does not save a missing traffic row',async()=>{
  clear(libPath);
  process.env.SUPABASE_URL='https://supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY='service-key';
  process.env.OPENAI_API_KEY='openai-key';
  let writes=0;
  const originalFetch=global.fetch;
  const weather={id:1,duplicate_key:'daily-core-weather-2026-09-04',event_data:{category:'weather'},status:'classified',updated_at:'2026-09-04T12:00:00Z',region:'dallas'};
  global.fetch=async(url,options={})=>{
    const target=String(url);
    if(target.includes('api.openai.com'))return new Response(JSON.stringify({
      status:'incomplete',incomplete_details:{reason:'max_output_tokens'},
      output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'{"traffic":'}]}]
    }),{status:200,headers:{'Content-Type':'application/json'}});
    if(target.includes('/rpc/claim_daily_core_generation_lock'))return new Response('true',{status:200});
    if(target.includes('/rpc/release_daily_core_generation_lock'))return new Response('true',{status:200});
    if(options.method==='POST'&&target.includes('/newsroom_items')){writes++;return new Response('[]',{status:200});}
    return new Response(JSON.stringify([weather]),{status:200,headers:{'Content-Type':'application/json'}});
  };
  try{
    const {ensureDailyCore}=require(libPath);
    await assert.rejects(ensureDailyCore('dallas'),/완료되지 않았습니다/);
    assert.equal(writes,0);
  }finally{
    global.fetch=originalFetch;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.OPENAI_API_KEY;
    clear(libPath);
  }
});
