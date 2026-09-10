const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../app-v99.js'),'utf8');
const section=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
const NOW=Date.parse('2026-09-10T18:00:00Z');
function runtime(data={}){
  const recorded={markers:[],clusters:[],preview:null,nearby:[],timers:[]};
  class FixedDate extends Date{constructor(...args){super(...(args.length?args:[NOW]));}static now(){return NOW;}}
  class Marker{constructor(options){Object.assign(this,{options,events:{}});recorded.markers.push(this);}addListener(name,fn){this.events[name]=fn;}setMap(map){this.map=map;}}
  const google={maps:{Marker,Size:class{constructor(width,height){Object.assign(this,{width,height});}},Point:class{constructor(x,y){Object.assign(this,{x,y});}}}};
  const ctx=vm.createContext({Date:FixedDate,Intl,console,google,document:{hidden:false,getElementById:()=>null,querySelectorAll:()=>[]},mapLocateBtn:null,currentLocationPosition:null,mapBottomList:null,currentRegion:'dallas',currentPage:'map',mapReady:true,
    coupons:[],businesses:[],mainBanners:[],slideRows:[],dalpicks:[],boardPosts:[],
    mapMode:'business',mapCategory:'',mapSearchQuery:'',mapRadius:'7',currentCenter:{lat:32.95,lng:-96.85},map:{getZoom:()=>12},
    markers:[],markerCluster:null,selectedMapBusinessId:'',mapVisibleCounts:{business:0,coupon:0,event:0},mapNotice:null,mapInfoWindow:null,
    window:{google,markerClusterer:{MarkerClusterer:class{constructor(options){recorded.clusters.push(options);}setMap(){}}}},
    setInterval:fn=>recorded.timers.push(fn),v292ValidBusinessCoords:(lat,lng)=>Number.isFinite(lat)&&Number.isFinite(lng),
    getMainCategoryLabel:x=>x,queryMatches:(q,values)=>values.some(x=>String(x||'').includes(q)),getRegionCenter:()=>({lat:32.95,lng:-96.85}),
    updateMapFilterAvailability:()=>{},renderMapFilters:()=>{},radiusByZoom:()=> '7',sortBusinessesByDistance:rows=>rows,
    renderMapBottomList:rows=>recorded.nearby=rows,setMapBottomStatus:()=>{},mapModeLabel:x=>x,
    panMapAboveBottomPanel:()=>{},showMapBusinessPreview:b=>recorded.preview=b,focusMapOnBusinesses:()=>{},...data});
  vm.runInContext(section('function v249CouponEffectiveEnd(c){','function v249CouponTimeState(c){')
    +section('function mapDallasDateKey(','function getMainCategoryLabel(')
    +section('function getFilteredMapBusinesses(){','function createInfoWindowContent(')
    +section('function haversineMiles(','function sortBusinessesByDistance(')
    +section('function getMarkerIconForBusiness(','function panMapAboveBottomPanel(')
    +section('function redrawMapMarkers(){','function setMapAreaButtonState('),ctx);
  return {ctx,recorded};
}
const biz=(id='a')=>({id,name:id,lat:32.95,lng:-96.85,region:'dallas',category:'식당'});
const active=extra=>({is_active:true,region:'dallas',business_id:'a',...extra});
const plain=value=>JSON.parse(JSON.stringify(value));
test('Dallas local calendar dates include the whole end date across UTC midnight and DST',()=>{
  const {ctx}=runtime();
  assert.equal(ctx.mapDallasDateKey('2026-09-11T02:00:00Z'),'2026-09-10');
  assert.equal(ctx.mapPeriodActive('2026-09-10','2026-09-10',Date.parse('2026-09-11T04:59:59Z')),true);
  assert.equal(ctx.mapPeriodActive('', '2026-09-10',Date.parse('2026-09-11T05:00:00Z')),false);
  assert.equal(ctx.mapDallasDateKey('2026-01-11T05:30:00Z'),'2026-01-10');
  assert.equal(ctx.mapPeriodActive('2026-02-30','',NOW),false);
});
test('timestamp schedules and inactive/expired/malformed content never create badges',()=>{
  for(const override of [{is_active:false},{status:'draft'},{hidden:true},{region:'colorado'},
    {start_at:'2026-09-10T19:00:00Z'},{end_at:'2026-09-10T18:00:00Z'},{end_at:'not-a-date'}]){
    const {ctx}=runtime({coupons:[active(override)],mainBanners:[active(override)],boardPosts:[active({type:'notice',subtype:'event',start_at:'2026-09-01',end_at:'2026-09-30',...override})]});
    assert.deepEqual(plain(ctx.mapBusinessBadgeKinds(biz())),[]);
  }
});
test('all linked businesses receive concurrent badges without category targeting false positives',()=>{
  const link={business_id:'b',business_ids:['a','b']};
  const {ctx}=runtime({coupons:[active(link)],mainBanners:[active(link)],boardPosts:[active({type:'notice',subtype:'event',start_at:'2026-09-01',end_at:'2026-09-30',...link})]});
  assert.deepEqual(plain(ctx.mapBusinessBadgeKinds(biz())),['coupon','promotion','event']);
  assert.deepEqual(plain(ctx.mapBusinessBadgeKinds(biz('b'))),['coupon','promotion','event']);
  assert.deepEqual(plain(ctx.mapBusinessBadgeKinds(biz('unlinked'))),[]);
  ctx.mainBanners=[active({business_id:null,business_ids:[],home_category:'all'})];
  assert(!ctx.mapBusinessBadgeKinds(biz()).includes('promotion'));
});
test('paid promotions, legacy business promo periods, slides and DalPick reuse existing sources',()=>{
  const {ctx}=runtime();
  assert(ctx.mapBusinessBadgeKinds({...biz(),paid_active:true,paid_end_at:'2026-09-10'}).includes('promotion'));
  assert(!ctx.mapBusinessBadgeKinds({...biz(),paid_active:true,paid_end_at:'2026-09-09'}).includes('promotion'));
  assert(ctx.mapBusinessBadgeKinds({...biz(),map_promotion:{enabled:true}}).includes('promotion'));
  assert(!ctx.mapBusinessBadgeKinds({...biz(),has_event:true,coupon:true}).length);
  ctx.slideRows=[active({promo_enabled:true,promo_end_at:'2026-09-10'})];
  ctx.dalpicks=[active({category:'event',status:'published',start_at:'2026-09-01',end_at:'2026-09-30'})];
  assert.deepEqual(plain(ctx.mapBusinessBadgeKinds(biz())),['promotion','event']);
});
test('raffle remains a coupon without inventing an event record',()=>{
  const {ctx}=runtime({coupons:[active({delivery_mode:'raffle',end_at:'2026-09-01T00:00:00Z',raffle_end_at:'2026-09-28T05:00:00Z'})]});
  assert.deepEqual(plain(ctx.mapBusinessBadgeKinds(biz())),['coupon']);
  ctx.coupons[0].raffle_end_at='2026-09-09T05:00:00Z';
  assert.deepEqual(plain(ctx.mapBusinessBadgeKinds(biz())),[]);
});
test('badge SVG remains a small single clickable marker and preserves event-first pin color',()=>{
  const {ctx}=runtime({coupons:[active({})],mainBanners:[active({})],boardPosts:[active({type:'notice',subtype:'event',start_at:'2026-09-01',end_at:'2026-09-30'})]});
  const icon=ctx.getMarkerIconForBusiness(biz());
  assert(icon.scaledSize.width<=128);assert.equal(icon.scaledSize.height,44);
  const svg=decodeURIComponent(icon.url.split(',')[1]);
  for(const label of ['쿠폰','프로모션','행사'])assert(svg.includes(label));
  assert(svg.includes('fill="#7e22ce" stroke="white" stroke-width="1.5"'));
  assert.equal(ctx.getMarkerIconForBusiness(biz()),icon);
  assert.match(ctx.getMarkerIconForBusiness(biz('normal')),/red-dot.png$/);
  assert.equal((ctx.mapBusinessBadgesHTML(biz()).match(/data-map-badge=/g)||[]).length,3);
});
test('redraw preserves clustering, radius list, all-result markers, click preview and filters',()=>{
  const rows=Array.from({length:14},(_,i)=>biz(String(i)));rows[13].lat=33.95;
  const {ctx,recorded}=runtime({businesses:rows,mainBanners:[active({business_id:'0'})],coupons:[active({business_id:'1',business_ids:['1','2']})],boardPosts:[active({business_id:'3',type:'notice',subtype:'event',start_at:'2026-09-01',end_at:'2026-09-30'})]});
  ctx.redrawMapMarkers();assert.equal(recorded.clusters.length,1);assert.equal(ctx.markers.length,14);assert.equal(recorded.nearby.length,13);
  assert.equal(ctx.window.__mapAllFilteredRows.length,14);
  ctx.markers[0].events.click();assert.equal(recorded.preview.id,'0');
  ctx.mapMode='coupon';assert.equal(ctx.getFilteredMapBusinesses().length,14);
  ctx.mapMode='event';assert.equal(ctx.getFilteredMapBusinesses().length,14);
  ctx.mapMode='business';ctx.mapCategory='병원';assert.equal(ctx.getFilteredMapBusinesses().length,0);
  ctx.mapCategory='';ctx.mapSearchQuery='13';assert.deepEqual(plain(ctx.getFilteredMapBusinesses().map(x=>x.id)),['13']);
});
test('map-only refresh detects newly active rows outside a filtered marker set',()=>{
  const {ctx,recorded}=runtime({businesses:[biz('a'),biz('b')],coupons:[active({})],mapMode:'coupon'});
  ctx.redrawMapMarkers();assert.equal(ctx.markers.length,2);
  ctx.coupons.push(active({business_id:'b'}));recorded.timers[0]();assert.equal(ctx.markers.length,2);
});
module.exports={runtime};


test('undated consulate registration notice is not a current event; explicit live linked events are',()=>{
  const row=active({id:'673c97d2-263e-4238-b159-71d3391c96d7',type:'notice',subtype:'event',start_at:null,end_at:null});
  const {ctx}=runtime({boardPosts:[row]});
  assert.deepEqual(plain(ctx.mapBusinessBadgeKinds(biz())),[]);
  row.event_start_at='2026-09-10';row.event_end_at='2026-09-10';
  assert.deepEqual(plain(ctx.mapBusinessBadgeKinds(biz())),['event']);
  row.is_published=false;assert.deepEqual(plain(ctx.mapBusinessBadgeKinds(biz())),[]);
  row.is_published=true;row.business_id='other';assert.deepEqual(plain(ctx.mapBusinessBadgeKinds(biz())),[]);
  row.business_id='a';row.event_end_at='2026-09-09';assert.deepEqual(plain(ctx.mapBusinessBadgeKinds(biz())),[]);
});

test('map offers one all-results action, with no separate event or coupon mode tabs',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  assert.equal((html.match(/data-map-filter=/g)||[]).length,1);
  assert(html.includes('data-map-filter="business"'));
});

test('orbit shows only nonzero counts in bottom-up order and dims without removing markers',()=>{
  const attrs={},classes={};
  const orbit={classList:{toggle:(k,v)=>classes[k]=v},style:{},parentElement:{getBoundingClientRect:()=>({top:0})}};
  const items={dataset:{},innerHTML:'',inert:true};
  const {ctx}=runtime({currentLocationPosition:{lat:32.95,lng:-96.85},businesses:[biz()],coupons:[active({})],mainBanners:[active({})],boardPosts:[active({type:'event',start_at:'2026-09-01',end_at:'2026-09-30'})],mapBottomPanel:{getBoundingClientRect:()=>({top:500})},mapLocateBtn:{setAttribute:(k,v)=>attrs[k]=v},document:{getElementById:id=>id==='mapOrbit'?orbit:id==='mapOrbitItems'?items:id==='mapOrbitAnchor'?{setAttribute:(k,v)=>attrs[k]=v}:null,querySelectorAll:()=>[]}});
  ctx.renderMapOrbit();
  assert(items.innerHTML.indexOf('data-map-emphasis="promotion"')<items.innerHTML.indexOf('data-map-emphasis="coupon"'));
  assert(items.innerHTML.indexOf('data-map-emphasis="coupon"')<items.innerHTML.indexOf('data-map-emphasis="event"'));
  assert.equal(classes['has-active'],true);
  ctx.setMapOrbitOpen(true);assert.equal(items.inert,false);assert.equal(attrs['aria-expanded'],'true');
  ctx.setMapOrbitOpen(false);assert.equal(items.inert,true);
  const opacity=[];ctx.markers=[{mapBadgeKinds:['promotion'],setOpacity:v=>opacity[0]=v},{mapBadgeKinds:[],setOpacity:v=>opacity[1]=v}];
  vm.runInContext("mapOrbitSelection='promotion';applyMapOrbitEmphasis()",ctx);
  assert.deepEqual(opacity,[1,0.22]);assert.equal(ctx.markers.length,2);
  ctx.coupons=[];ctx.boardPosts=[];ctx.renderMapOrbit();
  assert(!items.innerHTML.includes('data-map-emphasis="coupon"'));assert(!items.innerHTML.includes('data-map-emphasis="event"'));
});


test('selection uses identical business IDs for counts, visible markers, fit bounds and actual list; toggle restores',()=>{
  const rows=Array.from({length:14},(_,i)=>biz(String(i)));
  const classes={add:()=>{},remove:()=>{}};
  const list={innerHTML:'',classList:classes};const bounds=[];
  const {ctx,recorded}=runtime({businesses:rows,mainBanners:[active({business_ids:['0','1','2','3'],business_id:'0'})],
    mapBottomList:list,mapBottomPanel:{classList:classes},mapBottomTitle:{parentElement:{classList:classes}},mapBusinessPreview:{classList:classes},
    mapBottomItemHTML:b=>`<button data-map-biz="${b.id}">${b.id}</button>`,
    map:{getZoom:()=>12,getBounds:()=>({contains:()=>false}),fitBounds:(b,p)=>bounds.push(b.ids),setZoom:()=>{}}});
  ctx.google.maps.LatLngBounds=class{constructor(){this.ids=[];}extend(p){this.ids.push(p);}};
  ctx.google.maps.event={addListenerOnce:()=>{}};
  ctx.selectMapOrbit('promotion');
  assert.equal(ctx.mapOrbitRows('promotion').length,4);assert.equal((list.innerHTML.match(/data-map-biz=/g)||[]).length,4);
  assert.equal(bounds[0].length,4);assert.equal(ctx.markers.length,14);
  assert.equal(recorded.clusters.length,0); // ten ordinary markers remain, plus four direct emphasized markers
  ctx.selectMapOrbit('promotion');assert.equal(ctx.markers.length,14);assert.equal(recorded.clusters.length,1);
});

test('GPS overlay follows projected coordinates on every draw, independently of map panel geometry',()=>{
  const {ctx}=runtime({currentLocationPosition:{lat:32.95,lng:-96.85}});
  ctx.google.maps.OverlayView=class{};ctx.google.maps.LatLng=class{constructor(lat,lng){Object.assign(this,{lat,lng});}};
  vm.runInContext(section('class MapOrbitOverlay extends','function ensureMapOrbitOverlay()')+';this.TestOverlay=MapOrbitOverlay;',ctx);
  const overlay=new ctx.TestOverlay();overlay.div={style:{}};
  let pixel={x:200,y:300};overlay.getProjection=()=>({fromLatLngToDivPixel:()=>pixel});
  overlay.draw();assert.equal(overlay.div.style.left,'177px');assert.equal(overlay.div.style.top,'251px');
  pixel={x:90,y:170};overlay.draw();assert.equal(overlay.div.style.left,'67px');assert.equal(overlay.div.style.top,'121px');
});

test('GPS recenter callback retains initialization-scope helpers and restores zoom12',()=>{
  const calls=[];
  const {ctx}=runtime({navigator:{geolocation:{getCurrentPosition:ok=>ok({coords:{latitude:32.95,longitude:-96.9}})}},
    persistRegion:()=>{},detectRegionFromCoords:()=> 'dallas',milesToZoom:()=>12,
    showCurrentLocationMarker:()=>calls.push('marker'),startCurrentLocationTracking:()=>calls.push('tracking'),setMapUiState:()=>calls.push('current'),
    setTimeout:fn=>fn(),map:{setCenter:()=>calls.push('center'),setZoom:z=>calls.push(z),getZoom:()=>12}});
  ctx.google.maps.event={addListenerOnce:(_m,_e,fn)=>fn()};
  vm.runInContext(section('mapReturnToLocation = () => {','const applyCenter = () => {')+';mapReturnToLocation();',ctx);
  assert(calls.includes('marker'));assert(calls.includes('tracking'));assert(calls.includes(12));assert(calls.includes('current'));
});
