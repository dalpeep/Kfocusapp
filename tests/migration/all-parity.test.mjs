import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),baseline=JSON.parse(fs.readFileSync('release-baseline/production.json'));
const context={requestId:'fixture',site:{id:'fixture'},deploy:{id:'fixture'}};
const fixed=Date.parse('2026-10-28T18:00:00Z'),RealDate=Date;
globalThis.Date=class extends RealDate{constructor(...a){super(...(a.length?a:[fixed]));}static now(){return fixed;}};
for(const key of Object.keys(process.env))if(/SUPABASE|RESEND|ONESIGNAL|OPENAI|GOOGLE|GA4|COMMUNITY|NEWSROOM|DAILY_CORE/.test(key))delete process.env[key];
const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>{throw Error('MOCK_NETWORK_FAILURE');};
for(const method of ['log','error','warn','info'])console[method]=()=>{};
function event(method,body){return{httpMethod:method,path:'/.netlify/functions/fixture',rawUrl:'https://fixture.invalid/.netlify/functions/fixture',rawQuery:'',headers:{'content-type':'application/json'},multiValueHeaders:{'content-type':['application/json']},queryStringParameters:null,multiValueQueryStringParameters:null,body:body??null,isBase64Encoded:false};}
function normal(value){try{const d=JSON.parse(value);function scrub(x){if(x&&typeof x==='object'){for(const k of Object.keys(x)){if(k==='stack')x[k]='STACK_LOCATION_DIFF_EXPECTED';else scrub(x[k]);}}}scrub(d);return d;}catch{return value;}}
for(const f of baseline.functions.filter(f=>f.apiVersion===1&&!f.schedule&&f.name!=='coupon-campaign-lib'))for(const method of ['GET','OPTIONS','POST'])test(f.name+' '+method+' isolated parity',async()=>{
 const legacy=require('../../netlify/legacy-functions/'+f.name+'.js').handler;assert.equal(typeof legacy,'function');const modern=(await import('../../netlify/functions/'+f.name+'.mjs')).default;const body=method==='POST'?'{}':undefined;
 let expected,oldError;try{expected=await legacy(event(method,body));}catch(e){oldError=e;}
 if(oldError){await assert.rejects(modern(new Request('https://fixture.invalid/.netlify/functions/fixture',{method,headers:{'content-type':'application/json'},...(body?{body}:{})}),context));return;}
 const actual=await modern(new Request('https://fixture.invalid/.netlify/functions/fixture',{method,headers:{'content-type':'application/json'},...(body?{body}:{})}),context);
 assert.equal(actual.status,expected.statusCode);assert.deepEqual(normal(await actual.text()),normal([204,205,304].includes(expected.statusCode)?'':expected.body??''));for(const[k,v]of Object.entries(expected.headers||{}))assert.equal(actual.headers.get(k),String(v));
});
test('legacy deployed helper has no public handler, modern also rejects',async()=>{assert.equal(require('../../netlify/legacy-functions/coupon-campaign-lib.js').handler,undefined);const fn=(await import('../../netlify/functions/coupon-campaign-lib.mjs')).default;await assert.rejects(fn(new Request('https://fixture.invalid/'),context),TypeError);});
test('all 44 build artifacts are API2, including four retained cron schedules',()=>{const b=JSON.parse(fs.readFileSync('.release-artifacts/functions-build.json'));assert.equal(b.functions.length,44);assert.ok(b.functions.every(f=>f.runtimeAPIVersion===2));assert.deepEqual(b.schedules,baseline.schedules);});
test('both originally Native entries remain byte identical',()=>{const crypto=require('node:crypto');for(const f of baseline.functions.filter(f=>f.apiVersion===2))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(f.entry)).digest('hex'),f.sourceSha256);});
