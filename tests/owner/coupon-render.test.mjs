import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),sharp=require('sharp');
const {DESIGNS,renderPng}=require('../../netlify/legacy-functions/lib/owner-coupon-template');
const coupon={title:'한글 가상 업소 · Korean Coupon',discount_label:'감사 할인 20% & 무료 혜택',description:'한국어 소개 <안내> "쿠폰" · English',start_at:'2026-01-01T12:00:00Z',end_at:'2027-01-01T12:00:00Z'};
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'coupon-render-test-'));
let rendered;
test.after(async()=>fs.rm(dir,{recursive:true,force:true}));
test('coupon text uses native libvips with Pango instead of WASM fallback',()=>{assert.equal(sharp.versions.sharp,'0.35.5');assert.ok(sharp.versions.pango);assert.equal(sharp.versions.emscripten,undefined);});
for(const design of Object.keys(DESIGNS))test(`actual ${design} coupon PNG preserves canvas, text and disk roundtrip`,async()=>{
 const bytes=await renderPng(design,coupon);if(design==='percent')rendered=bytes;
 const meta=await sharp(bytes).metadata();assert.equal(meta.width,1000);assert.equal(meta.height,650);assert.equal(meta.format,'png');assert.ok(bytes.length>10000);
 const pixel=await sharp(bytes).ensureAlpha().raw().toBuffer();
 // Text must occupy each preserved band; a blank background must fail.
 for(const [top,height]of [[40,60],[115,130],[270,140],[465,60],[545,70]]){let white=0;for(let y=top;y<top+height;y++)for(let x=55;x<945;x++){const i=(y*1000+x)*4;if(pixel[i]>220&&pixel[i+1]>220&&pixel[i+2]>220&&pixel[i+3]>220)white++;}assert.ok(white>100,`text band ${top} must contain rendered glyph pixels`);}
 const file=path.join(dir,design+'.png');await fs.writeFile(file,bytes);assert.deepEqual(await fs.readFile(file),bytes);assert.equal((await sharp(file).metadata()).width,1000);
});
test('Korean text changes actual glyph bitmap and markup characters remain literal',async()=>{
 const a=await renderPng('percent',{...coupon,title:'한글 가나다'}),b=await renderPng('percent',{...coupon,title:'한국 서울 부산'});
 const crop=bytes=>sharp(bytes).extract({left:55,top:115,width:890,height:130}).raw().toBuffer();assert.notDeepEqual(await crop(a),await crop(b));
 const literal=await renderPng('percent',{...coupon,title:'<b>& "한글"</b>'});assert.equal((await sharp(literal).metadata()).height,650);
});
test('missing text support fails clearly before image generation, never returns a blank coupon',async()=>{
 const code=await fs.readFile('netlify/legacy-functions/lib/owner-coupon-template.js','utf8');const stub=()=>{throw Error('SHOULD_NOT_GENERATE')};stub.versions={emscripten:'synthetic'};
 const context={module:{exports:{}},require:n=>n==='sharp'?stub:require(n),__dirname:path.resolve('netlify/legacy-functions/lib'),process,Buffer};vm.runInNewContext(code,context);
 await assert.rejects(()=>context.module.exports.renderPng('percent',coupon),{message:'TEMPLATE_TEXT_RUNTIME_UNAVAILABLE'});
});
test('Paid image canonicalization still accepts PNG JPEG WebP and enforces size limit',async()=>{
 const {validateImage}=require('../../netlify/legacy-functions/lib/validated-image');for(const [format,mime,ext]of [['png','image/png','png'],['jpeg','image/jpeg','jpg'],['webp','image/webp','webp']]){const bytes=await sharp({create:{width:12,height:12,channels:3,background:'#123456'}}).toFormat(format).toBuffer();const result=await validateImage(bytes,mime,'synthetic.'+ext);assert.equal(result.width,12);assert.equal(result.format,format);}
 await assert.rejects(()=>validateImage(Buffer.alloc(5242881),'image/png','too-large.png'),{message:'IMAGE_SIZE_INVALID'});
});
