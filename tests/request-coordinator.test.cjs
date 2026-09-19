const {test}=require('node:test');
const assert=require('node:assert/strict');
const requests=require('../assets/request-coordinator.js');

const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>(resolve=a,reject=b));return {promise,resolve,reject};};

test.beforeEach(()=>requests.reset());

test('identity is stable for logical resource and sorted query conditions',()=>{
  assert.equal(requests.identity('businesses',{region:'dallas',filter:'food'}),requests.identity('businesses',{filter:'food',region:'dallas'}));
  assert.notEqual(requests.identity('businesses',{region:'dallas'}),requests.identity('businesses',{region:'colorado'}));
});

test('same identity concurrent requests share one backend call',async()=>{
  const gate=deferred();let calls=0;
  const id=requests.identity('coupons',{region:'dallas'});
  const loader=()=>{calls++;return gate.promise;};
  const a=requests.fetchShared(id,loader),b=requests.fetchShared(id,loader),c=requests.fetchShared(id,loader);
  gate.resolve(['latest']);
  assert.deepEqual(await Promise.all([a,b,c]),[['latest'],['latest'],['latest']]);
  assert.equal(calls,1);
  assert.equal(requests.debug().deduped,2);
});

test('A start, B start, B response, A response commits only B',async()=>{
  const a=deferred(),b=deferred(),state=[];
  const run=(key,gate)=>requests.run({scope:'business-list',resource:'businesses',conditions:{key},abort:false,loader:()=>gate.promise,commit:value=>state.push(value)});
  const pa=run('A',a),pb=run('B',b);
  b.resolve('B');await pb;a.resolve('A');
  assert.equal((await pa).status,'stale');
  assert.deepEqual(state,['B']);
});

test('old location response cannot replace the new location response',async()=>{
  const old=deferred(),next=deferred();let state='';
  const run=(location,gate)=>requests.run({scope:'nearby',resource:'businesses',conditions:{location},abort:false,loader:()=>gate.promise,commit:value=>state=value});
  const a=run('32.7,-96.8',old),b=run('33.0,-96.7',next);
  next.resolve('new-location');await b;old.resolve('old-location');await a;
  assert.equal(state,'new-location');
});

test('old category/filter response cannot replace the new filter response',async()=>{
  const old=deferred(),next=deferred();let dom='';
  const run=(filter,gate)=>requests.run({scope:'map-filter',resource:'map-results',conditions:{filter},abort:false,loader:()=>gate.promise,commit:value=>dom=value});
  const a=run('restaurant',old),b=run('medical',next);
  next.resolve('medical DOM');await b;old.resolve('restaurant DOM');await a;
  assert.equal(dom,'medical DOM');
});

test('failed stale request cannot apply fallback over current success',async()=>{
  const old=deferred(),next=deferred();let state='seed';
  const run=(key,gate)=>requests.run({scope:'flyers',resource:'smart-flyers',conditions:{key},abort:false,loader:()=>gate.promise,commit:value=>state=value,fallback:()=>state='fallback'});
  const a=run('old',old),b=run('new',next);
  next.resolve('fresh');await b;old.reject(new Error('late failure'));await a;
  assert.equal(state,'fresh');
});

test('AbortController aborts the prior identity when a new generation starts',async()=>{
  let aborted=false;
  const slow=requests.run({scope:'region',resource:'businesses',conditions:{region:'dallas'},loader:({signal})=>new Promise((resolve,reject)=>{const stop=()=>{aborted=true;const e=new Error('aborted');e.name='AbortError';reject(e);};if(signal.aborted)stop();else signal.addEventListener('abort',stop,{once:true});}),commit:()=>{}});
  const fast=requests.run({scope:'region',resource:'businesses',conditions:{region:'colorado'},loader:()=>Promise.resolve('CO'),commit:()=>{}});
  assert.equal((await fast).status,'committed');
  assert.equal((await slow).status,'stale');
  assert.equal(aborted,true);
});

test('fresh cache prevents focus/visibility/retry backend repeats',async()=>{
  let calls=0;const id=requests.identity('daily-core',{region:'dallas'});
  const load=()=>Promise.resolve(++calls);
  assert.equal(await requests.fetchShared(id,load,{ttl:15000}),1);
  assert.equal(await requests.fetchShared(id,load,{ttl:15000}),1);
  assert.equal(await requests.fetchShared(id,load,{ttl:15000}),1);
  assert.equal(calls,1);
  assert.equal(requests.debug().cacheHit,2);
});

test('failed request is not cached and a later retry may commit',async()=>{
  let calls=0,state='existing';
  const run=()=>requests.run({scope:'daily-core',resource:'daily-core',conditions:{region:'dallas'},loader:()=>{calls++;return calls===1?Promise.reject(new Error('offline')):Promise.resolve('healthy');},commit:value=>state=value,fallback:()=>{}});
  assert.equal((await run()).status,'failed');
  assert.equal(state,'existing');
  assert.equal((await run()).status,'committed');
  assert.equal(state,'healthy');
  assert.equal(calls,2);
});
