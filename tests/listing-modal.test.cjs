const { chromium } = require('playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch({headless:true,channel:process.env.TEST_BROWSER||'msedge'});
  try {
    for (const mobile of [false,true]) {
      const page = await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1280,height:900},hasTouch:mobile,isMobile:mobile});
      const source=fs.readFileSync(path.join(__dirname,'../app-v99.js'),'utf8');
      const block=source.slice(source.indexOf('function v229DallasDate()'),source.indexOf('\nfunction renderDetail(id)'));
      await page.route('https://images.test/**',route=>route.request().url().endsWith('/3')?route.abort():route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="800" height="450" fill="teal"/></svg>'}));
      await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;height:3000px}</style><button id="origin">Open</button>');
      await page.addScriptTag({content:`let businessListings=[],businesses=[],listingBusinessIds=new Set(); const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;'); const normalizeUrl=s=>s; const logBusinessActivity=()=>{}; ${block}`});
      for(const count of [1,4]) {
        await page.evaluate(count=>{
          businessListings=[{id:'test',title:'Sunnyvale test',images:Array.from({length:count},(_,i)=>'https://images.test/'+i),description:'Long listing details\n'.repeat(100)}];
          document.getElementById('origin').focus();window.scrollTo(0,450);openV229Listing('test');
        },count);
        const close=page.locator('.v229-listing-close');
        assert(await close.isVisible());
        const rect=await page.locator('.v229-listing-dialog').boundingBox();
        assert(rect.y>=0&&rect.y+rect.height<=page.viewportSize().height);
        assert.equal(await page.locator('.v229-listing-gallery-controls').count(),count===4?1:0);
        if(count===4) {
          const indicator=page.locator('[data-v229-indicator]');
          assert.equal(await indicator.textContent(),'1 / 4');
          await page.locator('[data-v229-next]').click();
          assert.equal(await indicator.textContent(),'2 / 4');
          assert((await page.locator('.v229-listing-gallery img').getAttribute('src')).endsWith('/1'));
          await page.locator('[data-v229-prev]').click();
          await page.locator('[data-v229-prev]').click();
          assert.equal(await indicator.textContent(),'4 / 4');
          await page.locator('.v229-listing-image-error').waitFor({state:'visible'});
          await page.locator('[data-v229-next]').click();
          assert.equal(await indicator.textContent(),'1 / 4');
          await page.waitForFunction(()=>document.querySelector('.v229-listing-gallery img').naturalWidth>0);
          if(mobile) {
            const cdp=await page.context().newCDPSession(page);
            const box=await page.locator('.v229-listing-gallery img').boundingBox();
            const y=box.y+box.height/2;
            for(const [from,to,expected] of [[290,80,'2 / 4'],[80,290,'1 / 4']]) {
              await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:from,y}]});
              await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:to,y}]});
              await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
              assert.equal(await indicator.textContent(),expected);
            }
          }
        }
        const before=await close.boundingBox();
        await page.locator('.v229-listing-scroll').evaluate(el=>el.scrollTop=el.scrollHeight);
        assert.deepEqual(await close.boundingBox(),before);
        assert(await page.locator('.v229-listing-dialog-actions button').isVisible());
        assert.equal(await page.evaluate(()=>document.body.style.position),'fixed');
        await close.click();
        assert(await page.locator('#v229ListingOverlay').evaluate(el=>el.classList.contains('hidden')));
        assert.equal(await page.evaluate(()=>window.scrollY),450);
        assert.equal(await page.evaluate(()=>document.body.style.position),'');
        assert.equal(await page.evaluate(()=>document.activeElement.id),'origin');
        console.log(`${mobile?'Mobile 390x844':'Desktop'} ${count} image: PASS`);
      }
      await page.close();
    }
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
