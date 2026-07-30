console.info('[DalTownMap] V100 iPhone PWA public-data refresh loaded');
// DalTownMap V45.3.0 recommended-business mode fix
console.log('[DalTownMap] V51.7 main feed sync loaded');
console.log('[DalTownMap] v8.4 theme-banner-carousel loaded');
console.info('[DalTownMap] v8.1 deployment-fixed loaded');

const FALLBACK_BUSINESSES = [
  { id:'hmart', name:'H Mart Aurora', category:'마트', address:'2751 S Parker Rd, Aurora, CO', phone:'303-745-4592', image:'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1200&q=80', featured:true, featured_rank:1, is_new:true, new_rank:1, is_popular:true, popular_rank:1, coupon:true, video:true, desc:'콜로라도 대표 마트형 업소 예시입니다.', website:'https://www.hmart.com', email:'info@hmart.com', lat:39.6662, lng:-104.8315, created_at:'2026-03-10', region:'colorado', promo_enabled:true, promo_text:'오늘의 특별 할인!' },
  { id:'seoul', name:'Seoul BBQ Denver', category:'한식 BBQ', address:'2080 S Havana St, Aurora, CO', phone:'303-337-2000', image:'https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=1200&q=80', coupon:true, is_new:true, new_rank:2, desc:'점심 특선과 저녁 바비큐 메뉴를 홍보하는 업소 예시입니다.', email:'hello@seoulbbq.example', lat:39.6792, lng:-104.8658, created_at:'2026-03-09', region:'colorado' },
  { id:'beauty', name:'Beauty Town', category:'미용', address:'1234 Havana St, Aurora, CO', phone:'303-555-1234', image:'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?auto=format&fit=crop&w=1200&q=80', featured:true, featured_rank:2, desc:'뷰티 업소 예시입니다.', lat:39.671, lng:-104.86, created_at:'2026-03-08', region:'colorado' },
  { id:'manna', name:'Manna BBQ', category:'한식', address:'8100 E Arapahoe Rd, Greenwood Village, CO', phone:'303-790-9292', image:'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80', is_popular:true, popular_rank:2, desc:'인기 업소 예시입니다.', lat:39.595, lng:-104.897, created_at:'2026-03-07', region:'colorado' },
  { id:'ace', name:'Ace Mart', category:'마켓', address:'1111 S Federal Blvd, Denver, CO', phone:'303-555-9876', image:'https://images.unsplash.com/photo-1604719312566-8912e9c8a213?auto=format&fit=crop&w=1200&q=80', coupon:true, is_popular:true, popular_rank:3, desc:'쿠폰 노출 업소 예시입니다.', lat:39.695, lng:-105.027, created_at:'2026-03-06', region:'colorado' },
  { id:'wonder', name:'Wonder Bakery', category:'베이커리', address:'555 Bakery St, Aurora, CO', phone:'303-555-2222', image:'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=1200&q=80', coupon:true, desc:'오늘 쿠폰 시안용 업소입니다.', lat:39.68, lng:-104.84, created_at:'2026-03-05', region:'colorado' }
];
let businesses = [];
let homeBusinessTab = 'featured';
let coupons = [];
let dalpicks = [];
let couponViewTab = 'today';
let selectedCouponId = null;
let couponUseTimer = null;
let currentPage = 'home';
let lastBasePage = 'home';
let selectedBizId = businesses[0]?.id || null;
let currentUser = null;
let authClient = null;
let currentLocationMarker = null;
let currentLocationPosition = null;
let currentLocationWatchId = null;
let currentLocationTrackingEnabled = false;
let suppressMapUiChange = false;
let slideIndex = 0; let autoTimer = null; let map = null; let mapReady = false; let markers = []; let markerCluster = null; let markerClusterReady = false; let selectedCategory = '전체'; let heroSlides = []; let currentCenter = null; let mapMode = 'business'; let mapRadius = '7'; let mapCategory = ''; let eventPins = []; let mapDirty = false; let selectedMapBusinessId = ''; let mapVisibleCounts = { business:0, coupon:0, event:0 }; let mapVisibleCategoryCounts = {}; 
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

let currentRegion = getAppRegion();
localStorage.setItem('region', currentRegion);
let suppressCardClickUntil = 0;
let boardPosts = [];
let alertNoticePosts = [];
let slideRows = [];
let currentDetailVideoOverride = '';
let businessQuickFilter = '';
let selectedBoardType = 'notice';
let boardDetailReturn = { mode: 'page', page: 'home', type: 'notice' };
let selectedBoardPost = null;
let adminSession = false;
const ADMIN_EMAIL = 'admin@kfocusapp.com';
let mapSearchQuery = '';
let searchDebounce = null;
const RECENT_SEARCH_KEY = 'kfocus_recent_searches';
const FALLBACK_BOARD_POSTS = [
  { id:'notice-1', type:'notice', title:'행사 안내', content:'지역 행사와 공지 예시입니다.' },
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
const mapBottomTitle = $('#mapBottomTitle');
const mapBottomStatus = $('#mapBottomStatus');
const mapBusinessPreview = $('#mapBusinessPreview');
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

function getConfig(){ return window.KFOCUS_CONFIG || window.APP_CONFIG || {}; }
function getAppCity() {
  const cfg = getConfig();

  return String(
    cfg.APP_CITY ||
    cfg.app_city ||
    'dallas'
  )
    .trim()
    .toLowerCase();
}

function getAppRegion() {
  const cfg = getConfig();

  return String(
    cfg.APP_REGION ||
    cfg.app_region ||
    getAppCity()
  )
    .trim()
    .toLowerCase();
}

function getAppCityLabel() {
  const cfg = getConfig();

  return String(
    cfg.APP_CITY_LABEL ||
    cfg.app_city_label ||
    getAppCity()
  ).trim();
}

function isSingleCityMode() {
  const cfg = getConfig();

  const value =
    cfg.APP_SINGLE_CITY ??
    cfg.app_single_city;

  return value === true || value === 'true';
}
function homeBusinessItemHTML(b){
  const img = b.image || b.image_url || '/assets/kfocus-icon.png';
  const rating = b.rating ? Number(b.rating).toFixed(1) : '';
  const premiumBadge = isPremiumBusiness(b) ? '<span class="home-premium-badge">PREMIUM</span>' : '';
  const videoBadge = (b.video_url || b.youtube_url) ? '<span class="home-video-badge">▶ 영상</span>' : '';

  return `
    <button class="home-biz-map-card biz-open" type="button" data-biz="${esc(b.id)}">
      <img class="home-biz-map-img" src="${esc(img)}" alt="${esc(b.name || '')}">

      <div class="home-biz-map-main">
        <div class="home-biz-map-name">${esc(b.name || '이름 없음')} ${premiumBadge} ${videoBadge}</div>
        <div class="home-biz-map-location">📍 ${esc(b.area || 'Dallas, TX')}</div>
      </div>

      <div class="home-biz-map-side">
        <span class="home-biz-map-cat">${esc(b.subcategory || b.category_sub || b.subcategory_ko || b.category_ko || b.category || '업소')}</span>
        ${rating ? `<span class="home-biz-map-rating">★ ${esc(rating)}</span>` : ''}
      </div>
    </button>
  `;
}
function todayKey(){
  return new Date().toISOString().slice(0, 10);
}
function isBusinessVisibleByPaidDate(b){
  const hasPaidAd =
    b.paid_active === true ||
    (b.paid_product && b.paid_product !== 'none') ||
    b.paid_start_at ||
    b.paid_end_at;

  if(!hasPaidAd) return true;

  const today = new Date().toISOString().slice(0, 10);

  if(b.paid_start_at && b.paid_start_at > today) return false;
  if(b.paid_end_at && b.paid_end_at < today) return false;

  return true;
}
function businessGroupRank(b, section){
  if(section === 'featured') return Number(b.featured_rank ?? 1000);
  if(section === 'new') return Number(b.new_rank ?? 1000);
  if(section === 'popular') return Number(b.popular_rank ?? 1000);
  return 1000;
}
function rotationDateKey(dateValue){
  return String(dateValue || new Date().toISOString().slice(0,10)).slice(0,10);
}
function rotationEligibleOnDate(b, dateValue){
  if(b.is_active === false || b.list_visible === false) return false;
  const dateKey = rotationDateKey(dateValue);
  if(b.paid_start_at && String(b.paid_start_at).slice(0,10) > dateKey) return false;
  if(b.paid_end_at && String(b.paid_end_at).slice(0,10) < dateKey) return false;
  return true;
}
function rotationHash(seed){
  let h = 2166136261;
  for(let i=0;i<seed.length;i++){
    h ^= seed.charCodeAt(i);
    h += (h<<1)+(h<<4)+(h<<7)+(h<<8)+(h<<24);
  }
  return Math.abs(h>>>0);
}
function homeRotationRows(rows, section, dateValue, limit=6){
  const dateKey=rotationDateKey(dateValue);
  const eligible=rows.filter(b=>rotationEligibleOnDate(b,dateKey));
  const fixed=eligible.filter(b=>b.rotation_enabled===false)
    .sort((a,b)=>businessGroupRank(a,section)-businessGroupRank(b,section)||String(b.created_at||'').localeCompare(String(a.created_at||'')));
  const automatic=eligible.filter(b=>b.rotation_enabled!==false)
    .sort((a,b)=>{
      const aw=Math.max(1,Number(a.paid_weight||1));
      const bw=Math.max(1,Number(b.paid_weight||1));
      return rotationHash(`${dateKey}-${section}-${a.id}`)/aw-rotationHash(`${dateKey}-${section}-${b.id}`)/bw;
    });
  return fixed.concat(automatic).slice(0,limit);
}

function renderHomeBusinessTabs(){
  const box = document.getElementById('homeBusinessTabList');
  if(!box) return;

  $$('.home-business-tab').forEach(btn=>{
    btn.classList.toggle('active', btn.dataset.homeBizTab === homeBusinessTab);
  });

  let rows = [];

  if(homeBusinessTab === 'featured'){
    rows = businesses.filter(b => b.is_featured && isBusinessVisibleByPaidDate(b));
  } else if(homeBusinessTab === 'new'){
    rows = businesses.filter(b => b.is_new && isBusinessVisibleByPaidDate(b));
  } else if(homeBusinessTab === 'popular'){
    rows = businesses.filter(b => b.is_popular && isBusinessVisibleByPaidDate(b));
  }

  rows = homeRotationRows(rows, homeBusinessTab, todayKey(), 6);

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

async function shareBusiness(id) {

    const b = businesses.find(x => String(x.id) === String(id));
    if (!b) return;

    // 공유될 주소
    const url = `${location.origin}/#business-detail?id=${id}`;

    const title = b.name_ko || b.name_en || "DalTownMap";

    const rating = b.rating
        ? `⭐ ${Number(b.rating).toFixed(1)} (${b.review_count || 0})`
        : "";

    const address = b.address || "";

    const text = [
        title,
        rating,
        address,
        "",
        "DalTownMap에서 확인하기"
    ].filter(Boolean).join("\n");

    if (navigator.share) {
        try{
            await navigator.share({
                title,
                text,
                url
            });
            return;
        }catch(e){
            return;
        }
    }

    const shareText = `${text}\n${url}`;

    try{
        await navigator.clipboard.writeText(shareText);
        alert("업소 정보가 복사되었습니다.");
    }catch{
        prompt("아래 내용을 복사하세요.", shareText);
    }
}
async function fetchGooglePlaceRating(placeId) {

    if (!placeId) return null;

    if (!window.google?.maps) {
        console.warn("Google Maps가 아직 로드되지 않았습니다.");
        return null;
    }

    const { Place } = await google.maps.importLibrary("places");

    const place = new Place({
        id: String(placeId)
    });

    await place.fetchFields({
        fields: [
            "displayName",
            "rating",
            "userRatingCount"
        ]
    });

    return {
        rating: place.rating ?? null,
        reviewCount: place.userRatingCount ?? 0
    };
}
async function shareBoardPost(postId) {
  const post = boardPosts.find(
    p => String(p.id) === String(postId)
  );

  if (!post) {
    alert("게시글 정보를 찾을 수 없습니다.");
    return;
  }

  const title = post.title || "DalTownMap 게시글";

  const contentText = String(
    post.content || post.description || ""
  )
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);

  const url =
    `${location.origin}${location.pathname}` +
    `#board-detail?type=${encodeURIComponent(post.type || "event")}` +
    `&id=${encodeURIComponent(post.id)}`;

  const text = [
    title,
    contentText,
    "",
    "DalTownMap에서 확인하기"
  ]
    .filter(Boolean)
    .join("\n");

  if (navigator.share) {
    try {
      await navigator.share({
        title,
        text,
        url
      });
      return;
    } catch (e) {
      if (e?.name === "AbortError") return;
    }
  }

  const shareText = `${text}\n${url}`;

  try {
    await navigator.clipboard.writeText(shareText);
    alert("게시글 주소가 복사되었습니다.");
  } catch (e) {
    prompt("아래 내용을 복사하세요.", shareText);
  }
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

function normalizeBoardType(v = '') {
  const s = normalizeSearchText(v);
  if (['notice','event','events','local','community','지역소식','행사','공지','공지/행사','행사안내'].includes(s)) return 'notice';
  if (['life','lifestyle','news','column','news-column','라이프','뉴스','칼럼','뉴스·칼럼','뉴스/칼럼','달라스 라이프'].includes(s)) return 'life';
  if (['business_story','business-story','업소탐방','탐방'].includes(s)) return 'business_story';
  if (['guide','dallas-guide','dallas_guide','가이드','달라스 가이드'].includes(s)) return 'guide';
  if (['business','biz','job','jobs','realestate','property','rent','rental','sale','비즈니스','구인','구직','구인구직','구인/구직','렌트','임대','매매','부동산','하우징','업체홍보','창업'].includes(s)) return 'business';
  return 'notice';
}

function boardLabel(type) {
  return { notice: '행사안내', life: '달라스 라이프', guide: '달라스 가이드', business_story: '업소탐방' }[normalizeBoardType(type)] || '행사안내';
}

function boardThumbEmoji(type) {
  return { notice: '📅', life: '📰', guide: '📘', business_story: '🏪' }[normalizeBoardType(type)] || '📝';
}
function parseBoardGallery(value){
  if(Array.isArray(value)) return value.filter(Boolean);
  if(typeof value === 'string' && value.trim()){
    try { const parsed = JSON.parse(value); if(Array.isArray(parsed)) return parsed.filter(Boolean); } catch(e){}
    return value.split(/\r?\n|,/).map(v=>v.trim()).filter(Boolean);
  }
  return [];
}
function boardImages(post){
  return [...new Set([post.image_url, ...parseBoardGallery(post.gallery_urls)].filter(Boolean))];
}
function autoLinkText(value=''){
  const escaped = esc(value).replace(/\n/g,'<br>');
  return escaped.replace(/(https?:\/\/[^\s<]+)/g, '<a class="board-inline-link" href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
}
function isPremiumBusiness(b){
  if(!b || !b.paid_active || b.paid_product !== 'premium') return false;
  const today = new Date().toISOString().slice(0,10);
  if(b.paid_start_at && String(b.paid_start_at).slice(0,10) > today) return false;
  if(b.paid_end_at && String(b.paid_end_at).slice(0,10) < today) return false;
  return true;
}
function boardPostsByType(type){
  const hiddenThemeTitles=new Set((dalpicks||[]).filter(isThemeDalpick).map(d=>String(d.title||'').trim()).filter(Boolean));
  return boardPosts
    .filter(p=>
      normalizeBoardType(p.type)===type &&
      p.is_active!==false &&
      !hiddenThemeTitles.has(String(p.title||'').trim()) &&
      (adminSession || !p.region || normalizeRegionKey(p.region)===currentRegion)
    )
    .sort((a,b)=>{
      const ap=a.is_pinned===true;
      const bp=b.is_pinned===true;
      if(ap!==bp) return ap ? -1 : 1;
      if(ap && bp){
        const orderDiff=Number(a.pin_order||999)-Number(b.pin_order||999);
        if(orderDiff) return orderDiff;
      }
      return Date.parse(b.created_at||b.updated_at||0)-Date.parse(a.created_at||a.updated_at||0);
    });
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
    'id,business_id,title,content,type,subtype,region,image_url,image_link_url,gallery_urls,video_url,external_url,link_label,author_name,address,phone,start_at,end_at,is_active,is_pinned,pin_order,is_alert_notice,alert_order,created_at',
    'id,business_id,title,content,type,subtype,region,image_url,image_link_url,gallery_urls,video_url,external_url,link_label,author_name,start_at,end_at,is_active,is_pinned,pin_order,is_alert_notice,alert_order,created_at',
    'id,business_id,title,content,type,subtype,region,image_url,image_link_url,gallery_urls,video_url,external_url,link_label,author_name,is_active,is_pinned,pin_order,is_alert_notice,alert_order,created_at'
  ];
  for(const table of tryTables){
    for(const select of selects){
      try {
        const url = `${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}&order=created_at.desc.nullslast&limit=500`;
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
			image_link_url: row.image_link_url || '',
            gallery_urls: row.gallery_urls || [],
            external_url: row.external_url || '',
            link_label: row.link_label || '',
            author_name: row.author_name || '',
            subtype: row.subtype || '',
			video_url: row.video_url || '',
            address: row.address || '',
            phone: row.phone || '',
            business_id: row.business_id || '',
            start_at: row.start_at || '',
            end_at: row.end_at || '',
            is_active: row.is_active !== false,
            is_pinned: row.is_pinned === true,
            pin_order: Number(row.pin_order || 999),
            is_alert_notice: row.is_alert_notice === true,
            alert_order: Number(row.alert_order || 999),
            created_at: row.created_at || ''
          }));
          return true;
        }
      } catch(e){}
    }
  }
  return false;
}


async function loadAlertNoticePostsFromSupabase(){
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = getConfig();
  alertNoticePosts = [];
  if(!SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
  try{
    const select='id,title,content,type,region,external_url,start_at,end_at,is_active,is_alert_notice,alert_order,created_at';
    const params=new URLSearchParams({
      select,
      is_alert_notice:'eq.true',
      order:'alert_order.asc.nullslast,created_at.desc.nullslast',
      limit:'100'
    });
    const res=await fetch(`${SUPABASE_URL}/rest/v1/posts?${params.toString()}`,{headers:{apikey:SUPABASE_ANON_KEY,Authorization:`Bearer ${SUPABASE_ANON_KEY}`},cache:'no-store'});
    if(!res.ok){console.warn('[V85 alert] direct notice query failed',res.status,await res.text().catch(()=>''));return false;}
    const rows=await res.json();
    alertNoticePosts=(Array.isArray(rows)?rows:[]).map(row=>({
      id:row.id, title:row.title||'달타운 공지', content:row.content||'', type:normalizeBoardType(row.type),
      region:row.region||'', external_url:row.external_url||'', start_at:row.start_at||'', end_at:row.end_at||'',
      is_active:row.is_active!==false, is_alert_notice:row.is_alert_notice===true, alert_order:Number(row.alert_order||999), created_at:row.created_at||''
    }));
    console.info('[V85 alert] direct notices loaded',{count:alertNoticePosts.length,ids:alertNoticePosts.map(x=>x.id)});
    return true;
  }catch(e){console.warn('[V85 alert] direct notice query error',e);return false;}
}

let boardPostsLastRefreshAt = 0;
let boardPostsRefreshBusy = false;
async function refreshBoardPostsSilently({force=false}={}){
  if(boardPostsRefreshBusy) return false;
  const now=Date.now();
  if(!force && now-boardPostsLastRefreshAt<30000) return false;
  boardPostsRefreshBusy=true;
  const before=String(boardPosts[0]?.id||'')+'|'+String(boardPosts[0]?.created_at||'');
  try{
    await loadBoardPostsFromSupabase();
    await loadAlertNoticePostsFromSupabase();
    syncBusinessStoriesToBoardPosts();
    boardPostsLastRefreshAt=Date.now();
    const after=String(boardPosts[0]?.id||'')+'|'+String(boardPosts[0]?.created_at||'');
    const changed=before!==after;
    if(currentPage==='home') renderHomeBoardSection(selectedBoardType||'notice');
    if(currentPage==='board-detail' && !selectedBoardPost) renderBoardPage(selectedBoardType||'notice');
    // V84: 게시판 공지가 새로 로드된 직후 달타운 알림도 반드시 다시 그립니다.
    // 직접 입력 문구가 비어 있어도 is_alert_notice=true인 게시글만으로 알림이 표시되어야 합니다.
    if(typeof renderDalpicks==='function') renderDalpicks();
    return changed;
  }catch(e){
    console.warn('[Board Refresh] 최신 게시글 확인 실패',e);
    return false;
  }finally{
    boardPostsRefreshBusy=false;
  }
}

function parseBoardGalleryUrls(value){
  if(Array.isArray(value)) return value.map(v=>String(v||'').trim()).filter(Boolean);
  const raw=String(value||'').trim(); if(!raw) return [];
  try{const p=JSON.parse(raw);if(Array.isArray(p)) return p.map(v=>String(v||'').trim()).filter(Boolean);}catch(_){ }
  return raw.split(/\r?\n|,/).map(v=>v.trim()).filter(Boolean);
}
function boardPostImages(post){return [...new Set([String(post.image_url||'').trim(),...parseBoardGalleryUrls(post.gallery_urls)].filter(Boolean))];}
function renderBoardImageSlider(post){
  const images=boardPostImages(post); if(!images.length) return '';
  if(images.length===1){const img=`<img class="board-detail-image" src="${esc(images[0])}" alt="${esc(post.title||'게시글 이미지')}" loading="lazy">`;return post.image_link_url?`<a class="board-detail-image-link" href="${esc(post.image_link_url)}" target="_blank" rel="noopener noreferrer">${img}</a>`:img;}
  return `<section class="board-post-gallery" data-board-gallery><div class="board-post-gallery-viewport"><div class="board-post-gallery-track">${images.map((url,i)=>`<div class="board-post-gallery-slide">${i===0&&post.image_link_url?`<a href="${esc(post.image_link_url)}" target="_blank" rel="noopener noreferrer"><img src="${esc(url)}" alt="${esc(post.title||'게시글 이미지')} ${i+1}"></a>`:`<img src="${esc(url)}" alt="${esc(post.title||'게시글 이미지')} ${i+1}">`}</div>`).join('')}</div><button class="board-post-gallery-arrow prev" type="button">‹</button><button class="board-post-gallery-arrow next" type="button">›</button><div class="board-post-gallery-dots">${images.map((_,i)=>`<button type="button" class="board-post-gallery-dot ${i===0?'active':''}" data-gallery-dot="${i}"></button>`).join('')}</div><div class="board-post-gallery-count"><span data-gallery-current>1</span> / ${images.length}</div></div></section>`;
}
function initBoardImageSlider(root=document){
  root.querySelectorAll('[data-board-gallery]').forEach(g=>{if(g.dataset.ready==='true')return;g.dataset.ready='true';const t=g.querySelector('.board-post-gallery-track'),s=[...g.querySelectorAll('.board-post-gallery-slide')],d=[...g.querySelectorAll('[data-gallery-dot]')],c=g.querySelector('[data-gallery-current]');if(!t||s.length<2)return;let i=0,x=0;const go=n=>{i=(n+s.length)%s.length;t.style.transform=`translateX(-${i*100}%)`;d.forEach((e,k)=>e.classList.toggle('active',k===i));if(c)c.textContent=String(i+1);};g.querySelector('.prev')?.addEventListener('click',()=>go(i-1));g.querySelector('.next')?.addEventListener('click',()=>go(i+1));d.forEach(e=>e.addEventListener('click',()=>go(Number(e.dataset.galleryDot||0))));g.addEventListener('touchstart',e=>{x=e.touches[0]?.clientX||0},{passive:true});g.addEventListener('touchend',e=>{const dx=(e.changedTouches[0]?.clientX||0)-x;if(Math.abs(dx)>45)go(dx<0?i+1:i-1)},{passive:true});});
}
/* loadBoardPostsFromSupabase() select에 gallery_urls 추가 */
/* rows.map()에 gallery_urls: parseBoardGalleryUrls(row.gallery_urls), 추가 */
/* renderBoardPage()의 ${imageHtml}를 ${renderBoardImageSlider(post)}로 교체 */
/* page.innerHTML 직후 initBoardImageSlider(page); 호출 */

function businessSearchResults(query){
  const q = normalizeSearchText(query);
  if(!q) return [];
  return businesses.filter(b => queryMatches(q, [b.name, b.name_en, b.category, b.category_main, b.category_sub, b.subcategory, b.search_keywords, b.address, b.region, getMainCategoryLabel(b.category)])).slice(0,8);
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
  if(searchBusinessList) searchBusinessList.innerHTML = biz.map(b=>`<button class="search-result-item" data-search-type="business" data-biz="${esc(b.id)}"><strong>${esc(b.name)}</strong><span>${esc(getBusinessDisplayCategory(b))} · ${esc(b.address || b.region || '')}</span></button>`).join('');
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
  const raw = String(cat || '').trim();
  if(['식당','쇼핑','병원','금융','법률','종교','서비스','부동산'].includes(raw)) return raw;
  const s = raw.toLowerCase();

  if (/식당|restaurant|bbq|치킨|분식|한식|중식|일식|카페|bakery|베이커리|cafe|coffee|디저트|dessert/.test(s)) return '식당';
  if (/쇼핑|마트|마켓|잡화|수산|의류|전자|gift|liquor|주류|wine|beer|spirits|store|market|shopping/.test(s)) return '쇼핑';
  if (/병원|치과|한의원|약국|의원|clinic|medical|doctor|dental|pharmacy/.test(s)) return '병원';
  if (/금융|은행|보험|회계|세무|finance|financial|mortgage|loan|bank|investment|accounting|tax/.test(s)) return '금융';
  if (/법률|변호사|법무|이민|교통사고|가정법|law|lawyer|attorney|legal|immigration/.test(s)) return '법률';
  if (/종교|교회|성당|사찰|절|church|catholic|mission|선교|temple/.test(s)) return '종교';
  if (/부동산|리얼터|렌트|매매|realtor|real estate|lease|rental|property/.test(s)) return '부동산';
  if (/자동차|정비|카센터|오토|auto|repair|body shop|mechanic|tire/.test(s)) return '서비스';

  return '서비스';
}
function getBusinessDisplayCategory(b={}){
  const main = getMainCategoryLabel(b.map_category || b.category_main || b.category || '');
  const candidates = [b.subcategory, b.category_sub, b.subcategory_ko];
  for (const value of candidates) {
    const label = String(value || '').trim();
    if (label && label !== main) return label;
  }
  return main || '업소';
}
function mapModeLabel(mode){
  return mode === 'coupon' ? '쿠폰' : mode === 'event' ? '행사' : '업소';
}
function renderMapFilters(){
  $$('.map-filter-chip').forEach(btn=>{
    const mode = btn.dataset.mapFilter;
    const count = Number(mapVisibleCounts[mode] || 0);
    btn.classList.toggle('active', mode===mapMode);
    btn.classList.toggle('hidden', count < 1);
    btn.textContent = `${mapModeLabel(mode)} ${count}`;
  });
}

function renderMapCategorySummary(list=[]){
  if(!mapCategoryRow) return;
  const rows = Array.isArray(list) ? list : [];
  const counts = rows.reduce((acc,b)=>{
    const label = getMainCategoryLabel(b.category);
    if(label) acc[label] = (acc[label] || 0) + 1;
    return acc;
  },{});
  const order = ['식당','쇼핑','병원','금융','법률','종교','서비스','부동산'];
  const items = order.filter(label=>counts[label] > 0);
  mapCategoryRow.innerHTML = items.map(label=>`<button class="map-category-summary-chip${mapCategory===label?' active':''}" data-map-category="${esc(label)}">${esc(label)} ${counts[label]}</button>`).join('');
  mapCategoryRow.classList.toggle('hidden', items.length < 1 || mapMode !== 'business');
}
function updateMapFilterAvailability(baseList){
  const rows = Array.isArray(baseList) ? baseList : [];
  const couponIds = new Set(activeMapCoupons().map(c=>String(c.businessId)));
  mapVisibleCounts = {
    business: rows.length,
    coupon: rows.filter(b=>couponIds.has(String(b.id))).length,
    event: rows.filter(b=>Boolean(b.has_event)).length
  };
  mapVisibleCategoryCounts = rows.reduce((acc,b)=>{
    const label = getMainCategoryLabel(b.category);
    if(label) acc[label] = (acc[label] || 0) + 1;
    return acc;
  },{});
  if(mapCategory && !mapVisibleCategoryCounts[mapCategory]) mapCategory = '';
  if(!mapVisibleCounts[mapMode]){
    mapMode = mapVisibleCounts.business ? 'business' : mapVisibleCounts.coupon ? 'coupon' : mapVisibleCounts.event ? 'event' : 'business';
    if(mapMode !== 'business') mapCategory = '';
  }
  renderMapFilters();
}
function setMapBottomStatus(message=''){
  if(!mapBottomStatus) return;
  mapBottomStatus.textContent = message;
  mapBottomStatus.classList.toggle('hidden', !message);
}

async function loadRealData(){
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = getConfig();
  if(!SUPABASE_URL || !SUPABASE_ANON_KEY) { finalizeData(); return; }

  try {
    const select = [
      'id','name_ko','name_en','name','category_ko','category','map_category','subcategory','search_keywords','area',
      'address','phone','website','email','image_url','image_urls','gallery_urls',
      'description','description_images','hours','monday','tuesday','wednesday',
      'thursday','friday','saturday','sunday','business_hours',
      'parking','reservation','languages','insurance','video_url','youtube_url',
      'lat','lng','is_featured','featured_rank','is_new','new_rank',
      'is_popular','popular_rank','reservation_enabled',
      'paid_product','paid_active','paid_start_at','paid_end_at','paid_weight','rotation_enabled',
      'promo_enabled','home_fixed','home_fixed_sort','promo_image_url','promo_text',
      'order_url','delivery_url','reservation_url','created_at','region','is_active',
      'rating','review_count','google_maps_url','google_review_url','list_visible'
    ].join(',');

    const url = `${SUPABASE_URL}/rest/v1/businesses?select=${encodeURIComponent(select)}&region=eq.${encodeURIComponent(currentRegion)}&is_active=eq.true&order=created_at.desc.nullslast`;

    const res = await fetch(url,{
      headers:{
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`
      }
    });

    if(!res.ok) throw new Error(`Supabase ${res.status}`);

    const rows = await res.json();

    if(Array.isArray(rows) && rows.length){
      const mapped = rows.map((row) => {
        const images = parseArr(row.image_urls);
        const image = row.image_url || images[0] || 'assets/kfocus-icon.png';

        return {
          id: row.id,
          name: row.name_ko || row.name_en || row.name || '이름 없음',
          category: row.map_category || getMainCategoryLabel(row.category_ko || row.category || '서비스'),
          map_category: row.map_category || getMainCategoryLabel(row.category_ko || row.category || '서비스'),
          category_main: row.map_category || getMainCategoryLabel(row.category_ko || row.category || '서비스'),
          category_sub: row.subcategory || row.category_ko || row.category || '',
          subcategory: row.subcategory || row.category_ko || row.category || '',
          search_keywords: row.search_keywords || '',
          area: row.area || '',
          region: row.region || 'dallas',
          address: row.address || '',
          phone: row.phone || '',
          image,
          gallery_urls: parseArr(row.gallery_urls),
          website: row.website || '',
          email: row.email || '',
          order_url: row.order_url || '',
          delivery_url: row.delivery_url || '',
          reservation_url: row.reservation_url || '',
		  reservation_enabled: !!row.reservation_enabled,
          video_url: row.video_url || '',
          youtube_url: row.youtube_url || '',
          description: row.description || '',
          description_images: row.description_images,
          hours: row.hours || '',
          business_hours: row.business_hours,

          paid_product: row.paid_product || 'none',
          paid_active: !!row.paid_active,
          paid_start_at: row.paid_start_at || '',
          paid_end_at: row.paid_end_at || '',
          paid_weight: Math.max(1, Number(row.paid_weight || 1)),
          rotation_enabled: row.rotation_enabled !== false,

          parking: row.parking || '',
          reservation: row.reservation || '',
          languages: row.languages || '',
          insurance: row.insurance || '',
          lat: row.lat == null ? null : Number(row.lat),
          lng: row.lng == null ? null : Number(row.lng),
          featured: !!row.is_featured,
          is_featured: !!row.is_featured,
          is_new: !!row.is_new,
          is_popular: !!row.is_popular,
          featured_rank: row.featured_rank == null ? 1000 : Number(row.featured_rank),
          new_rank: row.new_rank == null ? 1000 : Number(row.new_rank),
          popular_rank: row.popular_rank == null ? 1000 : Number(row.popular_rank),
          rating: row.rating,
          review_count: row.review_count,
          google_maps_url: row.google_maps_url,
          google_review_url: row.google_review_url,
          // 관리자에서 '목록 숨김'으로 저장한 업소는 모든 공개 업소 노출에서 제외합니다.
          list_visible: row.list_visible !== false,
          monday: row.monday,
          tuesday: row.tuesday,
          wednesday: row.wednesday,
          thursday: row.thursday,
          friday: row.friday,
          saturday: row.saturday,
          sunday: row.sunday
        };
      });

      const seen = new Set();
      businesses = mapped.filter((b) => {
      if (b.list_visible === false) return false;
      if ((b.region || '').toLowerCase() !== getAppRegion()) return false;
        const key = [
          (b.name || '').trim().toLowerCase(),
          (b.address || '').trim().toLowerCase(),
          b.lat == null ? '' : Number(b.lat).toFixed(4),
          b.lng == null ? '' : Number(b.lng).toFixed(4)
        ].join('|');

        if(seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      console.log(
  'LOADED BUSINESSES',
  getAppRegion(),
  businesses.length,
  businesses.map((b) => [
    b.name,
    b.paid_product,
    b.paid_active,
    b.paid_end_at
  ])
);
      selectedBizId = businesses[0]?.id || selectedBizId;
    }
  } catch(e){
    console.warn('Using fallback data', e);
  }

  await loadCouponsFromSupabase();
  await loadDalpicksFromSupabase();
  await loadBoardPostsFromSupabase();
  await loadAlertNoticePostsFromSupabase();
  syncBusinessStoriesToBoardPosts();
  // V84: 초기 데이터 로드 시 공지 게시글을 읽은 뒤 달타운 알림을 즉시 갱신합니다.
  if(typeof renderDalpicks==='function') renderDalpicks();
  await loadSlidesFromSupabase();
  await loadBannersFromSupabase();
  finalizeData();
}



async function loadSlidesFromSupabase(){
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = getConfig();
  slideRows = [];
  if(!SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
  try {
    const select = 'id,business_id,region,promo_enabled,home_fixed,home_fixed_sort,promo_text,promo_image_url,promo_start_at,promo_end_at,video_url,link_url,created_at';
    const url = `${SUPABASE_URL}/rest/v1/slides?select=${encodeURIComponent(select)}&region=eq.${encodeURIComponent(getAppRegion())}&order=home_fixed_sort.asc.nullslast,created_at.desc.nullslast&_ts=${Date.now()}`;
    const res = await fetch(url,{ cache:'no-store', headers:{ apikey:SUPABASE_ANON_KEY, Authorization:`Bearer ${SUPABASE_ANON_KEY}`, 'Cache-Control':'no-cache' } });
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

async function loadDalpicksFromSupabase(){
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = getConfig();
  dalpicks=[];
  if(!SUPABASE_URL||!SUPABASE_ANON_KEY) return false;
  try{
    // select=* keeps this compatible with both the original and migrated DalPick schemas.
    const url=`${SUPABASE_URL}/rest/v1/dalpick?select=*`;
    const res=await fetch(url,{headers:{apikey:SUPABASE_ANON_KEY,Authorization:`Bearer ${SUPABASE_ANON_KEY}`}});
    if(!res.ok){
      const detail=await res.text().catch(()=> '');
      throw new Error(`DalPick ${res.status}${detail?`: ${detail}`:''}`);
    }
    const rows=await res.json();
    dalpicks=(Array.isArray(rows)?rows:[])
      .filter(d=>!d.region||String(d.region).toLowerCase()===getAppRegion())
      .sort((a,b)=>Number(b.is_featured??b.featured??false)-Number(a.is_featured??a.featured??false)||Number(b.priority||0)-Number(a.priority||0)||new Date(b.created_at||0)-new Date(a.created_at||0));
    return true;
  }catch(e){console.warn('DalPick load skipped:',e);return false;}
}


function bannerYoutubeEmbed(url){
  const raw=String(url||'').trim(); if(!raw)return '';
  try{const u=new URL(raw,location.origin);let id='';if(u.hostname.includes('youtu.be'))id=u.pathname.split('/').filter(Boolean)[0]||'';else if(u.hostname.includes('youtube.com')){id=u.searchParams.get('v')||'';const parts=u.pathname.split('/').filter(Boolean);if(!id&&['shorts','embed','live'].includes(parts[0]))id=parts[1]||'';}return id?`https://www.youtube.com/embed/${encodeURIComponent(id)}?playsinline=1&rel=0&modestbranding=1`:'';}catch{return '';}
}
function bannerFallbackHTML(b,cls=''){
  const title=esc(b?.title||'광고');
  const desc=esc(String(b?.description||'').trim());
  const cta=esc(String(b?.button_label||'자세히 보기').trim()||'자세히 보기');
  return `<div class="banner-media-fallback ${cls}"><div><span>SPONSORED</span><strong>${title}</strong>${desc?`<small>${desc.length>90?desc.slice(0,90)+'…':desc}</small>`:''}<em>${cta} →</em></div></div>`;
}
function bannerMediaHTML(b,cls=''){
  const type=String(b?.media_type|| (b?.video_url?'youtube':'image')).toLowerCase();
  const rawPoster=String(b?.image_url||'').trim();
  const poster=esc(rawPoster); const title=esc(b?.title||'광고');
  if(type==='youtube'){
    const embed=bannerYoutubeEmbed(b.video_url); if(!embed)return rawPoster?`<img class="${cls}" src="${poster}" alt="${title}" data-banner-media-image>`:bannerFallbackHTML(b,cls);
    const autoplay=b.autoplay===true&&(!isMobileViewport()||b.mobile_tap===false);
    const src=embed+`&autoplay=${autoplay?1:0}&mute=${b.muted!==false?1:0}&loop=${b.loop!==false?1:0}`;
    return `<div class="banner-video-wrap ${cls}"><iframe src="${esc(src)}" title="${title}" loading="lazy" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>`;
  }
  if(type==='mp4'){
    const video=String(b?.video_url||'').trim();
    if(!video) return rawPoster?`<img class="${cls}" src="${poster}" alt="${title}" data-banner-media-image>`:bannerFallbackHTML(b,cls);
    const autoplay=b.autoplay===true&&(!isMobileViewport()||b.mobile_tap===false);
    return `<div class="banner-video-wrap ${cls}"><video ${autoplay?'autoplay':''} ${b.muted!==false?'muted':''} ${b.loop!==false?'loop':''} playsinline controls poster="${poster}" preload="metadata"><source src="${esc(video)}" type="video/mp4"></video></div>`;
  }
  return rawPoster?`<img class="${cls}" src="${poster}" alt="${title}" data-banner-media-image>`:bannerFallbackHTML(b,cls);
}
function isMobileViewport(){return matchMedia('(max-width: 768px)').matches;}
function openBusinessChooser(ids,title='지점을 선택하세요'){
  const rows=(ids||[]).map(id=>businesses.find(b=>String(b.id)===String(id))).filter(Boolean);
  if(!rows.length)return;
  let modal=document.getElementById('businessChoiceModal');
  if(!modal){modal=document.createElement('div');modal.id='businessChoiceModal';modal.className='modal hidden';document.body.appendChild(modal);}
  modal.innerHTML=`<div class="modal-card branch-choice-card"><div class="modal-head"><h2>${esc(title)}</h2><button type="button" data-branch-close>×</button></div><div class="branch-choice-list">${rows.map(b=>`<button type="button" class="branch-choice-item" data-branch-id="${esc(b.id)}"><strong>${esc(b.name||b.name_ko||b.name_en||'업소')}</strong><span>${esc([b.city,b.address].filter(Boolean).join(' · '))}</span></button>`).join('')}</div></div>`;
  modal.classList.remove('hidden');
  modal.querySelector('[data-branch-close]')?.addEventListener('click',()=>modal.classList.add('hidden'));
  modal.querySelectorAll('[data-branch-id]').forEach(btn=>btn.addEventListener('click',()=>{modal.classList.add('hidden');selectedBizId=btn.dataset.branchId;currentDetailVideoOverride='';renderDetail(selectedBizId);showPage('business-detail');}));
}
function openMultiBusinessBanner(banner){
  const ids=linkedBusinessIds(banner); if(!ids.length)return false;
  if(ids.length===1||banner.multi_click_mode==='primary'){selectedBizId=ids[0];currentDetailVideoOverride='';renderDetail(selectedBizId);showPage('business-detail');return true;}
  if(banner.multi_click_mode==='nearest'&&navigator.geolocation){navigator.geolocation.getCurrentPosition(pos=>{const lat=pos.coords.latitude,lng=pos.coords.longitude;const ranked=ids.map(id=>businesses.find(b=>String(b.id)===String(id))).filter(Boolean).map(b=>({b,d:(Number(b.lat)-lat)**2+(Number(b.lng)-lng)**2})).sort((a,z)=>a.d-z.d);const id=ranked[0]?.b?.id||ids[0];selectedBizId=String(id);currentDetailVideoOverride='';renderDetail(selectedBizId);showPage('business-detail');},()=>openBusinessChooser(ids,banner.title||'지점 선택'),{enableHighAccuracy:false,timeout:5000});return true;}
  openBusinessChooser(ids,banner.title||'지점 선택'); return true;
}

function linkedBusinessIds(row){const ids=Array.isArray(row?.business_ids)?row.business_ids.map(String).filter(Boolean):[];if(row?.business_id&&!ids.includes(String(row.business_id)))ids.unshift(String(row.business_id));return [...new Set(ids)];}
function rowLinksBusiness(row,id){return linkedBusinessIds(row).includes(String(id));}

function activeDalpicks(){const now=Date.now();return (dalpicks||[]).filter(d=>{const st=d.start_at||d.start_date,en=d.end_at||d.end_date;const status=String(d.status||'').toLowerCase();return d.is_active!==false&&status!=='draft'&&status!=='inactive'&&(!st||new Date(st).getTime()<=now)&&(!en||new Date(en).getTime()>=now);});}
function isThemeDalpick(row){
  if(!row)return false;
  if(String(row.category||'').toLowerCase()==='themed')return true;
  const targets=Array.isArray(row.target_categories)?row.target_categories:[];
  return targets.length>0;
}

function syncBusinessStoriesToBoardPosts(){
  const existing=(boardPosts||[]).filter(p=>!String(p.id||'').startsWith('dalpick-story-'));
  const stories=activeDalpicks().filter(d=>String(d.category||'').toLowerCase()==='business_story').map(d=>{
    const biz=getBiz(d.business_id)||{};
    return {
      id:`dalpick-story-${d.id}`,
      source_id:d.id,
      source_type:'dalpick',
      type:'business_story',
      subtype:'sponsored',
      title:d.title||biz.name||'업소탐방',
      content:d.content||d.summary||'',
      summary:d.summary||'',
      region:d.region||biz.region||getAppRegion(),
      image_url:d.image_url||biz.image||biz.image_url||'',
      gallery_urls:[],
      business_id:d.business_id||'',
      author_name:'DalTownMap',
      address:biz.address||'',
      phone:biz.phone||'',
      external_url:biz.website||'',
      link_label:'웹사이트',
      created_at:d.created_at||d.start_at||''
    };
  });
  boardPosts=[...stories,...existing];
}
function dalpickBadge(c){return ({new_business:'NEW',coupon:'COUPON',recommended:'추천',ai_pick:'AI PICK',seasonal:'SEASON',event:'EVENT',promotion:'PROMO',business_story:'업소탐방'})[c]||'DALPICK';}
function openDalpickArticle(d){
  if(!d) return;
  const postId=`dalpick-article-${d.id}`;
  const existingIndex=(boardPosts||[]).findIndex(p=>String(p.id)===postId);
  const post={
    id:postId,
    source_id:d.id,
    source_type:'dalpick',
    type:'guide',
    subtype:String(d.category||'dalpick'),
    title:d.title||'DalPick',
    content:d.content||d.summary||'',
    summary:d.summary||'',
    region:d.region||getAppRegion(),
    image_url:d.image_url||'',
    gallery_urls:[],
    business_id:d.business_id||'',
    author_name:'DalTownMap',
    address:'',
    phone:'',
    external_url:d.link_url||'',
    link_label:'자세히 보기',
    created_at:d.created_at||d.start_at||''
  };
  if(existingIndex>=0) boardPosts[existingIndex]=post;
  else boardPosts.unshift(post);
  openBoardPost(postId);
}
let dalpickCarouselTimer = null;

// V65.1: 관리자 이벤트 루틴을 메인 화면에 실제 반영합니다.
function readActiveEventRoutines(){
  try{
    const appRegion=String(typeof getAppRegion==='function'?getAppRegion():(window.APP_CONFIG?.APP_REGION||'dallas')).toLowerCase();
    const serverConfig=(window.__DALTOWN_MAIN_SETTINGS__&&typeof window.__DALTOWN_MAIN_SETTINGS__==='object')?window.__DALTOWN_MAIN_SETTINGS__:(v45HomeConfig||{});
    const serverRows=Array.isArray(serverConfig.event_routines)?serverConfig.event_routines:[];
    let source=serverRows;
    // 서버 설정을 아직 한 번도 읽지 못한 최초 화면에서만 로컬 캐시를 잠시 사용합니다.
    if(!window.__DALTOWN_SERVER_SETTINGS_LOADED__&&!source.length){
      const candidates=[appRegion,appRegion==='colorado'?'denver':appRegion,appRegion==='denver'?'colorado':appRegion];
      for(const regionName of [...new Set(candidates)]){
        const cached=JSON.parse(localStorage.getItem(`kfocus_active_event_routines_v72_${regionName}`)||'[]');
        if(Array.isArray(cached)&&cached.length){source=cached;break;}
      }
    }
    const now=Date.now();
    return source.filter(r=>{
      if(!r||r.is_active===false||r.enabled===false)return false;
      const rr=String(r.region||appRegion).toLowerCase();
      if(![appRegion,'all',appRegion==='colorado'?'denver':'',appRegion==='denver'?'colorado':''].includes(rr))return false;
      const status=String(r.status||'').toLowerCase();
      if(['draft','inactive','disabled','archived'].includes(status))return false;
      const start=r.start_at||r.start_date||'';
      const end=r.end_at||r.end_date||'';
      if(start&&Date.parse(start)>now)return false;
      if(end&&Date.parse(end)<now)return false;
      return true;
    }).sort((a,b)=>Date.parse(b.updated_at||b.created_at||0)-Date.parse(a.updated_at||a.created_at||0));
  }catch(e){console.warn('[Event routines] read failed',e);}
  return [];
}
function eventRoutineItems(actionKey){
  const rows=[];
  const badge=actionKey==='ticker'?'광고':'알림';
  readActiveEventRoutines().forEach(r=>{
    const action=r?.actions?.[actionKey];
    if(!action) return;
    (Array.isArray(action.custom_items)?action.custom_items:[]).forEach((entry,index)=>{
      const text=String(typeof entry==='string'?entry:(entry?.text||'')).trim();
      if(!text) return;
      rows.push({
        kind:`event-${actionKey}`,
        id:`${r.id||'routine'}-${actionKey}-${index}`,
        date:r.updated_at||r.created_at||r.start_at||'',
        data:{
          title:text,
          summary:r.name||'',
          badge,
          event_name:r.name||'',
          link_type:action.link_type||'none',
          link_value:action.link_value||'',
          interval_seconds:Number(action.interval_seconds||5)
        }
      });
    });
  });
  return rows;
}
function v86AlertBusinessRows(action={}){
  const options=new Set((Array.isArray(action.options)?action.options:[]).map(String));
  const wants=[...options].filter(v=>v.startsWith('business_'));
  if(!wants.length)return [];
  const all=(businesses||[]).filter(b=>isBusinessVisibleByPaidDate(b)&&!v45IsPublicInstitution(b));
  const groups={
    business_new:all.filter(b=>b.is_new===true).sort((a,b)=>Number(a.new_rank??1000)-Number(b.new_rank??1000)),
    business_popular:all.filter(b=>b.is_popular===true).sort((a,b)=>Number(a.popular_rank??1000)-Number(b.popular_rank??1000)),
    business_rating:all.filter(b=>Number(b.rating||0)>0).sort((a,b)=>Number(b.rating||0)-Number(a.rating||0)||Number(b.review_count||0)-Number(a.review_count||0)),
    business_ad:all.filter(b=>b.promo_enabled===true||b.featured===true||b.is_featured===true||b.is_sponsor===true||b.is_ad===true),
    business_ai:all.filter(b=>b.featured===true||b.is_featured===true||b.recommendation_reason||b.ai_recommended===true),
    business_random:v45StableShuffle(all,todayKey())
  };
  const seen=new Set(),rows=[];
  wants.forEach(key=>(groups[key]||[]).forEach(b=>{const id=String(b.id);if(!seen.has(id)){seen.add(id);rows.push(b)}}));
  return rows.slice(0,12);
}
function v93NormalizeAlertText(value){
  return String(value||'')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g,'')
    .replace(/[•·▪︎◦\s>›→-]+/g,'')
    .trim();
}
function v93IsLegacyWeekdayAlert(value){
  const text=v93NormalizeAlertText(value);
  return text==='평일운영'||text.includes('평일운영');
}
// V95: 과거 테스트 알림을 치환하면서 생긴 '달타운 알림/알림' 같은 빈 껍데기 문구도 제외합니다.
function v95IsPlaceholderAlert(value){
  const text=v93NormalizeAlertText(value);
  return !text || text==='평일운영' || text.includes('평일운영') || text==='달타운알림' || text==='알림' || text==='달타운공지';
}
// V96: 레이블 자체가 콘텐츠로 저장된 잘못된 알림은 어떤 데이터 경로에서 와도 제거합니다.
function v97AlertCoreText(value){
  return String(value||'')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g,'')
    .replace(/[^0-9A-Za-z가-힣]/g,'')
    .toLowerCase();
}
function v96IsInvalidTickerContent(value){
  const text=v97AlertCoreText(value);
  if(!text) return true;
  if(text.includes('평일운영')) return true;
  return ['달타운알림','알림','공지','브리핑','업소알림','daltownalert'].includes(text);
}


function eventRoutineAlertItems(){
  const active=readActiveEventRoutines()
    .filter(r=>r?.actions?.alert||r?.actions?.ticker||r?.actions?.business);
  // V94: 루틴 이름이 과거 테스트명이어도 공지/업소 조건 설정은 유지하고, 해당 문구만 제거합니다.
  const dailyBriefing=(v45HomeConfig&&typeof v45HomeConfig.daily_briefing==='object')?v45HomeConfig.daily_briefing:null;
  const briefingValid=dailyBriefing&&dailyBriefing.is_active!==false&&String(dailyBriefing.text||'').trim()&&(!dailyBriefing.date_key||dailyBriefing.date_key===todayKey());
  if(!active.length){
    return briefingValid?[{kind:'event-alert-briefing',id:`daily-briefing-${dailyBriefing.date_key||todayKey()}`,date:dailyBriefing.generated_at||'',data:{title:String(dailyBriefing.text||'').trim(),summary:String(dailyBriefing.summary||'').trim(),badge:'브리핑',event_name:'오늘의 브리핑',link_type:dailyBriefing.link_type||'none',link_value:dailyBriefing.link_value||'',interval_seconds:6}}]:[];
  }
  const primary=active.find(r=>r?.actions?.alert)||active[0];
  const alertAction=primary?.actions?.alert||primary?.actions?.ticker||{};
  const legacyBusiness=primary?.actions?.business||{};
  const mergedOptions=[...new Set([...(alertAction.options||[]),...(legacyBusiness.options||[]).map(v=>`business_${v}`)])];
  const mergedAction={...alertAction,options:mergedOptions,interval_seconds:alertAction.interval_seconds||legacyBusiness.interval_seconds||5};
  const interval=Math.max(3,Number(mergedAction.interval_seconds||5));
  const now=Date.now();

  // 1순위: '게시판 공지'를 선택했고 유효한 공지 글이 있을 때는 공지만 표시합니다.
  if(mergedOptions.includes('board_notice')){
    const noticeSource=(alertNoticePosts&&alertNoticePosts.length)?alertNoticePosts:(boardPosts||[]);
    const notices=noticeSource.filter(post=>{
      if(post?.is_active===false||post?.is_alert_notice!==true)return false;
      if(post.region&&normalizeRegionKey(post.region)!==currentRegion)return false;
      if(post.start_at&&Date.parse(post.start_at)>now)return false;
      if(post.end_at&&Date.parse(post.end_at)<now)return false;
      return true;
    }).sort((a,b)=>Number(a.alert_order||999)-Number(b.alert_order||999)||Date.parse(b.created_at||0)-Date.parse(a.created_at||0)).map(post=>({
      kind:'event-alert-board-notice',id:`board-notice-${post.id}`,date:post.created_at||'',data:{title:post.title||'달타운 공지',summary:v38Text(post.content||'',80),badge:'공지',event_name:'게시판 공지',link_type:'board',link_value:post.id,interval_seconds:interval}
    }));
    console.info('[V86 alert] board notices',{notices:notices.length});
    if(notices.length)return notices;
  }

  // 2순위: 공지가 없을 때 직접 입력 문구와 선택한 업소 조건을 함께 순환합니다.
  const fallback=[];
  // V91: 여러 과거 루틴의 직접 문구를 한꺼번에 합치지 않습니다.
  // 현재 선택된(가장 최근) 알림 루틴 1개만 사용하여 '평일 운영' 같은 잔여 문구와 중복 노출을 막습니다.
  {
    const r=primary;
    const action=r?.actions?.alert||{};
    (Array.isArray(action.custom_items)?action.custom_items:[]).forEach((entry,index)=>{
      const text=String(typeof entry==='string'?entry:(entry?.text||'')).trim();
      if(!text||v96IsInvalidTickerContent(text))return;
      const safeRoutineName=v93IsLegacyWeekdayAlert(r?.name)?'':String(r?.name||'');
      fallback.push({kind:'event-alert-fallback',id:`${r.id||'routine'}-alert-fallback-${index}`,date:r.updated_at||r.created_at||r.start_at||'',data:{title:text,summary:safeRoutineName,badge:'알림',event_name:safeRoutineName,link_type:action.link_type||'none',link_value:action.link_value||'',interval_seconds:Math.max(3,Number(action.interval_seconds||interval))}});
    });
  }
  // 3순위: 관리자 직접 문구가 없거나 끝난 뒤 오늘의 자동 브리핑을 표시합니다.
  if(briefingValid) fallback.push({
    kind:'event-alert-briefing',id:`daily-briefing-${dailyBriefing.date_key||todayKey()}`,date:dailyBriefing.generated_at||'',data:{title:String(dailyBriefing.text||'').trim(),summary:String(dailyBriefing.summary||'').trim(),badge:'브리핑',event_name:'오늘의 브리핑',link_type:dailyBriefing.link_type||'none',link_value:dailyBriefing.link_value||'',interval_seconds:interval}
  });
  // 4순위: 공지·직접 입력·브리핑이 없는 경우에만 업소 조건 알림을 사용합니다.
  if(!fallback.length) v86AlertBusinessRows(mergedAction).forEach((b,index)=>fallback.push({
    kind:'event-alert-business',id:`alert-business-${b.id}`,date:b.created_at||'',data:{title:b.promo_text||b.name||'추천 업소',summary:b.promo_text?b.name:(b.short_description||b.description||b.category||''),badge:'업소',event_name:'업소 알림',business_id:b.id,link_type:'business',link_value:b.id,interval_seconds:interval}
  }));
  console.info('[V86 alert] fallback',{custom:fallback.filter(x=>x.kind==='event-alert-fallback').length,business:fallback.filter(x=>x.kind==='event-alert-business').length});
  return fallback;
}
function eventRoutineOneLineAdItems(){ return []; }
function renderEventRoutineOneLineAds(){ /* V66: 한 줄 광고는 달타운 알림에 통합 */ }
function openEventRoutineLink(d){
  const type=String(d?.link_type||'none');
  const value=String(d?.link_value||'').trim();
  if(type==='none'||!value) return;
  if(type==='external'||type==='url'){ window.open(value,'_blank','noopener'); return; }
  if(type==='business'){ renderDetail(value); showPage('business-detail'); return; }
  if(type==='coupon'){ renderCouponDetail(value); lastBasePage=currentPage; showPage('coupon-detail'); return; }
  if(type==='board'||type==='article'){ openBoardPost(value); return; }
  if(type==='guide'){ showPage('guide'); return; }
  if(type==='internal'){
    const page=value.replace(/^#/,'');
    if(page) showPage(page);
  }
}
function renderDalpicks(){
  const box=document.getElementById('dalpickList');
  if(!box) return;
  if(dalpickCarouselTimer){ clearInterval(dalpickCarouselTimer); dalpickCarouselTimer=null; }

  const tickerConfig=v61EffectiveHomeConfig(v45HomeConfig||{});
  // 체크된 소스만 노출합니다. 선택이 없을 때 예전 DalPick·쿠폰을 임의로 채우지 않습니다.
  const tickerSources=new Set(Array.isArray(tickerConfig.ticker_sources)?tickerConfig.ticker_sources:[]);
  const dalpickItems=activeDalpicks()
    .filter(()=>tickerSources.has('dalpick'))
    .filter(d=>!isThemeDalpick(d)||d.show_in_dalpick===true)
    .map(d=>({kind:'dalpick', id:String(d.id), data:d, date:d.created_at||d.start_at||''}));
  const couponItems=(tickerSources.has('coupon')&&typeof todayCoupons==='function'?todayCoupons():[])
    .map(c=>({kind:'coupon', id:String(c.id), data:c, date:c.createdAt||c.startAt||''}));

  const routineItems=eventRoutineAlertItems();

  // V75: 게시판 공지를 우선 표시하고, 공지가 없을 때만 이벤트 루틴 직접 입력 문구를 표시합니다.
  // 둘 다 없을 때만 달타운 알림 영역을 숨깁니다.
  const seen=new Set();
  const items=[...routineItems]
    .filter(item=>{
      const d=item.data||{};
      // V93: 서버/로컬 캐시에 남은 '평일 운영' 계열 문구를 최종 렌더 단계에서도 차단합니다.
      // V94: 실제 표시 제목이 '평일 운영'일 때만 제외합니다.
      // 루틴 이름/요약에 과거 이름이 남아 있어도 공지·브리핑·업소 알림까지 함께 삭제하지 않습니다.
      if(v96IsInvalidTickerContent(d.title)) return false;
      if(v93IsLegacyWeekdayAlert(d.summary)) d.summary='';
      if(v93IsLegacyWeekdayAlert(d.event_name)||v96IsInvalidTickerContent(d.event_name)) d.event_name='';
      const key=`${item.kind}|${String(d.title||'').trim()}|${d.business_id||d.businessId||''}`;
      if(seen.has(key)) return false;
      seen.add(key); return true;
    })
    .sort((a,b)=>new Date(b.date||0)-new Date(a.date||0))
    .slice(0,12);

  if(!items.length){ box.closest('.home-ticker-section')?.setAttribute('hidden',''); box.innerHTML=''; return; }
  box.closest('.home-ticker-section')?.removeAttribute('hidden');

  const messageHTML=item=>{
    const d=item.data||{};
    const b=getBiz(d.business_id||d.businessId)||{};
    const label=String(d.badge||'').trim() || (item.kind==='coupon'?'쿠폰':(String(d.category||'').toLowerCase()==='business_story'?'업소탐방':'광고'));
    const title=String(d.title||b.name||'새로운 소식').trim();
    const detail=String(d.summary||d.discount_label||d.description||b.name||'').replace(/\s+/g,' ').trim();
    return `<button class="ticker-ad-item" type="button" data-ticker-kind="${esc(item.kind)}" data-ticker-id="${esc(item.id)}"><span class="ticker-ad-badge">${esc(label)}</span><strong>${esc(title)}</strong>${detail?`<span class="ticker-ad-detail">${esc(detail)}</span>`:''}<span class="ticker-ad-arrow" aria-hidden="true">›</span></button>`;
  };
  const sequence=items.map(messageHTML).join('<span class="ticker-ad-separator" aria-hidden="true">•</span>');
  box.innerHTML=`<div class="ticker-ad-shell"><span class="ticker-live-label"><i data-lucide="megaphone"></i><b>달타운 알림</b></span><div class="ticker-ad-viewport"><div class="ticker-ad-track">${sequence}<span class="ticker-ad-separator" aria-hidden="true">•</span>${sequence}</div></div></div>`;

  box.querySelectorAll('[data-ticker-kind]').forEach(btn=>btn.addEventListener('click',()=>{
    const item=items.find(x=>x.kind===btn.dataset.tickerKind&&String(x.id)===String(btn.dataset.tickerId));
    const d=item?.data; if(!d) return;
    if(String(item.kind||'').startsWith('event-')){ openEventRoutineLink(d); return; }
    if(item.kind==='coupon'){ renderCouponDetail(d.id); lastBasePage=currentPage; showPage('coupon-detail'); return; }
    if(String(d.category||'').toLowerCase()==='business_story') openBoardPost(`dalpick-story-${d.id}`);
    else if(isThemeDalpick(d)) openThemeArticle(d);
    else if(d.business_id){ renderDetail(d.business_id); showPage('business-detail'); }
    else if(d.content||d.summary) openDalpickArticle(d);
  }));
  if(window.lucide) window.lucide.createIcons();
  renderEventRoutineOneLineAds();
}

// 관리자와 메인을 같은 브라우저에서 열어 둔 경우 저장 즉시 갱신합니다.
window.addEventListener('storage',e=>{
  if(String(e.key||'').startsWith('kfocus_active_event_routines_v72_')){ renderDalpicks(); v45SetupCommunity(v45HomeConfig||{}); } if(String(e.key||'').startsWith('kfocus_board_home_pins_v66_')) v45SetupCommunity(v45HomeConfig||{});
});
window.addEventListener('kfocus:event-routines-updated',()=>{ renderDalpicks(); v45SetupCommunity(v45HomeConfig||{}); });
window.addEventListener('kfocus:board-home-pins-updated',()=>v45SetupCommunity(v45HomeConfig||{}));

async function loadCouponsFromSupabase(){
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = getConfig();
  if(!SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
  try {
    const select = 'id,business_id,business_ids,title,description,coupon_code,use_link_url,image_url,discount_label,start_at,end_at,is_active,is_today_coupon,sort_order,created_at,notify_emails,notify_phones';
    const url = `${SUPABASE_URL}/rest/v1/coupons?select=${encodeURIComponent(select)}&is_active=eq.true&order=sort_order.asc.nullslast,end_at.asc.nullslast,created_at.desc.nullslast&_ts=${Date.now()}`;
    const res = await fetch(url,{ cache:'no-store', headers:{ apikey:SUPABASE_ANON_KEY, Authorization:`Bearer ${SUPABASE_ANON_KEY}`, 'Cache-Control':'no-cache' } });
    if(!res.ok) throw new Error(`Coupons ${res.status}`);
    const rows = await res.json();
    // 쿠폰은 연결 업소가 현재 지역 업소 목록에 없더라도 쿠폰 자체 데이터로 노출합니다.
    // 이전 코드는 business_id가 businesses 배열에 없으면 정상 쿠폰까지 모두 제거했습니다.
    coupons = (Array.isArray(rows)?rows:[]).map((row, idx)=>({
      id: row.id || `cp${idx+1}`,
      businessId: row.business_id || '',
      business_id: row.business_id || '',
      business_ids: Array.isArray(row.business_ids)?row.business_ids:[],
      title: row.title || '쿠폰',
      description: row.description || '',
      couponCode: row.coupon_code || '',
      coupon_code: row.coupon_code || '',
      use_link_url: row.use_link_url || '',
      imageUrl: row.image_url || '',
      image_url: row.image_url || '',
      discount_label: row.discount_label || '',
      startAt: row.start_at || '',
      start_at: row.start_at || '',
      endAt: row.end_at || '',
      end_at: row.end_at || '',
      isActive: row.is_active !== false,
      is_active: row.is_active !== false,
      isToday: row.is_today_coupon === true,
      is_today_coupon: row.is_today_coupon === true,
      sortOrder: row.sort_order == null ? 1000 : Number(row.sort_order),
      sort_order: row.sort_order == null ? 1000 : Number(row.sort_order),
      createdAt: row.created_at || '',
      created_at: row.created_at || '',
      notify_emails: row.notify_emails || '',
      notify_phones: row.notify_phones || ''
    }));
    console.log('[COUPONS] loaded', coupons.length, coupons.map(c=>({id:c.id,title:c.title,isToday:c.isToday,businessId:c.businessId})));
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
    const url = `${SUPABASE_URL}/rest/v1/banners?select=*&is_active=eq.true&order=sort_order.asc,created_at.desc&_ts=${Date.now()}`;

    const res = await fetch(url, {
      cache: 'no-store',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Cache-Control': 'no-cache'
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

    // 연결 업소를 찾지 못해도 undefined가 화면에 노출되지 않도록 안전하게 구성합니다.
    desc: [b.category || b.category_ko || '', getRegionLabel(b.region || s.region || currentRegion)]
      .filter(Boolean)
      .join(' · '),

    slideDesc: s.description || s.promo_text || '',

    button: '',

    bg:
        s.promo_image_url ||
        b.image_url ||
        b.image ||
        '',

    link_url: s.link_url || '',

    // 영상 슬라이드는 실제 URL도 heroSlides에 보존해야 렌더링 단계에서 재생할 수 있습니다.
    video_url: s.video_url || '',

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

// V87: 기존 해시 URL을 유지하면서 검색·공유용 실제 경로도 병행 지원합니다.
// 기존 /#board-detail?id=... 링크는 계속 작동하고, 새 /board/:id 링크도 같은 화면을 엽니다.
function v87PublicPathFor(page){
  if(page==='business-detail' && selectedBizId) return `/business/${encodeURIComponent(selectedBizId)}`;
  if(page==='coupon-detail' && selectedCouponId) return `/coupon/${encodeURIComponent(selectedCouponId)}`;
  if(page==='board-detail' && selectedBoardPost?.id){
    const kind = normalizeBoardType(selectedBoardPost.type)==='guide' ? 'guide' : 'board';
    return `/${kind}/${encodeURIComponent(selectedBoardPost.id)}`;
  }
  return '';
}
function routeFor(page){
  const publicPath = v87PublicPathFor(page);
  if(publicPath) return publicPath;
  const base = '/';
  return page === 'home' ? base : `${base}#${page}`;
}
function setRoute(page){ history.replaceState(null,'', routeFor(page)); }
function getRoute(){
  const clean = location.hash.replace('#','');
  return clean || 'home';
}
function v87ParsePublicRoute(){
  const parts = location.pathname.split('/').filter(Boolean).map(v=>decodeURIComponent(v));
  if(parts.length < 2) return null;
  const [kind,id] = parts;
  if(!id) return null;
  if(kind==='business') return { page:'business-detail', id };
  if(kind==='coupon') return { page:'coupon-detail', id };
  if(kind==='board') return { page:'board-detail', id };
  if(kind==='guide') return { page:'board-detail', id, forceType:'guide' };
  return null;
}
function v87OpenPublicRoute(){
  const route = v87ParsePublicRoute();
  if(!route) return false;
  if(route.page==='business-detail'){
    selectedBizId = route.id;
    renderDetail(route.id);
    showPage('business-detail');
    return true;
  }
  if(route.page==='coupon-detail'){
    renderCouponDetail(route.id);
    showPage('coupon-detail');
    return true;
  }
  if(route.page==='board-detail'){
    const post = (boardPosts||[]).find(p=>String(p.id)===String(route.id));
    const type = route.forceType || normalizeBoardType(post?.type || 'notice');
    renderBoardPage(type, route.id);
    showPage('board-detail');
    return true;
  }
  return false;
}
function getPageOrder(){ return ['home','business','coupon','map','guide']; }
function getBiz(id){
    if (!id) return null;

    return businesses.find(b => String(b.id) === String(id)) || null;
}

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
  const id = getYouTubeId(url);
  return id ? `https://www.youtube.com/embed/${id}?playsinline=1&rel=0` : '';
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
  return `<button class="list-card biz-open" data-biz="${esc(b.id)}"><img class="list-thumb" src="${esc(b.image)}" alt="${esc(b.name)}"><div class="list-main"><h4>${esc(b.name)}</h4><p>${esc(b.subcategory || b.category_sub || b.category)} · ${esc(getRegionLabel(b.region || currentRegion))}</p><p class="list-address">${esc(b.address)}</p></div><div class="list-side stack-badges">${badgeStackHTML(b,false)}</div></button>`;
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
  // '오늘의 쿠폰'으로 명시적으로 지정된 활성 쿠폰만 반환합니다.
  // 과거에는 지정된 쿠폰이 하나도 없을 때 모든 활성 쿠폰을 대신 노출했기 때문에
  // 관리자 화면과 실제 홈 DalPick/오늘의 쿠폰 노출이 서로 다르게 보일 수 있었습니다.
  return activeCoupons(coupons).filter(c=>c.isToday === true);
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

const LIFE_CATEGORIES=['전체','생활','교육','의료','교통','세금·재정','부동산','가족','지역정보'];
let selectedLifeCategory='전체';
function inferLifeCategory(post={}){
  const explicit=String(post.subtype||post.category||'').trim();
  const text=`${explicit} ${post.title||''} ${post.summary||''} ${post.content||''}`.toLowerCase();
  if(/학교|교육|학군|대학|학생|입학|isd/.test(text)) return '교육';
  if(/병원|의료|건강|보험|의사|약국|메디케어/.test(text)) return '의료';
  if(/교통|도로|차량|운전|공항|버스|열차|통제/.test(text)) return '교통';
  if(/세금|재정|절세|은행|대출|크레딧|사업/.test(text)) return '세금·재정';
  if(/주택|부동산|렌트|아파트|모기지|집값/.test(text)) return '부동산';
  if(/가족|자녀|육아|시니어|부모/.test(text)) return '가족';
  if(/생활|정착|쇼핑|음식|날씨/.test(text)) return '생활';
  return '지역정보';
}
function boardReadMinutes(post={}){
  const chars=String(post.content||post.summary||'').replace(/\s+/g,'').length;
  return Math.max(1,Math.ceil(chars/500));
}
function renderLifeCategoryFilters(){
  const el=document.getElementById('lifeCategoryFilters'); if(!el) return;
  const isLife=selectedBoardType==='life'; el.classList.toggle('hidden',!isLife);
  if(!isLife){el.innerHTML='';return;}
  el.innerHTML=LIFE_CATEGORIES.map(c=>`<button type="button" class="life-category-chip ${c===selectedLifeCategory?'active':''}" data-life-category="${esc(c)}">${esc(c)}</button>`).join('');
  el.querySelectorAll('[data-life-category]').forEach(btn=>btn.addEventListener('click',()=>{selectedLifeCategory=btn.dataset.lifeCategory||'전체';renderHomeBoardSection('life');}));
}
function boardListItemHTML(post) {
  const type = normalizeBoardType(post.type);
  const lifeCategory = type==='life' ? inferLifeCategory(post) : '';
  const readMinutes = type==='life' ? boardReadMinutes(post) : 0;
  const summary = String(post.summary || post.content || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 75);

  const thumb = post.image_url
    ? `
      <img
        class="board-row-thumb-img"
        src="${esc(post.image_url)}"
        alt="${esc(post.title || '게시글')}"
      >
    `
    : boardThumbEmoji(type);

  const hasVideo = Boolean(
    String(post.video_url || '').trim()
  );

  return `
    <button
      type="button"
      class="board-row-btn"
      data-board-post="${esc(post.id)}"
    >
      <span class="board-row-thumb">
        ${thumb}
      </span>

      <span class="board-row-copy">
        <span class="board-row-topline">
          <em class="board-row-badge">
            ${esc(type==='life' ? lifeCategory : boardLabel(type))}
          </em>${type==='life'?`<em class="board-read-time">${readMinutes}분 읽기</em>`:''}

          ${
            hasVideo
              ? '<em class="board-video-badge">▶ 영상</em>'
              : ''
          }
        </span>

        <strong>
          ${esc(post.title || '제목 없음')}
        </strong>

        <span>
          ${esc(summary)}
        </span>
      </span>
    </button>
  `;
}
function mapBottomItemHTML(b){
  const miles = (b.lat != null && b.lng != null && currentCenter)
    ? haversineMiles(currentCenter.lat, currentCenter.lng, Number(b.lat), Number(b.lng))
    : null;

  const meta = [getBusinessDisplayCategory(b)];
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

function renderMapBottomList(list, categorySummaryRows = null){
  if(!mapBottomList) return;
  const rows = list || [];
  const summaryRows = Array.isArray(categorySummaryRows) ? categorySummaryRows : rows;
  selectedMapBusinessId = '';
  mapBusinessPreview?.classList.add('hidden');
  mapBottomList.classList.add('hidden');
  mapBottomList.innerHTML = '';
  mapBottomTitle?.parentElement?.classList.add('hidden');
  setMapBottomStatus('');
  mapBottomPanel?.classList.remove('hidden','collapsed','preview-open');
  mapBottomPanel?.classList.add('counts-only');
  window.__mapCurrentRows = rows;
  window.__mapCategorySummaryRows = summaryRows;
  renderMapCategorySummary(summaryRows);
}
function mapBusinessPreviewHTML(b){
  const hasCoupon = activeMapCoupons().some(c=>String(c.businessId)===String(b.id));
  const miles = currentCenter && Number.isFinite(Number(b.lat)) && Number.isFinite(Number(b.lng))
    ? haversineMiles(currentCenter.lat, currentCenter.lng, Number(b.lat), Number(b.lng)) : null;
  const meta = [getBusinessDisplayCategory(b)];
  if(Number.isFinite(miles)) meta.push(`${miles.toFixed(1)}mi`);
  return `<div class="map-preview-card">
    <div class="map-preview-main">
      <img src="${esc(b.image || b.image_url || '/assets/kfocus-icon.png')}" alt="${esc(b.name)}">
      <div><strong>${esc(b.name)}</strong><span>${esc(meta.join(' · '))}</span><p>${esc(b.address || '')}</p>${hasCoupon?'<em>🎟 사용 가능한 쿠폰</em>':''}</div>
    </div>
    <div class="map-preview-actions">
      ${b.phone?`<a href="tel:${esc(b.phone)}" data-map-action="phone" data-map-id="${esc(b.id)}">전화</a>`:''}
      <a href="https://www.google.com/maps/dir/?api=1&destination=${Number(b.lat)},${Number(b.lng)}" target="_blank" rel="noopener" data-map-action="direction" data-map-id="${esc(b.id)}">길찾기</a>
      <button type="button" data-map-detail="${esc(b.id)}">상세정보</button>
    </div>
  </div>`;
}
function showMapBusinessPreview(b){
  if(!b || !mapBusinessPreview || !mapBottomList) return;
  selectedMapBusinessId = String(b.id || '');
  mapBottomList.classList.add('hidden');
  mapBusinessPreview.innerHTML = mapBusinessPreviewHTML(b);
  mapBusinessPreview.classList.remove('hidden');
  mapBottomTitle?.parentElement?.classList.remove('hidden');
  if(mapBottomTitle) mapBottomTitle.textContent = '업소 정보';
  mapBottomPanel?.classList.remove('collapsed','hidden','counts-only');
  mapBottomPanel?.classList.add('preview-open');
}

function nearbyBusinessItemHTML(b){
  const bizName = b.name || b.name_ko || b.name_en || '이름 없음';
  const thumb = b.image || b.image_url || '/assets/kfocus-icon.png';
  const meta = [getBusinessDisplayCategory(b)];

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
function bindBizOpenButtons() {
  document.querySelectorAll('.biz-open, .biz-open-btn').forEach((el) => {

    el.onclick = () => {

      const id = el.dataset.biz || el.dataset.id;

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
  let rows = boardPostsByType(type);
  if(type==='life' && selectedLifeCategory!=='전체') rows=rows.filter(post=>inferLifeCategory(post)===selectedLifeCategory);
  rows=rows.slice(0,4);
  renderLifeCategoryFilters();
  if(homeBoardList) homeBoardList.innerHTML = rows.length ? rows.map(boardListItemHTML).join('') : `<div class="board-empty">등록된 ${type==='life'&&selectedLifeCategory!=='전체'?selectedLifeCategory+' ':''}${boardLabel(type)} 글이 없습니다.</div>`;
  if(homeBoardMoreBtn) homeBoardMoreBtn.dataset.board = type;
}
const GUIDE_SUBTYPE_KEY = 'daltownmap_guide_subtype';
const GUIDE_DEFAULT_SUBTYPE = '운전·차량';
let selectedGuideSubtype = localStorage.getItem(GUIDE_SUBTYPE_KEY) || GUIDE_DEFAULT_SUBTYPE;

function normalizeGuideSubtype(value='') {
  return String(value || '')
    .trim()
    .replace(/[ㆍ・]/g, '·')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function renderGuidePosts(subtype = selectedGuideSubtype) {
  const list = document.getElementById('guidePostList');
  if (!list) return;

  selectedGuideSubtype = subtype || GUIDE_DEFAULT_SUBTYPE;
  localStorage.setItem(GUIDE_SUBTYPE_KEY, selectedGuideSubtype);

  document.querySelectorAll('[data-guide-subtype]').forEach(card => {
    card.classList.toggle(
      'active',
      normalizeGuideSubtype(card.dataset.guideSubtype) === normalizeGuideSubtype(selectedGuideSubtype)
    );
  });

  const selected = normalizeGuideSubtype(selectedGuideSubtype);
  const rows = boardPosts.filter(p => {
    const isGuide = normalizeBoardType(p.type) === 'guide';
    const visible = adminSession || !p.region || normalizeRegionKey(p.region) === currentRegion;
    const exactSubtype = normalizeGuideSubtype(p.subtype) === selected;
    return isGuide && visible && exactSubtype;
  }).slice(0, 12);

  list.innerHTML = rows.length
    ? rows.map(boardListItemHTML).join('')
    : `<div class="board-empty">${esc(selectedGuideSubtype)}에 등록된 생활정보가 없습니다.</div>`;
}

let v37RecommendationIndex = 0;
let v37RecommendationTimer = null;
let v37RecommendationItems = [];
let v38HomePayload = null;
let v42KoreanNewsItems = [];
let v43AlertItems = [];
let v43AlertIndex = 0;
let v43AlertTimer = null;
let v44HomeRenderSequence = 0;
let v44HomeFeedLoadedAt = 0;
let v45HomeConfig = {};
let v45ProposalItems = [];
let v45CommunityItems = [];
let v45CommunityIndex = 0;
let v45CommunityTimer = null;

function v37VisibleBoardPosts(type){
  return (boardPosts || []).filter(post => {
    const sameType = normalizeBoardType(post.type) === normalizeBoardType(type);
    const visible = adminSession || !post.region || normalizeRegionKey(post.region) === currentRegion;
    return sameType && visible;
  });
}
function v38Text(v,max=120){return String(v||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,max)}
function v38AgeScore(row){
  const t=Date.parse(row?.published_at||row?.created_at||row?.updated_at||'');
  if(!Number.isFinite(t)) return 0;
  const days=Math.max(0,(Date.now()-t)/86400000);
  return Math.max(0,30-Math.min(30,days*3));
}
async function v42LoadKoreanNews(){
  const cfg=getConfig();
  const base=String(cfg.SUPABASE_URL||'').replace(/\/$/,'');
  const key=String(cfg.SUPABASE_ANON_KEY||'').trim();
  if(!base||!key){console.warn('[V45 Home Feed] Supabase public config missing');return []}
  const endpoint=`${base}/functions/v1/newsroom`;
  const headers={'Content-Type':'application/json','apikey':key,'Authorization':`Bearer ${key}`};
  const attempts=[
    {label:'GET',url:`${endpoint}?action=home_feed&region=${encodeURIComponent(currentRegion||'dallas')}&_=${Date.now()}`,options:{method:'GET',headers}},
    {label:'POST',url:endpoint,options:{method:'POST',headers,body:JSON.stringify({action:'home_feed',region:currentRegion||'dallas',cache_bust:Date.now()})}}
  ];
  let lastError=null;
  for(const attempt of attempts){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),15000);
    try{
      const res=await fetch(attempt.url,{...attempt.options,signal:controller.signal});
      const raw=await res.text();
      let json={};
      try{json=raw?JSON.parse(raw):{}}catch(_){throw new Error(`${attempt.label} 응답이 JSON이 아닙니다: ${raw.slice(0,120)}`)}
      if(!res.ok||json.ok===false)throw new Error(json.error?.message||json.error||json.message||`HTTP ${res.status}`);
      const items=Array.isArray(json.proposals)?json.proposals:(Array.isArray(json.items)?json.items:[]);
      items.feed_meta=json.meta||{};
      items.home_config=json.home_config||{};
      v44HomeFeedLoadedAt=Date.now();
      console.info(`[V45 Home Feed] ${attempt.label} success`,{count:items.length,meta:json.meta,version:json.version});
      return items;
    }catch(e){
      lastError=e;
      console.warn(`[V45 Home Feed] ${attempt.label} failed`,e?.name==='AbortError'?'timeout':e?.message||e);
    }finally{clearTimeout(timer)}
  }
  console.warn('[V45 Home Feed] all attempts failed',lastError?.message||lastError);
  return [];
}
function v42OpenNews(item){
  if(!item)return;
  if(item.url)window.open(item.url,'_blank','noopener,noreferrer');
}

function v43AlertType(item){
  const text=`${item?.title||''} ${item?.summary||''}`.toLowerCase();
  if(item?.school)return 'school';
  if(/tornado|storm|flood|heat|weather|폭염|홍수|토네이도|기상|주의보|경보/.test(text))return 'weather';
  return 'emergency';
}
function v43PaintAlert(){
  const card=document.getElementById('v43AlertCard');
  if(!card)return;
  if(!v43AlertItems.length){card.classList.add('hidden');return;}
  const item=v43AlertItems[v43AlertIndex]||v43AlertItems[0];
  card.classList.remove('hidden','school','weather','emergency');
  card.classList.add(v43AlertType(item));
  const label=document.getElementById('v43AlertLabel'),title=document.getElementById('v43AlertTitle'),summary=document.getElementById('v43AlertSummary'),icon=document.getElementById('v43AlertIcon'),dots=document.getElementById('v43AlertDots');
  if(label)label.textContent=item.school?'학교 등교·수업 공지':(v43AlertType(item)==='weather'?'지역 기상 경보':'긴급 지역 공지');
  if(title)title.textContent=item.title||'확인할 긴급 공지가 있습니다.';
  if(summary)summary.textContent=v38Text(item.summary||'공식 안내를 확인해 주세요.',110);
  if(icon)icon.textContent=item.school?'🏫':(v43AlertType(item)==='weather'?'⚠':'🚨');
  if(dots)dots.innerHTML=v43AlertItems.length>1?v43AlertItems.map((_,i)=>`<span class="${i===v43AlertIndex?'active':''}"></span>`).join(''):'';
}
function v43SetupAlerts(items=[]){
  v43AlertItems=(items||[]).filter(x=>x?.school||x?.emergency).slice(0,6);
  v43AlertIndex=0;
  v43PaintAlert();
  const main=document.getElementById('v43AlertMain');
  if(main&&!main.dataset.bound){main.dataset.bound='1';main.addEventListener('click',()=>v42OpenNews(v43AlertItems[v43AlertIndex]));}
  if(v43AlertTimer)clearInterval(v43AlertTimer);
  const ac=v61EffectiveHomeConfig(v45HomeConfig||{}),play=ac.autoplay?.alert!==false,delay=Math.max(2,Number(ac.intervals?.alert||6))*1000;if(play&&v43AlertItems.length>1)v43AlertTimer=setInterval(()=>{v43AlertIndex=(v43AlertIndex+1)%v43AlertItems.length;v43PaintAlert()},delay);
}

function v38Context(){
  const now=new Date(), day=now.getDay(), weekend=day===0||day===6;
  const events=v37VisibleBoardPosts('notice').slice(0,12), life=v37VisibleBoardPosts('life').slice(0,12);
  const coupons=(typeof todayCoupons==='function'?todayCoupons():[]).slice(0,12);
  const picks=activeDalpicks().filter(r=>!isThemeDalpick(r)||r.show_in_dalpick===true).slice(0,12);
  const featured=(businesses||[]).filter(b=>b.featured&&isBusinessVisibleByPaidDate(b)).slice(0,12);
  return {now,weekend,events,life,coupons,picks,featured,koreanNews:v42KoreanNewsItems};
}
function v38KeywordBoost(text,ctx){
  const s=String(text||'').toLowerCase(); let score=0;
  if(ctx.weekend && /(여행|캠핑|축제|행사|공원|가족|주말|festival|concert)/i.test(s)) score+=24;
  if(/(긴급|통제|주의보|폭염|사고|폐쇄|안전|alert|warning|closure|heat)/i.test(s)) score+=32;
  if(/(오늘|무료|할인|쿠폰|신규|마감)/i.test(s)) score+=16;
  return score;
}
function v38Candidates(ctx){
  const rows=[];
  (ctx.koreanNews||[]).forEach((r,i)=>rows.push({kind:'newsroom',id:String(r.id||i),title:r.title||(r.school?'학교 등교 공지':(r.emergency?'긴급 지역 공지':'오늘의 한인 소식')),summary:v38Text(r.summary||(r.school?'학교의 등교·휴교·지연 공지를 확인해 주세요.':(r.emergency?'달라스 지역의 긴급 공지를 확인해 주세요.':'달라스 한인사회에서 확인된 소식입니다.'))),data:r,score:(r.school?2100:(r.emergency?2000:140))+Number(r.score||0)+(r.faith?18:0)-i}));
  ctx.events.forEach(r=>rows.push({kind:'event',id:String(r.id),title:r.title||'오늘 행사',summary:v38Text(r.summary||r.content||'오늘 확인할 지역 행사 소식입니다.'),data:r,score:75+v38AgeScore(r)+v38KeywordBoost(r.title,ctx)}));
  ctx.life.forEach(r=>rows.push({kind:'life',id:String(r.id),title:r.title||'달라스 라이프',summary:v38Text(r.summary||r.content||'오늘 필요한 지역 생활 정보입니다.'),data:r,score:62+v38AgeScore(r)+v38KeywordBoost(r.title,ctx)}));
  ctx.coupons.forEach(r=>rows.push({kind:'coupon',id:String(r.id),title:r.title||r.discount_label||'오늘의 쿠폰',summary:v38Text(r.description||r.discount_label||'오늘 사용할 수 있는 혜택입니다.'),data:r,score:82+v38AgeScore(r)+v38KeywordBoost(r.title,ctx)}));
  ctx.picks.forEach(r=>{const cat=String(r.category||'').toLowerCase();const manual=(r.is_featured===true||Number(r.priority||0)>0)&&(cat==='promotion'||cat==='local_info'||cat==='event'||cat==='seasonal');rows.push({kind:'dalpick',id:String(r.id),title:r.title||(manual?'달타운 공지':'오늘의 추천'),summary:v38Text(r.recommendation_reason||r.summary||r.content||(manual?'달타운맵에서 전하는 공지·홍보입니다.':'오늘의 상황에 어울리는 추천입니다.')),data:r,score:(manual?1850:70)+Number(r.priority||0)*8+v38AgeScore(r)+v38KeywordBoost(r.title,ctx)});});
  ctx.featured.forEach(r=>rows.push({kind:'business',id:String(r.id),title:r.name||'추천 업소',summary:v38Text(r.recommendation_reason||r.short_description||r.description||`${r.city||'DFW'}에서 확인해 볼 추천 업소입니다.`),data:r,score:55+Number(r.rating||r.google_rating||0)*4+v38KeywordBoost(r.name,ctx)}));
  const seen=new Set();
  return rows.sort((a,b)=>b.score-a.score).filter(x=>{const k=x.title.toLowerCase();if(!k||seen.has(k))return false;seen.add(k);return true}).slice(0,8);
}
function v37RecommendationTags(item){
  const d=item?.data||{}, tags=[]; const add=v=>{v=v38Text(v,24);if(v&&!tags.includes(v))tags.push(v)};
  add(item?.kind==='dalpick' && (d.is_featured || Number(d.priority||0)>0) ? '달타운 공지' : '달타운 추천');
  if(item?.kind==='coupon'){add('오늘 혜택');add(d.discount_label||d.coupon_type)}
  if(item?.kind==='business'){add(d.subcategory||d.category);add(d.city);if(d.rating||d.google_rating)add(`평점 ${d.rating||d.google_rating}`)}
  if(item?.kind==='event') add('오늘 행사');
  if(item?.kind==='life') add('생활 정보');
  if(item?.kind==='dalpick') add(d.badge||d.category_label||(isThemeDalpick(d)?'추천 테마':'DalPick'));
  if(item?.kind==='newsroom'){add(d.school?'학교 등교 공지':(d.emergency?'긴급 지역 공지':(d.faith?'교회·종교 행사':'한인 소식')))}
  return tags.slice(0,3);
}
function v45BusinessName(b){return b?.name_ko||b?.name_en||b?.name||'달타운 추천 업체'}
function v45BusinessSummary(b){return v38Text(b?.short_description||b?.description||b?.category_ko||b?.category||b?.area||'달타운에서 추천하는 업체입니다.',105)}
function v45IsPublicInstitution(b={}){
  const text=`${b.name||''} ${b.name_ko||''} ${b.name_en||''} ${b.category||''} ${b.category_ko||''}`.toLowerCase();
  return /(총영사관|영사관|대사관|시청|카운티|경찰|소방|법원|도서관|공공기관|government|consulate|embassy|city of|county of|police department|fire department|public library)/i.test(text);
}
function v45StableShuffle(rows=[],seed=''){
  const hash=(value)=>{let h=2166136261;for(const ch of String(value)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0};
  return rows.slice().sort((a,b)=>hash(`${seed}-${a.id}`)-hash(`${seed}-${b.id}`));
}
function v61DateKey(value=new Date()){
  const d=value instanceof Date?value:new Date(value);
  const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function v61EffectiveHomeConfig(config={}){
  const today=v61DateKey();
  const schedules=Array.isArray(config.schedule_presets)?config.schedule_presets:[];
  const active=schedules.filter(row=>row&&row.enabled!==false&&(!row.start_date||row.start_date<=today)&&(!row.end_date||row.end_date>=today))
    .sort((a,b)=>Number(b.priority||0)-Number(a.priority||0)||String(b.start_date||'').localeCompare(String(a.start_date||'')))[0];
  return active?{...config,...active,business_ids:Array.isArray(active.business_ids)?active.business_ids:[],active_schedule_id:active.id||'',schedule_presets:schedules}:config;
}
function v61BusinessIdsWithCoupon(){
  return new Set((typeof coupons!=='undefined'&&Array.isArray(coupons)?activeCoupons(coupons):[]).flatMap(c=>[c.businessId,c.business_id,...(Array.isArray(c.business_ids)?c.business_ids:[])]).filter(Boolean).map(String));
}
function v61BusinessIdsWithBanner(){
  const ids=[];
  (typeof mainBanners!=='undefined'&&Array.isArray(mainBanners)?mainBanners:[]).filter(x=>x&&x.is_active!==false).forEach(x=>{
    [x.business_id,x.businessId].forEach(v=>{if(v)ids.push(v)});
    if(Array.isArray(x.business_ids))ids.push(...x.business_ids);
  });
  return new Set(ids.filter(Boolean).map(String));
}
function v73RoutineRecommendationOptions(){
  const aliases={featured:'recommended',recommend:'recommended',recommendation:'recommended',new_business:'new',newest:'new',popular_business:'popular',coupon_business:'coupon',banner_business:'banner',address_business:'address',selected:'admin',manual:'admin',random_business:'random'};
  const allowed=new Set(['recommended','new','popular','coupon','banner','address','admin','random']);
  const out=[];
  readActiveEventRoutines().forEach(r=>{
    const action=r?.actions?.recommendation;
    if(!action)return;
    const raw=Array.isArray(action.options)?action.options:(action.option?[action.option]:[]);
    raw.forEach(v=>{
      const key=aliases[String(v||'').trim()]||String(v||'').trim();
      if(allowed.has(key)&&!out.includes(key))out.push(key);
    });
  });
  return out;
}
function v74RoutineRecommendationAddressTerms(){
  const out=[];
  readActiveEventRoutines().forEach(r=>(r?.actions?.recommendation?.address_terms||[]).forEach(v=>{const t=String(v||'').trim().toLowerCase();if(t&&!out.includes(t))out.push(t)}));
  return out;
}
function v74BusinessMatchesAddress(b,terms=[]){
  if(!terms.length)return false;
  const hay=`${b?.address||''} ${b?.area||''}`.toLowerCase();
  return terms.some(term=>hay.includes(String(term).toLowerCase()));
}
function v73RoutineRecommendationInterval(){
  const row=readActiveEventRoutines().find(r=>r?.actions?.recommendation);
  return Math.max(3,Number(row?.actions?.recommendation?.interval_seconds||5))*1000;
}

function v83RecommendationLabel(config={}){
  const labels={recommended:'추천',new:'신규',popular:'인기',coupon:'쿠폰',banner:'배너',address:'주소',admin:'관리자 지정',random:'랜덤'};
  const options=v73RoutineRecommendationOptions();
  if(options.length)return options.map(v=>labels[v]||v).join(' · ');
  if(Array.isArray(config.business_ids)&&config.business_ids.length)return '관리자 지정';
  return ({featured:'추천',new:'신규',popular:'인기',coupon:'쿠폰',banner:'배너',random:'랜덤',daily:''}[String(config.business_mode||'featured')]??'추천');
}
function v45SelectedBusinesses(config={}){
  config=v61EffectiveHomeConfig(config);
  const all=(businesses||[]).filter(b=>isBusinessVisibleByPaidDate(b));
  const ids=(config.business_ids||[]).map(String);
  const consumerRows=all.filter(b=>!v45IsPublicInstitution(b));
  const featuredRows=consumerRows.filter(b=>b.featured===true||b.is_featured===true).sort((a,b)=>Number(a.featured_rank??1000)-Number(b.featured_rank??1000));
  const newRows=consumerRows.filter(b=>b.is_new===true).sort((a,b)=>Number(a.new_rank??1000)-Number(b.new_rank??1000));
  const popularRows=consumerRows.filter(b=>b.is_popular===true).sort((a,b)=>Number(a.popular_rank??1000)-Number(b.popular_rank??1000));
  const couponIds=v61BusinessIdsWithCoupon();
  const bannerIds=v61BusinessIdsWithBanner();
  const couponRows=consumerRows.filter(b=>couponIds.has(String(b.id)));
  const bannerRows=consumerRows.filter(b=>bannerIds.has(String(b.id)));
  const addressTerms=v74RoutineRecommendationAddressTerms();
  const addressRows=consumerRows.filter(b=>v74BusinessMatchesAddress(b,addressTerms));
  const adminRows=ids.length?all.filter(b=>ids.includes(String(b.id))):[];
  const randomRows=v45StableShuffle(consumerRows,todayKey());
  const options=v73RoutineRecommendationOptions();
  const groups={recommended:featuredRows,new:newRows,popular:popularRows,coupon:couponRows,banner:bannerRows,address:addressRows,admin:adminRows,random:randomRows};
  if(options.length){
    const seen=new Set(),rows=[];
    options.forEach(option=>(groups[option]||[]).forEach(b=>{const id=String(b.id);if(!seen.has(id)){seen.add(id);rows.push(b)}}));
    if(rows.length)return rows.slice(0,20);
  }
  if(adminRows.length)return adminRows.slice(0,20);
  const legacyMode=String(config.business_mode||'featured');
  const legacyGroups={featured:featuredRows,new:newRows,popular:popularRows,coupon:couponRows,banner:bannerRows,random:randomRows};
  const rows=legacyGroups[legacyMode]||featuredRows;
  return (rows.length?rows:(featuredRows.length?featuredRows:(newRows.length?newRows:(popularRows.length?popularRows:randomRows)))).slice(0,20);
}
function v66BoardHomePins(){
  try{const key=`kfocus_board_home_pins_v66_${String(typeof getAppRegion==='function'?getAppRegion():(window.APP_CONFIG?.APP_REGION||'dallas')).toLowerCase()}`;const v=JSON.parse(localStorage.getItem(key)||'[]');return new Set(Array.isArray(v)?v.map(String):[]);}catch{return new Set();}
}
function v66RoutineCommunityTypes(){
  const out=[];
  readActiveEventRoutines().forEach(r=>(r?.actions?.community?.options||[]).forEach(v=>{
    const n=normalizeBoardType(v);
    if(['notice','life','guide'].includes(n)&&!out.includes(n)) out.push(n);
  }));
  return out;
}
function v66RoutineCommunityEnabled(){
  return readActiveEventRoutines().some(r=>!!r?.actions?.community);
}
function v45CommunityRows(config={}){
  const routineTypes=v66RoutineCommunityTypes();
  const configured=(config.community_board_types||[]).map(normalizeBoardType).filter(v=>['notice','life','guide'].includes(v));
  const types=routineTypes.length?routineTypes:(configured.length?configured:['notice','life','guide']);
  const configPinned=new Set((config.community_post_ids||[]).map(String));
  const localPinned=v66BoardHomePins();
  const seen=new Set();
  const isPinned=(p)=>configPinned.has(String(p.id))||localPinned.has(String(p.id))||p.is_pinned===true||p.is_home_pinned===true||p.home_pinned===true;
  const rows=(boardPosts||[]).filter(p=>
    types.includes(normalizeBoardType(p.type)) &&
    (adminSession||!p.region||normalizeRegionKey(p.region)===currentRegion) &&
    p.is_active!==false
  ).filter(p=>{
    const id=String(p.id); if(seen.has(id)) return false; seen.add(id); return true;
  });
  const newest=(a,b)=>Date.parse(b.created_at||b.updated_at||0)-Date.parse(a.created_at||a.updated_at||0);
  const pinned=rows.filter(isPinned).sort((a,b)=>{
    const d=Number(a.pin_order||999)-Number(b.pin_order||999);
    return d||newest(a,b);
  });
  const latestByType=types.map(type=>rows.filter(p=>normalizeBoardType(p.type)===type&&!isPinned(p)).sort(newest)[0]).filter(Boolean);
  const output=[]; const outputSeen=new Set();
  [...pinned,...latestByType].forEach(p=>{const id=String(p.id);if(!outputSeen.has(id)){outputSeen.add(id);output.push(p);}});
  return output;
}
function v45PaintCommunity(){
  const el=document.getElementById('v45CommunityTicker');
  if(!el) return;
  const enabled=v66RoutineCommunityEnabled();
  if(!enabled){ el.hidden=true; el.innerHTML=''; return; }
  el.hidden=false;
  if(!v45CommunityItems.length){
    el.innerHTML='<button type="button" class="v71-community-slide" disabled><b>커뮤니티</b><span class="v71-community-type">새 소식</span><strong>새 소식을 준비하고 있습니다.</strong><i aria-hidden="true">›</i></button>';
    return;
  }
  if(v45CommunityIndex>=v45CommunityItems.length)v45CommunityIndex=0;
  const row=v45CommunityItems[v45CommunityIndex];
  const pinned=row.is_pinned===true||row.is_home_pinned===true||row.home_pinned===true||v66BoardHomePins().has(String(row.id));
  el.innerHTML=`<button type="button" class="v71-community-slide" data-community-id="${esc(row.id)}"><b>커뮤니티</b><span class="v71-community-type">${pinned?'📌 ':''}${esc(boardLabel(row.type))}</span><strong>${esc(row.title||'커뮤니티 새 소식')}</strong><i aria-hidden="true">›</i></button>`;
  el.querySelector('[data-community-id]')?.addEventListener('click',()=>openBoardPost(row.id));
}
function v45SetupCommunity(config){
  v45CommunityItems=v45CommunityRows(config);v45CommunityIndex=0;v45PaintCommunity();
  if(v45CommunityTimer){clearInterval(v45CommunityTimer);v45CommunityTimer=null;}
  if(v45CommunityItems.length>1){
    v45CommunityTimer=setInterval(()=>{v45CommunityIndex=(v45CommunityIndex+1)%v45CommunityItems.length;v45PaintCommunity();},5000);
  }
}
function v77RefreshRoutineDrivenHome(){
  const activeRoutines=readActiveEventRoutines();
  document.documentElement.dataset.eventRoutineCount=String(activeRoutines.length);
  const biz=v45SelectedBusinesses(v45HomeConfig||{});
  v37RecommendationItems=biz.map(b=>({kind:'business',data:b}));
  v37RecommendationIndex=0;
  paintV37Recommendation();
  if(v37RecommendationTimer)clearInterval(v37RecommendationTimer);
  const delay=v73RoutineRecommendationOptions().length?v73RoutineRecommendationInterval():5000;
  if(v37RecommendationItems.length>1)v37RecommendationTimer=setInterval(()=>{v37RecommendationIndex=(v37RecommendationIndex+1)%v37RecommendationItems.length;paintV37Recommendation();},delay);
  renderDalpicks();
  v45SetupCommunity(v45HomeConfig||{});
}
function openV37Recommendation(item){
  if(!item)return;const d=item.data||item;
  if(item.kind==='business'||d.id){selectedBizId=d.id;renderDetail(d.id);showPage('business-detail');}
}
function paintV37Recommendation(){
  const title=document.getElementById('v37RecommendTitle'),summary=document.getElementById('v37RecommendSummary'),tagsNode=document.getElementById('v37RecommendTags'),dots=document.getElementById('v37RecommendDots');
  if(!title||!summary||!dots)return;const item=v37RecommendationItems[v37RecommendationIndex];
  if(!item){title.textContent='추천 업체를 준비하고 있습니다.';summary.textContent='달타운이 선별한 업체를 확인해 보세요.';dots.innerHTML='';return;}
  const b=item.data||item;title.textContent=v45BusinessName(b);summary.textContent=v45BusinessSummary(b);
  if(tagsNode)tagsNode.innerHTML=[b.subcategory||b.category_sub||b.subcategory_ko||b.category_ko||b.category,b.area].filter(Boolean).slice(0,2).map(t=>`<span class="v37-recommend-tag">${esc(t)}</span>`).join('');
  dots.innerHTML=v37RecommendationItems.length>1?v37RecommendationItems.map((_,i)=>`<span class="${i===v37RecommendationIndex?'active':''}"></span>`).join(''):'';
}
function v38SignalText(candidates){
  return candidates.map(x=>`${x.title||''} ${x.summary||''}`).join(' ').toLowerCase();
}
function v38LifeBrief(ctx,candidates){
  const text=v38SignalText(candidates);
  const has=(re)=>re.test(text);
  const signals={
    heat:has(/폭염|무더|고온|더위|heat|hot weather|temperature|100°|99°|98°/i),
    rain:has(/비 예보|소나기|폭우|우천|rain|storm|thunder/i),
    mosquito:has(/모기|웨스트나일|방역|mosquito|west nile|spray/i),
    traffic:has(/도로 통제|교통 통제|폐쇄|공사|정체|traffic|closure|road work/i),
    sports:has(/경기|레인저스|카우보이스|매버릭스|FC Dallas|sports|game|match/i),
    performance:has(/공연|콘서트|뮤지컬|연극|festival|concert|performance/i),
    sale:has(/마트|세일|할인|특가|h마트|시온|코마트|sale|discount|grocery/i),
    event:ctx.events.length>0||has(/행사|축제|세미나|이벤트/i),
    weekend:ctx.weekend
  };
  let summary='오늘 확인된 달라스 생활 정보를 바탕으로 여유 있게 일정을 준비해 보세요.';
  let tip='새로운 공지와 행사는 수시로 바뀔 수 있으니 외출 전 한 번 더 확인하세요.';
  let checklist=['일정 확인'];
  let pattern='일반 생활';
  if(signals.mosquito){summary='일부 지역에서 모기 관련 안내나 방역 소식이 확인됩니다. 야외 활동을 계획했다면 긴소매 옷과 모기 기피제를 준비하는 것이 좋습니다.';tip='해 질 무렵에는 모기 활동이 늘 수 있으니 어린이와 반려동물의 야외 활동에 유의하세요.';checklist=['모기 기피제','긴소매'];pattern='안전·건강';}
  else if(signals.rain){summary='오늘 비나 소나기 관련 소식이 있습니다. 외출과 장보기는 비가 오기 전 미리 마치고, 세일 품목은 아래 생활 정보에서 확인해 보세요.';tip='차량 이동 시 평소보다 제동거리를 길게 두고 침수된 도로에는 진입하지 마세요.';checklist=['우산','장보기'];pattern='비 오는 날';}
  else if(signals.heat){summary='오늘 달라스는 무더운 날씨가 예상됩니다. 외출은 오전이나 저녁 시간을 추천하며, 시원한 냉면이나 실내 카페는 아래 업소 목록에서 확인해 보세요.';tip='차량 내부 온도가 빠르게 올라가므로 어린이와 반려동물을 차 안에 두지 마세요.';checklist=['물병','선크림'];pattern='폭염 생활';}
  else if(signals.traffic){summary='오늘 도로 통제나 교통 관련 안내가 확인됩니다. 평소보다 일찍 출발하고 주요 교차로와 행사장 주변은 우회 경로를 준비하세요.';tip='출발 직전 지도 앱에서 실시간 교통 상황을 확인하면 불필요한 지연을 줄일 수 있습니다.';checklist=['우회 경로','출발 시간'];pattern='교통 주의';}
  else if(signals.sports){summary='오늘 지역 스포츠 경기 소식이 있습니다. 경기장 주변은 시작 전부터 혼잡할 수 있으니 주차와 이동 시간을 넉넉히 잡으세요.';tip='경기 전후 주변 식당이 붐빌 수 있으므로 식사 시간을 조금 앞당기는 것이 좋습니다.';checklist=['티켓','주차'];pattern='스포츠 데이';}
  else if(signals.performance||signals.event){summary=`오늘 확인할 공연과 지역 행사가 ${ctx.events.length?ctx.events.length+'건 ':''}있습니다. 가족이나 친구와 가볍게 외출할 계획이라면 행사 시간과 주차 안내를 먼저 확인해 보세요.`;tip='인기 행사는 현장 주차가 빨리 찰 수 있으니 조금 일찍 도착하는 편이 좋습니다.';checklist=['행사 시간','주차'];pattern='공연·행사';}
  else if(signals.sale){summary='오늘 마트 세일과 할인 정보가 확인됩니다. 필요한 식료품이 있다면 품절되기 전 장보기를 계획하고, 세일 품목은 아래 생활 정보에서 확인해 보세요.';tip='할인 품목은 매장별 재고가 다를 수 있으므로 방문 전 확인하면 좋습니다.';checklist=['장보기 목록','세일 품목'];pattern='마트 세일';}
  else if(signals.weekend){summary='오늘은 주말입니다. 가까운 행사나 가족 나들이 정보를 확인하고, 이동 동선 주변의 맛집과 카페도 함께 둘러보세요.';tip='오후에는 주요 쇼핑몰과 행사장이 혼잡할 수 있으니 오전 일정을 추천합니다.';checklist=['행사','맛집'];pattern='주말 나들이';}
  return {summary,tip,checklist,pattern,signals};
}
function v38FallbackPayload(ctx,candidates){
  const region=(currentRegion==='dallas'||!currentRegion)?'달라스':((typeof REGION_LABELS!=='undefined'&&REGION_LABELS[currentRegion])||'우리 동네');
  const brief=v38LifeBrief(ctx,candidates);
  const faithCount=(ctx.koreanNews||[]).filter(x=>x.faith).length;
  return {title:`오늘의 ${region}`,kicker:`${brief.pattern} · 달타운 요약`,summary:brief.summary,tip:brief.tip,checklist:brief.checklist,recommendations:candidates,life:[
    {icon:'🇰🇷',title:'오늘의 한인 소식',subtitle:ctx.koreanNews?.length?`${ctx.koreanNews.length}건 새 소식`:'소식 확인'},
    {icon:faithCount?'⛪':(brief.signals.performance?'🎭':'🎉'),title:faithCount?'교회·종교 행사':'오늘 행사',subtitle:faithCount?`${faithCount}건 확인`:(ctx.events.length?`${ctx.events.length}건 새 소식`:'행사 확인')},
    {icon:brief.signals.heat?'🍜':(brief.signals.rain?'☕':'🍽️'),title:brief.signals.heat?'시원한 맛집':(brief.signals.rain?'실내 공간':'맛집·업소'),subtitle:ctx.featured.length?`${ctx.featured.length}곳 추천`:`${(businesses||[]).length}곳 찾기`},
    {icon:'📰',title:'달라스 라이프',subtitle:ctx.life.length?`${ctx.life.length}건 읽기`:'생활 정보 보기'}
  ],source:ctx.koreanNews?.length?'한인 소식 우선 선별':'달타운 생활 제안'};
}
async function v38GeneratePayload(ctx,candidates){
  const fallback=v38FallbackPayload(ctx,candidates);
  const dayKey=new Date().toISOString().slice(0,10);
  const fingerprint=dayKey+'|'+candidates.slice(0,5).map(x=>x.kind+':'+x.id+':'+Math.round(x.score)).join('|');
  try{const cached=JSON.parse(localStorage.getItem('daltownmap_v38_home')||'null');if(cached?.fingerprint===fingerprint)return cached.payload}catch(e){}
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),4500);
  try{
    const res=await fetch('/.netlify/functions/ai-daily-home',{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({date:dayKey,weekend:ctx.weekend,items:candidates.slice(0,8).map(x=>({kind:x.kind,title:x.title,summary:x.summary,score:Math.round(x.score)})),counts:{coupon:ctx.coupons.length,event:ctx.events.length,life:ctx.life.length,business:ctx.featured.length}})});
    if(res.ok){const ai=await res.json();if(ai?.summary){fallback.summary=v38Text(ai.summary,320);fallback.kicker=v38Text(ai.kicker||fallback.kicker,50);fallback.tip=v38Text(ai.tip||fallback.tip,180);if(Array.isArray(ai.checklist)&&ai.checklist.length)fallback.checklist=ai.checklist.slice(0,3);fallback.source=ai.source||'달타운 생활 제안';if(Array.isArray(ai.order)){const map=new Map(candidates.map(x=>[x.title,x]));const ordered=ai.order.map(t=>map.get(t)).filter(Boolean);fallback.recommendations=[...ordered,...candidates.filter(x=>!ordered.includes(x))]}}}
  }catch(e){console.info('[V38] AI function fallback:',e?.name==='AbortError'?'timeout':e?.message)}finally{clearTimeout(timeout)}
  try{localStorage.setItem('daltownmap_v38_home',JSON.stringify({fingerprint,payload:fallback,updatedAt:new Date().toISOString()}))}catch(e){}
  return fallback;
}
function paintV38HomePayload(payload,candidates){
  const titleNode=document.getElementById('v37BriefTitle'),summaryNode=document.getElementById('v37BriefSummary'),kicker=document.getElementById('v37BriefKicker'),state=document.getElementById('v38AutoState');
  if(titleNode)titleNode.textContent=payload.title;if(kicker)kicker.textContent=payload.kicker;if(summaryNode)summaryNode.textContent=payload.summary;if(state)state.textContent=`✓ ${payload.source}`;
  const tipNode=document.getElementById('v38BriefTip'),checkNode=document.getElementById('v38BriefChecklist'),chipsNode=document.getElementById('v37BriefChips');
  if(tipNode)tipNode.innerHTML=`<b>💡 오늘의 팁</b><span>${esc(payload.tip||'외출 전 최신 생활 정보를 한 번 더 확인하세요.')}</span>`;
  if(checkNode)checkNode.innerHTML=(payload.checklist||[]).slice(0,3).map(v=>`<span>✓ ${esc(v)}</span>`).join('');
  if(chipsNode)chipsNode.innerHTML='';
  const life=payload.life||[];const countIds=['v37CouponCount','v37EventCount','v37BusinessCount','v37LifeCount'];life.slice(0,4).forEach((x,i)=>{const ic=document.getElementById(`v38LifeIcon${i}`),tt=document.getElementById(`v38LifeTitle${i}`),sm=document.getElementById(countIds[i]);if(ic)ic.textContent=x.icon;if(tt)tt.textContent=x.title;if(sm)sm.textContent=x.subtitle});
  v37RecommendationItems=payload.recommendations||candidates;v37RecommendationIndex=0;paintV37Recommendation();if(v37RecommendationTimer)clearInterval(v37RecommendationTimer);if(v37RecommendationItems.length>1)v37RecommendationTimer=setInterval(()=>{v37RecommendationIndex=(v37RecommendationIndex+1)%v37RecommendationItems.length;paintV37Recommendation()},5200);
  if(window.lucide)window.lucide.createIcons();
}
async function v471FetchPublicHomeSettings(){
  // V82: Edge Function 응답과 newsroom_settings 테이블을 함께 확인합니다.
  // 함수가 이전 버전이거나 CDN에 오래된 응답이 남아 있어도 실제 DB의 최신 home_config가 우선입니다.
  const cfg=getConfig();
  const base=String(cfg.SUPABASE_URL||'').replace(/\/$/,'');
  const key=String(cfg.SUPABASE_ANON_KEY||'').trim();
  if(!base||!key)throw new Error('Supabase 공개 설정이 없습니다.');
  const region=String(currentRegion||'dallas').toLowerCase();
  const headers={'Content-Type':'application/json','apikey':key,'Authorization':`Bearer ${key}`,'Cache-Control':'no-cache'};
  let edgeConfig={}, directConfig={}, edgeError=null, directError=null;
  try{
    const endpoint=`${base}/functions/v1/${encodeURIComponent(String(cfg.NEWSROOM_FUNCTION_NAME||'newsroom'))}`;
    const res=await fetch(`${endpoint}?action=home_settings&region=${encodeURIComponent(region)}&_=${Date.now()}`,{method:'GET',headers,cache:'no-store'});
    const json=await res.json().catch(()=>({}));
    if(!res.ok||json.ok===false)throw new Error(json.error||json.message||`HTTP ${res.status}`);
    edgeConfig=json.home_config&&typeof json.home_config==='object'?json.home_config:{};
  }catch(error){edgeError=error;console.warn('[V83 settings] Edge Function read failed',error);}
  try{
    const rest=`${base}/rest/v1/newsroom_settings?select=home_config,updated_at&region=eq.${encodeURIComponent(region)}&limit=1`;
    const res=await fetch(rest,{method:'GET',headers:{...headers,Accept:'application/json'},cache:'no-store'});
    const rows=await res.json().catch(()=>[]);
    if(!res.ok)throw new Error(rows?.message||rows?.error||`HTTP ${res.status}`);
    const row=Array.isArray(rows)?rows[0]:null;
    directConfig=row?.home_config&&typeof row.home_config==='object'?row.home_config:{};
  }catch(error){directError=error;console.warn('[V83 settings] direct table read failed',error);}
  const directHasRoutines=Array.isArray(directConfig.event_routines);
  const edgeHasRoutines=Array.isArray(edgeConfig.event_routines);
  const result=directHasRoutines?{...edgeConfig,...directConfig}:{...directConfig,...edgeConfig};
  if(!Object.keys(result).length)throw(edgeError||directError||new Error('메인 설정을 읽지 못했습니다.'));
  console.info('[V83 settings] resolved',{region,source:directHasRoutines?'newsroom_settings':(edgeHasRoutines?'home_settings':'merged'),routines:Array.isArray(result.event_routines)?result.event_routines.length:0});
  return result;
}
async function loadMainSettings(forceRefresh=false){
  // V47.1: 설정과 피드를 별도 요청으로 읽습니다. home_feed 응답에 설정이 누락되거나
  // 오래된 함수가 남아 있어도 관리자 선택값이 우선 적용되도록 합니다.
  const [dedicatedConfig,items]=await Promise.all([
    v471FetchPublicHomeSettings(),
    v42LoadKoreanNews()
  ]);
  const feedConfig=items?.home_config&&typeof items.home_config==='object'?items.home_config:{};
  const feedMeta=items?.feed_meta&&typeof items.feed_meta==='object'?items.feed_meta:{};
  const config=Object.keys(dedicatedConfig||{}).length?dedicatedConfig:feedConfig;
  v45HomeConfig=config||{};
  window.__DALTOWN_SERVER_SETTINGS_LOADED__=true;
  window.__DALTOWN_MAIN_SETTINGS__=v45HomeConfig;
  window.__DALTOWN_HOME_FEED_META__=feedMeta;
  console.info('[V48.7 Main Settings] loaded',{config:v45HomeConfig,feedMeta,source:Object.keys(dedicatedConfig||{}).length?'home_settings':'home_feed'});
  return {items:Array.isArray(items)?items:[],config:v45HomeConfig,meta:feedMeta};
}
window.loadMainSettings = loadMainSettings;
// V72: 관리자에서 저장한 이벤트 루틴을 모든 기기에서 공유합니다.
// 메인 화면을 계속 열어 둔 경우에도 주기적으로 서버 설정을 다시 읽어 반영합니다.
let v72RoutineSettingsTimer=null;
function v72StartRoutineSettingsSync(){
  if(v72RoutineSettingsTimer)clearInterval(v72RoutineSettingsTimer);
  v72RoutineSettingsTimer=setInterval(async()=>{
    if(document.hidden)return;
    try{
      await loadMainSettings(true);
      v77RefreshRoutineDrivenHome();
    }catch(e){console.warn('[V72 routine sync]',e);}
  },30000);
}
document.addEventListener('visibilitychange',async()=>{
  if(!document.hidden){
    try{await loadMainSettings(true);v77RefreshRoutineDrivenHome();}catch(e){}
  }
});
setTimeout(v72StartRoutineSettingsSync,1500);

function v46FallbackProposalItems(config={}){
  const selected=new Set((config.proposal_categories||[]).map(String));
  const enabled=(key)=>!selected.size||selected.has(key);
  const defs=[
    {key:'shopping',label:'쇼핑·마켓',icon:'🛒',re:/(h\s?mart|zion|komart|코마트|시온|마트|마켓|grocery|sale|discount|할인|세일|특가|장보기)/i,title:'이번 주 마켓·쇼핑'},
    {key:'weather',label:'날씨',icon:'☀️',re:/(heat advisory|extreme heat|폭염|무더위|한파|강추위|비|소나기|폭우|눈|우박|storm|thunder|weather|대기질|꽃가루)/i,title:'오늘의 날씨·생활'},
    {key:'traffic',label:'교통',icon:'🚗',re:/(i-?121|highway 121|i-?35|i-?635|pgbt|dallas north tollway|george bush|tollway|유료도로|교통|정체|사고|road closure|도로 공사|우회)/i,title:'DFW 교통 정보'},
    {key:'event',label:'공연·이벤트',icon:'🎉',re:/(공연|콘서트|축제|박람회|가족행사|문화행사|festival|concert|performance|event)/i,title:'이번 주 공연·행사'},
    {key:'education',label:'교육',icon:'🎓',re:/(학교|학원|교육|개학|휴교|학부모|sat|student|school|isd|설명회)/i,title:'학교·교육 일정'},
    {key:'real_estate',label:'부동산',icon:'🏠',re:/(부동산|주택|모기지|오픈하우스|분양|집값|real estate|housing|mortgage)/i,title:'주택·부동산 정보'},
    {key:'finance',label:'은행·금융',icon:'🏦',re:/(은행|대출|예금|금리|sba|bank|loan|금융|소상공인 금융)/i,title:'은행·금융 정보'},
    {key:'seminar',label:'세미나',icon:'📋',re:/(세미나|설명회|강연|워크숍|seminar|workshop|법률|세금|은퇴|메디케어|보험|창업|투자 설명)/i,title:'생활 세미나 안내'},
    {key:'faith',label:'종교 행사',icon:'⛪',re:/(교회|성당|천주교|불교|사찰|예배|부흥회|찬양집회|여름성경학교|vbs|선교|기도회|수련회|바자회|church|catholic|temple|worship)/i,title:'종교·커뮤니티 행사'}
  ];
  const rows=(boardPosts||[]).filter(p=>adminSession||!p.region||normalizeRegionKey(p.region)===currentRegion);
  const result=[];const seen=new Set();
  for(const row of rows){
    const text=`${row.title||''} ${row.summary||''} ${row.content||''}`;
    const emergency=/(amber alert|silver alert|clear alert|blue alert|tornado warning|flash flood warning|severe thunderstorm warning|evacuation|shelter in place|긴급|대피|경보|통제|휴교|지연 등교|조기 하교)/i.test(text);
    const def=emergency?{key:'emergency',label:'긴급 안내',icon:'🚨',title:'지역 긴급 공지'}:defs.find(d=>enabled(d.key)&&d.re.test(text));
    if(!def||seen.has(def.key))continue;
    seen.add(def.key);
    result.push({id:`fallback-${row.id}-${def.key}`,category:def.key,category_label:def.label,icon:def.icon,title:def.title,summary:'',link:'',has_link:true,target_type:'post',target_id:row.id,link_label:'기사 보기',board_post_id:row.id,emergency});
  }
  return result.slice(0,8);
}


function v461NormalizeProposalCategory(value=''){
  const s=String(value||'').trim().toLowerCase().replace(/[\s-]+/g,'_');
  const aliases={
    business:'business',business_promotion:'business','업소':'business','업소 추천':'business','업체 추천':'business',
    shopping:'shopping',market:'shopping',grocery:'shopping',sale:'shopping','쇼핑':'shopping','쇼핑·마켓':'shopping','마트':'shopping',
    weather:'weather',heat:'weather',heat_advisory:'weather','기상':'weather','날씨':'weather',
    traffic:'traffic',transportation:'traffic','교통':'traffic',
    event:'event',events:'event',performance:'event','공연':'event','공연·이벤트':'event','행사':'event',
    education:'education',school:'education','교육':'education',
    real_estate:'real_estate',realestate:'real_estate',housing:'real_estate','부동산':'real_estate',
    finance:'finance',bank:'finance','은행':'finance','은행·금융':'finance','금융':'finance',
    seminar:'seminar','세미나':'seminar',
    faith:'faith',religion:'faith','종교':'faith','종교_행사':'faith','종교 행사':'faith',
    emergency:'emergency',urgent:'emergency','긴급':'emergency'
  };
  return aliases[s]||s;
}
function v461CategoryDefinition(key){
  return {
    business:{label:'업소 추천',icon:'🏪',re:/(업소|업체|비즈니스|business|카페|식당|미용실|병원|학원|마트|추천)/i,title:'오늘의 추천 업소',summary:'달타운맵에서 선택한 업소를 소개합니다.'},
    shopping:{label:'쇼핑·마켓',icon:'🛒',re:/(h\s?mart|zion|komart|코마트|시온|마트|마켓|grocery|sale|discount|할인|세일|특가|장보기)/i,title:'이번 주 마켓·쇼핑',summary:'오늘 확인된 마켓·쇼핑 정보를 살펴보고 필요한 품목과 행사 기간을 확인해 보세요.'},
    weather:{label:'날씨',icon:'☀️',re:/(heat advisory|extreme heat|폭염|무더위|한파|강추위|비|소나기|폭우|눈|우박|storm|thunder|weather|대기질|꽃가루)/i,title:'오늘 날씨에 맞춰 일정을 조정해 보세요.',summary:'외출 전 최신 기상 안내를 확인하고 날씨에 맞게 이동 시간과 준비물을 조정해 보세요.'},
    traffic:{label:'교통',icon:'🚗',re:/(i-?121|highway 121|i-?35|i-?635|pgbt|dallas north tollway|george bush|tollway|유료도로|교통|정체|사고|road closure|도로 공사|우회)/i,title:'DFW 교통 정보',summary:'정체·사고·공사 가능성을 확인하고 필요하면 우회 경로와 출발 시간을 조정해 보세요.'},
    event:{label:'공연·이벤트',icon:'🎉',re:/(공연|콘서트|축제|박람회|가족행사|문화행사|festival|concert|performance|event)/i,title:'이번 주 공연·행사',summary:'오늘과 이번 주말에 열리는 공연·행사의 시간과 장소를 확인해 보세요.'},
    education:{label:'교육',icon:'🎓',re:/(학교|학원|교육|개학|휴교|학부모|sat|student|school|isd|설명회)/i,title:'학교·교육 일정',summary:'학교 일정과 교육 관련 공지를 확인하고 필요한 준비를 미리 해두세요.'},
    real_estate:{label:'부동산',icon:'🏠',re:/(부동산|주택|모기지|오픈하우스|분양|집값|real estate|housing|mortgage)/i,title:'주택·부동산 정보',summary:'주택·모기지·오픈하우스 관련 정보를 확인하고 조건과 일정을 비교해 보세요.'},
    finance:{label:'은행·금융',icon:'🏦',re:/(은행|대출|예금|금리|sba|bank|loan|금융|소상공인 금융)/i,title:'은행·금융 정보',summary:'대출·예금·금리 관련 안내를 확인하고 세부 조건을 비교해 보세요.'},
    seminar:{label:'세미나',icon:'📋',re:/(세미나|설명회|강연|워크숍|seminar|workshop|법률|세금|은퇴|메디케어|보험|창업|투자 설명)/i,title:'생활 세미나 안내',summary:'법률·부동산·은행·세금 등 관심 분야의 설명회와 세미나 일정을 확인해 보세요.'},
    faith:{label:'종교 행사',icon:'⛪',re:/(교회|성당|천주교|불교|사찰|예배|부흥회|찬양집회|여름성경학교|vbs|선교|기도회|수련회|바자회|church|catholic|temple|worship)/i,title:'종교·커뮤니티 행사',summary:'지역 교회·성당·사찰의 행사와 모임 일정을 확인해 보세요.'}
  }[key]||null;
}
function v461PrepareProposalItems(items=[],config={}){
  const selected=new Set((config.proposal_categories||[]).map(v461NormalizeProposalCategory).filter(Boolean));
  const result=[];
  for(const raw of (items||[])){
    const emergency=Boolean(raw?.emergency||raw?.school);
    let key=v461NormalizeProposalCategory(raw?.category||raw?.category_key||raw?.category_label||'');
    const sourceText=`${raw?.source_title||''} ${raw?.original_title||''} ${raw?.summary||''}`;
    if(!key||!v461CategoryDefinition(key)){
      key=['business','shopping','weather','traffic','event','education','real_estate','finance','seminar','faith'].find(k=>v461CategoryDefinition(k).re.test(sourceText))||'';
    }
    if(!emergency && selected.size && !selected.has(key)) continue;
    const def=v461CategoryDefinition(key);
    const item={...raw};
    if(def){
      item.category=key;
      item.category_label=def.label;
      item.icon=item.icon||def.icon;
      item.title=item.title||def.title;
      // 카테고리와 요약 내용이 맞지 않으면 다른 업소/기사 문구를 노출하지 않고 안전한 제안문으로 교체합니다.
      const summary=String(item.summary||'').trim();
      const adminSelected=v51IsAdminSelected(item);
      item.summary=adminSelected&&summary ? summary : ((summary && def.re.test(`${item.source_title||''} ${item.original_title||''} ${summary}`)) ? summary : def.summary);
    }
    result.push(item);
  }
  return result;
}

// V51: "오늘의 달타운" unified live carousel.
let v51TodayItems=[];
let v51TodayIndex=0;
let v51TodayTimer=null;
let v51RelativeTimer=null;
let v51AutoRefreshTimer=null;
let v51RefreshInFlight=false;
let v51TouchStartX=0;
function v51ItemTime(item){
  const raw=item?.updated_at||item?.published_at||item?.generated_at||item?.created_at||'';
  const ts=Date.parse(raw);
  return Number.isFinite(ts)?ts:0;
}
function v51RelativeLabel(timestamp){
  if(!timestamp)return '';
  const minutes=Math.max(0,Math.floor((Date.now()-timestamp)/60000));
  if(minutes<1)return '방금 업데이트';
  if(minutes<60)return `${minutes}분 전 업데이트`;
  const hours=Math.floor(minutes/60);
  if(hours<24)return `${hours}시간 전 업데이트`;
  return '업데이트가 지연되고 있습니다';
}
function v51IsAdminSelected(item={}){
  return Boolean(item.is_featured||item.featured||item.is_manual||item.manual||item.pinned||item.selected_by_admin||Number(item.priority||0)>0||item.admin_selected);
}
function v51CategoryRank(item={}){
  if(item.emergency||item.school)return 0;
  if(v51IsAdminSelected(item))return 1;
  const key=v461NormalizeProposalCategory(item.category);
  return ({weather:2,traffic:3,business:4,shopping:5,event:6,education:7,real_estate:8,finance:9,seminar:10,faith:11})[key]??20;
}
async function v51LoadDirectEditorItems(){
  // V51.5 safety fallback: read administrator-selected home cards directly.
  // This keeps the home carousel in sync even when an older newsroom Edge Function
  // is still cached or was not redeployed together with the Netlify package.
  try{
    if(typeof supabase==='undefined'||!supabase?.from)return [];
    const region=(currentRegion||'dallas');
    const {data,error}=await supabase.from('newsroom_items')
      .select('id,ai_title,ai_summary,original_title,original_summary,event_data,priority_score,source_published_at,collected_at,updated_at')
      .eq('region',region)
      .order('updated_at',{ascending:false})
      .limit(80);
    if(error)throw error;
    const normalized=(data||[]).map(row=>{
      const meta=(row.event_data&&typeof row.event_data==='object')?row.event_data:{};
      const text=`${meta.home_category||''} ${meta.category||''} ${row.ai_title||''} ${row.original_title||''} ${row.ai_summary||''} ${row.original_summary||''}`;
      let category=String(meta.home_category||meta.category||'').trim();
      if(!['business','shopping','event'].includes(category)){
        if(/market|shopping|zion|h\s*mart|마트|마켓|세일|할인|장보기/i.test(text))category='shopping';
        else if(/event|festival|concert|seminar|행사|공연|축제|세미나|박람회|모임/i.test(text))category='event';
        else category='';
      }
      if(!category)return null;
      const pinned=String(meta.selection_source||'')==='editor'||meta.home_show===true;
      return {row,meta,category,pinned};
    }).filter(Boolean);
    const choose=cat=>normalized.find(x=>x.category===cat&&x.pinned)||normalized.find(x=>x.category===cat);
    const picked=[choose('shopping'),choose('event'),...normalized.filter(x=>x.category==='business'&&x.pinned)]
      .filter(Boolean).filter((x,i,a)=>a.findIndex(y=>String(y.row.id)===String(x.row.id))===i);
    return picked.map(({row,meta,category,pinned})=>{
      const targetType=String(meta.home_target_type||'').trim();
      const targetId=String(meta.home_target_id||'').trim();
      const external=targetType==='external'&&/^https?:\/\//i.test(String(meta.home_external_url||''));
      const linked=['post','business'].includes(targetType)&&Boolean(targetId);
      return {
        id:`direct-${row.id}-${category}`,source_id:String(row.id),category,
        title:String(meta.home_custom_title||row.ai_title||row.original_title||'오늘의 달타운').trim(),
        summary:String(meta.home_custom_message||row.ai_summary||row.original_summary||'').trim(),
        target_type:external?'external':(linked?targetType:''),target_id:linked?targetId:'',
        url:external?String(meta.home_external_url||'').trim():'',
        link_label:(linked||external)?String(meta.home_link_label||'자세히 보기'):'',
        selected_by_admin:pinned,admin_selected:pinned,is_manual:pinned,is_pinned:pinned,auto_selected:!pinned&&['shopping','event'].includes(category),
        priority:Number(row.priority_score||(pinned?999:0)),
        published_at:row.source_published_at||row.collected_at,
        updated_at:row.updated_at||row.collected_at||row.source_published_at,
      };
    });
  }catch(error){
    console.warn('[V51.5 Today Daltown] direct editor fallback unavailable',error?.message||error);
    return [];
  }
}

async function v517LoadNetlifyEditorItems(){
  try{
    const region=encodeURIComponent(currentRegion||'dallas');
    const res=await fetch(`/.netlify/functions/today-daltown-feed?region=${region}&_=${Date.now()}`,{cache:'no-store'});
    const json=await res.json().catch(()=>({}));
    if(!res.ok||json.ok===false)throw new Error(json.error||`HTTP ${res.status}`);
    return Array.isArray(json.items)?json.items:[];
  }catch(error){
    console.warn('[V51.7 Today Daltown] Netlify editor feed unavailable',error?.message||error);
    return [];
  }
}

function v51MergeTodaySources(feedItems=[],directItems=[]){
  const merged=[...(directItems||[]),...(feedItems||[])];
  const seen=new Set();
  return merged.filter(item=>{
    const source=String(item.source_id||item.id||'');
    const key=source?`source:${source}`:`${String(item.category||'')}|${String(item.title||'').trim().toLowerCase()}`;
    if(seen.has(key))return false;seen.add(key);return true;
  });
}
function v537ApplyAutoCardOverrides(items=[]){
  const cfg=(window.__DALTOWN_MAIN_SETTINGS__&&typeof window.__DALTOWN_MAIN_SETTINGS__==='object')?window.__DALTOWN_MAIN_SETTINGS__:{};
  const overrides=(cfg.auto_card_overrides&&typeof cfg.auto_card_overrides==='object')?cfg.auto_card_overrides:{};
  return (items||[]).map(item=>{const cat=String(item?.category||'').toLowerCase();if(!['weather','traffic'].includes(cat))return item;const o=(overrides[cat]&&typeof overrides[cat]==='object')?overrides[cat]:{};const targetType=String(o.target_type||'').trim();const targetId=String(o.target_id||'').trim();const externalUrl=String(o.external_url||'').trim();const linked=(targetType==='business'&&targetId)||(targetType==='external'&&externalUrl);return {...item,title:String(o.title||'').trim()||item.title,summary:String(o.message||'').trim()||item.summary,subtitle:String(o.message||'').trim()||item.subtitle,admin_message:Boolean(String(o.message||'').trim()),target_type:linked?targetType:(item.target_type||''),target_id:targetType==='business'&&targetId?targetId:(item.target_id||''),url:targetType==='external'&&externalUrl?externalUrl:(item.url||item.link||item.source_url||''),link_label:linked?(String(o.link_label||'자세히 보기').trim()||'자세히 보기'):(item.link_label||'')};});
}

function v51PrepareTodayItems(items=[]){
  const rows=v537ApplyAutoCardOverrides(items||[]).filter(item=>{
    const key=v461NormalizeProposalCategory(item.category);
    return Boolean(item.emergency||item.school||v51IsAdminSelected(item)||key==='weather'||key==='traffic');
  }).slice().sort((a,b)=>v51CategoryRank(a)-v51CategoryRank(b));
  const seen=new Set();
  return rows.filter(item=>{
    const key=`${v461NormalizeProposalCategory(item.category)}|${String(item.title||item.source_title||'').trim().toLowerCase()}`;
    if(seen.has(key))return false;
    seen.add(key);return true;
  }).slice(0,12);
}
function v51OpenItem(item){
  if(!item)return;
  if(item.target_type==='post'&&item.target_id){openBoardPost(item.target_id);return;}
  if(item.target_type==='business'&&item.target_id){selectedBizId=item.target_id;renderDetail(item.target_id);showPage('business-detail');return;}
  const url=item.url||item.link||item.source_url;
  if(url)window.open(url,'_blank','noopener,noreferrer');
}
function v51PaintToday(){
  const item=v51TodayItems[v51TodayIndex];
  const card=document.getElementById('v37BriefCard');
  const category=document.getElementById('v51TodayCategory');
  const title=document.getElementById('v37BriefTitle');
  const summary=document.getElementById('v37BriefSummary');
  const time=document.getElementById('v51TodayRelativeTime');
  const link=document.getElementById('v51TodayLinkLabel');
  const dots=document.getElementById('v51TodayDots');
  const main=document.getElementById('v51TodayMain');
  if(!card||!title||!summary)return;
  card.className='v37-brief-card v51-today-card';
  if(!item){
    if(category)category.textContent='생활 정보';
    title.textContent='오늘의 정보를 준비하고 있습니다.';
    summary.textContent='날씨·교통·쇼핑 정보가 수집되면 이곳에 표시됩니다.';
    if(time)time.textContent='';if(link)link.textContent='';if(dots)dots.innerHTML='';
    if(main){main.disabled=true;main.classList.remove('has-link');}
    return;
  }
  const key=(item.emergency||item.school)?'emergency':v461NormalizeProposalCategory(item.category);
  const def=v461CategoryDefinition(key);
  const admin=v51IsAdminSelected(item)&&key!=='emergency';
  const labels={emergency:'긴급 공지',weather:'오늘의 날씨',traffic:'교통 정보',business:'업소 추천',shopping:'쇼핑 정보',event:'행사 정보',education:'교육 정보',real_estate:'부동산 정보',finance:'금융 정보',seminar:'세미나',faith:'커뮤니티 행사'};
  const icons={emergency:'🚨',weather:'☀️',traffic:'🚗',business:'🏪',shopping:'🛒',event:'🎉',education:'🎓',real_estate:'🏠',finance:'🏦',seminar:'📋',faith:'⛪'};
  card.classList.add(`v51-kind-${key||'default'}`);
  if(admin)card.classList.add('v51-admin-selected');
  if(category)category.textContent=`${admin?'⭐ ':icons[key]||item.icon||'✨ '}${admin?'관리자 추천':(labels[key]||item.category_label||'오늘의 정보')}`;
  title.textContent=String(item.title||item.source_title||def?.title||'오늘의 생활 정보').replace(/\s+/g,' ').trim();
  summary.textContent=String(item.subtitle||item.summary||item.original_title||def?.summary||'자세한 내용을 확인해 보세요.').replace(/\s+/g,' ').trim();
  const ts=v51ItemTime(item);
  if(time){time.textContent=v51RelativeLabel(ts);time.classList.toggle('stale',Boolean(ts&&Date.now()-ts>60*60000));}
  const hasLink=Boolean((item.target_id&&item.target_type)||(item.url||item.link||item.source_url));
  if(link)link.textContent=hasLink?(item.link_label||'자세히 보기 →'):'';
  if(main){main.disabled=false;main.classList.toggle('has-link',hasLink);main.onclick=hasLink?()=>v51OpenItem(item):null;}
  if(dots)dots.innerHTML=v51TodayItems.length>1?v51TodayItems.map((_,i)=>`<span class="${i===v51TodayIndex?'active':''}"></span>`).join(''):'';
}
function v51StartTodayTimer(delay=5000){
  if(v51TodayTimer)clearInterval(v51TodayTimer);
  if(v51TodayItems.length>1)v51TodayTimer=setInterval(()=>{v51TodayIndex=(v51TodayIndex+1)%v51TodayItems.length;v51PaintToday();},delay);
}
function v51MoveToday(step){
  if(!v51TodayItems.length)return;
  v51TodayIndex=(v51TodayIndex+step+v51TodayItems.length)%v51TodayItems.length;
  v51PaintToday();v51StartTodayTimer(5000);
}
async function v51RefreshToday(){
  if(v51RefreshInFlight)return;
  v51RefreshInFlight=true;
  const btn=document.getElementById('v51TodayRefresh');
  if(btn){btn.disabled=true;btn.classList.add('is-loading');}
  try{
    const settled=await Promise.allSettled([loadMainSettings(true),v517LoadNetlifyEditorItems(),v51LoadDirectEditorItems()]);
    const mainData=settled[0].status==='fulfilled'?settled[0].value:{items:[],config:v45HomeConfig||{},meta:{partial:true}};
    const netlifyEditorItems=settled[1].status==='fulfilled'?settled[1].value:[];
    const directEditorItems=settled[2].status==='fulfilled'?settled[2].value:[];
    settled.forEach((r,i)=>{if(r.status==='rejected')console.warn('[V52.1 Today] partial source failed',i,r.reason);});
    v45HomeConfig=v61EffectiveHomeConfig(mainData.config||v45HomeConfig||{});
    if(typeof renderDalpicks==='function')renderDalpicks();
    const combined=v51MergeTodaySources(mainData.items||[],[...netlifyEditorItems,...directEditorItems]);
    const prepared=v461PrepareProposalItems(combined,{...v45HomeConfig,proposal_categories:['weather','traffic','business','shopping','emergency','event','education','real_estate','finance','seminar','faith']});
    const rows=v51MergeTodaySources(prepared,combined.filter(v51IsAdminSelected));
    v51TodayItems=v51PrepareTodayItems(rows);v51TodayIndex=0;v51PaintToday();v51StartTodayTimer();
  }catch(error){console.warn('[V51 Today] refresh failed',error);}
  finally{if(btn){btn.disabled=false;btn.classList.remove('is-loading');}v51RefreshInFlight=false;if(window.lucide)window.lucide.createIcons();}
}
function v51InitToday(){
  const btn=document.getElementById('v51TodayRefresh');
  if(btn&&!btn.dataset.bound){btn.dataset.bound='1';btn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();v51RefreshToday();});}
  const main=document.getElementById('v51TodayMain');
  if(main&&!main.dataset.swipeBound){
    main.dataset.swipeBound='1';
    main.addEventListener('touchstart',e=>{v51TouchStartX=e.changedTouches?.[0]?.clientX||0;},{passive:true});
    main.addEventListener('touchend',e=>{const x=e.changedTouches?.[0]?.clientX||0;const dx=x-v51TouchStartX;if(Math.abs(dx)>42){e.preventDefault();v51MoveToday(dx<0?1:-1);}},{passive:false});
  }
  if(v51RelativeTimer)clearInterval(v51RelativeTimer);
  v51RelativeTimer=setInterval(v51PaintToday,30000);
  if(!v51AutoRefreshTimer)v51AutoRefreshTimer=setInterval(()=>{if(!document.hidden&&document.getElementById('v37BriefCard'))v51RefreshToday();},5*60*1000);
}

async function renderV37AIHome(){
  const sequence=++v44HomeRenderSequence;
  const dateNode=document.getElementById('v37BriefDate');if(!dateNode)return;
  dateNode.textContent=new Intl.DateTimeFormat('ko-KR',{month:'long',day:'numeric',weekday:'short'}).format(new Date());
  let loaded=[];let feedMeta={};
  try{
    const settled=await Promise.allSettled([loadMainSettings(),v517LoadNetlifyEditorItems(),v51LoadDirectEditorItems()]);
    const mainData=settled[0].status==='fulfilled'?settled[0].value:{items:[],config:{},meta:{partial:true}};
    const netlifyEditorItems=settled[1].status==='fulfilled'?settled[1].value:[];
    const directEditorItems=settled[2].status==='fulfilled'?settled[2].value:[];
    settled.forEach((r,i)=>{if(r.status==='rejected')console.warn('[V52.1 Home] partial source failed',i,r.reason);});
    loaded=v51MergeTodaySources(mainData.items||[],[...netlifyEditorItems,...directEditorItems]);feedMeta=mainData.meta||{};v45HomeConfig=v61EffectiveHomeConfig(mainData.config||{});
    window.__DALTOWN_MAIN_SETTINGS__=v45HomeConfig;
    document.documentElement.dataset.eventRoutineCount=String(readActiveEventRoutines().length);
    console.info('[V83 routines] active',readActiveEventRoutines().map(r=>({id:r.id,name:r.name,actions:Object.keys(r.actions||{})})));
    if(typeof renderDalpicks==='function')renderDalpicks();
  }catch(error){console.error('[V51 Home] settings/feed load failed',error);loaded=[];v45HomeConfig={};}
  if(sequence!==v44HomeRenderSequence)return;
  const prepared=v461PrepareProposalItems(loaded,{...v45HomeConfig,proposal_categories:['weather','traffic','business','shopping','emergency','event','education','real_estate','finance','seminar','faith']});
  // V51.8: administrator-selected cards returned by the verified Netlify feed are authoritative.
  // Re-merge them after legacy category preparation so they cannot be removed by old collection preferences.
  const authoritativeAdmin=loaded.filter(v51IsAdminSelected);
  loaded=v51MergeTodaySources(prepared,authoritativeAdmin);
  v45ProposalItems=loaded;
  v51TodayItems=v51PrepareTodayItems(loaded);v51TodayIndex=0;v51PaintToday();v51StartTodayTimer(5000);v51InitToday();
  console.info('[V51 Today Daltown] render',{feedMeta,count:v51TodayItems.length,items:v51TodayItems.map(x=>({category:x.category,title:x.title,admin:v51IsAdminSelected(x)}))});
  const alertCard=document.getElementById('v43AlertCard');if(alertCard)alertCard.classList.add('hidden');
  const biz=v45SelectedBusinesses(v45HomeConfig);console.info('[V83 recommendation] authoritative',{options:v73RoutineRecommendationOptions(),addressTerms:v74RoutineRecommendationAddressTerms(),count:biz.length,names:biz.slice(0,8).map(b=>b.name||b.name_ko)});v37RecommendationItems=biz.map(b=>({kind:'business',data:b}));v37RecommendationIndex=0;paintV37Recommendation();
  const label=document.getElementById('v45BusinessModeLabel');if(label){const m=v83RecommendationLabel(v45HomeConfig);label.textContent=m;label.hidden=!m;}
  if(v37RecommendationTimer)clearInterval(v37RecommendationTimer);const hc=v61EffectiveHomeConfig(v45HomeConfig||{}),play=hc.autoplay?.today!==false,delay=v73RoutineRecommendationOptions().length?v73RoutineRecommendationInterval():Math.max(2,Number(hc.intervals?.today||10))*1000;if(play&&v37RecommendationItems.length>1)v37RecommendationTimer=setInterval(()=>{v37RecommendationIndex=(v37RecommendationIndex+1)%v37RecommendationItems.length;paintV37Recommendation()},delay);
  v45SetupCommunity(v45HomeConfig);
  if(window.lucide)window.lucide.createIcons();
}
function initV37AIHomeEvents(){
  const main=document.getElementById('v37RecommendMain');if(main&&!main.dataset.bound){main.dataset.bound='1';main.addEventListener('click',()=>openV37Recommendation(v37RecommendationItems[v37RecommendationIndex]))}
  document.querySelectorAll('[data-v37-nav]').forEach(btn=>{if(btn.dataset.bound)return;btn.dataset.bound='1';btn.addEventListener('click',()=>showPage(btn.dataset.v37Nav))});
  document.querySelectorAll('[data-v37-board]').forEach(btn=>{if(btn.dataset.bound)return;btn.dataset.bound='1';btn.addEventListener('click',()=>{selectedBoardType=btn.dataset.v37Board;renderHomeBoardSection(selectedBoardType);document.querySelector('.community-home-card')?.scrollIntoView({behavior:'smooth',block:'start'})})});
}

function renderHome(){
  renderHomeBoardSection(selectedBoardType || 'notice');
  if (typeof renderMainBanners === 'function') renderMainBanners();

  const featured = sortBusinessesByDistance(
    businesses.filter(b => b.featured && isBusinessVisibleByPaidDate(b))
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

const legacyTicker=document.querySelector('.home-ticker-section'); if(legacyTicker) legacyTicker.hidden=true;
if (typeof renderTodayCoupons === 'function') { renderTodayCoupons(); }
if (typeof renderHomeBusinessTabs === 'function') {
  renderHomeBusinessTabs();
}
  renderV37AIHome().catch(error=>console.error('[V48 Home] render failed',error));
  initV37AIHomeEvents();
  const newList = businesses
    .filter(b => b.is_new && isBusinessVisibleByPaidDate(b))
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
    .filter(b => b.is_popular && isBusinessVisibleByPaidDate(b))
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



// Global recommendation-theme helpers.
// These must stay outside renderDetail(), because the business-list page uses them too.
function normalizeThemeTarget(value){
  const s=String(value||'').trim().toLowerCase().replace(/\s+/g,'_');
  if(['restaurant','food','식당','음식','한식','카페'].some(v=>s.includes(v))) return 'restaurant';
  if(['business','업소','업체','비즈니스'].some(v=>s.includes(v))) return 'business';
  if(['shopping','shop','쇼핑','마트'].some(v=>s.includes(v))) return 'shopping';
  if(['hospital','medical','health','병원','의료','건강','미용','뷰티'].some(v=>s.includes(v))) return 'hospital';
  if(['finance','tax','account','금융','세무','회계','보험'].some(v=>s.includes(v))) return 'finance';
  if(['law','legal','법률','변호'].some(v=>s.includes(v))) return 'law';
  if(['church','종교','종교'].some(v=>s.includes(v))) return 'church';
  if(['real_estate','realestate','부동산','주택'].some(v=>s.includes(v))) return 'real_estate';
  if(['service','auto','car','서비스','자동차','정비'].some(v=>s.includes(v))) return 'service';
  if(['all','전체','전체_업종'].includes(s)) return 'all';
  return s;
}
function normalThemeTarget(value){ return normalizeThemeTarget(value); }
function parseThemeTargets(value){
  if(Array.isArray(value)) return value;
  if(typeof value==='string'){
    const text=value.trim();
    if(!text) return [];
    if(text.startsWith('{')&&text.endsWith('}')){
      return text.slice(1,-1).split(',').map(v=>v.replace(/^"|"$/g,'').trim()).filter(Boolean);
    }
    try{ const parsed=JSON.parse(text); if(Array.isArray(parsed)) return parsed; }catch(e){}
    return text.split(',').map(v=>v.trim()).filter(Boolean);
  }
  return [];
}
function themeReadingMinutes(content){
  return Math.max(1,Math.ceil(String(content||'').replace(/\s+/g,' ').trim().length/500));
}

function getBusinessPageThemes(){
  const selected = businessQuickFilter || '';
  const selectedTarget = normalizeThemeTarget(selected);
  const now = Date.now();
  return (dalpicks || []).filter(row => {
    if (!isThemeDalpick(row) || row.is_active === false) return false;
    const status = String(row.status || '').toLowerCase();
    if (status && !['published','active'].includes(status)) return false;
    const start = row.start_at || row.start_date;
    const end = row.end_at || row.end_date;
    if (start && new Date(start).getTime() > now) return false;
    if (end && new Date(end).getTime() < now) return false;
    const targets = parseThemeTargets(row.target_categories).map(normalizeThemeTarget);
    if (!selectedTarget) return targets.includes('all') || targets.length > 0;
    return targets.includes('all') || targets.includes(selectedTarget);
  }).sort((a,b) => {
    const at = parseThemeTargets(a.target_categories).map(normalizeThemeTarget);
    const bt = parseThemeTargets(b.target_categories).map(normalizeThemeTarget);
    if (!selectedTarget) {
      const aAll = at.includes('all') ? 1 : 0;
      const bAll = bt.includes('all') ? 1 : 0;
      if (aAll !== bAll) return bAll - aAll;
    }
    return Number(b.is_featured)-Number(a.is_featured) || Number(b.priority||0)-Number(a.priority||0) || new Date(b.created_at||0)-new Date(a.created_at||0);
  });
}
function getBusinessPageTheme(){ return getBusinessPageThemes()[0] || null; }
let businessThemeCarouselTimer = null;
function renderBusinessThemeSpot(){
  const spot = document.getElementById('businessThemeSpot');
  if (!spot) return;
  if (businessThemeCarouselTimer) { clearInterval(businessThemeCarouselTimer); businessThemeCarouselTimer = null; }
  const themes = getBusinessPageThemes();
  if (!themes.length) { spot.innerHTML=''; spot.hidden=true; return; }
  spot.hidden=false;
  spot.innerHTML = `<div class="business-theme-carousel ${themes.length===1?'is-single':''}">
    <div class="business-theme-viewport"><div class="business-theme-track">
      ${themes.map(theme=>{
        const summary=String(theme.summary||theme.content||'').trim();
        const short=summary.length>92?summary.slice(0,92).trim()+'…':summary;
        return `<div class="business-theme-slide"><button type="button" class="business-main-theme-card" data-theme-id="${esc(theme.id)}">
          <div class="business-main-theme-thumb">${theme.image_url?`<img src="${esc(theme.image_url)}" alt="${esc(theme.title||'추천 테마')}">`:'<span>✨</span>'}</div>
          <div class="business-main-theme-copy"><div class="business-main-theme-top"><span>추천 테마</span><small>${themeReadingMinutes(theme.content||theme.summary)}분 읽기 →</small></div><h3>${esc(theme.title||'오늘의 추천 테마')}</h3>${short?`<p>${esc(short)}</p>`:''}</div>
        </button></div>`;
      }).join('')}
    </div></div>
    ${themes.length>1?`<div class="business-theme-dots">${themes.map((_,i)=>`<button type="button" class="business-theme-dot ${i===0?'active':''}" data-index="${i}" aria-label="추천 테마 ${i+1}"></button>`).join('')}</div>`:''}
  </div>`;
  if(themes.length<2) return;
  const track=spot.querySelector('.business-theme-track');
  const viewport=spot.querySelector('.business-theme-viewport');
  const dots=[...spot.querySelectorAll('.business-theme-dot')];
  let current=0, startX=0, deltaX=0;
  const moveTo=(index)=>{ current=(index+themes.length)%themes.length; track.style.transform=`translateX(-${current*100}%)`; dots.forEach((d,i)=>d.classList.toggle('active',i===current)); };
  const restart=()=>{ if(businessThemeCarouselTimer)clearInterval(businessThemeCarouselTimer); businessThemeCarouselTimer=setInterval(()=>moveTo(current+1),6000); };
  dots.forEach(d=>d.addEventListener('click',()=>{moveTo(Number(d.dataset.index||0));restart();}));
  viewport.addEventListener('touchstart',e=>{startX=e.touches[0].clientX;deltaX=0;if(businessThemeCarouselTimer)clearInterval(businessThemeCarouselTimer);},{passive:true});
  viewport.addEventListener('touchmove',e=>{deltaX=e.touches[0].clientX-startX;},{passive:true});
  viewport.addEventListener('touchend',()=>{if(Math.abs(deltaX)>45)moveTo(current+(deltaX<0?1:-1));restart();});
  spot.addEventListener('mouseenter',()=>{if(businessThemeCarouselTimer)clearInterval(businessThemeCarouselTimer);});
  spot.addEventListener('mouseleave',restart);
  restart();
}

function renderBusinessList() {
  const listEl = document.getElementById('businessList');
  if (!listEl) return;
  renderBusinessThemeSpot();

  const keyword = String(businessSearch?.value || '').trim().toLowerCase();
  let rows = Array.isArray(businesses) ? businesses.slice() : [];

  if (businessQuickFilter && businessQuickFilter !== '전체') {
    rows = rows.filter(b => getMainCategoryLabel(b.category) === businessQuickFilter);
  }

  if (keyword) {
    rows = rows.filter(b => {
      const hay = [b.name, b.category, b.map_category, b.category_main, b.subcategory, b.category_sub, b.search_keywords, b.address, b.desc].filter(Boolean).join(' ').toLowerCase();
      return keyword.split(/\s+/).every(part => hay.includes(part));
    });
  }

  rows = sortBusinessesByDistance(rows).sort((a,b)=> Number(isPremiumBusiness(b))-Number(isPremiumBusiness(a)) || Number(b.is_featured)-Number(a.is_featured));

  if (!rows.length) {
    listEl.innerHTML = `<div class="board-empty">등록된 업소가 없습니다.</div>`;
    return;
  }

  listEl.innerHTML = rows.map(nearbyBusinessItemHTML).join('');
}
function formatBusinessHours(b) {
  if (b.hours) return b.hours;

  const bh = b.business_hours;
  if (!bh || typeof bh !== 'object') return '정보 없음';

  const days = [
    ['mon', '월'],
    ['tue', '화'],
    ['wed', '수'],
    ['thu', '목'],
    ['fri', '금'],
    ['sat', '토'],
    ['sun', '일']
  ];

  const lines = days.map(([key, label]) => {
    const item = bh[key];
    if (!item) return '';

    if (item.closed) return `${label}: 휴무`;

    if (item.text) return `${label}: ${item.text}`;

    const open1 = item.open1 || item.start1 || item.open || '';
    const close1 = item.close1 || item.end1 || item.close || '';
    const open2 = item.open2 || item.start2 || '';
    const close2 = item.close2 || item.end2 || '';

    if (open1 && close1 && open2 && close2) {
      return `${label}: ${open1} - ${close1}, ${open2} - ${close2}`;
    }

    if (open1 && close1) {
      return `${label}: ${open1} - ${close1}`;
    }

    return '';
  }).filter(Boolean);

  return lines.length ? lines.join('\n') : '정보 없음';
}
function renderCategories() {
  const cats = ['식당','쇼핑','병원','금융','법률','종교','서비스','부동산'];
  if (!categoryRow) return;

  categoryRow.innerHTML = cats.map(c => `
    <button
      class="category-chip ${businessQuickFilter === c || (!businessQuickFilter && c === '전체') ? 'active' : ''}"
      data-cat="${esc(c)}"
      type="button"
    >${esc(c)}</button>
  `).join('');
}
let mainBannerCarouselTimer = null;
function normalizedBannerHomeCategories(banner){
  const raw=banner?.home_categories ?? banner?.categories ?? ['all'];
  if(Array.isArray(raw)) return raw.length ? raw.map(String) : ['all'];
  if(typeof raw==='string'){
    const parsed=raw.replace(/[{}]/g,'').split(',').map(x=>x.trim().replace(/^"|"$/g,'')).filter(Boolean);
    return parsed.length?parsed:['all'];
  }
  return ['all'];
}
function bannerMatchesCurrentHomeCategory(banner){
  const categories=normalizedBannerHomeCategories(banner);
  const selected=String(businessQuickFilter||'').trim();
  if(!selected) return categories.includes('all') || categories.includes('전체');
  return categories.includes(selected);
}

function renderMainBanners(){
  const box = document.getElementById('mainBanners');
  if(!box) return;
  if(mainBannerCarouselTimer){ clearInterval(mainBannerCarouselTimer); mainBannerCarouselTimer=null; }
  const now = Date.now();
  const rows = (Array.isArray(mainBanners) ? mainBanners : []).filter(b => {
    const placement = String(b.placement || (linkedBusinessIds(b).length ? 'both' : 'home')).toLowerCase();
    if (!['home','both'].includes(placement)) return false;
    if (!bannerMatchesCurrentHomeCategory(b)) return false;
    if (b.start_at && new Date(b.start_at).getTime() > now) return false;
    if (b.end_at && new Date(b.end_at).getTime() < now) return false;
    return b.is_active !== false && !!(b.image_url || b.video_url);
  }).sort((a,b)=>Number(a.sort_order||0)-Number(b.sort_order||0));
  if(!rows.length){
    // Completely remove the banner slot from layout. `hidden` alone can be
    // overridden by stale/cached CSS, which previously left a large blank gap.
    box.innerHTML='';
    box.hidden = true;
    box.classList.add('is-empty');
    box.style.setProperty('display','none','important');
    box.style.setProperty('margin','0','important');
    box.style.setProperty('padding','0','important');
    box.style.setProperty('height','0','important');
    box.style.setProperty('min-height','0','important');
    return;
  }
  box.hidden = false;
  box.classList.remove('is-empty');
  box.style.removeProperty('display');
  box.style.removeProperty('margin');
  box.style.removeProperty('padding');
  box.style.removeProperty('height');
  box.style.removeProperty('min-height');
  box.innerHTML=`<div class="main-banner-carousel ${rows.length===1?'is-single':''}">
    <div class="main-banner-viewport"><div class="main-banner-track">
      ${rows.map(b=>`<div class="main-banner-slide"><div class="main-banner-card" role="button" tabindex="0" data-banner-id="${esc(b.id)}">${bannerMediaHTML(b,'main-banner-media')}</div></div>`).join('')}
    </div></div>
    ${rows.length>1?`<div class="main-banner-dots">${rows.map((_,i)=>`<button type="button" class="main-banner-dot ${i===0?'active':''}" data-index="${i}" aria-label="배너 ${i+1}"></button>`).join('')}</div>`:''}
  </div>`;
  const openBanner=(banner)=>{
    if(!banner)return;
    const url=banner.link_url||banner.external_url;
    if(url){ window.open(normalizeUrl(url),'_blank','noopener'); return; }
    if(openMultiBusinessBanner(banner)) return;
  };
  box.querySelectorAll('[data-banner-media-image]').forEach(img=>{
    img.addEventListener('error',()=>{
      const card=img.closest('.main-banner-card');
      const banner=rows.find(x=>String(x.id)===String(card?.dataset.bannerId));
      if(card&&banner){
        card.innerHTML=bannerFallbackHTML(banner,'main-banner-media');
        card.classList.add('has-media-fallback');
      }
    },{once:true});
  });
  box.querySelectorAll('.main-banner-card').forEach(btn=>{
    btn.addEventListener('click',(e)=>{if(e.target.closest('video,iframe'))return;openBanner(rows.find(x=>String(x.id)===String(btn.dataset.bannerId)));});
    btn.addEventListener('keydown',(e)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openBanner(rows.find(x=>String(x.id)===String(btn.dataset.bannerId)));}});
  });
  if(rows.length<2)return;
  const track=box.querySelector('.main-banner-track');
  const viewport=box.querySelector('.main-banner-viewport');
  const dots=[...box.querySelectorAll('.main-banner-dot')];
  let current=0,startX=0,deltaX=0;
  const moveTo=(index)=>{current=(index+rows.length)%rows.length;track.style.transform=`translateX(-${current*100}%)`;dots.forEach((d,i)=>d.classList.toggle('active',i===current));};
  const restart=()=>{if(mainBannerCarouselTimer)clearInterval(mainBannerCarouselTimer);mainBannerCarouselTimer=setInterval(()=>moveTo(current+1),5000);};
  dots.forEach(d=>d.addEventListener('click',()=>{moveTo(Number(d.dataset.index||0));restart();}));
  viewport.addEventListener('touchstart',e=>{startX=e.touches[0].clientX;deltaX=0;if(mainBannerCarouselTimer)clearInterval(mainBannerCarouselTimer);},{passive:true});
  viewport.addEventListener('touchmove',e=>{deltaX=e.touches[0].clientX-startX;},{passive:true});
  viewport.addEventListener('touchend',()=>{if(Math.abs(deltaX)>45)moveTo(current+(deltaX<0?1:-1));restart();});
  box.addEventListener('mouseenter',()=>{if(mainBannerCarouselTimer)clearInterval(mainBannerCarouselTimer);});
  box.addEventListener('mouseleave',restart);
  restart();
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
const category = b.subcategory || b.category_sub || getMainCategoryLabel(b.category) || b.category || '업소';
const address = b.address || '';
const phone = b.phone || b.phone_number || '';
const website = b.website || b.url || '';

const activeCoupon = coupons.find(c =>
  rowLinksBusiness(c,b.id)
);

// 추천 테마: 업소 카테고리에 맞는 정보형 기사를 상세페이지 최상단에 표시합니다.
function normalizeThemeTarget(value){
  const s=String(value||'').trim().toLowerCase().replace(/\s+/g,'_');
  if(['restaurant','food','식당','음식','한식','카페'].some(v=>s.includes(v))) return 'restaurant';
  if(['business','업소','업체','비즈니스'].some(v=>s.includes(v))) return 'business';
  if(['shopping','shop','쇼핑','마트'].some(v=>s.includes(v))) return 'shopping';
  if(['hospital','medical','health','병원','의료','건강','미용','뷰티'].some(v=>s.includes(v))) return 'hospital';
  if(['finance','tax','account','금융','세무','회계','보험'].some(v=>s.includes(v))) return 'finance';
  if(['law','legal','법률','변호'].some(v=>s.includes(v))) return 'law';
  if(['church','종교','종교'].some(v=>s.includes(v))) return 'church';
  if(['real_estate','realestate','부동산','주택'].some(v=>s.includes(v))) return 'real_estate';
  if(['service','auto','car','서비스','자동차','정비'].some(v=>s.includes(v))) return 'service';
  return s;
}
// Backward-compatible alias for an earlier theme helper typo used by cached builds.
function normalThemeTarget(value){
  return normalizeThemeTarget(value);
}
function parseThemeTargets(value){
  if(Array.isArray(value)) return value;
  if(typeof value==='string'){
    const text=value.trim();
    if(!text) return [];
    // PostgreSQL text[] can occasionally arrive as "{restaurant,shopping}".
    if(text.startsWith('{')&&text.endsWith('}')) return text.slice(1,-1).split(',').map(v=>v.replace(/^"|"$/g,'').trim()).filter(Boolean);
    try{const parsed=JSON.parse(text);if(Array.isArray(parsed))return parsed;}catch(e){}
    return text.split(',').map(v=>v.trim()).filter(Boolean);
  }
  return [];
}
function getBusinessTheme(business){
  // business.category may be a UUID/internal value. Build targets from every available
  // category field plus the same normalized label used by the business list UI.
  const businessTargets=new Set([
    normalizeThemeTarget(business?.category),
    normalizeThemeTarget(business?.category_ko),
    normalizeThemeTarget(business?.subcategory),
    normalizeThemeTarget(business?.subcategory_ko),
    normalizeThemeTarget(getMainCategoryLabel(business?.category_ko||business?.category||business?.subcategory||''))
  ].filter(Boolean));
  const now=Date.now();
  return (dalpicks||[]).filter(row=>{
    if(!isThemeDalpick(row)||row.is_active===false) return false;
    const status=String(row.status||'').toLowerCase(); if(status&& !['published','active'].includes(status)) return false;
    const start=row.start_at||row.start_date, end=row.end_at||row.end_date;
    if(start&&new Date(start).getTime()>now) return false; if(end&&new Date(end).getTime()<now) return false;
    const targets=parseThemeTargets(row.target_categories).map(normalizeThemeTarget);
    return targets.includes('all')||targets.some(t=>businessTargets.has(t));
  }).sort((a,b)=>Number(b.is_featured)-Number(a.is_featured)||Number(b.priority||0)-Number(a.priority||0)||new Date(b.created_at||0)-new Date(a.created_at||0))[0]||null;
}
function themeReadingMinutes(content){return Math.max(1,Math.ceil(String(content||'').replace(/\s+/g,' ').trim().length/500));}
function renderBusinessThemeCard(theme){
  if(!theme)return '';
  const summary=String(theme.summary||theme.content||'').trim();
  const short=summary.length>105?summary.slice(0,105).trim()+'…':summary;
  return `<button type="button" class="business-theme-card" data-theme-id="${esc(theme.id)}" aria-label="추천 테마 기사 열기">
    <div class="business-theme-thumb">${theme.image_url?`<img src="${esc(theme.image_url)}" alt="${esc(theme.title||'추천 테마')}">`:'<span>✨</span>'}</div>
    <div class="business-theme-copy"><div class="business-theme-top"><span>추천 테마</span><small>${themeReadingMinutes(theme.content||theme.summary)}분 읽기 →</small></div><h3>${esc(theme.title||'오늘의 추천 테마')}</h3>${short?`<p>${esc(short)}</p>`:''}</div>
  </button>`;
}
function openThemeArticle(theme){
  if(!theme)return;
  const post={id:`theme-${theme.id}`,type:'life',title:theme.title||'추천 테마',content:theme.content||theme.summary||'',summary:theme.summary||'',image_url:theme.image_url||'',created_at:theme.created_at||new Date().toISOString(),author_name:'DalTownMap'};
  const existing=boardPosts.findIndex(p=>String(p.id)===String(post.id)); if(existing>=0) boardPosts[existing]=post; else boardPosts.push(post);
  renderBoardPage('life',post.id); lastBasePage=currentPage; showPage('board-detail');
}

// 업소 상세 상단 AI Pick: 게시판의 ai_pick 글 또는 연결된 DalPick AI 추천을 사용합니다.
function getBusinessAiPick(businessId) {
  const now = Date.now();
  const isVisible = (row) => {
    if (row?.is_active === false) return false;
    const status = String(row?.status || '').toLowerCase();
    if (status && !['published', 'active'].includes(status)) return false;
    const start = row?.start_at || row?.start_date;
    const end = row?.end_at || row?.end_date;
    if (start && new Date(start).getTime() > now) return false;
    if (end && new Date(end).getTime() < now) return false;
    return true;
  };

  const boardPick = (boardPosts || [])
    .filter(row =>
      String(row.business_id || row.linked_business_id || '') === String(businessId) &&
      ['ai_pick', 'aipick', 'business_ai_pick'].includes(String(row.type || row.subtype || '').toLowerCase()) &&
      isVisible(row)
    )
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0];

  if (boardPick) {
    return {
      eyebrow: 'AI PICK',
      title: boardPick.title || '오늘의 추천',
      summary: boardPick.summary || boardPick.excerpt || '',
      content: boardPick.content || '',
      image: boardPick.image_url || '',
      source: 'board'
    };
  }

  const dalpickPick = (dalpicks || [])
    .filter(row =>
      rowLinksBusiness(row,businessId) &&
      ['ai_pick', 'recommended', 'business_story'].includes(String(row.category || '').toLowerCase()) &&
      isVisible(row)
    )
    .sort((a, b) => Number(b.is_featured) - Number(a.is_featured) || Number(b.priority || 0) - Number(a.priority || 0))[0];

  if (!dalpickPick) return null;
  return {
    eyebrow: 'AI PICK',
    title: dalpickPick.title || '오늘의 추천',
    summary: dalpickPick.summary || '',
    content: dalpickPick.content || '',
    image: dalpickPick.image_url || '',
    source: 'dalpick',
    articleId: String(dalpickPick.category||'').toLowerCase()==='business_story' ? `dalpick-story-${dalpickPick.id}` : ''
  };
}

function renderBusinessAiPick(pick) {
  if (!pick) return '';
  const body = String(pick.summary || pick.content || '').trim();
  const shortBody = body.length > 180 ? `${body.slice(0, 180).trim()}…` : body;
  return `
    <section class="business-ai-pick" aria-label="AI 추천">
      ${pick.image ? `<img class="business-ai-pick-image" src="${esc(pick.image)}" alt="${esc(pick.title)}">` : ''}
      <div class="business-ai-pick-copy">
        <span class="business-ai-pick-label"><span class="business-ai-pick-dot"></span>${esc(pick.eyebrow)}</span>
        <h3>${esc(pick.title)}</h3>
        ${shortBody ? `<p>${esc(shortBody)}</p>` : ''}
        ${pick.articleId ? `<button type="button" class="business-ai-pick-link" data-story-post="${esc(pick.articleId)}">업소탐방 기사 보기 →</button>` : ''}
      </div>
    </section>`;
}


function getBusinessPromotions(businessId){
  const now = Date.now();
  return (mainBanners || []).filter(row => {
    if (!rowLinksBusiness(row,businessId)) return false;
    if (row.is_active === false) return false;
    const placement = String(row.placement || 'both').toLowerCase();
    if (!['detail','both'].includes(placement)) return false;
    if (row.start_at && new Date(row.start_at).getTime() > now) return false;
    if (row.end_at && new Date(row.end_at).getTime() < now) return false;
    return true;
  }).sort((a,b)=>Number(a.sort_order||0)-Number(b.sort_order||0) || new Date(b.created_at||0)-new Date(a.created_at||0));
}

function renderBusinessPromotion(promo){
  if (!promo) return '';
  const type = String(promo.display_type || 'banner').toLowerCase();
  if (type === 'card') {
    const desc = String(promo.description || '').trim();
    return `<button type="button" class="business-detail-ad-card" data-business-promo="${esc(promo.id)}">
      <div class="business-detail-ad-thumb">${bannerMediaHTML(promo,'business-detail-ad-media')}</div>
      <div class="business-detail-ad-copy"><div class="business-detail-ad-label">SPONSORED</div><h3>${esc(promo.title || '업소 소식')}</h3>${desc?`<p>${esc(desc.length>100?desc.slice(0,100)+'…':desc)}</p>`:''}${String(promo.button_label || '').trim() ? `<span>${esc(promo.button_label)} →</span>` : ''}</div>
    </button>`;
  }
  const desc = String(promo.description || '').trim();
  return `<button type="button" class="business-detail-banner" data-business-promo="${esc(promo.id)}" aria-label="${esc(promo.title || '업소 광고')}">
    ${bannerMediaHTML(promo,'business-detail-banner-media')}
    <span class="business-detail-banner-shade"></span>
    <span class="business-detail-banner-copy">
      <strong>${esc(promo.title || '업소 소식')}</strong>
      ${desc ? `<small>${esc(desc.length > 90 ? desc.slice(0,90)+'…' : desc)}</small>` : ''}
      ${String(promo.button_label || '').trim() ? `<em>${esc(promo.button_label)} →</em>` : ''}
    </span>
    <span class="business-detail-banner-badge">AD</span>
  </button>`;
}

function renderBusinessTopPromo(promotions, coupon, pick){
  if (promotions && promotions.length) return promotions.slice(0,3).map(renderBusinessPromotion).join('');
  if (coupon) {
    const image = coupon.image_url || coupon.image || '';
    const desc = String(coupon.description || coupon.summary || '').trim();
    return `<button type="button" class="business-top-promo coupon-open" data-coupon="${esc(coupon.id)}">
      <div class="business-top-promo-thumb">${image?`<img src="${esc(image)}" alt="${esc(coupon.title||'쿠폰')}">`:'<span>🎟️</span>'}</div>
      <div class="business-top-promo-copy"><div class="business-top-promo-label">업소 쿠폰</div><h3>${esc(coupon.title||'사용 가능한 쿠폰')}</h3>${desc?`<p>${esc(desc.length>90?desc.slice(0,90)+'…':desc)}</p>`:''}</div>
    </button>`;
  }
  if (pick) {
    const body = String(pick.summary || pick.content || '').trim();
    return `<section class="business-top-promo business-top-ad">
      <div class="business-top-promo-thumb">${pick.image?`<img src="${esc(pick.image)}" alt="${esc(pick.title||'업소 소식')}">`:'<span>📣</span>'}</div>
      <div class="business-top-promo-copy"><div class="business-top-promo-label">업소 소식</div><h3>${esc(pick.title||'오늘의 업소 소식')}</h3>${body?`<p>${esc(body.length>90?body.slice(0,90)+'…':body)}</p>`:''}</div>
    </section>`;
  }
  return '';
}

const businessAiPick = getBusinessAiPick(b.id);
const businessPromotions = getBusinessPromotions(b.id);
function getDescriptionImages(b){
  if (Array.isArray(b.description_images)) return b.description_images;

  try {
    return b.description_images ? JSON.parse(b.description_images) : [];
  } catch(e) {
    return [];
  }
}

detailCard.innerHTML = `
  <article class="biz-detail-v2">

    ${renderBusinessTopPromo(businessPromotions, activeCoupon, businessAiPick)}
    <div class="biz-detail-hero">
      <img src="${esc(img)}" alt="${esc(bizName)}">

      <div class="biz-detail-badges">
        ${b.is_new ? '<span class="badge-new">NEW</span>' : ''}
        ${b.is_featured ? '<span class="badge-featured">추천</span>' : ''}
        ${b.is_popular ? '<span class="badge-popular">인기</span>' : ''}
		${b.video_url || b.youtube_url ? '<span class="badge-video">▶ VIDEO</span>' : ''}
      </div>
    </div>

	
${((b.video_url || b.youtube_url) || (b.gallery_urls || b.galleryImages || []).length) ? `
<div class="biz-gallery-strip ${(b.video_url || b.youtube_url) && !(b.gallery_urls || b.galleryImages || []).length ? 'video-only' : ''}">

${b.video_url || b.youtube_url ? `
<button type="button"
        class="biz-gallery-thumb video-thumb"
        onclick="openBusinessVideo('${esc(b.video_url || b.youtube_url)}')">
    <div class="video-overlay">
    </div>
</button>
` : ''}

${(b.gallery_urls || b.galleryImages || []).map(url => `
<button type="button" class="biz-gallery-thumb">
    <img src="${esc(url)}" alt="${esc(bizName)} 갤러리">
</button>
`).join('')}

</div>
` : ''}

    <section class="biz-detail-card">
      <h2>${esc(bizName)}</h2>
      <p class="biz-detail-meta">${esc(category)} · DalTownMap</p>

<div class="biz-detail-rating">
${b.rating ? `
   <a class="biz-rating-link"
   href="${esc(b.google_review_url || b.google_maps_url || '#')}"
   target="_blank">

    ${renderLucideStars(b.rating)}

    <span class="rating-score">
        ${Number(b.rating).toFixed(1)}
    </span>

    <span class="rating-count">
        (${b.review_count || 0})
    </span>

    </a>
` : `
  <div class="biz-rating-empty">
    <span>⭐</span>
    <span>Google 리뷰 준비중</span>
  </div>
`}
</div>

      <div class="biz-action-row">
        <a href="tel:${esc(phone)}">전화</a>
        <a href="${esc(getDirectionsUrl(b))}" target="_blank">길찾기</a>
        <a href="${esc(website || '#')}" target="_blank">웹사이트</a>
        ${b.reservation_enabled && (b.reservation_url || b.phone) ? `
        <button
           type="button"
           onclick="openReservation('${b.id}')">
           예약
        </button>
         ` : ''}
        <button type="button" onclick="shareBusiness('${b.id}')">
        공유
       </button>
      </div>
    </section>


    ${activeCoupon ? `
    <section class="biz-promo-card">
    <div class="promo-icon">🎁</div>
    <div>
    <strong>진행중인 혜택</strong>
    <p>${esc(activeCoupon.title || activeCoupon.description || '쿠폰 혜택이 있습니다.')}</p>
    <button type="button" onclick="renderCouponDetail('${esc(activeCoupon.id)}'); showPage('coupon-detail');">
      쿠폰 보기
    </button>
    </div>
    </section>
` : ''}

<section class="biz-detail-card">
  <h3>소개</h3>

${getDescriptionImages(b).length ? `
  <div class="biz-description-gallery">
    ${getDescriptionImages(b).map(url => `
      <img src="${esc(url)}" alt="업소 소개 이미지">
    `).join('')}
  </div>
` : ''}

  <p class="biz-description">
    ${esc(b.description || '업소 소개가 준비 중입니다.')}
  </p>
</section>

<section class="biz-detail-card biz-info-card">
  <h3>정보</h3>

  <div class="biz-info-rows">
    <div class="biz-info-row hours-main">
      <div class="biz-info-title">영업시간</div>
      <div class="biz-info-value">
        ${renderBusinessHours(b)}
      </div>
    </div>

    <div class="biz-info-row">
      <div class="biz-info-title">주차</div>
      <div class="biz-info-value">${esc(b.parking || '정보 없음')}</div>
    </div>

    ${b.reservation && String(b.reservation).trim() ? `
    <div class="biz-info-row">
    <div class="biz-info-title">예약</div>
    <div class="biz-info-value">${esc(b.reservation)}</div>
    </div>
     ` : ''}

    <div class="biz-info-row">
      <div class="biz-info-title">언어</div>
      <div class="biz-info-value">${esc(b.languages || '한국어, 영어')}</div>
    </div>

    <div class="biz-info-row">
      <div class="biz-info-title">기타</div>
      <div class="biz-info-value">${esc(b.insurance || '정보 없음')}</div>
    </div>
  </div>
</section>

    <section class="biz-map-card">
      <h3>위치 안내</h3>

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

detailCard.querySelectorAll('[data-business-promo]').forEach(btn => {
  btn.addEventListener('click', (event) => {
    if (event.target.closest('video,iframe')) return;
    const promo = businessPromotions.find(row => String(row.id) === String(btn.dataset.businessPromo));
    if (!promo) return;
    const raw = String(promo.link_url || '').trim();
    const match = raw.match(/^(business|post|dalpick|coupon):(.+)$/i);
    if (match) {
      const type = match[1].toLowerCase();
      const target = match[2];
      if (type === 'business') { selectedBizId = target; renderDetail(target); showPage('business-detail'); return; }
      if (type === 'post') { openBoardPost(target); return; }
      if (type === 'coupon') { renderCouponDetail(target); lastBasePage = currentPage; showPage('coupon-detail'); return; }
      if (type === 'dalpick') {
        const item = (dalpicks || []).find(x => String(x.id) === String(target));
        if (!item) return alert('연결된 DalPick을 찾을 수 없습니다.');
        if (String(item.category || '').toLowerCase() === 'business_story') openBoardPost(`dalpick-story-${item.id}`);
        else if (isThemeDalpick(item)) openThemeArticle(item);
        else if (item.business_id) { selectedBizId=item.business_id; renderDetail(item.business_id); showPage('business-detail'); }
        else if (item.content) alert(`${item.title || 'DalPick'}\n\n${item.content}`);
        return;
      }
    }
    if (/^tel:/i.test(raw)) { window.location.href = raw; return; }
    if (raw) { window.open(normalizeUrl(raw), '_blank', 'noopener'); return; }
    if (openMultiBusinessBanner(promo)) return;

  });
});

detailCard.querySelector('[data-theme-id]')?.addEventListener('click',()=>{
  const theme=(dalpicks||[]).find(d=>String(d.id)===String(detailCard.querySelector('[data-theme-id]')?.dataset.themeId));
  if(theme) openThemeArticle(theme);
});

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

const hoursHtml = renderBusinessHours(b);

function renderBusinessHours(b) {
  const bh = b.business_hours;

  if (bh && typeof bh === 'object') {
    const days = [
      ['mon', '월요일'],
      ['tue', '화요일'],
      ['wed', '수요일'],
      ['thu', '목요일'],
      ['fri', '금요일'],
      ['sat', '토요일'],
      ['sun', '일요일']
    ];

    return days.map(([key, label]) => {
      const h = bh[key] || {};
let timeHtml = '<span class="hours-time-line">정보 없음</span>';

if (h.closed === true || h.closed === 'true') {
  timeHtml = '<span class="hours-time-line">휴무</span>';

} else if (h.open1 && h.close1 && h.open2 && h.close2) {
  timeHtml = `
    <span class="hours-time-line">${esc(h.open1)} - ${esc(h.close1)}</span>
    <span class="hours-time-line">${esc(h.open2)} - ${esc(h.close2)}</span>
  `;

} else if (h.open1 && h.close1) {
  timeHtml = `
    <span class="hours-time-line">${esc(h.open1)} - ${esc(h.close1)}</span>
  `;

} else if (h.text) {
  timeHtml = `
    <span class="hours-time-line">${esc(h.text)}</span>
  `;
}

return `
  <div class="hours-row">
    <span class="hours-day">${label}</span>
    <strong class="hours-times">${timeHtml}</strong>
  </div>
`;
    }).join('');
  }

  if (b.hours) {
    return `<div class="hours-row"><span>영업시간</span><strong>${esc(b.hours)}</strong></div>`;
  }

  return `<div class="hours-row"><span>영업시간</span><strong>정보 없음</strong></div>`;
}
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

function openReservation(id) {
    const b = businesses.find(x => String(x.id) === String(id));
    if (!b) return;

    if (b.reservation_url && b.reservation_url.trim()) {
        window.open(b.reservation_url, '_blank');
        return;
    }

    if (b.phone) {
        const phone = String(b.phone).replace(/[^\d+]/g, '');
        location.href = 'tel:' + phone;
        return;
    }

    alert('예약 정보가 없습니다.');
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
async function confirmCouponUse(id){

    const coupon = getCoupon(id);

    if(!coupon){
        alert('쿠폰 정보를 찾을 수 없습니다.');
        return;
    }

    await useCouponNow(coupon);

}
window.confirmCouponUse = confirmCouponUse;

async function useCouponNow(coupon){
  if(!coupon) return;

  const client = getAuthClient();
  if(!client){
    alert('Supabase 연결 오류');
    return;
  }

  const businessId =
    coupon.business_id ||
    coupon.businessId ||
    coupon.biz_id ||
    coupon.bizId ||
    null;

  const business = getBiz(businessId);

  console.log('coupon', coupon);
  console.log('businessId', businessId);
  console.log('business', business);

  const payload = {
    coupon_id: coupon.id,
    business_id: businessId,
    coupon_title: coupon.title || '',
    business_name:
      business?.name_ko ||
      business?.name ||
      coupon.business_name ||
      '',
    notify_emails:
      coupon.notify_emails ||
      coupon.coupon_notify_emails ||
      business?.coupon_notify_emails ||
      business?.email ||
      '',
    notify_phones:
      coupon.notify_phones ||
      coupon.coupon_notify_phones ||
      business?.coupon_notify_phones ||
      business?.phone ||
      '',
    used_by: 'customer'
  };

  const { error } = await client
    .from('coupon_redemptions')
    .insert(payload);

  if(error){
    alert('쿠폰 사용 저장 실패 : ' + error.message);
    return;
  }

  await client
    .from('coupons')
    .update({
      used_count: Number(coupon.used_count || 0) + 1
    })
    .eq('id', coupon.id);

try {
    const notifyRes = await fetch('/.netlify/functions/coupon-used-notify', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify(payload)
    });

    const notifyText = await notifyRes.text();
    if(!notifyRes.ok){
        console.warn('coupon email notify failed', notifyRes.status, notifyText);
    } else {
        console.log('coupon email notify result', notifyText);
    }
} catch(e){
    console.warn('coupon email notify error', e);
}

alert('쿠폰 사용이 확인되었습니다.');

const useLink = String(coupon.use_link_url || '').trim();

if (useLink) {
  window.open(useLink, '_blank');
} else {
  showPage('home');
}
}
	
function renderLucideStars(rating){
  const score = Number(rating || 0);
  let html = '<span class="google-stars">';

  for(let i = 1; i <= 5; i++){
    const filled = score >= i;
    html += `
      <svg class="google-star ${filled ? 'filled' : 'empty'}"
           viewBox="0 0 24 24"
           width="16"
           height="16"
           aria-hidden="true">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
      </svg>
    `;
  }

  html += '</span>';
  return html;
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
  
  couponUseCard.innerHTML = `
<div class="coupon-use-wrap">

    <div class="coupon-use-title">
        매장에서 확인 버튼을 눌러주세요
    </div>

    <div class="coupon-use-business">
        ${esc(b.name)}
        ·
        ${esc(c.title)}
    </div>

<button
  class="coupon-confirm-btn"
  onclick="confirmCouponUse('${c.id}')">
  <span class="coupon-confirm-icon">✓</span>
  쿠폰 사용 확인
</button>

</div>
`;

}
window.confirmCouponUse = confirmCouponUse;
function getYouTubeId(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';

  // URL 파싱이 가능한 형식은 먼저 안전하게 처리합니다.
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    const host = u.hostname.replace(/^www\.|^m\./i, '').toLowerCase();

    if (host === 'youtu.be') return (u.pathname.split('/').filter(Boolean)[0] || '').trim();

    if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
      const watchId = u.searchParams.get('v');
      if (watchId) return watchId.trim();

      const parts = u.pathname.split('/').filter(Boolean);
      if (['shorts', 'embed', 'live'].includes(parts[0])) return (parts[1] || '').trim();
    }
  } catch (_) {}

  // 복사된 문자열이나 매개변수가 섞인 주소에 대한 최종 보완 처리입니다.
  const m = raw.match(/(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i);
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
          <p>${esc(s.desc || s.slideDesc || '')}</p>
         
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
const slideData = heroSlides.find(x => String(x.bizId) === String(bizId));
if (slideData) {
  const link = String(slideData.link_url || '').trim();
  if (link) {
    if (link.startsWith('#')) {
      closeSlideDetailModal?.();
      showPage(link.replace(/^#/, ''));
    } else if (/^https?:/i.test(link)) {
      window.open(link, '_blank','noopener');
    } else {
      window.location.href = link;
    }
    return;
  }
}
if(bizId){
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

const shareBtn = document.getElementById('slideDetailShareBtn');

if (shareBtn) {
  shareBtn.onclick = async () => {
    const title = slide.title || 'DalTownMap';
    const text = slide.slideDesc || slide.desc || '';
    const url = slide.link_url || window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (error) {
        if (error?.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(
        [title, text, url].filter(Boolean).join('\n')
      );
      alert('공유 내용이 복사되었습니다.');
    } catch {
      prompt(
        '아래 내용을 복사하세요.',
        [title, text, url].filter(Boolean).join('\n')
      );
    }
  };
}

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
function getYouTubeVideoId(url) {
    if (!url) return '';

    const value = String(url).trim();

    try {
        const parsed = new URL(value);
        const host = parsed.hostname.replace(/^www\./, '');

        // https://youtu.be/VIDEO_ID
        if (host === 'youtu.be') {
            return parsed.pathname.split('/').filter(Boolean)[0] || '';
        }

        // https://youtube.com/watch?v=VIDEO_ID
        if (
            host === 'youtube.com' ||
            host === 'm.youtube.com' ||
            host === 'music.youtube.com'
        ) {
            if (parsed.pathname === '/watch') {
                return parsed.searchParams.get('v') || '';
            }

            // https://youtube.com/shorts/VIDEO_ID
            if (parsed.pathname.startsWith('/shorts/')) {
                return parsed.pathname.split('/')[2] || '';
            }

            // https://youtube.com/embed/VIDEO_ID
            if (parsed.pathname.startsWith('/embed/')) {
                return parsed.pathname.split('/')[2] || '';
            }
        }
    } catch (e) {
        console.warn('Invalid YouTube URL:', value);
    }

    return '';
}


function renderYouTubeEmbed(url) {
    const videoId = getYouTubeVideoId(url);

    if (!videoId) return '';

    return `
        <div class="board-video-wrap">
            <iframe
                class="board-video-frame"
                src="https://www.youtube.com/embed/${encodeURIComponent(videoId)}"
                title="YouTube video player"
                loading="lazy"
                frameborder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowfullscreen>
            </iframe>
        </div>
    `;
}
function renderBoardPage(type = 'notice', postId = null) {
  if (!boardTitle) return;
  const normalizedType = normalizeBoardType(type);
  const rows = boardPostsByType(normalizedType);
  const page = $('#page-board-detail .section-card');
  if (!page) return;

  if (postId) {
    const post = boardPosts.find(p => String(p.id) === String(postId));
    if (!post) {
      page.innerHTML = `<h3 id="boardTitle">${esc(boardLabel(normalizedType))}</h3><div class="board-empty">게시글을 찾을 수 없습니다.</div>`;
      return;
    }
    selectedBoardPost = post;
    boardTitle.textContent = boardLabel(normalizedType);
    const images = boardImages(post);
    const slides = images.map((url,index)=>`<div class="board-gallery-slide"><img src="${esc(url)}" alt="${esc(post.title || '게시글 이미지')} ${index+1}" loading="${index===0?'eager':'lazy'}"></div>`).join('');
    const gallery = images.length ? `<div class="board-gallery" data-board-gallery><div class="board-gallery-track">${slides}</div>${images.length>1?'<button class="board-gallery-arrow prev" type="button">‹</button><button class="board-gallery-arrow next" type="button">›</button><div class="board-gallery-dots">'+images.map((_,i)=>`<button type="button" data-gallery-dot="${i}" class="${i===0?'active':''}"></button>`).join('')+'</div>':''}</div>` : '';
    const videoHtml = post.video_url ? renderYouTubeEmbed(post.video_url) : '';
    const linkedBiz = post.business_id ? getBiz(post.business_id) : null;
    const phoneDigits = String(post.phone || '').replace(/[^\d+]/g,'');
    const mapHref = post.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(post.address)}` : '';
    const externalUrl = normalizeUrl(post.external_url || post.image_link_url || '');
    const actions = [
      phoneDigits ? `<a class="action-btn call" href="tel:${esc(phoneDigits)}">전화하기</a>` : '',
      mapHref ? `<a class="action-btn map" href="${esc(mapHref)}" target="_blank" rel="noopener">길찾기</a>` : '',
      externalUrl ? `<a class="action-btn web" href="${esc(externalUrl)}" target="_blank" rel="noopener noreferrer">${esc(post.link_label || '링크 열기')}</a>` : '',
      linkedBiz ? `<button class="action-btn business biz-open" type="button" data-biz="${esc(linkedBiz.id)}">업소 보기</button>` : '',
	      `<button class="action-btn share"
             type="button"
             onclick="shareBoardPost('${esc(post.id)}')">
          공유
          </button>`
    ].filter(Boolean).join('');
    page.innerHTML = `
      <h3 id="boardTitle">${esc(boardLabel(normalizedType))}</h3>
      <article class="board-detail-v3">
        <div class="board-detail-v3-head">
          <div class="board-detail-v3-badges"><span>${esc(boardLabel(normalizedType))}</span>${normalizedType==='business_story'?'<span class="sponsored">Sponsored</span>':''}${post.video_url?'<span class="video">▶ 영상</span>':''}</div>
          <h1>${esc(post.title || boardLabel(normalizedType))}</h1>
          <div class="board-detail-v3-meta">${[post.author_name,post.created_at?String(post.created_at).slice(0,10):'',post.address].filter(Boolean).map(esc).join(' · ')}</div>
        </div>
        ${gallery}
        ${videoHtml}
        <div class="board-detail-v3-content">${autoLinkText(post.content || '')}</div>
        ${actions?`<div class="board-detail-actions">${actions}</div>`:''}
      </article>`;
    initBoardGallery(page);
    page.querySelectorAll('.biz-open').forEach(button=>button.addEventListener('click',()=>{const bizId=button.dataset.biz;if(!bizId)return;renderDetail(bizId);lastBasePage=currentPage;showPage('business-detail');}));
    return;
  }

  selectedBoardPost = null;
  selectedBoardType = normalizedType;
  boardTitle.textContent = boardLabel(normalizedType);
  page.innerHTML = `<h3 id="boardTitle">${esc(boardLabel(normalizedType))}</h3><div class="board-page-grid">${rows.length?rows.map(boardListItemHTML).join(''):`<div class="board-empty">등록된 ${esc(boardLabel(normalizedType))} 글이 없습니다.</div>`}</div>`;
  page.querySelectorAll('[data-post-id]').forEach(button=>button.addEventListener('click',()=>openBoardPost(button.dataset.postId)));
}
function initBoardGallery(root=document){
  root.querySelectorAll('[data-board-gallery]').forEach(gallery=>{
    const track=gallery.querySelector('.board-gallery-track');
    const slides=[...gallery.querySelectorAll('.board-gallery-slide')];
    if(!track || slides.length<2) return;
    let index=0,startX=0;
    const dots=[...gallery.querySelectorAll('[data-gallery-dot]')];
    const go=n=>{index=(n+slides.length)%slides.length;track.style.transform=`translateX(-${index*100}%)`;dots.forEach((d,i)=>d.classList.toggle('active',i===index));};
    gallery.querySelector('.prev')?.addEventListener('click',()=>go(index-1));
    gallery.querySelector('.next')?.addEventListener('click',()=>go(index+1));
    dots.forEach(d=>d.addEventListener('click',()=>go(Number(d.dataset.galleryDot||0))));
    gallery.addEventListener('touchstart',e=>{startX=e.touches[0]?.clientX||0},{passive:true});
    gallery.addEventListener('touchend',e=>{const dx=(e.changedTouches[0]?.clientX||0)-startX;if(Math.abs(dx)>45)go(dx<0?index+1:index-1)},{passive:true});
  });
}
function showBoard(board){ renderBoardPage(board); lastBasePage = currentPage;
  showPage('board-detail'); }
function openBoardPost(postId){
  const post = boardPosts.find(p=>String(p.id)===String(postId));
  const type = normalizeBoardType(post?.type || selectedBoardType || 'notice');
  boardDetailReturn = (currentPage==='board-detail' && !selectedBoardPost)
    ? { mode:'list', page:'board-detail', type }
    : { mode:'page', page:currentPage || 'home', type };
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

function updateBottomNavMode(page){
  const normalNav = document.querySelector('.bottom-nav:not(.board-bottom-nav)');
  const boardNav = document.querySelector('.board-bottom-nav');
  const isPostDetail = page === 'board-detail' && !!selectedBoardPost;
  normalNav?.classList.toggle('hidden', isPostDetail);
  boardNav?.classList.toggle('hidden', !isPostDetail);
}

function boardBottomBack(){
  const type = normalizeBoardType(selectedBoardPost?.type || selectedBoardType || boardDetailReturn?.type || 'notice');
  const target = boardDetailReturn || {};
  if(target.mode === 'list'){
    renderBoardPage(target.type || type);
    showPage('board-detail');
    return;
  }
  const returnPage = target.page && target.page !== 'board-detail' ? target.page : 'home';
  selectedBoardPost = null;
  showPage(returnPage);
}

function boardBottomList(){
  const type = normalizeBoardType(selectedBoardPost?.type || selectedBoardType || boardDetailReturn?.type || 'notice');
  renderBoardPage(type);
  showPage('board-detail');
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
  updateBottomNavMode(page);
  if (nextIdx >= 0) lastBasePage = page;
  setRoute(page);
  if(page==='guide') renderGuidePosts();
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


// 추천 테마 기사 열기: 이 함수는 반드시 전역 범위에 있어야 업소 메인에서도 사용할 수 있습니다.
window.openThemeArticle = function(theme){
  if(!theme) return;
  const post = {
    id: `theme-${theme.id}`,
    type: 'life',
    title: theme.title || '추천 테마',
    content: theme.content || theme.summary || '',
    summary: theme.summary || '',
    image_url: theme.image_url || '',
    created_at: theme.created_at || new Date().toISOString(),
    author_name: 'DalTownMap'
  };
  const existing = (boardPosts || []).findIndex(p=>String(p.id)===String(post.id));
  if(existing >= 0) boardPosts[existing] = post;
  else boardPosts.push(post);
  renderBoardPage('life', post.id);
  lastBasePage = currentPage;
  showPage('board-detail');
};

// 추천 테마 카드 클릭
 document.addEventListener('click',e=>{
  const btn=e.target.closest('.business-main-theme-card, .business-theme-card');
  if(!btn)return;
  const theme=(dalpicks||[]).find(d=>String(d.id)===String(btn.dataset.themeId));
  if(theme) window.openThemeArticle(theme);
});

function initPageSwipe(){
  // v21.7: 모바일에서 화면 전체 좌우 스와이프로 하단 탭 페이지가 바뀌는 기능을 비활성화합니다.
  // DalPick, 배너, 갤러리처럼 각 컴포넌트가 자체적으로 처리하는 스와이프만 유지합니다.
  // 하단 메뉴를 통한 홈/업소/쿠폰/지도/가이드 이동은 기존대로 작동합니다.
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
    list = list.filter(b=>Boolean(b.has_event));
  } else if(mapCategory){
    list = list.filter(b=>getMainCategoryLabel(b.category)===mapCategory);
  }
  if(mapSearchQuery){
    list = list.filter(b=>queryMatches(mapSearchQuery, [b.name, b.name_en, b.category, b.category_main, b.category_sub, b.subcategory, b.search_keywords, b.address, b.region, getMainCategoryLabel(b.category)]));
  }
  return list;
}

function createInfoWindowContent(b){
  const hasCoupon = activeMapCoupons().some(c=>String(c.businessId)===String(b.id));
  const thumb = b.image || 'assets/kfocus-icon.png';
  const badges = [hasCoupon ? '<span class=\"map-iw-badge deal\">🎟 할인</span>' : '', b.video ? '<span class=\"map-iw-badge video\">🎥 영상</span>' : '', b.has_event ? '<span class=\"map-iw-badge event\">🎉 행사</span>' : ''].filter(Boolean).join('');
  return `<div class=\"map-infowindow\"><div class=\"map-iw-row\"><img class=\"map-iw-thumb\" src=\"${esc(thumb)}\" alt=\"${esc(b.name)}\"><div class=\"map-iw-meta\"><h4>${esc(b.name)}</h4><p>${esc(b.subcategory || b.category_sub || getMainCategoryLabel(b.category))} · ${esc(b.address)}</p>${badges?`<div class=\"map-iw-badges\">${badges}</div>`:''}</div></div><div class=\"map-iw-actions\"><a href=\"#\" class=\"iw-btn\" onclick=\"return window.openBusinessFromMap('${esc(b.id)}')\">상세보기</a>${hasCoupon?`<a href=\"#\" class=\"iw-btn coupon\" onclick=\"return window.openCouponFromMap('${esc(b.id)}')\">할인</a>`:''}<a class=\"iw-btn route\" href=\"https://www.google.com/maps/dir/?api=1&destination=${b.lat},${b.lng}\" target=\"_blank\">길찾기</a></div></div>`;
}

function youtubeEmbed(url) {

    if (!url) return '';

    let videoId = '';

    // https://www.youtube.com/watch?v=xxxx
    if (url.includes('watch?v=')) {
        videoId = url.split('watch?v=')[1].split('&')[0];
    }

    // https://youtu.be/xxxx
    else if (url.includes('youtu.be/')) {
        videoId = url.split('youtu.be/')[1].split('?')[0];
    }

    if (!videoId) return '';

    return `
        <div class="board-video">
            <iframe
                width="100%"
                height="420"
                src="https://www.youtube.com/embed/${videoId}"
                title="YouTube video"
                frameborder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowfullscreen>
            </iframe>
        </div>
    `;
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

function fitMapToCurrentResultRows(){
  const rows = Array.isArray(window.__mapCurrentRows) ? window.__mapCurrentRows : [];
  const valid = rows.filter(b=>Number.isFinite(Number(b.lat)) && Number.isFinite(Number(b.lng)));
  if(!map || !window.google?.maps || !valid.length) return;
  mapBusinessPreview?.classList.add('hidden');
  selectedMapBusinessId = '';
  mapBottomPanel?.classList.remove('preview-open');
  mapBottomPanel?.classList.add('counts-only');
  if(mapInfoWindow) mapInfoWindow.close();
  if(valid.length === 1){
    const b = valid[0];
    map.setZoom(14);
    panMapForVisibleInfo(Number(b.lat), Number(b.lng));
    return;
  }
  const bounds = new google.maps.LatLngBounds();
  valid.forEach(b=>bounds.extend({ lat:Number(b.lat), lng:Number(b.lng) }));
  map.fitBounds(bounds, { top: 220, right: 48, bottom: 110, left: 48 });
  google.maps.event.addListenerOnce(map, 'idle', ()=>{
    if((map.getZoom() || 0) > 15) map.setZoom(15);
  });
}


function getMarkerIconForBusiness(b){
  if(mapMode==='event' || b.has_event) return 'https://maps.google.com/mapfiles/ms/icons/purple-dot.png';
  if(mapMode==='coupon' || activeMapCoupons().some(c=>String(c.businessId)===String(b.id))) return 'https://maps.google.com/mapfiles/ms/icons/orange-dot.png';
  return 'https://maps.google.com/mapfiles/ms/icons/red-dot.png';
}

function panMapAboveBottomPanel(lat, lng){
  if(!map) return;
  const panelHeight = Math.min(mapBottomPanel?.offsetHeight || 150, 260);
  const offset = getMapVerticalOffsetLat(lat, Math.max(90, panelHeight * .55));
  map.panTo({ lat:Number(lat) - offset, lng:Number(lng) });
}

function redrawMapMarkers(){
  if(!map || !window.google?.maps) return;
  if(markerCluster){ markerCluster.setMap(null); markerCluster = null; }
  markers.forEach(m=>m.setMap(null));
  markers = [];
  const focus = currentCenter || getRegionCenter(currentRegion);
  const radiusMiles = String(mapRadius)==='all' ? null : Number(mapRadius || radiusByZoom(map?.getZoom?.() || 12));
  let baseList = businesses.filter(b=>Number.isFinite(Number(b.lat)) && Number.isFinite(Number(b.lng)));
  if(mapSearchQuery) baseList = baseList.filter(b=>queryMatches(mapSearchQuery, [b.name, b.name_en, b.category, b.category_main, b.category_sub, b.subcategory, b.search_keywords, b.address, b.region, getMainCategoryLabel(b.category)]));
  const nearbyBase = !radiusMiles ? baseList : baseList.filter(b=>haversineMiles(focus.lat, focus.lng, Number(b.lat), Number(b.lng)) <= radiusMiles);
  updateMapFilterAvailability(nearbyBase.length ? nearbyBase : baseList);
  // 상단 세부 카테고리 개수는 현재 위치/검색 범위의 전체 업소를 기준으로 유지한다.
  // 카테고리를 선택해도 다른 카테고리 버튼과 개수가 사라지지 않게 한다.
  let categorySummaryList = nearbyBase.length ? nearbyBase : baseList;
  if(mapMode !== 'business') categorySummaryList = [];

  const list = getFilteredMapBusinesses();
  const filtered = !radiusMiles ? list : list.filter(b=>{
    const miles = haversineMiles(focus.lat, focus.lng, Number(b.lat), Number(b.lng));
    return miles <= radiusMiles;
  });

  // 지도에는 선택한 분류의 전체 업소 핀을 표시한다.
  // 반경은 하단의 “주변 업소” 목록을 정렬·제한하는 용도로만 사용한다.
  const finalList = list.filter(b =>
    Number.isFinite(Number(b.lat)) && Number.isFinite(Number(b.lng))
  );
  const nearbyList = filtered.length ? filtered : (mapMode==='event' ? [] : finalList.slice(0,60));

  finalList.forEach(b=>{
    const lat = Number(b.lat); const lng = Number(b.lng);
    const icon = getMarkerIconForBusiness(b);
    const marker = new google.maps.Marker({ position:{lat, lng}, title:b.name, icon });
    marker.addListener('click', ()=>{
      panMapAboveBottomPanel(lat, lng);
      showMapBusinessPreview({...b, lat, lng});
      if(mapInfoWindow) mapInfoWindow.close();
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
  const sortedFinalList = sortBusinessesByDistance(nearbyList);
  renderMapBottomList(sortedFinalList, categorySummaryList);
  if(mapNotice) mapNotice.classList.add('hidden');
  if(mapSearchQuery && finalList.length){
    setMapBottomStatus(`검색 결과 ${finalList.length}곳`);
  } else if(!finalList.length){
    setMapBottomStatus(mapSearchQuery ? '검색 결과가 없습니다.' : `현재 지도에 표시할 ${mapModeLabel(mapMode)}가 없습니다.`);
  } else if(!filtered.length && radiusMiles){
    setMapBottomStatus(`현재 반경 안에는 ${mapModeLabel(mapMode)}가 없습니다. 지도에는 전체 ${finalList.length}곳을 표시합니다.`);
  } else {
    setMapBottomStatus('');
  }
}
function setMapAreaButtonState(state = 'active') {
  if (!mapSearchAreaBtn) return;

  mapSearchAreaBtn.classList.remove('hidden');
  mapSearchAreaBtn.removeAttribute('hidden');

  if (state === 'search') {
    mapSearchAreaBtn.disabled = false;
    mapSearchAreaBtn.textContent = '이 지역 보기';
  } else if (state === 'location') {
    mapSearchAreaBtn.disabled = false;
    mapSearchAreaBtn.textContent = '이 지역 보기';
    mapSearchAreaBtn.classList.add('hidden');
    mapSearchAreaBtn.setAttribute('hidden','');
  } else {
    mapSearchAreaBtn.disabled = false;
    mapSearchAreaBtn.textContent = '이 지역 보기';
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
function showCurrentLocationMarker(position) {
  if (!map || !window.google?.maps || !position) return;

  currentLocationPosition = { lat: Number(position.lat), lng: Number(position.lng) };
  if (!Number.isFinite(currentLocationPosition.lat) || !Number.isFinite(currentLocationPosition.lng)) return;
  position = currentLocationPosition;

  /*
    DalTownMap 현재 위치 브랜드 핀
    - 바깥 핀: 브랜드 블루
    - 중앙 원: 흰색
    - 중앙 포인트: 브랜드 레드
  */
  const brandPinSvg = `
    <svg xmlns="http://www.w3.org/2000/svg"
         width="48"
         height="56"
         viewBox="0 0 48 56">
      <defs>
        <filter id="shadow"
                x="-40%"
                y="-30%"
                width="180%"
                height="190%">
          <feDropShadow
            dx="0"
            dy="3"
            stdDeviation="2.5"
            flood-color="#000000"
            flood-opacity="0.28"/>
        </filter>
      </defs>

      <path
        filter="url(#shadow)"
        fill="#3568D4"
        d="M24 2C13.5 2 5 10.5 5 21
           C5 35.5 24 54 24 54
           C24 54 43 35.5 43 21
           C43 10.5 34.5 2 24 2Z"/>

      <circle
        cx="24"
        cy="21"
        r="11.5"
        fill="#FFFFFF"/>

      <circle
        cx="24"
        cy="21"
        r="6.5"
        fill="#FF4F5E"/>

      <circle
        cx="24"
        cy="21"
        r="2.3"
        fill="#FFFFFF"/>
    </svg>
  `;

  const icon = {
    url:
      'data:image/svg+xml;charset=UTF-8,' +
      encodeURIComponent(brandPinSvg),

    scaledSize: new google.maps.Size(42, 49),
    anchor: new google.maps.Point(21, 49)
  };

  if (currentLocationMarker) {
    currentLocationMarker.setPosition(position);
    currentLocationMarker.setIcon(icon);
    currentLocationMarker.setMap(map);
    if (currentLocationBubbleOverlay) {
      currentLocationBubbleOverlay.setPosition(position);
    }
    return;
  }

  currentLocationMarker = new google.maps.Marker({
    position,
    map,
    title: '현재 위치',
    icon,
    zIndex: 99999,
    optimized: false
  });

  if (currentLocationBubbleOverlay) {
    currentLocationBubbleOverlay.setPosition(position);
  }
}
let currentLocationBubbleOverlay = null;

class CurrentLocationBubbleOverlay extends google.maps.OverlayView {
  constructor(position) {
    super();
    this.position = position;
    this.visible = false;
    this.div = null;
  }

  onAdd() {
    const div = document.createElement('div');
    div.className = 'current-location-map-bubble';
    div.innerHTML = `
      <span class="current-location-map-bubble__status">
        <span class="current-location-map-bubble__dot"></span>
        <span>현재 위치 표시 중</span>
      </span>
      <button type="button" class="current-location-map-bubble__locate" aria-label="현재 위치 다시 찾기" title="현재 위치 다시 찾기">📍</button>
    `;

    Object.assign(div.style, {
      position: 'absolute',
      zIndex: '999999',
      display: 'none',
      alignItems: 'center',
      gap: '7px',
      height: '34px',
      padding: '0 12px',
      boxSizing: 'border-box',
      background: 'rgba(255,255,255,0.98)',
      color: '#2457a7',
      border: '1px solid #d6e2f4',
      borderRadius: '18px',
      boxShadow: '0 3px 12px rgba(27,70,139,0.22)',
      fontSize: '12px',
      fontWeight: '700',
      lineHeight: '1',
      whiteSpace: 'nowrap',
      pointerEvents: 'auto',
      transform: 'translate(-50%, -100%)'
    });

    const locateButton = div.querySelector('.current-location-map-bubble__locate');
    locateButton?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      mapLocateBtn?.click();
    });

    const dot = div.querySelector('.current-location-map-bubble__dot');
    Object.assign(dot.style, {
      width: '8px',
      height: '8px',
      display: 'inline-block',
      flex: '0 0 8px',
      borderRadius: '50%',
      background: '#ff4f5e',
      border: '2px solid #ffffff',
      boxShadow: '0 0 0 2px #3568d4'
    });

    this.div = div;
    this.getPanes().floatPane.appendChild(div);
  }

  draw() {
    if (!this.div || !this.position) return;

    const projection = this.getProjection();
    if (!projection) return;

    const latLng = this.position instanceof google.maps.LatLng
      ? this.position
      : new google.maps.LatLng(this.position.lat, this.position.lng);
    const point = projection.fromLatLngToDivPixel(latLng);
    if (!point) return;

    // point는 마커 핀의 끝점이다. 핀 높이만큼 위에 말풍선을 고정한다.
    this.div.style.left = `${Math.round(point.x)}px`;
    this.div.style.top = `${Math.round(point.y - 56)}px`;
    this.div.style.display = this.visible ? 'flex' : 'none';
  }

  setPosition(position) {
    this.position = position;
    this.draw();
  }

  setVisible(visible) {
    this.visible = Boolean(visible);
    if (this.div) this.div.style.display = this.visible ? 'flex' : 'none';
    if (this.visible) this.draw();
  }

  onRemove() {
    if (this.div) this.div.remove();
    this.div = null;
  }
}

function ensureCurrentLocationBubble() {
  const position = currentLocationPosition || currentCenter;
  if (!map || !position) return null;

  if (!currentLocationBubbleOverlay) {
    currentLocationBubbleOverlay = new CurrentLocationBubbleOverlay(position);
    currentLocationBubbleOverlay.setMap(map);
  } else {
    currentLocationBubbleOverlay.setPosition(position);
  }

  return currentLocationBubbleOverlay;
}

function setMapUiState(state) {
  const bubble = ensureCurrentLocationBubble();

  if (state === 'current') {
    mapDirty = false;

    if (bubble) {
      bubble.setPosition(currentLocationPosition || currentCenter);
      bubble.setVisible(Boolean(currentLocationPosition));
    }

    if (mapSearchAreaBtn) {
      mapSearchAreaBtn.classList.add('hidden');
      mapSearchAreaBtn.style.setProperty('display', 'none', 'important');
    }

    return;
  }

  if (state === 'dirty') {
    mapDirty = true;

    if (bubble) {
      bubble.setPosition(currentLocationPosition || currentCenter);
      bubble.setVisible(Boolean(currentLocationPosition));
    }

    if (mapSearchAreaBtn) {
      mapSearchAreaBtn.classList.remove('hidden');
      mapSearchAreaBtn.removeAttribute('hidden');
      mapSearchAreaBtn.disabled = false;
      mapSearchAreaBtn.textContent = '이 지역 보기';
      mapSearchAreaBtn.style.setProperty('display', 'flex', 'important');
      mapSearchAreaBtn.style.setProperty('visibility', 'visible', 'important');
      mapSearchAreaBtn.style.setProperty('opacity', '1', 'important');
      mapSearchAreaBtn.style.setProperty('pointer-events', 'auto', 'important');
    }

    return;
  }

  mapDirty = false;
  if (bubble) {
    bubble.setPosition(currentLocationPosition || currentCenter);
    bubble.setVisible(Boolean(currentLocationPosition));
  }

  if (mapSearchAreaBtn) {
    mapSearchAreaBtn.classList.add('hidden');
    mapSearchAreaBtn.style.setProperty('display', 'none', 'important');
  }
}

function activateMapSearchAreaButton() {
  setMapUiState('dirty');
}

map.addListener('dragend', () => {
  if (suppressMapUiChange) return;

  const c = map.getCenter();

  if (c) {
    currentCenter = {
      lat: c.lat(),
      lng: c.lng()
    };
  }

  activateMapSearchAreaButton();
});

map.addListener('zoom_changed', () => {
  if (suppressMapUiChange) return;

  activateMapSearchAreaButton();
});

function startCurrentLocationTracking() {
  if (!navigator.geolocation || currentLocationWatchId !== null) return;

  currentLocationTrackingEnabled = true;
  currentLocationWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      if (!currentLocationTrackingEnabled) return;
      const nextPosition = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude
      };
      showCurrentLocationMarker(nextPosition);
      const bubble = ensureCurrentLocationBubble();
      if (bubble) {
        bubble.setPosition(nextPosition);
        bubble.setVisible(true);
      }
    },
    (error) => console.warn('현재 위치 추적을 갱신하지 못했습니다.', error),
    {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 30000
    }
  );
}

const applyCenter = () => {
  if (TEST_FORCE_CENTER || !navigator.geolocation) {
    currentCenter = getRegionCenter(currentRegion);

    suppressMapUiChange = true;

    map.setCenter(currentCenter);
    map.setZoom(12);

    redrawMapMarkers();
    mapNotice?.classList.add('hidden');

/*
  idle 이벤트를 기다리기 전에 먼저 표시한다.
  일부 환경에서는 이미 idle 상태여서
  addListenerOnce 콜백이 늦거나 실행되지 않을 수 있다.
*/
setMapUiState('current');

google.maps.event.addListenerOnce(map, 'idle', () => {
  suppressMapUiChange = false;
  setMapUiState('current');
});

/* 지도 내부 UI가 다시 그려진 뒤 한 번 더 보장 */
setTimeout(() => {
  suppressMapUiChange = false;
  setMapUiState('current');
}, 500);

    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      currentCenter = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude
      };

      persistRegion(
        detectRegionFromCoords(
          currentCenter.lat,
          currentCenter.lng
        )
      );

      suppressMapUiChange = true;

      map.panTo(currentCenter);
      map.setZoom(11);

      showCurrentLocationMarker(currentCenter);
      startCurrentLocationTracking();

      mapRadius = radiusByZoom(11);
      redrawMapMarkers();

      mapNotice?.classList.add('hidden');

      google.maps.event.addListenerOnce(map, 'idle', () => {
        suppressMapUiChange = false;

        /* 현재 위치 문구 표시 */
        setMapUiState('current');
      });
    },
    (error) => {
      console.warn(
        '현재 위치를 가져오지 못했습니다.',
        error
      );

      currentCenter = getRegionCenter(currentRegion);

      suppressMapUiChange = true;

      map.setCenter(currentCenter);
      map.setZoom(12);

      redrawMapMarkers();
      mapNotice?.classList.add('hidden');

      google.maps.event.addListenerOnce(map, 'idle', () => {
        suppressMapUiChange = false;
        setMapUiState('area');
      });
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000
    }
  );
};
requestAnimationFrame(() => {
  setTimeout(() => {
    google.maps.event.trigger(map, 'resize');
    applyCenter();
  }, 240);
});
};
  if (!document.getElementById('gmap-script')) {
  const s = document.createElement('script');

  s.id = 'gmap-script';

  s.src =
    `https://maps.googleapis.com/maps/api/js` +
    `?key=${encodeURIComponent(key)}` +
    `&callback=__kfocusInitMap` +
    `&libraries=places` +
    `&loading=async`;

  s.async = true;
  document.head.appendChild(s);

} else if (window.google?.maps) {
  window.__kfocusInitMap();
}
}


document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible') refreshBoardPostsSilently();
});
window.addEventListener('focus',()=>refreshBoardPostsSilently());
setInterval(()=>{
  if(!document.hidden) refreshBoardPostsSilently();
},5*60*1000);

function bindEvents(){
  $('#searchBtn')?.addEventListener('click', ()=>openSearchOverlay());
  $('#homeBrand')?.addEventListener('click', ()=>showPage('home'));
  $$('.nav-item').forEach(btn=>btn.addEventListener('click', ()=>showPage(btn.dataset.nav)));
  document.querySelector('[data-board-bottom-back]')?.addEventListener('click', boardBottomBack);
  document.querySelector('[data-board-bottom-list]')?.addEventListener('click', boardBottomList);
  $('#menuBtn')?.addEventListener('click', openSideMenu); $('#sideClose')?.addEventListener('click', closeSideMenu); $('#sideOverlay')?.addEventListener('click', closeSideMenu);
  $('#sideRegionPicker')?.addEventListener('click', ()=>{ closeSideMenu(); openRegionPicker(); });
  $('#adminLoginBackdrop')?.addEventListener('click', closeAdminLoginModal);
  $('#adminLoginClose')?.addEventListener('click', closeAdminLoginModal);
  $('#adminLoginSubmit')?.addEventListener('click', handleAdminLogin);
  document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeSideMenu(); });
  $$('.side-link[data-nav], .text-link[data-nav]').forEach(btn=>btn.addEventListener('click', ()=>showPage(btn.dataset.nav)));
  $$('.board-link').forEach(btn=>btn.addEventListener('click', ()=>showBoard(btn.dataset.board)));
  communityTabs?.addEventListener('click', async e=>{ const btn=e.target.closest('.community-tab'); if(!btn) return; const type=btn.dataset.board || 'notice'; renderHomeBoardSection(type); await refreshBoardPostsSilently({force:true}); renderHomeBoardSection(type); });
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
  document.addEventListener('click', e=>{ const storyBtn=e.target.closest('[data-story-post]'); if(!storyBtn)return; openBoardPost(storyBtn.dataset.storyPost); });
  categoryRow?.addEventListener('click', e=>{ const btn=e.target.closest('.category-chip'); if(!btn) return; businessQuickFilter = (businessQuickFilter === btn.dataset.cat ? '' : btn.dataset.cat); renderCategories(); renderMainBanners(); renderBusinessList(); });
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
  mapFilterRow?.addEventListener('click', e=>{
    const btn=e.target.closest('.map-filter-chip');
    if(!btn || btn.classList.contains('hidden')) return;
    mapMode = btn.dataset.mapFilter || 'business';
    selectedMapBusinessId='';
    mapCategory='';
    renderMapFilters();
    if(mapReady){
      redrawMapMarkers();
      // 하단의 업소/쿠폰/행사 전체 개수를 누를 때마다 해당 결과 전체가 화면에 들어오게 정렬한다.
      setTimeout(fitMapToCurrentResultRows, 80);
    }
    setTimeout(()=>renderMapCategorySummary(window.__mapCategorySummaryRows || window.__mapCurrentRows || []), 0);
  });
  mapCategoryRow?.addEventListener('click', e=>{
    const btn=e.target.closest('[data-map-category]');
    if(!btn) return;
    const next = btn.dataset.mapCategory || '';
    mapMode = 'business';
    mapCategory = mapCategory === next ? '' : next;
    selectedMapBusinessId='';
    renderMapFilters();
    if(mapReady){
      redrawMapMarkers();
      // 선택한 세부 카테고리 업소가 흩어져 있어도 모두 보이도록 자동 줌/중앙 정렬한다.
      setTimeout(fitMapToCurrentResultRows, 80);
    }
  });
mapSearchAreaBtn?.addEventListener('click', () => {
  if (!mapReady || !map) return;

  const center = map.getCenter();

  if (center) {
    currentCenter = {
      lat: center.lat(),
      lng: center.lng()
    };
  }

  mapRadius = radiusByZoom(map.getZoom() || 12);
  redrawMapMarkers();

  mapDirty = false;

  // 클릭 후에도 절대 숨기지 않음
  setMapAreaButtonState('location');
});
  mapLocateBtn?.addEventListener('click', ()=>{
    if(!mapReady || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos)=>{
      currentCenter = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      persistRegion(detectRegionFromCoords(currentCenter.lat, currentCenter.lng));
      suppressMapUiChange = true;
      map.setCenter(currentCenter);
      const zoom = Math.max(map.getZoom() || 12, 13);
      map.setZoom(zoom);
      mapRadius = radiusByZoom(zoom);
      showCurrentLocationMarker(currentCenter);
      startCurrentLocationTracking();
      redrawMapMarkers();
      setTimeout(()=>panMapAboveBottomPanel(currentCenter.lat, currentCenter.lng), 120);
      google.maps.event.addListenerOnce(map, 'idle', ()=>{
        suppressMapUiChange = false;
        setMapUiState('current');
      });
      setTimeout(()=>{
        suppressMapUiChange = false;
        setMapUiState('current');
      }, 500);
    }, ()=>{} , { enableHighAccuracy:true, timeout:6000, maximumAge:300000 });
  });
  mapBottomList?.addEventListener('click', e=>{ const btn=e.target.closest('[data-map-biz]'); if(!btn) return; const biz = getBiz(btn.dataset.mapBiz); if(!biz || !map) return; const pos = { lat:Number(biz.lat), lng:Number(biz.lng) }; map.setZoom(Math.max(map.getZoom() || 12, 14)); panMapAboveBottomPanel(pos.lat, pos.lng); showMapBusinessPreview(biz); if(mapInfoWindow) mapInfoWindow.close(); });
  mapBusinessPreview?.addEventListener('click', e=>{
    const detail = e.target.closest('[data-map-detail]');
    if(detail){ const id=detail.dataset.mapDetail; selectedBizId=id; currentDetailVideoOverride=''; lastBasePage='map'; renderDetail(id); showPage('business-detail'); return; }
    const action = e.target.closest('[data-map-action]');
    if(action) logBusinessActivity(action.dataset.mapId, action.dataset.mapAction);
  });
  mapBottomClose?.addEventListener('click', ()=>{
    if(selectedMapBusinessId){
      selectedMapBusinessId='';
      mapBusinessPreview?.classList.add('hidden');
      mapBottomTitle?.parentElement?.classList.add('hidden');
      mapBottomPanel?.classList.remove('preview-open');
      mapBottomPanel?.classList.add('counts-only');
      return;
    }
  });
  window.addEventListener('hashchange', ()=>showPage(getRoute()));
  window.addEventListener('popstate', ()=>{ if(!v87OpenPublicRoute()) showPage(getRoute()); });
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

function sortPaidRotation(list, section){
  const today = new Date().toISOString().slice(0,10);

  return list
    .filter(b => b.paid_active)
    .sort((a,b) => {
      const aKey = hashKey(`${today}-${section}-${a.id}`);
      const bKey = hashKey(`${today}-${section}-${b.id}`);
      return aKey - bKey;
    });
}

function seededRandom(seed){
  let h = 2166136261;
  for(let i = 0; i < seed.length; i++){
    h ^= seed.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return Math.abs(h >>> 0);
}

function isPaidActive(b){
  if(!b.paid_active) return false;

  const today = new Date().toISOString().slice(0,10);

  if(b.paid_start_at && b.paid_start_at > today) return false;
  if(b.paid_end_at && b.paid_end_at < today) return false;

  return true;
}

function paidRotationScore(b, section){
  const today = new Date().toISOString().slice(0,10);
  const weight = Number(b.paid_weight || 1);
  const seed = `${today}-${section}-${b.id}`;
  return seededRandom(seed) / weight;
}

function getAutoPaidBusinesses(section, limit = 6){
  return businesses
    .filter(b => b.is_active !== false)
    .filter(b => isPaidActive(b))
    .filter(b => b.rotation_enabled !== false)
    .sort((a,b) => paidRotationScore(a, section) - paidRotationScore(b, section))
    .slice(0, limit);
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

}

async function submitBusinessRequest(){
  const client = getAuthClient();
  if (!client) {
    alert('Supabase 연결이 준비되지 않았습니다.');
    return;
  }

  const { error } = await client
    .from("business_requests")
    .insert({
      business_name: document.querySelector("#reqBusinessName").value,
      owner_name: document.querySelector("#reqOwnerName").value,
      phone: document.querySelector("#reqPhone").value,
      email: document.querySelector("#reqEmail").value,
      category: document.querySelector("#reqCategory").value,
      address: document.querySelector("#reqAddress").value,
      website: document.querySelector("#reqWebsite").value,
      message: document.querySelector("#reqMessage").value
    });

  if (error) {
    alert(error.message);
    return;
  }

  alert("업소 등록 신청이 접수되었습니다.");
  showPage("home");
}

async function submitAdRequest(){
  const client = getAuthClient();
  if (!client) {
    alert('Supabase 연결이 준비되지 않았습니다.');
    return;
  }

  const { error } = await client
    .from("advertising_requests")
    .insert({
      company_name: document.querySelector("#adCompany").value,
      contact_name: document.querySelector("#adName").value,
      phone: document.querySelector("#adPhone").value,
      email: document.querySelector("#adEmail").value,
      ad_type: document.querySelector("#adType").value,
      message: document.querySelector("#adMessage").value
    });

  if (error) {
    alert(error.message);
    return;
  }

  alert("문의가 접수되었습니다.");
  showPage("home");
}


// V100: iPhone 홈 화면 PWA가 오래 열려 있어도 관리자 변경 내용을 다시 읽습니다.
// 게시글/쿠폰/슬라이드/배너 같은 데이터 변경에는 업데이트 팝업을 띄우지 않습니다.
let v100PublicRefreshRunning = false;
let v100LastPublicRefreshAt = 0;
const V100_PUBLIC_REFRESH_MIN_GAP = 8000;

async function v100RefreshPublicData(reason='manual', force=false){
  const now = Date.now();
  if(v100PublicRefreshRunning) return false;
  if(!force && now - v100LastPublicRefreshAt < V100_PUBLIC_REFRESH_MIN_GAP) return false;

  v100PublicRefreshRunning = true;
  try{
    const jobs = [
      loadCouponsFromSupabase(),
      loadSlidesFromSupabase(),
      loadBannersFromSupabase(),
      loadDalpicksFromSupabase(),
      loadBoardPostsFromSupabase(),
      loadAlertNoticePostsFromSupabase()
    ];
    if(typeof loadMainSettings === 'function') jobs.push(loadMainSettings(true));
    await Promise.allSettled(jobs);

    syncBusinessStoriesToBoardPosts();
    buildHeroSlides();

    if(typeof renderHero === 'function') renderHero();
    if(typeof bindHeroSwipe === 'function') bindHeroSwipe();
    if(typeof setSlide === 'function') setSlide(0);
    if(typeof restartAuto === 'function') restartAuto();
    if(typeof renderHome === 'function') renderHome();
    if(typeof renderCoupons === 'function') renderCoupons();
    if(typeof renderDalpicks === 'function') renderDalpicks();
    if(typeof renderMainBanners === 'function') renderMainBanners();
    if(typeof window.loadMainBanners === 'function') window.loadMainBanners();
    if(typeof v77RefreshRoutineDrivenHome === 'function') v77RefreshRoutineDrivenHome();

    v100LastPublicRefreshAt = Date.now();
    console.info('[DalTownMap V100] public data refreshed', reason);
    return true;
  }catch(error){
    console.warn('[DalTownMap V100] public refresh failed', reason, error);
    return false;
  }finally{
    v100PublicRefreshRunning = false;
  }
}
window.refreshDalTownPublicData = (force=true)=>v100RefreshPublicData('manual', force);

function v100InstallPublicRefreshHooks(){
  document.addEventListener('visibilitychange', ()=>{
    if(document.visibilityState === 'visible') v100RefreshPublicData('visibility');
  });
  window.addEventListener('pageshow', event=>{
    v100RefreshPublicData(event.persisted ? 'pageshow-bfcache' : 'pageshow');
  });
  window.addEventListener('focus', ()=>v100RefreshPublicData('focus'));

  document.addEventListener('click', event=>{
    const homeTarget = event.target.closest('#homeBrand, .nav-item[data-nav="home"]');
    if(homeTarget) setTimeout(()=>v100RefreshPublicData('home-tap', true), 0);
  });

  setInterval(()=>{
    if(!document.hidden && currentPage === 'home') v100RefreshPublicData('home-interval');
  }, 2 * 60 * 1000);
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
  renderHome(); renderCategories(); renderBusinessList(); renderCoupons(); renderDetail(selectedBizId); renderMapFilters(); renderRecentSearches(); bindEvents(); v100InstallPublicRefreshHooks(); initIosInstallBanner(); initAndroidInstallBanner(); hideRegionUi(); initPageSwipe();
  openAdminLoginModalFromQuery();
  if(!v87OpenPublicRoute()) showPage(getRoute());
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
  const guideCard = e.target.closest('[data-guide-subtype]');
  if (!guideCard) return;
  renderGuidePosts(guideCard.dataset.guideSubtype || GUIDE_DEFAULT_SUBTYPE);
});

document.addEventListener('click', (e) => {
  const nav = e.target.closest('[data-nav]');
  if (!nav) return;

  const page = nav.getAttribute('data-nav');

  setMapPageMode(page === 'map');

  if (page === 'business') {
    setTimeout(() => {
      const btn = [...document.querySelectorAll('button')]
        .find(b => b.textContent.trim() === '식당');

      if (btn) btn.click();
    }, 300);
  }
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

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function getIosBrowserContext() {
  const ua = navigator.userAgent || '';
  if (/GSA\//i.test(ua)) return 'google-app';
  if (/KAKAOTALK/i.test(ua)) return 'kakao';
  if (/NAVER/i.test(ua)) return 'naver';
  if (/Instagram|FBAN|FBAV|Line\//i.test(ua)) return 'in-app';
  if (/CriOS/i.test(ua)) return 'chrome';
  if (/FxiOS/i.test(ua)) return 'firefox';
  if (/EdgiOS/i.test(ua)) return 'edge';
  if (/Safari/i.test(ua)) return 'safari';
  return 'other';
}

function shouldShowIosInstallBanner() {
  if (!isIosDevice() || isStandaloneMode()) return false;
  const hiddenUntil = Number(localStorage.getItem('ios_install_banner_hidden_until') || 0);
  return Date.now() > hiddenUntil;
}

function iosGuideSteps(context) {
  const safari = [
    {
      title: 'Safari의 공유 버튼을 누르세요',
      desc: '화면 아래쪽의 <strong>네모에서 위로 화살표가 나온 버튼</strong>입니다.',
      visual: 'safari-share'
    },
    {
      title: '“홈 화면에 추가”를 선택하세요',
      desc: '공유 메뉴를 아래로 조금 내리면 <strong>홈 화면에 추가</strong>가 보입니다.',
      visual: 'share-menu'
    },
    {
      title: '오른쪽 위 “추가”를 누르면 완료',
      desc: '홈 화면에 DalTownMap 아이콘이 생기고 앱처럼 바로 열 수 있습니다.',
      visual: 'install-complete'
    }
  ];

  if (context === 'safari') return safari;

  const names = {
    'google-app': 'Google 앱', chrome: 'Chrome', kakao: '카카오톡', naver: '네이버',
    firefox: 'Firefox', edge: 'Edge', 'in-app': '현재 앱', other: '현재 브라우저'
  };
  const appName = names[context] || '현재 브라우저';
  return [
    {
      title: `${appName}의 메뉴 또는 공유 버튼을 누르세요`,
      desc: '오른쪽 위나 아래쪽에 있는 <strong>··· 또는 공유 아이콘</strong>을 찾아 누르세요.',
      visual: 'browser-menu'
    },
    {
      title: '“Safari에서 열기”를 선택하세요',
      desc: '메뉴에 바로 보이지 않으면 <strong>공유</strong>를 누른 뒤 Safari 아이콘을 선택하세요.',
      visual: 'open-safari'
    },
    {
      title: 'Safari에서 홈 화면에 추가하세요',
      desc: 'Safari의 공유 버튼 <strong>□↑</strong> → <strong>홈 화면에 추가</strong> 순서로 누르면 완료됩니다.',
      visual: 'safari-finish'
    }
  ];
}

function renderIosGuideVisual(type) {
  const visuals = {
    'safari-share': `
      <div class="guide-phone"><div class="guide-page">DalTownMap</div>
        <div class="guide-safari-bar"><span>‹</span><span>›</span><span class="guide-share-icon pulse-ring">□<b>↑</b></span><span>▢</span><span>•••</span></div>
        <div class="guide-pointer bounce-down">☝</div>
      </div>`,
    'share-menu': `
      <div class="guide-share-sheet"><div class="guide-sheet-row">복사</div><div class="guide-sheet-row">북마크에 추가</div>
        <div class="guide-sheet-row highlight-row"><span>⊞</span> 홈 화면에 추가 <span class="tap-dot"></span></div>
      </div>`,
    'install-complete': `
      <div class="guide-home-screen"><div class="guide-app-icon pop-in">📍</div><div class="guide-app-name">DalTownMap</div><div class="guide-check">✓</div></div>`,
    'browser-menu': `
      <div class="guide-browser-top"><span class="guide-address">daltownmap.com</span><span class="guide-more pulse-ring">•••</span><div class="guide-pointer side-pointer">☝</div></div>`,
    'open-safari': `
      <div class="guide-share-sheet"><div class="guide-sheet-row">링크 복사</div><div class="guide-sheet-row highlight-row"><span class="safari-compass">◉</span> Safari에서 열기 <span class="tap-dot"></span></div><div class="guide-sheet-row">Chrome에서 열기</div></div>`,
    'safari-finish': `
      <div class="guide-finish-flow"><span class="mini-action pulse-ring">□↑</span><span class="flow-arrow">→</span><span class="mini-home">⊞ 홈 화면에 추가</span><span class="guide-check small">✓</span></div>`
  };
  return visuals[type] || '';
}

function initIosInstallBanner() {
  const banner = document.getElementById('iosInstallBanner');
  const title = document.getElementById('iosInstallTitle');
  const desc = document.getElementById('iosInstallDesc');
  const guideBtn = document.getElementById('iosInstallGuideBtn');
  const closeBtn = document.getElementById('iosInstallCloseBtn');
  const overlay = document.getElementById('iosInstallGuideOverlay');
  if (!banner || !overlay) return;

  const context = getIosBrowserContext();
  const isSafari = context === 'safari';
  if (title) title.textContent = isSafari ? '홈 화면에 추가 후 편리하게 이용하세요' : 'Safari에서 열어 홈 화면에 추가하세요';
  if (desc) desc.innerHTML = isSafari
    ? '공유 버튼 위치부터 그림으로 쉽게 안내해 드립니다.'
    : '현재 브라우저에서는 홈 화면 추가 메뉴가 보이지 않을 수 있습니다. Safari로 여는 방법부터 안내합니다.';

  let stepIndex = 0;
  let steps = iosGuideSteps(context);
  const stepLabel = document.getElementById('iosGuideStep');
  const guideTitle = document.getElementById('iosGuideTitle');
  const guideDesc = document.getElementById('iosGuideDesc');
  const visual = document.getElementById('iosGuideVisual');
  const prevBtn = document.getElementById('iosGuidePrevBtn');
  const nextBtn = document.getElementById('iosGuideNextBtn');

  function renderStep() {
    const step = steps[stepIndex];
    if (stepLabel) stepLabel.textContent = `${stepIndex + 1} / ${steps.length}`;
    if (guideTitle) guideTitle.textContent = step.title;
    if (guideDesc) guideDesc.innerHTML = step.desc;
    if (visual) visual.innerHTML = renderIosGuideVisual(step.visual);
    prevBtn.disabled = stepIndex === 0;
    nextBtn.textContent = stepIndex === steps.length - 1 ? '알겠어요' : '다음';
    overlay.querySelectorAll('.ios-guide-progress span').forEach((dot, i) => dot.classList.toggle('active', i <= stepIndex));
  }

  function closeGuide() {
    overlay.classList.add('hidden');
  }

  if (shouldShowIosInstallBanner()) {
    setTimeout(() => banner.classList.remove('hidden'), 1800);
  }

  guideBtn?.addEventListener('click', () => {
    stepIndex = 0;
    steps = iosGuideSteps(getIosBrowserContext());
    renderStep();
    overlay.classList.remove('hidden');
  });
  prevBtn?.addEventListener('click', () => {
    if (stepIndex > 0) { stepIndex -= 1; renderStep(); }
  });
  nextBtn?.addEventListener('click', () => {
    if (stepIndex < steps.length - 1) { stepIndex += 1; renderStep(); }
    else {
      closeGuide();
      banner.classList.add('hidden');
      localStorage.setItem('ios_install_banner_hidden_until', String(Date.now() + 1000 * 60 * 60 * 24 * 7));
    }
  });
  document.getElementById('iosGuideXBtn')?.addEventListener('click', closeGuide);
  overlay.querySelector('.ios-guide-dim')?.addEventListener('click', closeGuide);
  closeBtn?.addEventListener('click', () => {
    localStorage.setItem('ios_install_banner_hidden_until', String(Date.now() + 1000 * 60 * 60 * 24));
    banner.classList.add('hidden');
  });
}

let deferredInstallPrompt = null;

function isAndroidDevice() {
  return /android/i.test(navigator.userAgent);
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

function toYouTubeEmbedUrl(url){
  const id = getYouTubeId(url);
  return id
    ? `https://www.youtube.com/embed/${id}?autoplay=1&playsinline=1&rel=0`
    : '';
}

function openBusinessVideo(url){
  const modal = document.getElementById('businessVideoModal');
  const frame = document.getElementById('businessVideoFrame');
  if(!modal || !frame || !url) return;

  const youtubeUrl = toYouTubeEmbedUrl(url);

  frame.innerHTML = youtubeUrl
    ? `<iframe src="${youtubeUrl}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`
    : `<video src="${esc(url)}" controls autoplay playsinline></video>`;

  modal.classList.remove('hidden');
}

function closeBusinessVideo(){
  const modal = document.getElementById('businessVideoModal');
  const frame = document.getElementById('businessVideoFrame');
  if(frame) frame.innerHTML = '';
  if(modal) modal.classList.add('hidden');
}

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
      alert('아직 홈 화면 추가 창을 띄울 수 없는 상태입니다. 잠시 후 다시 시도해 주세요.');
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
console.info('[DalTownMap] v8.7 guide subcategory fix loaded');

// V62 날짜 예약·장면 프리셋을 세 섹션별로 병합
function v62ActiveByDate(rows=[],today=v61DateKey()){
  return rows.filter(r=>r&&r.enabled!==false&&(!r.start_date||r.start_date<=today)&&(!r.end_date||r.end_date>=today)).sort((a,b)=>Number(b.priority||0)-Number(a.priority||0));
}
function v61EffectiveHomeConfig(config={}){
  const today=v61DateKey();let out={...config};
  const scene=v62ActiveByDate(Array.isArray(config.scene_presets)?config.scene_presets:[],today)[0];if(scene?.config)out={...out,...scene.config,active_scene_id:scene.id||''};
  const schedules=Array.isArray(config.schedule_presets)?config.schedule_presets:[];
  ['today','community','alert'].forEach(section=>{const row=v62ActiveByDate(schedules.filter(x=>(x.section||'today')===section),today)[0];if(row){out={...out,...row,active_schedule_id:row.id||out.active_schedule_id||''};if(section==='alert'&&Array.isArray(row.ticker_sources))out.ticker_sources=row.ticker_sources;if(section==='community'&&row.community_sort)out.community_sort=row.community_sort;if(section==='today'&&row.business_mode)out.business_mode=row.business_mode;}});
  out.schedule_presets=schedules;out.scene_presets=config.scene_presets||[];return out;
}
console.info('[DalTownMap] V62 section schedules and scenes loaded');

console.info('[DalTownMap] V87 dual URL compatibility loaded');
