const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../app-v99.js'),'utf8');
const admin=fs.readFileSync(path.join(__dirname,'../admin/assets/admin.js'),'utf8');
const parser=s=>s.slice(s.indexOf('function v229YouTubeId('),s.indexOf('\nfunction ',s.indexOf('function v229YouTubeId(')+1));
const id='dQw4w9WgXcQ';
for(const code of [source,admin]){
 const c=vm.createContext({URL});vm.runInContext(parser(code),c);
 for(const url of [`https://www.youtube.com/watch?v=${id}`,`https://youtu.be/${id}?si=test`,`https://m.youtube.com/watch?v=${id}&t=5`])assert.equal(c.v229YouTubeId(url),id);
 for(const url of ['',null,'javascript:alert(1)',`https://youtube.com.evil.test/watch?v=${id}`,`https://youtu.be.evil.test/${id}`,`https://evil.test/watch?v=${id}`,`https://user@youtube.com/watch?v=${id}`,`https://youtube.com/watch?v=short`,`https://youtu.be/${id}/extra`])assert.equal(c.v229YouTubeId(url),'');
}
async function adminSaveTests(){
 const fields={v229ListingTitle:'Test',v229ListingImages:'https://images.test/0',v229ListingUrl:'https://example.com/mls',v229ListingVideoUrl:`https://youtu.be/${id}`};
 const writes=[],alerts=[];let uploads=0;
 const c=vm.createContext({URL,selectedId:'biz',v229ListingEditId:null,val:k=>fields[k]||'',qs:()=>null,checked:()=>false,getAppRegion:()=> 'dallas',alert:x=>alerts.push(x),v229ListingMoney:()=>null,v229UploadListingFiles:async()=>{uploads++;return []},v229ClearListingEditor:()=>{},v229LoadListings:async()=>{},supabase:{from:()=>({insert:async p=>{writes.push(['insert',p]);return {}},update:p=>({eq:async(k,v)=>{writes.push(['update',p,v]);return {}}})})}});
 vm.runInContext(parser(admin)+admin.slice(admin.indexOf('async function v229SaveListing(){'),admin.indexOf('async function v229DeleteListing(){')),c);
 await c.v229SaveListing();assert.equal(writes[0][1].video_url,`https://www.youtube.com/watch?v=${id}`);assert.equal(writes[0][1].external_url,fields.v229ListingUrl);
 c.v229ListingEditId='listing';fields.v229ListingVideoUrl='';await c.v229SaveListing();assert.equal(writes[1][0],'update');assert.equal(writes[1][1].video_url,null);assert.equal(writes[1][2],'listing');
 fields.v229ListingVideoUrl='https://evil.test/video';await c.v229SaveListing();assert.equal(writes.length,2);assert.equal(uploads,2);assert(alerts.at(-1).includes('YouTube'));
 const filled={};const fillContext=vm.createContext({v229ListingEditId:null,setVal:(k,v)=>filled[k]=v,setChecked:()=>{},qs:()=>null,v229ListingImages:r=>r.images||[]});
 vm.runInContext(admin.slice(admin.indexOf('function v229FillListingEditor('),admin.indexOf('async function v229LoadListings(')),fillContext);
 fillContext.v229FillListingEditor({id:'listing',video_url:`https://youtu.be/${id}`,external_url:fields.v229ListingUrl});assert.equal(filled.v229ListingVideoUrl,`https://youtu.be/${id}`);assert.equal(filled.v229ListingUrl,fields.v229ListingUrl);
 vm.runInContext(admin.slice(admin.indexOf('function v229ClearListingEditor(){'),admin.indexOf('function v229FillListingEditor(')),fillContext);
 fillContext.v229ClearListingEditor();assert.equal(filled.v229ListingVideoUrl,'');
 console.log('Admin create/edit/clear, invalid URL before upload, external URL preservation: PASS');
}
(async()=>{
 await adminSaveTests();
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{for(const mobile of [false,true]){
  const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1280,height:900},isMobile:mobile,hasTouch:mobile});
  let youtubeRequests=0;
  await page.route('https://www.youtube.com/**',r=>{youtubeRequests++;return r.fulfill({contentType:'text/html',body:'<button>Mock player</button>'});});
  await page.route('https://images.test/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"/>'}));
  await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><button id="origin">Open</button>');
  const block=source.slice(source.indexOf('function v229YouTubeId('),source.indexOf('\nfunction renderDetail(id)'));
  await page.addScriptTag({content:`let businessListings=[],businesses=[],listingBusinessIds=new Set();const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');const normalizeUrl=s=>s;const logBusinessActivity=()=>{};const getAppRegion=()=> 'dallas';const getConfig=()=>({SUPABASE_URL:'https://db.test',SUPABASE_ANON_KEY:'test'});${block}`});
  await page.route('https://db.test/**',r=>{assert(new URL(r.request().url()).searchParams.get('select').split(',').includes('video_url'));return r.fulfill({json:[{id:'test',business_id:'biz',title:'Video listing',status:'active',images:[0,1,2,3].map(i=>'https://images.test/'+i),external_url:'https://example.com/mls',video_url:`https://youtu.be/${id}`}]});});
  assert(await page.evaluate(()=>loadBusinessListingsFromSupabase()));
  for(const closeMethod of ['top','bottom','backdrop','escape']){
   const before=youtubeRequests;
   await page.evaluate(()=>openV229Listing('test'));
   assert.equal(await page.locator('iframe').count(),0);assert.equal(youtubeRequests,before);
   assert.equal(await page.locator('[data-v229-listing-external]').getAttribute('href'),'https://example.com/mls');
   assert.equal(await page.locator('[data-v229-indicator]').textContent(),'1 / 4');
   await page.locator('[data-v229-video]').click();
   const frame=page.locator('[data-v229-video-player] iframe');await frame.waitFor();
   assert.equal(new URL(await frame.getAttribute('src')).searchParams.get('autoplay'),'0');
   await page.locator('[data-v229-video]').click();assert.equal(await frame.count(),1);
   const b=await frame.boundingBox();assert(b.width>=200&&b.width<=page.viewportSize().width&&b.height>=200);
   if(closeMethod==='top')await page.locator('.v229-listing-close').click();
   if(closeMethod==='bottom')await page.locator('.v229-listing-dialog-actions [data-v229-listing-close]').click();
   if(closeMethod==='backdrop')await page.locator('#v229ListingOverlay').click({position:{x:2,y:2}});
   if(closeMethod==='escape'){await page.locator('[data-v229-video]').focus();await page.keyboard.press('Escape');}
   assert.equal(await frame.count(),0);assert(await page.locator('#v229ListingOverlay').evaluate(e=>e.classList.contains('hidden')));
  }
  for(const value of [null,'https://evil.test/video']){
   await page.evaluate(value=>{businessListings[0].video_url=value;openV229Listing('test')},value);
   assert.equal(await page.locator('[data-v229-video]').count(),0);assert.equal(await page.locator('iframe').count(),0);assert.equal(await page.locator('[data-v229-listing-external]').count(),1);
   await page.evaluate(()=>closeV229Listing());
  }
  console.log(`${mobile?'Mobile':'Desktop'} fetch, lazy iframe, no autoplay, 4 close paths, existing gallery/link, null/invalid video: PASS`);
  await page.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
