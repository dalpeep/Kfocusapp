// GET-only production audit. Never opens the app or records impressions/clicks.
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const shared=require('../assets/home-selection.js');
const legacy=require('../tests/fixtures/home-selection-v312.cjs');
const ids=g=>Object.fromEntries(['featured','new','popular'].map(k=>[k,Array.from(g[k],b=>b.id)]));
async function main(){
  const text=await (await fetch('https://daltownmap.com/.netlify/functions/config')).text();
  const cfg=JSON.parse(text.match(/window\.APP_CONFIG\s*=\s*(\{.*?\});/s)[1]);
  const now=Date.now(),engine=shared.create({now}),day=engine.day();
  const since=engine.midnight(engine.weekStart(day));
  const headers={apikey:cfg.SUPABASE_ANON_KEY,Authorization:`Bearer ${cfg.SUPABASE_ANON_KEY}`};
  const query=async q=>{const res=await fetch(`${cfg.SUPABASE_URL}/rest/v1/${q}`,{headers});assert.equal(res.status,200);return res.json();};
  const fields='id,name_ko,name_en,name,address,phone,lat,lng,region,is_active,list_visible,created_at,paid_active,paid_start_at,paid_end_at,paid_weight,rotation_enabled,is_featured,is_new,is_popular,featured_rank,new_rank,popular_rank';
  const [raw,clicks]=await Promise.all([
    query(`businesses?select=${fields}&region=eq.dallas&is_active=eq.true&order=created_at.desc.nullslast`),
    query(`business_activity?select=business_id,created_at&action_type=eq.business_click&created_at=gte.${encodeURIComponent(since)}&limit=20000`)
  ]);
  const rows=shared.prepareRows(raw,'dallas'),clickCounts=new Map();
  clicks.forEach(r=>{const id=String(r.business_id||'').trim();if(id)clickCounts.set(id,(clickCounts.get(id)||0)+1);});
  const options={now,origin:null,clickCounts};
  const expected=legacy(options).select(day,rows,6);
  const actual=shared.create(options).select(day,rows,6);
  assert.deepEqual(ids(actual),ids(expected));
  // Exercise the actual administrator module against this exact snapshot, with no browser/storage.
  class Element {constructor(){this.children=[];this.textContent='';}append(...items){this.children.push(...items);}replaceChildren(){this.children=[];}}
  const host=new Element(),status=new Element();
  class FixedDate extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
  const context=vm.createContext({Date:FixedDate,Intl,Map,Promise,DtmHomeSelection:shared,navigator:{},document:{getElementById:id=>id==='actualExposureResults'?host:status,createElement:()=>new Element()},fetch:async url=>({ok:true,json:async()=>url.includes('/business_activity?')?clicks:raw})});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../admin/assets/exposure-preview.js'),'utf8').replaceAll('export async function','async function'),context);
  await context.refreshExposurePreview(cfg,'dallas');
  const adminIds=Object.fromEntries(['featured','new','popular'].map((key,i)=>[key,host.children[i].children[2].children.map(li=>li.children[0].children[2].children[1].textContent.replace('ID: ',''))]));
  assert.deepEqual(adminIds,ids(actual));
  console.log(JSON.stringify({at:new Date(now).toISOString(),day,region:'dallas',gps:null,publicRows:rows.length,clickRows:clicks.length,paid:rows.filter(b=>engine.paid(b,day)).length,legacyPublicMatches:true,adminRenderedIdsMatch:true,groups:Object.fromEntries(['featured','new','popular'].map(k=>[k,actual[k].map(b=>({id:b.id,name:b.name,clicks:clickCounts.get(String(b.id))||0}))]))},null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
