const fs=require('fs'),assert=require('node:assert/strict'),path=require('path'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'app-v99.js'),'utf8');
const code=source.slice(source.indexOf('// Shared administrator main-image'),source.indexOf('// === P010-3:'));
(async()=>{
const browser=await chromium.launch({headless:true,channel:'msedge'});
try{for(const width of [360,390,1280]){
 const page=await browser.newPage({viewport:{width,height:844}});
 await page.route('https://flyer.test/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="2400"><rect width="1200" height="2400" fill="#e0efff"/><text x="40" y="150" font-size="65">Original full flyer</text><text x="40" y="2300" font-size="65">Bottom of original</text></svg>'}));
 await page.setContent('<main id="page-home"></main>');
 await page.addStyleTag({content:fs.readFileSync(path.join(root,'styles.css'),'utf8')});
 await page.evaluate(()=>{
  window.businesses=[{id:'h',name:'H마트'},{id:'z',name:'시온마켓'}];window.selectedBizId=null;window.currentPage='home';
  const items=Array.from({length:30},(_,i)=>({id:i,product_name:'상품 '+i,sale_price:i+1.25,unit_text:'1 lb',source_order:30-i,ai_score:i%3,is_featured:i%5===0}));
  window.rows=[{id:1,business_id:'h',title:'H마트 Weekly Sale',status:'active',image_url:'https://flyer.test/original-h'}, {id:2,business_id:'z',title:'시온마켓 Weekly Sale',status:'active',image_url:'https://flyer.test/original-z'}, {id:3,status:'active'}].map(f=>({...f,weekly_flyer_items:items,market_main_image_url:'https://flyer.test/main1',market_main_image_url_2:'https://flyer.test/main2'}));
  window.fetch=async()=>({ok:true,json:async()=>({flyers:rows})});window.setTimeout=()=>0;
 });
 await page.addScriptTag({content:code});await page.evaluate(()=>P010SmartFlyerPublic.refresh());
 let previousProducts;
 for(const id of [1,2,3]){
  await page.evaluate(id=>P010SmartFlyerPublic.openModal(id),id);
  assert.equal(await page.locator('.p0102-grid .smart-flyer-product').count(),30);
  const products=await page.locator('.p0102-grid').innerHTML();if(previousProducts)assert.equal(products,previousProducts);previousProducts=products;
  const expected=await page.evaluate(()=>rows[0].weekly_flyer_items.slice().sort((a,b)=>Number(b.is_featured)-Number(a.is_featured)||b.ai_score-a.ai_score||a.source_order-b.source_order).map(i=>i.product_name));
  assert.deepEqual(await page.locator('.p0102-grid strong').allTextContents(),expected);
  assert.equal(await page.locator('#p0102Modal .p130-flyer-image').count(),0);
  assert.equal(await page.locator('.p0102-original-flyer').count(),id===3?0:1);
  if(id!==3){
   const image=page.locator('.p0102-original-flyer');await image.evaluate(i=>i.decode());
   const g=await image.evaluate(i=>({src:i.src,w:i.getBoundingClientRect().width,h:i.getBoundingClientRect().height,fit:getComputedStyle(i).objectFit,previous:i.previousElementSibling.className,next:i.nextElementSibling.className}));
   assert.ok(g.src.includes('original-'));assert.ok(Math.abs(g.h/g.w-2)<.01);assert.equal(g.fit,'contain');assert.equal(g.previous,'p0102-top');assert.equal(g.next,'p0102-grid');
   await page.locator('.p0102-sheet').evaluate(el=>el.scrollTop=0);const top=await image.evaluate(i=>i.getBoundingClientRect().top);await page.locator('.p0102-sheet').evaluate(el=>el.scrollTop=120);assert.ok(top-await image.evaluate(i=>i.getBoundingClientRect().top)>100);
  }
  await page.keyboard.press('Escape');
 }
 console.log('PASS',width,'px: original-only H/Z; tall ratio; natural scroll; 30 products unchanged; no main-image fallback');await page.close();
}}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
