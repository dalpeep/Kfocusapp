const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const {stripTypeScriptTypes}=require('node:module');
const src=fs.readFileSync(require('path').join(__dirname,'../SUPABASE-EDGE-FUNCTION/newsroom/index.ts'),'utf8');
const segment=(a,b)=>src.slice(src.indexOf(a),src.indexOf(b,src.indexOf(a)));
const functions=segment('function flyerNum(', 'function flyerTitleFromBusiness(')+segment('function normalizeFlyerSourceBox(', 'async function saveWeeklyFlyerItemCrops(')+segment('async function reanalyzeWeeklyFlyerPositions(', 'function safeFlyerMainFileName(');
function context(overrides={}){
 const c=vm.createContext({Date,console,VERSION:'69.0.0',env:()=>'',smartFlyerBusinessName:async()=> 'Market',edgeErrorText:e=>String(e),...overrides});
 vm.runInContext(stripTypeScriptTypes(functions),c);return c;
}
const item=(i=0)=>({product_name:'Product '+i,sale_price:1.99,price_text:'$1.99/lb',regular_price:null,unit_text:'lb',source_box:{x:.1,y:.1,width:.1,height:.1},ai_score:90});
test('strict number parsing never concatenates prices, weights or conditions',()=>{const c=context();for(const x of ['2/$5','12.99 EA','12pk','members only','',null,'-1','$1.99/lb'])assert.equal(c.flyerNum(x),null);assert.equal(c.flyerNum('$12.99'),12.99)});
test('price and unit are parsed together; bundle totals and conditions preserved',()=>{
 const c=context();for(const [raw,unit,expected] of [['$1.99/lb','lb',1.99],['$12.99 EA','EA',12.99],['2/$5','',5],['$19.99 BOX','BOX',19.99],['$4.99','6pk · members only',4.99]]){const p=c.flyerPriceBlock(raw,unit);assert.equal(p.price,expected);if(raw==='2/$5')assert.match(p.unit,/2개 묶음/);if(unit.includes('members'))assert.match(p.unit,/members/)}
 assert.equal(c.flyerPriceBlock('$1.99/lb','EA').price,null);assert.equal(c.flyerPriceBlock('$1.99/lb','BOX 12').price,null);
});
test('missing or conflicting printed evidence is not guessed',()=>{
 const c=context();for(const bad of [{price_text:null},{price_text:'2/$5',sale_price:25},{price_text:'$1.99/lb',unit_text:'EA'}])assert.equal(c.normalizeSmartFlyerItems([{...item(),...bad}]).length,0);
 const bundle=c.normalizeSmartFlyerItems([{...item(),price_text:'2/$5',sale_price:5,unit_text:'2 pack'}]);assert.equal(bundle.length,1);assert.match(bundle[0].unit_text,/2개 묶음/);
});
test('boxes retain block boundaries, with percentage compatibility but no padding',()=>{const c=context();const box=c.normalizeFlyerSourceBox({x:10,y:20,width:15,height:12});assert.equal(JSON.stringify(box),JSON.stringify({x:.1,y:.2,width:.15,height:.12}));assert.equal(c.normalizeFlyerSourceBox({x:0,y:0,width:.001,height:.2}),null)});
for(const rescue of [false,true])test(`25 item ${rescue?'second-pass':'primary'} path retains product discovery and storage`,async()=>{
 let calls=0,saved;
 const admin={from(table){return {insert(rows){return {select(){
   if(table==='weekly_flyers')return {single:async()=>({data:{id:1}})};
   saved=rows;return Promise.resolve({data:rows});
 }}}}}};
 const c=context({admin,openai:async()=>({items:(++calls,Array.from({length:25},(_,i)=>item(i)))})});
 // The rescue input product is also returned by rescue, exercising unchanged deduplication.
 if(rescue)c.openai=async()=>({items:++calls===1?[item(0)]:Array.from({length:25},(_,i)=>item(i))});
 const result=await c.analyzeWeeklyFlyer({business_id:'test',image_url:'https://test/original'});
 assert.equal(result.item_count,25);assert.equal(result.analysis_passes,rescue?2:1);assert.equal(calls,rescue?2:1);assert.equal(saved.length,25);assert.equal(saved[24].product_name,'Product 24');
});
test('position matching carries unit, rejects unknown/low confidence IDs, clears stale crop',async()=>{
 const writes=[];let prompt='';const flyer={image_url:'https://test/original',weekly_flyer_items:[{id:1,...item(),unit_text:'BOX'}]};
 const c=context({openai:async request=>{prompt=request.input[0].content[0].text;return {matches:[{id:1,confidence:50,source_box:item().source_box},{id:999,confidence:99,source_box:item().source_box},{id:1,confidence:95,source_box:item().source_box}]}},admin:{from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:flyer})})}),update:patch=>{writes.push(patch);const q={eq:()=>q,then:resolve=>resolve({error:null})};return q}})}});
 const r=await c.reanalyzeWeeklyFlyerPositions({id:1});assert.equal(r.positions_updated,1);assert.equal(writes.length,1);assert.match(prompt,/BOX/);assert.equal(writes[0].item_image_url,null);assert.equal(writes[0].crop_status,'pending');
});
test('full V69 source parses as TypeScript and all discovery guards remain',()=>{stripTypeScriptTypes(src);assert.match(src,/if\(items.length<=3\)/);assert.match(src,/const merged=\[\.\.\.recovered,\.\.\.items\]/);assert.match(src,/divide the page mentally into a 4 x 4 grid/)});

test('V69 second-pass control, discovery and merge are byte-preserved except price rules',()=>{
 const flow=src.slice(src.indexOf("  // V69: 1차 인식이"),src.indexOf("  if(!items.length) throw new Error",src.indexOf("  // V69: 1차 인식이"))).replace('${FLYER_PRICE_BLOCK_RULES}\n','');
 assert.equal(require('node:crypto').createHash('sha256').update(flow).digest('hex'),'f5ff5112defa1ddc006348892dec6615ab79bdf6f3e2daa525f2469fe2790921');
});

test('administrator crop does not expand the stored source block',()=>{
 const admin=fs.readFileSync(require('path').join(__dirname,'../admin/assets/admin.js'),'utf8');
 const start=admin.indexOf('  function normalizeBox(box)');
 const code=admin.slice(start,admin.indexOf('  async function cropOne(',start));
 const c=vm.createContext({});vm.runInContext(code,c);
 assert.equal(JSON.stringify(c.normalizeBox({x:.1,y:.2,width:.15,height:.12})),JSON.stringify({x:.1,y:.2,width:.15,height:.12}));
});
