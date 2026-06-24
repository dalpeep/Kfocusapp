
const FALLBACK_BUSINESSES = [
  { id:'hmart', name:'H Mart Aurora', category:'마트', address:'2751 S Parker Rd, Aurora, CO', phone:'303-745-4592', image:'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1200&q=80', featured:true, featured_rank:1, is_new:true, new_rank:1, is_popular:true, popular_rank:1, coupon:true, video:true, desc:'콜로라도 대표 마트형 업소 예시입니다.', website:'https://www.hmart.com', email:'info@hmart.com', lat:39.6662, lng:-104.8315, created_at:'2026-03-10', region:'colorado', promo_enabled:true, promo_text:'오늘의 특별 할인!' },
  { id:'seoul', name:'Seoul BBQ Denver', category:'한식 BBQ', address:'2080 S Havana St, Aurora, CO', phone:'303-337-2000', image:'https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=1200&q=80', coupon:true, is_new:true, new_rank:2, desc:'점심 특선과 저녁 바비큐 메뉴를 홍보하는 업소 예시입니다.', email:'hello@seoulbbq.example', lat:39.6792, lng:-104.8658, created_at:'2026-03-09', region:'colorado' },
  { id:'beauty', name:'Beauty Town', category:'미용', address:'1234 Havana St, Aurora, CO', phone:'303-555-1234', image:'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?auto=format&fit=crop&w=1200&q=80', featured:true, featured_rank:2, desc:'뷰티 업소 예시입니다.', lat:39.671, lng:-104.86, created_at:'2026-03-08', region:'colorado' },
  { id:'manna', name:'Manna BBQ', category:'한식', address:'8100 E Arapahoe Rd, Greenwood Village, CO', phone:'303-790-9292', image:'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80', is_popular:true, popular_rank:2, desc:'인기 업소 예시입니다.', lat:39.595, lng:-104.897, created_at:'2026-03-07', region:'colorado' },
  { id:'ace', name:'Ace Mart', category:'마켓', address:'1111 S Federal Blvd, Denver, CO', phone:'303-555-9876', image:'https://images.unsplash.com/photo-1604719312566-8912e9c8a213?auto=format&fit=crop&w=1200&q=80', coupon:true, is_popular:true, popular_rank:3, desc:'쿠폰 노출 업소 예시입니다.', lat:39.695, lng:-105.027, created_at:'2026-03-06', region:'colorado' },
  { id:'wonder', name:'Wonder Bakery', category:'베이커리', address:'555 Bakery St, Aurora, CO', phone:'303-555-2222', image:'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=1200&q=80', coupon:true, desc:'오늘 쿠폰 시안용 업소입니다.', lat:39.68, lng:-104.84, created_at:'2026-03-05', region:'colorado' }
];
let businesses = [...FALLBACK_BUSINESSES];
let homeBusinessTab = 'featured';
let coupons = [];
let couponViewTab = 'today';
let selectedCouponId = null;
let couponUseTimer = null;
let currentPage = 'home';
let lastBasePage = 'home';
let selectedBizId = businesses[0]?.id || null;
let currentUser = null;
let authClient = null;
let slideIndex = 0; let autoTimer = null; let map = null; let mapReady = false; let markers = []; let markerCluster = null; let markerClusterReady = false; let selectedCategory = '전체'; let heroSlides = []; let currentCenter = null; let mapMode = 'business'; let mapRadius = '7'; let mapCategory = ''; let eventPins = []; let mapDirty = false; 
const COLORADO_CENTER = { lat: 39.6662, lng: -104.8315 };
const DALLAS_CENTER = { lat: 32.7767, lng: -96.7970 };
const REGION_CENTER_MAP = { colorado: COLORADO_CENTER, dallas: DALLAS_CENTER, dfw: DALLAS_CENTER };
const TEST_FORCE_CENTER = false;

function getForcedRegionByHost(){
  const host = String(window.location.hostname || '').toLowerCase();

  if(host.includes('kfocus.app')) return 'colorado';

  if(
    host.includes('ktownad') ||
    host.includes('daltownmap.com') ||
    host.includes('www.daltownmap.com')
  ) {
    return 'dallas';
  }

  return '';
}

let currentRegion = getForcedRegionByHost() || 'dallas';
localStorage.setItem('region', currentRegion);
let suppressCardClickUntil = 0;
let boardPosts = [];
let slideRows = [];
let currentDetailVideoOverride = '';
let businessQuickFilter = '';
let selectedBoardType = 'notice';
let selectedBoardPost = null;
let adminSession = false;
const ADMIN_EMAIL = 'admin@kfocusapp.com';
let mapSearchQuery = '';
let searchDebounce = null;
const RECENT_SEARCH_KEY = 'kfocus_recent_searches';
const FALLBACK_BOARD_POSTS = [
  { id:'notice-1', type:'notice', title:'덴버 한인회 행사 안내', content:'콜로라도 지역 행사와 공지 예시입니다.' },
  { id:'job-1', type:'job', title:'구인구직 안내', content:'지역 업소 채용 정보 예시입니다.' },
  { id:'rent-1', type:'rent', title:'렌트 정보 모음', content:'하우징/렌트 관련 예시 글입니다.' },
  { id:'sale-1', type:'sale', title:'중고/매매 게시판', content:'생활 매매 정보 예시 글입니다.' }
];

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const heroViewport = $('#heroViewport');
const heroTrack = $('#heroTrack');
const heroDotsWrap = $('#heroDots');
const homeBoardList = $('#homeBoardList');
const homeNearbyList = $('#homeNearbyList');
const homeFeaturedList = $('#homeFeaturedList');
const homeNewList = $('#homeNewList');
const homePopularList = $('#homePopularList');
const homeBoardMoreBtn = $('#homeBoardMoreBtn');
const communityTabs = $('#communityTabs');
const businessList = $('#businessList');
const couponTodayList = $('#couponTodayList');
const couponAllList = $('#couponAllList');
const couponDetailCard = $('#couponDetailCard');
const couponUseCard = $('#couponUseCard');
const detailCard = $('#detailCard');
const businessSearch = $('#businessSearch');
const categoryRow = $('#categoryRow');
const mapNotice = $('#mapNotice');
const boardTitle = $('#boardTitle');
const mapRadiusRow = $('#mapRadiusRow');
const mapFilterRow = $('#mapFilterRow');
const mapCategoryRow = $('#mapCategoryRow');
const mapSearchAreaBtn = $('#mapSearchAreaBtn');
const mapLocateBtn = $('#mapLocateBtn');
const mapBottomPanel = $('#mapBottomPanel');
const mapBottomList = $('#mapBottomList');
const mapBottomClose = $('#mapBottomClose');
const searchOverlay = $('#searchOverlay');
const globalSearchInput = $('#globalSearchInput');
const searchCloseBtn = $('#searchCloseBtn');
const searchClearBtn = $('#searchClearBtn');
const recentSearches = $('#recentSearches');
const searchResults = $('#searchResults');
const searchBusinessSection = $('#searchBusinessSection');
const searchCouponSection = $('#searchCouponSection');
const searchBoardSection = $('#searchBoardSection');
const searchBusinessList = $('#searchBusinessList');
const searchCouponList = $('#searchCouponList');
const searchBoardList = $('#searchBoardList');
const searchEmpty = $('#searchEmpty');
const mapSearchInput = $('#mapSearchInput');

function getConfig(){ return window.KFOCUS_CONFIG || {}; }

function renderHomeBusinessTabs(){
  const box = document.getElementById('homeBusinessTabList');
  if(!box) return;

  $$('.home-business-tab').forEach(btn=>{
    btn.classList.toggle('active', btn.dataset.homeBizTab === homeBusinessTab);
  });

  let rows = [];

  if(homeBusinessTab === 'featured'){
    rows = businesses.filter(b => b.featured);
  } else if(homeBusinessTab === 'new'){
    rows = businesses.filter(b => b.is_new);
  } else if(homeBusinessTab === 'popular'){
    rows = businesses.filter(b => b.is_popular);
  }

  rows = sortBusinessesByDistance(rows)
    .slice()
    .sort((a,b)=>
      Number(a.featured_rank ?? a.new_rank ?? a.popular_rank ?? 1000)
      - Number(b.featured_rank ?? b.new_rank ?? b.popular_rank ?? 1000)
      ||
      String(b.created_at || '').localeCompare(String(a.created_at || ''))
    )
    .slice(0,3);

  box.innerHTML = rows.length
    ? rows.map(homeBusinessItemHTML).join('')
    : '<div class="board-empty">등록된 업소가 없습니다.</div>';

  bindBizOpenButtons();

  if(window.lucide){
    lucide.createIcons();
  }
}

function normalizeRegionKey(v=''){
  const s = String(v||'').trim().toLowerCase();
  if(s === 'dfw') return 'dallas';
  if(s === 'denver') return 'colorado';
  if(s.includes('dallas') || s.includes('fort worth')) return 'dallas';
  if(s.includes('colorado') || s.includes('denver')) return 'colorado';
  return s || 'dallas';
}

function getAdminMode() {
  const params = new URLSearchParams(window.location.search);
  return params.get('admin') === '1';
}

function getAdminRegionOverride() {
  const params = new URLSearchParams(window.location.search);
  const region = params.get('region');
  return region ? normalizeRegionKey(region) : '';
}
function getPreferredRegion() {
  const forced = getForcedRegionByHost();
  if(forced) return forced;
  if(getAdminMode() && getAdminRegionOverride()){
    return normalizeRegionKey(getAdminRegionOverride());
  }
  const saved = localStorage.getItem('region');
  return normalizeRegionKey(saved || 'dallas');
}

function persistRegion(region){
  const forced = getForcedRegionByHost();
  currentRegion = forced || normalizeRegionKey(region);
  localStorage.setItem('region', currentRegion);

  if (window.OneSignalDeferred) {
    OneSignalDeferred.push(async function (OneSignal) {
      await OneSignal.User.addTag("region", currentRegion);
    });
  }

  if(typeof updateTopRegionLabel === 'function') updateTopRegionLabel();
  if(typeof updateRegionPickerLabels === 'function') updateRegionPickerLabels();
  return currentRegion;
}

function getRegionCenter(region){
  return REGION_CENTER_MAP[normalizeRegionKey(region)] || DALLAS_CENTER;
}
function detectRegionFromCoords(lat, lng){
  const forced = getForcedRegionByHost();
  if(forced) return forced;
  const latNum = Number(lat);
  const lngNum = Number(lng);
  if(!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return currentRegion || 'dallas';
  if(latNum > 31 && latNum < 34.8 && lngNum > -98.8 && lngNum < -95.5) return 'dallas';
  if(latNum > 38 && latNum < 40.6 && lngNum > -106.2 && lngNum < -103.2) return 'colorado';
  return currentRegion || 'dallas';
}
function applyRegionDistanceCenter(region, force=false){
  currentRegion = normalizeRegionKey(region);
  const center = getRegionCenter(currentRegion);

  if(!currentCenter || !Number.isFinite(Number(currentCenter.lat)) || !Number.isFinite(Number(currentCenter.lng))){
    currentCenter = { lat: center.lat, lng: center.lng };
    return;
  }

  if(!force){
    const tooFarFromSelectedRegion =
      haversineMiles(
        Number(currentCenter.lat),
        Number(currentCenter.lng),
        center.lat,
        center.lng
      ) > 150;

    if(tooFarFromSelectedRegion){
      currentCenter = { lat: center.lat, lng: center.lng };
    }
  }
}

function getRegionLabel(region){
  const key = normalizeRegionKey(region);
  if(key === 'dallas') return 'DaltownMap';
  if(key === 'colorado') return 'Denver Metro';
  return region || '';
}

function updateTopRegionLabel(){
  const el = document.getElementById('topRegionLabel');
  const label = getRegionLabel(currentRegion) || 'DaltownMap';
  if(el) el.textContent = label;
  if(document && document.title){
  document.title = 'DaltownMap | Dallas Korean Business Directory';
  }
}

function hideRegionUi(){
  ['sideRegionPicker','sideCurrentRegionLabel','regionPickerModal'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.style.display = 'none';
  });
  document.querySelectorAll('[data-region]').forEach(el => {
    const wrap = el.closest('.menu-item, .region-item, .region-picker-item, li, button, div');
    if(wrap && wrap !== document.body) wrap.style.display = 'none';
    else el.style.display = 'none';
  });
}


async function detectInitialRegion(){
  const forced = getForcedRegionByHost();
  const adminRegion = getAdminRegionOverride();

  if(forced){
    currentRegion = forced;
    localStorage.setItem('region', currentRegion);
    currentCenter = getRegionCenter(currentRegion);
    applyRegionDistanceCenter(currentRegion, true);
    return currentRegion;
  }

  if(getAdminMode() && adminRegion){
    currentRegion = normalizeRegionKey(adminRegion);
    currentCenter = getRegionCenter(currentRegion);
    applyRegionDistanceCenter(currentRegion, true);
    return currentRegion;
  }

  const saved = localStorage.getItem('region');
  const selected = normalizeRegionKey(saved || 'dallas');

  currentRegion = selected;
  currentCenter = getRegionCenter(currentRegion);
  applyRegionDistanceCenter(currentRegion, true);
  return currentRegion;
}
async function refreshCurrentUser(){
  if(!supabase?.auth){
    currentUser = null;
    return null;
  }

  const { data, error } = await supabase.auth.getUser();

  if(error || !data?.user){
    currentUser = null;
    return null;
  }

  currentUser = data.user;
  return currentUser;
}

function requireLoginForBoard(){
  if(currentUser) return true;

  alert('게시글 작성은 로그인이 필요합니다.');
  openUserLoginModal();
  return false;
}
function openUserLoginModal(){
  const modal = document.getElementById('userLoginModal');
  if(!modal){
    alert('로그인 창 HTML을 찾을 수 없습니다.');
    return;
  }
  modal.classList.remove('hidden');
}
function getAuthClient(){
  if(authClient) return authClient;

  const { SUPABASE_URL, SUPABASE_ANON_KEY } = getConfig();

  if(!window.supabase?.createClient){
    console.error('[AUTH] Supabase JS library not loaded');
    return null;
  }

  authClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  );
console.log('window.supabase =', window.supabase);
console.log('authClient =', authClient);
console.log('authClient.auth =', authClient?.auth);
  return authClient;
}
function closeUserLoginModal(){
  document.getElementById('userLoginModal')?.classList.add('hidden');
}
async function loginWithEmail(email){
  if(!email) return alert('이메일을 입력해 주세요.');

  const client = getAuthClient();

  if(!client?.auth?.signInWithOtp){
    alert('로그인 기능이 아직 준비되지 않았습니다.');
    return;
  }

  const { error } = await client.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.origin
    }
  });

  if(error){
    alert(error.message);
    return;
  }

  alert('로그인 링크를 이메일로 보냈습니다.');
}

async function logoutUser(){
  await supabase.auth.signOut();
  currentUser = null;
  location.reload();
}
async function refreshCurrentUser(){
  const client = getAuthClient();

  if(!client?.auth){
    currentUser = null;
    return null;
  }

  const { data, error } = await client.auth.getUser();

  if(error || !data?.user){
    currentUser = null;
    return null;
  }

  currentUser = data.user;
  return currentUser;
}

function requireLoginForBoard(){
  if(currentUser) return true;

  alert('게시글 작성은 로그인이 필요합니다.');
  openUserLoginModal?.();
  return false;
}
function openUserLoginModal(){
  document.getElementById('userLoginModal')?.classList.remove('hidden');
}

function closeUserLoginModal(){
  document.getElementById('userLoginModal')?.classList.add('hidden');
}
function normalizeSearchText(v=''){ return String(v||'').toLowerCase().replace(//g,' ').trim(); }
function queryMatches(query, values){
  const q = normalizeSearchText(query);
  if(!q) return true;
  const hay = values.filter(Boolean).map(normalizeSearchText).join(' ');
  return q.split(/\s+/).every(part=>hay.includes(part));
}

function normalizeBoardType(v=''){
  const s = normalizeSearchText(v);
  if(['notice','event','events','행사','공지','공지/행사'].includes(s)) return 'notice';
  if(['job','jobs','구인','구직','구인구직','구인/구직'].includes(s)) return 'job';
  if(['rent','rental','렌트','임대','하우징'].includes(s)) return 'rent';
  if(['sale','market','매매','중고','판매'].includes(s)) return 'sale';
  return 'notice';
}
function boardLabel(type){
  return ({ notice:'행사안내', job:'구인/구직', rent:'렌트', sale:'매매' })[type] || '행사안내';
}
function boardThumbEmoji(type){
  return ({ notice:'🎉', job:'💼', rent:'🏘️', sale:'🏠' })[type] || '📝';
}
function boardPostsByType(type){
  return boardPosts.filter(p=>normalizeBoardType(p.type)===type && (adminSession || !p.region || normalizeRegionKey(p.region)===currentRegion));
}
function getRecentSearches(){ try { const v = JSON.parse(localStorage.getItem(RECENT_SEARCH_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } }
function saveRecentSearch(query){
  const q = String(query||'').trim();
  if(!q) return;
  const next = [q, ...getRecentSearches().filter(v=>normalizeSearchText(v)!==normalizeSearchText(q))].slice(0,5);
  localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(next));
}
function renderRecentSearches(){
  if(!recentSearches) return;
  const items = getRecentSearches();
  recentSearches.innerHTML = items.length ? `<div class="recent-title">최근 검색</div><div class="recent-chip-row">${items.map(v=>`<button class="recent-chip" data-recent-search="${esc(v)}">${esc(v)}</button>`).join('')}</div>` : '<div class="recent-title">최근 검색이 없습니다.</div>';
}
async function loadBoardPostsFromSupabase(){
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = getConfig();
  boardPosts = [...FALLBACK_BOARD_POSTS];
  if(!SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
  const tryTables = ['posts','board_posts'];
  const selects = [
    'id,business_id,title,content,type,region,image_url,address,phone,start_at,end_at,created_at',
    'id,business_id,title,content,type,region,image_url,start_at,end_at,created_at',
    'id,business_id,title,content,type,region,created_at'
  ];
  for(const table of tryTables){
    for(const select of selects){
      try {
        const url = `${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}&order=created_at.desc.nullslast&limit=50`;
        const res = await fetch(url,{ headers:{ apikey:SUPABASE_ANON_KEY, Authorization:`Bearer ${SUPABASE_ANON_KEY}` } });
        if(!res.ok) continue;
        const rows = await res.json();
        if(Array.isArray(rows)){
          boardPosts = rows.map((row, idx)=>({
            id: row.id || `${table}-${idx+1}`,
            type: normalizeBoardType(row.type),
            title: row.title || '게시판',
            content: row.content || '',
            region: row.region || 'colorado',
            image_url: row.image_url || '',
            address: row.address || '',
            phone: row.phone || '',
            business_id: row.business_id || '',
            start_at: row.start_at || '',
            end_at: row.end_at || '',
            created_at: row.created_at || ''
          }));
          return true;
        }
      } catch(e){}
    }
  }
  return false;
}
function businessSearchResults(query){
  const q = normalizeSearchText(query);
  if(!q) return [];
  return businesses.filter(b => queryMatches(q, [b.name, b.name_en, b.category, b.category_main, b.category_sub, b.address, b.region, getMainCategoryLabel(b.category)])).slice(0,8);
}
function couponSearchResults(query){
  const q = normalizeSearchText(query);
  if(!q) return [];
  return activeCoupons(coupons).filter(c => {
    const biz = getBiz(c.businessId) || {};
    return queryMatches(q, [c.title, c.description, c.couponCode, biz.name, biz.category]);
  }).slice(0,8);
}
function boardSearchResults(query){
  const q = normalizeSearchText(query);
  if(!q) return [];
  return boardPosts.filter(p => (adminSession || !p.region || normalizeRegionKey(p.region)===currentRegion) && queryMatches(q, [p.title, p.content, p.type])).slice(0,8);
}
function openSearchOverlay(prefill=''){
  if(!searchOverlay) return;
  closeSideMenu();
  searchOverlay.classList.add('open');
  searchOverlay.setAttribute('aria-hidden','false');
  if(globalSearchInput){
    if(prefill) globalSearchInput.value = prefill;
    globalSearchInput.focus();
    globalSearchInput.select();
  }
  if((globalSearchInput?.value || '').trim()) renderSearchResults(globalSearchInput.value.trim());
  else { renderRecentSearches(); recentSearches?.classList.remove('hidden'); searchResults?.classList.add('hidden'); searchClearBtn?.classList.add('hidden'); }
}
function closeSearchOverlay(){
  if(!searchOverlay) return;
  searchOverlay.classList.remove('open');
  searchOverlay.setAttribute('aria-hidden','true');
}
function renderSearchResults(query){
  const q = String(query||'').trim();
  if(searchClearBtn) searchClearBtn.classList.toggle('hidden', !q);
  if(!q){
    renderRecentSearches();
    recentSearches?.classList.remove('hidden');
    searchResults?.classList.add('hidden');
    return;
  }
  recentSearches?.classList.add('hidden');
  searchResults?.classList.remove('hidden');
  const biz = businessSearchResults(q);
  const cpn = couponSearchResults(q);
  const brd = boardSearchResults(q);
  if(searchBusinessList) searchBusinessList.innerHTML = biz.map(b=>`<button class="search-result-item" data-search-type="business" data-biz="${esc(b.id)}"><strong>${esc(b.name)}</strong><span>${esc(getMainCategoryLabel(b.category))} · ${esc(b.address || b.region || '')}</span></button>`).join('');
  if(searchCouponList) searchCouponList.innerHTML = cpn.map(c=>{ const biz=getBiz(c.businessId) || {}; return `<button class="search-result-item" data-search-type="coupon" data-coupon="${esc(c.id)}"><strong>${esc(c.title)}</strong><span>${esc(biz.name || '')}${biz.name?' · ':''}${esc(countdownLabel(c.endAt,true))}</span></button>`; }).join('');
  if(searchBoardList) searchBoardList.innerHTML = brd.map(p=>`<button class="search-result-item" data-search-type="board" data-board-result="${esc(p.type)}" data-board-title="${esc(p.title)}"><strong>${esc(p.title)}</strong><span>${esc(p.content || p.type || '')}</span></button>`).join('');
  searchBusinessSection?.classList.toggle('hidden', !biz.length);
  searchCouponSection?.classList.toggle('hidden', !cpn.length);
  searchBoardSection?.classList.toggle('hidden', !brd.length);
  searchEmpty?.classList.toggle('hidden', !!(biz.length || cpn.length || brd.length));
}
function parseArr(v){ if(Array.isArray(v)) return v; try { const p = JSON.parse(v||'[]'); return Array.isArray(p)?p:[]; } catch { return []; } }
function esc(s=''){ return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m])); }
function normalizeUrl(u=''){ const s = String(u||'').trim(); if(!s) return ''; return /^https?:\/\//i.test(s) ? s : `https://${s}`; }

async function logBusinessActivity(businessId, actionType){
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = getConfig();
  if(!SUPABASE_URL || !SUPABASE_ANON_KEY || !businessId || !actionType) return;
  const biz = getBiz(businessId);
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/business_activity`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json', apikey:SUPABASE_ANON_KEY, Authorization:`Bearer ${SUPABASE_ANON_KEY}`, Prefer:'return=minimal' },
      body: JSON.stringify({ business_id: businessId, action_type: actionType, region: biz?.region || 'colorado', area: biz?.address || '' })
    });
  } catch(e){ console.warn('activity log skipped', e); }
}
function milesToZoom(m){ if(m==='3') return 15; if(m==='5') return 13; if(m==='7') return 12; if(m==='10') return 11; return 10; }
function radiusByZoom(z){ if(z <= 10) return '10'; if(z <= 12) return '7'; if(z <= 14) return '5'; return '3'; }
function activeMapCoupons(){ return activeCoupons(coupons); }
function getMainCategoryLabel(cat=''){
  const s = String(cat || '').toLowerCase();

  if (/식당|restaurant|bbq|치킨|분식|한식|중식|일식|카페|bakery|베이커리|cafe|coffee|디저트|dessert/.test(s)) return '식당';
  if (/쇼핑|마트|마켓|잡화|수산|의류|전자|gift|liquor|주류|wine|beer|spirits|store|market|shopping/.test(s)) return '쇼핑';
  if (/병원|치과|한의원|약국|의원|clinic|medical|doctor|dental|pharmacy/.test(s)) return '병원';
  if (/금융|은행|보험|회계|세무|finance|financial|mortgage|loan|bank|investment|accounting|tax/.test(s)) return '금융';
  if (/법률|변호사|법무|이민|교통사고|가정법|law|lawyer|attorney|legal|immigration/.test(s)) return '법률';
  if (/교회|성당|church|catholic|mission|선교/.test(s)) return '교회';
  if (/부동산|리얼터|렌트|매매|realtor|real estate|lease|rental|property/.test(s)) return '부동산';
  if (/자동차|정비|카센터|오토|auto|repair|body shop|mechanic|tire/.test(s)) return '서비스';

  return '서비스';
}
function renderMapFilters(){
  $$('.map-filter-chip').forEach(btn=>btn.classList.toggle('active', btn.dataset.mapFilter===mapMode));
  const categories = ['식당','쇼핑','병원','금융','법률','교회','서비스','부동산'];
  if(mapCategoryRow){
    mapCategoryRow.innerHTML = categories.map(c=>`<button class="map-category-chip ${c===mapCategory?'active':''}" data-map-cat="${esc(c)}">${esc(c)}</button>`).join('');
    mapCategoryRow.classList.toggle('hidden', mapMode!=='business');
  }
}

async function loadRealData(){
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = getConfig();
  if(!SUPABASE_URL || !SUPABASE_ANON_KEY) { finalizeData(); return; }

  try {
    const select = 'id,name_ko,name_en,name,category_ko,category,address,phone,website,email,image_url,image_urls,gallery_urls,description,hours,parking,reservation,languages,insurance,video_url,youtube_url,lat,lng,is_featured,featured_rank,is_new,new_rank,is_popular,popular_rank,promo_enabled,home_fixed,home_fixed_sort,promo_image_url,promo_text,order_url,delivery_url,reservation_url,created_at,region,is_active';

    const url = `${SUPABASE_URL}/rest/v1/businesses?select=${encodeURIComponent(select)}&region=eq.${encodeURIComponent(currentRegion)}&is_active=eq.true&order=created_at.desc.nullslast`;

    const res = await fetch(url,{
      headers:{
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`
      }
    });

    if(!res.ok) throw new Error(`Supabase ${res.status}`);

    const rows = await res.json();

    if (Array.isArray(rows) && rows.length) {
const mapped = rows.map((row) => {
  const images = parseArr(row.image_urls);
  const image = row.image_url || images[0] || 'assets/kfocus-icon.png';

  return {
    id: row.id,
    name: row.name_ko || row.name_en || row.name || '이름 없음',
    category: row.category_ko || row.category || '기타',
    address: row.address || '',
    phone: row.phone || '',
    image,
    gallery_urls: parseArr(row.gallery_urls),
    website: row.website || '',
    email: row.email || '',
    order_url: row.order_url || '',
    delivery_url: row.delivery_url || '',
    reservation_url: row.reservation_url || '',
    video_url: row.video_url || '',
    youtube_url: row.youtube_url || '',
    desc: row.description || '',
	hours: row.hours || '',
    parking: row.parking || '',
    reservation: row.reservation || '',
    languages: row.languages || '',
    insurance: row.insurance || '',
    lat: row.lat == null ? null : Number(row.lat),
    lng: row.lng == null ? null : Number(row.lng),
    featured: !!row.is_featured,
    featured_rank: row.featured_rank == null ? 1000 : Number(row.featured_rank),
    is_new: !!row.is_new,
    new_rank: row.new_rank == null ? 1000 : Number(row.new_rank),
    is_popular: !!row.is_popular,
    popular_rank: row.popular_rank == null ? 1000 : Number(row.popular_rank),
  };
});


// 👇 여기 추가!!!
const seen = new Set();
businesses = mapped.filter((b) => {
  const nameKey = (b.name || '').trim().toLowerCase();
  const addrKey = (b.address || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/suite|ste\.?|unit|#\s*/g, '');
  const latKey = b.lat == null ? '' : Number(b.lat).toFixed(4);
  const lngKey = b.lng == null ? '' : Number(b.lng).toFixed(4);

  const key = [nameKey, addrKey, latKey, lngKey].join('|');

  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

      selectedBizId = businesses[0]?.id || selectedBizId;
    }
  } catch(e){
    console.warn('Using fallback data', e);
  }

  await loadCouponsFromSupabase();
  await loadBoardPostsFromSupabase();
  await loadSlidesFromSupabase();
  await loadBannersFromSupabase();
  finalizeData();
}



async function loadSlidesFromSupabase(){
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = getConfig();
  slideRows = [];
  if(!SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
  try {
    const select = 'id,business_id,region,promo_enabled,home_fixed,home_fixed_sort,promo_text,promo_image_url,promo_start_at,promo_end_at,video_url,created_at';
    const url = `${SUPABASE_URL}/rest/v1/slides?select=${encodeURIComponent(select)}&or=(region.eq.${encodeURIComponent(currentRegion)},region.is.null)&order=home_fixed_sort.asc.nullslast,created_at.desc.nullslast`;
    const res = await fetch(url,{ headers:{ apikey:SUPABASE_ANON_KEY, Authorization:`Bearer ${SUPABASE_ANON_KEY}` } });
    if(!res.ok) throw new Error(`Slides ${res.status}`);
    const rows = await res.json();
    slideRows = Array.isArray(rows) ? rows : [];
    return true;
  } catch(e){
    console.warn('Using business promo fallback', e);
    slideRows = [];
    return false;
  }
}
async function loadCouponsFromSupabase(){
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = getConfig();
  if(!SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
  try {
    const select = 'id,business_id,title,description,coupon_code,image_url,discount_label,start_at,end_at,is_active,is_today_coupon,sort_order,created_at';
    const url = `${SUPABASE_URL}/rest/v1/coupons?select=${encodeURIComponent(select)}&is_active=eq.true&order=sort_order.asc.nullslast,end_at.asc.nullslast,created_at.desc.nullslast`;
    const res = await fetch(url,{ headers:{ apikey:SUPABASE_ANON_KEY, Authorization:`Bearer ${SUPABASE_ANON_KEY}` } });
    if(!res.ok) throw new Error(`Coupons ${res.status}`);
    const rows = await res.json();
    const bizIds = new Set(businesses.map(b=>String(b.id)));
    coupons = (Array.isArray(rows)?rows:[]).filter(r=>bizIds.has(String(r.business_id))).map((row, idx)=>({
      id: row.id || `cp${idx+1}`,
      businessId: row.business_id,
      title: row.title || '쿠폰',
      description: row.description || '',
      couponCode: row.coupon_code || '',
      imageUrl: row.image_url || '',
	  discount_label: row.discount_label || '',
      startAt: row.start_at || '',
      endAt: row.end_at || '',
      isActive: row.is_active !== false,
      isToday: !!row.is_today_coupon,
      sortOrder: row.sort_order == null ? 1000 : Number(row.sort_order),
      createdAt: row.created_at || ''
    }));
    return true;
  } catch (e) {
    console.warn('Using fallback coupons', e);
    return false;
  }
}
async function loadBannersFromSupabase(){
  console.log('[BANNERS] load start', currentRegion);

  const { SUPABASE_URL, SUPABASE_ANON_KEY } = getConfig();
  mainBanners = [];

  console.log('[BANNERS] config', !!SUPABASE_URL, !!SUPABASE_ANON_KEY);

  if(!SUPABASE_URL || !SUPABASE_ANON_KEY) return false;

  try {
    const select = 'id,title,image_url,link_url,business_id,region,sort_order,is_active,created_at';
    const url = `${SUPABASE_URL}/rest/v1/banners?select=*&is_active=eq.true&order=sort_order.asc,created_at.desc`;

    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`
      }
    });

    if(!res.ok) throw new Error(`Banners ${res.status}`);

const rows = await res.json();

console.log('[BANNERS] rows', rows);

mainBanners = Array.isArray(rows) ? rows : [];
    return true;
  } catch(e) {
    console.warn('Banners load failed', e);
    mainBanners = [];
    return false;
  }
}
function buildFallbackCoupons(){
  const couponBusinesses = businesses.filter(b=>b.coupon).slice(0,6);
  coupons = couponBusinesses.map((b,i)=>({
    id:`cp${i+1}`,
    businessId:b.id,
    title: i===0?'20% OFF': i===1?'15% OFF':'특별 혜택',
    description: `${b.name} 매장에서 사용할 수 있는 샘플 쿠폰입니다.`,
    couponCode: i===0?'KFOCUS20':'',
    imageUrl: b.image,
    startAt:'2026-03-01T00:00:00Z',
    endAt:'2026-04-30T23:59:59Z',
    isActive:true,
    isToday:i<2,
    sortOrder:i+1,
    createdAt:`2026-03-0${i+1}`
  }));
}

function finalizeData(){
  businesses.sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
  if(!coupons.length) buildFallbackCoupons();
  buildHeroSlides();
}

function buildHeroSlides() {
  const bizMap = new Map((businesses || []).map((b) => [String(b.id), b]));
  const now = Date.now();

  const activeSlides = (slideRows || []).filter((s) => {
    if (!s) return false;

    const enabled = s.promo_enabled === true || s.promo_enabled === 1 || s.promo_enabled === 'true';
    if (!enabled) return false;

    const startTime = s.promo_start_at ? new Date(s.promo_start_at).getTime() : null;
    const endTime = s.promo_end_at ? new Date(s.promo_end_at).getTime() : null;

    const startOk = !startTime || (Number.isFinite(startTime) && startTime <= now);
    const endOk = !endTime || (Number.isFinite(endTime) && endTime >= now);

    return startOk && endOk;
  }).sort((a, b) =>
    (Number(a.home_fixed_sort ?? 1000) - Number(b.home_fixed_sort ?? 1000)) ||
    String(b.created_at || '').localeCompare(String(a.created_at || ''))
  );

  heroSlides = activeSlides.map((s) => {
    const b = bizMap.get(String(s.business_id)) || {};

return {
  type: s.video_url ? 'VIDEO' : (s.home_fixed ? 'BANNER' : 'DEAL'),

  title: s.promo_text || b.name || b.name_ko || b.name_en || 'Kfocus',

  desc:
    `${b.category} · ${getRegionLabel(b.region || currentRegion)}`,

  slideDesc:
    s.description || s.promo_text || '',

  button: '',

  bg:
    s.promo_image_url ||
    b.image_url ||
    b.image ||
    '',

  bizId: String(b.id || s.business_id || '')
};
  }).filter((s) => !!(s.bg || s.video_url));

  if (!heroSlides.length) {
    heroSlides = [
      {
        type: 'BANNER',
        title: '추천 업소',
        desc: '홈 상단 배너 영역입니다.',
        button: '',
        bg: 'https://images.unsplash.com/photo-1526318896980-cf78c088247c?auto=format&fit=crop&w=1600&q=80',
        bizId: '',
        video_url: ''
      }
    ];
  }

  console.log('buildHeroSlides result =', heroSlides);
}

function routeFor(page){
  const base = `${location.pathname}${location.search}`;
  return page === 'home' ? base : `${base}#${page}`;
}
function setRoute(page){ history.replaceState(null,'', routeFor(page)); }
function getRoute(){ return location.hash.replace('#','') || 'home'; }
function getPageOrder(){ return ['home','business','coupon','map','saved']; }
function getBiz(id){ return businesses.find(b=>String(b.id)===String(id)) || businesses[0]; }

function isVerticalVideo(url){
  const v = String(url || '').toLowerCase().trim();
  if(!v) return false;
  if(v.includes('instagram.com/reel/')) return true;
  if(v.includes('instagram.com/p/')) return true;
  if(v.includes('youtube.com/shorts/')) return true;
  if(v.includes('facebook.com/reel/')) return true;
  return false;
}

function getYouTubeEmbed(url){
  const v = String(url || '').trim();
  if(!v) return '';

  let m = v.match(/youtube\.com\/shorts\/([^?&/]+)/i);
  if(m) return `https://www.youtube.com/embed/${m[1]}`;

  m = v.match(/[?&]v=([^?&/]+)/i);
  if(m) return `https://www.youtube.com/embed/${m[1]}`;

  m = v.match(/youtu\.be\/([^?&/]+)/i);
  if(m) return `https://www.youtube.com/embed/${m[1]}`;

  return '';
}

function getYouTubeEmbedUrl(url){
  return getYouTubeEmbed(url);
}

function getFacebookEmbed(url){
  const v = String(url || '').trim();
  if(!/facebook\.com|fb\.watch/i.test(v)) return '';
  if(/facebook\.com\/stories\//i.test(v)) return '';
  return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(v)}&show_text=false`;
}

function getFacebookEmbedUrl(url){
  return getFacebookEmbed(url);
}

function getInstagramEmbed(url){
  const v = String(url || '').trim();
  if(!/instagram\.com/i.test(v)) return '';
  return `${v.replace(/\/?$/, '/') }embed/`;
}

function getInstagramEmbedUrl(url){
  return getInstagramEmbed(url);
}

function getSlideMediaHTML(slide){
  const videoUrl = String(slide?.video_url || '').trim();
  const bg = String(slide?.bg || '').trim();

  if(!videoUrl){
    return `<div class="hero-slide-bg" style="background-image:url('${esc(bg)}')"></div>`;
  }

  const verticalClass = isVerticalVideo(videoUrl) ? 'vertical' : 'horizontal';

  const yt = getYouTubeEmbed(videoUrl);
  if(yt){
    return `
      <div class="hero-media ${verticalClass}">
        <iframe
          src="${esc(yt)}"
          title="youtube video"
          loading="lazy"
          frameborder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowfullscreen>
        </iframe>
      </div>
    `;
  }

  const fb = getFacebookEmbed(videoUrl);
  if(fb){
    return `
      <div class="hero-media ${verticalClass}">
        <iframe
          src="${esc(fb)}"
          title="facebook video"
          loading="lazy"
          scrolling="no"
          frameborder="0"
          allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
          allowfullscreen>
        </iframe>
      </div>
    `;
  }

  const ig = getInstagramEmbed(videoUrl);
  if(ig){
    return `
      <div class="hero-media ${verticalClass}">
        <iframe
          src="${esc(ig)}"
          title="instagram video"
          loading="lazy"
          frameborder="0"
          allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
          allowfullscreen>
        </iframe>
      </div>
    `;
  }

  return `<div class="hero-slide-bg" style="background-image:url('${esc(bg)}')"></div>`;
}

function businessVideoHTML(b){
  if(!b) return '';

  const slide = (slideRows || []).find(s => String(s.business_id) === String(b.id));
const video =
  currentDetailVideoOverride ||
  slide?.video_url ||
  b.youtube_url ||
  b.video_url ||
  '';

  if(!video) return '';

  const yt = getYouTubeId(video);
  if(yt){
    const vertical = isVerticalVideo(video) ? 'vertical' : 'horizontal';

    return `
      <div class="detail-video ${vertical}">
        <iframe
          src="https://www.youtube.com/embed/${yt}?autoplay=1&mute=1&playsinline=1"
          title="${esc(b.name || '')} 영상"
          loading="lazy"
          frameborder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowfullscreen>
        </iframe>
      </div>
    `;
  }

  const videoUrl = normalizeUrl ? normalizeUrl(video) : video;
  if(videoUrl){
    return `
      <div class="detail-video">
        <video controls playsinline webkit-playsinline preload="metadata">
          <source src="${esc(videoUrl)}">
        </video>
      </div>
    `;
  }

  return '';
}

function badgeStackHTML(b, compact=true){
  const arr=[];
  if(b.video) arr.push(`<span class="badge purple${compact?' compact':''}">VIDEO</span>`);
  if(b.coupon) arr.push(`<span class="badge orange${compact?' compact':''}">COUPON</span>`);
  if(b.is_new) arr.push(`<span class="badge green${compact?' compact':''}">NEW</span>`);
  if(b.featured) arr.push(`<span class="badge blue${compact?' compact':''}">추천</span>`);
  if(b.is_popular) arr.push(`<span class="badge red${compact?' compact':''}">인기</span>`);
  return arr.join('');
}
function miniCardHTML(b){
  return `<button class="mini-card biz-open" data-biz="${esc(b.id)}"><div class="mini-image-wrap"><img class="mini-image" src="${esc(b.image)}" alt="${esc(b.name)}"><div class="mini-badge-stack">${badgeStackHTML(b,true)}</div></div><div class="mini-name">${esc(b.name)}</div></button>`;
}
function listCardHTML(b){
  return `<button class="list-card biz-open" data-biz="${esc(b.id)}"><img class="list-thumb" src="${esc(b.image)}" alt="${esc(b.name)}"><div class="list-main"><h4>${esc(b.name)}</h4><p>${esc(b.category)} · ${esc(getRegionLabel(b.region || currentRegion))}</p><p class="list-address">${esc(b.address)}</p></div><div class="list-side stack-badges">${badgeStackHTML(b,false)}</div></button>`;
}
function formatDateLabel(v){
  if(!v) return '';
  const d = new Date(v);
  if(Number.isNaN(d.getTime())) return String(v).slice(0,10);
  return `${d.getMonth()+1}/${d.getDate()}까지`;
}
function formatPeriod(start, end){
  const a = start ? formatDateLabel(start).replace('까지','') : '';
  const b = end ? formatDateLabel(end).replace('까지','') : '';
  return a && b ? `${a} ~ ${b}` : (b ? `${b}까지` : a);
}
function getCountdownParts(endAt){
  const end = new Date(endAt).getTime();
  if(!end || Number.isNaN(end)) return null;
  let diff = end - Date.now();
  if(diff < 0) diff = 0;
  const sec = Math.floor(diff / 1000);
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const secs = sec % 60;
  return { days, hours, mins, secs, total: sec };
}
function countdownLabel(endAt, short=false){
  const c = getCountdownParts(endAt);
  if(!c) return '';
  if(short){
    if(c.days > 0) return `⏰ ${c.days}일 ${c.hours}시간 남음`;
    return `⏰ ${String(c.hours).padStart(2,'0')}:${String(c.mins).padStart(2,'0')}:${String(c.secs).padStart(2,'0')}`;
  }
  if(c.days > 0) return `${c.days}일 ${c.hours}시간 ${c.mins}분`;
  return `${String(c.hours).padStart(2,'0')}:${String(c.mins).padStart(2,'0')}:${String(c.secs).padStart(2,'0')}`;
}
function activeCoupons(list=coupons){
  const now = Date.now();
  return list.filter(c=>{
    if(c.isActive === false) return false;
    const startOk = !c.startAt || new Date(c.startAt).getTime() <= now;
    const endOk = !c.endAt || new Date(c.endAt).getTime() >= now;
    return startOk && endOk;
  }).sort((a,b)=> (a.sortOrder||1000)-(b.sortOrder||1000) || (new Date(a.endAt||'2999-01-01') - new Date(b.endAt||'2999-01-01')) || String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
}
function todayCoupons(){
  return activeCoupons(coupons).filter(c=>c.isToday);
}
function getCoupon(id){ return coupons.find(c=>String(c.id)===String(id)) || null; }
function couponCardHTML(c, mode='all'){
  const b = getBiz(c.businessId || c.business_id) || {};
  const img = c.image_url || c.image || b.image || b.image_url || '/assets/kfocus-icon.png';
  const title = c.title || '쿠폰';
  const bizName = b.name || b.name_ko || b.name_en || '';
  const expire = c.end_at || c.expires_at || c.expire_date || c.endDate || '';
  const badge = c.discount_label || c.badge || c.type_label || 'DEAL';

  return `
    <article class="coupon-card coupon-card-v2 coupon-open" data-coupon="${esc(c.id)}">
      <div class="coupon-v2-thumb">
        <img src="${esc(img)}" alt="${esc(title)}">
      </div>

      <div class="coupon-v2-main">
        <strong>${esc(title)}</strong>
        <span class="coupon-v2-biz">${esc(bizName)}</span>
        <span class="coupon-v2-exp">${expire ? 'Exp: ' + esc(formatDateLabel(expire)) : ''}</span>
      </div>

      <div class="coupon-v2-side">
        <span class="coupon-v2-badge">${esc(badge)}</span>
        <button class="coupon-v2-btn" type="button">쿠폰 보기</button>
      </div>
    </article>
  `;
}

function boardListItemHTML(post){
  const type = normalizeBoardType(post.type);
  const summary = (post.content || '').replace(/\s+/g, ' ').trim();
  const thumb = post.image_url
    ? `<img class="board-row-thumb-img" src="${esc(post.image_url)}" alt="${esc(post.title)}">`
    : boardThumbEmoji(type);

  const typeLabel =
    type === 'notice' ? '행사안내' :
    type === 'job' ? '구인/구직' :
    type === 'rent' ? '렌트' :
    type === 'sale' ? '매매' : '게시판';

  return `
    <button class="board-row-btn" data-board-post="${esc(post.id)}">
      <span class="board-row-thumb">${thumb}</span>

      <span class="board-row-copy">
        <em class="board-row-badge">${esc(typeLabel)}</em>
        <strong>${esc(post.title || '제목 없음')}</strong>
        <span>${esc(summary || post.address || '')}</span>
      </span>
    </button>
  `;
}
function mapBottomItemHTML(b){
  const miles = (b.lat != null && b.lng != null && currentCenter)
    ? haversineMiles(currentCenter.lat, currentCenter.lng, Number(b.lat), Number(b.lng))
    : null;

  const meta = [getMainCategoryLabel(b.category) || '업소'];
  if (miles != null && Number.isFinite(miles)) {
    meta.push(`${miles.toFixed(1)}mi`);
  }

  return `
    <button class="map-bottom-item" data-map-biz="${esc(b.id)}">
      <img class="map-bottom-thumb" src="${esc(b.image || '/assets/kfocus-icon.png')}" alt="${esc(b.name)}">
      <span class="map-bottom-copy">
        <strong>${esc(b.name)}</strong>
        <span>${esc(meta.join(' · '))}</span>
      </span>
    </button>
  `;
}

function renderMapBottomList(list){
  if(!mapBottomList) return;
  const rows = list || [];
  mapBottomList.innerHTML = rows.length ? rows.map(mapBottomItemHTML).join('') : '<div class="map-bottom-empty">표시할 업소가 없습니다.</div>';
  mapBottomPanel?.classList.toggle('hidden', !rows.length);
  if(rows.length && mapMode === 'business') mapBottomPanel?.classList.remove('collapsed');
}

function nearbyBusinessItemHTML(b){
  const bizName = b.name || b.name_ko || b.name_en || '이름 없음';
  const thumb = b.image || b.image_url || '/assets/kfocus-icon.png';
  const meta = [getMainCategoryLabel(b.category) || '업소'];

  return `
    <button class="nearby-business-item biz-open" data-biz="${esc(b.id)}">
      <img class="nearby-thumb" src="${esc(thumb)}" alt="${esc(bizName)}">
      <div class="nearby-copy">
        <strong>${esc(bizName)}</strong>
        <span>${esc(meta.join(' · '))}</span>
      </div>
    </button>
  `;
}
function homeBusinessItemHTML(b){
  const bizName = b.name || b.name_ko || b.name_en || '이름 없음';
  const thumb = b.image || b.image_url || '/assets/kfocus-icon.png';
  const category = getMainCategoryLabel(b.category) || '업소';
  const area = b.city || b.area || b.region_label || 'Dallas, TX';


  return `
    <button class="home-biz-row biz-open" data-biz="${esc(b.id)}">
      <div class="home-biz-row-photo">
        <img src="${esc(thumb)}" alt="${esc(bizName)}">
      </div>

      <div class="home-biz-row-info">
        <strong>${esc(bizName)}</strong>
        <span class="home-biz-chip">${esc(category)}</span>
        <span class="home-biz-meta">
          <i data-lucide="map-pin"></i>
          ${esc(area)}
        </span>

      </div>
    </button>
  `;
}
function bindBizOpenButtons() {
  document.querySelectorAll('.biz-open').forEach((el) => {
    el.onclick = () => {
      const id = el.dataset.biz;
      if (!id) return;

      selectedBizId = id;
      currentDetailVideoOverride = '';
      lastBasePage = currentPage;
      renderDetail(id);
      showPage('business-detail');
    };
  });
}
function renderHomeBoardSection(type='notice'){
  selectedBoardType = type;
  if(communityTabs){
    $$('#communityTabs .community-tab').forEach(btn=>btn.classList.toggle('active', btn.dataset.board===type));
  }
  const rows = boardPostsByType(type).slice(0,4);
  if(homeBoardList) homeBoardList.innerHTML = rows.length ? rows.map(boardListItemHTML).join('') : `<div class="board-empty">등록된 ${boardLabel(type)} 글이 없습니다.</div>`;
  if(homeBoardMoreBtn) homeBoardMoreBtn.dataset.board = type;
}
function renderHome(){
  renderHomeBoardSection(selectedBoardType || 'notice');

  const featured = sortBusinessesByDistance(
    businesses.filter(b => b.featured)
  )
    .slice()
    .sort((a,b)=>
      (Number(a.featured_rank ?? 1000) - Number(b.featured_rank ?? 1000)) ||
      String(b.created_at || '').localeCompare(String(a.created_at || ''))
    )
    .slice(0,5);

if(homeFeaturedList){
  homeFeaturedList.innerHTML = featured.length
    ? featured.map(homeBusinessItemHTML).join('')
    : '<div class="board-empty">등록된 추천 업소가 없습니다.</div>';
}

if (typeof renderTodayCoupons === 'function') {
  renderTodayCoupons();
}
if (typeof renderHomeBusinessTabs === 'function') {
  renderHomeBusinessTabs();
}
  const newList = businesses
    .filter(b => b.is_new)
    .sort((a, b) =>
      Number(a.new_rank ?? 1000) - Number(b.new_rank ?? 1000) ||
      String(b.created_at || '').localeCompare(String(a.created_at || ''))
    )
    .slice(0, 5);

  if (homeNewList) {
    homeNewList.innerHTML = newList.length
      ? newList.map(homeBusinessItemHTML).join('')
      : `<div class="board-empty">등록된 신규 업소가 없습니다.</div>`;
  }
  if(window.lucide){
  lucide.createIcons();
  }
  const popularList = businesses
    .filter(b => b.is_popular)
    .sort((a, b) =>
      Number(a.popular_rank ?? 1000) - Number(b.popular_rank ?? 1000)
    )
    .slice(0, 5);

  if (homePopularList) {
    homePopularList.innerHTML = popularList.length
      ? popularList.map(homeBusinessItemHTML).join('')
      : `<div class="board-empty">등록된 인기 업소가 없습니다.</div>`;
  }

  const featuredIds = new Set(featured.map(b => String(b.id)));

  const nearby = sortBusinessesByDistance(
    businesses.filter(b =>
      !featuredIds.has(String(b.id)) &&
      b.lat != null &&
      b.lng != null
    )
  ).slice(0,6);

  if(homeNearbyList){
    homeNearbyList.innerHTML = nearby.length
      ? nearby.map(nearbyBusinessItemHTML).join('')
      : '<div class="board-empty">주변 업소가 없습니다.</div>';
  }
}

function renderBusinessList() {
  const listEl = document.getElementById('businessList');
  if (!listEl) return;

  const keyword = String(businessSearch?.value || '').trim().toLowerCase();
  let rows = Array.isArray(businesses) ? businesses.slice() : [];

  if (businessQuickFilter && businessQuickFilter !== '전체') {
    rows = rows.filter(b => getMainCategoryLabel(b.category) === businessQuickFilter);
  }

  if (keyword) {
    rows = rows.filter(b => {
      const hay = [b.name, b.category, b.address, b.desc].filter(Boolean).join(' ').toLowerCase();
      return keyword.split(/\s+/).every(part => hay.includes(part));
    });
  }

  rows = sortBusinessesByDistance(rows);

  if (!rows.length) {
    listEl.innerHTML = `<div class="board-empty">등록된 업소가 없습니다.</div>`;
    return;
  }

  listEl.innerHTML = rows.map(nearbyBusinessItemHTML).join('');
}

function renderCategories() {
  const cats = ['식당','쇼핑','병원','금융','법률','교회','서비스','부동산'];
  if (!categoryRow) return;

  categoryRow.innerHTML = cats.map(c => `
    <button
      class="category-chip ${businessQuickFilter === c || (!businessQuickFilter && c === '전체') ? 'active' : ''}"
      data-cat="${esc(c)}"
      type="button"
    >${esc(c)}</button>
  `).join('');
}
function renderMainBanners(){
  console.log('[BANNERS] render start', mainBanners);

  const box = document.getElementById('mainBanners');
  console.log('[BANNERS] box exists', !!box);

  if(!box) return;

  const rows = Array.isArray(mainBanners) ? mainBanners : [];
  console.log('[BANNERS] rows for render', rows);

  if(!rows.length){
    box.innerHTML = '';
    return;
  }

  box.innerHTML = `
    <div class="main-banner-list">
      ${rows.map(b => `
        <button class="main-banner-card" type="button" data-banner-id="${esc(b.id)}">
          <img src="${esc(b.image_url || '')}" alt="${esc(b.title || 'Sponsor banner')}">
        </button>
      `).join('')}
    </div>
  `;

  console.log('[BANNERS] html inserted', box.innerHTML);

  box.querySelectorAll('.main-banner-card').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.bannerId;
      const banner = rows.find(x => String(x.id) === String(id));
      if(!banner) return;

      if(banner.business_id){
        selectedBizId = banner.business_id;
        currentDetailVideoOverride = '';
        renderDetail(banner.business_id);
        showPage('business-detail');
        return;
      }

      if(banner.link_url){
        window.open(normalizeUrl(banner.link_url), '_blank', 'noopener');
      }
    });
  });
}
function renderCoupons(){
  if(!couponTodayList || !couponAllList) return;
  const today = todayCoupons();
  const all = activeCoupons(coupons);
  couponTodayList.innerHTML = today.length ? today.map(c=>couponCardHTML(c,'today')).join('') : '<p class="empty">오늘 쿠폰이 없습니다.</p>';
  couponAllList.innerHTML = all.length ? all.map(c=>couponCardHTML(c,'all')).join('') : '<p class="empty">등록된 쿠폰이 없습니다.</p>';
  updateCouponTabUI();
}
function updateCouponTabUI(){
  $$('.coupon-tab').forEach(btn=>btn.classList.toggle('active', btn.dataset.couponTab===couponViewTab));
  couponTodayList?.classList.toggle('hidden', couponViewTab!=='today');
  couponAllList?.classList.toggle('hidden', couponViewTab!=='all');
}
function renderDetail(id){
  const b = businesses.find(v => String(v.id) === String(id)) || businesses[0];
  if(!b || !detailCard) return;
  selectedBizId = b.id;
  const regionLabel = getRegionLabel(b.region || currentRegion);
  const safeWebsite = normalizeUrl(b.website || '');
  const safeEmail = (b.email || '').trim();
  const phoneDigits = (b.phone||'').replace(/[^\d]/g,'');
  const bizCoupons = activeCoupons(coupons).filter(c=>String(c.businessId)===String(b.id));
  logBusinessActivity(b.id, 'view');
const videoHtml = businessVideoHTML(b);

const galleryHtml = Array.isArray(b.gallery_urls) && b.gallery_urls.length
  ? `<div class="detail-gallery-block">
      <h3 class="subsection-title">갤러리</h3>
      <div class="gallery-wrap">
        <button class="gallery-arrow prev" type="button">‹</button>

        <div class="gallery-slider">
          ${b.gallery_urls.map((url, idx) => `
            <div class="gallery-slide">
              <img src="${esc(url)}" alt="${esc(b.name)} gallery ${idx + 1}">
            </div>
          `).join('')}
        </div>

        <button class="gallery-arrow next" type="button">›</button>
      </div>
    </div>`
  : '';

const couponHtml = bizCoupons.length
  ? `<div class="detail-coupon-block"><h3 class="subsection-title">사용 가능한 쿠폰</h3><div class="detail-coupon-list">${bizCoupons.map(c=>`<button class="detail-coupon-item coupon-open" data-coupon="${esc(c.id)}"><strong>${esc(c.title)}</strong><span>${esc(formatDateLabel(c.endAt))}</span></button>`).join('')}</div></div>`
  : '';

const orderUrl = normalizeUrl(b.order_url || '');
const deliveryUrl = normalizeUrl(b.delivery_url || '');
const reservationUrl = normalizeUrl(b.reservation_url || '');
const orderActionHtml = `
  <div class="detail-order-block">
    <h3 class="subsection-title">주문 · 예약</h3>
    <div class="detail-order-actions">
      <button class="action-btn order-link-btn ${orderUrl ? '' : 'disabled'}" type="button" data-url="${esc(orderUrl)}" data-label="온라인 주문">${orderUrl ? '온라인 주문' : '온라인 주문'}</button>
      <button class="action-btn order-link-btn ${deliveryUrl ? '' : 'disabled'}" type="button" data-url="${esc(deliveryUrl)}" data-label="배달 주문">${deliveryUrl ? '배달 주문' : '배달 주문'}</button>
      <button class="action-btn order-link-btn ${reservationUrl ? '' : 'disabled'}" type="button" data-url="${esc(reservationUrl)}" data-label="예약하기">${reservationUrl ? '예약하기' : '예약하기'}</button>
    </div>
    <div class="detail-order-note">업소별 주문·예약 링크는 순차적으로 연결됩니다.</div>
  </div>`;
  
  const img = b.image || b.image_url || '/assets/kfocus-icon.png';
const bizName = b.name || b.name_ko || b.name_en || '이름 없음';
const category = getMainCategoryLabel(b.category) || b.category || '업소';
const address = b.address || '';
const phone = b.phone || b.phone_number || '';
const website = b.website || b.url || '';

detailCard.innerHTML = `
  <article class="biz-detail-v2">

    <div class="biz-detail-hero">
      <img src="${esc(img)}" alt="${esc(bizName)}">

      <div class="biz-detail-badges">
        ${b.is_new ? '<span class="badge-new">NEW</span>' : ''}
        ${b.is_featured ? '<span class="badge-featured">추천</span>' : ''}
        ${b.is_popular ? '<span class="badge-popular">인기</span>' : ''}
      </div>
    </div>

    <section class="biz-detail-card">
      <h2>${esc(bizName)}</h2>
      <p class="biz-detail-meta">${esc(category)} · DalTownMap</p>

      <div class="biz-detail-rating">
        <span>★★★★★</span>
        <b>4.8</b>
      </div>

      <div class="biz-action-row">
        <a href="tel:${esc(phone)}">전화</a>
        <a href="${esc(getDirectionsUrl(b))}" target="_blank">길찾기</a>
        <a href="${esc(website || '#')}" target="_blank">웹사이트</a>
        <button type="button">예약</button>
        <button type="button">공유</button>
      </div>
    </section>

    <section class="biz-promo-card">
      <div class="promo-icon">🎁</div>
      <div>
        <strong>진행중인 혜택</strong>
        <p>무료 MASTER S4 추첨 증정</p>
        <button type="button" onclick="openCouponFromMap('${esc(b.id)}')">
          쿠폰 보기
        </button>
      </div>
    </section>

    <section class="biz-detail-card">
      <h3>매장 소개</h3>
      <p class="biz-description">
        ${esc(b.description || '업소 소개가 준비 중입니다.')}
      </p>
    </section>

    <section class="biz-detail-card">
      <h3>영업 정보</h3>
      <div class="biz-info-list">
        <p>🕒 영업시간 <span>${esc(b.hours || '정보 없음')}</span></p>
        <p>🚗 주차 <span>${esc(b.parking || '정보 없음')}</span></p>
        <p>📅 예약 <span>${esc(b.reservation || '가능')}</span></p>
        <p>🌎 언어 <span>한국어, 영어</span></p>
      </div>
    </section>

    <section class="biz-map-card">
      <h3>매장 위치</h3>

      <div class="biz-map-preview">
        <iframe
          src="https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed"
          loading="lazy">
        </iframe>
      </div>

      <p class="biz-address">📍 ${esc(address)}</p>
      <p class="biz-phone">📞 ${esc(phone)}</p>

      <div class="biz-bottom-actions">
        <a href="${esc(getDirectionsUrl(b))}" target="_blank">길찾기</a>
        <a href="tel:${esc(phone)}">전화하기</a>
      </div>
    </section>

  </article>
`;

detailCard.querySelectorAll('.order-link-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const url = btn.dataset.url || '';
    const label = btn.dataset.label || '연결';
    if (url) {
      window.open(url, '_blank', 'noopener');
      return;
    }
    alert(`${label} 링크는 아직 준비중입니다.`);
  });
});

// 여기부터 추가
const prevBtn = detailCard.querySelector('.gallery-arrow.prev');
const nextBtn = detailCard.querySelector('.gallery-arrow.next');
const slider = detailCard.querySelector('.gallery-slider');

if (slider && prevBtn && nextBtn) {
  const slides = Array.from(slider.querySelectorAll('.gallery-slide'));
  let currentIndex = 0;

  const goToSlide = (index) => {
    if (!slides.length) return;

    currentIndex = Math.max(0, Math.min(index, slides.length - 1));
    slides[currentIndex].scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest'
    });
  };

  prevBtn.addEventListener('click', () => {
    goToSlide(currentIndex - 1);
  });

  nextBtn.addEventListener('click', () => {
    goToSlide(currentIndex + 1);
  });

  slider.addEventListener('scroll', () => {
    if (!slides.length) return;

    const sliderCenter = slider.scrollLeft + slider.clientWidth / 2;
    let nearestIndex = 0;
    let nearestDistance = Infinity;

    slides.forEach((slide, idx) => {
      const slideCenter = slide.offsetLeft + slide.offsetWidth / 2;
      const dist = Math.abs(sliderCenter - slideCenter);
      if (dist < nearestDistance) {
        nearestDistance = dist;
        nearestIndex = idx;
      }
    });

    currentIndex = nearestIndex;
  }, { passive: true });
}
// 여기까지 추가
}

function renderCouponDetail(id){
  const c = getCoupon(id);
  if(!c) return;

  const b = getBiz(c.businessId || c.business_id) || {};
  const img = c.imageUrl || c.image_url || c.image || b.image || b.image_url || '/assets/kfocus-icon.png';

  const title = c.title || '쿠폰';
  const bizName = b.name || b.name_ko || b.name_en || '';
  const desc = c.description || '';
  const badge = c.discount_label || c.badge || 'DEAL';

  const start = c.startAt || c.start_at || '';
  const end = c.endAt || c.end_at || c.expire_date || '';

  const address = b.address || '주소 정보 없음';
  const phone = b.phone || b.phone_number || '';

  const box =
  document.getElementById('couponDetailCard') ||
  document.getElementById('couponUseCard');
  if(!box) return;

  box.innerHTML = `
    <article class="coupon-detail-v2">

      <div class="coupon-detail-hero" style="position:relative;">
  <img src="${esc(img)}" alt="${esc(title)}">
  <span
    class="coupon-detail-badge"
    style="
      position:absolute;
      right:14px;
      top:14px;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      background:#e53935;
      color:#fff;
      padding:6px 12px;
      border-radius:999px;
      font-size:12px;
      font-weight:900;
      box-shadow:0 4px 10px rgba(229,57,53,.25);
    ">
    ${esc(badge)}
  </span>
</div>

      <section class="coupon-detail-card">
        <h2 style="margin-top:10px;">
  ${esc(title)}
</h2>

        <button
  class="coupon-detail-biz biz-open"
  type="button"
  data-biz="${esc(b.id || c.businessId || c.business_id || '')}"
  style="
    display:inline-flex;
    align-items:center;
    gap:6px;
    border:0;
    border-radius:999px;
    background:#eef5ff;
    color:#2a60ab;
    padding:8px 12px;
    font-size:14px;
    font-weight:900;
    margin:0 0 12px;
  ">
  ${esc(bizName)}
  <i data-lucide="chevron-right"></i>
</button>


        <div style="
  display:flex;
  align-items:center;
  justify-content:space-between;
  background:#fff7ed;
  border:1px solid #fed7aa;
  border-radius:16px;
  padding:12px 14px;
  margin:12px 0;
">
  <div style="
    display:flex;
    align-items:center;
    gap:8px;
    font-weight:800;
    color:#7c2d12;
  ">
    <i data-lucide="clock"></i>
    <strong>남은 시간</strong>
  </div>

  <b style="
    font-size:18px;
    font-weight:900;
    color:#b45309;
    white-space:nowrap;
  ">
    ${esc(getRemainText(c))}
  </b>
</div>

        <div
  style="
    display:flex;
    gap:12px;
    align-items:flex-start;
    background:#fff;
    border:1px solid #e5edff;
    border-radius:18px;
    padding:14px;
    margin:12px 0;
  "
>
  <div
    style="
      width:42px;
      height:42px;
      border-radius:12px;
      background:#fff1e8;
      display:flex;
      align-items:center;
      justify-content:center;
      color:#f97316;
      flex-shrink:0;
    "
  >
    <i data-lucide="gift"></i>
  </div>

  <div>
    <strong
      style="
        display:block;
        margin-bottom:6px;
        color:#10224a;
        font-size:16px;
      "
    >
      혜택 안내
    </strong>

    <p>${esc(desc || '쿠폰 혜택을 확인하세요.')}</p>

    <ul>
      <li>방문 고객 대상</li>
      <li>행사 기간 내 사용 가능</li>
    </ul>
  </div>
</div>

        <button
  class="coupon-primary-use"
  type="button"
  onclick="renderCouponUse('${esc(c.id)}'); showPage('coupon-use');"
  style="
    width:100%;
    height:54px;
    border:0;
    border-radius:16px;
    background:linear-gradient(135deg,#2a60ab,#5f77fa);
    color:#fff;
    font-size:18px;
    font-weight:900;
    display:flex;
    align-items:center;
    justify-content:center;
    gap:8px;
    box-shadow:0 12px 24px rgba(42,96,171,.24);
  ">
  <i data-lucide="ticket"></i>
  쿠폰 사용하기
  </button>
      </section>

      <section class="coupon-map-card">
        <h3>매장 위치</h3>

        <div class="coupon-map-preview">
  <iframe
    src="https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed"
    width="100%"
    height="100%"
    style="border:0;"
    loading="lazy"
    referrerpolicy="no-referrer-when-downgrade">
  </iframe>
</div>

        <p class="coupon-address">
          <i data-lucide="map-pin"></i>
          ${esc(address)}
        </p>

        ${phone ? `
          <p class="coupon-phone">
            <i data-lucide="phone"></i>
            ${esc(phone)}
          </p>
        ` : ''}

        <div
  class="coupon-map-actions"
  style="
    display:grid;
    grid-template-columns:1fr 1fr;
    gap:10px;
    margin-top:14px;
  "
>
  <button
    type="button"
    class="coupon-outline-btn"
    onclick="window.open('${esc(getDirectionsUrl(b))}', '_blank')"
    style="
      height:46px;
      border:1px solid #bcd2ff;
      border-radius:16px;
      background:#fff;
      color:#2a60ab;
      font-size:15px;
      font-weight:900;
      display:flex;
      align-items:center;
      justify-content:center;
      gap:6px;
    "
  >
    <i data-lucide="navigation"></i>
    길찾기
  </button>

  <button
    type="button"
    class="coupon-outline-btn"
    onclick="window.location.href='tel:${esc(phone)}'"
    style="
      height:46px;
      border:1px solid #bcd2ff;
      border-radius:16px;
      background:#fff;
      color:#2a60ab;
      font-size:15px;
      font-weight:900;
      display:flex;
      align-items:center;
      justify-content:center;
      gap:6px;
    "
  >
    <i data-lucide="phone"></i>
    전화하기
  </button>
</div>
      </section>

    </article>
  `;

  bindBizOpenButtons();

  if(window.lucide){
    lucide.createIcons();
  }
}
function getRemainText(c){
  const end = c.endAt || c.end_at || c.expire_date || '';
  if(!end) return '기간 확인';

  const endDate = new Date(end);
  if(Number.isNaN(endDate.getTime())) return '기간 확인';

  const diff = endDate.getTime() - Date.now();
  if(diff <= 0) return '종료됨';

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);

  return `${days}일 ${hours}시간`;
}
function getDirectionsUrl(b){
  const address = b.address || '';
  const name = b.name || b.name_ko || b.name_en || '';

  const q = encodeURIComponent(address || name || 'Dallas, TX');

  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}
function renderCouponUse(id){
  const c = getCoupon(id);
  if(!c || !couponUseCard) return;
  selectedCouponId = c.id;
  const b = getBiz(c.businessId);
  logBusinessActivity(c.businessId, 'coupon_use');
  clearInterval(couponUseTimer);
  let count = 10;
  couponUseCard.innerHTML = `<div class="coupon-use-wrap"><div class="coupon-use-title">매장에서 이 화면을 보여주세요</div><div class="coupon-use-business">${esc(b.name)} · ${esc(c.title)}</div><div class="coupon-use-count" id="couponUseCount">10</div><div class="coupon-use-note">화면이 켜진 상태로 제시해 주세요.</div></div>`;
  const countEl = document.getElementById('couponUseCount');
  couponUseTimer = setInterval(()=>{ count -= 1; if(countEl) countEl.textContent = String(count); if(count <= 0){ clearInterval(couponUseTimer); } }, 1000);
}

function getYouTubeId(url) {
  if (!url) return '';
  const m = String(url).match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([^&?/]+)/
  );
  return m ? m[1] : '';
}

function isVerticalVideo(url) {
  const v = String(url || '').toLowerCase();
  if (!v) return false;
  if (v.includes('youtube.com/shorts/')) return true;
  return false;
}

function getYouTubeThumb(url){
  const id = getYouTubeId(url);
  if(!id) return '';
  return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
}

function buildSlideVideoHTML(videoUrl, fallbackImage=''){
  const yt = getYouTubeId(videoUrl);
  const vertical = isVerticalVideo(videoUrl) ? 'vertical' : 'horizontal';

  if(yt){
    const thumb = getYouTubeThumb(videoUrl) || fallbackImage || '';

    return `
      <div class="hero-media ${vertical}" data-video-wrap="1" data-video-url="${videoUrl}">
        <div class="hero-video-poster">
          ${thumb ? `<img src="${thumb}" alt="video thumbnail">` : ''}
          <button class="hero-video-play" type="button">▶</button>
        </div>
      </div>
    `;
  }

  return '';
}

function renderHero(){
  if(!heroTrack) return;

  const total = Math.max((heroSlides || []).length, 1);

  heroTrack.innerHTML = (heroSlides || []).map((s, idx) => {
    const media = s.video_url
  ? buildSlideVideoHTML(s.video_url, s.bg || '')
  : getSlideMediaHTML(s);

    return `
      <article class="hero-slide" style="width:${100 / total}%" data-index="${idx}" data-biz="${esc(s.bizId || '')}" data-video="${esc(s.video_url || '')}">
        ${media}
        <div class="hero-slide-content">
          <span class="hero-chip">${esc(s.type || 'BANNER')}</span>
          <h2>${esc(s.title || '')}</h2>
          <p>${esc(s.desc || '')}</p>
         
        </div>
      </article>
    `;
  }).join('');

  heroTrack.style.width = `${total * 100}%`;

  if(heroDotsWrap){
    heroDotsWrap.innerHTML = (heroSlides || []).map((_,i)=>`
      <button class="dot ${i===slideIndex?'active':''}" data-slide="${i}" aria-label="slide ${i+1}"></button>
    `).join('');
  }
}
function setSlide(index, user=false){
  const total = heroSlides.length || 1;
  slideIndex = (index + total) % total;
  const offset = (100 / total) * slideIndex;
  if(heroTrack) heroTrack.style.transform = `translate3d(-${offset}%,0,0)`;
  $$('.dot').forEach((d,i)=>d.classList.toggle('active', i===slideIndex));
  if(user) restartAuto();
}
function restartAuto(){
  clearInterval(autoTimer);
  if((heroSlides.length || 0) <= 1) return;
  autoTimer = setInterval(()=>setSlide(slideIndex+1), 3500);
}
function bindHeroSwipe(){
  if(!heroViewport) return;
  let sx=0, sy=0;
  heroViewport.addEventListener('touchstart', e=>{ const t=e.touches[0]; sx=t.clientX; sy=t.clientY; clearInterval(autoTimer); }, {passive:true});
  heroViewport.addEventListener('touchend', e=>{ const t=e.changedTouches[0]; const dx=t.clientX-sx; const dy=t.clientY-sy; if(Math.abs(dx)>28 && Math.abs(dx)>Math.abs(dy)) { setSlide(slideIndex + (dx<0?1:-1), true); } else { restartAuto(); } }, {passive:true});
  heroDotsWrap?.addEventListener('click', e=>{ const btn=e.target.closest('.dot'); if(!btn) return; setSlide(Number(btn.dataset.slide), true); });
  heroTrack?.addEventListener('click', e=>{
	  // 🔥 이 블록 추가 (맨 위)
  const playBtn = e.target.closest('.hero-video-play');
  if(playBtn){
    e.preventDefault();
    e.stopPropagation();

    const wrap = playBtn.closest('[data-video-wrap="1"]');
    if(!wrap) return;

    const videoUrl = wrap.dataset.videoUrl || '';
    const yt = getYouTubeId(videoUrl);
    const vertical = isVerticalVideo(videoUrl) ? 'vertical' : 'horizontal';

    if(yt){
      wrap.className = `hero-media ${vertical}`;
      wrap.innerHTML = `
        <iframe
          src="https://www.youtube.com/embed/${yt}?autoplay=1&mute=1&playsinline=1&rel=0"
          title="youtube video"
          loading="lazy"
          frameborder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowfullscreen>
        </iframe>
      `;
    }

    return;
  }

    const cta = e.target.closest('.hero-detail-open');
    if(cta){
      e.preventDefault();
      e.stopPropagation();
      const bizId = cta.dataset.biz;
      currentDetailVideoOverride = String(cta.dataset.video || '').trim();
if(bizId){
  renderDetail(bizId);
  lastBasePage = currentPage;
  showPage('business-detail');

  if (currentDetailVideoOverride) {
    setTimeout(() => openVideoModal(currentDetailVideoOverride), 250);
  }
}
      return;
    }

    const slide=e.target.closest('.hero-slide');
    if(!slide) return;
    const bizId=slide.dataset.biz;
    currentDetailVideoOverride = String(slide.dataset.video || '').trim();
if(bizId){

  const slideData =
    heroSlides.find(x => String(x.bizId) === String(bizId));

  if(slideData){
    openSlideDetailModal(slideData);
    return;
  }

  renderDetail(bizId);
  lastBasePage = currentPage;
  showPage('business-detail');

  if (currentDetailVideoOverride) {
    setTimeout(() => openVideoModal(currentDetailVideoOverride), 250);
  }
}
  });
}
let selectedSlideBizId = null;

function openSlideDetailModal(slide){

  selectedSlideBizId = slide.bizId || null;

  document.getElementById('slideDetailTitle').textContent =
    slide.title || '';

  document.getElementById('slideDetailDesc').textContent =
    slide.slideDesc || slide.desc || '';

  document.getElementById('slideDetailImage').src =
    slide.bg || '';

  document.getElementById('slideDetailModal')
    ?.classList.remove('hidden');
}

function closeSlideDetailModal(){
  document.getElementById('slideDetailModal')
    ?.classList.add('hidden');
}
function closeSideMenu(){ $('#sideMenu')?.classList.remove('open'); $('#sideOverlay')?.classList.remove('show'); }
function openSideMenu(){ $('#sideMenu')?.classList.add('open'); $('#sideOverlay')?.classList.add('show'); }
function renderBoardPage(type='notice', postId=null){
  if(!boardTitle) return;
  const rows = boardPostsByType(type);
  const page = $('#page-board-detail .section-card');
  if(postId){
    const post = boardPosts.find(p=>String(p.id)===String(postId));
    selectedBoardPost = post || null;
    boardTitle.textContent = boardLabel(type);
    const thumb = post?.image_url ? `<img class="board-detail-image" src="${esc(post.image_url)}" alt="${esc(post?.title || '게시판')}">` : '';
    const contact = [post?.address, post?.phone].filter(Boolean).map(v=>`<div class="detail-meta">${esc(v)}</div>`).join('');
    const phoneDigits = String(post?.phone || '').replace(/[^\d]/g,'');
    const mapHref = post?.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(post.address)}` : '';
    const linkedBiz = post?.business_id ? getBiz(post.business_id) : null;
    const actionLinks = [
      phoneDigits ? `<a class="action-btn call" href="tel:${phoneDigits}">전화하기</a>` : '',
      mapHref ? `<a class="action-btn map" href="${mapHref}" target="_blank" rel="noopener">길찾기</a>` : '',
      linkedBiz ? `<button class="action-btn business biz-open" data-biz="${esc(linkedBiz.id)}">업소 보기</button>` : ''
    ].filter(Boolean).join('');
    const linkedBizMeta = linkedBiz ? `<div class="detail-meta"><button class="text-link biz-open" data-biz="${esc(linkedBiz.id)}">연결 업소 · ${esc(linkedBiz.name)}</button></div>` : '';
    page.innerHTML = `<h3 id="boardTitle">${esc(boardLabel(type))}</h3><div class="board-detail-block"><div class="board-detail-head"><span class="board-detail-emoji">${post?.image_url ? '' : boardThumbEmoji(type)}</span><div><h4>${esc(post?.title || '게시판')}</h4><p>${esc(post?.created_at || '')}</p></div></div>${thumb}${linkedBizMeta}${contact}<p class="board-detail-copy">${esc(post?.content || '')}</p>${actionLinks ? `<div class="action-buttons board-detail-actions">${actionLinks}</div>` : ''}<div class="board-detail-tools"><button class="text-link" id="boardBackToList">목록으로</button></div></div>`;
    $('#boardBackToList')?.addEventListener('click', ()=>{ renderBoardPage(type); });
    return;
  }
  selectedBoardType = type;
  boardTitle.textContent = boardLabel(type);
  page.innerHTML = `<h3 id="boardTitle">${esc(boardLabel(type))}</h3><div class="board-page-list">${rows.length ? rows.map(boardListItemHTML).join('') : `<div class="board-empty">등록된 ${boardLabel(type)} 글이 없습니다.</div>`}</div>`;
}
function showBoard(board){ renderBoardPage(board); lastBasePage = currentPage;
  showPage('board-detail'); }
function openBoardPost(postId){
  const post = boardPosts.find(p=>String(p.id)===String(postId));
  const type = normalizeBoardType(post?.type || selectedBoardType || 'notice');
  renderBoardPage(type, postId);
  lastBasePage = currentPage;
  showPage('board-detail');
}
function animatePageTransition(fromPage, toPage, direction='left') {
  const fromEl = document.getElementById(`page-${fromPage}`);
  const toEl = document.getElementById(`page-${toPage}`);
  if (!fromEl || !toEl || fromEl===toEl) {
    $$('.page').forEach(p=>p.classList.toggle('active', p.id===`page-${toPage}`));
    return;
  }
  const outClass = direction === 'left' ? 'slide-out-left' : 'slide-out-right';
  const inClass = direction === 'left' ? 'slide-in-right' : 'slide-in-left';
  toEl.classList.add('active','page-animating',inClass);
  fromEl.classList.add('page-animating',outClass);
  requestAnimationFrame(()=>{
    toEl.classList.add('slide-run');
    fromEl.classList.add('slide-run');
  });
  const cleanup = () => {
    fromEl.classList.remove('active','page-animating','slide-out-left','slide-out-right','slide-run');
    toEl.classList.remove('page-animating','slide-in-left','slide-in-right','slide-run');
  };
  setTimeout(cleanup, 260);
}

function showPage(page, opts={}){
  const prevPage = currentPage;
  currentPage = page;
  if (typeof setMapPageMode === 'function') {
  setMapPageMode(page === 'map');
}
  const order = getPageOrder();
  const prevIdx = order.indexOf(prevPage);
  const nextIdx = order.indexOf(page);
  const direction = nextIdx >= 0 && prevIdx >= 0 && nextIdx > prevIdx ? 'left' : 'right';
  if (prevPage !== page) animatePageTransition(prevPage, page, direction);
  else $$('.page').forEach(p=>p.classList.toggle('active', p.id===`page-${page}`));
  $$('.nav-item').forEach(btn=>btn.classList.toggle('active', btn.dataset.nav===page));
  if (nextIdx >= 0) lastBasePage = page;
  setRoute(page);
  if(page==='business' && opts.focusSearch) setTimeout(()=>businessSearch?.focus(), 80);
  if(page !== 'business'){
  businessQuickFilter = '';
}
  if(prevPage==='coupon-use' && page!=='coupon-use'){ clearInterval(couponUseTimer); }
  if(page==='map'){
    if(!mapReady) initGoogleMap();
    if(map && window.google?.maps){
      setTimeout(()=>{
        google.maps.event.trigger(map,'resize');
        map.setCenter(currentCenter || getRegionCenter(currentRegion));
        map.setZoom(milesToZoom(mapRadius));
        redrawMapMarkers();
      }, 220);
    }
  }
  closeSideMenu();
  window.scrollTo({top:0, behavior:'instant'});
}

function initPageSwipe(){
  let sx=0, sy=0, active=false, moved=false;
  const shouldIgnoreTarget = (target) => !!target.closest('#heroViewport, input, textarea, select, .bottom-nav, .side-menu, .side-overlay, .map-bottom-panel, .map-bottom-list, .map-bottom-item, .map-search-row, .map-top-controls, #page-map, #googleMap, .gm-style, .gm-style *, #categoryRow, .category-row, .category-chip, #communityTabs, .community-tab, #couponTabs, .coupon-tab, #page-business-detail, .detail-gallery-block, .gallery-slider, .gallery-slide, .gallery-slide img');
  document.addEventListener('touchstart', e=>{
    if(shouldIgnoreTarget(e.target)) return;
    const t=e.touches[0];
    sx=t.clientX; sy=t.clientY; active=true; moved=false;
  }, {passive:true, capture:true});

  document.addEventListener('touchmove', e=>{
    if(!active) return;
    const t=e.touches[0]; const dx=t.clientX-sx; const dy=t.clientY-sy;
    if(Math.abs(dx) > 18 && Math.abs(dx) > Math.abs(dy)) moved=true;
    if(moved && currentPage==='map') e.preventDefault();
  }, {passive:false, capture:true});
  document.addEventListener('touchend', e=>{
    if(!active) return; active=false;
    const t=e.changedTouches[0]; const dx=t.clientX-sx; const dy=t.clientY-sy;
    if(Math.abs(dx) < 54 || Math.abs(dx) < Math.abs(dy)) return;
    const basePage = getPageOrder().includes(currentPage) ? currentPage : lastBasePage;
    const order=getPageOrder(); const idx=order.indexOf(basePage); if(idx===-1) return;
    suppressCardClickUntil = Date.now() + 450;
    if(dx<0 && idx<order.length-1) showPage(order[idx+1]);
    if(dx>0 && idx>0) showPage(order[idx-1]);
  }, {passive:true, capture:true});
  document.getElementById('videoModalClose')?.addEventListener('click', closeVideoModal);
document.getElementById('videoModalBackdrop')?.addEventListener('click', closeVideoModal);

document.addEventListener('keydown', (e)=>{
  if(e.key === 'Escape') closeVideoModal();
});
}

let mapInfoWindow = null;

window.openBusinessFromMap = function(id){
  renderDetail(id);
  lastBasePage = currentPage;
  showPage('business-detail');
  return false;
};

window.openCouponFromMap = function(businessId){
  const c = activeMapCoupons().find(v=>String(v.businessId)===String(businessId));
  if(!c) return false;
  renderCouponDetail(c.id);
  lastBasePage = currentPage;
  showPage('coupon-detail');
  return false;
};

function openAdminLoginModal(){
  closeSideMenu();
  const modal = $('#adminLoginModal');
  if(!modal) return;
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  const email = $('#adminLoginEmail');
  if(email) setTimeout(()=>email.focus(), 30);
}
function openAdminLoginModalFromQuery(){
  const shouldOpen = sessionStorage.getItem('adminLogin') === '1';
  if(shouldOpen){
    sessionStorage.removeItem('adminLogin');
    setTimeout(() => {
      openAdminLoginModal();
    }, 500);
  }
}

function closeAdminLoginModal(){
  const modal = $('#adminLoginModal');
  if(!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
}
async function handleAdminLogin(){
  const supabase = window.supabaseClient;

  if (!supabase) {
    alert('Supabase 연결이 준비되지 않았습니다.');
    console.error('window.supabaseClient is undefined');
    return;
  }

  const email = ($('#adminLoginEmail')?.value || '').trim().toLowerCase();
  const password = ($('#adminLoginPassword')?.value || '').trim();

  if(!email || !password){
    alert('이메일과 비밀번호를 입력해 주세요.');
    return;
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if(error){
    alert('로그인 실패: ' + error.message);
    return;
  }

  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, area')
    .eq('user_id', user.id)
    .maybeSingle();

  if (profileError) {
    alert('관리자 정보 조회 실패: ' + profileError.message);
    console.error(profileError);
    return;
  }

  if(!profile || !['super_admin','regional_editor'].includes(profile.role)){
    alert('관리자 권한이 없습니다.');
    await supabase.auth.signOut();
    return;
  }

  closeAdminLoginModal();
  window.location.href = 'admin/index.html';
}


function ensureMarkerClusterer(cb){
  if(window.markerClusterer?.MarkerClusterer){ markerClusterReady = true; cb && cb(); return; }
  const existing = document.getElementById('markerclusterer-script');
  if(existing){
    existing.addEventListener('load', ()=>{ markerClusterReady = !!window.markerClusterer?.MarkerClusterer; cb && cb(); }, { once:true });
    return;
  }
  const s = document.createElement('script');
  s.id = 'markerclusterer-script';
  s.src = 'https://unpkg.com/@googlemaps/markerclusterer/dist/index.min.js';
  s.async = true;
  s.onload = ()=>{ markerClusterReady = !!window.markerClusterer?.MarkerClusterer; cb && cb(); };
  document.head.appendChild(s);
}

function getFilteredMapBusinesses(){
  let list = businesses.filter(b=>Number.isFinite(Number(b.lat)) && Number.isFinite(Number(b.lng)));
  if(mapMode==='coupon'){
    const couponBizIds = new Set(activeMapCoupons().map(c=>String(c.businessId)));
    list = list.filter(b=>couponBizIds.has(String(b.id)));
  } else if(mapMode==='event'){
    list = [];
  } else if(mapCategory){
    list = list.filter(b=>getMainCategoryLabel(b.category)===mapCategory);
  }
  if(mapSearchQuery){
    list = list.filter(b=>queryMatches(mapSearchQuery, [b.name, b.name_en, b.category, b.category_main, b.category_sub, b.address, b.region, getMainCategoryLabel(b.category)]));
  }
  return list;
}

function createInfoWindowContent(b){
  const hasCoupon = activeMapCoupons().some(c=>String(c.businessId)===String(b.id));
  const thumb = b.image || 'assets/kfocus-icon.png';
  const badges = [hasCoupon ? '<span class=\"map-iw-badge deal\">🎟 할인</span>' : '', b.video ? '<span class=\"map-iw-badge video\">🎥 영상</span>' : '', b.has_event ? '<span class=\"map-iw-badge event\">🎉 행사</span>' : ''].filter(Boolean).join('');
  return `<div class=\"map-infowindow\"><div class=\"map-iw-row\"><img class=\"map-iw-thumb\" src=\"${esc(thumb)}\" alt=\"${esc(b.name)}\"><div class=\"map-iw-meta\"><h4>${esc(b.name)}</h4><p>${esc(getMainCategoryLabel(b.category))} · ${esc(b.address)}</p>${badges?`<div class=\"map-iw-badges\">${badges}</div>`:''}</div></div><div class=\"map-iw-actions\"><a href=\"#\" class=\"iw-btn\" onclick=\"return window.openBusinessFromMap('${esc(b.id)}')\">상세보기</a>${hasCoupon?`<a href=\"#\" class=\"iw-btn coupon\" onclick=\"return window.openCouponFromMap('${esc(b.id)}')\">할인</a>`:''}<a class=\"iw-btn route\" href=\"https://www.google.com/maps/dir/?api=1&destination=${b.lat},${b.lng}\" target=\"_blank\">길찾기</a></div></div>`;
}


function haversineMiles(lat1,lng1,lat2,lng2){ const toRad=v=>v*Math.PI/180; const R=3958.8; const dLat=toRad(lat2-lat1); const dLng=toRad(lng2-lng1); const a=Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2; return 2*R*Math.asin(Math.sqrt(a)); }

function sortBusinessesByDistance(list){
  if (!Array.isArray(list)) return [];
  if (!currentCenter || !Number.isFinite(Number(currentCenter.lat)) || !Number.isFinite(Number(currentCenter.lng))) {
    return list.slice();
  }

  return list.slice().sort((a, b) => {
    const aHas = Number.isFinite(Number(a.lat)) && Number.isFinite(Number(a.lng));
    const bHas = Number.isFinite(Number(b.lat)) && Number.isFinite(Number(b.lng));

    if (!aHas && !bHas) return 0;
    if (!aHas) return 1;
    if (!bHas) return -1;

    const da = haversineMiles(Number(currentCenter.lat), Number(currentCenter.lng), Number(a.lat), Number(a.lng));
    const db = haversineMiles(Number(currentCenter.lat), Number(currentCenter.lng), Number(b.lat), Number(b.lng));

    return da - db;
  });
}


function getMapVerticalOffsetLat(lat, pixels = 190){
  if(!map) return 0;
  const zoom = map.getZoom() || 14;
  const metersPerPixel = 156543.03392 * Math.cos((Number(lat) || 0) * Math.PI / 180) / Math.pow(2, zoom);
  const offsetMeters = pixels * metersPerPixel;
  return offsetMeters / 111320;
}

function panMapForVisibleInfo(lat, lng){
  if(!map) return;
  const adjusted = { lat: Number(lat) + getMapVerticalOffsetLat(lat), lng: Number(lng) };
  map.panTo(adjusted);
  currentCenter = adjusted;
}

function focusMapOnBusinesses(list){
  if(!map || !window.google?.maps || !Array.isArray(list) || !list.length) return;
  const valid = list.filter(b=>Number.isFinite(Number(b.lat)) && Number.isFinite(Number(b.lng)));
  if(!valid.length) return;
  if(valid.length === 1){
    const b = valid[0];
    const pos = { lat:Number(b.lat), lng:Number(b.lng) };
    map.setZoom(Math.max(map.getZoom() || 12, 14));
    panMapForVisibleInfo(pos.lat, pos.lng);
    if(mapInfoWindow){
      mapInfoWindow.setContent(createInfoWindowContent(b));
      mapInfoWindow.setPosition(pos);
      mapInfoWindow.open({ map, shouldFocus:false });
    }
    return;
  }
  const bounds = new google.maps.LatLngBounds();
  valid.forEach(b=>bounds.extend({ lat:Number(b.lat), lng:Number(b.lng) }));
  map.fitBounds(bounds, { top: 220, right: 48, bottom: 96, left: 48 });
}


function getMarkerIconForBusiness(b){
  if(mapMode==='event' || b.has_event) return 'https://maps.google.com/mapfiles/ms/icons/purple-dot.png';
  if(mapMode==='coupon' || activeMapCoupons().some(c=>String(c.businessId)===String(b.id))) return 'https://maps.google.com/mapfiles/ms/icons/orange-dot.png';
  return 'https://maps.google.com/mapfiles/ms/icons/red-dot.png';
}

function redrawMapMarkers(){
  if(!map || !window.google?.maps) return;
  if(markerCluster){ markerCluster.setMap(null); markerCluster = null; }
  markers.forEach(m=>m.setMap(null));
  markers = [];
  const list = getFilteredMapBusinesses();
  const focus = currentCenter || getRegionCenter(currentRegion);
  const radiusMiles = String(mapRadius)==='all' ? null : Number(mapRadius || radiusByZoom(map?.getZoom?.() || 12));
  const filtered = !radiusMiles ? list : list.filter(b=>{
    const miles = haversineMiles(focus.lat, focus.lng, Number(b.lat), Number(b.lng));
    return miles <= radiusMiles;
  });
  const finalList = filtered.length ? filtered : (mapMode==='event' ? [] : list.slice(0,60));
  finalList.forEach(b=>{
    const lat = Number(b.lat); const lng = Number(b.lng);
    const icon = getMarkerIconForBusiness(b);
    const marker = new google.maps.Marker({ position:{lat, lng}, title:b.name, icon });
    marker.addListener('click', ()=>{
      panMapForVisibleInfo(lat, lng);
      mapInfoWindow.setContent(createInfoWindowContent({...b, lat, lng}));
      mapInfoWindow.open({ anchor: marker, map, shouldFocus:false });
    });
    markers.push(marker);
  });
  if(window.markerClusterer?.MarkerClusterer && markers.length > 12){
    markerCluster = new window.markerClusterer.MarkerClusterer({ map, markers });
  } else {
    markers.forEach(m=>m.setMap(map));
  }
  if(mapSearchQuery && finalList.length){
    focusMapOnBusinesses(finalList);
  }
  const sortedFinalList = sortBusinessesByDistance(finalList);
  renderMapBottomList(sortedFinalList);
  if(mapNotice){
    if(mapMode==='event') mapNotice.textContent = ''; //등록된 행사 지도가 아직 없습니다.
    else if(mapSearchQuery && finalList.length) mapNotice.textContent = `검색 결과 ${finalList.length}곳`;
    else mapNotice.textContent = finalList.length ? '' : (mapSearchQuery ? '검색 결과가 없습니다.' : '이 반경에 표시할 업소가 없습니다.');
    mapNotice.classList.toggle('hidden', !mapNotice.textContent);
  }
}

function initGoogleMap(){
  if(mapReady) return;
  const key = getConfig().GOOGLE_MAPS_API_KEY;
  if(!key){ mapNotice.textContent = 'config.js에 GOOGLE_MAPS_API_KEY를 넣으면 실제 Google 지도가 표시됩니다.'; mapNotice.classList.remove('hidden'); $('#googleMap').innerHTML = '<div class="map-fallback">지도 API 키가 없어 안내 화면만 표시합니다.</div>'; return; }
  mapNotice.textContent = '지도를 불러오는 중입니다…';
  mapNotice.classList.remove('hidden');
  window.__kfocusInitMap = () => {
    map = new google.maps.Map($('#googleMap'), { center:getRegionCenter(currentRegion), zoom:12, gestureHandling:'cooperative', streetViewControl:false, mapTypeControl:false, fullscreenControl:false });
    ensureMarkerClusterer(()=>{ if(mapReady) redrawMapMarkers(); });
    mapReady = true;
    mapInfoWindow = new google.maps.InfoWindow();
    currentCenter = getRegionCenter(currentRegion);
    map.addListener('center_changed', ()=>{ const c = map.getCenter(); if(c) currentCenter = {lat:c.lat(), lng:c.lng()}; mapDirty = true; mapSearchAreaBtn?.classList.remove('hidden'); });
    map.addListener('zoom_changed', ()=>{ mapRadius = radiusByZoom(map.getZoom() || 12); mapDirty = true; mapSearchAreaBtn?.classList.remove('hidden'); });
    const applyCenter = () => {
      if(TEST_FORCE_CENTER || !navigator.geolocation){
        currentCenter = getRegionCenter(currentRegion);
        map.setCenter(getRegionCenter(currentRegion));
        map.setZoom(milesToZoom(mapRadius));
        redrawMapMarkers();
        mapNotice.classList.add('hidden');
        return;
      }
      navigator.geolocation.getCurrentPosition((pos)=>{
        currentCenter = {lat:pos.coords.latitude, lng:pos.coords.longitude};
        persistRegion(detectRegionFromCoords(currentCenter.lat, currentCenter.lng));
        map.setCenter(currentCenter);
        map.setZoom(milesToZoom(mapRadius));
        redrawMapMarkers();
        mapNotice.classList.add('hidden');
      }, ()=>{
        currentCenter = getRegionCenter(currentRegion);
        map.setCenter(getRegionCenter(currentRegion));
        map.setZoom(milesToZoom(mapRadius));
        redrawMapMarkers();
        mapNotice.classList.add('hidden');
      }, {enableHighAccuracy:true, timeout:6000, maximumAge:300000});
    };
    requestAnimationFrame(()=>{
      setTimeout(()=>{
        google.maps.event.trigger(map,'resize');
        applyCenter();
      }, 240);
    });
  };
  if(!document.getElementById('gmap-script')){
    const s=document.createElement('script'); s.id='gmap-script'; s.src=`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=__kfocusInitMap`; s.async=true; document.head.appendChild(s);
  } else if(window.google?.maps){ window.__kfocusInitMap(); }
}

function bindEvents(){
  $('#searchBtn')?.addEventListener('click', ()=>openSearchOverlay());
  $('#homeBrand')?.addEventListener('click', ()=>showPage('home'));
  $$('.nav-item').forEach(btn=>btn.addEventListener('click', ()=>showPage(btn.dataset.nav)));
  $('#menuBtn')?.addEventListener('click', openSideMenu); $('#sideClose')?.addEventListener('click', closeSideMenu); $('#sideOverlay')?.addEventListener('click', closeSideMenu);
  $('#sideRegionPicker')?.addEventListener('click', ()=>{ closeSideMenu(); openRegionPicker(); });
  $('#adminLoginBackdrop')?.addEventListener('click', closeAdminLoginModal);
  $('#adminLoginClose')?.addEventListener('click', closeAdminLoginModal);
  $('#adminLoginSubmit')?.addEventListener('click', handleAdminLogin);
  document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeSideMenu(); });
  $$('.side-link[data-nav], .text-link[data-nav]').forEach(btn=>btn.addEventListener('click', ()=>showPage(btn.dataset.nav)));
  $$('.board-link').forEach(btn=>btn.addEventListener('click', ()=>showBoard(btn.dataset.board)));
  communityTabs?.addEventListener('click', e=>{ const btn=e.target.closest('.community-tab'); if(!btn) return; renderHomeBoardSection(btn.dataset.board || 'notice'); });
  homeBoardMoreBtn?.addEventListener('click', ()=>showBoard(homeBoardMoreBtn.dataset.board || selectedBoardType || 'notice'));
  document.addEventListener('click', e=>{ const card = e.target.closest('.biz-open'); if(!card) return; if(Date.now() < suppressCardClickUntil) { e.preventDefault(); return; } currentDetailVideoOverride = ''; renderDetail(card.dataset.biz); lastBasePage = currentPage;
  showPage('business-detail'); });
document.addEventListener('click', e => {
  const tab = e.target.closest('[data-home-biz-tab]');
  if(!tab) return;

  homeBusinessTab = tab.dataset.homeBizTab || 'featured';
  renderHomeBusinessTabs();
});
document.getElementById('slideDetailClose')
  ?.addEventListener('click', closeSlideDetailModal);

document.getElementById('slideDetailBizBtn')
  ?.addEventListener('click', ()=>{

    if(!selectedSlideBizId) return;

    closeSlideDetailModal();

    renderDetail(selectedSlideBizId);

    lastBasePage = currentPage;

    showPage('business-detail');
});

document.querySelector('.community-more-btn')?.addEventListener('click', () => {
  const board = selectedBoardType || 'notice';
  selectedBoardType = board;
  showBoard(board);
  showPage('board-detail');
});
document.querySelector('.community-full-btn')?.addEventListener('click', () => {
  const board = selectedBoardType || 'notice';
  showBoard(board);
  showPage('board-detail');
});
document.getElementById('userLoginSubmit')?.addEventListener('click', async () => {
  const email = document.getElementById('userLoginEmail')?.value.trim();
  await loginWithEmail(email);
});
document.getElementById('userLoginClose')?.addEventListener('click', () => {
  closeUserLoginModal();
});
document.getElementById('userLoginClose')?.addEventListener('click', closeUserLoginModal);
  document.addEventListener('click', e=>{ const postBtn = e.target.closest('[data-board-post]'); if(!postBtn) return; openBoardPost(postBtn.dataset.boardPost); });
  categoryRow?.addEventListener('click', e=>{ const btn=e.target.closest('.category-chip'); if(!btn) return; businessQuickFilter = (businessQuickFilter === btn.dataset.cat ? '' : btn.dataset.cat); renderCategories(); renderBusinessList(); });
  businessSearch?.addEventListener('input', renderBusinessList);
  globalSearchInput?.addEventListener('input', ()=>{ clearTimeout(searchDebounce); searchDebounce = setTimeout(()=>renderSearchResults(globalSearchInput.value), 220); });
  searchCloseBtn?.addEventListener('click', closeSearchOverlay);
  searchClearBtn?.addEventListener('click', ()=>{ if(globalSearchInput){ globalSearchInput.value=''; renderSearchResults(''); globalSearchInput.focus(); } });
  searchOverlay?.addEventListener('click', e=>{ if(e.target === searchOverlay) closeSearchOverlay(); });
  recentSearches?.addEventListener('click', e=>{ const btn=e.target.closest('[data-recent-search]'); if(!btn || !globalSearchInput) return; globalSearchInput.value = btn.dataset.recentSearch || ''; renderSearchResults(globalSearchInput.value); globalSearchInput.focus(); });
  searchResults?.addEventListener('click', e=>{
    const bizBtn = e.target.closest('[data-search-type="business"]');
    if(bizBtn){ const id = bizBtn.dataset.biz; saveRecentSearch(globalSearchInput?.value || ''); closeSearchOverlay(); renderDetail(id); lastBasePage = currentPage; showPage('business-detail'); return; }
    const couponBtn = e.target.closest('[data-search-type="coupon"]');
    if(couponBtn){ const id = couponBtn.dataset.coupon; saveRecentSearch(globalSearchInput?.value || ''); closeSearchOverlay(); renderCouponDetail(id); lastBasePage = currentPage; showPage('coupon-detail'); return; }
    const boardBtn = e.target.closest('[data-search-type="board"]');
    if(boardBtn){ const key = boardBtn.dataset.boardResult || 'notice'; boardTitle.textContent = boardBtn.dataset.boardTitle || '게시판'; saveRecentSearch(globalSearchInput?.value || ''); closeSearchOverlay(); lastBasePage = currentPage; showPage('board-detail'); return; }
  });
  document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeSearchOverlay(); });
  mapSearchInput?.addEventListener('input', ()=>{ mapSearchQuery = (mapSearchInput.value || '').trim(); if(mapReady) redrawMapMarkers(); });
  mapSearchInput?.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); mapSearchInput.blur(); if(mapReady) redrawMapMarkers(); } });
  $('#couponTabs')?.addEventListener('click', e=>{ const btn=e.target.closest('.coupon-tab'); if(!btn) return; couponViewTab = btn.dataset.couponTab || 'today'; updateCouponTabUI(); });
  document.addEventListener('click', e=>{ const btn=e.target.closest('.coupon-open'); if(!btn) return; e.preventDefault(); renderCouponDetail(btn.dataset.coupon); lastBasePage = currentPage; showPage('coupon-detail'); });
  document.addEventListener('click', e=>{ const btn=e.target.closest('.coupon-use-open'); if(!btn) return; e.preventDefault(); renderCouponUse(btn.dataset.coupon); lastBasePage = currentPage; showPage('coupon-use'); });
  document.addEventListener('click', e=>{ const a=e.target.closest('.icon-action.call'); if(a && selectedBizId) logBusinessActivity(selectedBizId,'call'); const m=e.target.closest('.icon-action.map'); if(m && selectedBizId) logBusinessActivity(selectedBizId,'direction'); });
  mapFilterRow?.addEventListener('click', e=>{ const btn=e.target.closest('.map-filter-chip'); if(!btn) return; mapMode = btn.dataset.mapFilter || 'business'; if(mapMode!=='business') mapCategory=''; renderMapFilters(); if(mapReady) redrawMapMarkers(); });
  mapCategoryRow?.addEventListener('click', e=>{ const btn=e.target.closest('.map-category-chip'); if(!btn) return; mapCategory = btn.dataset.mapCat || '전체'; renderMapFilters(); if(mapReady) redrawMapMarkers(); });
  mapSearchAreaBtn?.addEventListener('click', ()=>{ if(!mapReady) return; mapRadius = radiusByZoom(map.getZoom() || 12); redrawMapMarkers(); mapDirty = false; mapSearchAreaBtn.classList.add('hidden'); });
  mapLocateBtn?.addEventListener('click', ()=>{ if(!mapReady || !navigator.geolocation) return; navigator.geolocation.getCurrentPosition((pos)=>{ currentCenter = { lat: pos.coords.latitude, lng: pos.coords.longitude }; persistRegion(detectRegionFromCoords(currentCenter.lat, currentCenter.lng)); map.setCenter(currentCenter); const zoom = Math.max(map.getZoom() || 12, 13); map.setZoom(zoom); mapRadius = radiusByZoom(zoom); redrawMapMarkers(); mapDirty = false; mapSearchAreaBtn?.classList.add('hidden'); }, ()=>{} , { enableHighAccuracy:true, timeout:6000, maximumAge:300000 }); });
  mapBottomList?.addEventListener('click', e=>{ const btn=e.target.closest('[data-map-biz]'); if(!btn) return; const biz = getBiz(btn.dataset.mapBiz); if(!biz || !map) return; const pos = { lat:Number(biz.lat), lng:Number(biz.lng) }; map.setZoom(Math.max(map.getZoom() || 12, 14)); panMapForVisibleInfo(pos.lat, pos.lng); if(mapInfoWindow){ mapInfoWindow.setContent(createInfoWindowContent(biz)); mapInfoWindow.setPosition(pos); mapInfoWindow.open({ map, shouldFocus:false }); }
  mapBottomPanel?.classList.add('collapsed'); });
  mapBottomClose?.addEventListener('click', ()=> mapBottomPanel?.classList.add('collapsed'));
  mapBottomPanel?.addEventListener('click', (e)=>{
    if(e.target === mapBottomPanel || e.target.closest('.map-bottom-head strong')) mapBottomPanel.classList.toggle('collapsed');
  });
  window.addEventListener('hashchange', ()=>showPage(getRoute()));
}

function openVideoModal(videoUrl){
  const modal = document.getElementById('videoModal');
  const body = document.getElementById('videoModalBody');
  if(!modal || !body || !videoUrl) return;

  const yt = getYouTubeId(videoUrl);
  const vertical = isVerticalVideo(videoUrl) ? 'vertical' : '';

  if(yt){
    body.className = `video-modal-body ${vertical}`;
    body.innerHTML = `
      <iframe
        src="https://www.youtube.com/embed/${yt}?autoplay=1&mute=1&playsinline=1"
        allow="autoplay; encrypted-media"
        allowfullscreen>
      </iframe>
    `;
  }

  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeVideoModal(){
  const modal = document.getElementById('videoModal');
  const body = document.getElementById('videoModalBody');
  if(!modal || !body) return;

  body.innerHTML = '';
  modal.classList.add('hidden');
  document.body.style.overflow = '';
}
function renderTodayCoupons(){
  const box = document.getElementById('todayCouponList');
  if(!box) return;

  const rows = typeof todayCoupons === 'function'
    ? todayCoupons().slice(0, 3)
    : (coupons || []).slice(0, 3);

  if(!rows.length){
    box.innerHTML = '<div class="board-empty">오늘 쿠폰이 없습니다.</div>';
    return;
  }

box.innerHTML = rows.map(c => {
  const b = getBiz(c.businessId || c.business_id) || {};
  const img = c.image_url || c.image || b.image || b.image_url || '/assets/kfocus-icon.png';

  return `
    <button class="today-deal-card coupon-open"
            type="button"
            data-coupon="${esc(c.id)}">

      <div class="today-deal-thumb">
        <img src="${esc(img)}" alt="${esc(c.title || '오늘의 쿠폰')}">
      </div>

      <div class="today-deal-content">
        <div class="today-deal-badge">TODAY DEAL</div>
        <strong>${esc(c.title || '오늘의 쿠폰')}</strong>
        <span>${esc(b.name || c.description || '')}</span>
      </div>

      <div class="today-deal-icon">
        <i data-lucide="ticket-percent"></i>
      </div>

    </button>
  `;
}).join('');

if(window.lucide){
  lucide.createIcons();
}

if(window.lucide){
  lucide.createIcons();
}
}
async function init(){
  await detectInitialRegion();

  const region = currentRegion || getPreferredRegion();
  localStorage.setItem('region', region);
  if (region && window.OneSignalDeferred) {
    OneSignalDeferred.push(async function (OneSignal) {
      await OneSignal.User.addTag("region", region);
    });
  }

await loadRealData();
await refreshCurrentUser();

updateTopRegionLabel();
  renderHero(); bindHeroSwipe(); setSlide(0); restartAuto();
  renderHome(); renderCategories(); renderBusinessList(); renderCoupons(); renderDetail(selectedBizId); renderMapFilters(); renderRecentSearches(); bindEvents(); initIosInstallBanner(); initAndroidInstallBanner(); hideRegionUi(); initPageSwipe();
  openAdminLoginModalFromQuery();
  showPage(getRoute());
  initRegionPicker();
  hideRegionUi();
}
init();


function setMapPageMode(isMap) {
  document.body.classList.toggle('map-page-open', !!isMap);
  document.documentElement.classList.toggle('map-page-open', !!isMap);

  setTimeout(() => {
    window.dispatchEvent(new Event('resize'));
    if (window.google?.maps?.event && window.map) {
      window.google.maps.event.trigger(window.map, 'resize');
    }
  }, 200);
}


document.addEventListener('click', (e) => {
  const nav = e.target.closest('[data-nav]');
  if (!nav) return;
  const page = nav.getAttribute('data-nav');
  setMapPageMode(page === 'map');
});
function requestPush() {
  window.OneSignalDeferred.push(async function(OneSignal) {
    await OneSignal.Notifications.requestPermission();

    console.log('permission:', OneSignal.Notifications.permission);
    console.log('optedIn:', OneSignal.User.PushSubscription.optedIn);
  });
}

window.openBusinessMapCard = function(id){
  const biz = (typeof getBiz === 'function' ? getBiz(id) : null) || (Array.isArray(businesses) ? businesses.find(v => String(v.id) === String(id)) : null);
  if(!biz) return false;

  currentDetailVideoOverride = '';
  mapMode = 'business';
  mapSearchQuery = '';
  selectedBizId = biz.id;

  if (biz.region) {
    persistRegion(biz.region);
  }

  lastBasePage = currentPage;
  if (typeof setMapPageMode === 'function') setMapPageMode(true);
  showPage('map');

  setTimeout(() => {
    if (!mapReady && typeof initGoogleMap === 'function') initGoogleMap();

    const lat = Number(biz.lat);
    const lng = Number(biz.lng);

    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      currentCenter = { lat, lng };

      if (map && window.google?.maps) {
        map.setZoom(Math.max(map.getZoom() || 12, 14));
        panMapForVisibleInfo(lat, lng);

        if (typeof redrawMapMarkers === 'function') {
          redrawMapMarkers();
        }

        if (typeof mapInfoWindow !== 'undefined' && mapInfoWindow) {
          mapInfoWindow.setContent(createInfoWindowContent({ ...biz, lat, lng }));
          mapInfoWindow.setPosition({ lat, lng });
          mapInfoWindow.open({ map, shouldFocus:false });
        }
      }
    }

    if (typeof renderMapBottomList === 'function') {
      renderMapBottomList([biz]);
    }
    mapBottomPanel?.classList.remove('hidden');
    mapBottomPanel?.classList.remove('collapsed');
  }, 320);

  return false;
};


// ===== REGION PICKER =====
function openRegionPicker(){
  if(getForcedRegionByHost()) return;
  const modal = document.getElementById('regionPickerModal');
  if(!modal) return;
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
}

function closeRegionPicker(){
  const modal = document.getElementById('regionPickerModal');
  if(!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
}

function updateRegionPickerLabels(){
  const forced = getForcedRegionByHost();
  const r = forced || localStorage.getItem('region') || 'dallas';
  const label = r === 'colorado' ? 'Denver Metro' : 'DaltownMap';
  const side = document.getElementById('sideCurrentRegionLabel');
  if(side) side.textContent = label;
}

function initRegionPicker(){
  if(getForcedRegionByHost()){
    updateRegionPickerLabels();
    hideRegionUi();
    return;
  }

  const saved = localStorage.getItem('region');

  if(!saved){
    setTimeout(()=>openRegionPicker(), 300);
  }

  updateRegionPickerLabels();

  document.querySelectorAll('[data-region]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      localStorage.setItem('region', btn.dataset.region);
      updateRegionPickerLabels();
      closeRegionPicker();
      location.reload();
    });
  });
}

function isIos() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
}

function showIosGuide() {
  if (isIos() && !isStandalone()) {
    const shown = localStorage.getItem('iosGuideShown');
    if (!shown) {
      document.getElementById('iosGuide').style.display = 'block';

      // 5초 후 자동 숨김
      setTimeout(() => {
        document.getElementById('iosGuide').style.display = 'none';
      }, 5000);

      localStorage.setItem('iosGuideShown', '1');
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  showIosGuide();
});
function isIosDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isSafariBrowser() {
  const ua = navigator.userAgent.toLowerCase();
  return ua.includes('safari') && !ua.includes('crios') && !ua.includes('fxios') && !ua.includes('edgios');
}

function isStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function shouldShowIosInstallBanner() {
  if (!isIosDevice()) return false;
  if (!isSafariBrowser()) return false;
  if (isStandaloneMode()) return false;

  const hiddenUntil = Number(localStorage.getItem('ios_install_banner_hidden_until') || 0);
  return Date.now() > hiddenUntil;
}

function initIosInstallBanner() {
  const banner = document.getElementById('iosInstallBanner');
  const guideBtn = document.getElementById('iosInstallGuideBtn');
  const closeBtn = document.getElementById('iosInstallCloseBtn');

  if (!banner) return;

  if (shouldShowIosInstallBanner()) {
    setTimeout(() => {
      banner.classList.remove('hidden');
    }, 1800);
  }

guideBtn?.addEventListener('click', () => {
  document.getElementById('iosInstallGuideOverlay')?.classList.remove('hidden');
});

document.getElementById('iosGuideCloseBtn')?.addEventListener('click', () => {
  document.getElementById('iosInstallGuideOverlay')?.classList.add('hidden');
});

document.querySelector('#iosInstallGuideOverlay .ios-guide-dim')?.addEventListener('click', () => {
  document.getElementById('iosInstallGuideOverlay')?.classList.add('hidden');
});

  closeBtn?.addEventListener('click', () => {
    localStorage.setItem(
      'ios_install_banner_hidden_until',
      String(Date.now() + 1000 * 60 * 60 * 24 * 1)
    );
    banner.classList.add('hidden');
  });
}
let deferredInstallPrompt = null;

function isAndroidDevice() {
  return /android/i.test(navigator.userAgent);
}

function isStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function shouldShowAndroidInstallBanner() {
  if (!isAndroidDevice()) return false;
  if (isStandaloneMode()) return false;

  const hiddenUntil = Number(localStorage.getItem('android_install_banner_hidden_until') || 0);
  return Date.now() > hiddenUntil;
}

window.addEventListener('beforeinstallprompt', (e) => {
  console.log('[PWA] beforeinstallprompt fired');
  e.preventDefault();
  deferredInstallPrompt = e;

  if (shouldShowAndroidInstallBanner()) {
    document.getElementById('androidInstallBanner')?.classList.remove('hidden');
  }
});

window.addEventListener('appinstalled', () => {
  console.log('[PWA] appinstalled fired');
  deferredInstallPrompt = null;
  document.getElementById('androidInstallBanner')?.classList.add('hidden');
});

function initAndroidInstallBanner() {
  const banner = document.getElementById('androidInstallBanner');
  const installBtn = document.getElementById('androidInstallBtn');
  const closeBtn = document.getElementById('androidInstallCloseBtn');

  if (!banner || !installBtn || !closeBtn) return;

  if (isAndroidDevice() && !isStandaloneMode()) {
    console.log('[PWA] Android detected, waiting for beforeinstallprompt');
  }

  closeBtn.addEventListener('click', () => {
    localStorage.setItem(
      'android_install_banner_hidden_until',
      String(Date.now() + 1000 * 60 * 60 * 24 * 1)
    );
    banner.classList.add('hidden');
  });

  installBtn.addEventListener('click', async () => {
    console.log('[PWA] install button clicked');

    if (!deferredInstallPrompt) {
      console.log('[PWA] deferredInstallPrompt is null');
      alert('아직 설치 창을 띄울 수 없는 상태입니다. 잠시 후 다시 시도해 주세요.');
      return;
    }

    deferredInstallPrompt.prompt();

    try {
      const choice = await deferredInstallPrompt.userChoice;
      console.log('[PWA] userChoice:', choice);
    } catch (err) {
      console.warn('[PWA] install prompt result unavailable:', err);
    }

    deferredInstallPrompt = null;
    banner.classList.add('hidden');
  });
}