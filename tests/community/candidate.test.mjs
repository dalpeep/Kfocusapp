import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
const code=fs.readFileSync('assets/community.js','utf8');
const ctx={Date,AREAS:[],ui4Labels:{business_promotion:'업체홍보'},timeLabel:()=> 'QA',ui4Badge:s=>s,esc:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')};
vm.createContext(ctx);
vm.runInContext(code.match(/function promotionPhone\(value\)\{[\s\S]*?\n\}/)[0]+'\n'+code.match(/const HOME_CARD_LOGO=[\s\S]*?\n\}/)[0],ctx);
const row={id:'qa-only',title:'QA <card>',category:'business_promotion',created_at:'2020-01-01',body_preview:'synthetic'};
test('first public image is used',()=>assert.match(ctx.homeCard({...row,image_url:'/fixture.png'}),/src="\/fixture.png"/));
test('missing image uses existing logo',()=>assert.match(ctx.homeCard(row),/is-logo" src="\/assets\/kfocus-icon.png"/));
test('legacy first gallery image retained',()=>assert.match(ctx.homeCard({...row,gallery_urls:['/first.png','/second.png']},'legacy'),/src="\/first.png"/));
test('card title is escaped',()=>assert.match(ctx.homeCard(row),/QA &lt;card>/));
test('logo resource exists',()=>assert.ok(fs.existsSync('assets/kfocus-icon.png')));
test('image error fallback is one-shot',()=>{const callbacks=[];const c={document:{addEventListener:(name,fn,capture)=>{assert.equal(name,'error');assert.equal(capture,true);callbacks.push(fn)}},HOME_CARD_LOGO:'/assets/kfocus-icon.png'};vm.createContext(c);vm.runInContext(code.match(/document.addEventListener\('error',[\s\S]*?\},true\);/)[0],c);let assignments=0;const classes=new Set();const image={matches:()=>true,classList:{contains:x=>classes.has(x),add:x=>classes.add(x)},set src(v){assert.equal(v,c.HOME_CARD_LOGO);assignments++}};callbacks[0]({target:image});callbacks[0]({target:image});assert.equal(assignments,1)});
for(const [input,expected] of [['214-555-0100','+12145550100'],['+1 (214) 555-0100','+12145550100'],['javascript:alert(1)',''],['','']])test('safe telephone: '+JSON.stringify(input),()=>assert.equal(ctx.promotionPhone(input),expected));
test('telephone anchor preserves native navigation',()=>assert.match(code,/href="tel:\$\{phone\}"/));
test('runtime changes are limited to approved authorization patches and QA script',()=>{
 const base='4a8b0cddd4a742037e4f8b811a649fa61e831730';
 const patches=JSON.parse(fs.readFileSync('release-baseline/community-security-patches.json')).patches;
 const changed=execFileSync('git',['diff','--name-only',base,'--','netlify','package.json','package-lock.json'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean).sort();
 assert.deepEqual(changed,[...patches.map(p=>p.path),'package.json'].sort());
 const before=JSON.parse(execFileSync('git',['show',base+':package.json'],{encoding:'utf8'})),after=JSON.parse(fs.readFileSync('package.json'));
 assert.equal(after.scripts['qa:migration'],'node --test tests/migration/*.test.mjs tests/migration/*.test.cjs');
 before.scripts['qa:migration']=after.scripts['qa:migration'];assert.deepEqual(after,before);
});
test('the UI release retains the deployed build settings, SQL, and activation gate',()=>{
 const production='e0aecb4c91726f3be5031df3f6244c86e1e58c93';
 const diff=execFileSync('git',['diff',production,'--','netlify','*.sql','release-baseline/activation.json',
  ':(exclude)docs/migrations/DRAFT-owner-phase1-pilot.sql',
  ':(exclude)docs/migrations/PROD-OWNER-PHASE1-ACCOUNT-PREFLIGHT-READONLY.sql',
  // Review-only phase-two SQL, applied separately from Netlify builds.
  ':(exclude)docs/migrations/DRAFT-owner-phase2-gallery.sql',
  ':(exclude)docs/migrations/DRAFT-owner-phase2-coupons.sql',
  ':(exclude)docs/migrations/DRAFT-owner-coupon-use-proof.sql',
  ':(exclude)docs/migrations/DRAFT-owner-coupon-proof-refresh.sql',
  ':(exclude)docs/migrations/DRAFT-owner-coupon-short-code.sql',
  ':(exclude)docs/migrations/DRAFT-owner-coupon-history-readonly.sql',
  ':(exclude)docs/migrations/DRAFT-owner-events.sql',
  ':(exclude)docs/migrations/DRAFT-owner-menu.sql',
  ':(exclude)docs/migrations/DRAFT-menu-optional-price.sql',
  ':(exclude)docs/migrations/DRAFT-business-reservations.sql',
  ':(exclude)docs/migrations/ROLLBACK-business-reservations.sql',
  ':(exclude)docs/migrations/ADD-reservation-customer-credentials.sql',
  ':(exclude)docs/migrations/ROLLBACK-reservation-customer-credentials.sql',
  ':(exclude)docs/migrations/ADD-reservation-mail.sql',
  ':(exclude)docs/migrations/ROLLBACK-reservation-mail.sql',
  ':(exclude)docs/migrations/ROLLBACK-owner-menu.sql',
  ':(exclude)docs/migrations/DRAFT-paid-promotion-guard.sql',
  ':(exclude)docs/migrations/ROLLBACK-paid-promotion-guard.sql',
  ':(exclude)docs/migrations/DRAFT-owner-coupon-use-cutover.sql',
  ':(exclude)docs/migrations/ROLLBACK-owner-coupon-use-cutover.sql',
  ':(exclude)docs/migrations/ROLLBACK-owner-coupon-use-proof.sql',
  ':(exclude)docs/migrations/ROLLBACK-owner-phase2-coupons.sql',
  ':(exclude)docs/migrations/DRAFT-owner-phase2-specials.sql',
  ':(exclude)docs/migrations/DRAFT-owner-phase2-specials-v2.sql',
  ':(exclude)docs/migrations/ROLLBACK-owner-phase2-specials-v2.sql',
  ':(exclude)docs/migrations/ROLLBACK-owner-phase2-specials.sql',
  ':(exclude)docs/migrations/DRAFT-owner-phase2-specials-admin-guard.sql',
  ':(exclude)docs/migrations/ROLLBACK-owner-phase2-specials-admin-guard.sql',
  ':(exclude)docs/migrations/DRAFT-owner-phase2-storage-guard.sql',
  ':(exclude)docs/migrations/DRAFT-owner-phase2-business-gallery-guard.sql',
  ':(exclude)docs/migrations/ROLLBACK-owner-phase2-business-gallery-guard.sql',
  ':(exclude)docs/migrations/ROLLBACK-owner-phase2-storage-guard.sql',
  ':(exclude)docs/migrations/ROLLBACK-owner-phase2-gallery.sql',
  ':(exclude)docs/migrations/PROD-OWNER-PHASE2-CONTENT-PREFLIGHT-READONLY.sql'],{encoding:'utf8'});
 assert.equal(diff,'');
 const toml=fs.readFileSync('netlify.toml','utf8').replaceAll('\r\n','\n');
 const published=execFileSync('git',['show',production+':netlify.toml'],{encoding:'utf8'}).replaceAll('\r\n','\n');
 assert.equal(toml,published);
});

test('Today includes unfeatured coupons on Dallas start, middle and end dates',()=>{
 const app=fs.readFileSync('app-v99.js','utf8');
 const context=vm.createContext({currentRegion:'dallas'});
 vm.runInContext(fs.readFileSync('assets/dallas-time.js','utf8'),context);
 vm.runInContext(fs.readFileSync('assets/active-state.js','utf8'),context);
 const functions=['v249CouponEffectiveEnd','activeCoupons','todayCoupons'].map(name=>app.match(new RegExp('function '+name+'\\([^\\n]*\\n[\\s\\S]*?\\n\\}'))[0]);
 vm.runInContext(functions.join('\n'),context);
 context.coupons=[
  {id:'pilot',region:'dallas',start_date:'2026-11-12',end_date:'2026-11-14'},
  {id:'ended',region:'dallas',is_active:false,start_date:'2026-11-12',end_date:'2026-11-14'},
 ];
 const ids=instant=>{
   context.Date=class extends Date {static now(){return Date.parse(instant)}};
   return Array.from(context.todayCoupons(),row=>row.id);
 };
 assert.deepEqual(ids('2026-11-12T05:59:59Z'),[]);
 assert.deepEqual(ids('2026-11-12T06:00:00Z'),['pilot']);
 assert.deepEqual(ids('2026-11-13T18:00:00Z'),['pilot']);
 assert.deepEqual(ids('2026-11-15T05:59:59Z'),['pilot']);
 assert.deepEqual(ids('2026-11-15T06:00:00Z'),[]);
});

test('community event lists use posts, while home and map show owner events',()=>{
 const app=fs.readFileSync('app-v99.js','utf8');
 assert.doesNotMatch(code,/DtmBusinessEventCards|\/rest\/v1\/events/);
 assert.match(code,/등록된 행사안내 글이 없습니다/);
 assert.match(app,/ownerEventsOnly:kind==='event'/);
 assert.match(app,/openMapBenefits\(&quot;event&quot;\)/);
});

test('public menu loads on detail render without requiring an order link',()=>{
 const app=fs.readFileSync('app-v99.js','utf8');
 const orderBindings=app.slice(app.indexOf("detailCard.querySelectorAll('.order-link-btn')"),app.indexOf('const hoursHtml = renderBusinessHours(b);',app.indexOf("detailCard.querySelectorAll('.order-link-btn')")));
 assert.match(orderBindings,/\n\}\);\r?\n  void loadBusinessMenu\(b, detailCard.querySelector\('\[data-business-menu\]'\)\);/);
});
