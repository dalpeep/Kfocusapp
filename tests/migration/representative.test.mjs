import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { adapt } from '../../netlify/migration/adapter.mjs';
const require=createRequire(import.meta.url);
const context={requestId:'isolated-test',site:{id:'fixture'},deploy:{id:'fixture'}};
function event(method,body){return {httpMethod:method,path:'/.netlify/functions/fixture',rawUrl:'https://fixture.invalid/.netlify/functions/fixture',rawQuery:'',headers:{'content-type':'application/json'},multiValueHeaders:{'content-type':['application/json']},queryStringParameters:null,multiValueQueryStringParameters:null,body:body??null,isBase64Encoded:false};}
for(const name of ['coupon-campaign-enter','community-post-create','config'])for(const method of ['GET','OPTIONS','POST'])test(name+' '+method+' legacy/modern parity',async()=>{
 const legacy=require('../../netlify/legacy-functions/'+name+'.js').handler;
 const modern=(await import('../../netlify/functions/'+name+'.mjs')).default;
 const previous=globalThis.fetch;globalThis.fetch=async()=>{throw Error('EXTERNAL_IO_FORBIDDEN');};
 try {const body=method==='POST'?'{}':undefined;const expected=await legacy(event(method,body));const actual=await modern(new Request('https://fixture.invalid/.netlify/functions/fixture',{method,headers:{'content-type':'application/json'},...(body?{body}:{})}),context);assert.equal(actual.status,expected.statusCode);assert.equal(await actual.text(),[204,205,304].includes(expected.statusCode)?'':expected.body??'');for(const[k,v]of Object.entries(expected.headers||{}))assert.equal(actual.headers.get(k),String(v));}finally{globalThis.fetch=previous;}
});
test('request query/header/text mapping',async()=>{let captured;const fn=adapt(async e=>{captured=e;return{statusCode:200,body:'ok'};});await fn(new Request('https://fixture.invalid/a?x=1&x=2',{method:'POST',headers:{authorization:'Bearer fixture','content-type':'application/json'},body:'{"x":1}'}),context);assert.equal(captured.headers.authorization,'Bearer fixture');assert.equal(captured.body,'{"x":1}');assert.equal(captured.isBase64Encoded,false);assert.deepEqual(captured.multiValueQueryStringParameters.x,['1','2']);});
test('binary request and response preserved',async()=>{const fn=adapt(async e=>{assert.equal(e.isBase64Encoded,true);assert.equal(e.body,'AQID');return{statusCode:200,body:e.body,isBase64Encoded:true,headers:{'content-type':'application/octet-stream'}};});const response=await fn(new Request('https://fixture.invalid/a',{method:'POST',headers:{'content-type':'application/octet-stream'},body:new Uint8Array([1,2,3])}),context);assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[1,2,3]);});
test('empty request body and HTTP no-body statuses',async()=>{for(const status of [204,205,304]){const fn=adapt(async e=>{assert.equal(e.body,null);return{statusCode:status,body:''};});const r=await fn(new Request('https://fixture.invalid/a'),context);assert.equal(r.status,status);assert.equal(await r.text(),'');}});
test('multivalue cookies preserved',async()=>{const r=await adapt(async()=>({statusCode:200,body:'ok',multiValueHeaders:{'Set-Cookie':['a=1; HttpOnly','b=2; Secure']}}))(new Request('https://fixture.invalid/'),context);assert.equal(r.headers.getSetCookie().length,2);});
test('exceptions propagate without an invented success response',async()=>{await assert.rejects(adapt(async()=>{throw Error('FIXTURE_FAILURE');})(new Request('https://fixture.invalid/'),context),/FIXTURE_FAILURE/);});
