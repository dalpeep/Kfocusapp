const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const fixture=require('./fixtures/weekly-public-production.json');
const {currentFlyers}=require('../netlify/functions/smart-flyer-public')._test;
const rows=currentFlyers(fixture.flyers,fixture.today);
const app=fs.readFileSync(path.join(root,'app-v99.js'),'utf8');
const coordinator=fs.readFileSync(path.join(root,'assets/request-coordinator.js'),'utf8');
const requestPrelude=app.slice(app.indexOf('const dtmRequests='),app.indexOf("const heroViewport"));
const shared=app.slice(app.indexOf('// Shared administrator main-image'),app.indexOf('// === P010-2:'));
const render=app.slice(app.indexOf('// === P130/V187'),app.indexOf('// === P030C'));
(async()=>{
const browser=await chromium.launch({channel:'msedge',headless:true});
try{for(const width of [360,390,1280]){
 const page=await browser.newPage({viewport:{width,height:844}});
 await page.route('https://**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="420"></svg>'}));
 await page.setContent('<main id="page-home"><div id="homeAlertSection"></div></main>');
 await page.addStyleTag({content:fs.readFileSync(path.join(root,'styles.css'),'utf8')});
 await page.evaluate(({rows,today})=>{
  const RealDate=Date;window.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[today+'T18:00:00Z']))}};
  window.businesses=rows.map(r=>({id:r.business_id,name:r.title,image:'https://test.invalid/BUILDING.jpg'}));
  window.fetch=async()=>({ok:true,json:async()=>({flyers:rows})});
  window.timers=new Map();let id=0;window.setInterval=(fn,ms)=>{timers.set(++id,{fn,ms});return id};window.clearInterval=id=>timers.delete(id);window.setTimeout=()=>0;
 },{rows,today:fixture.today});
 await page.addScriptTag({content:coordinator+requestPrelude});
 await page.addScriptTag({content:shared+render});
 await page.waitForSelector('#p130MarketHost .p130-flyer-image');
 assert.equal(await page.evaluate(()=>P032MarketFeaturedCrop.getState().markets),2);
 for(const row of rows){
  const sources=await page.locator('#p130MarketHost img').evaluateAll(imgs=>imgs.map(i=>i.src));
  const expected=[row.market_main_image_url,row.market_main_image_url_2].filter(Boolean);
  assert.deepEqual(sources,expected);
  assert.equal(await page.locator('#p130MarketHost .p130-market-summary').count(),0);
  assert.ok(sources.every(url=>url!==row.image_url&&!url.includes('BUILDING')));
  const size=await page.locator('.p130-window').evaluate(el=>({w:el.clientWidth,h:el.clientHeight}));assert.ok(Math.abs(size.w/size.h-20/7)<.03);
  await page.evaluate(()=>[...timers.values()].find(t=>t.ms===4500).fn());
  assert.equal(await page.locator('.p130-flyer-reel').evaluate(el=>el.style.transform),'translateX(-100%)');
  for(const [i,url] of sources.entries())console.log(JSON.stringify({viewport:width,flyer_id:row.id,db_field:i?'market_main_image_url_2':'market_main_image_url',db_url:expected[i],rendered_img_src:url}));
  await page.evaluate(()=>P032MarketFeaturedCrop.next());
 }
 await page.close();
}
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');assert.ok(html.includes('/app-v99.js?v=269.7-community-deep-link'));assert.ok(app.includes("DTM_BUILD_VERSION='269.1'"));
console.log('PASS production fixtures -> public selection -> P130 rendered src; both markets, both slides, all viewports; cache token');
}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
