const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const admin=fs.readFileSync(path.join(root,'admin/assets/admin.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const section=(source,start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
const adminFunctions=section(admin,'  function normalizeItem(row={},index=0){','  function readLegacy(')
  +section(admin,'  function applyEditor(item){','  async function upload(item){')
  +section(admin.slice(admin.indexOf('// V220: multi popup')), '  async function saveAll(){','  function boot(){');
function editor(overrides={}){
  const values={v218Title:'여러분의 달타운맵을 만들어 주세요.',v218Media:'image',v218ItemEnabled:'on',
    v218ImageUrl:'https://example.com/popup.png',v218VideoUrl:'https://example.com/popup.mp4',
    v218LinkUrl:'https://example.com/join',v218Start:'2026-09-09',v218End:'2026-10-10',v218Priority:'1',...overrides};
  const nodes=Object.fromEntries(Object.entries(values).map(([k,value])=>[k,{value}]));
  const writes=[],alerts=[];
  const ctx=vm.createContext({state:{enabled:true,mode:'visit_sequential',frequency:'always',items:[{id:'new',title:'old',enabled:true,media_type:'image',image_url:''}]},
    selected:'new',loadedConfig:{},el:id=>nodes[id],getAppRegion:()=> 'dallas',alert:msg=>alerts.push(msg),console,
    newsroomEdgeCall:async(action,body)=>{if(action==='get_settings')return {settings:{home_config:{unrelated:{preserve:true}}}};writes.push(body);return {ok:true};}});
  vm.runInContext(adminFunctions,ctx);
  return {ctx,writes,alerts};
}
test('direct Save All persists every current editor field without Apply',async()=>{
  for(const media of ['image','video']){
    const {ctx,writes}=editor({v218Media:media,v218ItemEnabled:media==='image'?'on':'off'});
    await ctx.saveAll();
    assert.equal(writes.length,1);
    assert.deepEqual(JSON.parse(JSON.stringify(writes[0].home_config.promo_popups[0])),{
      id:'new',title:'여러분의 달타운맵을 만들어 주세요.',media_type:media,
      image_url:'https://example.com/popup.png',video_url:'https://example.com/popup.mp4',link_url:'https://example.com/join',
      start_date:'2026-09-09',end_date:'2026-10-10',enabled:media==='image',priority:1});
    assert.equal(writes[0].home_config.unrelated.preserve,true);
    assert.equal(writes[0].home_config.promo_popup_settings.frequency,'always');
  }
});
test('validation uses unsaved editor URL and dates before any save',async()=>{
  for(const overrides of [{v218ImageUrl:''},{v218Start:'2026-10-11'},{v218Media:'video',v218VideoUrl:''}]){
    const {ctx,writes,alerts}=editor(overrides);
    ctx.state.items[0].image_url='https://example.com/old.png';
    await ctx.saveAll();assert.equal(writes.length,0);assert.equal(alerts.length,1);
  }
});
function publicRuntime(){
  const storage=new Map();
  const ctx=vm.createContext({POPUP_KEY:'test-popup',window:{currentRegion:'dallas'},previewMode:()=>false,previewId:()=>'',today:()=> '2026-09-10',
    localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)}});
  vm.runInContext(section(html,'  function normalize(home){','  function openItem(item,cfg){'),ctx);
  const cfg=ctx.normalize({promo_popup_settings:{enabled:true,mode:'visit_sequential',frequency:'always'},promo_popups:[
    {id:'image',enabled:true,media_type:'image',image_url:'https://example.com/1.png',priority:1,start_date:'2026-09-09',end_date:'2026-10-10'},
    {id:'video',enabled:true,media_type:'video',video_url:'https://example.com/2.mp4',priority:2}]});
  return {ctx,cfg,storage};
}
test('always bypasses snooze and seen, but still honors disabled',()=>{
  const {ctx,cfg,storage}=publicRuntime();
  storage.set(ctx.snoozeKey(cfg),'2026-09-10');storage.set(ctx.seenKey(cfg),'seen');
  assert.equal(ctx.shouldShow(cfg),true);
  cfg.enabled=false;assert.equal(ctx.shouldShow(cfg),false);
});
test('once and daily preserve seen and snooze behavior',()=>{
  for(const frequency of ['once','daily']){
    const {ctx,cfg,storage}=publicRuntime();cfg.frequency=frequency;
    assert.equal(ctx.shouldShow(cfg),true);
    storage.set(ctx.snoozeKey(cfg),'2026-09-10');assert.equal(ctx.shouldShow(cfg),false);
    storage.set(ctx.snoozeKey(cfg),'2026-09-09');assert.equal(ctx.shouldShow(cfg),true);
    ctx.markSeen(cfg);assert.equal(ctx.shouldShow(cfg),false);
    storage.set(ctx.seenKey(cfg),'2026-09-09');assert.equal(ctx.shouldShow(cfg),frequency==='daily');
  }
});
test('active visit rotation remains image -> video -> image',()=>{
  const {ctx,cfg}=publicRuntime();
  cfg.items.push({id:'disabled',enabled:false},{id:'expired',enabled:true,mediaType:'image',imageUrl:'x',endDate:'2026-09-09'});
  assert.equal(ctx.eligible(cfg).length,2);
  const ids=[];for(let i=0;i<3;i++){const item=ctx.choose(cfg);ids.push(item.id);ctx.advance(cfg,item);}
  assert.deepEqual(ids,['image','video','image']);
});
