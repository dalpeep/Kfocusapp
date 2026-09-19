const test=require('node:test');
const assert=require('node:assert/strict');
const P=require('../assets/pagination.js');
const C=require('../assets/request-coordinator.js');

const rows=n=>Array.from({length:n},(_,id)=>({id,region:'dallas'}));
async function load(source,extra={}){
  let calls=0;
  const result=await P.collectPages({pageSize:1000,maxPages:10,keyOf:r=>r.id,validRow:r=>Number.isInteger(r?.id),fetchPage:async({from,to})=>{calls++;return {rows:source.slice(from,to+1)};},...extra});
  return {result,calls};
}

for(const size of [0,1,50,200,999,1000,1001,1507])test(`loads all ${size} rows`,async()=>{
  const {result}=await load(rows(size));assert.equal(result.complete,true);assert.equal(result.rows.length,size);
});
test('exact page size performs safe empty terminal request',async()=>assert.equal((await load(rows(1000))).calls,2));
test('deduplicates rows while preserving first deterministic order',async()=>{
  const result=await P.collectPages({pageSize:2,fetchPage:async({page})=>page===0?[{id:1},{id:2}]:page===1?[{id:2},{id:3}]:[]});
  assert.deepEqual(result.rows.map(x=>x.id),[1,2,3]);assert.equal(result.duplicates,1);
});
test('malformed rows are skipped and counted',async()=>{
  const result=await P.collectPages({pageSize:5,validRow:r=>Number.isInteger(r?.id),fetchPage:async()=>[{id:1},null,{bad:true}]});
  assert.deepEqual(result.rows.map(x=>x.id),[1]);assert.equal(result.malformed,2);
});
test('page two failure is partial and never presented as complete',async()=>{
  const result=await P.collectPages({pageSize:2,fetchPage:async({page})=>{if(page===1)throw Error('page 2');return [{id:1},{id:2}]}});
  assert.equal(result.status,'partial');assert.equal(result.complete,false);assert.equal(result.rows.length,2);
});
test('retry can replace partial result only after complete load',async()=>{
  let fail=true,state=['old'];const run=async()=>P.collectPages({pageSize:2,fetchPage:async({page})=>{if(page===1&&fail)throw Error('retry');return page===0?[{id:1},{id:2}]:page===1?[{id:3}]:[]}});
  let result=await run();if(result.complete)state=result.rows;assert.deepEqual(state,['old']);fail=false;result=await run();if(result.complete)state=result.rows;assert.equal(state.length,3);
});
test('maximum page guard prevents infinite pagination',async()=>{
  const result=await P.collectPages({pageSize:1,maxPages:3,fetchPage:async()=>[{id:Math.random()}]});assert.equal(result.status,'partial');assert.equal(result.pages,3);
});
test('legacy default row cap characterization',()=>{
  for(const n of [50,200,999,1000,1001,1507])assert.equal(rows(n).slice(0,1000).length,Math.min(n,1000));
  assert.equal(rows(20001).slice(0,20000).length,20000);
});
test('1500+ complete pool remains available to downstream consumers',async()=>{
  const pool=(await load(rows(1507))).result.rows;
  assert.equal(pool.filter(x=>x.region==='dallas').length,1507);assert.equal(pool.find(x=>x.id===1506)?.id,1506);
});
test('content-range parser supports totals',()=>assert.deepEqual(P.contentRange('1000-1499/1500'),{start:1000,end:1499,total:1500}));
test('region change during pagination commits only the new region',async()=>{
  let releaseA;const waitA=new Promise(resolve=>releaseA=resolve);let state=[];
  const request=(region)=>C.run({scope:'businesses',resource:'businesses',conditions:{region},loader:async()=>P.collectPages({pageSize:1,fetchPage:async({page})=>{
    if(region==='a'&&page===1)await waitA;
    return page===0?[{id:`${region}-1`}]:page===1?[{id:`${region}-2`}]:[];
  }}),commit:r=>{if(r.complete)state=r.rows.map(x=>x.id)}});
  const a=request('a');await new Promise(resolve=>setImmediate(resolve));const b=request('b');await b;releaseA();await a;
  assert.deepEqual(state,['b-1','b-2']);
});
test('same pagination identity shares one backend traversal',async()=>{
  let calls=0;const run=()=>C.run({scope:'same',resource:'businesses',conditions:{region:'dallas'},loader:()=>P.collectPages({pageSize:2,fetchPage:async({page})=>{calls++;return page===0?[{id:1},{id:2}]:[]}})});
  await Promise.all([run(),run()]);assert.equal(calls,2);
});
