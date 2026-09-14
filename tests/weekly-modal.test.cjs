const fs=require('fs'),assert=require('node:assert/strict'),path=require('path'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'app-v99.js'),'utf8');
const code=source.slice(source.indexOf('// Shared administrator main-image'),source.indexOf('// === P010-3:'));
const css=fs.readFileSync(path.join(root,'styles.css'),'utf8');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{for(const width of [360,390,1280]){
  const page=await browser.newPage({viewport:{width,height:844}});
  await page.route('https://flyer.test/**',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="420"><rect width="1200" height="420" fill="#e0efff"/><text x="40" y="210" font-size="65">Weekly Sale 1200 x 420</text></svg>'}));
  await page.setContent('<main id="page-home"></main><div id="detailCard"></div>');
  await page.addStyleTag({content:css});
  await page.evaluate(()=>{
   window.businesses=[{id:'h',name:'H마트'},{id:'z',name:'시온마켓'}];window.selectedBizId=null;window.currentPage='home';
   const items=Array.from({length:30},(_,i)=>({id:i,product_name:'상품 '+i,sale_price:i+1.25,unit_text:'1 lb',source_order:30-i,ai_score:i%3,is_featured:i%5===0}));
   window.rows=[{id:1,business_id:'h',title:'H마트 Weekly Sale',status:'active',weekly_flyer_items:items,market_main_image_url:'https://flyer.test/1',market_main_image_url_2:'https://flyer.test/2'}, {id:2,business_id:'z',title:'시온마켓 Weekly Sale',status:'active',weekly_flyer_items:items,market_main_image_url:'https://flyer.test/z'}, {id:3,status:'active',weekly_flyer_items:items}, {id:4,status:'active',weekly_flyer_items:items,market_main_image_url_2:'https://flyer.test/only2'}];
   window.fetch=async()=>({ok:true,json:async()=>({flyers:rows})});
   window.timers=new Map();let id=0;window.setInterval=(fn,ms)=>{timers.set(++id,{fn,ms});return id};window.clearInterval=id=>timers.delete(id);window.setTimeout=()=>0;
  });
  await page.addScriptTag({content:code});
  await page.evaluate(async()=>{await P010SmartFlyerPublic.refresh();P010SmartFlyerPublic.openModal(1)});
  assert.equal(await page.locator('.p0102-grid .smart-flyer-product').count(),30);
  const products=await page.locator('.p0102-grid').innerHTML();
  const expected=await page.evaluate(()=>rows[0].weekly_flyer_items.slice().sort((a,b)=>Number(b.is_featured)-Number(a.is_featured)||b.ai_score-a.ai_score||a.source_order-b.source_order).map(x=>x.product_name));
  assert.deepEqual(await page.locator('.p0102-grid strong').allTextContents(),expected);
  assert.equal(await page.locator('.p0102-grid .smart-flyer-unit').first().innerText(),'1 lb');
  assert.equal(await page.locator('.p130-flyer-image').count(),2);
  const geometry=await page.locator('.p0102-main-images').evaluate(el=>{const r=el.getBoundingClientRect(),i=el.querySelector('img'),ir=i.getBoundingClientRect();return {width:r.width,height:r.height,imgWidth:ir.width,imgHeight:ir.height,fit:getComputedStyle(i).objectFit,position:getComputedStyle(el).position,previous:el.previousElementSibling.className}});
  assert.ok(Math.abs(geometry.width/geometry.height-20/7)<.01);assert.equal(geometry.width,geometry.imgWidth);assert.equal(geometry.fit,'contain');assert.equal(geometry.position,'static');assert.equal(geometry.previous,'p0102-top');
  await page.evaluate(()=>[...timers.values()].find(t=>t.ms===4500).fn());
  assert.equal(await page.locator('.p130-flyer-reel').evaluate(el=>el.style.transform),'translateX(-100%)');
  const before=await page.locator('.p0102-main-images').evaluate(el=>el.getBoundingClientRect().top);
  await page.locator('.p0102-sheet').evaluate(el=>el.scrollTop=120);
  const after=await page.locator('.p0102-main-images').evaluate(el=>el.getBoundingClientRect().top);assert.ok(before-after>100);
  await page.evaluate(()=>P010SmartFlyerPublic.openModal(1));assert.equal(await page.evaluate(()=>timers.size),1);
  await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>timers.size),0);
  for(const id of [2,3,4]){
   await page.evaluate(id=>P010SmartFlyerPublic.openModal(id),id);
   assert.equal(await page.locator('.p130-flyer-image').count(),id===3?0:1);assert.equal(await page.evaluate(()=>timers.size),0);assert.equal(await page.locator('.p0102-grid').innerHTML(),products);
  }
  await page.evaluate(()=>{rows[1].market_main_image_url_2='https://flyer.test/z2';P010SmartFlyerPublic.openModal(2)});
  assert.equal(await page.evaluate(()=>timers.size),1);
  await page.locator('.p0102-sheet').evaluate(el=>el.scrollTop=0);
  await page.screenshot({path:path.join(root,'..',`weekly-modal-${width}.png`)});
  await page.locator('.p0102-close').click();assert.equal(await page.evaluate(()=>timers.size),0);
  console.log('PASS',width,'px: 30 products/order/units preserved; 0/1/2 images; 4.5s timer; reopen/close; 20:7 contain; images scroll with products');await page.close();
 }}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
