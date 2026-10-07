const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..');

test('Community owner buttons open password forms in an isolated browser',async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage();
    await page.route('**/*',route=>route.abort());
    await page.setContent('<html><head></head><body><main></main></body></html>');
    await page.addStyleTag({path:path.join(root,'styles.css')});
    await page.evaluate(()=>{
      window.APP_CONFIG={APP_REGION:'dallas',SUPABASE_URL:'https://test.invalid',SUPABASE_ANON_KEY:'synthetic',COMMUNITY_STORAGE_BUCKET:'community-images',COMMUNITY_TURNSTILE_SITE_KEY:'synthetic'};
      window.turnstile={render(box,options){options.callback('synthetic-token');return 'widget'},remove(){},reset(){}};
      const post={id:'post-test',category:'qna',status:'approved',title:'Test post',body:'Test body',author_name:'Test',area:'dallas',created_at:new Date().toISOString(),images:[],details:{post_type:'question',topic:'test'}};
      window.testRequests=[];
      window.fetch=async (url,opts)=>{
        const payload=opts?.body?JSON.parse(opts.body):{};
        if(String(url).includes('/.netlify/functions/'))window.testRequests.push({name:String(url).split('/').pop(),payload});
        if(String(url).includes('community-post-owner'))return {ok:payload.password==='correct-password',json:async()=>payload.password==='correct-password'?{post}:{error:'Password rejected'}};
        if(String(url).includes('community-comment-'))return {ok:true,json:async()=>({ok:true})};
        return {ok:true,json:async()=>String(url).includes('community_comments_public')?
          [{id:'comment-test',author_name:'Test',body:'Test comment',created_at:new Date().toISOString()}]:[post]};
      };
    });
    await page.addScriptTag({path:path.join(root,'assets/community.js')});
    await page.evaluate(()=>DtmCommunity.openPost('post-test'));
    await page.locator('[data-owner-action="delete"]').click();
    await page.locator('#communityPostDeleteForm').waitFor({timeout:2000});
    assert.equal(await page.locator('#communityPostDeleteForm input[type="password"]').count(),1);
    await page.evaluate(()=>DtmCommunity.openPost('post-test'));
    await page.locator('[data-owner-action="update"]').click();
    await page.locator('#communityPasswordActionForm').waitFor({timeout:2000});
    await page.locator('#communityPasswordActionForm input').fill('wrong-password');
    await page.locator('#communityPasswordActionForm button[type="submit"]').click();
    await page.getByText('Password rejected',{exact:true}).waitFor();
    assert.equal(await page.locator('#communityWriteForm').count(),0);
    await page.locator('#communityPasswordActionForm input').fill('correct-password');
    await page.locator('#communityPasswordActionForm button[type="submit"]').click();
    await page.locator('#communityWriteForm').waitFor({timeout:2000});
    assert.equal(await page.locator('#communityWriteForm input[type="password"]').count(),1);
    assert.equal(await page.locator('#communityWriteForm input[name="title"]').inputValue(),'Test post');
    await page.evaluate(()=>DtmCommunity.openPost('post-test'));
    await page.locator('[data-comment-update]').click();
    assert.equal(await page.locator('#communityPasswordActionForm textarea').inputValue(),'Test comment');
    await page.locator('#communityPasswordActionForm textarea').fill('Edited comment');
    await page.locator('#communityPasswordActionForm input').fill('correct-password');
    await page.locator('#communityPasswordActionForm button[type="submit"]').click();
    await page.locator('[data-comment-delete]').waitFor();
    await page.locator('[data-comment-delete]').click();
    await page.locator('#communityPasswordActionForm input').fill('correct-password');
    await page.locator('#communityPasswordActionForm button[type="submit"]').click();
    await page.locator('[data-comment-update]').waitFor();
    assert.deepEqual(await page.evaluate(()=>window.testRequests.filter(r=>r.name.startsWith('community-comment-')).map(r=>({name:r.name,hasPassword:!!r.payload.password,hasToken:!!r.payload.turnstile_token}))),[
      {name:'community-comment-update',hasPassword:true,hasToken:true},
      {name:'community-comment-delete',hasPassword:true,hasToken:true}
    ]);
  }finally{await browser.close()}
});
