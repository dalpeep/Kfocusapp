
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
let suppressMapUiChange = false;
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

let currentRegion = getAppRegion();
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
        <span class="home-biz-map-cat">${esc(b.category || '업소')}</span>
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

  rows = sortBusinessesByDistance(rows)
    .slice()
    .sort((a,b)=>
      Number(a.featured_rank ?? a.new_rank ?? a.popular_rank ?? 1000)
      - Number(b.featured_rank ?? b.new_rank ?? b.popular_rank ?? 1000)
      ||
      String(b.created_at || '').localeCompare(String(a.created_at || ''))
    )
    .slice(0,6);

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
  return boardPosts.filter(p=>normalizeBoardType(p.type)===type && !hiddenThemeTitles.has(String(p.title||'').trim()) && (adminSession || !p.region || normalizeRegionKey(p.region)===currentRegion));
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
    'id,business_id,title,content,type,subtype,region,image_url,image_link_url,gallery_urls,video_url,external_url,link_label,author_name,address,phone,start_at,end_at,created_at',
    'id,business_id,title,content,type,subtype,region,image_url,image_link_url,gallery_urls,video_url,external_url,link_label,author_name,start_at,end_at,created_at',
    'id,business_id,title,content,type,subtype,region,image_url,image_link_url,gallery_urls,video_url,external_url,link_label,author_name,created_at'
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
            created_at: row.created_at || ''
          }));
          return true;
        }
      } catch(e){}
    }
  }
  return false;
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
    const select = [
      'id','name_ko','name_en','name','category_ko','category','area',
      'address','phone','website','email','image_url','image_urls','gallery_urls',
      'description','description_images','hours','monday','tuesday','wednesday',
      'thursday','friday','saturday','sunday','business_hours',
      'parking','reservation','languages','insurance','video_url','youtube_url',
      'lat','lng','is_featured','featured_rank','is_new','new_rank',
      'is_popular','popular_rank','reservation_enabled',
      'paid_product','paid_active','paid_start_at','paid_end_at',
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
          category: row.category_ko || row.category || '기타',
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
  syncBusinessStoriesToBoardPosts();
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
    const url = `${SUPABASE_URL}/rest/v1/slides?select=${encodeURIComponent(select)}&region=eq.${encodeURIComponent(getAppRegion())}&order=home_fixed_sort.asc.nullslast,created_at.desc.nullslast`;
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
function renderDalpicks(){const box=document.getElementById('dalpickList');if(!box)return;let rows=activeDalpicks().filter(d=>!isThemeDalpick(d)||d.show_in_dalpick===true).slice(0,6);if(!rows.length){const fallback=(typeof todayCoupons==='function'?todayCoupons():[]).slice(0,3);box.innerHTML=fallback.length?fallback.map(c=>{const b=getBiz(c.businessId||c.business_id)||{};return `<button class="dalpick-card coupon-open" data-coupon="${esc(c.id)}"><img src="${esc(c.image_url||c.image||b.image||'/assets/kfocus-icon.png')}" alt=""><div><span class="dalpick-badge">COUPON</span><strong>${esc(c.title||'오늘의 쿠폰')}</strong><p>${esc(b.name||c.description||'')}</p></div></button>`}).join(''):'<div class="board-empty">등록된 DalPick이 없습니다.</div>';return;}box.innerHTML=rows.map(d=>{const b=getBiz(d.business_id)||{};const img=d.image_url||b.image||b.image_url||'/assets/kfocus-icon.png';return `<button class="dalpick-card" type="button" data-dalpick-id="${esc(d.id)}"><img src="${esc(img)}" alt="${esc(d.title||'DalPick')}"><div><span class="dalpick-badge">${esc(dalpickBadge(d.category))}</span><strong>${esc(d.title||'DalPick')}</strong><p>${esc(d.summary||b.name||'')}</p></div></button>`}).join('');box.querySelectorAll('[data-dalpick-id]').forEach(btn=>btn.addEventListener('click',()=>{const d=rows.find(x=>String(x.id)===String(btn.dataset.dalpickId));if(!d)return;if(String(d.category||'').toLowerCase()==='business_story'){openBoardPost(`dalpick-story-${d.id}`);}else if(isThemeDalpick(d)){openThemeArticle(d);}else if(d.business_id){renderDetail(d.business_id);showPage('business-detail');}else if(d.content){alert(`${d.title}\n\n${d.content}`);}}));if(window.lucide)window.lucide.createIcons();}

async function loadCouponsFromSupabase(){
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = getConfig();
  if(!SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
  try {
    const select = 'id,business_id,title,description,coupon_code,use_link_url,image_url,discount_label,start_at,end_at,is_active,is_today_coupon,sort_order,created_at,notify_emails,notify_phones';
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
	  use_link_url: row.use_link_url || '',
      imageUrl: row.image_url || '',
	  discount_label: row.discount_label || '',
      startAt: row.start_at || '',
      endAt: row.end_at || '',
      isActive: row.is_active !== false,
      isToday: !!row.is_today_coupon,
      sortOrder: row.sort_order == null ? 1000 : Number(row.sort_order),
      createdAt: row.created_at || '',
      notify_emails: row.notify_emails || '',
      notify_phones: row.notify_phones || ''
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

    desc: `${b.category} · ${getRegionLabel(b.region || currentRegion)}`,

    slideDesc: s.description || s.promo_text || '',

    button: '',

    bg:
        s.promo_image_url ||
        b.image_url ||
        b.image ||
        '',

    link_url: s.link_url || '',

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

function boardListItemHTML(post) {
  const type = normalizeBoardType(post.type);
  const summary = String(post.content || '')
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
            ${esc(boardLabel(type))}
          </em>

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
  const rows = boardPostsByType(type).slice(0,4);
  if(homeBoardList) homeBoardList.innerHTML = rows.length ? rows.map(boardListItemHTML).join('') : `<div class="board-empty">등록된 ${boardLabel(type)} 글이 없습니다.</div>`;
  if(homeBoardMoreBtn) homeBoardMoreBtn.dataset.board = type;
}
function renderGuidePosts(topic='') {
  const list = document.getElementById('guidePostList');
  if (!list) return;
  const q = normalizeSearchText(topic);
  const rows = boardPosts.filter(p => {
    const isGuide = normalizeBoardType(p.type) === 'guide';
    const visible = adminSession || !p.region || normalizeRegionKey(p.region) === currentRegion;
    const text = normalizeSearchText([p.title, p.content, p.subtype].filter(Boolean).join(' '));
    const keywords = q.split(/\s+/).filter(Boolean);
    return isGuide && visible && (!keywords.length || keywords.some(word => text.includes(word)));
  }).slice(0, 12);
  list.innerHTML = rows.length ? rows.map(boardListItemHTML).join('') : '<div class="board-empty">등록된 달라스 가이드가 없습니다.</div>';
}

function renderHome(){
  renderHomeBoardSection(selectedBoardType || 'notice');

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

if (typeof renderDalpicks === 'function') { renderDalpicks(); }
if (typeof renderTodayCoupons === 'function') { renderTodayCoupons(); }
if (typeof renderHomeBusinessTabs === 'function') {
  renderHomeBusinessTabs();
}
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
  if(['shopping','shop','쇼핑','마트'].some(v=>s.includes(v))) return 'shopping';
  if(['hospital','medical','health','병원','의료','건강','미용','뷰티'].some(v=>s.includes(v))) return 'hospital';
  if(['finance','tax','account','금융','세무','회계','보험'].some(v=>s.includes(v))) return 'finance';
  if(['law','legal','법률','변호'].some(v=>s.includes(v))) return 'law';
  if(['church','교회','종교'].some(v=>s.includes(v))) return 'church';
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

function getBusinessPageTheme(){
  const selected = businessQuickFilter || '';
  const selectedTarget = normalizeThemeTarget(selected);
  const now = Date.now();
  const rows = (dalpicks || []).filter(row => {
    if (!isThemeDalpick(row) || row.is_active === false) return false;
    const status = String(row.status || '').toLowerCase();
    if (status && !['published','active'].includes(status)) return false;
    const start = row.start_at || row.start_date;
    const end = row.end_at || row.end_date;
    if (start && new Date(start).getTime() > now) return false;
    if (end && new Date(end).getTime() < now) return false;
    const targets = parseThemeTargets(row.target_categories).map(normalizeThemeTarget);
    // 업종을 선택하지 않은 기본 화면에서는 전체 업종용 글을 우선하고,
    // 없으면 가장 최신 추천 테마를 넓게 노출합니다.
    if (!selectedTarget) return targets.includes('all') || targets.length > 0;
    return targets.includes('all') || targets.includes(selectedTarget);
  });
  return rows.sort((a,b) => {
    const at = parseThemeTargets(a.target_categories).map(normalizeThemeTarget);
    const bt = parseThemeTargets(b.target_categories).map(normalizeThemeTarget);
    if (!selectedTarget) {
      const aAll = at.includes('all') ? 1 : 0;
      const bAll = bt.includes('all') ? 1 : 0;
      if (aAll !== bAll) return bAll - aAll;
    }
    return Number(b.is_featured)-Number(a.is_featured) || Number(b.priority||0)-Number(a.priority||0) || new Date(b.created_at||0)-new Date(a.created_at||0);
  })[0] || null;
}
function renderBusinessThemeSpot(){
  const spot = document.getElementById('businessThemeSpot');
  if (!spot) return;
  const theme = getBusinessPageTheme();
  if (!theme) { spot.innerHTML=''; spot.hidden=true; return; }
  const summary = String(theme.summary || theme.content || '').trim();
  const short = summary.length > 92 ? summary.slice(0,92).trim()+'…' : summary;
  spot.hidden=false;
  spot.innerHTML = `<button type="button" class="business-main-theme-card" data-theme-id="${esc(theme.id)}">
    <div class="business-main-theme-thumb">${theme.image_url?`<img src="${esc(theme.image_url)}" alt="${esc(theme.title||'추천 테마')}">`:'<span>✨</span>'}</div>
    <div class="business-main-theme-copy"><div class="business-main-theme-top"><span>추천 테마</span><small>${themeReadingMinutes(theme.content||theme.summary)}분 읽기 →</small></div><h3>${esc(theme.title||'오늘의 추천 테마')}</h3>${short?`<p>${esc(short)}</p>`:''}</div>
  </button>`;
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
      const hay = [b.name, b.category, b.address, b.desc].filter(Boolean).join(' ').toLowerCase();
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

  const now = Date.now();
  const rows = (Array.isArray(mainBanners) ? mainBanners : []).filter(b => {
    const placement = String(b.placement || (b.business_id ? 'both' : 'home')).toLowerCase();
    if (!['home','both'].includes(placement)) return false;
    if (b.start_at && new Date(b.start_at).getTime() > now) return false;
    if (b.end_at && new Date(b.end_at).getTime() < now) return false;
    return true;
  });
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

const activeCoupon = coupons.find(c =>
  String(c.businessId || c.business_id) === String(b.id)
);

// 추천 테마: 업소 카테고리에 맞는 정보형 기사를 상세페이지 최상단에 표시합니다.
function normalizeThemeTarget(value){
  const s=String(value||'').trim().toLowerCase().replace(/\s+/g,'_');
  if(['restaurant','food','식당','음식','한식','카페'].some(v=>s.includes(v))) return 'restaurant';
  if(['shopping','shop','쇼핑','마트'].some(v=>s.includes(v))) return 'shopping';
  if(['hospital','medical','health','병원','의료','건강','미용','뷰티'].some(v=>s.includes(v))) return 'hospital';
  if(['finance','tax','account','금융','세무','회계','보험'].some(v=>s.includes(v))) return 'finance';
  if(['law','legal','법률','변호'].some(v=>s.includes(v))) return 'law';
  if(['church','교회','종교'].some(v=>s.includes(v))) return 'church';
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
      String(row.business_id || '') === String(businessId) &&
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
    if (String(row.business_id || '') !== String(businessId)) return false;
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
      <div class="business-detail-ad-thumb"><img src="${esc(promo.image_url || '/assets/kfocus-icon.png')}" alt="${esc(promo.title || '업소 광고')}"></div>
      <div class="business-detail-ad-copy"><div class="business-detail-ad-label">SPONSORED</div><h3>${esc(promo.title || '업소 소식')}</h3>${desc?`<p>${esc(desc.length>100?desc.slice(0,100)+'…':desc)}</p>`:''}${String(promo.button_label || '').trim() ? `<span>${esc(promo.button_label)} →</span>` : ''}</div>
    </button>`;
  }
  const desc = String(promo.description || '').trim();
  return `<button type="button" class="business-detail-banner" data-business-promo="${esc(promo.id)}" aria-label="${esc(promo.title || '업소 광고')}">
    <img src="${esc(promo.image_url || '')}" alt="${esc(promo.title || '업소 광고')}">
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
  btn.addEventListener('click', () => {
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
    if (promo.business_id) { selectedBizId=promo.business_id; renderDetail(promo.business_id); showPage('business-detail'); }

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

if (slideData) {
  const link = String(slideData.link_url || '').trim();

  if (link === '#business-request') {
    closeSlideDetailModal?.();
    showPage('business-request');
    return;
  }

  if (link) {
    window.open(link, '_blank');
    return;
  }

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
  const sortedFinalList = sortBusinessesByDistance(nearbyList);
  renderMapBottomList(sortedFinalList);
  if(mapNotice){
    if(mapMode==='event') mapNotice.textContent = ''; //등록된 행사 지도가 아직 없습니다.
    else if(mapSearchQuery && finalList.length) mapNotice.textContent = `검색 결과 ${finalList.length}곳`;
    else mapNotice.textContent = finalList.length ? '' : (mapSearchQuery ? '검색 결과가 없습니다.' : '이 반경에 표시할 업소가 없습니다.');
    mapNotice.classList.toggle('hidden', !mapNotice.textContent);
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
    mapSearchAreaBtn.textContent = '현재 위치로 돌아가기';
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
  if (!map || !window.google?.maps) return;

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
      <span class="current-location-map-bubble__dot"></span>
      <span>현재 위치 표시 중</span>
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
      pointerEvents: 'none',
      transform: 'translate(-50%, -100%)'
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
  if (!map || !currentCenter) return null;

  if (!currentLocationBubbleOverlay) {
    currentLocationBubbleOverlay = new CurrentLocationBubbleOverlay(currentCenter);
    currentLocationBubbleOverlay.setMap(map);
  } else {
    currentLocationBubbleOverlay.setPosition(currentCenter);
  }

  return currentLocationBubbleOverlay;
}

function setMapUiState(state) {
  const bubble = ensureCurrentLocationBubble();

  if (state === 'current') {
    mapDirty = false;

    if (bubble) {
      bubble.setPosition(currentCenter);
      bubble.setVisible(true);
    }

    if (mapSearchAreaBtn) {
      mapSearchAreaBtn.classList.add('hidden');
      mapSearchAreaBtn.style.setProperty('display', 'none', 'important');
    }

    return;
  }

  if (state === 'dirty') {
    mapDirty = true;

    if (bubble) bubble.setVisible(false);

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
  if (bubble) bubble.setVisible(false);

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
  document.addEventListener('click', e=>{ const storyBtn=e.target.closest('[data-story-post]'); if(!storyBtn)return; openBoardPost(storyBtn.dataset.storyPost); });
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
      redrawMapMarkers();
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
  const guideCard = e.target.closest('[data-guide-topic]');
  if (!guideCard) return;
  document.querySelectorAll('.guide-card').forEach(card => card.classList.toggle('active', card === guideCard));
  renderGuidePosts(guideCard.dataset.guideTopic || '');
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

function toYouTubeEmbedUrl(url){
  if(!url) return '';

  const s = String(url).trim();

  const shortMatch = s.match(/youtu\.be\/([^?&]+)/);
  if(shortMatch) return `https://www.youtube.com/embed/${shortMatch[1]}?autoplay=1`;

  const watchMatch = s.match(/[?&]v=([^?&]+)/);
  if(watchMatch) return `https://www.youtube.com/embed/${watchMatch[1]}?autoplay=1`;

  const embedMatch = s.match(/youtube\.com\/embed\/([^?&]+)/);
  if(embedMatch) return `${s}${s.includes('?') ? '&' : '?'}autoplay=1`;

  return '';
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