const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const root=path.resolve(__dirname,'..');
const libPath=path.join(root,'netlify/functions/lib/daily-core.js');
const readPath=path.join(root,'netlify/functions/daltown-daily-core.js');
const refreshPath=path.join(root,'netlify/functions/daily-core-refresh.js');
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function clear(){for(const p of [libPath,readPath,refreshPath])delete require.cache[require.resolve(p)];}
function mockLib(exports){clear();require.cache[require.resolve(libPath)]={id:libPath,filename:libPath,loaded:true,exports};}
function setEnv(t,values){
  const original=Object.fromEntries(Object.keys(values).map(key=>[key,process.env[key]]));
  function assign(entries){Object.entries(entries).forEach(([key,value])=>{if(value===undefined)delete process.env[key];else process.env[key]=value;});}
  assign(values);t.after(()=>assign(original));
}
function row(category){return {id:`existing-${category}`,duplicate_key:`daily-core-${category}-${today}`,event_data:{category,date_key:today},status:'classified',updated_at:`${today}T12:00:00Z`,region:'dallas',ai_title:`Existing ${category}`};}
function content(category){return {title:category==='weather'?'DFW 오늘 날씨':'DFW 오늘 교통',summary:'공식 안내를 확인하세요.',source_name:category==='weather'?'NWS':'TxDOT',source_url:category==='weather'?'https://weather.gov/fwd':'https://drivetexas.org',source_published_at:null};}
function json(value){return new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});}
function scenario(t,{existing=[],lock=true,completeUnderLock=false,response,collision=false}={}){
  clear();
  setEnv(t,{SUPABASE_URL:'https://supabase.test',SUPABASE_SERVICE_ROLE_KEY:'service-key',OPENAI_API_KEY:'test-openai-key',NEWSROOM_OPENAI_MODEL:'gpt-5-mini'});
  const state={rows:existing.map(row),requests:[],writes:[],locks:0,releases:0,reads:0};
  const originalFetch=global.fetch;
  global.fetch=async(url,options={})=>{
    const target=new URL(url);
    if(target.hostname==='api.openai.com'){
      state.requests.push(JSON.parse(options.body));
      if(response)return json(response);
      const requested=state.requests.at(-1).text.format.schema.required;
      return json({status:'completed',output:[{type:'web_search_call',status:'completed'},{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(Object.fromEntries(requested.map(category=>[category,content(category)])))}]}]});
    }
    assert.equal(target.hostname,'supabase.test','No live network calls');
    if(target.pathname.endsWith('/rpc/claim_daily_core_generation_lock')){assert.equal(options.method,'POST');state.locks++;return json(lock);}
    if(target.pathname.endsWith('/rpc/release_daily_core_generation_lock')){assert.equal(options.method,'POST');state.releases++;return json(true);}
    assert.equal(target.pathname,'/rest/v1/newsroom_items');
    if(options.method&&options.method!=='GET'){
      state.writes.push({method:options.method,body:JSON.parse(options.body)});
      assert.equal(options.method,'POST','Existing rows must never be updated or deleted');
      const inserted={...JSON.parse(options.body),id:`new-${state.writes.length}`};state.rows.push(inserted);return json([inserted]);
    }
    if(target.searchParams.has('duplicate_key')){
      const duplicateKey=target.searchParams.get('duplicate_key').slice(3);
      if(collision&&!state.rows.some(r=>r.duplicate_key===duplicateKey))state.rows.push(row(duplicateKey.includes('-weather-')?'weather':'traffic'));
      return json(state.rows.filter(r=>r.duplicate_key===duplicateKey));
    }
    state.reads++;
    if(completeUnderLock&&state.reads===2)state.rows=['weather','traffic'].map(row);
    return json(state.rows);
  };
  t.after(()=>{global.fetch=originalFetch;clear();});
  return {...require(libPath),state};
}

test('public GET never generates, including repeated missing reads',async t=>{
  let reads=0;mockLib({loadTodayRows:async()=>{reads++;return {today,byCategory:new Map()};},ensureDailyCore:async()=>{throw new Error('must not generate');}});t.after(clear);
  const {handler}=require(readPath);
  for(let i=0;i<4;i++){
    const response=await handler({httpMethod:'GET',queryStringParameters:{region:'dallas'}});
    assert.equal(response.statusCode,200);const body=JSON.parse(response.body);
    assert.equal(body.count,0);assert.equal(body.repaired,false);assert.deepEqual(body.missing,['weather','traffic']);
  }
  assert.equal(reads,4);
});
test('unauthenticated refresh is rejected without generation',async t=>{
  let calls=0;mockLib({ensureDailyCore:async()=>{calls++;}});t.after(clear);setEnv(t,{DAILY_CORE_REFRESH_SECRET:undefined});
  const response=await require(refreshPath).handler({httpMethod:'POST',headers:{},queryStringParameters:{force:'1'}});
  assert.equal(response.statusCode,403);assert.equal(calls,0);
});
for(const scheduled of [true,false])test(`${scheduled?'scheduled':'authenticated manual'} recovery ignores force and preserves one daily schedule`,async t=>{
  const args=[];mockLib({ensureDailyCore:async(region,options)=>{args.push({region,options});return {ok:true};}});t.after(clear);setEnv(t,{DAILY_CORE_REFRESH_SECRET:'test-secret'});
  const {handler,config}=require(refreshPath);
  const response=await handler({httpMethod:'POST',body:scheduled?JSON.stringify({next_run:'tomorrow'}):'{}',headers:scheduled?{}:{authorization:'Bearer test-secret'},queryStringParameters:{force:'1'}});
  assert.equal(response.statusCode,200);assert.deepEqual(args,[{region:'dallas',options:{force:false}}]);assert.equal(config.schedule,'15 11 * * *');
  assert.match(fs.readFileSync(path.join(root,'netlify.toml'),'utf8'),/\[functions\."daily-core-refresh"\]\s+schedule = "15 11 \* \* \*"/);
});
test('complete categories cause zero OpenAI calls, locks or writes, even with legacy force',async t=>{
  const {ensureDailyCore,state}=scenario(t,{existing:['weather','traffic']});const result=await ensureDailyCore('dallas',{force:true});
  assert.equal(result.generated,false);assert.deepEqual(result.missing,[]);assert.equal(state.requests.length,0);assert.equal(state.locks,0);assert.equal(state.writes.length,0);
});
for(const missing of [['weather'],['traffic'],['weather','traffic']])test(`${missing.join('+')} missing uses only the unified model/search and saves only missing categories`,async t=>{
  const existing=['weather','traffic'].filter(category=>!missing.includes(category));
  const {ensureDailyCore,state}=scenario(t,{existing});const before=structuredClone(state.rows);const result=await ensureDailyCore('dallas',{force:true});
  assert.equal(state.requests.length,1,'No automatic retry');const request=state.requests[0];
  assert.equal(request.model,'gpt-5.4-mini-2026-03-17');assert.deepEqual(request.reasoning,{effort:'none'});
  assert.equal(request.tools.length,1);assert.equal(request.tools[0].type,'web_search');assert.equal(request.tools[0].search_context_size,'low');assert.equal(request.text.verbosity,'low');
  assert.equal(request.max_tool_calls,missing.length);assert.equal(request.max_output_tokens,600*missing.length);assert.equal(request.text.format.strict,true);
  assert.deepEqual(Object.keys(request.text.format.schema.properties),missing);assert.deepEqual(request.text.format.schema.required,missing);assert.equal(request.text.format.schema.additionalProperties,false);
  assert.doesNotMatch(JSON.stringify(request),/gpt-5-mini|web_search_preview/);
  for(const category of missing)assert.match(request.input,new RegExp(`${category.toUpperCase()}:`));
  for(const category of existing)assert.doesNotMatch(request.input,new RegExp(category,'i'));
  assert.deepEqual(request.tools[0].filters.allowed_domains,missing.flatMap(category=>category==='weather'?['weather.gov']:['drivetexas.org','txdot.gov','511dfw.org','dart.org']));
  assert.deepEqual(state.writes.map(w=>w.body.event_data.category),missing);assert(state.writes.every(w=>w.body.event_data.date_key===today));
  assert.deepEqual(state.rows.slice(0,before.length),before,'Existing rows unchanged');assert.deepEqual(result.missing,[]);assert.equal(state.locks,1);assert.equal(state.releases,1);
});
test('generation lock contention prevents OpenAI and DB writes',async t=>{
  const {ensureDailyCore,state}=scenario(t,{lock:false});const result=await ensureDailyCore('dallas');
  assert.equal(result.locked,true);assert.equal(result.generated,false);assert.equal(state.requests.length,0);assert.equal(state.writes.length,0);assert.equal(state.releases,0);
});
test('categories completed before lock recheck are not regenerated',async t=>{
  const {ensureDailyCore,state}=scenario(t,{completeUnderLock:true});const result=await ensureDailyCore('dallas');
  assert.equal(result.generated,false);assert.equal(state.requests.length,0);assert.equal(state.writes.length,0);assert.equal(state.releases,1);
});
test('existing row found immediately before save is skipped, never updated',async t=>{
  const {ensureDailyCore,state}=scenario(t,{existing:['weather'],collision:true});const result=await ensureDailyCore('dallas');
  assert.equal(state.requests.length,1);assert.equal(state.writes.length,0);assert.equal(result.saved[0].action,'skipped_existing');assert.deepEqual(result.missing,[]);
});
for(const failure of ['incomplete','parse failure','missing category'])test(`${failure}: zero saves, lock released, no retry`,async t=>{
  const response=failure==='incomplete'?{status:'incomplete',incomplete_details:{reason:'max_output_tokens'},output_text:JSON.stringify({weather:content('weather'),traffic:content('traffic')})}:{status:'completed',output_text:failure==='parse failure'?'not JSON':JSON.stringify({weather:content('weather')})};
  const {ensureDailyCore,state}=scenario(t,{response});const stage=failure==='incomplete'?'openai_response_incomplete':failure==='parse failure'?'openai_parse':'openai_category_validation';
  await assert.rejects(ensureDailyCore('dallas'),error=>error.dailyCoreStage===stage);assert.equal(state.requests.length,1);assert.equal(state.writes.length,0);assert.equal(state.releases,1);
});
test('parsing supports plain JSON, code fences and mixed web search output',()=>{
  clear();const {_test}=require(libPath);const value={traffic:content('traffic')},raw=JSON.stringify(value);
  assert.deepEqual(_test.parseJsonText(raw),value);assert.deepEqual(_test.parseJsonText('```json\n'+raw+'\n```'),value);
  assert.equal(_test.textFromResponse({output:[{type:'web_search_call'},{type:'message',role:'assistant',content:[{type:'output_text',text:raw}]}]}),raw);
  assert.throws(()=>_test.parseJsonText('{"traffic":'),/JSON/);clear();
});
