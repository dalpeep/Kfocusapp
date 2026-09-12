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
  const ctx=vm.createContext({Date:FixedDate,Intl,console,google,document:{hidden:false,getElementById:()=>null,querySelectorAll:()=>[]},mapLocateBtn:null,currentLocationPosition:{lat:32.95,lng:-96.85},mapBottomList:null,currentRegion:'dallas',currentPage:'map',mapReady:true,
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
    +section('function v293DistanceOrigin(){','// V294:')
    +section('function v296NearbyBusinesses(){','function v296RenderNearby(){')
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
test('benefit businesses retain their links while map markers use the standard icon',()=>{
  const {ctx}=runtime({coupons:[active({})],mainBanners:[active({})],boardPosts:[active({type:'notice',subtype:'event',start_at:'2026-09-01',end_at:'2026-09-30'})]});
  assert.equal(ctx.mapBusinessBadgeKinds(biz()).length,3);
  assert.match(ctx.getMarkerIconForBusiness(biz()),/red-dot.png$/);
  assert.equal(ctx.getMarkerIconForBusiness(biz()),ctx.getMarkerIconForBusiness(biz('normal')));
});

test('redraw preserves clustering, GPS radius list and markers, click preview and filters',()=>{
  const rows=Array.from({length:14},(_,i)=>biz(String(i)));rows[13].lat=33.95;
  const {ctx,recorded}=runtime({businesses:rows,mainBanners:[active({business_id:'0'})],coupons:[active({business_id:'1',business_ids:['1','2']})],boardPosts:[active({business_id:'3',type:'notice',subtype:'event',start_at:'2026-09-01',end_at:'2026-09-30'})]});
  ctx.redrawMapMarkers();assert.equal(recorded.clusters.length,1);assert.equal(ctx.markers.length,13);assert.equal(recorded.nearby.length,13);
  assert.equal(ctx.window.__mapAllFilteredRows.length,13);
  ctx.markers[0].events.click();assert.equal(recorded.preview.id,'0');
  ctx.mapMode='coupon';assert.equal(ctx.getFilteredMapBusinesses().length,2);
  ctx.mapMode='event';assert.equal(ctx.getFilteredMapBusinesses().length,1);
  ctx.mapMode='business';ctx.mapCategory='병원';assert.equal(ctx.getFilteredMapBusinesses().length,0);
  ctx.mapCategory='';ctx.mapSearchQuery='13';assert.deepEqual(plain(ctx.getFilteredMapBusinesses().map(x=>x.id)),['13']);
});
test('map-only refresh detects newly active rows outside a filtered marker set',()=>{
  const {ctx,recorded}=runtime({businesses:[biz('a'),biz('b')],coupons:[active({})],mapMode:'coupon'});
  ctx.redrawMapMarkers();assert.equal(ctx.markers.length,1);
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

test('map retains business, coupon and event selectors without total-count UI',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  assert.equal((html.match(/data-map-filter=/g)||[]).length,3);
  assert(html.includes('data-map-filter="event"'));
  assert(html.includes('data-map-filter="promotion"'));
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

test('category counters deduplicate shared benefit records, group business cards and combine kinds',()=>{
  const {ctx}=runtime({businesses:[biz('a'),biz('b'),{...biz('c'),category:'종교'}],
    mainBanners:[active({id:'shared',title:'Shared promotion 20% off',business_ids:['a','b','c']})],
    coupons:[active({id:'coupon-1'}),active({id:'coupon-2'})],
    boardPosts:[active({id:'event-1',type:'notice',subtype:'event',start_at:'2026-09-01',end_at:'2026-09-30'})]});
  const groups=ctx.mapCategoryBenefits();
  assert.equal(groups['식당'].records.size,4);assert.equal(groups['식당'].businesses.size,2);
  assert.equal(groups['식당'].businesses.get('a').benefits.size,4);assert.equal(ctx.mapBenefitTone(groups['식당']),'mixed');
  assert.equal(groups['종교'].records.size,1);assert.equal(ctx.mapBenefitTone(groups['종교']),'promotion');
  assert.equal(groups['병원'].records.size,0);
});

test('benefit counts exclude expired, unlinked, nonpublic and undated event rows',()=>{
  const {ctx}=runtime({businesses:[biz(),{...biz('hidden'),list_visible:false}],
    mainBanners:[active({id:'expired',end_at:'2026-09-09'}),active({id:'unlinked',business_id:null}),active({id:'hidden',business_id:'hidden'})],
    boardPosts:[active({id:'undated',type:'notice',subtype:'event'})],
    coupons:[active({id:'live',start_at:'2026-09-10',end_at:'2026-09-10'})]});
  const group=ctx.mapCategoryBenefits()['식당'];assert.equal(group.records.size,1);assert.equal(ctx.mapBenefitTone(group),'coupon');
});

test('removed radial UI cannot intercept category benefit clicks',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  assert(!/mapOrbit|map-orbit/.test(source+html));
  assert(html.includes('id="mapBenefitsDialog"'));
});

test('category totals include all public businesses independently of GPS, category and search',()=>{
  const categoryRow={innerHTML:'',classList:{toggle(){},remove(){}}};
  const {ctx}=runtime({businesses:[{...biz('near'),category:'종교'}, {...biz('far'),category:'종교',lat:33.5}, {...biz('no-coordinates'),category:'종교',lat:null},biz('other')],mapCategoryRow:categoryRow,esc:String});
  vm.runInContext(section('function renderMapCategorySummary(','function updateMapFilterAvailability('),ctx);
  for(const state of [{mapRadius:'7',mapCategory:'',mapSearchQuery:''},{mapRadius:'10',mapCategory:'종교',mapSearchQuery:''},{mapRadius:'3',mapCategory:'종교',mapSearchQuery:'near'}]){
    Object.assign(ctx,state);ctx.renderMapCategorySummary([]);
    assert.match(categoryRow.innerHTML,/종교 3/);
    assert.match(categoryRow.innerHTML,/식당 1/);
  }
});
test('GPS-only nearby set stays fixed on pan/zoom and disappears without location',()=>{
  const {ctx}=runtime({businesses:[biz('near'),{...biz('far'),lat:33.95}]});
  ctx.currentCenter={lat:33.95,lng:-96.85};ctx.mapRadius='all';ctx.redrawMapMarkers();
  assert.deepEqual(plain(ctx.window.__mapAllFilteredRows.map(b=>b.id)),['near']);
  assert.equal(ctx.mapRadius,'7');
  ctx.currentLocationPosition=null;ctx.redrawMapMarkers();assert.equal(ctx.markers.length,0);
});

test('V296.2 menus deduplicate businesses, separate kinds and sort by GPS',()=>{
  const {ctx}=runtime({businesses:[biz('a'),{...biz('b'),lat:32.96}, {...biz('hidden'),list_visible:false}],
    coupons:[active({id:'c1',business_ids:['a','b','hidden'],discount_label:'20% OFF'}),active({id:'c2'})],
    mainBanners:[active({id:'discount',title:'Promotion 20% OFF'})],
    boardPosts:[active({id:'event',type:'event',start_at:'2026-09-01',end_at:'2026-09-30'})]});
  assert.deepEqual(plain(ctx.mapBenefitBusinesses('coupon').map(x=>x.business.id)),['a','b']);
  assert.equal(ctx.mapBenefitBusinesses('event').length,1);
  assert.equal(ctx.mapBenefitBusinesses('promotion').length,1);
  assert.equal(ctx.mapBenefitBusinesses('coupon')[0].benefits.get('coupons:c1').benefit,'20% OFF');
  ctx.mapCategory='종교';ctx.mapSearchQuery='no match';ctx.currentCenter={lat:0,lng:0};
  assert.equal(ctx.mapBenefitBusinesses('coupon').length,2);
});
test('V296.2 category badges are removed and category recenter uses GPS',()=>{
  const summary=section('function renderMapCategorySummary(','function updateMapFilterAvailability(');
  assert(!summary.includes('data-map-benefits'));
  const handler=section("  mapCategoryRow?.addEventListener('click', e=>{",'setMapAreaButtonState();');
  assert(handler.includes('map.setCenter(origin)'));assert(!handler.includes('fitMapToCurrentResultRows'));
});
test('V296.2 benefit selection preserves radius pins and opens existing preview',()=>{
  const calls=[];
  const {ctx}=runtime({businesses:[biz('a'),{...biz('far'),lat:33.95}],mainBanners:[active({id:'remote',business_id:'far',title:'Save $25'})],
    mapSearchInput:{value:'query'},document:{getElementById:()=>({close:()=>calls.push('close')})},
    map:{getZoom:()=>12,setZoom:z=>calls.push(z)},panMapAboveBottomPanel:()=>calls.push('pan'),showMapBusinessPreview:b=>calls.push(b.id)});
  vm.runInContext("mapBenefitsCategory='promotion';",ctx);
  ctx.selectMapBenefitBusiness('far');
  assert.equal(ctx.markers.length,1);assert.equal(ctx.markers[0].options.position.lat,32.95);
  assert.deepEqual(calls,['close',14,'far','pan']);
});

test('V296.4 promotion flags, gifts and general campaigns are events, not discounts',()=>{
  const {ctx}=runtime();
  for(const row of [{title:'기도의 숲 프로젝트'},{title:'S4 구매 시 75” TV 증정!',description:'한정 이벤트!'},
    {promo_enabled:true,paid_active:true,promo_text:'무료 등록 이벤트'}, {category:'promotion',title:'프로모션'},
    {discount_percent:0},{discount_amount:-5},{title:'0% 할인'}])assert.equal(ctx.mapPromotionBenefitKind(row),'event');
  for(const row of [{title:'20% OFF'},{promo_text:'10% 할인'},{description:'$25 off'},
    {discount_percent:15},{discount_amount:10},{discount_type:'percent',discount_value:20}])assert.equal(ctx.mapPromotionBenefitKind(row),'promotion');
});
test('V296.4 live banner snapshot yields four distinct event businesses from two records',()=>{
  const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/map-v2964-benefits.json'),'utf8'));
  const {ctx}=runtime({businesses:fixture.businesses,mainBanners:fixture.banners});
  assert.equal(ctx.mapBenefitBusinesses('event').length,4);
  assert.equal(ctx.mapBenefitBusinesses('coupon').length,0);
  assert.equal(ctx.mapBenefitBusinesses('promotion').length,0);
  assert.equal(ctx.mapActiveBenefitRecords().length,2);
  ctx.mainBanners[0].is_active=false;assert.equal(ctx.mapBenefitBusinesses('event').length,3);
  ctx.mainBanners[1].title='20% OFF';assert.equal(ctx.mapBenefitBusinesses('event').length,0);assert.equal(ctx.mapBenefitBusinesses('promotion').length,3);
});
