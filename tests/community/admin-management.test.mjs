import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const target = new URL('../../netlify/legacy-functions/community-admin.js', import.meta.url);
const require = createRequire(target);
const source = readFileSync(target, 'utf8');
const original = require('./lib/community-security');
const post = {id:'post',region:'dallas',area:'dallas',category:'business_promotion',status:'approved',updated_at:'2026-11-23T21:00:00Z'};
const totals = {pending:51,approved:380,hidden:0,rejected:1,expired:0,sold:2};

function fixture({failed, role='super_admin', area='', updated=true}={}){
  const reads=[],writes=[],logs=[];
  const db={from(table){
    const state={table,filters:{},order:[],range:null};
    const q={
      select(_columns,options){state.options=options;return q;},
      eq(name,value){state.filters[name]=value;return q;},
      or(expression){state.compound=expression;return q;},
      range(from,to){state.range=[from,to];return q;},
      order(name){state.order.push(name);return q;},
      update(changes){state.changes=changes;return q;},
      single(){return Promise.resolve({data:post});},
      then(resolve){
        if(state.changes){writes.push(state);return resolve({data:updated?[{id:post.id}]:[]});}
        reads.push(state);
        const status=state.filters.status||(state.compound?.startsWith('status.eq.expired,')?'expired':null);
        if(status===failed)return resolve({error:new Error('count failed')});
        return resolve({data:state.range?[post]:null,count:totals[status]});
      }
    };
    return q;
  }};
  const security={...original,verifyAdmin:async(event,region)=>{
    if(!event.headers.authorization)throw Object.assign(new Error('Unauthorized.'),{status:401});
    if(role==='member'||(role==='regional_editor'&&area!==region))
      throw Object.assign(new Error('Forbidden.'),{status:403});
    return {db,role,area,user:{id:'fixture-admin'}};
  }};
  const exports={};
  runInNewContext(source,{exports,require:p=>p==='./lib/community-security'?security:require(p),console:{info:(...args)=>logs.push(args)}});
  const call=(payload,authorization='fixture')=>exports.handler({httpMethod:'POST',headers:{authorization},body:JSON.stringify({region:'dallas',...payload})});
  return{call,reads,writes,logs};
}

test('status counts are exact scoped queries independent of paging and report errors separately from zero',async()=>{
  const {call,reads}=fixture({failed:'expired'});
  const reply=await call({action:'list',status:'pending',from:50,to:99});
  assert.equal(reply.statusCode,200);
  const result=JSON.parse(reply.body);
  assert.equal(result.count,51);
  assert.deepEqual(result.counts,{...totals,expired:null});
  assert.deepEqual(Array.from(reads[0].order),['created_at','id']);
  assert.deepEqual(Array.from(reads[0].range),[50,99]);
  assert.ok(reads.every(read=>read.filters.region==='dallas'));
  assert.ok(reads.slice(1).every(read=>read.options.head&&read.options.count==='exact'&&!read.range));
  assert.match(reads.find(read=>read.filters.status==='approved').compound,/publish_starts_at\.lte/);
  assert.match(reads.find(read=>read.compound?.startsWith('status.eq.expired,')).compound,/expires_at\.lte/);
});

const edit={action:'edit_promotion',id:post.id,updated_at:post.updated_at,title:'새 제목',body:'새 본문',author_name:'표시 이름',area:'plano',contact_type:'email',contact_value:'example@example.invalid',status:'pending',password_hash:'ignored',comment_count:999};
test('promotion edit preserves moderation, author identity and comments while logging the verified actor',async()=>{
  const {call,writes,logs}=fixture();
  assert.equal((await call(edit)).statusCode,200);
  assert.equal(writes.length,1);
  const [write]=writes;
  assert.deepEqual(Object.keys(write.changes).sort(),['area','author_name','body','contact_type','contact_value','title','updated_at']);
  assert.equal(write.changes.title,edit.title);
  assert.equal(write.filters.status,'approved');
  assert.equal(write.filters.updated_at,post.updated_at);
  assert.equal(write.table,'community_posts');
  assert.match(logs[0][1],/fixture-admin/);
});

test('promotion edit rejects unauthorized requests, cross-region changes and out-of-date saves',async()=>{
  const general=fixture();
  assert.equal((await general.call(edit,'')).statusCode,401);
  assert.equal((await fixture({role:'member'}).call(edit)).statusCode,403);
  assert.equal((await fixture({role:'regional_editor',area:'colorado'}).call(edit)).statusCode,403);
  assert.equal((await general.call({...edit,region:'colorado'})).statusCode,404);
  assert.equal((await general.call({...edit,updated_at:'old'})).statusCode,409);
  assert.equal((await general.call({...edit,contact_value:'not an email'})).statusCode,400);
  assert.equal(general.writes.length,0);
  assert.equal((await fixture({updated:false}).call(edit)).statusCode,409);
});
