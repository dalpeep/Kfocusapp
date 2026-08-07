import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const cfg = window.KFOCUS_CONFIG || {};
const qs = (id) => document.getElementById(id);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

let supabase = null;

let businesses = [];
let coupons = [];
let boards = [];
let dalpicks = [];
let slides = [];
let slideFormDirty = false;
let slideSaveBusy = false;
let banners = [];
let boardTable = 'posts';
function getConfig() {
    return window.APP_CONFIG || window.KFOCUS_CONFIG || {};
}

function getAppCity() {
    const cfg = getConfig();

    return String(
        cfg.APP_CITY ||
        cfg.app_city ||
        'dallas'
    ).trim().toLowerCase();
}

function getAppRegion() {
    const cfg = getConfig();

    return String(
        cfg.APP_REGION ||
        cfg.app_region ||
        getAppCity()
    ).trim().toLowerCase();
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
function applyAdminRegionUI() {
    const role = window.ADMIN_ROLE || '';
    const areaRaw = window.ADMIN_AREA || '';
    const area = areaRaw === 'denver' ? 'colorado' : areaRaw;

    const dallasHomeBtn =
        document.getElementById('openDallasHome');

    const coloradoHomeBtn =
        document.getElementById('openColoradoHome');

    if (dallasHomeBtn) dallasHomeBtn.style.display = 'none';
    if (coloradoHomeBtn) coloradoHomeBtn.style.display = 'none';

    if (role === 'super_admin') {
        if (dallasHomeBtn) dallasHomeBtn.style.display = '';
        if (coloradoHomeBtn) coloradoHomeBtn.style.display = '';
    } else if (area === 'dallas') {
        if (dallasHomeBtn) dallasHomeBtn.style.display = '';
    } else if (area === 'colorado') {
        if (coloradoHomeBtn) coloradoHomeBtn.style.display = '';
    }

    const pageDesc = document.getElementById('pageDesc');

    if (pageDesc) {
        if (role === 'super_admin') {
            pageDesc.textContent =
                'Dallas와 Denver 지역 업소를 조회하고 수정/추가할 수 있습니다.';
        } else {
            const cityLabel =
                area === 'dallas' ? 'Dallas' : 'Denver';

            pageDesc.textContent =
                `${cityLabel} 지역 업소를 조회하고 수정/추가할 수 있습니다.`;
        }
    }
	    // 지역 관리자는 관리자 계정 관리 메뉴와 화면 숨김
    if (role !== 'super_admin') {
        const adminUsersNav = document.querySelector(
            '[data-section="adminUsers"]'
        );

        const adminUsersSection = document.getElementById(
            'section-adminUsers'
        );

        if (adminUsersNav) {
            adminUsersNav.style.display = 'none';
        }

        if (adminUsersSection) {
            adminUsersSection.style.display = 'none';
        }
    }

    // 지역 관리자는 자기 지역만 보이도록 select 고정
    if (role !== 'super_admin') {
        const regionSelectIds = [
            'regionFilter',
            'region',
            'board_region'
        ];

        regionSelectIds.forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;

            const label =
                area === 'dallas' ? 'Dallas' : 'Denver';

            if (el.tagName === 'SELECT') {
                el.innerHTML = `
                    <option value="${area}">${label}</option>
                `;
            }

            el.value = area;
            el.disabled = true;
        });
    }
}
window.getAppCity = getAppCity;
window.getAppRegion = getAppRegion;
window.getAppCityLabel = getAppCityLabel;
window.isSingleCityMode = isSingleCityMode;
let businessStatsMap = {};

let currentSection = 'business';
let selectedId = null;
let selectedCouponId = null;
let selectedBoardId = null;
let selectedDalpickId = null;
let selectedSlideBusinessId = null;
let selectedSlideId = null;

const BUSINESS_FIELDS = [
  'id', 'name_ko', 'name_en', 'category_ko', 'map_category', 'subcategory', 'search_keywords', 'area', 'region', 'phone',
  'website', 'email', 'address', 'description',
  'coupon_notify_emails',
  'coupon_notify_phones',  
  'hours',
  'parking',
  'reservation',
  'reservation_url',
  'languages',
  'google_maps_url',
  'google_maps_url',
  'rating',
  'review_count',
  'insurance',
  'image_url', 'video_url',
  'lat', 'lng', 'featured_rank', 'new_rank', 'popular_rank',
  'promo_text', 'promo_image_url', 'home_fixed_sort',
  'paid_product',
  'paid_weight',
  'paid_start_at',
  'paid_end_at',
  'description_image_url',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',

];
const BUSINESS_CHECKS = [
  'is_active', 'is_featured', 'is_new', 'is_popular', 'reservation_enabled', 'promo_enabled', 'home_fixed', 'paid_active', 'rotation_enabled', 
];

function on(id, evt, fn) {
  const el = qs(id);
  if (el) el.addEventListener(evt, fn);
}
function safeText(id, text) {
  const el = qs(id);
  if (!el) return;
  if (text && typeof text === 'object') {
    const preferred = text.message ?? text.error ?? text.details ?? text.hint ?? text.reason;
    if (preferred !== undefined) text = preferred;
    else {
      try { text = JSON.stringify(text); } catch (_) { text = '처리 결과를 표시할 수 없습니다.'; }
    }
  }
  el.textContent = text ?? '';
}
function val(id) { return qs(id)?.value ?? ''; }
function setVal(id, v) { if (qs(id)) qs(id).value = v ?? ''; }
function checked(id) { return !!qs(id)?.checked; }
function setChecked(id, v) { if (qs(id)) qs(id).checked = !!v; }

function fmtLocal(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocal(v) {
  return v ? new Date(v).toISOString() : null;
}
function currentRegionScope() {
  return qs('regionFilter')?.value || 'all';
}
function setStatus(text) {
  safeText('statusPill', text);
}
function switchSection(section) {
  currentSection = section;
  $$('#adminNav .nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.section === section);
  });
  $$('.admin-section').forEach((sec) => {
    sec.classList.toggle('active-section', sec.id === `section-${section}`);
  });
  setPageMeta();

  if (section === 'couponRedemptions' && typeof loadCouponRedemptions === 'function') {
    loadCouponRedemptions();
  }
}
function setPageMeta() {
  const titleMap = {
    business: ['업소 관리자', 'Dallas와 지역 업소를 조회하고 수정/추가할 수 있습니다.'],
    businessCrm: ['업소 마케팅 CRM', '업소별 홍보 상태, 다음 권장 일정과 오늘 해야 할 일을 관리합니다.'],
    coupon: ['쿠폰 관리자', '쿠폰을 생성하고 기간 / 정렬 / 지역 노출을 관리합니다.'],
    couponRedemptions: ['쿠폰 사용 내역', '사용자가 확인한 쿠폰 기록을 조회합니다.'],
    slide: ['슬라이드 관리자', '홈 상단 통합 슬라이더에 노출할 프로모션을 관리합니다.'],
    aiStudio: ['AI 콘텐츠 스튜디오', '주제 분석부터 콘텐츠 추천·생성·발행 연결까지 한 번에 진행합니다.'],
    dalpick: ['DalPick 관리', '생성된 DalPick과 업소탐방 Premium 콘텐츠를 검토하고 발행합니다.'],
    performance: ['광고 성과 센터', '관리자 전용 비공개 광고 성과를 확인합니다.'],
    board: ['커뮤니티 관리자', '지역소식 / 라이프 / 비즈니스 글을 관리합니다.'],
    newsroom: ['AI 운영센터', '수집부터 AI 기사 작성과 게시까지 관리자 화면에서 처리합니다.'],
	banners: ['배너 관리자', '메인 스폰서 배너를 등록/수정/삭제합니다.'],
    requests: ['신청 관리', '업소 등록 신청과 광고 문의를 확인합니다.'],
    adsOps: ['광고 센터', '광고 현황, 편성, 오늘 로테이션과 종료 예정 광고를 관리합니다.'],
    push: ['푸시 발송', '공지와 알림 메시지를 발송합니다.'],
    adminUsers: ['관리자 관리', '관리자 계정과 권한을 관리합니다.']
  };
  const [t, d] = titleMap[currentSection] || titleMap.business;
  safeText('pageTitle', t);
  safeText('pageDesc', d);
}
function makeUploadPath(file, folder = 'uploads') {
  const bucket = cfg.STORAGE_BUCKET || 'public-images';
  const baseFolder = String(cfg.STORAGE_FOLDER || '').replace(/^\/+|\/+$/g, '');
  const safe = (file.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
  const dir = baseFolder ? `${baseFolder}/${folder}` : folder;
  return { bucket, path: `${dir}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}` };
}
async function uploadFileToStorage(file, folder = 'uploads') {
  if (!file) return null;
  const { bucket, path } = makeUploadPath(file, folder);
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || 'application/octet-stream'
  });
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl || null;
}

const REQUEST_PAGE_SIZE = 20;

async function loadBusinessRequests(page = 1){
  const keyword = (document.querySelector('#businessRequestSearch')?.value || '').trim();
  const from = (page - 1) * REQUEST_PAGE_SIZE;
  const to = from + REQUEST_PAGE_SIZE - 1;

  let query = supabase
    .from('business_requests')
    .select('*', { count:'exact' })
    .order('created_at', { ascending:false })
    .range(from, to);

  if (keyword) {
    query = query.or(
      `business_name.ilike.%${keyword}%,owner_name.ilike.%${keyword}%,phone.ilike.%${keyword}%,email.ilike.%${keyword}%`
    );
  }

  const { data, error, count } = await query;
  if (error) return alert(error.message);

  const box = document.querySelector('#businessRequestsList');

  box.innerHTML = data?.length ? `
    <table class="request-table">
      <thead>
        <tr>
          <th>업소명</th>
          <th>담당자</th>
          <th>전화</th>
          <th>이메일</th>
          <th>상태</th>
          <th>신청일</th>
          <th>관리</th>
        </tr>
      </thead>
      <tbody>
        ${data.map(r => `
          <tr>
            <td>${esc(r.business_name || '')}</td>
            <td>${esc(r.owner_name || '')}</td>
            <td>${esc(r.phone || '')}</td>
            <td>${esc(r.email || '')}</td>
            <td>${esc(r.status || 'pending')}</td>
            <td>${fmtLocal(r.created_at)}</td>
            <td>
              <button onclick="openBusinessRequestModal('${r.id}')">보기</button>
              <button type="button" onclick="approveBusinessRequest('${r.id}')">승인</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  ` : '<p>등록된 업소 신청이 없습니다.</p>';

  renderPager('#businessRequestsPager', page, count || 0, 'loadBusinessRequests');
}

async function loadAdRequests(page = 1){
  const keyword = (document.querySelector('#adRequestSearch')?.value || '').trim();
  const from = (page - 1) * REQUEST_PAGE_SIZE;
  const to = from + REQUEST_PAGE_SIZE - 1;

  let query = supabase
    .from('advertising_requests')
    .select('*', { count:'exact' })
    .order('created_at', { ascending:false })
    .range(from, to);

  if (keyword) {
    query = query.or(
      `company_name.ilike.%${keyword}%,contact_name.ilike.%${keyword}%,phone.ilike.%${keyword}%,email.ilike.%${keyword}%`
    );
  }

  const { data, error, count } = await query;
  if (error) return alert(error.message);

  const box = document.querySelector('#adRequestsList');

  box.innerHTML = data?.length ? `
    <table class="request-table">
      <thead>
        <tr>
          <th>회사명</th>
          <th>담당자</th>
          <th>전화</th>
          <th>이메일</th>
          <th>광고종류</th>
          <th>상태</th>
          <th>문의일</th>
          <th>관리</th>
        </tr>
      </thead>
      <tbody>
        ${data.map(r => `
          <tr>
            <td>${esc(r.company_name || '')}</td>
            <td>${esc(r.contact_name || '')}</td>
            <td>${esc(r.phone || '')}</td>
            <td>${esc(r.email || '')}</td>
            <td>${esc(r.ad_type || '')}</td>
            <td>${esc(r.status || 'pending')}</td>
            <td>${fmtLocal(r.created_at)}</td>
            <td>
              <button onclick="openAdRequestModal('${r.id}')">보기</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  ` : '<p>등록된 광고 문의가 없습니다.</p>';

  renderPager('#adRequestsPager', page, count || 0, 'loadAdRequests');
}

function todayKey(){
  return new Date().toISOString().slice(0,10);
}

function adSeededRandom(seed){
  let h = 2166136261;
  for(let i = 0; i < seed.length; i++){
    h ^= seed.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return Math.abs(h >>> 0);
}

function isPaidBusinessActive(b){
  if(!b.paid_active) return false;

  const today = todayKey();

  if(b.paid_start_at && b.paid_start_at > today) return false;
  if(b.paid_end_at && b.paid_end_at < today) return false;

  return true;
}

function rotationDateValue(){
  return document.querySelector('#adsRotationDate')?.value || todayKey();
}
function adsEligibleOnDate(b, dateValue){
  const dateKey=String(dateValue||todayKey()).slice(0,10);
  if(b.is_active===false) return false;
  if(b.paid_start_at && String(b.paid_start_at).slice(0,10)>dateKey) return false;
  if(b.paid_end_at && String(b.paid_end_at).slice(0,10)<dateKey) return false;
  return true;
}
function adsGroupRank(b, section){
  if(section==='featured') return Number(b.featured_rank??1000);
  if(section==='new') return Number(b.new_rank??1000);
  if(section==='popular') return Number(b.popular_rank??1000);
  return 1000;
}
function rotationScore(b, section, dateValue){
  const weight=Math.max(1,Number(b.paid_weight||1));
  return adSeededRandom(`${String(dateValue||todayKey()).slice(0,10)}-${section}-${b.id}`)/weight;
}
function pickRotation(list, section, limit=6, dateValue=todayKey()){
  const eligible=list.filter(b=>adsEligibleOnDate(b,dateValue));
  const fixed=eligible.filter(b=>b.rotation_enabled===false)
    .sort((a,b)=>adsGroupRank(a,section)-adsGroupRank(b,section)||String(b.created_at||'').localeCompare(String(a.created_at||'')));
  const automatic=eligible.filter(b=>b.rotation_enabled!==false)
    .sort((a,b)=>rotationScore(a,section,dateValue)-rotationScore(b,section,dateValue));
  return fixed.concat(automatic).slice(0,limit);
}

let adsOpsRows = [];
let adsSelectedIds = new Set();
let adsCategoryKey = 'all';
let adsQuickSavingId = null;

function adsGroupOf(b){
  if(b.is_featured) return 'featured';
  if(b.is_new) return 'new';
  if(b.is_popular) return 'popular';
  return 'none';
}
function adsGroupLabel(group){return ({featured:'추천',new:'신규',popular:'인기',none:'없음'})[group]||group;}
function adsStatusOf(b){
  const today=todayKey();
  if(b.is_active===false) return 'inactive';
  if(!b.paid_active) return 'unpaid';
  if(b.paid_start_at && String(b.paid_start_at).slice(0,10)>today) return 'scheduled';
  if(b.paid_end_at && String(b.paid_end_at).slice(0,10)<today) return 'expired';
  return 'active';
}
function adsStatusLabel(v){return ({active:'게시 중',scheduled:'예약',expired:'종료',unpaid:'일반',inactive:'비활성'})[v]||v;}
function adsFilteredRows(){
  const q=(document.querySelector('#adsSearch')?.value||'').trim().toLowerCase();
  const group=document.querySelector('#adsGroupFilter')?.value||'all';
  const status=document.querySelector('#adsStatusFilter')?.value||'all';
  return adsOpsRows.filter(b=>{
    const hay=[b.name_ko,b.name_en,b.area,b.category_ko].filter(Boolean).join(' ').toLowerCase();
    const category=String(b.category_ko||'미분류').trim()||'미분류';
    return (!q||hay.includes(q)) && (group==='all'||adsGroupOf(b)===group) && (status==='all'||adsStatusOf(b)===status) && (adsCategoryKey==='all'||category===adsCategoryKey);
  });
}
function showAdsToast(message,isError=false){
  let el=document.querySelector('#adsQuickToast');
  if(!el){el=document.createElement('div');el.id='adsQuickToast';el.className='ads-quick-toast';document.body.appendChild(el);}
  el.textContent=message;el.classList.toggle('error',!!isError);el.classList.add('show');
  clearTimeout(showAdsToast._timer);showAdsToast._timer=setTimeout(()=>el.classList.remove('show'),2200);
}
function renderAdsCategoryChips(){
  const host=document.querySelector('#adsCategoryChips');if(!host)return;
  const counts=new Map();
  adsOpsRows.forEach(b=>{const c=String(b.category_ko||'미분류').trim()||'미분류';counts.set(c,(counts.get(c)||0)+1);});
  const entries=[...counts.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'ko'));
  host.innerHTML=`<button type="button" class="ads-category-chip ${adsCategoryKey==='all'?'active':''}" data-category="all">전체 <b>${adsOpsRows.length}</b></button>${entries.map(([name,count])=>`<button type="button" class="ads-category-chip ${adsCategoryKey===name?'active':''}" data-category="${esc(name)}">${esc(name)} <b>${count}</b></button>`).join('')}`;
  host.querySelectorAll('.ads-category-chip').forEach(btn=>btn.onclick=()=>{adsCategoryKey=btn.dataset.category||'all';renderAdsCategoryChips();renderAdsOpsList();});
}
async function setAdsGroupQuick(id,group){
  const row=adsOpsRows.find(b=>String(b.id)===String(id));if(!row||adsQuickSavingId)return;
  if(adsGroupOf(row)===group)return;
  adsQuickSavingId=String(id);renderAdsOpsList();
  const payload={is_featured:group==='featured',is_new:group==='new',is_popular:group==='popular'};
  const {error}=await supabase.from('businesses').update(payload).eq('id',id);
  adsQuickSavingId=null;
  if(error){renderAdsOpsList();showAdsToast(`변경 실패: ${error.message}`,true);return;}
  Object.assign(row,payload);
  renderAdsSummary();renderAdsOverviewGroups();renderAdsCategoryChips();renderAdsOpsList();
  const preview=document.querySelector('#rotationPreview');if(preview?.innerHTML)previewRotation();
  showAdsToast(`${row.name_ko||row.name_en||'업소'} → ${adsGroupLabel(group)}로 변경했습니다.`);
}
function setAdsCenterTab(tab){
  const target = ['overview','schedule','rotation','ending'].includes(tab) ? tab : 'overview';
  document.querySelectorAll('.ads-center-tab').forEach(btn=>btn.classList.toggle('active', btn.dataset.adsTab===target));
  document.querySelectorAll('.ads-center-panel').forEach(panel=>panel.classList.toggle('hidden', panel.dataset.adsPanel!==target));
  if(target==='rotation') previewRotation();
  if(target==='ending') renderAdsEndingList();
}
function renderAdsOverviewGroups(){
  const host=document.querySelector('#adsOverviewGroups');
  if(!host)return;
  host.innerHTML=['featured','new','popular'].map(group=>{
    const rows=adsOpsRows.filter(b=>adsGroupOf(b)===group);
    return `<article class="ads-overview-group"><div class="panel-head"><div><h3>${adsGroupLabel(group)} 광고</h3><p class="muted">편성 ${rows.length}개 · 유료 운영 ${rows.filter(b=>adsStatusOf(b)==='active').length}개</p></div><button class="btn ghost ads-overview-edit" data-group="${group}" type="button">관리</button></div>${rows.length?`<div class="ads-overview-list">${rows.map(b=>`<div class="ads-overview-item"><b>${esc(b.name_ko||b.name_en||'')}</b><span>${esc([b.area,b.category_ko].filter(Boolean).join(' · '))}</span><small>${adsStatusLabel(adsStatusOf(b))} · 가중치 ${esc(b.paid_weight||1)} · ${b.rotation_enabled===false?'고정':'자동 로테이션'}</small></div>`).join('')}</div>`:'<p class="dashboard-empty">편성된 업체가 없습니다.</p>'}</article>`;
  }).join('');
  host.querySelectorAll('.ads-overview-edit').forEach(btn=>btn.onclick=()=>{
    const filter=document.querySelector('#adsGroupFilter'); if(filter)filter.value=btn.dataset.group;
    setAdsCenterTab('schedule'); renderAdsOpsList();
  });
}
function renderAdsEndingList(){
  const host=document.querySelector('#adsEndingList');
  if(!host)return;
  const now=new Date(`${todayKey()}T00:00:00`);
  const rows=adsOpsRows.filter(b=>b.paid_active&&b.paid_end_at).map(b=>{
    const end=new Date(`${String(b.paid_end_at).slice(0,10)}T00:00:00`);
    return {...b,_days:Math.round((end-now)/86400000)};
  }).filter(b=>b._days<=7).sort((a,b)=>a._days-b._days);
  host.innerHTML=rows.length?`<div class="ads-ending-list">${rows.map(b=>`<div class="ads-ending-item"><div><b>${esc(b.name_ko||b.name_en||'')}</b><span>${adsGroupLabel(adsGroupOf(b))} · ${esc(b.paid_product||'상품 없음')}</span></div><div><strong class="${b._days<0?'danger':b._days===0?'warning':''}">${b._days<0?`${Math.abs(b._days)}일 지남`:b._days===0?'오늘 종료':`${b._days}일 후 종료`}</strong><small>${esc(String(b.paid_end_at).slice(0,10))}</small></div><button class="btn ghost ads-ending-edit" data-id="${esc(b.id)}" type="button">편성 열기</button></div>`).join('')}</div>`:'<p class="dashboard-empty">7일 안에 종료되는 광고가 없습니다.</p>';
  host.querySelectorAll('.ads-ending-edit').forEach(btn=>btn.onclick=()=>{
    const q=document.querySelector('#adsSearch'); const row=adsOpsRows.find(b=>String(b.id)===String(btn.dataset.id));
    if(q&&row)q.value=row.name_ko||row.name_en||'';
    setAdsCenterTab('schedule'); renderAdsOpsList();
  });
}
function renderAdsSummary(){
  const active=adsOpsRows.filter(b=>adsStatusOf(b)==='active');
  const groups=['featured','new','popular'];
  const cards=groups.map(g=>{
    const rows=adsOpsRows.filter(b=>adsGroupOf(b)===g);
    const paidRows=rows.filter(b=>adsStatusOf(b)==='active');
    const names=rows.slice(0,5).map(b=>esc(b.name_ko||b.name_en||'')).join(' · ');
    return `<article class="card ads-summary-card"><span>${adsGroupLabel(g)} 광고</span><strong>${rows.length}</strong><small>${names||'편성된 업소 없음'}${rows.length?` · 유료 운영 ${paidRows.length}개`:''}</small><button class="ads-summary-filter" data-ads-group="${g}" type="button">목록 보기</button></article>`;
  }).join('');
  const paid=active.length, ending=active.filter(b=>b.paid_end_at&&String(b.paid_end_at).slice(0,10)<=todayKey()).length;
  document.querySelector('#adsOpsSummary').innerHTML=cards+`<article class="card ads-summary-card"><span>전체 유료 광고</span><strong>${paid}</strong><small>오늘 종료 ${ending}개</small><button class="ads-summary-filter" data-ads-group="all" type="button">전체 보기</button></article>`;
  document.querySelectorAll('.ads-summary-filter').forEach(btn=>btn.onclick=()=>{document.querySelector('#adsGroupFilter').value=btn.dataset.adsGroup;setAdsCenterTab('schedule');renderAdsOpsList();});
}
function readAdsInlinePayload(id){
  const tr=document.querySelector(`tr[data-ads-row-id="${CSS.escape(String(id))}"]`);
  if(!tr)return {error:'현재 화면에 표시되지 않은 업소입니다.'};
  const paid=tr.querySelector('.ads-inline-paid')?.checked||false;
  const product=tr.querySelector('.ads-inline-product')?.value||'none';
  const weight=Math.max(1,Number(tr.querySelector('.ads-inline-weight')?.value||1));
  const start=tr.querySelector('.ads-inline-start')?.value||null;
  const end=tr.querySelector('.ads-inline-end')?.value||null;
  const rotation=tr.querySelector('.ads-inline-rotation')?.checked||false;
  if(start&&end&&start>end)return {error:'종료일은 시작일보다 빠를 수 없습니다.'};
  return {payload:{
    paid_active:paid,
    paid_product:product==='none'?null:product,
    paid_weight:weight,
    paid_start_at:start,
    paid_end_at:end,
    rotation_enabled:rotation
  }};
}
async function saveAdsRowSettings(id){
  const row=adsOpsRows.find(b=>String(b.id)===String(id));
  if(!row||adsQuickSavingId)return;
  const result=readAdsInlinePayload(id);
  if(result.error){showAdsToast(result.error,true);return;}
  const payload=result.payload;
  adsQuickSavingId=String(id);renderAdsOpsList();
  const {error}=await supabase.from('businesses').update(payload).eq('id',id);
  adsQuickSavingId=null;
  if(error){renderAdsOpsList();showAdsToast(`광고 설정 저장 실패: ${error.message}`,true);return;}
  Object.assign(row,payload);
  renderAdsSummary();renderAdsOverviewGroups();renderAdsOpsList();renderAdsEndingList();
  const preview=document.querySelector('#rotationPreview');if(preview?.innerHTML)previewRotation();
  showAdsToast(`${row.name_ko||row.name_en||'업소'} 광고 설정을 저장했습니다.`);
}

let adsSelectedRowsSaving=false;
async function saveSelectedAdsRows(){
  if(adsSelectedRowsSaving)return;
  if(!adsSelectedIds.size){showAdsToast('저장할 업소를 먼저 체크하세요.',true);return;}
  const visibleIds=[...adsSelectedIds].filter(id=>document.querySelector(`tr[data-ads-row-id="${CSS.escape(String(id))}"]`));
  const hiddenCount=adsSelectedIds.size-visibleIds.length;
  if(!visibleIds.length){showAdsToast('현재 화면에 표시된 선택 업소가 없습니다.',true);return;}
  const jobs=[];
  for(const id of visibleIds){
    const result=readAdsInlinePayload(id);
    if(result.error){
      const row=adsOpsRows.find(b=>String(b.id)===String(id));
      showAdsToast(`${row?.name_ko||row?.name_en||'업소'}: ${result.error}`,true);
      return;
    }
    jobs.push({id,payload:result.payload});
  }
  const extra=hiddenCount?` (다른 필터에 숨겨진 ${hiddenCount}개는 제외)`:'';
  if(!confirm(`${jobs.length}개 업소의 현재 행 설정을 일괄 저장합니다.${extra}`))return;
  adsSelectedRowsSaving=true;
  const btn=document.querySelector('#adsSaveSelectedRowsBtn');
  if(btn){btn.disabled=true;btn.textContent='저장 중...';}
  const failed=[];
  let saved=0;
  for(const job of jobs){
    const {error}=await supabase.from('businesses').update(job.payload).eq('id',job.id);
    if(error){failed.push({id:job.id,message:error.message});continue;}
    const row=adsOpsRows.find(b=>String(b.id)===String(job.id));
    if(row)Object.assign(row,job.payload);
    saved++;
  }
  adsSelectedRowsSaving=false;
  if(btn){btn.disabled=false;btn.textContent='선택 행 일괄 저장';}
  renderAdsSummary();renderAdsOverviewGroups();renderAdsOpsList();renderAdsEndingList();
  const preview=document.querySelector('#rotationPreview');if(preview?.innerHTML)previewRotation();
  if(failed.length){showAdsToast(`${saved}개 저장, ${failed.length}개 실패: ${failed[0].message}`,true);return;}
  showAdsToast(`${saved}개 업소의 광고 설정을 일괄 저장했습니다.`);
}

function renderAdsOpsList(){
  const rows=adsFilteredRows();
  const host=document.querySelector('#adsOpsList');
  if(!host)return;
  host.innerHTML=`<div class="ads-status-legend"><b>광고 상태</b><span><i class="ads-status unpaid">일반</i> 유료 광고 꺼짐</span><span><i class="ads-status active">게시 중</i> 유료 광고 켜짐·기간 내</span><span><i class="ads-status scheduled">예약</i> 시작일 전</span><span><i class="ads-status expired">종료</i> 종료일 지남</span><span><i class="ads-status inactive">비활성</i> 업소 자체 비활성</span></div><div class="ads-list-caption"><b>${adsCategoryKey==='all'?'전체 업소':esc(adsCategoryKey)}</b><div class="ads-list-caption-actions"><span>${rows.length}개 표시</span><button id="adsSaveSelectedRowsBtn" class="btn primary" type="button" ${adsSelectedRowsSaving?'disabled':''}>${adsSelectedRowsSaving?'저장 중...':'선택 행 일괄 저장'}</button></div></div><div class="ads-table-wrap"><table class="request-table ads-table ads-inline-table"><thead><tr><th><input id="adsToggleAll" type="checkbox"></th><th>업소명</th><th>광고 그룹 바로 변경</th><th>유료</th><th>상품</th><th>가중치</th><th>시작일</th><th>종료일</th><th>로테이션</th><th>광고 상태</th><th>저장</th></tr></thead><tbody>${rows.map(b=>{const current=adsGroupOf(b),saving=adsQuickSavingId===String(b.id);return `<tr data-ads-row-id="${esc(b.id)}" class="${saving?'is-saving':''}"><td><input class="ads-row-check" type="checkbox" data-id="${esc(b.id)}" ${adsSelectedIds.has(String(b.id))?'checked':''}></td><td><b>${esc(b.name_ko||b.name_en||'')}</b><small>${esc([b.area,b.category_ko].filter(Boolean).join(' · '))}</small></td><td><div class="ads-group-switch" aria-label="광고 그룹 변경">${[['featured','추천'],['new','신규'],['popular','인기'],['none','해제']].map(([g,label])=>`<button type="button" class="ads-group-choice ${current===g?'active '+g:''}" data-id="${esc(b.id)}" data-group="${g}" ${saving?'disabled':''}>${saving&&current===g?'저장 중':label}</button>`).join('')}</div></td><td><label class="ads-inline-toggle"><input class="ads-inline-paid" type="checkbox" ${b.paid_active?'checked':''} ${saving?'disabled':''}><span>${b.paid_active?'ON':'OFF'}</span></label></td><td><select class="ads-inline-control ads-inline-product" ${saving?'disabled':''}><option value="none" ${!b.paid_product||b.paid_product==='none'?'selected':''}>없음</option><option value="basic" ${b.paid_product==='basic'?'selected':''}>Basic</option><option value="premium" ${b.paid_product==='premium'?'selected':''}>Premium</option></select></td><td><input class="ads-inline-control ads-inline-weight" type="number" min="1" value="${esc(b.paid_weight||1)}" ${saving?'disabled':''}></td><td><input class="ads-inline-control ads-inline-start" type="date" value="${esc(String(b.paid_start_at||'').slice(0,10))}" ${saving?'disabled':''}></td><td><input class="ads-inline-control ads-inline-end" type="date" value="${esc(String(b.paid_end_at||'').slice(0,10))}" ${saving?'disabled':''}></td><td><label class="ads-inline-toggle"><input class="ads-inline-rotation" type="checkbox" ${b.rotation_enabled===false?'':'checked'} ${saving?'disabled':''}><span>${b.rotation_enabled===false?'OFF':'ON'}</span></label></td><td><span class="ads-status ${adsStatusOf(b)}">${adsStatusLabel(adsStatusOf(b))}</span></td><td><button type="button" class="btn primary ads-row-save" data-id="${esc(b.id)}" ${saving?'disabled':''}>${saving?'저장 중':'저장'}</button></td></tr>`}).join('')}</tbody></table></div>`;
  host.querySelectorAll('.ads-row-check').forEach(ch=>ch.onchange=()=>{const id=String(ch.dataset.id);ch.checked?adsSelectedIds.add(id):adsSelectedIds.delete(id);updateAdsSelectedCount();});
  host.querySelectorAll('.ads-group-choice').forEach(btn=>btn.onclick=()=>setAdsGroupQuick(btn.dataset.id,btn.dataset.group));
  host.querySelectorAll('.ads-row-save').forEach(btn=>btn.onclick=()=>saveAdsRowSettings(btn.dataset.id));
  host.querySelector('#adsSaveSelectedRowsBtn')?.addEventListener('click',saveSelectedAdsRows);
  host.querySelectorAll('.ads-inline-paid,.ads-inline-rotation').forEach(ch=>ch.onchange=()=>{const span=ch.closest('label')?.querySelector('span');if(span)span.textContent=ch.checked?'ON':'OFF';});
  const all=host.querySelector('#adsToggleAll');if(all)all.onchange=()=>{rows.forEach(b=>all.checked?adsSelectedIds.add(String(b.id)):adsSelectedIds.delete(String(b.id)));renderAdsOpsList();updateAdsSelectedCount();};
  updateAdsSelectedCount();
}
function updateAdsSelectedCount(){safeText('adsSelectedCount',`${adsSelectedIds.size}개 선택`);}
async function loadAdsOps(){
  const {data,error}=await supabase.from('businesses').select('id,name_ko,name_en,area,category_ko,paid_active,paid_product,paid_weight,paid_start_at,paid_end_at,rotation_enabled,is_active,is_featured,featured_rank,is_new,new_rank,is_popular,popular_rank,created_at').eq('region',getAppRegion()).order('name_ko',{ascending:true});
  if(error)return alert(error.message);
  adsOpsRows=data||[];renderAdsSummary();renderAdsOverviewGroups();renderAdsCategoryChips();renderAdsOpsList();renderAdsEndingList();const preview=document.querySelector('#rotationPreview');if(preview)preview.innerHTML='';
}
async function applyAdsBulk(){
  if(!adsSelectedIds.size)return alert('변경할 업소를 선택하세요.');
  const group=document.querySelector('#adsBulkGroup').value;
  const paid=document.querySelector('#adsBulkPaid').value;
  const product=document.querySelector('#adsBulkProduct').value;
  const rotation=document.querySelector('#adsBulkRotation').value;
  const weight=document.querySelector('#adsBulkWeight').value;
  const start=document.querySelector('#adsBulkStart').value;
  const end=document.querySelector('#adsBulkEnd').value;
  const payload={};
  if(group!=='keep'){
    payload.is_featured=group==='featured';payload.is_new=group==='new';payload.is_popular=group==='popular';
  }
  if(paid!=='keep')payload.paid_active=paid==='on';
  if(product!=='keep')payload.paid_product=product==='none'?null:product;
  if(rotation!=='keep')payload.rotation_enabled=rotation==='on';
  if(weight!=='')payload.paid_weight=Math.max(1,Number(weight)||1);
  if(start)payload.paid_start_at=start;
  if(end)payload.paid_end_at=end;
  if(!Object.keys(payload).length)return alert('변경할 항목을 선택하세요.');
  if(!confirm(`${adsSelectedIds.size}개 업소의 광고 설정을 변경합니다. 계속할까요?`))return;
  const ids=[...adsSelectedIds];
  const {error}=await supabase.from('businesses').update(payload).in('id',ids);
  if(error)return alert(`일괄 변경 실패: ${error.message}`);
  adsSelectedIds.clear();await loadAdsOps();await loadBusinesses();alert('광고 편성이 변경되었습니다.');
}
async function previewRotation(){
  const dateValue=rotationDateValue();
  const sectionRows={
    featured:adsOpsRows.filter(b=>b.is_featured),
    new:adsOpsRows.filter(b=>b.is_new),
    popular:adsOpsRows.filter(b=>b.is_popular)
  };
  const render=(key)=>{
    const rows=pickRotation(sectionRows[key],key,6,dateValue);
    return `<article class="card ads-rotation-card"><div class="panel-head"><div><h3>${adsGroupLabel(key)}</h3><p class="muted">편성 ${sectionRows[key].length}개 · 해당일 노출 ${rows.length}개</p></div><span class="pill">${rows.length}개</span></div>${rows.length?`<ol class="ads-preview-list">${rows.map((b,i)=>`<li><span class="ads-order-no">${i+1}</span><div><b>${esc(b.name_ko||b.name_en||'')}</b><small>${b.rotation_enabled===false?'고정 순서':'자동 로테이션'} · 가중치 ${esc(b.paid_weight||1)} · ${b.paid_active?'유료':'일반 편성'}</small></div></li>`).join('')}</ol>`:'<p class="muted">이 날짜에 노출할 업체가 없습니다.</p>'}</article>`;
  };
  const host=document.querySelector('#rotationPreview');
  if(!host)return;
  host.innerHTML=`<div class="ads-preview-title"><div><h2>${esc(dateValue)} 로테이션</h2><p class="muted">선택 날짜 기준 · 그룹별 최대 6개</p></div><span class="pill success">홈 노출 기준</span></div>${render('featured')}${render('new')}${render('popular')}`;
}

function initAdsOpsCenter(){
  document.querySelector('#adsRefreshBtn')?.addEventListener('click',loadAdsOps);
  document.querySelector('#adsPreviewBtn')?.addEventListener('click',()=>{setAdsCenterTab('rotation');previewRotation();});
  document.querySelector('#adsPreviewBtnInline')?.addEventListener('click',previewRotation);
  const rotationDate=document.querySelector('#adsRotationDate');
  if(rotationDate && !rotationDate.value) rotationDate.value=todayKey();
  rotationDate?.addEventListener('change',previewRotation);
  document.querySelector('#adsRotationTodayBtn')?.addEventListener('click',()=>{if(rotationDate)rotationDate.value=todayKey();previewRotation();});
  document.querySelector('#adsRotationTomorrowBtn')?.addEventListener('click',()=>{const d=new Date();d.setDate(d.getDate()+1);if(rotationDate)rotationDate.value=d.toISOString().slice(0,10);previewRotation();});
  document.querySelectorAll('.ads-center-tab').forEach(btn=>btn.addEventListener('click',()=>setAdsCenterTab(btn.dataset.adsTab)));
  document.querySelectorAll('[data-open-ads-tab]').forEach(btn=>btn.addEventListener('click',()=>setAdsCenterTab(btn.dataset.openAdsTab)));
  document.querySelector('#adsBulkApplyBtn')?.addEventListener('click',applyAdsBulk);
  ['adsSearch','adsGroupFilter','adsStatusFilter'].forEach(id=>document.querySelector('#'+id)?.addEventListener(id==='adsSearch'?'input':'change',renderAdsOpsList));
  document.querySelector('#adsSelectVisibleBtn')?.addEventListener('click',()=>{adsFilteredRows().forEach(b=>adsSelectedIds.add(String(b.id)));renderAdsOpsList();});
  document.querySelector('#adsClearSelectionBtn')?.addEventListener('click',()=>{adsSelectedIds.clear();renderAdsOpsList();});
}
window.loadAdsOps=loadAdsOps;window.previewRotation=previewRotation;window.setAdsCenterTab=setAdsCenterTab;window.saveSelectedAdsRows=saveSelectedAdsRows;
document.addEventListener('DOMContentLoaded',initAdsOpsCenter);

async function uploadDescriptionImage(){
  const file = document.getElementById('descriptionImageFile')?.files?.[0];
  if(!file) return alert('이미지를 선택하세요.');

  const { bucket, path } = makeUploadPath(file, 'business-description');

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { upsert:false });

  if(error) return alert(error.message);

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);

  setVal('description_image_url', data.publicUrl);
  alert('소개 이미지가 업로드되었습니다.');
}

window.uploadDescriptionImage = uploadDescriptionImage;
// v26: legacy duplicate previewRotation removed; advertising center implementation above is canonical.

function renderPager(target, page, total, fnName){
  const totalPages = Math.ceil(total / REQUEST_PAGE_SIZE);
  const box = document.querySelector(target);
  if (!box) return;

  if (totalPages <= 1) {
    box.innerHTML = '';
    return;
  }

  let html = '';
  for (let i = 1; i <= totalPages; i++) {
    html += `<button type="button" class="${i === page ? 'active' : ''}" onclick="${fnName}(${i})">${i}</button>`;
  }

  box.innerHTML = html;
}


window.showRequestTab = showRequestTab;
async function approveBusinessRequest(id){

  const { data:req, error:reqError } = await supabase
    .from('business_requests')
    .select('*')
    .eq('id', id)
    .single();

  if(reqError) return alert(reqError.message);
  if(!req) return alert('신청 정보를 찾을 수 없습니다.');

  // 업소관리 화면으로 이동
  switchSection('business');

  // 기존 입력폼 초기화
  clearBusinessForm();

  // 신청내용 자동 입력
  setVal('name_ko', req.business_name || '');
  setVal('name_en', req.business_name || '');
  setVal('phone', req.phone || '');
  setVal('email', req.email || '');
  setVal('category_ko', req.category || '');
  setVal('address', req.address || '');
  setVal('website', req.website || '');
  setVal('description', req.message || '');

  // 기본값
  setVal('region', 'dallas');

  alert('업소관리로 불러왔습니다.\n이미지, Area, 영업시간 등을 입력한 후 저장하세요.');
}

window.loadAdRequests = loadAdRequests;
window.loadBusinessRequests = loadBusinessRequests;
window.approveBusinessRequest = approveBusinessRequest;

function showRequestTab(type){

    document.getElementById('businessRequestsArea').style.display =
        type==='business' ? 'block':'none';

    document.getElementById('adRequestsArea').style.display =
        type==='ad' ? 'block':'none';

    document.querySelectorAll('.request-tabs .tab')
        .forEach(btn=>btn.classList.remove('active'));

    if(type==='business'){
        document.querySelectorAll('.request-tabs .tab')[0]
            .classList.add('active');

        loadBusinessRequests();
    }else{
        document.querySelectorAll('.request-tabs .tab')[1]
            .classList.add('active');

        loadAdRequests();
    }
}

async function viewBusinessRequest(id){
  const { data:r, error } = await supabase
    .from('business_requests')
    .select('*')
    .eq('id', id)
    .single();

  if(error) return alert(error.message);

  alert(
`업소명: ${r.business_name || ''}
담당자: ${r.owner_name || ''}
전화: ${r.phone || ''}
이메일: ${r.email || ''}
업종: ${r.category || ''}
주소: ${r.address || ''}
웹사이트: ${r.website || ''}

내용:
${r.message || ''}`
  );
}

async function viewAdRequest(id){
  const { data:r, error } = await supabase
    .from('advertising_requests')
    .select('*')
    .eq('id', id)
    .single();

  if(error) return alert(error.message);

  alert(
`회사명: ${r.company_name || ''}
담당자: ${r.contact_name || ''}
전화: ${r.phone || ''}
이메일: ${r.email || ''}
광고종류: ${r.ad_type || ''}

내용:
${r.message || ''}`
  );
}

window.viewBusinessRequest = viewBusinessRequest;
window.viewAdRequest = viewAdRequest;
window.approveBusinessRequest = approveBusinessRequest;

let currentRequestRow = null;

async function openBusinessRequestModal(id){
  const { data:r, error } = await supabase
    .from('business_requests')
    .select('*')
    .eq('id', id)
    .single();

  if(error) return alert(error.message);

  currentRequestRow = r;

  setVal('requestType', 'business');
  setVal('requestId', r.id);
  setVal('requestName', r.business_name || '');
  setVal('requestContact', r.owner_name || '');
  setVal('requestPhone', r.phone || '');
  setVal('requestEmail', r.email || '');
  setVal('requestCategory', r.category || '');
  setVal('requestExtra', r.address || '');
  setVal('requestMessage', r.message || '');
  setVal('requestStatus', r.status || 'pending');

  document.getElementById('requestModalTitle').textContent = '업소 등록 신청';
  document.getElementById('requestModal').classList.remove('hidden');
}

async function openAdRequestModal(id){
  const { data:r, error } = await supabase
    .from('advertising_requests')
    .select('*')
    .eq('id', id)
    .single();

  if(error) return alert(error.message);

  currentRequestRow = r;

  setVal('requestType', 'ad');
  setVal('requestId', r.id);
  setVal('requestName', r.company_name || '');
  setVal('requestContact', r.contact_name || '');
  setVal('requestPhone', r.phone || '');
  setVal('requestEmail', r.email || '');
  setVal('requestCategory', r.ad_type || '');
  setVal('requestExtra', '');
  setVal('requestMessage', r.message || '');
  setVal('requestStatus', r.status || 'pending');

  document.getElementById('requestModalTitle').textContent = '광고 문의';
  document.getElementById('requestModal').classList.remove('hidden');
}

function closeRequestModal(){
  document.getElementById('requestModal').classList.add('hidden');
}

async function saveRequestEdit(){
  const type = val('requestType');
  const id = val('requestId');

  const table = type === 'business' ? 'business_requests' : 'advertising_requests';

  const payload = type === 'business'
    ? {
        business_name: val('requestName'),
        owner_name: val('requestContact'),
        phone: val('requestPhone'),
        email: val('requestEmail'),
        category: val('requestCategory'),
        address: val('requestExtra'),
        message: val('requestMessage'),
        status: val('requestStatus')
      }
    : {
        company_name: val('requestName'),
        contact_name: val('requestContact'),
        phone: val('requestPhone'),
        email: val('requestEmail'),
        ad_type: val('requestCategory'),
        message: val('requestMessage'),
        status: val('requestStatus')
      };

  const { error } = await supabase.from(table).update(payload).eq('id', id);
  if(error) return alert(error.message);

  alert('수정되었습니다.');
  closeRequestModal();

  type === 'business' ? loadBusinessRequests() : loadAdRequests();
}

async function approveCurrentRequest(){
  const type = val('requestType');
  const id = val('requestId');

  if(type === 'business'){
    await approveBusinessRequest(id);
    closeRequestModal();
  }else{
    const { error } = await supabase
      .from('advertising_requests')
      .update({ status:'completed' })
      .eq('id', id);

    if(error) return alert(error.message);

    alert('광고 문의가 처리 완료되었습니다.');
    closeRequestModal();
    loadAdRequests();
  }
}

async function deleteCurrentRequest(){
  if(!confirm('정말 삭제할까요?')) return;

  const type = val('requestType');
  const id = val('requestId');
  const table = type === 'business' ? 'business_requests' : 'advertising_requests';

  const { error } = await supabase.from(table).delete().eq('id', id);
  if(error) return alert(error.message);

  alert('삭제되었습니다.');
  closeRequestModal();

  type === 'business' ? loadBusinessRequests() : loadAdRequests();
}

window.openBusinessRequestModal = openBusinessRequestModal;
window.openAdRequestModal = openAdRequestModal;
window.closeRequestModal = closeRequestModal;
window.saveRequestEdit = saveRequestEdit;
window.approveCurrentRequest = approveCurrentRequest;
window.deleteCurrentRequest = deleteCurrentRequest;
/* ---------------------------
   Business
--------------------------- */
function updatePreview() {
  const image = val('image_url') || 'https://placehold.co/600x360?text=No+Image';
  if (qs('previewImage')) qs('previewImage').src = image;
  safeText('previewName', val('name_ko') || val('name_en') || '업소명');
  safeText('previewCategory', val('category_ko') || '카테고리');
  safeText('previewAddress', val('address') || '주소');
  safeText('previewWebsite', val('website') || '웹사이트 없음');
  safeText('previewEmail', val('email') || '이메일 없음');
  const lat = val('lat');
  const lng = val('lng');
  safeText('previewCoords', lat && lng ? `${lat}, ${lng}` : '좌표 없음');
}
function clearBusinessForm() {
  BUSINESS_FIELDS.forEach((id) => setVal(id, ''));
  BUSINESS_CHECKS.forEach((id) => setChecked(id, id === 'is_active'));
  setChecked('list_visible', true);
  setVal('region', 'dallas');
  if (qs('imageFile')) qs('imageFile').value = '';
  selectedId = null;
  setVal('map_category',''); setVal('subcategory',''); setVal('search_keywords',''); setVal('category_ko','');
  refreshSubcategoryOptions();
  safeText('formTitle', '새 업소 등록');
  $$('.business-row').forEach((el) => el.classList.remove('active'));
  updatePreview();
  renderGalleryList(null);
  fillBusinessHours({});
}
function fillBusinessForm(row) {
  BUSINESS_FIELDS.forEach((id) => setVal(id, row?.[id] ?? ''));
  BUSINESS_CHECKS.forEach((id) => setChecked(id, !!row?.[id]));
  setChecked('list_visible', row?.list_visible !== false);
  
  setVal('description_images', JSON.stringify(row.description_images || [], null, 2));
  
  if (qs('#imageFile')) qs('#imageFile').value = '';

  selectedId = row?.id ?? null;

  safeText(
    'formTitle',
    row?.id ? `업소 수정 #${row.id}` : '업소 정보'
  );

  // 기존 데이터는 category_ko에서 지도 대분류를 추정해 자동 호환합니다.
  const legacyCategory = String(row?.category_ko || row?.category || '').trim();
  setVal('map_category', row?.map_category || normalizeAdminMapCategory(legacyCategory));
  const savedSubcategory = row?.subcategory || row?.category_sub || legacyCategory;
  setVal('search_keywords', row?.search_keywords || '');
  refreshSubcategoryOptions(savedSubcategory);
  setVal('subcategory', savedSubcategory);
  syncLegacyCategoryField();

  updatePreview();
  renderGalleryList(row);
  fillBusinessHours(row?.business_hours);
}
const ADMIN_MAP_CATEGORIES = ['식당','쇼핑','병원','금융','법률','종교','서비스','부동산'];
const ADMIN_SUBCATEGORY_OPTIONS = {
  '식당':['한식','중식','일식','분식','치킨','BBQ','카페','베이커리','카페·베이커리','디저트','주점','기타 음식점'],
  '쇼핑':['마트','식품점','의류','화장품','안경','휴대폰','전자제품','꽃집','선물·잡화'],
  '병원':['내과','치과','소아과','산부인과','안과','피부과','정형외과','한의원','약국','재활·물리치료'],
  '금융':['은행','보험','회계사','세무사','투자·재정','대출·융자'],
  '법률':['이민법','사고·상해','가정법','형사법','부동산법','공증','종합 법률'],
  '종교':['교회','성당','사찰','선교단체','종교기관'],
  '서비스':['건강','건강기기','안마의자','미용실','네일','자동차정비','여행사','교육·학원','공공기관·관공서','사진·영상','세탁소','이사','청소','컴퓨터수리','인쇄','기타 서비스'],
  '부동산':['부동산 중개','모기지','타이틀','건축','인테리어','상업용 부동산','임대관리']
};
function normalizeAdminMapCategory(value=''){
  const s=String(value||'').toLowerCase();
  if(/식당|restaurant|bbq|치킨|분식|한식|중식|일식|카페|bakery|베이커리|cafe|coffee|디저트/.test(s))return '식당';
  if(/쇼핑|마트|마켓|잡화|수산|의류|전자|gift|store|market|shopping/.test(s))return '쇼핑';
  if(/병원|치과|한의원|약국|의원|clinic|medical|doctor|dental|pharmacy/.test(s))return '병원';
  if(/금융|은행|보험|회계|세무|finance|mortgage|loan|bank|investment|accounting|tax/.test(s))return '금융';
  if(/법률|변호사|법무|이민|law|lawyer|attorney|legal/.test(s))return '법률';
  if(/종교|교회|성당|사찰|절|church|catholic|mission|선교|temple/.test(s))return '종교';
  if(/부동산|리얼터|렌트|매매|realtor|real estate|lease|rental|property/.test(s))return '부동산';
  return '서비스';
}
function syncLegacyCategoryField(){
  const main=val('map_category').trim();
  const sub=val('subcategory').trim();
  setVal('category_ko',sub||main);
}
function refreshSubcategoryOptions(preferredValue=''){
  const host=qs('subcategory'); if(!host)return;
  const main=val('map_category');
  const defaults=ADMIN_SUBCATEGORY_OPTIONS[main]||[];
  const current=String(preferredValue || host.value || '').trim();
  host.disabled=!main;
  if(!main){
    host.innerHTML='<option value="">먼저 지도 대분류를 선택하세요</option>';
    return;
  }
  const values=[...defaults];
  // 과거 데이터의 상세 업종이 고정 목록에 없더라도 수정 중 값은 보존합니다.
  if(current && !values.includes(current)) values.push(current);
  host.innerHTML='<option value="">상세 업종 선택</option>'+values.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');
  if(current && values.includes(current)) host.value=current;
}
function businessCategoryOptions() {
  const cats = Array.from(new Set(
    (businesses || []).map((b) => String(b.category_ko || '').trim()).filter(Boolean)
  )).sort((a, b) => a.localeCompare(b, 'ko'));
  if (qs('categoryFilter')) {
    qs('categoryFilter').innerHTML =
      '<option value="all">전체</option>' +
      cats.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  }
  if (qs('categoryOptions')) {
    qs('categoryOptions').innerHTML =
      cats.map((c) => `<option value="${esc(c)}"></option>`).join('');
  }
}
function filterBusinesses() {
  const q = val('searchInput').trim().toLowerCase();
  const region = val('regionFilter') || 'all';
  const activeOnly = checked('activeOnly');
  const category = val('categoryFilter') || 'all';
  const quick = val('businessQuickFilter') || 'all';
  const eventIds = eventActiveBusinessIds();
  const slideIds = slideActiveBusinessIds();
  const couponIds = couponActiveBusinessIds();

  return businesses.filter((r) => {
    if (region !== 'all' && String(r.region || '') !== region) return false;
    if (activeOnly && !r.is_active) return false;
    if (category !== 'all' && String(r.category_ko || '') !== category) return false;
    if (quick === 'featured' && !r.is_featured) return false;
    if (quick === 'event' && !eventIds.has(String(r.id))) return false;
    if (quick === 'slide' && !slideIds.has(String(r.id))) return false;
    if (quick === 'coupon' && !couponIds.has(String(r.id))) return false;
    if (!q) return true;
    const hay = [r.name_ko, r.name_en, r.category_ko, r.map_category, r.subcategory, r.search_keywords, r.area, r.address, r.phone].join(' ').toLowerCase();
    return hay.includes(q);
  });
}
function bizCouponCount(businessId) {
  return (coupons || []).filter((c) => String(c.business_id || '') === String(businessId)).length;
}
function bizEventCount(businessId) {
  return (boards || []).filter((b) => String(b.business_id || b.linked_business_id || '') === String(businessId)).length;
}
function bizSlideCount(businessId) {
  return slides.some((s) => String(s.business_id || '') === String(businessId)) ? 1 : 0;
}
function businessBadges(row) {
  const badges = [];
  if (row.is_featured) badges.push('<span class="biz-badge">⭐ 추천</span>');
  if (row.paid_active && row.paid_product === 'premium') badges.push('<span class="biz-badge premium-badge">PREMIUM</span>');
  if (row.video_url) badges.push('<span class="biz-badge video-badge">▶ 영상</span>');
  if (row.list_visible === false) badges.push('<span class="biz-badge hidden-badge">목록 숨김</span>');
  const couponCount = bizCouponCount(row.id);
  if (couponCount) badges.push(`<span class="biz-badge muted-badge">🎟 쿠폰 ${couponCount}</span>`);
  const slideCount = bizSlideCount(row.id);
  if (slideCount) badges.push(`<span class="biz-badge warn-badge">🎬 슬라이드 ${slideCount}</span>`);
  const eventCount = bizEventCount(row.id);
  if (eventCount) badges.push(`<span class="biz-badge muted-badge">📢 이벤트 ${eventCount}</span>`);
  return badges.join('');
}
function openLinkedAdmin(section, businessId) {
  const row = businesses.find((b) => String(b.id) === String(businessId));
  if (!row) return;
  if (section === 'coupon') {
    switchSection('coupon');
    setVal('couponBusinessFilter', 'all');
    const existing = (coupons || []).find((c) => String(c.business_id || '') === String(businessId));
    if (existing) {
      fillCouponForm(existing);
    } else {
      clearCouponForm();
      setVal('coupon_business_id', businessId);
      safeText('couponFormTitle', `${row.name_ko || row.name_en || '업소'} 새 쿠폰`);
    }
    renderCouponList(filterCoupons());
    return;
  }
  if (section === 'slide') {
    switchSection('slide');
    fillSlideForm(row);
    renderSlideList(filterSlides());
    return;
  }
  if (section === 'board') {
    switchSection('board');
    const matches = (boards || []).filter((b) => String(b.business_id || b.linked_business_id || '') === String(businessId));
    if (matches.length) {
      fillBoardForm(matches[0]);
    } else {
      clearBoardForm();
      setVal('board_business_id', businessId);
      setVal('board_business_search', row.name_ko || row.name_en || '');
      renderBoardBusinessOptions();
      setVal('board_business_select', businessId);
      setVal('board_business_search', '');
	  setVal('board_image_link_url', '');
  setVal('board_gallery_urls', '');
  setVal('board_external_url', '');
  setVal('board_link_label', '');
  setVal('board_author_name', '');
      setVal('board_title', `${row.name_ko || row.name_en || ''} 이벤트`);
      safeText('boardFormTitle', `${row.name_ko || row.name_en || '업소'} 새 글`);
    }
    renderBoardList(filterBoards());
    return;
  }
}

async function loadBusinessStats() {
  if (!supabase) return;
  try {
    const { data, error } = await supabase
      .from('business_activity')
      .select('business_id, action_type, created_at')
      .order('created_at', { ascending: false })
      .limit(10000);
    if (error) {
      console.warn('통계 조회 실패', error);
      businessStatsMap = {};
      return;
    }
    const map = {};
    (data || []).forEach((row) => {
      const key = String(row.business_id || '');
      if (!key) return;
      if (!map[key]) map[key] = { views: 0, calls: 0, directions: 0, coupons: 0, slideClicks: 0 };
      const stat = map[key];
      const action = String(row.action_type || '').toLowerCase();
      if (action === 'view') stat.views += 1;
      else if (action === 'call') stat.calls += 1;
      else if (action === 'direction') stat.directions += 1;
      else if (action === 'coupon_use') stat.coupons += 1;
      else if (action === 'slide_click') stat.slideClicks += 1;
    });
    businessStatsMap = map;
  } catch (e) {
    console.warn('통계 집계 실패', e);
    businessStatsMap = {};
  }
}
function businessStatLine(row) {
  const stat = businessStatsMap[String(row.id)] || { views: 0, calls: 0, directions: 0, coupons: 0, slideClicks: 0 };
  return `<div class="biz-stats" style="margin-top:4px;font-size:12px;color:#64748b;">조회 ${stat.views || 0} | 전화 ${stat.calls || 0} | 길찾기 ${stat.directions || 0} | 쿠폰 ${stat.coupons || 0}</div>`;
}

function renderBusinessList(items) {
  safeText('countText', `${items.length}개`);
  const listEl = qs('businessList');
  if (!listEl) return;
  listEl.innerHTML = items.map((row) => `
    <div class="biz-item business-row business-hub ${row.id === selectedId ? 'active' : ''}" data-id="${esc(row.id)}">
      <img class="biz-thumb" src="${esc(row.image_url || 'https://placehold.co/120x120?text=No+Image')}" alt="thumb" />
      <div class="biz-main">
        <div class="biz-title">${esc(row.name_ko || row.name_en || `ID ${row.id}`)}</div>
        <div class="biz-meta">${esc([row.subcategory || row.category_ko || row.map_category, row.area, row.phone].filter(Boolean).join(' · '))}</div>
        <div class="biz-meta">${esc(row.address || '')}</div>
        <div class="biz-statuses">${businessBadges(row)}</div>
        ${businessStatLine(row)}
        <div class="biz-actions">
          <button type="button" class="biz-action-btn primary-link biz-edit-btn" data-id="${esc(row.id)}">수정</button>
          <button type="button" class="biz-action-btn biz-link-btn" data-section="coupon" data-id="${esc(row.id)}">쿠폰</button>
          <button type="button" class="biz-action-btn biz-link-btn" data-section="slide" data-id="${esc(row.id)}">슬라이드</button>
          <button type="button" class="biz-action-btn biz-link-btn" data-section="board" data-id="${esc(row.id)}">이벤트</button>
        </div>
      </div>
    </div>
  `).join('');

  listEl.querySelectorAll('.biz-edit-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const row = businesses.find((b) => String(b.id) === String(btn.dataset.id));
      if (row) {
        fillBusinessForm(row);
        renderBusinessList(filterBusinesses());
      }
    });
  });
  listEl.querySelectorAll('.biz-link-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openLinkedAdmin(btn.dataset.section, btn.dataset.id);
    });
  });
  listEl.querySelectorAll('.business-row').forEach((btn) => {
    btn.addEventListener('click', () => {
      const row = businesses.find((b) => String(b.id) === String(btn.dataset.id));
      if (row) {
        fillBusinessForm(row);
        renderBusinessList(filterBusinesses());
      }
    });
  });
}

function collectBusinessPayload() {
  const p = {};

  [
    'name_ko',
    'name_en',
    'category_ko',
    'map_category',
    'subcategory',
    'search_keywords',
    'area',
    'phone',
    'website',
    'email',
    'address',
    'description',
    'hours',
    'parking',
    'reservation',
    'reservation_url',
    'languages',
    'google_maps_url',
    'google_maps_url',
    'insurance',
    'image_url',
    'video_url',
    'promo_text',
    'promo_image_url',
    'paid_product',
    'paid_start_at',
    'paid_end_at'
  ].forEach((id) => {
    p[id] = val(id).trim() ? val(id).trim() : null;
  });

[
  'lat',
  'lng',
  'rating',
  'review_count',
  'paid_weight',
  'featured_rank',
  'new_rank',
  'popular_rank'
].forEach((id) => {
  const raw = val(id);
  p[id] = raw === '' ? null : Number(raw);
});

const homeFixedSortRaw = val('home_fixed_sort');
p.home_fixed_sort = homeFixedSortRaw === '' ? 1000 : Number(homeFixedSortRaw);

  p.is_active = checked('is_active');
  p.list_visible = checked('list_visible');
  p.is_featured = checked('is_featured');
  p.is_new = checked('is_new');
  p.is_popular = checked('is_popular');
  p.promo_enabled = checked('promo_enabled');
  p.home_fixed = checked('home_fixed');

  p.paid_active = checked('paid_active');
  p.rotation_enabled = checked('rotation_enabled');
  p.business_hours = collectBusinessHours();
  p.reservation_enabled = checked('reservation_enabled');
  p.region = getAppRegion();
try {
    p.description_images = val('description_images')
        ? JSON.parse(val('description_images'))
        : [];
} catch(e){
    p.description_images = [];
}
  return p;
}

async function loadBusinesses() {
  if (!supabase) return;
  setStatus('업소 불러오는 중');
  const { data, error } = await supabase
    .from('businesses')
    .select('*')
    .eq('region', getAppRegion())
    .order('id', { ascending: false })
    .limit(2000);
  if (error) {
    setStatus('업소 조회 실패');
    alert(`업소 조회 실패: ${error.message}`);
    return;
  }
  businesses = data || [];
  window.KFocusAdminBridge = window.KFocusAdminBridge || {};
  window.KFocusAdminBridge.getBusinesses = () => [...businesses];
  window.KFocusAdminBridge.getRegion = () => getAppRegion();
  window.KFocusAdminBridge.switchSection = switchSection;
  window.KFocusAdminBridge.uploadGeneratedImage = async (blob, filename = 'ai-generated.png') => {
    if (!supabase) throw new Error('Supabase가 아직 연결되지 않았습니다.');
    if (!(blob instanceof Blob)) throw new Error('업로드할 이미지 데이터가 없습니다.');
    const safeName = String(filename).replace(/[^a-zA-Z0-9._-]/g, '-');
    const path = `ai-campaigns/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
    const { error } = await supabase.storage.from('public-images').upload(path, blob, {
      upsert: false,
      contentType: blob.type || 'image/png',
      cacheControl: '31536000'
    });
    if (error) throw error;
    const { data } = supabase.storage.from('public-images').getPublicUrl(path);
    if (!data?.publicUrl) throw new Error('업로드 URL을 만들지 못했습니다.');
    return data.publicUrl;
  };
  window.dispatchEvent(new CustomEvent('kfocus:businesses-loaded', { detail: [...businesses] }));
  businessCategoryOptions();
  renderBusinessList(filterBusinesses());
  fillBusinessOptions();
  renderSlideBusinessOptions();
  renderSlideList(filterSlides());
  setStatus('연결됨');
}
async function saveBusiness() {
  const payload = collectBusinessPayload();
  
  console.log(payload.business_hours);
  if (!payload.name_ko && !payload.name_en) return alert('업소명을 입력하세요.');
  if (!payload.map_category) return alert('지도 대분류를 선택해 주세요.');
  if (!payload.subcategory) return alert('상세 업종을 선택해 주세요.');
  // 기존 화면/연동 호환용 category_ko에는 상세 업종을 우선 저장합니다.
  payload.category_ko = payload.subcategory || payload.map_category;

  let res;
  if (selectedId) {
    res = await supabase.from('businesses').update(payload).eq('id', selectedId).select().single();
  } else {
    res = await supabase.from('businesses').insert(payload).select().single();
  }
  if (res.error) return alert(`저장 실패: ${res.error.message}`);

  await loadBusinesses();
  if (res.data) fillBusinessForm(res.data);
  alert('업소 저장 완료');
  console.log('save reservation_enabled', payload.reservation_enabled);
}

async function uploadDescriptionImages(){
  if (!selectedId) return alert('먼저 업소를 선택하세요.');

  const files = Array.from(document.getElementById('descriptionImagesFile')?.files || []);
  if (!files.length) return alert('이미지를 선택하세요.');

  const biz = businesses.find(b => String(b.id) === String(selectedId));
  if (!biz) return alert('선택된 업소를 찾을 수 없습니다.');

  const urls = [];

  for (const file of files) {
    const { bucket, path } = makeUploadPath(file, `business-description/${selectedId}`);

    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, file, { upsert: false });

    if (error) {
      alert(error.message);
      continue;
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    urls.push(data.publicUrl);
  }

  const current = val('description_images');
  let old = [];
  try { old = current ? JSON.parse(current) : []; } catch(e) { old = []; }

  const merged = [...old, ...urls];
  setVal('description_images', JSON.stringify(merged, null, 2));

  const { error } = await supabase
    .from('businesses')
    .update({ description_images: merged })
    .eq('id', selectedId);

  if (error) return alert(`이미지 저장 실패: ${error.message}`);

await loadBusinesses();

const updated = businesses.find(b => String(b.id) === String(selectedId));
if (updated) {
  fillBusinessForm(updated);
  renderGalleryList(updated);
}

alert('소개 이미지가 업로드/저장되었습니다.');
}

window.uploadDescriptionImages = uploadDescriptionImages;
async function deleteBusiness() {
  if (!selectedId) return;
  if (!confirm('이 업소를 삭제할까요?')) return;
  const { error } = await supabase.from('businesses').delete().eq('id', selectedId);
  if (error) return alert(`삭제 실패: ${error.message}`);
  clearBusinessForm();
  await loadBusinesses();
  alert('업소 삭제 완료');
}
async function fetchGoogleRating(){
  const name = val('name_en') || val('name_ko');
  const address = val('address');
  const google_maps_url = val('google_maps_url');

  if(!name && !address){
    return alert('업소명 또는 주소가 필요합니다.');
  }

  const res = await fetch('/.netlify/functions/google-place-rating', {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify({ name, address, google_maps_url })
  });

  const data = await res.json();
  if(!res.ok) return alert(`Google 평점 조회 실패: ${data.error}`);

  setVal('google_maps_url', data.google_maps_url || google_maps_url);
  setVal('rating', data.rating || '');
  setVal('review_count', data.review_count || 0);

  alert(`Google 평점 확인: ${data.rating || '없음'} / 리뷰 ${data.review_count || 0}개`);
}
async function geocodeAddress() {
  const address = val('address').trim();
  if (!address) return alert('주소를 먼저 입력하세요.');
  if (!cfg.GOOGLE_MAPS_API_KEY) return alert('config.js에 GOOGLE_MAPS_API_KEY를 넣어 주세요.');

  const btn = qs('geocodeBtn');
  if (btn) { btn.disabled = true; btn.textContent = '좌표 생성 중'; }

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${encodeURIComponent(cfg.GOOGLE_MAPS_API_KEY)}`;
    const res = await fetch(url);
    const json = await res.json();
    if (json.status !== 'OK' || !json.results?.length) throw new Error(json.error_message || json.status || 'geocoding 실패');
    const loc = json.results[0].geometry.location;
    setVal('lat', loc.lat);
    setVal('lng', loc.lng);
    updatePreview();
    alert('좌표가 입력되었습니다. 저장 버튼을 눌러 반영하세요.');
  } catch (e) {
    alert(`좌표 생성 실패: ${e.message}`);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '주소→좌표'; }
  }
}
async function bulkGeocodeMissing() {
  const targets = filterBusinesses().filter((row) => row.address && (row.lat == null || row.lng == null));
  if (!targets.length) return alert('좌표가 비어 있는 업소가 없습니다.');
  if (!confirm(`좌표 없는 업소 ${targets.length}개를 일괄 생성할까요?`)) return;

  const btn = qs('bulkGeocodeBtn');
  const old = btn?.textContent || '';
  if (btn) btn.disabled = true;

  let ok = 0;
  let fail = 0;

  try {
    for (const row of targets) {
      if (btn) btn.textContent = `좌표 생성 ${ok + fail + 1}/${targets.length}`;
      try {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(row.address)}&key=${encodeURIComponent(cfg.GOOGLE_MAPS_API_KEY)}`;
        const res = await fetch(url);
        const json = await res.json();
        if (json.status !== 'OK' || !json.results?.length) throw new Error(json.status || '실패');
        const loc = json.results[0].geometry.location;
        const { error } = await supabase.from('businesses').update({ lat: loc.lat, lng: loc.lng }).eq('id', row.id);
        if (error) throw error;
        ok++;
      } catch {
        fail++;
      }
      await new Promise((r) => setTimeout(r, 120));
    }
    await loadBusinesses();
    alert(`좌표 생성 완료: 성공 ${ok} / 실패 ${fail}`);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = old;
    }
  }
}
async function uploadImage() {
  const file = qs('imageFile')?.files?.[0];
  if (!file) return alert('업로드할 이미지를 선택하세요.');

  const btn = qs('uploadImageBtn');
  if (btn) { btn.disabled = true; btn.textContent = '업로드 중'; }

  try {
    const publicUrl = await uploadFileToStorage(file, 'businesses');
    if (!publicUrl) throw new Error('공개 URL 생성 실패');
    setVal('image_url', publicUrl);
    updatePreview();
    alert('이미지 업로드 완료. 저장 버튼을 눌러 DB에 반영하세요.');
  } catch (e) {
    alert(`이미지 업로드 실패: ${e.message}`);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '이미지 업로드'; }
  }
}
function parseBoardGalleryUrls(value){
  if(Array.isArray(value)) return value.map(v=>String(v||'').trim()).filter(Boolean);
  const raw=String(value||'').trim();
  if(!raw) return [];
  try{const p=JSON.parse(raw);if(Array.isArray(p)) return p.map(v=>String(v||'').trim()).filter(Boolean);}catch(_){ }
  return raw.split(/\r?\n|,/).map(v=>v.trim()).filter(Boolean);
}
function getBoardGalleryUrlsFromForm(){return parseBoardGalleryUrls(val('board_gallery_urls'));}
function setBoardGalleryUrlsToForm(urls){const clean=[...new Set(parseBoardGalleryUrls(urls))];setVal('board_gallery_urls',clean.join('\n'));renderBoardGalleryPreview(clean);}
function renderBoardGalleryPreview(urls=null){
  const wrap=qs('boardGalleryPreview'); if(!wrap) return;
  const rows=urls===null?getBoardGalleryUrlsFromForm():parseBoardGalleryUrls(urls);
  if(!rows.length){wrap.innerHTML='<div class="tiny muted">추가 이미지가 없습니다.</div>';return;}
  wrap.innerHTML=rows.map((url,index)=>`<div class="board-gallery-admin-item"><img src="${esc(url)}" alt="추가 이미지 ${index+1}"><div class="board-gallery-admin-copy"><strong>이미지 ${index+1}</strong><span>${esc(url)}</span></div><button type="button" class="btn danger board-gallery-remove" data-gallery-index="${index}">삭제</button></div>`).join('');
}
async function uploadBoardGalleryImages(){
  const files=Array.from(qs('board_gallery_files')?.files||[]); if(!files.length) return alert('추가할 이미지를 여러 장 선택해 주세요.');
  const btn=qs('boardUploadGalleryBtn'); const old=btn?.textContent||'추가 이미지 업로드'; if(btn){btn.disabled=true;btn.textContent=`업로드 중 0/${files.length}`;}
  const existing=getBoardGalleryUrlsFromForm(), uploaded=[], failed=[];
  try{
    for(let i=0;i<files.length;i++){
      if(btn) btn.textContent=`업로드 중 ${i+1}/${files.length}`;
      try{const url=await uploadFileToStorage(files[i],'boards/gallery'); if(url) uploaded.push(url); else failed.push(files[i].name);}catch(e){failed.push(files[i].name);}
    }
    setBoardGalleryUrlsToForm([...new Set([...existing,...uploaded])]);
    if(qs('board_gallery_files')) qs('board_gallery_files').value='';
    alert(failed.length?`업로드 ${uploaded.length}장 / 실패 ${failed.length}장\n${failed.join('\n')}`:`${uploaded.length}장 업로드 완료. 게시글 저장 버튼을 눌러 주세요.`);
  }finally{if(btn){btn.disabled=false;btn.textContent=old;}}
}
function clearBoardGalleryImages(){if(!confirm('추가 이미지 목록을 모두 지울까요?')) return;setBoardGalleryUrlsToForm([]);if(qs('board_gallery_files')) qs('board_gallery_files').value='';}
function removeBoardGalleryImage(index){const urls=getBoardGalleryUrlsFromForm();if(index<0||index>=urls.length)return;urls.splice(index,1);setBoardGalleryUrlsToForm(urls);}
function bindBoardGalleryEvents(){
  on('boardUploadGalleryBtn','click',uploadBoardGalleryImages);
  on('boardClearGalleryBtn','click',clearBoardGalleryImages);
  qs('board_gallery_urls')?.addEventListener('input',()=>renderBoardGalleryPreview());
  qs('boardGalleryPreview')?.addEventListener('click',e=>{const b=e.target.closest('[data-gallery-index]');if(b)removeBoardGalleryImage(Number(b.dataset.galleryIndex));});
}
/* saveBoard() payloadBase에 gallery_urls: getBoardGalleryUrlsFromForm(), 추가 */
/* clearBoardForm()에 setVal('board_gallery_urls',''); renderBoardGalleryPreview([]); 추가 */
/* fillBoardForm(row)에 setBoardGalleryUrlsToForm(row.gallery_urls||[]); 추가 */
/* loadBoards() 매핑에 gallery_urls: parseBoardGalleryUrls(row.gallery_urls), 추가 */
/* 기존 bindEvents() 마지막에 bindBoardGalleryEvents(); 1회 호출 */

async function uploadBoardImage() {
  const file = qs('board_image_file')?.files?.[0];
  if (!file) return alert('게시판 이미지를 선택하세요.');

  try {
    const publicUrl = await uploadFileToStorage(file, 'boards');
    setVal('board_image_url', publicUrl || '');
    updateBoardImagePreview();
    if (qs('board_image_file')) qs('board_image_file').value = '';
    safeText('boardImageStatus','✅ 직접 업로드 완료 · 게시글 저장 버튼을 눌러 주세요.');
    alert('게시판 이미지 업로드 완료');
  } catch (e) {
    alert(`게시판 이미지 업로드 실패: ${e.message}`);
  }
}
function collectBusinessHours() {
  return {
    mon: {
      open1: val('mon_open1'),
      close1: val('mon_close1'),
      open2: val('mon_open2'),
      close2: val('mon_close2'),
      closed: checked('mon_closed')
    },
    tue: {
      open1: val('tue_open1'),
      close1: val('tue_close1'),
      open2: val('tue_open2'),
      close2: val('tue_close2'),
      closed: checked('tue_closed')
    },
    wed: {
      open1: val('wed_open1'),
      close1: val('wed_close1'),
      open2: val('wed_open2'),
      close2: val('wed_close2'),
      closed: checked('wed_closed')
    },
    thu: {
      open1: val('thu_open1'),
      close1: val('thu_close1'),
      open2: val('thu_open2'),
      close2: val('thu_close2'),
      closed: checked('thu_closed')
    },
    fri: {
      open1: val('fri_open1'),
      close1: val('fri_close1'),
      open2: val('fri_open2'),
      close2: val('fri_close2'),
      closed: checked('fri_closed')
    },
    sat: {
      open1: val('sat_open1'),
      close1: val('sat_close1'),
      open2: val('sat_open2'),
      close2: val('sat_close2'),
      closed: checked('sat_closed')
    },
    sun: {
      open1: val('sun_open1'),
      close1: val('sun_close1'),
      open2: val('sun_open2'),
      close2: val('sun_close2'),
      closed: checked('sun_closed')
    }
  };
}

function collectDayHours(day) {
  return {
    open1: val(`${day}_open1`),
    close1: val(`${day}_close1`),
    open2: val(`${day}_open2`),
    close2: val(`${day}_close2`),
    closed: checked(`${day}_closed`)
  };
}
function clearBoardImage() {
  setVal('board_image_url', '');
  setVal('board_business_id', '');
  setVal('board_business_search', '');
  renderBoardBusinessOptions();
  if (qs('board_image_file')) qs('board_image_file').value = '';
}
function openMapSearch() {
  const address = val('address').trim();
  if (!address) return alert('주소를 먼저 입력하세요.');
  window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`, '_blank');
}
function eventActiveBusinessIds() {
  const now = Date.now();
  const ids = new Set();
  (boards || []).forEach((row) => {
    const bid = row.business_id || row.linked_business_id || null;
    if (!bid) return;
    const active = row.is_active !== false;
    const startOk = !row.start_at || new Date(row.start_at).getTime() <= now;
    const endOk = !row.end_at || new Date(row.end_at).getTime() >= now;
    if (active && startOk && endOk) ids.add(String(bid));
  });
  return ids;
}
function slideActiveBusinessIds() {
  const ids = new Set();
  (slides || []).forEach((row) => {
    if (row?.business_id) ids.add(String(row.business_id));
  });
  return ids;
}
function couponActiveBusinessIds() {
  const ids = new Set();
  (coupons || []).forEach((row) => {
    if (row?.business_id) ids.add(String(row.business_id));
  });
  return ids;
}
function getScopedBusinesses() {
  const region = currentRegionScope();
  return businesses.filter((b) => region === 'all' || String(b.region || 'colorado') === region);
}
function renderBoardBusinessOptions() {
  const selectEl = qs('board_business_select');
  if (!selectEl) return;
  const q = val('board_business_search').trim().toLowerCase();
  const scoped = getScopedBusinesses();
  const filtered = scoped.filter((b) => {
    if (!q) return true;
    const hay = [b.name_ko, b.name_en, b.phone, b.address, b.area, b.category_ko].join(' ').toLowerCase();
    return hay.includes(q);
  }).sort((a,b)=> String(a.name_ko||a.name_en||'').localeCompare(String(b.name_ko||b.name_en||''), 'ko'));
  const rows = filtered.slice(0, 100);
  const current = val('board_business_id') || val('board_business_select');
  selectEl.innerHTML = '<option value="">업소 연결 안 함</option>' + rows.map((b)=>`<option value="${esc(b.id)}">${esc(b.name_ko || b.name_en || b.id)}${b.phone ? ' · ' + esc(b.phone) : ''}</option>`).join('');
  if (current && !rows.some((b)=>String(b.id)===String(current))) {
    const row = businesses.find((b)=>String(b.id)===String(current));
    if (row) selectEl.innerHTML += `<option value="${esc(row.id)}">${esc(row.name_ko || row.name_en || row.id)}${row.phone ? ' · ' + esc(row.phone) : ''}</option>`;
  }
  setVal('board_business_select', current || '');
}
function fillBusinessOptions() {
  const scoped = getScopedBusinesses();
  const couponSelected = val('coupon_business_id');
  const couponFilterSelected = val('couponBusinessFilter') || 'all';
  const options =
    '<option value="">업소 선택</option>' +
    scoped.map((b) => `<option value="${esc(b.id)}">${esc(b.name_ko || b.name_en || b.id)}</option>`).join('');

  if (qs('coupon_business_id')) {
    qs('coupon_business_id').innerHTML = options;
    setVal('coupon_business_id', couponSelected);
    if(!qs('coupon_business_id').dataset.businessIds) setMultiBusinessIds('coupon_business_id', couponSelected?[couponSelected]:[]);
    renderBusinessMultiPicker('coupon_business_id');
  }
  if (qs('couponBusinessFilter')) {
    qs('couponBusinessFilter').innerHTML =
      '<option value="all">전체</option>' +
      scoped.map((b) => `<option value="${esc(b.id)}">${esc(b.name_ko || b.name_en || b.id)}</option>`).join('');
    setVal('couponBusinessFilter', couponFilterSelected);
  }
  renderBoardBusinessOptions();
}

/* ---------------------------
   Coupons
--------------------------- */
function clearCouponForm() {
  ['coupon_id', 'coupon_title', 'coupon_code',  'coupon_use_link_url', 'coupon_notify_emails', 'coupon_notify_phones', 'coupon_discount_label', 'coupon_description', 'coupon_image_url', 'coupon_start_at', 'coupon_end_at', 'coupon_sort_order'].forEach((id) => setVal(id, ''));
  setVal('coupon_business_id', '');setMultiBusinessIds('coupon_business_id', []);
  setChecked('coupon_is_active', true);
  setChecked('coupon_is_today', false);
  selectedCouponId = null;
  safeText('couponFormTitle', '새 쿠폰');
  $$('.coupon-row').forEach((el) => el.classList.remove('active'));
}
function fillCouponForm(row) {
  setVal('coupon_id', row.id || '');
  setVal('coupon_business_id', row.business_id || '');setMultiBusinessIds('coupon_business_id', normalizeLinkedBusinessIds(row));renderBusinessMultiPicker('coupon_business_id');
  setVal('coupon_title', row.title || '');
  setVal('coupon_code', row.coupon_code || '');
  setVal('coupon_use_link_url', row.use_link_url || '');
  setVal('coupon_notify_emails', row.notify_emails || '');
  setVal('coupon_notify_phones', row.notify_phones || '');
  setVal('coupon_discount_label', row.discount_label || '');
  setVal('coupon_description', row.description || '');
  setVal('coupon_image_url', row.image_url || '');
  setVal('coupon_start_at', fmtLocal(row.start_at));
  setVal('coupon_end_at', fmtLocal(row.end_at));
  setChecked('coupon_is_active', row.is_active !== false);
  setChecked('coupon_is_today', !!row.is_today_coupon);
  setVal('coupon_sort_order', row.sort_order ?? 1000);
  selectedCouponId = row.id;
  safeText('couponFormTitle', `쿠폰 수정 #${row.id}`);
}
function filterCoupons() {
  const q = val('couponSearchInput').trim().toLowerCase();
  const bizId = val('couponBusinessFilter') || 'all';
  const region = currentRegionScope();

  return coupons.filter((c) => {
    const biz = businesses.find((b) => String(b.id) === String(c.business_id));

    if (bizId !== 'all' && String(c.business_id) !== String(bizId)) {
      return false;
    }

    if (region !== 'all') {
      const bizRegion = String(biz?.region || 'dallas').toLowerCase();
      if (bizRegion !== region) return false;
    }

    if (!q) return true;

    const hay = [
      c.title,
      c.description,
      c.coupon_code,
      c.discount_label,
      biz?.name_ko,
      biz?.name_en,
      biz?.name
    ].join(' ').toLowerCase();

    return hay.includes(q);
  });
}
function renderCouponList(items) {
  safeText('couponCountText', `${items.length}개`);
  const listEl = qs('couponList');
  if (!listEl) return;

  listEl.innerHTML = items.map((row) => {
    const biz = businesses.find((b) => String(b.id) === String(row.business_id));
    return `
      <button type="button" class="biz-item coupon-row ${row.id === selectedCouponId ? 'active' : ''}" data-id="${esc(row.id)}">
        <img class="biz-thumb" src="${esc(row.image_url || biz?.image_url || 'https://placehold.co/120x120?text=Coupon')}" alt="thumb" />
        <div>
          <div class="biz-title">${esc(row.title || '쿠폰')}</div>
          <div class="biz-meta">${esc(biz?.name_ko || biz?.name_en || '')}</div>
          <div class="biz-meta">${esc(row.coupon_code || '')} ${row.is_active === false ? ' · 비활성' : ''}</div>
        </div>
      </button>
    `;
  }).join('');

  listEl.querySelectorAll('.coupon-row').forEach((btn) => {
    btn.addEventListener('click', () => {
      const row = coupons.find((c) => String(c.id) === String(btn.dataset.id));
      if (row) {
        fillCouponForm(row);
        renderCouponList(filterCoupons());
      }
    });
  });
}
async function loadCoupons() {
  if (!supabase) return;
  const { data, error } = await supabase.from('coupons').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: false });
  if (error) {
    console.warn(error);
    safeText('couponCountText', '오류');
    return;
  }
  coupons = data || [];
  window.KFocusAdminBridge = window.KFocusAdminBridge || {};
  window.KFocusAdminBridge.getCoupons = () => [...coupons];
  window.dispatchEvent(new CustomEvent('kfocus:coupons-loaded', {detail:[...coupons]}));
  renderCouponList(filterCoupons());
  renderDalpickHomeExposure();
  renderBusinessList(filterBusinesses());
}
function collectCouponPayload() {
  return {
    business_ids: getMultiBusinessIds('coupon_business_id'),
    business_id: getMultiBusinessIds('coupon_business_id')[0] || null,
    title: val('coupon_title').trim() || null,
    coupon_code: val('coupon_code').trim() || null,
	discount_label: val('coupon_discount_label').trim() || null,
    description: val('coupon_description').trim() || null,
    image_url: val('coupon_image_url').trim() || null,
    start_at: fromLocal(val('coupon_start_at')),
    end_at: fromLocal(val('coupon_end_at')),
    is_active: checked('coupon_is_active'),
    is_today_coupon: checked('coupon_is_today'),
    sort_order: Number(val('coupon_sort_order') || 1000),
	use_link_url: val('coupon_use_link_url').trim() || null,
	notify_emails: val('coupon_notify_emails').trim() || null,
    notify_phones: val('coupon_notify_phones').trim() || null,
  };
}
async function saveCoupon() {
  const p = collectCouponPayload();
  if (!p.business_ids.length || !p.title) return alert('연결 업소와 쿠폰 제목을 입력하세요.');

  let res;
  if (selectedCouponId) {
    res = await supabase.from('coupons').update(p).eq('id', selectedCouponId).select().single();
  } else {
    res = await supabase.from('coupons').insert(p).select().single();
  }
  if (res.error) return alert(`쿠폰 저장 실패: ${res.error.message}`);

  await loadCoupons();
  if (res.data) fillCouponForm(res.data);
  alert('쿠폰 저장 완료');
}
async function deleteCoupon() {
  if (!selectedCouponId) return;
  if (!confirm('이 쿠폰을 삭제할까요?')) return;
  const { error } = await supabase.from('coupons').delete().eq('id', selectedCouponId);
  if (error) return alert(`쿠폰 삭제 실패: ${error.message}`);

  clearCouponForm();
  await loadCoupons();
  alert('쿠폰 삭제 완료');
}
let couponRedemptions = [];

async function loadCouponRedemptions(){
  const box = document.getElementById('couponRedemptionList');
  const summary = document.getElementById('couponRedemptionSummary');

  if(!box){
    console.log('couponRedemptionList 없음');
    return;
  }

  box.innerHTML = '불러오는 중...';

  if(!supabase){
    box.innerHTML = 'Supabase 연결 없음';
    return;
  }

  const { data, error } = await supabase
    .from('coupon_redemptions')
    .select('*')
    .order('created_at', { ascending:false })
    .limit(300);

  console.log('coupon redemption data', data);
  console.log('coupon redemption error', error);

  if(error){
    box.innerHTML = `조회 실패: ${error.message}`;
    return;
  }

  couponRedemptions = data || [];

  const q = (document.getElementById('couponRedemptionSearch')?.value || '').trim().toLowerCase();

  const rows = couponRedemptions.filter(r=>{
    const hay = [
      r.business_name,
      r.coupon_title,
      r.notify_emails,
      r.notify_phones
    ].join(' ').toLowerCase();

    return !q || hay.includes(q);
  });

  if(summary){
    summary.textContent = `총 ${rows.length}건 사용`;
  }

  if(!rows.length){
    box.innerHTML = '<div class="board-empty">쿠폰 사용 내역이 없습니다.</div>';
    return;
  }

  box.innerHTML = rows.map(r=>`
    <div class="business-row">
      <div class="biz-main">
        <div class="biz-title">${esc(r.business_name || '-')}</div>
        <div class="biz-meta">쿠폰: ${esc(r.coupon_title || '-')}</div>
        <div class="biz-meta">사용일: ${new Date(r.created_at).toLocaleString()}</div>
        <div class="biz-meta">이메일: ${esc(r.notify_emails || '-')}</div>
        <div class="biz-meta">전화: ${esc(r.notify_phones || '-')}</div>
      </div>
    </div>
  `).join('');
}

window.loadCouponRedemptions = loadCouponRedemptions;
/* ---------------------------
   Boards
--------------------------- */
function normalizeAdminBoardType(t='') {
  const v = String(t || '').toLowerCase();
  if (['notice','event','local'].includes(v)) return 'notice';
  if (['life','news','column'].includes(v)) return 'life';
  if (['guide','dallas-guide','dallas_guide'].includes(v)) return 'guide';
  if (['business','job','rent','sale','realestate','property'].includes(v)) return 'business';
  return 'notice';
}
function boardLabel(t) {
  return { notice: '행사안내', life: '달라스 라이프', guide: '달라스 가이드', business_story: '업소탐방', event: '행사안내', news: '달라스 라이프', job: '비즈니스', realestate: '비즈니스', rent: '비즈니스', sale: '비즈니스' }[String(t || '').toLowerCase()] || '행사안내';
}

const ADMIN_BOARD_SUBTYPES = {
  notice: [
    ['event', '행사'],
    ['notice', '공지'],
    ['community', '커뮤니티 소식'],
    ['urgent', '긴급알림']
  ],
  life: [
    ['news', '뉴스'],
    ['column', '칼럼'],
    ['restaurant', '맛집'],
    ['travel', '여행'],
    ['health', '건강'],
    ['education', '교육'],
    ['interview', '인터뷰'],
    ['recommend', '추천']
  ],
  guide: [
    ['운전·차량', '운전·차량'],
    ['병원·보험', '병원·보험'],
    ['학교·교육', '학교·교육'],
    ['세금·비즈니스', '세금·비즈니스'],
    ['주거·생활', '주거·생활'],
    ['비자·여권', '비자·여권']
  ],
  business: [
    ['job', '구인구직'],
    ['realestate', '부동산'],
    ['startup', '창업'],
    ['promotion', '업체홍보'],
    ['commercial', '상가'],
    ['sale_event', '세일·이벤트']
  ]
};

function boardSubtypeLabel(value='') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  for (const options of Object.values(ADMIN_BOARD_SUBTYPES)) {
    const found = options.find(([v]) => v === raw);
    if (found) return found[1];
  }
  return raw;
}

function updateBoardSubtypeOptions(selectedValue='') {
  const select = qs('board_subtype');
  if (!select) return;
  const type = normalizeAdminBoardType(val('board_type') || 'notice');
  const options = ADMIN_BOARD_SUBTYPES[type] || [];
  const current = String(selectedValue || select.value || '').trim();

  select.innerHTML = '<option value="">세부 분류 선택</option>' + options
    .map(([value, label]) => `<option value="${esc(value)}">${esc(label)}</option>`)
    .join('');

  if (current && !options.some(([value]) => value === current)) {
    select.add(new Option(boardSubtypeLabel(current), current));
  }
  select.value = current;
}

function adminRowIsActive(row, startKey='start_at', endKey='end_at'){
  if(!row || row.is_active === false) return false;
  const now=Date.now();
  const start=row[startKey] || row.start_date;
  const end=row[endKey] || row.end_date;
  const startMs=start ? new Date(start).getTime() : null;
  const endMs=end ? new Date(end).getTime() : null;
  return (!startMs || Number.isNaN(startMs) || startMs<=now) && (!endMs || Number.isNaN(endMs) || endMs>=now);
}
function renderDalpickHomeExposure(){
  const box=qs('dalpickExposureList');
  if(!box) return;
  const region=getAppRegion();
  const dalpickRows=(dalpicks||[])
    .filter(d=>String(d.region||region).toLowerCase()===region)
    .filter(d=>{
      const status=String(d.status||'').toLowerCase();
      if(status==='draft'||status==='inactive') return false;
      if(!adminRowIsActive(d)) return false;
      const themed=String(d.category||'').toLowerCase()==='themed'||(Array.isArray(d.target_categories)&&d.target_categories.length>0);
      return !themed || d.show_in_dalpick===true;
    })
    .map(d=>({source:'dalpick',id:d.id,title:d.title||'제목 없음',subtitle:`${dalpickLabel(d.category)}${d.is_featured?' · 대표 노출':''}`,date:d.created_at||d.start_at||'',row:d}));
  const couponRows=(coupons||[])
    .filter(c=>c.is_today_coupon===true && adminRowIsActive(c))
    .filter(c=>{
      const b=businesses.find(x=>String(x.id)===String(c.business_id));
      return !b?.region || String(b.region).toLowerCase()===region;
    })
    .map(c=>{const b=businesses.find(x=>String(x.id)===String(c.business_id));return {source:'coupon',id:c.id,title:c.title||'쿠폰',subtitle:`오늘의 쿠폰 · ${b?.name_ko||b?.name_en||b?.name||'연결 업소 없음'}`,date:c.created_at||c.start_at||'',row:c};});
  const rows=[...dalpickRows,...couponRows]
    .sort((a,b)=>new Date(b.date||0)-new Date(a.date||0))
    .slice(0,8);
  safeText('dalpickExposureCount',`${rows.length}개`);
  if(!rows.length){box.innerHTML='<div class="muted dalpick-exposure-empty">현재 홈 DalPick에 노출되는 항목이 없습니다. DalPick을 게시하거나 쿠폰에서 ‘오늘의 쿠폰’을 체크하세요.</div>';return;}
  box.innerHTML=rows.map(item=>`<div class="dalpick-exposure-item">
    <div class="dalpick-exposure-source ${item.source}">${item.source==='coupon'?'쿠폰':'DalPick'}</div>
    <div class="dalpick-exposure-copy"><strong>${esc(item.title)}</strong><span>${esc(item.subtitle)}</span></div>
    <button type="button" class="btn ghost dalpick-exposure-open" data-source="${item.source}" data-id="${esc(item.id)}">관리</button>
  </div>`).join('');
  box.querySelectorAll('.dalpick-exposure-open').forEach(btn=>btn.addEventListener('click',()=>{
    const id=btn.dataset.id;
    if(btn.dataset.source==='coupon'){
      const row=coupons.find(c=>String(c.id)===String(id));
      switchSection('coupon');
      if(row){fillCouponForm(row);renderCouponList(filterCoupons());qs('couponFormTitle')?.scrollIntoView({behavior:'smooth',block:'start'});}
      return;
    }
    const row=dalpicks.find(d=>String(d.id)===String(id));
    switchSection('dalpick');
    if(row){fillDalpickForm(row);renderDalpickList(filterDalpicks());qs('dalpickFormTitle')?.scrollIntoView({behavior:'smooth',block:'start'});}
  }));
}

const DALPICK_LABELS={local_info:'지역 정보',lifestyle:'생활 정보',themed:'테마 추천',recommended:'추천 업소',new_business:'신규 업소',coupon:'쿠폰',event:'행사',business_story:'업소탐방 Premium',ai_pick:'AI 추천',seasonal:'시즌 추천',promotion:'프로모션'};
const DALPICK_BUSINESS_REQUIRED=new Set(['recommended','new_business','business_story']);
const DALPICK_TYPE_HELP={local_info:'지역 명소, 여행지, 계절 정보를 업소 연결 없이 작성할 수 있습니다.',lifestyle:'텍사스 생활 팁과 실용 정보를 특정 업체 홍보 없이 작성합니다.',themed:'하나의 주제로 정보형 기사를 만들고 필요할 때만 업소를 연결합니다.',recommended:'선택한 업소를 중심으로 추천 콘텐츠를 작성합니다.',new_business:'새로 등록된 업소의 특징을 소개합니다.',coupon:'쿠폰이나 프로모션 내용을 소개합니다. 업소 연결을 권장합니다.',event:'지역 행사나 이벤트를 소개합니다. 업소 연결은 선택 사항입니다.',business_story:'선택한 업소를 중심으로 업소탐방 기사를 작성합니다. 연결 업소가 반드시 필요합니다.'};
function dalpickLabel(v){return DALPICK_LABELS[v]||v||'DalPick';}

function normalizeLinkedBusinessIds(row){
  const raw=Array.isArray(row?.business_ids)?row.business_ids:[];
  const ids=raw.map(String).filter(Boolean);
  if(row?.business_id && !ids.includes(String(row.business_id))) ids.unshift(String(row.business_id));
  return [...new Set(ids)];
}
function getMultiBusinessIds(selectId){
  const el=qs(selectId); if(!el) return [];
  try { const a=JSON.parse(el.dataset.businessIds||'[]'); return Array.isArray(a)?a.map(String).filter(Boolean):[]; } catch { return el.value?[String(el.value)]:[]; }
}
function setMultiBusinessIds(selectId, ids){
  const el=qs(selectId); if(!el) return;
  const clean=[...new Set((ids||[]).map(String).filter(Boolean))];
  el.dataset.businessIds=JSON.stringify(clean);
  el.value=clean[0]||'';
  const picker=qs(selectId+'Multi');
  if(picker) picker.querySelectorAll('input[type="checkbox"]').forEach(cb=>cb.checked=clean.includes(String(cb.value)));
  const count=qs(selectId+'Count'); if(count) count.textContent=`${clean.length}개 선택`;
}
function renderBusinessMultiPicker(selectId){
  const el=qs(selectId); if(!el) return;
  let wrap=qs(selectId+'Multi');
  if(!wrap){
    wrap=document.createElement('div'); wrap.id=selectId+'Multi'; wrap.className='business-multi-picker';
    el.insertAdjacentElement('afterend',wrap); el.classList.add('business-multi-source');
  }
  const selected=getMultiBusinessIds(selectId);
  wrap.innerHTML=`<div class="business-multi-toolbar"><input type="search" class="business-multi-search" placeholder="업소 검색"><span id="${selectId}Count">${selected.length}개 선택</span></div><div class="business-multi-options"></div>`;
  const list=wrap.querySelector('.business-multi-options');
  const draw=(q='')=>{
    q=q.trim().toLowerCase();
    const rows=(businesses||[]).filter(b=>!q||[b.name_ko,b.name_en,b.name,b.address,b.category].join(' ').toLowerCase().includes(q));
    list.innerHTML=rows.map(b=>`<label class="business-multi-item"><input type="checkbox" value="${esc(b.id)}" ${selected.includes(String(b.id))?'checked':''}><span><b>${esc(b.name_ko||b.name_en||b.name||'이름 없음')}</b><small>${esc([b.city,b.category].filter(Boolean).join(' · '))}</small></span></label>`).join('')||'<div class="muted">검색 결과 없음</div>';
    list.querySelectorAll('input').forEach(cb=>cb.addEventListener('change',()=>{
      const cur=new Set(getMultiBusinessIds(selectId)); cb.checked?cur.add(String(cb.value)):cur.delete(String(cb.value)); setMultiBusinessIds(selectId,[...cur]);
    }));
  };
  wrap.querySelector('.business-multi-search').addEventListener('input',e=>draw(e.target.value)); draw();
}

function renderDalpickBusinessOptions(){const el=qs('dalpick_business_id');if(!el)return;const cur=el.value;el.innerHTML='<option value="">연결 안 함</option>'+businesses.map(b=>`<option value="${esc(b.id)}">${esc(b.name_ko||b.name_en||b.id)}</option>`).join('');el.value=cur;if(!el.dataset.businessIds)setMultiBusinessIds('dalpick_business_id',cur?[cur]:[]);renderBusinessMultiPicker('dalpick_business_id');}
async function loadDalpicks(){if(!supabase)return;const {data,error}=await supabase.from('dalpick').select('*').eq('region',getAppRegion()).order('is_featured',{ascending:false}).order('priority',{ascending:false}).order('created_at',{ascending:false});if(error){console.warn('DalPick load:',error.message);safeText('dalpickCountText','테이블 필요');return;}dalpicks=data||[];window.KFocusAdminBridge=window.KFocusAdminBridge||{};window.KFocusAdminBridge.getDalpicks=()=>[...dalpicks];window.dispatchEvent(new CustomEvent('kfocus:dalpicks-loaded',{detail:[...dalpicks]}));renderDalpickBusinessOptions();renderDalpickList(filterDalpicks());renderDalpickHomeExposure();}
function filterDalpicks(){const q=val('dalpickSearchInput').trim().toLowerCase(),cat=val('dalpickCategoryFilter')||'all';return dalpicks.filter(d=>{if(cat!=='all'&&d.category!==cat)return false;if(!q)return true;const b=businesses.find(x=>String(x.id)===String(d.business_id));return [d.title,d.summary,d.content,b?.name_ko,b?.name_en].join(' ').toLowerCase().includes(q);});}
function renderDalpickList(items){
  safeText('dalpickCountText',`${items.length}개`);
  const el=qs('dalpickList');
  if(!el)return;
  el.innerHTML=items.map(d=>{
    const b=businesses.find(x=>String(x.id)===String(d.business_id));
    return `<div class="biz-item dalpick-row ${String(d.id)===String(selectedDalpickId)?'active':''}" data-id="${esc(d.id)}" role="button" tabindex="0">
      ${d.image_url?`<img class="biz-thumb" src="${esc(d.image_url)}" alt="">`:'<div class="biz-thumb board-thumb-fallback">✨</div>'}
      <div class="dalpick-row-copy"><div class="biz-title">${esc(d.title||'제목 없음')}</div><div class="biz-meta">${esc(dalpickLabel(d.category))}${d.is_featured?' · 대표':''}${d.is_active===false?' · 비활성':''}</div><div class="biz-meta">${esc(b?.name_ko||b?.name_en||d.summary||'')}</div></div>
      <div class="dalpick-row-actions"><button type="button" class="btn secondary dalpick-edit-row" data-id="${esc(d.id)}">수정</button><button type="button" class="btn danger dalpick-delete-row" data-id="${esc(d.id)}">삭제</button></div>
    </div>`;
  }).join('')||'<div class="muted">등록된 DalPick이 없습니다.</div>';
  const openRow=(id)=>{const row=dalpicks.find(d=>String(d.id)===String(id));if(row){fillDalpickForm(row);renderDalpickList(filterDalpicks());qs('dalpickFormTitle')?.scrollIntoView({behavior:'smooth',block:'start'});}};
  el.querySelectorAll('.dalpick-row').forEach(row=>{
    row.addEventListener('click',(e)=>{if(e.target.closest('button'))return;openRow(row.dataset.id);});
    row.addEventListener('keydown',(e)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openRow(row.dataset.id);}});
  });
  el.querySelectorAll('.dalpick-edit-row').forEach(btn=>btn.addEventListener('click',()=>openRow(btn.dataset.id)));
  el.querySelectorAll('.dalpick-delete-row').forEach(btn=>btn.addEventListener('click',async()=>{
    const row=dalpicks.find(d=>String(d.id)===String(btn.dataset.id));
    if(!row||!confirm(`“${row.title||'이 DalPick'}”을 삭제할까요?`))return;
    const {error}=await supabase.from('dalpick').delete().eq('id',row.id);
    if(error)return alert(`삭제 실패: ${error.message}`);
    if(String(selectedDalpickId)===String(row.id))clearDalpickForm();
    await loadDalpicks();
    alert('DalPick이 삭제되었습니다.');
  }));
}
function updateDalpickImagePreview(){
  const url=val('dalpick_image_url').trim();
  const wrap=qs('dalpickImagePreviewWrap');
  const img=qs('dalpickImagePreview');
  if(!wrap||!img)return;
  img.onload=null;
  img.onerror=null;
  if(!url){
    wrap.hidden=true;
    img.removeAttribute('src');
    return;
  }
  wrap.hidden=false;
  img.alt='대표 이미지 불러오는 중';
  img.onload=()=>{ img.alt='대표 이미지 미리보기'; };
  img.onerror=()=>{
    console.error('[DalPick Image] preview load failed:',url);
    img.removeAttribute('src');
    img.alt='대표 이미지를 불러오지 못했습니다.';
    wrap.hidden=true;
    safeText('dalpickAiStatus','이미지 URL은 입력됐지만 미리보기를 불러오지 못했습니다.');
  };
  img.src=url;
}
function clearDalpickForm(){window.dalpickTopicFirstReady=false;selectedDalpickId=null;setVal('dalpick_id','');setVal('dalpick_image_instruction','');setVal('dalpick_category','local_info');setVal('dalpick_region',getAppRegion());setVal('dalpick_title','');setVal('dalpick_summary','');setVal('dalpick_content','');setVal('dalpick_business_id','');setMultiBusinessIds('dalpick_business_id',[]);setVal('dalpick_image_url','');setVal('dalpick_start_at','');setVal('dalpick_end_at','');setVal('dalpick_priority','0');setChecked('dalpick_is_featured',false);setChecked('dalpick_is_active',true);setChecked('dalpick_show_in_dalpick',false);setChecked('dalpick_auto_image',true);document.querySelectorAll('[name="dalpick_target_category"]').forEach(x=>x.checked=false);setVal('dalpick_topic','');setVal('dalpick_instructions','');setVal('dalpick_sources','');safeText('dalpickAiStatus','준비됨');safeText('dalpickFormTitle','DalPick 콘텐츠 스튜디오');updateDalpickTypeUI();updateDalpickImagePreview();renderDalpickList(filterDalpicks());}
function startNewDalpick(){
  clearDalpickForm();
  safeText('dalpickFormTitle','새 한 줄 광고·콘텐츠 등록');
  const target=qs('dalpickFormTitle')||qs('dalpickForm');
  target?.scrollIntoView({behavior:'smooth',block:'start'});
  window.setTimeout(()=>qs('dalpick_category')?.focus(),350);
}
function fillDalpickForm(d){window.dalpickTopicFirstReady=true;selectedDalpickId=d.id;setVal('dalpick_id',d.id);setVal('dalpick_category',d.category||'local_info');setVal('dalpick_region',d.region||getAppRegion());setVal('dalpick_title',d.title||'');setVal('dalpick_summary',d.summary||'');setVal('dalpick_content',d.content||'');setVal('dalpick_business_id',d.business_id||'');setMultiBusinessIds('dalpick_business_id',normalizeLinkedBusinessIds(d));renderBusinessMultiPicker('dalpick_business_id');setVal('dalpick_image_url',d.image_url||'');setVal('dalpick_start_at',fmtLocal(d.start_at));setVal('dalpick_end_at',fmtLocal(d.end_at));setVal('dalpick_priority',d.priority||0);setChecked('dalpick_is_featured',!!d.is_featured);setChecked('dalpick_is_active',d.is_active!==false);setChecked('dalpick_show_in_dalpick',!!d.show_in_dalpick);{const targets=Array.isArray(d.target_categories)?d.target_categories:[];document.querySelectorAll('[name="dalpick_target_category"]').forEach(x=>x.checked=targets.includes(x.value));}safeText('dalpickFormTitle',`DalPick 수정 #${d.id}`);updateDalpickTypeUI();updateDalpickImagePreview();}
async function saveDalpick(){
  const selectedCategory=val('dalpick_category')||'local_info';
  const themeMode=selectedCategory==='themed';
  const selectedTargets=themeMode?[...document.querySelectorAll('[name="dalpick_target_category"]:checked')].map(x=>x.value):[];
  const payload={region:getAppRegion(),category:selectedCategory,title:val('dalpick_title').trim(),summary:val('dalpick_summary').trim()||null,content:val('dalpick_content').trim()||null,business_ids:getMultiBusinessIds('dalpick_business_id'),business_id:getMultiBusinessIds('dalpick_business_id')[0]||null,image_url:val('dalpick_image_url').trim()||null,start_at:fromLocal(val('dalpick_start_at')),end_at:fromLocal(val('dalpick_end_at')),priority:Number(val('dalpick_priority')||0),is_featured:checked('dalpick_is_featured'),is_active:checked('dalpick_is_active'),status:checked('dalpick_is_active')?'published':'draft',target_categories:selectedTargets,show_in_dalpick:themeMode&&checked('dalpick_show_in_dalpick')};
  if(!payload.title)return alert('제목을 입력하세요.');
  if(payload.category==='themed'&&!payload.target_categories.length)return alert('추천 테마를 표시할 업종을 하나 이상 선택하세요.');
  if(DALPICK_BUSINESS_REQUIRED.has(payload.category)&&!payload.business_ids.length)return alert('이 콘텐츠 유형은 연결 업소를 선택해야 합니다.');
  const q=selectedDalpickId?supabase.from('dalpick').update(payload).eq('id',selectedDalpickId):supabase.from('dalpick').insert(payload);
  const {error}=await q;
  if(error)return alert(`추천 테마 저장 실패: ${error.message}`);
  await loadDalpicks();clearDalpickForm();alert(payload.category==='themed'?'추천 테마 기사로 저장했습니다.':'DalPick을 저장했습니다.');
}
async function deleteDalpick(){if(!selectedDalpickId)return alert('삭제할 DalPick을 선택하세요.');if(!confirm('이 DalPick을 삭제할까요?'))return;const {error}=await supabase.from('dalpick').delete().eq('id',selectedDalpickId);if(error)return alert(`삭제 실패: ${error.message}`);await loadDalpicks();clearDalpickForm();}

function updateDalpickTypeUI(){
  const category=val('dalpick_category')||'local_info';
  if(category!=='themed'){
    document.querySelectorAll('[name="dalpick_target_category"]:checked').forEach(x=>x.checked=false);
    setChecked('dalpick_show_in_dalpick',false);
  }
  safeText('dalpickTypeHelp',DALPICK_TYPE_HELP[category]||'DalPick 콘텐츠를 작성합니다.');
  const required=DALPICK_BUSINESS_REQUIRED.has(category);
  safeText('dalpickBusinessRequirement',required?'필수':'선택 사항');
  const businessSelect=qs('dalpick_business_id');
  const storyFields=qs('businessStoryFields'); if(storyFields) storyFields.hidden=category!=='business_story'; const themeFields=qs('dalpickThemeFields'); if(themeFields) themeFields.hidden=category!=='themed';
  if(businessSelect) businessSelect.required=required;
}

async function uploadDalpickImage(){
  const file=qs('dalpick_image_file')?.files?.[0];
  if(!file) return alert('업로드할 대표 이미지를 선택하세요.');
  const btn=qs('dalpickUploadImageBtn'); const old=btn?.textContent||'직접 업로드';
  if(btn){btn.disabled=true;btn.textContent='업로드 중...';}
  try{
    const publicUrl=await uploadFileToStorage(file,'dalpicks/manual');
    setVal('dalpick_image_url',publicUrl||'');
    updateDalpickImagePreview();
    if(qs('dalpick_image_file')) qs('dalpick_image_file').value='';
    safeText('dalpickAiStatus','✅ 직접 업로드 완료 · 저장 버튼을 눌러 주세요.');
  }catch(e){alert(`대표 이미지 업로드 실패: ${e.message}`);}finally{if(btn){btn.disabled=false;btn.textContent=old;}}
}
function clearDalpickImage(){
  setVal('dalpick_image_url','');
  if(qs('dalpick_image_file')) qs('dalpick_image_file').value='';
  updateDalpickImagePreview();
  safeText('dalpickAiStatus','대표 이미지가 제거되었습니다. 저장 버튼을 눌러 반영하세요.');
}
function updateBoardImagePreview(){
  const url=val('board_image_url').trim(), wrap=qs('boardImagePreviewWrap'), img=qs('boardImagePreview');
  if(!wrap||!img) return;
  if(!url){wrap.hidden=true;img.removeAttribute('src');return;}
  wrap.hidden=false; img.src=url;
  img.onerror=()=>{wrap.hidden=true;safeText('boardImageStatus','❌ 이미지를 불러오지 못했습니다. URL을 확인해 주세요.');};
}
async function generateBoardImage(){
  const title=val('board_title').trim();
  const summary=(val('board_content').trim()||'').slice(0,700);
  if(!title) return alert('먼저 게시글 제목을 입력하세요.');
  const btn=qs('boardAiImageBtn'); const old=btn?.textContent||'AI 이미지 생성';
  if(btn){btn.disabled=true;btn.textContent='생성 중...';}
  safeText('boardImageStatus','AI 대표 이미지를 생성하고 있습니다...');
  try{
    const response=await fetch('/.netlify/functions/generate-dalpick-image?v=9.0.0',{method:'POST',headers:{'Content-Type':'application/json','Cache-Control':'no-cache'},body:JSON.stringify({title,summary,category:`guide-${val('board_subtype')||val('board_type')||'article'}`,instruction:val('board_image_instruction').trim(),current_image_url:val('board_image_url').trim()})});
    const json=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(json.error||`HTTP ${response.status}`);
    const encoded=String(json.b64_json||''); if(!encoded) throw new Error('생성된 이미지 데이터가 없습니다.');
    const binary=atob(encoded), bytes=new Uint8Array(binary.length); for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
    const file=new File([bytes],`guide-${Date.now()}.png`,{type:'image/png'});
    const publicUrl=await uploadFileToStorage(file,'boards/ai');
    setVal('board_image_url',publicUrl||''); updateBoardImagePreview();
    safeText('boardImageStatus','✅ AI 이미지 생성 완료 · 게시글 저장 버튼을 눌러 주세요.');
    return true;
  }catch(e){safeText('boardImageStatus',`❌ 이미지 오류: ${e.message}`);alert(`가이드 이미지 생성 실패\n\n${e.message}`);return false;}finally{if(btn){btn.disabled=false;btn.textContent=old;}}
}
async function generateDalpickImage(){
  const title=val('dalpick_title').trim()||val('dalpick_topic').trim();
  const summary=val('dalpick_summary').trim();
  if(!title){alert('먼저 기사 제목이나 주제를 입력하세요.');return false;}
  const btn=qs('dalpickImageBtn');
  const old=btn?.textContent||'AI 대표 이미지 생성';
  if(btn){btn.disabled=true;btn.textContent='이미지 생성 중...';}
  safeText('dalpickAiStatus','AI 대표 이미지 요청 중...');
  console.log('[DalPick Image] generation started',{title,category:val('dalpick_category')||'themed'});
  try{
    const response=await fetch('/.netlify/functions/generate-dalpick-image?v=8.3.0',{
      method:'POST',
      headers:{'Content-Type':'application/json','Cache-Control':'no-cache'},
      body:JSON.stringify({title,summary,category:val('dalpick_category')||'themed',instruction:val('dalpick_image_instruction').trim(),current_image_url:val('dalpick_image_url').trim()})
    });
    console.log('[DalPick Image] function response:',response.status,response.statusText);
    const raw=await response.text();
    let json={};
    try{json=raw?JSON.parse(raw):{};}catch(parseError){
      console.error('[DalPick Image] invalid JSON response:',raw.slice(0,500));
      throw new Error(`이미지 서버 응답을 읽지 못했습니다. HTTP ${response.status}`);
    }
    if(!response.ok)throw new Error(json.error||`이미지 생성에 실패했습니다. HTTP ${response.status}`);
    const encoded=String(json.b64_json||'');
    if(!encoded)throw new Error('생성된 이미지 데이터가 없습니다.');
    console.log('[DalPick Image] image data received:',Math.round(encoded.length/1024),'KB');
    let binary;
    try{binary=atob(encoded);}catch(e){throw new Error('이미지 데이터 변환에 실패했습니다.');}
    const bytes=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
    const file=new File([bytes],`dalpick-${Date.now()}.png`,{type:'image/png'});
    if(!supabase)throw new Error('Supabase 연결이 준비되지 않았습니다. 새로고침 후 다시 시도하세요.');
    const bucket=cfg.STORAGE_BUCKET||'public-images';
    const baseFolder=String(cfg.STORAGE_FOLDER||'').replace(/^\/+|\/+$/g,'');
    const folder=baseFolder?`${baseFolder}/uploads/dalpicks`:'uploads/dalpicks';
    const path=`${folder}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.png`;
    console.log('[DalPick Image] storage upload started:',bucket,path);
    safeText('dalpickAiStatus','이미지 생성 완료 · 저장소 업로드 중...');
    const {error}=await supabase.storage.from(bucket).upload(path,file,{upsert:false,cacheControl:'3600',contentType:'image/png'});
    if(error)throw new Error(`Storage 업로드 실패: ${error.message}`);
    const {data}=supabase.storage.from(bucket).getPublicUrl(path);
    const publicUrl=data?.publicUrl||'';
    if(!publicUrl)throw new Error('업로드된 이미지의 공개 URL을 만들지 못했습니다.');
    console.log('[DalPick Image] public URL created:',publicUrl);
    setVal('dalpick_image_url',publicUrl);
    updateDalpickImagePreview();
    safeText('dalpickAiStatus','✅ 대표 이미지 생성 및 업로드 완료');
    return true;
  }catch(error){
    console.error('[DalPick Image] failed:',error);
    safeText('dalpickAiStatus',`❌ 이미지 오류: ${error.message}`);
    alert(`대표 이미지 생성 실패

${error.message}`);
    return false;
  }finally{
    if(btn){btn.disabled=false;btn.textContent=old;}
  }
}
async function generateDalpickDraft(){
  if(window.dalpickTopicFirstReady===false) return alert('먼저 주제를 분석하고 추천 분류를 확정하세요.');
  const topic=val('dalpick_topic').trim();
  if(!topic) return alert('AI로 작성할 주제를 입력하세요.');
  const category=val('dalpick_category')||'local_info';
  const businessId=val('dalpick_business_id')||'';
  if(DALPICK_BUSINESS_REQUIRED.has(category)&&!businessId) return alert('이 콘텐츠 유형은 연결 업소를 먼저 선택하세요.');
  const business=businesses.find(b=>String(b.id)===String(businessId));
  const sources=String(val('dalpick_sources')||'').split(/\n|,/).map(v=>v.trim()).filter(Boolean);
  const interview = category==='business_story' ? {
    style:val('dalpick_story_style'), owner_name:val('dalpick_owner_name').trim(),
    startup_reason:val('dalpick_q1').trim(), signature:val('dalpick_q2').trim(), difference:val('dalpick_q3').trim(),
    customer_reason:val('dalpick_q4').trim(), future_plan:val('dalpick_q5').trim(), message:val('dalpick_q6').trim()
  } : null;
  const btn=qs('dalpickAiBtn');
  const old=btn?.textContent||'AI 초안 만들기';
  if(btn){btn.disabled=true;btn.textContent='작성 중...';}
  safeText('dalpickAiStatus','AI가 DalPick 초안을 작성하고 있습니다...');
  try{
    const response=await fetch('/.netlify/functions/generate-dalpick',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        topic,category,instructions:val('dalpick_instructions').trim(),sources,interview,
        business:business?{
          name:business.name_ko||business.name_en||'',
          category:business.category||business.category_ko||'',
          city:business.city||business.address||'',
          description:business.description||business.description_ko||business.short_description||''
        }:null
      })
    });
    const json=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(json.error||'AI 초안 생성에 실패했습니다.');
    const article=json.article||{};
    setVal('dalpick_title',article.title||topic);
    setVal('dalpick_summary',article.summary||'');
    setVal('dalpick_content',article.content||'');
    if(!val('dalpick_image_url')&&business){
      const image=business.image_url||business.thumbnail_url||business.logo_url||'';
      if(image) setVal('dalpick_image_url',image);
    }
    const q=json.quality||{}; safeText('dalpickAiStatus',`초안 작성 완료${q.score?` · 품질 ${q.score}점`:''}${q.intent_type?` · ${q.intent_type}`:''}${article.image_search_keywords?` · 이미지 검색어: ${article.image_search_keywords}`:''}`);
    if(checked('dalpick_auto_image')){console.log('[DalPick Image] automatic generation requested');await generateDalpickImage();}else{console.log('[DalPick Image] automatic generation skipped: checkbox off');}
  }catch(error){
    console.error('DalPick AI:',error);
    safeText('dalpickAiStatus',`오류: ${error.message}`);
    alert(error.message);
  }finally{
    if(btn){btn.disabled=false;btn.textContent=old;}
  }
}

async function loadBoards() {
  if(!supabase){
  box.innerHTML = 'Supabase 연결 없음';
  return;
}
  const selects = [
    'id,title,content,type,subtype,region,image_url,image_link_url,gallery_urls,video_url,external_url,link_label,author_name,address,phone,business_id,start_at,end_at,is_active,is_pinned,pin_order,is_alert_notice,alert_order,created_at',
    'id,title,content,type,subtype,region,image_url,image_link_url,gallery_urls,video_url,external_url,link_label,author_name,address,phone,start_at,end_at,is_active,is_pinned,pin_order,is_alert_notice,alert_order,created_at',
    'id,title,content,type,subtype,region,image_url,image_link_url,gallery_urls,video_url,external_url,link_label,author_name,start_at,end_at,is_active,is_pinned,pin_order,is_alert_notice,alert_order,created_at'
  ];
  let loaded = null;
  for (const select of selects) {
    const res = await supabase
    .from('posts')
    .select(select)
    .eq('region', getAppRegion())
    .order('created_at', { ascending: false });
    if (!res.error) {
      loaded = res.data || [];
      break;
    }
  }
  if (!loaded) {
    safeText('boardCountText', '오류');
    return;
  }
  boardTable = 'posts';
  boards = loaded || [];
  window.KFocusAdminBridge = window.KFocusAdminBridge || {};
  window.KFocusAdminBridge.getBoards = () => [...boards];
  window.dispatchEvent(new CustomEvent('kfocus:boards-loaded', {detail:[...boards]}));
  renderBoardList(filterBoards());
  renderBusinessList(filterBusinesses());
}

function boardHomePinKey(){ return `kfocus_board_home_pins_v66_${getAppRegion()}`; }
function readBoardHomePins(){ try { const v=JSON.parse(localStorage.getItem(boardHomePinKey())||'[]'); return Array.isArray(v)?v.map(String):[]; } catch { return []; } }
function writeBoardHomePin(id, pinned){ if(!id)return; const set=new Set(readBoardHomePins()); pinned?set.add(String(id)):set.delete(String(id)); localStorage.setItem(boardHomePinKey(),JSON.stringify([...set])); window.dispatchEvent(new CustomEvent('kfocus:board-home-pins-updated')); }
function clearBoardForm() {
  setVal('board_id', '');
  setVal('board_type', 'notice');
  updateBoardSubtypeOptions('');
  setVal('board_region', getAppRegion());
  setVal('board_title', '');
  setVal('board_content', '');
  setVal('board_phone', '');
  setVal('board_address', '');
  setVal('board_image_url', '');
  setVal('board_image_instruction','');
  updateBoardImagePreview();
  setVal('board_image_link_url', '');
  setVal('board_gallery_urls', '');
  setVal('board_external_url', '');
  setVal('board_link_label', '');
  setVal('board_author_name', '');
  setVal('board_video_url', '');
  setVal('board_business_id', '');
  setVal('board_business_search', '');
  renderBoardBusinessOptions();
  setVal('board_start_at', '');
  setVal('board_end_at', '');
  setChecked('board_is_active', true);
  setChecked('board_is_pinned', false);
  setVal('board_pin_order', '999');
  setChecked('board_is_alert_notice', false);
  setVal('board_alert_order', '999');
  setChecked('board_home_pinned', false);
  if (qs('board_image_file')) qs('board_image_file').value = '';
  selectedBoardId = null;
  safeText('boardFormTitle', '새 글');
  $$('.board-row').forEach((el) => el.classList.remove('active'));
}
function fillBoardForm(row) {
  setVal('board_id', row.id || '');
  setVal('board_type', normalizeAdminBoardType(row.type || 'notice'));
  updateBoardSubtypeOptions(row.subtype || (row.type === 'rent' ? 'rent' : row.type === 'sale' ? 'sale' : ''));
  setVal('board_region', row.region || 'dallas');
  setVal('board_title', row.title || '');
  setVal('board_content', row.content || '');
  setVal('board_phone', row.phone || '');
  setVal('board_address', row.address || '');
  setVal('board_business_id', row.business_id || row.linked_business_id || '');
  setVal('board_business_search', '');
  renderBoardBusinessOptions();
  setVal('board_image_url', row.image_url || '');
  setVal('board_image_instruction','');
  updateBoardImagePreview();
  setVal('board_image_link_url', row.image_link_url || '');
  setVal('board_gallery_urls', Array.isArray(row.gallery_urls) ? row.gallery_urls.join('\n') : (row.gallery_urls || ''));
  setVal('board_external_url', row.external_url || '');
  setVal('board_link_label', row.link_label || '');
  setVal('board_author_name', row.author_name || '');
  setVal('board_video_url', row.video_url || '');
  setVal('board_start_at', fmtLocal(row.start_at));
  setVal('board_end_at', fmtLocal(row.end_at));
  setChecked('board_is_active', row.is_active !== false);
  setChecked('board_is_pinned', row.is_pinned === true);
  setVal('board_pin_order', Number(row.pin_order || 999));
  setChecked('board_is_alert_notice', row.is_alert_notice === true);
  setVal('board_alert_order', Number(row.alert_order || 999));
  setChecked('board_home_pinned', Boolean(row.is_home_pinned||row.home_pinned||readBoardHomePins().includes(String(row.id))));
  if (qs('board_image_file')) qs('board_image_file').value = '';
  selectedBoardId = row.id;
  safeText('boardFormTitle', `글 수정 #${row.id}`);
}
function filterBoards() {
  const q = val('boardSearchInput').trim().toLowerCase();
  const t = val('boardTypeFilter') || 'all';
  const region = currentRegionScope();

  return boards.filter((b) => {
    if (region !== 'all' && (b.region || 'colorado') !== region) return false;
    if (t !== 'all' && normalizeAdminBoardType(b.type || 'notice') !== normalizeAdminBoardType(t)) return false;
    if (!q) return true;
    return [b.title, b.content, b.region, b.address, b.phone].join(' ').toLowerCase().includes(q);
  }).sort((a,b)=>{
    const ap=a.is_pinned===true, bp=b.is_pinned===true;
    if(ap!==bp) return ap?-1:1;
    if(ap&&bp){ const d=Number(a.pin_order||999)-Number(b.pin_order||999); if(d) return d; }
    return Date.parse(b.created_at||0)-Date.parse(a.created_at||0);
  });
}
function renderBoardList(items) {
  safeText('boardCountText', `${items.length}개`);
  const listEl = qs('boardList');
  if (!listEl) return;

  listEl.innerHTML = items.map((row) => {
    const period = row.start_at || row.end_at
      ? `${row.start_at ? String(row.start_at).slice(0, 10) : ''}${row.start_at && row.end_at ? ' ~ ' : ''}${row.end_at ? String(row.end_at).slice(0, 10) : ''}`
      : '';
    const linkedBiz = businesses.find((b) => String(b.id) === String(row.business_id || row.linked_business_id || ''));
    const thumb = row.image_url
      ? `<img class="biz-thumb board-thumb-image" src="${esc(row.image_url)}" alt="${esc(row.title || '게시글')}" />`
      : `<div class="biz-thumb board-thumb-fallback">${({ notice: '📅', life: '📰', guide: '📘', business_story: '🏪' })[normalizeAdminBoardType(row.type)] || '📝'}</div>`;

    return `
      <button type="button" class="biz-item board-row ${row.id === selectedBoardId ? 'active' : ''}" data-id="${esc(row.id)}">
        ${thumb}
        <div>
          <div class="biz-title">${row.is_pinned===true?'📌 ':''}${row.is_alert_notice===true?'📣 ':''}${esc(row.title || '게시글')}</div>
          <div class="biz-meta">${esc(boardLabel(row.type))}${row.subtype ? ' · ' + esc(boardSubtypeLabel(row.subtype)) : ''} · ${esc(row.region || 'colorado')} ${row.is_alert_notice===true?'· 달타운 공지 ':''}${row.is_active === false ? '· 비활성' : ''}</div>
          <div class="biz-meta">${linkedBiz ? '연결 업소: ' + esc(linkedBiz.name_ko || linkedBiz.name_en || linkedBiz.id) : esc(period)}</div>
          <div class="biz-meta">${esc(row.address || row.phone || (row.content || '').slice(0, 80))}</div>
        </div>
      </button>
    `;
  }).join('');

  listEl.querySelectorAll('.board-row').forEach((btn) => {
    btn.addEventListener('click', () => {
      const row = boards.find((b) => String(b.id) === String(btn.dataset.id));
      if (row) {
        fillBoardForm(row);
        renderBoardList(filterBoards());
      }
    });
  });
}
async function saveBoard() {
  const file = qs('board_image_file')?.files?.[0];
  let imageUrl = val('board_image_url').trim() || null;

  try {
    if (file) imageUrl = await uploadFileToStorage(file, 'boards');
  } catch (e) {
    return alert(`게시판 이미지 업로드 실패: ${e.message}`);
  }

const linkedBusinessId =
    val('board_business_select') ||
    val('board_business_id') ||
    null;

const boardType = normalizeAdminBoardType(val('board_type'));
const galleryUrls = String(val('board_gallery_urls') || '').split(/\r?\n|,/).map(v=>v.trim()).filter(Boolean);

if (!boardType || boardType === 'all') {
    return alert('게시판 종류를 선택하세요.');
}

const payloadBase = {
    type: boardType,
    subtype: val('board_subtype') || null,
    region: getAppRegion(),
    title: val('board_title').trim(),
    content: val('board_content').trim(),
    image_url: imageUrl,
	image_link_url: val('board_image_link_url').trim() || null,
    gallery_urls: galleryUrls,
    external_url: val('board_external_url').trim() || null,
    link_label: val('board_link_label').trim() || null,
    author_name: val('board_author_name').trim() || null,
    video_url: val('board_video_url').trim() || null,
    start_at: fromLocal(val('board_start_at')),
    end_at: fromLocal(val('board_end_at')),
    is_active: checked('board_is_active'),
    is_pinned: checked('board_is_pinned'),
    pin_order: Math.max(1, Number(val('board_pin_order') || 999)),
    is_alert_notice: checked('board_is_alert_notice'),
    alert_order: Math.max(1, Number(val('board_alert_order') || 999)),
    business_id: linkedBusinessId || null
};
console.log('BOARD SAVE PAYLOAD', payloadBase);
  if (!payloadBase.title) return alert('제목을 입력하세요.');

  const payloads = [
    { ...payloadBase, phone: val('board_phone').trim() || null, address: val('board_address').trim() || null },
    { ...payloadBase, phone: val('board_phone').trim() || null, address: val('board_address').trim() || null, business_id: undefined },
    { ...payloadBase, business_id: undefined },
    payloadBase
  ];

  let res = null;
for (const rawPayload of payloads) {
    const payload = Object.fromEntries(
        Object.entries(rawPayload).filter(([, v]) => v !== undefined)
    );

    console.log('BOARD TABLE:', boardTable);
    console.log('BOARD ID:', selectedBoardId);
    console.log('BOARD PAYLOAD:', payload);

    res = selectedBoardId
        ? await supabase
            .from(boardTable)
            .update(payload)
            .eq('id', selectedBoardId)
            .select()
            .single()
        : await supabase
            .from(boardTable)
            .insert({
                ...payload,
                created_at: new Date().toISOString()
            })
            .select()
            .single();
    console.log('BOARD SAVE RESULT:', res);
    console.log('SAVED IMAGE LINK:', res?.data?.image_link_url);

    console.log('BOARD SAVE RESULT:', res);

    if (!res.error) break;
}

  if (res?.error) return alert(`게시글 저장 실패: ${res.error.message}`);
  const savedBoardId=res?.data?.id||selectedBoardId;
  writeBoardHomePin(savedBoardId, checked('board_home_pinned'));
  await loadBoards();
  if (res.data) fillBoardForm({...res.data,is_home_pinned:checked('board_home_pinned')});
  alert('게시글 저장 완료');
}
async function deleteBoard() {
  if (!selectedBoardId) return;
  if (!confirm('이 게시글을 삭제할까요?')) return;
  const { error } = await supabase.from(boardTable).delete().eq('id', selectedBoardId);
  if (error) return alert(`게시글 삭제 실패: ${error.message}`);
  clearBoardForm();
  await loadBoards();
  alert('게시글 삭제 완료');
}

/* ---------------------------
   AI Dallas Guide v18: request classification -> official info/business/mixed search
--------------------------- */
const AI_GUIDE_CATEGORY_NAMES = {
  driving: '운전면허 차량등록 자동차 운전·차량',
  health: '병원 보험 건강 병원·보험',
  education: '학교 교육 학군 학교·교육',
  business: '세금 창업 비즈니스 세금·비즈니스',
  housing: '주택 유틸리티 전기 인터넷 주거·생활',
  immigration: '비자 여권 이민 비자·여권'
};
let aiGuideSearchResult = null;

function getAiGuideInput() {
  return {
    topic: val('aiGuideTopic').trim(),
    category: val('aiGuideCategory') || 'driving',
    boardType: val('aiGuideBoardType') || 'guide',
    sources: String(val('aiGuideSources') || '').split(/\r?\n|,/).map(v => v.trim()).filter(Boolean),
    instructions: val('aiGuideInstructions').trim()
  };
}
function setAiGuideBusy(busy, message='') {
  const searchBtn = qs('aiGuideSearchBtn');
  const draftBtn = qs('aiGuideDraftBtn');
  if (searchBtn) searchBtn.disabled = busy;
  if (draftBtn) draftBtn.disabled = busy || !aiGuideSearchResult?.candidates?.length;
  safeText('aiGuideStatus', message || (busy ? '처리 중...' : '준비됨'));
}
function selectedAiGuideCandidates() {
  if (!aiGuideSearchResult?.candidates) return [];
  return aiGuideSearchResult.candidates.filter((_, i) => qs(`aiGuideCandidate_${i}`)?.checked);
}
function renderAiGuideCandidates(result) {
  const panel = qs('aiGuideSearchPanel');
  const list = qs('aiGuideCandidateList');
  if (!panel || !list) return;
  panel.style.display = 'block';
  const queries = (result.queries_used || []).join(' · ');
  safeText('aiGuideSearchSummary', `${result.interpreted_request || ''}${queries ? `\n검색어: ${queries}` : ''}`);
  list.innerHTML = '';
  list.style.cssText = 'display:flex;flex-direction:column;gap:10px;width:100%;max-width:100%;min-width:0;box-sizing:border-box;';
  (result.candidates || []).forEach((c, i) => {
    const place = c.place || {};
    const card = document.createElement('label');
    card.style.cssText = [
      'display:block',
      'width:100%',
      'max-width:100%',
      'box-sizing:border-box',
      'border:1px solid #d7dce5',
      'border-radius:10px',
      'padding:12px',
      'margin:0',
      'background:#fff',
      'cursor:pointer',
      'text-align:left',
      'white-space:normal',
      'overflow:hidden'
    ].join(';');
    const sourceLinks = (c.source_urls || []).slice(0, 3).map((url, n) => `<a href="${esc(url)}" target="_blank" rel="noopener">근거 ${n + 1}</a>`).join(' · ');
    card.innerHTML = `
      <div style="display:flex;align-items:flex-start;justify-content:flex-start;gap:10px;width:100%;min-width:0;box-sizing:border-box;text-align:left;">
        <input id="aiGuideCandidate_${i}" type="checkbox" checked style="margin:4px 0 0 0;flex:0 0 auto;width:16px;height:16px;">
        <div style="min-width:0;flex:1 1 auto;width:auto;max-width:100%;overflow-wrap:anywhere;word-break:break-word;white-space:normal;text-align:left;">
          <div style="font-weight:700;">${esc(place.name || c.name || '')}</div>
          <div class="tiny muted" style="margin-top:4px;">${esc(c.candidate_kind === 'information' ? (c.specialty || c.city || '') : (place.address || c.city || ''))}</div>
          ${place.phone ? `<div class="tiny">전화: ${esc(place.phone)}</div>` : ''}
          <div class="tiny" style="margin-top:5px;"><b>${c.candidate_kind === 'information' ? '핵심 공식 근거' : '한인·필수조건 근거'}:</b> ${esc(c.qualifier_evidence || '근거 설명 없음')}</div>
          <div class="tiny" style="margin-top:5px;"><b>신뢰도 ${Number(c.final_score || c.confidence || 0)}점</b> · 근거 ${c.evidence_status === 'confirmed' ? '확인' : c.evidence_status === 'probable' ? '가능성 높음' : c.evidence_status === 'unconfirmed' ? '추가 확인 필요' : '해당 없음'}${c.candidate_kind === 'information' ? ` · 공식 출처 ${c.official_source ? '예' : '보조 자료'}` : ` · Google Places ${c.place_verified ? '연락처 확인됨' : '미확인'}`}</div>
          ${c.published_or_updated ? `<div class="tiny" style="margin-top:5px;"><b>게시·갱신:</b> ${esc(c.published_or_updated)}</div>` : ''}
          ${(c.community_sources || []).length ? `<div class="tiny" style="margin-top:5px;"><b>한인 매체 근거:</b> ${(c.community_sources || []).map(s => esc(s.label || s.key || '')).join(' · ')}${c.community_source_bonus ? ` · 가중치 +${Number(c.community_source_bonus)}` : ''}</div>` : ''}
          ${sourceLinks ? `<div class="tiny" style="margin-top:5px;">${sourceLinks}</div>` : ''}
        </div>
      </div>`;
    list.appendChild(card);
  });
  if (!(result.candidates || []).length) list.innerHTML = '<div class="tiny muted">관련 후보를 찾지 못했습니다. 참고 URL이나 알고 있는 업소명을 추가해 다시 검색해 주세요.</div>';
}
async function searchAiGuideCandidates() {
  const input = getAiGuideInput();
  if (!input.topic) return alert('검색할 주제를 입력하세요.');
  aiGuideSearchResult = null;
  setAiGuideBusy(true, '질문 유형을 분석하고 공식 생활정보 또는 업소 근거를 검색하고 있습니다...');
  try {
    const response = await fetch('/.netlify/functions/search-guide', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({topic: input.topic, category: input.category, sources: input.sources, instructions: input.instructions})
    });
    const text = await response.text();
    let result = {}; try { result = JSON.parse(text); } catch (_) {}
    if (!response.ok) throw new Error(result.error || text || '검색에 실패했습니다.');
    aiGuideSearchResult = result;
    renderAiGuideCandidates(result);
    const count = result.candidates?.length || 0;
    safeText('aiGuideStatus', count ? `${result.search_type_label || '검색'} 근거 ${count}개를 찾았습니다. 사용할 항목을 체크한 뒤 2단계를 누르세요.` : result.message || '검증 근거가 없습니다.');
  } catch (error) {
    console.error('searchAiGuideCandidates error:', error);
    safeText('aiGuideStatus', `검색 오류: ${error.message}`);
    alert(`AI 검색 실패: ${error.message}`);
  } finally {
    setAiGuideBusy(false, qs('aiGuideStatus')?.textContent || '');
  }
}
async function generateAiGuide() {
  const input = getAiGuideInput();
  const selected = selectedAiGuideCandidates();
  if (!input.topic) return alert('AI가 작성할 주제를 입력하세요.');
  if (!aiGuideSearchResult) return alert('먼저 1단계에서 검색 후보를 찾아 주세요.');
  if (!selected.length) return alert('기사에 사용할 후보를 한 곳 이상 선택하세요.');
  setAiGuideBusy(true, `선택한 ${selected.length}개 후보로 기사를 작성하고 있습니다...`);
  try {
    const response = await fetch('/.netlify/functions/generate-guide', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({topic: input.topic, category: input.category, sources: input.sources, instructions: input.instructions, selected_candidates: selected})
    });
    const text = await response.text();
    let result = {}; try { result = JSON.parse(text); } catch (_) {}
    if (!response.ok) throw new Error(result.error || text || 'AI 글 생성에 실패했습니다.');
    const article = result.article || {};
    clearBoardForm();
    setVal('board_type', 'guide');
    updateBoardSubtypeOptions('');
    const guideSubtype = AI_GUIDE_CATEGORY_NAMES[input.category] || result.category_name || input.category;
    updateBoardSubtypeOptions(guideSubtype);
    setVal('board_region', getAppRegion());
    setVal('board_title', article.title || input.topic);
    const evidenceBlock = selected.flatMap(c => c.source_urls || []).filter(Boolean);
    const sourceBlock = evidenceBlock.length ? `\n\n[확인 근거]\n${[...new Set(evidenceBlock)].join('\n')}` : '';
    setVal('board_content', `${article.summary ? article.summary + '\n\n' : ''}${article.content || ''}${sourceBlock}`.trim());
    setVal('board_author_name', article.author_name || '달타운맵 편집부');
    setVal('board_external_url', article.source_url || evidenceBlock[0] || '');
    setVal('board_link_label', article.link_label || (evidenceBlock.length ? '공식 정보 확인' : ''));
    setChecked('board_is_active', false);
    safeText('aiGuideStatus', `초안 완료 · 선택 후보 ${selected.length}곳. 아래 내용을 검토한 뒤 저장하세요.`);
    alert('AI 초안이 생성되었습니다.\n\n제목과 내용을 검토한 뒤 저장 버튼을 눌러 게시하세요.');
  } catch (error) {
    console.error('generateAiGuide error:', error);
    safeText('aiGuideStatus', `작성 오류: ${error.message}`);
    alert(`AI 가이드 생성 실패: ${error.message}`);
  } finally {
    setAiGuideBusy(false, qs('aiGuideStatus')?.textContent || '');
  }
}

/* ---------------------------
   Slides
--------------------------- */
function slideById(id) {
  return slides.find((s) => String(s.id) === String(id)) || null;
}
function slidesByBusinessId(id) {
  return slides.filter((s) => String(s.business_id || '') === String(id || ''));
}
async function loadSlides() {
  if (!supabase) return;
  const { data, error } = await supabase
    .from('slides')
    .select('*')
    .eq('region', getAppRegion())
    .order('home_fixed_sort', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) {
    console.warn(error);
    slides = [];
    safeText('slideCountText', '오류');
    return;
  }
  slides = data || [];
  window.KFocusAdminBridge = window.KFocusAdminBridge || {};
  window.KFocusAdminBridge.getSlides = () => [...slides];
  window.dispatchEvent(new CustomEvent('kfocus:slides-loaded', {detail:[...slides]}));
  renderSlideList(filterSlides());
  renderBusinessList(filterBusinesses());
}
function renderSlideBusinessOptions() {
  const el = qs('slide_business_select');
  if (!el) return;
  const region = currentRegionScope();
  const rows = businesses.filter((b) => region === 'all' || (b.region || 'dallas') === region);
  el.innerHTML = '<option value="">업소 연결 안 함</option>' +
    rows.map((b) => `<option value="${esc(b.id)}">${esc(b.name_ko || b.name_en || b.id)}</option>`).join('');
}
function setSlideFormMode(mode = 'new', dirty = false) {
  const editing = mode === 'edit';
  slideFormDirty = !!dirty;
  const saveBtn = qs('slideSaveBtn');
  const status = qs('slideEditStatus');
  if (saveBtn) {
    saveBtn.textContent = slideSaveBusy
      ? '저장 중…'
      : editing ? (slideFormDirty ? '수정사항 저장' : '수정 저장') : '새 슬라이드 저장';
    saveBtn.disabled = slideSaveBusy;
  }
  if (status) {
    status.className = `slide-edit-status ${editing ? 'is-edit' : 'is-new'}${slideFormDirty ? ' is-dirty' : ''}`;
    status.textContent = editing
      ? (slideFormDirty ? '● 저장되지 않은 변경사항' : '선택 슬라이드 수정 중')
      : (slideFormDirty ? '● 새 슬라이드 작성 중' : '새 슬라이드');
  }
}
function markSlideFormDirty() {
  if (slideSaveBusy) return;
  setSlideFormMode((val('slide_id') || selectedSlideId) ? 'edit' : 'new', true);
}
function slideToast(message, type = 'success') {
  let toast = qs('slideToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'slideToast';
    toast.className = 'admin-toast';
    document.body.appendChild(toast);
  }
  toast.className = `admin-toast ${type} show`;
  toast.textContent = message;
  clearTimeout(slideToast.timer);
  slideToast.timer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function clearSlideForm() {
  setVal('slide_id', '');
  setVal('slide_business_id', '');
  setVal('slide_business_select', '');
  setChecked('slide_promo_enabled', true);
  setChecked('slide_home_fixed', false);
  setVal('slide_home_fixed_sort', '1000');
  setVal('slide_promo_text', '');
  setVal('slide_promo_image_url', '');
  setVal('slide_video_url', '');
  setVal('slide_link_url', '');
  setVal('slide_start_at', '');
  setVal('slide_end_at', '');
  selectedSlideBusinessId = null;
  selectedSlideId = null;
  safeText('slideFormTitle', '새 슬라이드');
  setSlideFormMode('new', false);
  $$('.slide-row').forEach((el) => el.classList.remove('active'));
}
function fillSlideForm(slide) {
  // 업소 목록의 '슬라이드' 버튼에서 들어온 경우에는 기존 슬라이드를 수정하지 않고
  // 해당 업소가 미리 선택된 새 슬라이드 양식을 연다.
  if (slide && slide.id && !slide.business_id && businesses.some((b) => String(b.id) === String(slide.id))) {
    const businessId = slide.id;
    clearSlideForm();
    setVal('slide_business_id', businessId);
    setVal('slide_business_select', businessId);
    selectedSlideBusinessId = businessId;
    safeText('slideFormTitle', `새 슬라이드 · ${slide.name_ko || slide.name_en || '선택 업소'}`);
    return;
  }
  if (!slide || !slide.id) return clearSlideForm();
  const businessId = slide.business_id || '';
  setVal('slide_id', slide.id || '');
  setVal('slide_business_id', businessId);
  setVal('slide_business_select', businessId);
  setChecked('slide_promo_enabled', slide.promo_enabled !== false);
  setChecked('slide_home_fixed', !!slide.home_fixed);
  setVal('slide_home_fixed_sort', slide.home_fixed_sort ?? 1000);
  setVal('slide_promo_text', slide.promo_text || '');
  setVal('slide_promo_image_url', slide.promo_image_url || '');
  setVal('slide_video_url', slide.video_url || '');
  setVal('slide_link_url', slide.link_url || '');
  setVal('slide_start_at', fmtLocal(slide.promo_start_at));
  setVal('slide_end_at', fmtLocal(slide.promo_end_at));
  selectedSlideId = slide.id;
  selectedSlideBusinessId = businessId || null;
  const biz = businesses.find((b) => String(b.id) === String(businessId));
  safeText('slideFormTitle', `슬라이드 수정 · ${slide.promo_text || biz?.name_ko || biz?.name_en || (businessId ? '연결 업소' : '업소 미연결')}`);
  setSlideFormMode('edit', false);
}
function filterSlides() {
  const q = val('slideSearchInput').trim().toLowerCase();
  const region = currentRegionScope();
  return (slides || []).filter((slide) => {
    if (region !== 'all' && (slide.region || 'dallas') !== region) return false;
    const biz = businesses.find((b) => String(b.id) === String(slide.business_id || ''));
    if (!q) return true;
    return [slide.promo_text, slide.link_url, biz?.name_ko, biz?.name_en, biz?.category_ko]
      .filter(Boolean).join(' ').toLowerCase().includes(q);
  }).sort((a, b) =>
    Number(a.home_fixed_sort ?? 1000) - Number(b.home_fixed_sort ?? 1000) ||
    String(b.created_at || '').localeCompare(String(a.created_at || ''))
  );
}
function renderSlideList(items) {
  safeText('slideCountText', `${(items || []).length}개`);
  const listEl = qs('slideList');
  if (!listEl) return;
  listEl.innerHTML = (items || []).map((slide) => {
    const biz = businesses.find((b) => String(b.id) === String(slide.business_id || ''));
    const img = slide.promo_image_url || biz?.image_url || 'https://placehold.co/120x120?text=Slide';
    const title = slide.promo_text || biz?.name_ko || biz?.name_en || '독립 슬라이드';
    const owner = biz ? `연결: ${biz.name_ko || biz.name_en}` : '업소 연결 없음';
    const state = `${slide.promo_enabled ? '게시' : '비활성'}${slide.home_fixed ? ' · 홈고정' : ''} · 순서 ${slide.home_fixed_sort ?? 1000}`;
    return `
      <button type="button" class="biz-item slide-row ${String(slide.id) === String(selectedSlideId) ? 'active' : ''}" data-slide-id="${esc(slide.id)}">
        <img class="biz-thumb" src="${esc(img)}" alt="thumb" />
        <div>
          <div class="biz-title">${esc(title)}</div>
          <div class="biz-meta">${esc(owner)}</div>
          <div class="biz-meta">${esc(state)}</div>
        </div>
      </button>
    `;
  }).join('');

  listEl.querySelectorAll('.slide-row').forEach((btn) => {
    btn.addEventListener('click', () => {
      const slide = slideById(btn.dataset.slideId);
      if (slide) {
        fillSlideForm(slide);
        renderSlideList(filterSlides());
      }
    });
  });
}
async function saveSlide() {
  if (slideSaveBusy) return;
  const slideId = val('slide_id') || selectedSlideId;
  const businessId = val('slide_business_select') || null;
  const payload = {
    business_id: businessId,
    region: getAppRegion(),
    promo_enabled: checked('slide_promo_enabled'),
    home_fixed: checked('slide_home_fixed'),
    home_fixed_sort: Number(val('slide_home_fixed_sort') || 1000),
    promo_text: val('slide_promo_text').trim() || null,
    promo_image_url: val('slide_promo_image_url').trim() || null,
    video_url: val('slide_video_url').trim() || null,
    link_url: val('slide_link_url').trim() || null,
    promo_start_at: fromLocal(val('slide_start_at')),
    promo_end_at: fromLocal(val('slide_end_at')),
    updated_at: new Date().toISOString()
  };

  if (!payload.promo_text && !payload.promo_image_url && !payload.video_url) {
    return alert('슬라이드 문구, 이미지 또는 영상 중 하나는 입력해 주세요.');
  }

  slideSaveBusy = true;
  setSlideFormMode(slideId ? 'edit' : 'new', slideFormDirty);
  try {
    let saved = null;
    if (slideId) {
      const { data, error } = await supabase
        .from('slides')
        .update(payload)
        .eq('id', slideId)
        .select('*');
      if (error) throw error;
      if (!data || !data.length) {
        throw new Error('수정된 행이 없습니다. 관리자 권한(RLS) 또는 슬라이드 ID를 확인해 주세요.');
      }
      saved = data[0];
    } else {
      const { data, error } = await supabase
        .from('slides')
        .insert(payload)
        .select('*')
        .single();
      if (error) throw error;
      saved = data;
    }

    await loadSlides();
    if (saved) fillSlideForm(slideById(saved.id) || saved);
    renderSlideList(filterSlides());
    slideToast(slideId ? '슬라이드 수정사항을 저장했습니다.' : '새 슬라이드를 추가했습니다.');
  } catch (error) {
    console.error('[slide save]', error);
    slideToast(`저장 실패: ${error.message}`, 'error');
    alert(`슬라이드 저장 실패: ${error.message}`);
  } finally {
    slideSaveBusy = false;
    setSlideFormMode((val('slide_id') || selectedSlideId) ? 'edit' : 'new', false);
  }
}

async function deleteSlide() {
  const slideId = val('slide_id') || selectedSlideId;
  if (!slideId) return alert('삭제할 슬라이드를 선택하세요.');
  if (!confirm('선택한 슬라이드 한 개만 삭제할까요?')) return;
  const { error } = await supabase.from('slides').delete().eq('id', slideId);
  if (error) return alert(`슬라이드 삭제 실패: ${error.message}`);
  await loadSlides();
  clearSlideForm();
  renderSlideList(filterSlides());
  alert('선택한 슬라이드가 삭제되었습니다.');
}

function parseImageUrls(v) {
  if (Array.isArray(v)) return v;
  if (!v) return [];
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function clearBusinessImage() {
  setVal('image_url', '');
  if (qs('imageFile')) qs('imageFile').value = '';
  updatePreview();
}

function renderGalleryList(row = null) {
  const listEl = qs('galleryList');
  if (!listEl) return;

  const urls = parseImageUrls(row?.gallery_urls);
  if (!urls.length) {
    listEl.innerHTML = '<div class="muted">등록된 갤러리 이미지가 없습니다.</div>';
    return;
  }

  listEl.innerHTML = urls.map((url, idx) => `
    <div class="gallery-admin-item">
      <img src="${esc(url)}" alt="gallery ${idx + 1}" />
      <button type="button" class="btn danger gallery-delete-btn" data-gallery-index="${idx}">삭제</button>
    </div>
  `).join('');

  listEl.querySelectorAll('.gallery-delete-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!selectedId) return;

      const biz = businesses.find((b) => String(b.id) === String(selectedId));
      if (!biz) return;

      const urls = parseImageUrls(biz.gallery_urls);
      urls.splice(Number(btn.dataset.galleryIndex), 1);

      const { error } = await supabase
        .from('businesses')
        .update({ gallery_urls: urls })
        .eq('id', selectedId);

      if (error) return alert(`갤러리 삭제 실패: ${error.message}`);

      await loadBusinesses();
      const updated = businesses.find((b) => String(b.id) === String(selectedId));
      if (updated) {
        fillBusinessForm(updated);
        renderGalleryList(updated);
      }
    });
  });
}
function fillBusinessHours(hours) {
  const h = hours || {};

  setVal('mon_open1', h.mon?.open1 || '');
  setVal('mon_close1', h.mon?.close1 || '');
  setVal('mon_open2', h.mon?.open2 || '');
  setVal('mon_close2', h.mon?.close2 || '');
  setChecked('mon_closed', !!h.mon?.closed);

  setVal('tue_open1', h.tue?.open1 || '');
  setVal('tue_close1', h.tue?.close1 || '');
  setVal('tue_open2', h.tue?.open2 || '');
  setVal('tue_close2', h.tue?.close2 || '');
  setChecked('tue_closed', !!h.tue?.closed);

  setVal('wed_open1', h.wed?.open1 || '');
  setVal('wed_close1', h.wed?.close1 || '');
  setVal('wed_open2', h.wed?.open2 || '');
  setVal('wed_close2', h.wed?.close2 || '');
  setChecked('wed_closed', !!h.wed?.closed);

  setVal('thu_open1', h.thu?.open1 || '');
  setVal('thu_close1', h.thu?.close1 || '');
  setVal('thu_open2', h.thu?.open2 || '');
  setVal('thu_close2', h.thu?.close2 || '');
  setChecked('thu_closed', !!h.thu?.closed);

  setVal('fri_open1', h.fri?.open1 || '');
  setVal('fri_close1', h.fri?.close1 || '');
  setVal('fri_open2', h.fri?.open2 || '');
  setVal('fri_close2', h.fri?.close2 || '');
  setChecked('fri_closed', !!h.fri?.closed);

  setVal('sat_open1', h.sat?.open1 || '');
  setVal('sat_close1', h.sat?.close1 || '');
  setVal('sat_open2', h.sat?.open2 || '');
  setVal('sat_close2', h.sat?.close2 || '');
  setChecked('sat_closed', !!h.sat?.closed);

  setVal('sun_open1', h.sun?.open1 || '');
  setVal('sun_close1', h.sun?.close1 || '');
  setVal('sun_open2', h.sun?.open2 || '');
  setVal('sun_close2', h.sun?.close2 || '');
  setChecked('sun_closed', !!h.sun?.closed);
}
async function uploadGalleryImages() {
  if (!selectedId) return alert('먼저 업소를 선택하세요.');

  const files = Array.from(qs('galleryFiles')?.files || []);
  if (!files.length) return alert('업로드할 이미지를 선택하세요.');

  const biz = businesses.find((b) => String(b.id) === String(selectedId));
  if (!biz) return;

  const oldUrls = parseImageUrls(biz.gallery_urls);
  const newUrls = [];

  try {
    for (const file of files) {
      const publicUrl = await uploadFileToStorage(file, 'business-gallery');
      if (publicUrl) newUrls.push(publicUrl);
    }

    const merged = [...oldUrls, ...newUrls];
    console.log('selectedId =', selectedId);
    console.log('merged =', merged);

    const { error } = await supabase
      .from('businesses')
      .update({ gallery_urls: merged })
      .eq('id', selectedId);

    console.log('gallery update error =', error);

    if (error) return alert(`갤러리 저장 실패: ${error.message}`);

    await loadBusinesses();
    const updated = businesses.find((b) => String(b.id) === String(selectedId));
    if (updated) {
      fillBusinessForm(updated);
      renderGalleryList(updated);
    }

    if (qs('galleryFiles')) qs('galleryFiles').value = '';
    alert('갤러리 업로드 완료');
  } catch (e) {
    alert(`갤러리 업로드 실패: ${e.message}`);
  }
}

async function uploadCouponImage() {
  const file = qs('coupon_image_file')?.files?.[0];
  if (!file) return alert('쿠폰 이미지를 선택하세요.');

  try {
    const publicUrl = await uploadFileToStorage(file, 'coupons');
    setVal('coupon_image_url', publicUrl || '');
    if (qs('coupon_image_file')) qs('coupon_image_file').value = '';
    alert('쿠폰 이미지 업로드 완료');
  } catch (e) {
    alert(`쿠폰 이미지 업로드 실패: ${e.message}`);
  }
}

function clearCouponImage() {
  setVal('coupon_image_url', '');
  if (qs('coupon_image_file')) qs('coupon_image_file').value = '';
}

async function uploadSlideImage() {
  const file = qs('slide_image_file')?.files?.[0];
  if (!file) return alert('슬라이드 이미지를 선택하세요.');

  try {
    const publicUrl = await uploadFileToStorage(file, 'slides');
    setVal('slide_promo_image_url', publicUrl || '');
    if (qs('slide_image_file')) qs('slide_image_file').value = '';
    alert('슬라이드 이미지 업로드 완료');
  } catch (e) {
    alert(`슬라이드 이미지 업로드 실패: ${e.message}`);
  }
}

function clearSlideImage() {
  setVal('slide_promo_image_url', '');
  if (qs('slide_image_file')) qs('slide_image_file').value = '';
}


/* ---------------------------
   Events
--------------------------- */
function bindEvents() {
  $$('#adminNav .nav-item').forEach((btn) => {
    btn.addEventListener('click', () => switchSection(btn.dataset.section));
  });

  BUSINESS_FIELDS.concat(BUSINESS_CHECKS).forEach((id) => {
    const el = qs(id);
    if (el) {
      el.addEventListener('input', updatePreview);
      el.addEventListener('change', updatePreview);
    }
  });

  on('searchInput', 'input', () => renderBusinessList(filterBusinesses()));
  on('fetchGoogleRatingBtn', 'click', fetchGoogleRating);
  on('regionFilter','change', async () => {
  renderBusinessList(filterBusinesses());
  renderCouponList(filterCoupons());
  renderBoardList(filterBoards());
  fillBusinessOptions();
  renderSlideBusinessOptions();
  renderSlideList(filterSlides());

  // ⭐ 추가 (핵심)
  const region = document.getElementById('regionFilter')?.value || 'all';
  const statsMap = await fetchBusinessStats(region);
  renderTopStats(statsMap, filterBusinesses());
});
  on('categoryFilter', 'change', () => renderBusinessList(filterBusinesses()));
  on('activeOnly', 'change', () => renderBusinessList(filterBusinesses()));
  on('businessQuickFilter', 'change', () => renderBusinessList(filterBusinesses()));
  // 관리자 홈 이동 버튼
  on('openDallasHome', 'click', () => {
  window.open('/?admin=1&region=dallas', '_blank');
});

  on('openColoradoHome', 'click', () => {
  window.open('/?admin=1&region=colorado', '_blank');
});

on('refreshBtn','click', async () => {
  await Promise.all([loadBusinesses(), loadCoupons(), loadBoards(), loadSlides(), loadBusinessStats()]);
  await loadDalpicks();

  renderSlideBusinessOptions();
  renderSlideList(filterSlides());

  // ⭐ 이것도 추가
 const region = document.getElementById('regionFilter')?.value || 'all';
 const statsMap = await fetchBusinessStats(region);
 renderTopStats(statsMap, filterBusinesses());
});

  on('newBtn', 'click', clearBusinessForm);
  on('saveBtn', 'click', saveBusiness);
  on('deleteBtn', 'click', deleteBusiness);
  on('openMapBtn', 'click', openMapSearch);
  on('geocodeBtn', 'click', geocodeAddress);
  on('bulkGeocodeBtn', 'click', bulkGeocodeMissing);
  on('uploadImageBtn', 'click', uploadImage);
  on('clearImageBtn', 'click', clearBusinessImage);
  on('uploadGalleryBtn', 'click', uploadGalleryImages);

  on('bannerNewBtn', 'click', clearBannerForm);
  on('bannerSaveBtn', 'click', saveBanner);

  on('couponSearchInput', 'input', () => renderCouponList(filterCoupons()));
  on('couponUploadImageBtn', 'click', uploadCouponImage);
  on('couponClearImageBtn', 'click', clearCouponImage);
  on('couponBusinessFilter', 'change', () => renderCouponList(filterCoupons()));
  on('couponNewBtn', 'click', clearCouponForm);
  on('couponSaveBtn', 'click', saveCoupon);
  on('couponDeleteBtn', 'click', deleteCoupon);

  on('dalpickSearchInput','input',()=>renderDalpickList(filterDalpicks()));
  on('dalpickCategoryFilter','change',()=>{const filter=val('dalpickCategoryFilter');renderDalpickList(filterDalpicks());if(!selectedDalpickId&&filter&&filter!=='all'){setVal('dalpick_category',filter);updateDalpickTypeUI();}});
  on('dalpickNewBtn','click',startNewDalpick);
  on('dalpickSaveBtn','click',saveDalpick);
  on('dalpickSaveBottomBtn','click',saveDalpick);
  on('dalpickDeleteBtn','click',deleteDalpick);
  on('dalpick_category','change',updateDalpickTypeUI);
  on('dalpickAiBtn','click',generateDalpickDraft);
  on('dalpickImageBtn','click',generateDalpickImage);
  on('dalpickRegenerateImageBtn','click',generateDalpickImage);
  on('dalpickUploadImageBtn','click',uploadDalpickImage);
  on('dalpickClearImageBtn','click',clearDalpickImage);
  on('dalpickAiSaveBtn','click',saveDalpick);
  on('dalpick_image_url','input',updateDalpickImagePreview);
  on('performanceRefreshBtn','click',loadPerformanceCenter);
  on('boardSearchInput', 'input', () => renderBoardList(filterBoards()));
  on('boardTypeFilter', 'change', () => renderBoardList(filterBoards()));
  on('board_type', 'change', () => updateBoardSubtypeOptions(''));
  on('boardNewBtn', 'click', clearBoardForm);
  on('boardSaveBtn', 'click', saveBoard);
  on('boardDeleteBtn', 'click', deleteBoard);
  on('aiGuideSearchBtn', 'click', searchAiGuideCandidates);
  on('aiGuideDraftBtn', 'click', generateAiGuide);
  
  on('boardAiImageBtn','click',generateBoardImage);
  on('boardAiRegenerateBtn','click',generateBoardImage);
  on('board_image_url','input',updateBoardImagePreview);
  on('boardUploadImageBtn', 'click', uploadBoardImage);
  on('boardClearImageBtn', 'click', clearBoardImage);
  on('board_business_search', 'input', renderBoardBusinessOptions);
  on('board_business_select', 'change', () => setVal('board_business_id', val('board_business_select')));
  
  on('slideSearchInput', 'input', () => renderSlideList(filterSlides()));
  on('slideUploadImageBtn', 'click', uploadSlideImage);
  on('slideClearImageBtn', 'click', clearSlideImage);
  on('slideNewBtn', 'click', clearSlideForm);
  on('slideDeleteBtn', 'click', deleteSlide);
  on('slideSaveBtn', 'click', saveSlide);
  ['slide_business_select','slide_promo_enabled','slide_home_fixed','slide_home_fixed_sort','slide_promo_text','slide_promo_image_url','slide_video_url','slide_link_url','slide_start_at','slide_end_at'].forEach((id) => {
    on(id, 'input', markSlideFormDirty);
    on(id, 'change', markSlideFormDirty);
  });
  on('slide_business_select', 'change', () => {
    const businessId = val('slide_business_select') || '';
    const row = businesses.find((b) => String(b.id) === String(businessId));

    // 연결 업소 변경은 현재 슬라이드 편집 내용을 유지해야 한다.
    // 기존에는 business row를 fillSlideForm()에 넘겨 새 슬라이드 모드로 초기화되는 문제가 있었다.
    setVal('slide_business_id', businessId);
    selectedSlideBusinessId = businessId || null;

    if (selectedSlideId) {
      const currentSlide = slideById(selectedSlideId);
      const label = row?.name_ko || row?.name_en || '업소 미연결';
      safeText('slideFormTitle', `슬라이드 수정 · ${currentSlide?.promo_text || label}`);
      setSlideFormMode('edit', true);
    } else {
      const label = row?.name_ko || row?.name_en || '독립 슬라이드';
      safeText('slideFormTitle', `새 슬라이드 · ${label}`);
      setSlideFormMode('new', true);
    }
  });
}


/* ---------------------------
   Banner business search + image upload UI
--------------------------- */
function ensureBannerExtrasUI() {
  const bnImage = qs('bnImage');
  const bnRegion = qs('bnRegion');
  if (!bnImage || !bnRegion) return;

  if (!qs('bnBusinessSearch') || !qs('bnBusinessId') || !qs('bnBusinessSelect')) {
    const bizWrap = document.createElement('div');
    bizWrap.className = 'field';
    bizWrap.innerHTML = `
      <label>연결 업소</label>
      <input type="hidden" id="bnBusinessId" value="">
      <input type="text" id="bnBusinessSearch" placeholder="업소명 / 주소 검색">
      <select id="bnBusinessSelect" size="6" style="margin-top:8px; width:100%;"></select>
      <div style="margin-top:6px; color:#666; font-size:12px;">검색 후 목록에서 선택하면 배너 클릭 시 업소 상세로 연결됩니다.</div>
    `;
    bnRegion.parentElement?.insertAdjacentElement('afterend', bizWrap);
  }

  if (!qs('bannerImageFile') || !qs('bannerImageUploadBtn')) {
    const upWrap = document.createElement('div');
    upWrap.className = 'field';
    upWrap.innerHTML = `
      <label>배너 이미지 파일</label>
      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
        <input type="file" id="bannerImageFile" accept="image/*">
        <button type="button" class="btn" id="bannerImageUploadBtn">이미지 업데이트</button>
      </div>
      <div style="margin-top:6px; color:#666; font-size:12px;">업로드 후 기존 저장 버튼을 누르면 최종 반영됩니다.</div>
    `;
    bnImage.parentElement?.insertAdjacentElement('afterend', upWrap);
  }


  if (!qs('bnDisplayType')) {
    const typeWrap = document.createElement('div');
    typeWrap.className = 'field';
    typeWrap.innerHTML = `
      <label>광고 표시 형식</label>
      <select id="bnDisplayType">
        <option value="banner">큰 이미지 배너</option>
        <option value="card">일반 카드형</option>
      </select>
    `;
    bnRegion.parentElement?.insertAdjacentElement('afterend', typeWrap);
  }

  if (!qs('bnPlacement')) {
    const placeWrap = document.createElement('div');
    placeWrap.className = 'field';
    placeWrap.innerHTML = `
      <label>노출 위치</label>
      <select id="bnPlacement">
        <option value="home">홈 배너만</option>
        <option value="detail">연결 업소 상세만</option>
        <option value="both">홈 + 업소 상세</option>
      </select>
    `;
    qs('bnDisplayType')?.parentElement?.insertAdjacentElement('afterend', placeWrap);
  }

  if (!qs('bnHomeCategories')) {
    const categoryWrap = document.createElement('div');
    categoryWrap.className = 'field full';
    categoryWrap.innerHTML = `
      <label>홈 배너 카테고리</label>
      <div id="bnHomeCategories" class="banner-category-picker">
        ${['all','식당','쇼핑','병원','금융','법률','교회','서비스','부동산'].map((c,i)=>`<label><input type="checkbox" value="${c}" ${i===0?'checked':''}> ${c==='all'?'전체 홈':c}</label>`).join('')}
      </div>
      <div class="muted" style="margin-top:6px">‘전체 홈’은 카테고리를 선택하지 않은 기본 화면에 표시됩니다. 특정 카테고리를 선택하면 해당 카테고리에서만 표시됩니다. 여러 카테고리도 선택할 수 있습니다.</div>
    `;
    qs('bnPlacement')?.parentElement?.insertAdjacentElement('afterend', categoryWrap);
  }

  if (!qs('bnDescription')) {
    const descWrap = document.createElement('div');
    descWrap.className = 'field full';
    descWrap.innerHTML = `
      <label>카드 설명 (선택)</label>
      <textarea id="bnDescription" rows="3" placeholder="카드형 광고에 표시할 짧은 설명"></textarea>
    `;
    bnImage.parentElement?.insertAdjacentElement('beforebegin', descWrap);
  }

  if (!qs('bnButtonLabel')) {
    const buttonWrap = document.createElement('div');
    buttonWrap.className = 'field';
    buttonWrap.innerHTML = `
      <label>버튼 문구</label>
      <input id="bnButtonLabel" type="text" placeholder="자세히 보기">
      <label style="display:flex;align-items:center;gap:8px;margin-top:8px;font-weight:500">
        <input id="bnShowButton" type="checkbox" checked>
        배너에 버튼 표시
      </label>
      <div style="margin-top:5px;color:#666;font-size:12px">체크를 해제하면 제목과 설명만 표시됩니다. 배너 전체 클릭 연결은 그대로 사용할 수 있습니다.</div>
    `;
    qs('bnLink')?.parentElement?.insertAdjacentElement('afterend', buttonWrap);
    qs('bnShowButton')?.addEventListener('change', () => {
      const input = qs('bnButtonLabel');
      if (!input) return;
      input.disabled = !checked('bnShowButton');
      input.style.opacity = checked('bnShowButton') ? '1' : '.55';
    });
  }


  if (!qs('bnLinkType')) {
    const linkWrap = document.createElement('div');
    linkWrap.className = 'field full';
    linkWrap.innerHTML = `
      <label>클릭 연결 방식</label>
      <select id="bnLinkType">
        <option value="business">연결 업소 상세</option>
        <option value="post">게시글</option>
        <option value="dalpick">DalPick / 추천 테마</option>
        <option value="coupon">쿠폰</option>
        <option value="external">외부 링크</option>
        <option value="phone">전화 걸기</option>
        <option value="none">클릭 없음</option>
      </select>
      <select id="bnLinkTarget" style="margin-top:8px;width:100%"></select>
      <input id="bnLinkCustom" type="text" style="margin-top:8px" placeholder="외부 URL 또는 전화번호">
      <div id="bnLinkHelp" style="margin-top:6px;color:#666;font-size:12px"></div>
    `;
    qs('bnLink')?.parentElement?.insertAdjacentElement('afterend', linkWrap);
  }


  if (!qs('bnMediaType')) {
    const mediaWrap = document.createElement('div');
    mediaWrap.className = 'field full banner-media-panel';
    mediaWrap.innerHTML = `
      <label>배너 콘텐츠</label>
      <div class="banner-media-types">
        <label><input type="radio" name="bnMediaType" value="image" checked> 이미지</label>
        <label><input type="radio" name="bnMediaType" value="youtube"> YouTube</label>
        <label><input type="radio" name="bnMediaType" value="mp4"> MP4 영상</label>
      </div>
      <input id="bnVideoUrl" type="url" placeholder="YouTube 또는 MP4 영상 URL" style="margin-top:8px">
      <div class="banner-video-options">
        <label><input id="bnAutoplay" type="checkbox"> 자동 재생</label>
        <label><input id="bnMuted" type="checkbox" checked> 음소거</label>
        <label><input id="bnLoop" type="checkbox" checked> 반복 재생</label>
        <label><input id="bnMobileTap" type="checkbox" checked> 모바일 터치 후 재생</label>
      </div>
      <div class="muted" style="margin-top:6px">자동 재생은 브라우저 정책상 음소거 상태에서만 안정적으로 작동합니다. 모바일은 기본적으로 썸네일을 보여주고 터치 후 재생합니다.</div>
    `;
    bnImage.parentElement?.insertAdjacentElement('afterend', mediaWrap);
  }

  if (!qs('bnAiPrompt')) {
    const aiWrap = document.createElement('div');
    aiWrap.className = 'field full banner-ai-panel';
    aiWrap.innerHTML = `
      <label>AI 배너 이미지 생성</label>
      <textarea id="bnAiPrompt" rows="4" placeholder="예: 세라젬 S4와 대형 TV가 함께 보이는 프리미엄 프로모션 배경. 문자는 넣지 않음."></textarea>
      <div class="banner-ai-actions">
        <select id="bnAiStyle">
          <option value="premium">Premium</option><option value="modern">Modern</option><option value="luxury">Luxury</option>
          <option value="food">Food</option><option value="medical">Medical</option><option value="beauty">Beauty</option><option value="kids">Kids</option>
        </select>
        <button id="bnAiGenerateBtn" class="btn secondary" type="button">AI 배너 이미지 생성</button>
      </div>
      <div id="bnAiStatus" class="muted" style="margin-top:6px">생성된 이미지는 자동 업로드되어 이미지 URL에 입력됩니다.</div>
    `;
    qs('bnDescription')?.parentElement?.insertAdjacentElement('afterend', aiWrap);
  }

  if (!qs('bnMultiClickMode')) {
    const modeWrap = document.createElement('div');
    modeWrap.className = 'field full';
    modeWrap.innerHTML = `
      <label>여러 지점 연결 시 클릭 동작</label>
      <select id="bnMultiClickMode">
        <option value="chooser">지점 선택 팝업</option>
        <option value="nearest">현재 위치에서 가장 가까운 지점</option>
        <option value="primary">대표 지점 바로 열기</option>
      </select>
      <div class="muted" style="margin-top:6px">연결 업소가 2개 이상이고 별도 링크가 없을 때 적용됩니다.</div>
    `;
    qs('bnPlacement')?.parentElement?.insertAdjacentElement('afterend', modeWrap);
  }

  if (!qs('bnLivePreview')) {
    const previewWrap = document.createElement('div');
    previewWrap.className = 'field full banner-live-preview-panel';
    previewWrap.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px">
        <label style="margin:0">실제 앱 배너 미리보기</label>
        <span class="muted" id="bnPreviewPlacement">홈 카테고리 상단</span>
      </div>
      <div id="bnLivePreview" class="bn-live-preview"></div>
      <div class="muted" style="margin-top:6px">AI 콘텐츠 스튜디오에서 ‘배너 관리로 보내기’를 누른 뒤에도 이곳에서 이미지·문구·영상과 노출 위치를 확인할 수 있습니다.</div>
    `;
    qs('bnAiPrompt')?.parentElement?.insertAdjacentElement('afterend', previewWrap);
  }

  if (!qs('bnStartAt')) {
    const dateWrap = document.createElement('div');
    dateWrap.className = 'field full';
    dateWrap.innerHTML = `
      <label>노출 기간</label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <input id="bnStartAt" type="datetime-local" aria-label="노출 시작">
        <input id="bnEndAt" type="datetime-local" aria-label="노출 종료">
      </div>
    `;
    qs('bnOrder')?.parentElement?.insertAdjacentElement('afterend', dateWrap);
  }

  on('bnBusinessSearch', 'input', renderBannerBusinessOptions);
  on('bnBusinessSelect', 'change', () => {
    const bid = val('bnBusinessSelect');
    setVal('bnBusinessId', bid);
    const row = businesses.find((b) => String(b.id) === String(bid));
    if (row){ const cur=new Set(getMultiBusinessIds('bnBusinessId'));cur.add(String(bid));setMultiBusinessIds('bnBusinessId',[...cur]);setVal('bnBusinessSearch', row.name_ko || row.name_en || row.name || '');renderBusinessMultiPicker('bnBusinessId'); }
  });
  on('bnRegion', 'change', renderBannerBusinessOptions);
  on('bnLinkType', 'change', renderBannerLinkOptions);
  on('bannerImageUploadBtn', 'click', uploadBannerImageToField);
  on('bnAiGenerateBtn', 'click', generateBannerAiImage);
  qs('bnHomeCategories')?.addEventListener('change', (e)=>{
    const target=e.target;
    if(!(target instanceof HTMLInputElement)) return;
    if(target.value==='all' && target.checked){
      document.querySelectorAll('#bnHomeCategories input:not([value="all"])').forEach(x=>x.checked=false);
    }else if(target.value!=='all' && target.checked){
      const all=qs('bnHomeCategories')?.querySelector('input[value="all"]'); if(all)all.checked=false;
    }
    if(!document.querySelector('#bnHomeCategories input:checked')){
      const all=qs('bnHomeCategories')?.querySelector('input[value="all"]'); if(all)all.checked=true;
    }
  });
  qs('bnPlacement')?.addEventListener('change', updateBannerCategoryPickerState);
  document.querySelectorAll('input[name="bnMediaType"]').forEach(r=>r.addEventListener('change', () => { updateBannerMediaUI(); renderBannerLivePreview(); }));
  ['bnTitle','bnImage','bnVideoUrl','bnDescription','bnButtonLabel','bnPlacement','bnShowButton','bnAutoplay','bnMuted','bnLoop','bnMobileTap'].forEach(id => {
    const el=qs(id); if(el){ el.addEventListener('input', renderBannerLivePreview); el.addEventListener('change', renderBannerLivePreview); }
  });

  renderBannerBusinessOptions();
  renderBusinessMultiPicker('bnBusinessId');
  renderBannerLinkOptions();
  updateBannerMediaUI();
  updateBannerCategoryPickerState();
  renderBannerLivePreview();
}

function renderBannerLinkOptions() {
  const type = val('bnLinkType') || 'business';
  const target = qs('bnLinkTarget');
  const custom = qs('bnLinkCustom');
  const help = qs('bnLinkHelp');
  if (!target || !custom) return;
  target.hidden = ['business','external','phone','none'].includes(type);
  custom.hidden = !['external','phone'].includes(type);
  let rows = [];
  if (type === 'business') rows = businesses.map(x => ({id:x.id,label:x.name_ko||x.name_en||x.name||x.id}));
  if (type === 'post') rows = boards.map(x => ({id:x.id,label:x.title||`게시글 #${x.id}`}));
  if (type === 'dalpick') rows = dalpicks.map(x => ({id:x.id,label:x.title||`DalPick #${x.id}`}));
  if (type === 'coupon') rows = coupons.map(x => ({id:x.id,label:x.title||`쿠폰 #${x.id}`}));
  const current = target.dataset.value || '';
  target.innerHTML = '<option value="">대상을 선택하세요</option>' + rows.map(x=>`<option value="${esc(x.id)}">${esc(x.label)}</option>`).join('');
  if (current) target.value = current;
  if (help) help.textContent = ({business:'아래 연결 업소 체크박스에서 여러 지점을 선택하세요. 2개 이상이면 지점 선택 또는 가까운 지점 열기가 적용됩니다.',post:'특정 게시글 상세로 이동합니다.',dalpick:'DalPick 또는 추천 테마 상세를 엽니다.',coupon:'선택한 쿠폰 상세를 엽니다.',external:'웹사이트나 예약 페이지 주소를 입력하세요.',phone:'전화번호를 입력하면 클릭 시 전화 앱이 열립니다.',none:'배너는 표시되지만 클릭 동작은 없습니다.'})[type] || '';
}

function parseBannerLink(linkUrl, businessId) {
  const raw = String(linkUrl || '').trim();
  if (!raw && businessId) return {type:'business', target:String(businessId), custom:''};
  const m = raw.match(/^(post|dalpick|coupon|business):(.+)$/i);
  if (m) return {type:m[1].toLowerCase(), target:m[2], custom:''};
  if (/^tel:/i.test(raw)) return {type:'phone', target:'', custom:raw.replace(/^tel:/i,'')};
  if (raw) return {type:'external', target:'', custom:raw};
  return {type:'none', target:'', custom:''};
}

function buildBannerLink() {
  const type = val('bnLinkType') || 'business';
  const target = val('bnLinkTarget').trim();
  const custom = val('bnLinkCustom').trim();
  if (type === 'business') return ''; // 다중 업소 연결은 business_ids와 multi_click_mode로 처리
  if (['post','dalpick','coupon'].includes(type)) return target ? `${type}:${target}` : '';
  if (type === 'phone') return custom ? `tel:${custom.replace(/[^0-9+]/g,'')}` : '';
  if (type === 'external') return custom;
  return '';
}

function renderBannerBusinessOptions() {
  const sel = qs('bnBusinessSelect');
  if (!sel) return;

  const q = val('bnBusinessSearch').trim().toLowerCase();
  const region = (val('bnRegion').trim().toLowerCase() || (currentRegionScope() === 'all' ? 'dallas' : currentRegionScope()));

  let rows = Array.isArray(businesses) ? [...businesses] : [];
  if (region && region !== 'all') {
    rows = rows.filter((b) => String(b.region || '').trim().toLowerCase() === region);
  }

  if (q) {
    rows = rows.filter((b) => {
      const name = `${b.name_ko || ''} ${b.name_en || ''} ${b.name || ''} ${b.address || ''}`.toLowerCase();
      return name.includes(q);
    });
  }

  rows = rows.slice(0, 50);
  const selected = val('bnBusinessId');

  sel.innerHTML = rows.length
    ? rows.map((b) => `<option value="${esc(b.id)}" ${String(selected)===String(b.id)?'selected':''}>${esc(b.name_ko || b.name_en || b.name || '이름없음')}${b.address ? ' · ' + esc(b.address) : ''}</option>`).join('')
    : '<option value="">검색 결과 없음</option>';
}

async function uploadBannerImageToField() {
  try {
    const file = qs('bannerImageFile')?.files?.[0];
    if (!file) return alert('이미지를 먼저 선택해 주세요.');

    const region = (val('bnRegion').trim().toLowerCase() || 'dallas');
    const imageUrl = await uploadFileToStorage(file, `${region}/banner`);
    if (!imageUrl) return alert('업로드 URL 생성 실패');
    setVal('bnImage', imageUrl);
    alert('업로드 완료. 저장 버튼을 눌러 반영하세요.');
  } catch (err) {
    console.error('uploadBannerImageToField error:', err);
    alert(`이미지 업로드 실패: ${err.message || err}`);
  }
}


/* ---------------------------
   Init
--------------------------- */
async function init() {
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
    setStatus('설정 필요');
    alert('config.js에 SUPABASE_URL, SUPABASE_ANON_KEY를 넣어 주세요.');
    return;
  }

  supabase = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  await loadAdminSession();

  bindEvents();
  initAdminUserManager();
  clearBusinessForm();
  clearCouponForm();
  clearBoardForm();
  clearBannerForm();
  ensureBannerExtrasUI();
  clearSlideForm();
  switchSection('business');

  await Promise.all([loadBusinesses(), loadCoupons(), loadBanners(), loadBoards(), loadSlides(), loadBusinessStats()]);
  await loadDalpicks();
  renderSlideBusinessOptions();
  renderSlideList(filterSlides());
  
  const region = document.getElementById('regionFilter')?.value || 'all';
  const filteredBusinesses = filterBusinesses();
  const statsMap = await fetchBusinessStats(region);

  renderStatsSummary(statsMap, filteredBusinesses);
  renderTopStats(statsMap, filteredBusinesses);

  setStatus('연결됨');
  
}
// 여기 아래에 붙이면 되나?

// === KFOCUS ADMIN STATS PATCH ===

let currentRange = 'all';

function getDays(){
  if(currentRange === '7') return 7;
  if(currentRange === '30') return 30;
  return null;
}

async function fetchBusinessStats(){
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = (window.KFOCUS_CONFIG || {});
  if(!SUPABASE_URL || !SUPABASE_ANON_KEY) return {};

  const days = getDays();
  let url = `${SUPABASE_URL}/rest/v1/business_activity?select=*`;

  if(days){
    const date = new Date(Date.now() - days * 86400000).toISOString();
    url += `&created_at=gte.${date}`;
  }

  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`
    }
  });

  if(!res.ok) return {};

  const rows = await res.json();
  const map = {};

  (rows || []).forEach(r=>{
    const key = String(r.business_id || '');
    if(!key) return;

    if(!map[key]){
      map[key] = { views: 0, calls: 0, directions: 0, coupons: 0 };
    }

    if(r.action_type === 'view') map[key].views++;
    if(r.action_type === 'call') map[key].calls++;
    if(r.action_type === 'direction') map[key].directions++;
    if(r.action_type === 'coupon_use') map[key].coupons++;
  });

  return map;
}

function renderTopStats(statsMap, bizList){
  const el = document.getElementById('topStats');
  if(!el) return;

  const arr = (bizList || []).map(b=>{
    const s = statsMap[String(b.id)] || {};
    return {
      name: b.name_ko || b.name_en || b.name || `ID ${b.id}`,
      views: s.views || 0,
      calls: s.calls || 0,
      directions: s.directions || 0,
      coupons: s.coupons || 0
    };
  });

  function top(field){
    const rows = [...arr].sort((a,b)=>b[field]-a[field]).slice(0,5);

    if(!rows.length) return `
      <div class="stats-row">
        <span class="stats-name">데이터 없음</span>
        <span class="stats-value">0</span>
      </div>
    `;

    return rows.map((v,i)=>`
      <div class="stats-row">
        <span class="stats-rank">#${i+1}</span>
        <span class="stats-name">${v.name}</span>
        <span class="stats-value">${v[field]}</span>
      </div>
    `).join('');
  }

  el.innerHTML = `
    <div class="stats-card">
      <div class="stats-title">조회 TOP5</div>
      <div class="stats-list">${top('views')}</div>
    </div>
    <div class="stats-card">
      <div class="stats-title">전화 TOP5</div>
      <div class="stats-list">${top('calls')}</div>
    </div>
    <div class="stats-card">
      <div class="stats-title">길찾기 TOP5</div>
      <div class="stats-list">${top('directions')}</div>
    </div>
    <div class="stats-card">
      <div class="stats-title">쿠폰 TOP5</div>
      <div class="stats-list">${top('coupons')}</div>
    </div>
  `;
} // ✅ renderTopStats 끝


function renderStatsSummary(statsMap, bizList){
  const el = document.getElementById('statsSummary');
  if(!el) return;

  const totals = (bizList || []).reduce((acc, b)=>{
    const s = statsMap[String(b.id)] || {};
    acc.views += s.views || 0;
    acc.calls += s.calls || 0;
    acc.directions += s.directions || 0;
    acc.coupons += s.coupons || 0;
    return acc;
  }, { views:0, calls:0, directions:0, coupons:0 });

  el.innerHTML = `
    <div class="summary-card views">
      <div class="summary-label">총 조회</div>
      <div class="summary-value">${totals.views}</div>
    </div>
    <div class="summary-card calls">
      <div class="summary-label">총 전화</div>
      <div class="summary-value">${totals.calls}</div>
    </div>
    <div class="summary-card directions">
      <div class="summary-label">총 길찾기</div>
      <div class="summary-value">${totals.directions}</div>
    </div>
    <div class="summary-card coupons">
      <div class="summary-label">총 쿠폰</div>
      <div class="summary-value">${totals.coupons}</div>
    </div>
  `;
}


function getBannerMediaType(){ return document.querySelector('input[name="bnMediaType"]:checked')?.value || 'image'; }
function setBannerMediaType(value){
  const v=['image','youtube','mp4'].includes(String(value))?String(value):'image';
  document.querySelectorAll('input[name="bnMediaType"]').forEach(r=>r.checked=r.value===v);
  updateBannerMediaUI();
}
function updateBannerMediaUI(){
  const type=getBannerMediaType();
  const video=qs('bnVideoUrl'); if(video) video.closest('.banner-media-panel')?.classList.toggle('is-image',type==='image');
  if(video) video.disabled=type==='image';
  ['bnAutoplay','bnMuted','bnLoop','bnMobileTap'].forEach(id=>{const el=qs(id);if(el)el.disabled=type==='image';});
  const image=qs('bnImage'); if(image) image.required=type==='image';
}
function bannerPreviewYoutubeId(url){
  const raw=String(url||'').trim();
  const m=raw.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{6,})/i);
  return m ? m[1] : '';
}
function renderBannerLivePreview(){
  const box=qs('bnLivePreview'); if(!box)return;
  const title=val('bnTitle').trim() || '배너 제목 미리보기';
  const desc=val('bnDescription').trim();
  const image=val('bnImage').trim();
  const video=val('bnVideoUrl').trim();
  const type=getBannerMediaType();
  const placement=val('bnPlacement')||'home';
  const placementText={home:'홈 카테고리 상단',detail:'업소 상세 상단',both:'홈 + 업소 상세'}[placement]||placement;
  const placementEl=qs('bnPreviewPlacement'); if(placementEl)placementEl.textContent=placementText;
  let media='';
  if(type==='youtube' && video){
    const id=bannerPreviewYoutubeId(video);
    media=id?`<div class="bn-preview-media"><img src="https://img.youtube.com/vi/${esc(id)}/hqdefault.jpg" alt=""><span class="bn-preview-play">▶</span></div>`:`<div class="bn-preview-empty">YouTube URL을 확인해 주세요.</div>`;
  }else if(type==='mp4' && video){
    media=`<video class="bn-preview-media" src="${esc(video)}" poster="${esc(image)}" ${checked('bnMuted')?'muted':''} ${checked('bnLoop')?'loop':''} controls playsinline></video>`;
  }else if(image){
    media=`<img class="bn-preview-media" src="${esc(image)}" alt="${esc(title)}">`;
  }else{
    media='<div class="bn-preview-empty">이미지를 업로드하거나 AI 배너 이미지를 생성해 주세요.</div>';
  }
  const showButton=checked('bnShowButton');
  box.innerHTML=`<div class="bn-preview-card">${media}<div class="bn-preview-overlay"><strong>${esc(title)}</strong>${desc?`<p>${esc(desc)}</p>`:''}${showButton?`<span>${esc(val('bnButtonLabel').trim()||'자세히 보기')}</span>`:''}</div></div>`;
}

function dataUrlToBlob(dataUrl){
  const [head,body]=String(dataUrl||'').split(',');
  const mime=(head.match(/data:([^;]+)/)||[])[1]||'image/png';
  const bin=atob(body||''); const bytes=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
  return new Blob([bytes],{type:mime});
}
async function generateBannerAiImage(){
  const title=val('bnTitle').trim();
  const notes=val('bnAiPrompt').trim();
  if(!title)return alert('배너 제목을 먼저 입력해 주세요.');
  if(!notes)return alert('AI 이미지 설명을 입력해 주세요.');
  const ids=getMultiBusinessIds('bnBusinessId');
  const names=ids.map(id=>businesses.find(b=>String(b.id)===String(id))).filter(Boolean);
  const businessName=names.map(b=>b.name_ko||b.name_en||b.name).join(', ') || 'DalTownMap local business';
  const category=names.map(b=>b.category||b.category_ko||'').filter(Boolean).join(', ');
  const btn=qs('bnAiGenerateBtn'); const status=qs('bnAiStatus'); const old=btn?.textContent;
  if(btn){btn.disabled=true;btn.textContent='이미지 생성 중...';} if(status)status.textContent='OpenAI에서 배경 이미지를 생성하고 있습니다.';
  try{
    const res=await fetch('/.netlify/functions/generate-campaign-image',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({asset:'banner',businessName,campaignName:title,benefit:val('bnDescription').trim(),category,style:val('bnAiStyle')||'premium',notes})});
    const j=await res.json().catch(()=>({})); if(!res.ok)throw new Error(j.error||'이미지 생성 실패');
    const blob=dataUrlToBlob(`data:image/png;base64,${j.b64_json}`);
    let url='';
    if(window.KFocusAdminBridge?.uploadGeneratedImage){url=await window.KFocusAdminBridge.uploadGeneratedImage(blob,`banner-${Date.now()}.png`);}
    if(!url){
      const file=new File([blob],`banner-${Date.now()}.png`,{type:'image/png'});
      const path=`banners/${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
      const up=await supabase.storage.from('campaign-assets').upload(path,file,{contentType:'image/png',upsert:false});
      if(up.error)throw up.error; url=supabase.storage.from('campaign-assets').getPublicUrl(path).data.publicUrl;
    }
    setVal('bnImage',url); setBannerMediaType('image'); renderBannerLivePreview();
    if(status)status.textContent='AI 이미지 생성과 업로드가 완료되었습니다.';
    alert('AI 배너 이미지가 생성되었습니다. 미리 확인한 뒤 저장하세요.');
  }catch(e){console.error(e);if(status)status.textContent=`생성 실패: ${e.message}`;alert(`AI 이미지 생성 실패: ${e.message}`);}finally{if(btn){btn.disabled=false;btn.textContent=old||'AI 배너 이미지 생성';}}
}

function getBannerHomeCategories(){
  const checkedRows=[...document.querySelectorAll('#bnHomeCategories input[type="checkbox"]:checked')].map(x=>x.value);
  return checkedRows.length ? checkedRows : ['all'];
}
function setBannerHomeCategories(values){
  const rows=Array.isArray(values)?values.map(String):[];
  const selected=new Set(rows.length?rows:['all']);
  document.querySelectorAll('#bnHomeCategories input[type="checkbox"]').forEach(x=>{x.checked=selected.has(x.value);});
  updateBannerCategoryPickerState();
}
function updateBannerCategoryPickerState(){
  const all=qs('bnHomeCategories')?.querySelector('input[value="all"]');
  const specifics=[...document.querySelectorAll('#bnHomeCategories input[type="checkbox"]:not([value="all"])')];
  if(all?.checked) specifics.forEach(x=>x.checked=false);
  const placement=val('bnPlacement')||'home';
  const picker=qs('bnHomeCategories');
  if(picker){
    const disabled=placement==='detail';
    picker.style.opacity=disabled?'.5':'1';
    picker.querySelectorAll('input').forEach(x=>x.disabled=disabled);
  }
}

// =============================
// BANNER MANAGEMENT
// =============================
function clearBannerForm() {
  setVal('bnId', '');
  setVal('bnTitle', '');
  setVal('bnImage', '');
  setVal('bnVideoUrl', '');
  setBannerMediaType('image');
  setChecked('bnAutoplay', false); setChecked('bnMuted', true); setChecked('bnLoop', true); setChecked('bnMobileTap', true);
  setVal('bnAiPrompt', ''); setVal('bnAiStyle', 'premium'); setVal('bnMultiClickMode','chooser');
  setVal('bnLink', '');
  setVal('bnLinkType', 'business');
  const linkTarget = qs('bnLinkTarget'); if (linkTarget) { linkTarget.dataset.value=''; linkTarget.value=''; }
  setVal('bnLinkCustom', '');
  setVal('bnRegion', currentRegionScope() === 'all' ? 'dallas' : currentRegionScope());
  setVal('bnOrder', '0');
  setChecked('bnActive', true);
  setVal('bnBusinessId', '');setMultiBusinessIds('bnBusinessId', []);
  setVal('bnBusinessSearch', '');
  setVal('bnDisplayType', 'banner');
  setVal('bnPlacement', 'home');
  setBannerHomeCategories(['all']);
  setVal('bnDescription', '');
  setVal('bnButtonLabel', '자세히 보기');
  setChecked('bnShowButton', true);
  const bnBtnInput = qs('bnButtonLabel'); if (bnBtnInput) { bnBtnInput.disabled = false; bnBtnInput.style.opacity = '1'; }
  setVal('bnStartAt', '');
  setVal('bnEndAt', '');
  const sel = qs('bnBusinessSelect'); if (sel) sel.innerHTML = '<option value="">업소를 검색하세요</option>';
  renderBannerLinkOptions();
  renderBannerLivePreview();
}

function fillBannerForm(row) {
  if (!row) return clearBannerForm();
  setVal('bnId', row.id || '');
  setVal('bnTitle', row.title || '');
  setVal('bnImage', row.image_url || '');
  setVal('bnVideoUrl', row.video_url || '');
  setBannerMediaType(row.media_type || (row.video_url ? (String(row.video_url).includes('youtu')?'youtube':'mp4') : 'image'));
  setChecked('bnAutoplay', row.autoplay === true); setChecked('bnMuted', row.muted !== false); setChecked('bnLoop', row.loop !== false); setChecked('bnMobileTap', row.mobile_tap !== false);
  setVal('bnAiPrompt', row.ai_prompt || ''); setVal('bnAiStyle', row.ai_style || 'premium'); setVal('bnMultiClickMode',row.multi_click_mode || 'chooser');
  setVal('bnLink', row.link_url || '');
  const parsedLink = parseBannerLink(row.link_url, row.business_id);
  setVal('bnLinkType', parsedLink.type);
  setVal('bnLinkCustom', parsedLink.custom);
  const linkTarget = qs('bnLinkTarget'); if (linkTarget) linkTarget.dataset.value = parsedLink.target || '';
  setVal('bnRegion', row.region || '');
  setVal('bnOrder', row.sort_order == null ? '0' : String(row.sort_order));
  setChecked('bnActive', row.is_active !== false);
  setVal('bnBusinessId', row.business_id || '');setMultiBusinessIds('bnBusinessId', normalizeLinkedBusinessIds(row));
  setVal('bnBusinessSearch', '');
  setVal('bnDisplayType', row.display_type || 'banner');
  setVal('bnPlacement', row.placement || (row.business_id ? 'both' : 'home'));
  setBannerHomeCategories(row.home_categories || row.categories || ['all']);
  setVal('bnDescription', row.description || '');
  const hasBannerButton = String(row.button_label || '').trim() !== '';
  setChecked('bnShowButton', hasBannerButton);
  setVal('bnButtonLabel', hasBannerButton ? row.button_label : '');
  const bnBtnInput = qs('bnButtonLabel'); if (bnBtnInput) { bnBtnInput.disabled = !hasBannerButton; bnBtnInput.style.opacity = hasBannerButton ? '1' : '.55'; }
  setVal('bnStartAt', fmtLocal(row.start_at));
  setVal('bnEndAt', fmtLocal(row.end_at));
  if (typeof renderBannerBusinessOptions === 'function') setTimeout(() => { renderBannerBusinessOptions(); const sel = qs('bnBusinessSelect'); if (sel && row.business_id) sel.value = String(row.business_id); renderBannerLinkOptions(); const target=qs('bnLinkTarget'); if(target && parsedLink.target) target.value=String(parsedLink.target); }, 0);
}

function bannerCardAdminHTML(b) {
  const activeClass = String(val('bnId')) === String(b.id) ? ' active' : '';
  return `
    <div class="biz-item banner-row${activeClass}" data-banner-id="${esc(b.id)}">
      <img
        class="biz-thumb"
        src="${esc(b.image_url || 'https://placehold.co/120x80?text=Video')}"
        alt="${esc(b.title || '배너')}"
      />
      <div class="biz-main">
        <div class="biz-title">${esc(b.title || '배너')}</div>
        <div class="biz-meta">${esc(b.region || '')}${b.sort_order != null ? ` · ${esc(String(b.sort_order))}` : ''}</div>
        <div class="biz-meta">${esc(b.display_type === 'card' ? '카드형' : '배너형')} · ${esc(b.media_type==='youtube'?'YouTube':b.media_type==='mp4'?'MP4':'이미지')} · ${esc(b.placement || (b.business_id ? 'both' : 'home'))} · ${b.is_active === false ? '비활성' : '활성'}</div>
        <div class="biz-meta">홈 카테고리: ${esc((Array.isArray(b.home_categories)&&b.home_categories.length?b.home_categories:['all']).map(x=>x==='all'?'전체 홈':x).join(', '))}</div>
        <div class="biz-meta">연결 업소 ${normalizeLinkedBusinessIds(b).length}개</div>
      </div>
      <div class="biz-actions">
        <button class="btn ghost banner-edit-btn" type="button" data-id="${esc(b.id)}">수정</button>
        <button class="btn danger banner-delete-btn" type="button" data-id="${esc(b.id)}">삭제</button>
      </div>
    </div>
  `;
}

async function loadBanners() {
  if (!supabase) return;
  const listEl = qs('bannerList');
  if (!listEl) return;

const { data, error } = await supabase
    .from('banners')
    .select('*')
    .eq('region', getAppRegion())
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('loadBanners error:', error);
    listEl.innerHTML = '<div class="board-empty">배너를 불러오지 못했습니다.</div>';
    return;
  }

  banners = Array.isArray(data) ? data : [];
  window.KFocusAdminBridge = window.KFocusAdminBridge || {};
  window.KFocusAdminBridge.getBanners = () => [...banners];
  window.dispatchEvent(new CustomEvent('kfocus:banners-loaded', {detail:[...banners]}));

  listEl.innerHTML = banners.length
    ? banners.map(bannerCardAdminHTML).join('')
    : '<div class="board-empty">등록된 배너가 없습니다.</div>';

  listEl.querySelectorAll('.banner-row').forEach((rowEl) => {
    rowEl.addEventListener('click', () => {
      const id = rowEl.dataset.bannerId;
      const row = banners.find((b) => String(b.id) === String(id));
      if (!row) return;
      fillBannerForm(row);
      loadBanners();
    });
  });

  listEl.querySelectorAll('.banner-edit-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const row = banners.find((b) => String(b.id) === String(id));
      if (!row) return;
      fillBannerForm(row);
      loadBanners();
    });
  });

  listEl.querySelectorAll('.banner-delete-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      if (!id) return;

      if (!confirm('삭제?')) return;

      const { error } = await supabase
        .from('banners')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('deleteBanner error:', error);
        alert(`삭제 실패: ${error.message}`);
        return;
      }

      if (String(val('bnId')) === String(id)) clearBannerForm();
      await loadBanners();
      alert('삭제 완료');
    });
  });
}

async function saveBanner() {
  if (!supabase) return;

  const payload = {
    title: val('bnTitle').trim(),
    image_url: val('bnImage').trim() || null,
    media_type: getBannerMediaType(),
    video_url: val('bnVideoUrl').trim() || null,
    autoplay: checked('bnAutoplay'), muted: checked('bnMuted'), loop: checked('bnLoop'), mobile_tap: checked('bnMobileTap'),
    ai_prompt: val('bnAiPrompt').trim() || null, ai_style: val('bnAiStyle') || 'premium',
    multi_click_mode: val('bnMultiClickMode') || 'chooser',
    link_url: buildBannerLink(),
    business_ids: getMultiBusinessIds('bnBusinessId'),
    business_id: getMultiBusinessIds('bnBusinessId')[0] || null,
    region: getAppRegion(),
    display_type: val('bnDisplayType') || 'banner',
    placement: val('bnPlacement') || 'home',
    home_categories: getBannerHomeCategories(),
    description: val('bnDescription').trim() || null,
    button_label: checked('bnShowButton') ? (val('bnButtonLabel').trim() || '자세히 보기') : '',
    start_at: fromLocal(val('bnStartAt')),
    end_at: fromLocal(val('bnEndAt')),
    sort_order: Number(val('bnOrder') || 0),
    is_active: checked('bnActive')
  };

  if (!payload.title) return alert('배너 제목을 입력해 주세요.');
  if (payload.media_type === 'image' && !payload.image_url) return alert('이미지 배너는 이미지 URL이 필요합니다.');
  if (payload.media_type !== 'image' && !payload.video_url) return alert('영상 배너는 영상 URL이 필요합니다.');
  if (payload.media_type !== 'image' && !payload.image_url) return alert('모바일 썸네일과 영상 로딩 전 표시를 위해 대표 이미지 URL을 입력해 주세요.');
  if (['detail','both'].includes(payload.placement) && !payload.business_ids.length) return alert('업소 상세에 노출하려면 연결 업소를 하나 이상 선택해 주세요.');
  const linkType = val('bnLinkType') || 'business';
  if (['post','dalpick','coupon'].includes(linkType) && !val('bnLinkTarget').trim()) return alert('클릭 연결 대상을 선택해 주세요.');
  if (linkType==='business' && !payload.business_ids.length && !val('bnLinkTarget').trim()) return alert('연결 업소를 하나 이상 선택해 주세요.');
  if (['external','phone'].includes(linkType) && !val('bnLinkCustom').trim()) return alert('클릭 연결 주소 또는 전화번호를 입력해 주세요.');

  const id = val('bnId');
  let result;

  if (id) {
    result = await supabase
      .from('banners')
      .update(payload)
      .eq('id', id)
      .select();
  } else {
    result = await supabase
      .from('banners')
      .insert([payload])
      .select();
  }

  if (result.error) {
    console.error('saveBanner error:', result.error);
    alert(`저장 실패: ${result.error.message}`);
    return;
  }

  if (!result.data || !result.data.length) {
    alert('저장은 요청됐지만 반영된 행이 없습니다. id 값 또는 RLS 정책을 확인하세요.');
    return;
  }

  fillBannerForm(result.data[0]);
  await loadBanners();
  alert('배너 저장 완료');
}

document.addEventListener('click', async (e)=>{
  const btn = e.target.closest('.stat-filter');
  if(!btn) return;

  currentRange = btn.dataset.range || 'all';

  document.querySelectorAll('.stat-filter').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');

  const statsMap = await fetchBusinessStats();
  renderTopStats(statsMap, businesses || []);

  // 기존 리스트도 그대로 다시 그림
  renderBusinessList(filterBusinesses());
});

// init()가 이미 아래에서 호출되면 이 줄은 넣지 마세요.
// document.addEventListener('DOMContentLoaded', init);


document.addEventListener('DOMContentLoaded', init);


function showSection(name) {
  switchSection(name);
}


// ===== minimal admin session loader =====
async function loadAdminSession() {
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    alert('로그인이 필요합니다.');
    sessionStorage.setItem('adminLogin', '1');
    window.location.href = '/';
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, area')
    .eq('user_id', user.id)
    .maybeSingle();

  if (profileError) {
    alert('관리자 정보 조회 실패: ' + profileError.message);
    console.error(profileError);
    sessionStorage.setItem('adminLogin', '1');
    window.location.href = '/';
    return null;
  }

  if (!profile) {
    alert('관리자 권한이 없습니다.');
    sessionStorage.setItem('adminLogin', '1');
    window.location.href = '/';
    return null;
  }

  window.ADMIN_ROLE = profile.role || '';
  window.ADMIN_AREA = profile.area || '';
  console.log('ADMIN_ROLE:', window.ADMIN_ROLE);
  console.log('ADMIN_AREA:', window.ADMIN_AREA);
  applyAdminRegionUI();
  return profile;
}

// ===== ADMIN USER MANAGER (SUPER ADMIN ONLY) =====
function initAdminUserManager() {
    if (window.ADMIN_ROLE !== 'super_admin') return;

    const btn = document.getElementById('saveAdminUserBtn');
    if (!btn) return;

    btn.addEventListener('click', async () => {
        const email = document
            .getElementById('adminEmailInput')
            .value
            .trim()
            .toLowerCase();

        const role = document
            .getElementById('adminRoleSelect')
            .value;

        const area = document
            .getElementById('adminAreaSelect')
            .value;

        if (!email) {
            alert('이메일을 입력하세요.');
            return;
        }

        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = '저장 중...';

        try {
            const response = await fetch(
                '/.netlify/functions/set-admin-user',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        email,
                        role,
                        area
                    })
                }
            );

            const result = await response.json();

            if (!response.ok) {
                throw new Error(
                    result.error ||
                    '관리자 권한 저장에 실패했습니다.'
                );
            }

            alert(
                `관리자 권한 저장 완료\n\n` +
                `이메일: ${result.user.email}\n` +
                `권한: ${result.profile.role}\n` +
                `지역: ${result.profile.area}`
            );
        } catch (error) {
            console.error('set-admin-user error:', error);
            alert(`저장 실패: ${error.message}`);
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    });
}
window.adminLogout = async function () {
  try {
    if (window.supabaseClient) {
      await window.supabaseClient.auth.signOut();
    }
  } catch (e) {
    console.error(e);
  }

  sessionStorage.setItem('adminLogin', '1');
  window.location.href = '/';
};
document.getElementById('sendPushBtn')?.addEventListener('click', async () => {
  const title = document.getElementById('pushTitle').value;
  const message = document.getElementById('pushMessage').value;
  const region = document.getElementById('pushRegion').value;

  if (!title || !message) {
    alert('제목과 내용을 입력하세요');
    return;
  }

  try {
    const res = await fetch('/.netlify/functions/sendPush', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, message, region })
    });

    const data = await res.json();

    if (res.ok) {
      alert('푸시 발송 완료');
    } else {
      alert('실패: ' + data.error);
    }

  } catch (err) {
    console.error(err);
    alert('에러 발생');
  }
});
// ===== PUSH SEND UI =====
document.addEventListener('DOMContentLoaded', () => {
  if (window.ADMIN_ROLE === 'regional_editor') {
    const regionEl = document.getElementById('pushRegion');
    if (regionEl) {
      regionEl.value = window.ADMIN_AREA || 'dallas';
      regionEl.disabled = true;
    }
  }

  document.getElementById('sendPushBtn')?.addEventListener('click', async () => {
    const title = document.getElementById('pushTitle')?.value?.trim() || '';
    const message = document.getElementById('pushMessage')?.value?.trim() || '';
    let region = document.getElementById('pushRegion')?.value || 'all';

    if (!title || !message) {
      alert('제목과 내용을 입력하세요.');
      return;
    }

    if (window.ADMIN_ROLE === 'regional_editor') {
      region = window.ADMIN_AREA || region;
    }

    try {
      const res = await fetch('/.netlify/functions/sendPush', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, message, region })
      });

      const text = await res.text();
      let data = {};
      try { data = JSON.parse(text); } catch (e) {}

      if (!res.ok) {
        alert('푸시 발송 실패: ' + (data.error || text || '알 수 없는 오류'));
        return;
      }

      alert('푸시 발송 완료');
    } catch (err) {
      console.error(err);
      alert('푸시 발송 중 오류가 발생했습니다.');
    }
  });
});
async function loadPerformanceCenter(){
  const status=qs('performanceStatus');
  try{
    const since=new Date(Date.now()-30*86400000).toISOString();
    const {data,error}=await supabase.from('content_events').select('event_type,business_id,content_id,created_at').gte('created_at',since);
    if(error) throw error;
    const rows=data||[]; const count=t=>rows.filter(r=>r.event_type===t).length;
    safeText('metricArticleViews',count('article_view')); safeText('metricAiPickClicks',count('ai_pick_click'));
    safeText('metricPhoneClicks',count('phone_click')); safeText('metricDirectionClicks',count('direction_click')); safeText('metricWebsiteClicks',count('website_click'));
    const grouped={}; rows.forEach(r=>{const k=r.business_id||'unlinked'; grouped[k]??={total:0,views:0,actions:0}; grouped[k].total++; if(r.event_type==='article_view')grouped[k].views++; else grouped[k].actions++;});
    const el=qs('performanceBusinessList'); if(el) el.innerHTML=Object.entries(grouped).map(([id,v])=>{const b=businesses.find(x=>String(x.id)===String(id)); return `<div class="performance-row"><strong>${esc(b?.name_ko||b?.name_en||'연결 업소 없음')}</strong><span>조회 ${v.views}</span><span>행동 ${v.actions}</span><span>총 ${v.total}</span></div>`}).join('')||'<div class="muted">최근 30일 데이터가 없습니다.</div>';
    safeText('performanceStatus','최근 30일 기준 · 관리자만 볼 수 있습니다.');
  }catch(e){ safeText('performanceStatus',`성과 테이블 연결 필요: ${e.message}`); }
}

console.log('[DalTownMap Admin] v9.0 unified image manager loaded');

// ===== v21 DalPick-Centered AI Content Studio =====
let contentStudioSuite = null;
let contentStudioTypes = [];
let contentStudioAnalysis = null;
const CONTENT_STUDIO_HISTORY_KEY = 'daltownmap_content_studio_v21_history';

function csEl(id){ return document.getElementById(id); }
function csValue(id){ return csEl(id)?.value?.trim?.() || ''; }
function csChecked(id){ return !!csEl(id)?.checked; }
function csStatus(text, tone='normal'){
  const el=csEl('csStatus'); if(!el)return;
  el.textContent=text;
  el.style.color=tone==='error'?'#b91c1c':tone==='success'?'#047857':'#475569';
}
function csBusinessOptions(){
  const el=csEl('csBusiness'); if(!el)return;
  const current=el.value;
  el.innerHTML='<option value="">연결 업소 없음</option>'+businesses.map(b=>`<option value="${esc(b.id)}">${esc(b.name_ko||b.name_en||b.id)}</option>`).join('');
  el.value=current;
}
function csSelectedTypes(){
  return ['dalpick','coupon','banner','social','push','video','image_prompt'].filter(x=>x==='dalpick'||csChecked(`csType_${x}`));
}
function csLoadHistory(){
  try{return JSON.parse(localStorage.getItem(CONTENT_STUDIO_HISTORY_KEY)||'[]');}catch{return [];}
}
function csSaveHistory(entry){
  const list=csLoadHistory(); list.unshift(entry);
  localStorage.setItem(CONTENT_STUDIO_HISTORY_KEY,JSON.stringify(list.slice(0,20)));
  csRenderHistory();
}
function csRenderHistory(){
  const box=csEl('csHistory'); if(!box)return;
  const list=csLoadHistory();
  box.innerHTML=list.length?list.map((x,i)=>`<button type="button" class="cs-history-item" data-cs-history="${i}" style="width:100%;text-align:left;padding:10px;border:1px solid #e2e8f0;border-radius:10px;background:white;margin-bottom:8px"><strong>${esc(x.title||'캠페인')}</strong><div style="font-size:12px;color:#64748b;margin-top:3px">${esc(x.created_at||'')}</div></button>`).join(''):'<div style="font-size:13px;color:#64748b">아직 생성한 캠페인이 없습니다.</div>';
}
function csGetEditedSuite(){
  if(!contentStudioSuite)return null;
  const s=structuredClone(contentStudioSuite);
  const get=(id,fallback='')=>csEl(id)?.value ?? fallback;
  if(s.dalpick){s.dalpick.title=get('cs_dalpick_title',s.dalpick.title);s.dalpick.summary=get('cs_dalpick_summary',s.dalpick.summary);s.dalpick.content=get('cs_dalpick_content',s.dalpick.content);s.dalpick.image_prompt=get('cs_dalpick_prompt',s.dalpick.image_prompt);}
  if(s.coupon){s.coupon.title=get('cs_coupon_title',s.coupon.title);s.coupon.discount_label=get('cs_coupon_discount',s.coupon.discount_label);s.coupon.description=get('cs_coupon_description',s.coupon.description);s.coupon.coupon_code=get('cs_coupon_code',s.coupon.coupon_code);}
  if(s.banner){s.banner.title=get('cs_banner_title',s.banner.title);s.banner.description=get('cs_banner_description',s.banner.description);s.banner.button_label=get('cs_banner_button',s.banner.button_label);s.banner.image_prompt=get('cs_banner_prompt',s.banner.image_prompt);}
  if(s.social){s.social.instagram=get('cs_social_instagram',s.social.instagram);s.social.facebook=get('cs_social_facebook',s.social.facebook);s.social.short_caption=get('cs_social_short',s.social.short_caption);}
  if(s.push){s.push.title=get('cs_push_title',s.push.title);s.push.message=get('cs_push_message',s.push.message);}
  if(s.video){s.video.hook=get('cs_video_hook',s.video.hook);s.video.script=get('cs_video_script',s.video.script);s.video.thumbnail_text=get('cs_video_thumb',s.video.thumbnail_text);}
  return s;
}
function csCard(title,body,actions,type,badge='초안'){
  return `<article class="cs-card" data-type="${type}" style="border:1px solid #dbe3ee;border-radius:16px;background:#fff;padding:16px;box-shadow:0 3px 12px rgba(15,23,42,.05)"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:12px"><h3 style="margin:0;font-size:17px">${title}</h3><span style="font-size:12px;padding:4px 8px;background:#f1f5f9;border-radius:999px">${badge}</span></div>${body}<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">${actions}</div></article>`;
}
function csRecommendationLabel(type){
  return ({coupon:'쿠폰',banner:'배너',social:'SNS',push:'푸시 알림',video:'숏폼 영상',image_prompt:'이미지'})[type]||type;
}
function csRenderRecommendations(suite){
  const box=csEl('csRecommendations'); if(!box)return;
  const list=Array.isArray(suite.recommendations)?suite.recommendations:[];
  box.innerHTML=list.length?list.map(r=>`<label style="display:flex;gap:10px;align-items:flex-start;padding:10px;border:1px solid ${r.recommended?'#bbf7d0':'#e2e8f0'};background:${r.recommended?'#f0fdf4':'#f8fafc'};border-radius:10px;margin-bottom:8px"><input type="checkbox" data-cs-rec-type="${esc(r.type)}" ${r.recommended?'checked':''} style="margin-top:3px"><span><strong>${r.recommended?'추천':'선택 사항'} · ${esc(csRecommendationLabel(r.type))}</strong><div style="font-size:12px;color:#64748b;margin-top:3px">${esc(r.reason||'')}</div></span></label>`).join(''):'<div class="muted">추천 결과가 없습니다.</div>';
}
function csChecklistHtml(items){
  const icon={pass:'✓',warning:'!',info:'i'};
  const bg={pass:'#ecfdf5',warning:'#fff7ed',info:'#eff6ff'};
  const border={pass:'#a7f3d0',warning:'#fed7aa',info:'#bfdbfe'};
  return (items||[]).map(x=>`<div style="display:flex;gap:10px;padding:10px;border:1px solid ${border[x.status]||'#e2e8f0'};background:${bg[x.status]||'#f8fafc'};border-radius:10px;margin-bottom:8px"><strong style="width:20px">${icon[x.status]||'•'}</strong><div><strong>${esc(x.label||'점검')}</strong><div style="font-size:12px;color:#64748b;margin-top:2px">${esc(x.message||'')}</div></div></div>`).join('');
}
function csRenderSuite(suite, selectedTypes=['dalpick']){
  contentStudioSuite=suite;
  contentStudioTypes=[...new Set(['dalpick',...selectedTypes])];
  const box=csEl('csResults'); if(!box)return;
  const cards=[];
  const input=(id,label,value)=>`<label style="display:block;font-size:12px;font-weight:700;margin:9px 0 4px">${label}</label><input id="${id}" value="${esc(value||'')}" style="width:100%;padding:9px;border:1px solid #cbd5e1;border-radius:9px">`;
  const area=(id,label,value,rows=5)=>`<label style="display:block;font-size:12px;font-weight:700;margin:9px 0 4px">${label}</label><textarea id="${id}" rows="${rows}" style="width:100%;padding:9px;border:1px solid #cbd5e1;border-radius:9px;resize:vertical">${esc(value||'')}</textarea>`;
  if(suite.dalpick)cards.push(csCard('1. DalPick 원본 기사',input('cs_dalpick_title','제목',suite.dalpick.title)+area('cs_dalpick_summary','요약',suite.dalpick.summary,3)+area('cs_dalpick_content','본문',suite.dalpick.content,11)+area('cs_dalpick_prompt','대표 이미지 프롬프트',suite.dalpick.image_prompt,4),'<button type="button" class="btn primary" data-cs-action="apply-dalpick">DalPick 입력란으로 보내기</button><button type="button" class="btn secondary" data-cs-action="copy-dalpick-prompt">이미지 프롬프트 복사</button>','dalpick','원본'));
  if(contentStudioTypes.includes('coupon')&&suite.coupon)cards.push(csCard('쿠폰',input('cs_coupon_title','제목',suite.coupon.title)+input('cs_coupon_discount','혜택',suite.coupon.discount_label)+area('cs_coupon_description','설명',suite.coupon.description,4)+input('cs_coupon_code','쿠폰 코드',suite.coupon.coupon_code),'<button type="button" class="btn primary" data-cs-action="apply-coupon">쿠폰 입력란으로 보내기</button>','coupon'));
  if(contentStudioTypes.includes('banner')&&suite.banner)cards.push(csCard('배너',input('cs_banner_title','제목',suite.banner.title)+area('cs_banner_description','설명',suite.banner.description,3)+input('cs_banner_button','버튼 문구',suite.banner.button_label)+area('cs_banner_prompt','이미지 프롬프트',suite.banner.image_prompt,4),'<button type="button" class="btn primary" data-cs-action="apply-banner">배너 입력란으로 보내기</button><button type="button" class="btn secondary" data-cs-action="copy-banner-prompt">이미지 프롬프트 복사</button>','banner'));
  if(contentStudioTypes.includes('social')&&suite.social)cards.push(csCard('SNS 문구',area('cs_social_instagram','Instagram',suite.social.instagram,6)+area('cs_social_facebook','Facebook',suite.social.facebook,6)+area('cs_social_short','짧은 캡션',suite.social.short_caption,3),'<button type="button" class="btn secondary" data-cs-action="copy-social">전체 복사</button>','social'));
  if(contentStudioTypes.includes('push')&&suite.push)cards.push(csCard('푸시 알림',input('cs_push_title','제목',suite.push.title)+area('cs_push_message','메시지',suite.push.message,3),'<button type="button" class="btn primary" data-cs-action="apply-push">푸시 입력란으로 보내기</button><button type="button" class="btn secondary" data-cs-action="copy-push">복사</button>','push'));
  if(contentStudioTypes.includes('video')&&suite.video)cards.push(csCard('숏폼 영상',input('cs_video_hook','첫 문장',suite.video.hook)+area('cs_video_script','30~45초 대본',suite.video.script,8)+input('cs_video_thumb','썸네일 문구',suite.video.thumbnail_text),'<button type="button" class="btn secondary" data-cs-action="copy-video">대본 복사</button>','video'));
  const strategy=`<div style="padding:14px;border:1px solid #c7d2fe;background:#eef2ff;border-radius:14px;margin-bottom:14px"><strong>AI 캠페인 전략</strong><div style="font-size:13px;color:#475569;margin-top:6px;line-height:1.55">${esc(suite.strategy_summary||'')}</div></div>`;
  const recommendation=`<div class="card" style="padding:16px;margin-bottom:14px"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><div><h3 style="margin:0">2. AI 파생 콘텐츠 추천</h3><div style="font-size:12px;color:#64748b;margin-top:4px">추천 항목을 수정한 뒤 카드 표시를 갱신할 수 있습니다.</div></div><button type="button" class="btn primary" data-cs-action="apply-recommendations">추천 항목 적용</button></div><div id="csRecommendations" style="margin-top:12px"></div></div>`;
  const checklist=`<div class="card" style="padding:16px;margin-top:14px"><h3 style="margin-top:0">3. 발행 전 AI 체크리스트</h3>${csChecklistHtml(suite.checklist)}</div>`;
  box.innerHTML=`${strategy}${recommendation}<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px"><div><h2 style="margin:0">${esc(suite.campaign_title||'생성 결과')}</h2><div style="font-size:13px;color:#64748b;margin-top:4px">DalPick을 원본으로 만들고 선택된 콘텐츠를 같은 메시지로 파생했습니다.</div></div><button type="button" class="btn secondary" data-cs-action="save-history">작업 보관</button></div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(310px,1fr));gap:14px">${cards.join('')}</div>${checklist}`;
  csRenderRecommendations(suite);
}
async function csCopy(text){
  try{await navigator.clipboard.writeText(text);csStatus('클립보드에 복사했습니다.','success');}catch{prompt('아래 내용을 복사하세요.',text);}
}
function csApply(type){
  const s=csGetEditedSuite(); if(!s)return;
  const businessId=csValue('csBusiness');
  if(type==='dalpick'){
    setVal('dalpick_title',s.dalpick.title);setVal('dalpick_summary',s.dalpick.summary);setVal('dalpick_content',s.dalpick.content);setVal('dalpick_image_instruction',s.dalpick.image_prompt||'');setVal('dalpick_business_id',businessId);
    switchSection('dalpick'); updateDalpickTypeUI(); csStatus('DalPick 입력란으로 이동했습니다. 내용을 확인하고 기존 저장 버튼을 누르세요.','success');
  }else if(type==='coupon'){
    setVal('coupon_title',s.coupon.title);setVal('coupon_discount_label',s.coupon.discount_label);setVal('coupon_description',s.coupon.description);setVal('coupon_code',s.coupon.coupon_code);setVal('coupon_business_id',businessId);
    switchSection('coupon'); csStatus('쿠폰 입력란으로 이동했습니다. 기간과 활성 여부를 확인한 후 저장하세요.','success');
  }else if(type==='banner'){
    setVal('bnTitle',s.banner.title);setVal('bnDescription',s.banner.description);setVal('bnButtonLabel',s.banner.button_label);setVal('bnAiPrompt',s.banner.image_prompt||'');setVal('bnBusinessId',businessId);setMultiBusinessIds('bnBusinessId',businessId?[businessId]:[]);if(csEl('bnBusinessSelect'))setVal('bnBusinessSelect',businessId);renderBusinessMultiPicker('bnBusinessId');
    switchSection('banners'); csStatus('배너 입력란으로 이동했습니다. AI 이미지 생성 버튼으로 실제 이미지를 만든 뒤 저장할 수 있습니다.','success');
  }else if(type==='push'){
    setVal('pushTitle',s.push.title);setVal('pushMessage',s.push.message);switchSection('push');csStatus('푸시 입력란으로 이동했습니다. 대상 지역과 내용을 확인한 후 발송하세요.','success');
  }
}
function csApplyRecommendations(){
  const selected=['dalpick'];
  document.querySelectorAll('[data-cs-rec-type]:checked').forEach(el=>selected.push(el.dataset.csRecType));
  contentStudioTypes=[...new Set(selected)];
  const checkboxMap={coupon:'csType_coupon',banner:'csType_banner',social:'csType_social',push:'csType_push',video:'csType_video',image_prompt:'csType_image_prompt'};
  Object.entries(checkboxMap).forEach(([type,id])=>{if(csEl(id))csEl(id).checked=contentStudioTypes.includes(type);});
  csRenderSuite(csGetEditedSuite()||contentStudioSuite,contentStudioTypes);
  csStatus('AI 추천 항목을 카드에 적용했습니다.','success');
}

function csApplyAnalysis(analysis){
  contentStudioAnalysis=analysis||null;
  contentStudioAnalysisConfirmed=false;
  const box=csEl('csAnalysisResult');
  const details=csEl('csCampaignDetails');
  if(details)details.hidden=true;
  if(!analysis){
    if(box){box.hidden=true;box.innerHTML='';}
    return;
  }
  const req=analysis.business_requirement||'optional';
  const reqText=req==='required'?'연결 업소 선택이 필요합니다.':req==='none'?'연결 업소 없이 진행하는 주제입니다.':'연결 업소는 선택 사항입니다.';
  const type=analysis.intent_type||'information';
  const typeOptions=[
    ['information','생활정보형'],
    ['business','업소 홍보형'],
    ['mixed','혼합형']
  ].map(([v,l])=>`<option value="${v}" ${v===type?'selected':''}>${l}</option>`).join('');
  const recs=Array.isArray(analysis.recommended_types)?analysis.recommended_types:['dalpick'];
  const labelMap={dalpick:'DalPick 기사',coupon:'쿠폰',banner:'배너',social:'SNS',push:'푸시 알림',video:'숏폼 영상',image_prompt:'대표 이미지'};
  const recHtml=recs.map(x=>`<span style="display:inline-block;padding:5px 8px;border-radius:999px;background:#fff;border:1px solid #c7d2fe;font-size:12px;font-weight:700;margin:4px 4px 0 0">${esc(labelMap[x]||x)}</span>`).join('');
  if(box){
    box.hidden=false;
    box.innerHTML=`<div style="padding:14px;border:1px solid #c7d2fe;background:#eef2ff;border-radius:12px;margin-top:12px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
        <div><div style="font-size:12px;font-weight:800;color:#4f46e5">2단계 · AI 추천 분류</div><div style="font-weight:800;font-size:16px;margin-top:4px">${esc(analysis.intent_label||analysis.intent_type||'분석 완료')}</div></div>
        <select id="csIntentOverride" style="padding:8px 10px;border:1px solid #c7d2fe;border-radius:9px;background:white">${typeOptions}</select>
      </div>
      <div style="font-size:13px;color:#475569;line-height:1.55;margin-top:7px">${esc(analysis.explanation||'')}</div>
      <div style="font-size:13px;font-weight:700;margin-top:9px">${esc(reqText)}</div>
      <div style="font-size:12px;font-weight:800;color:#475569;margin-top:10px">추천 콘텐츠</div>
      <div>${recHtml}</div>
      <button type="button" id="csConfirmAnalysisBtn" class="btn primary" style="width:100%;margin-top:12px;padding:11px">이 분류로 다음 단계 진행</button>
    </div>`;
    csEl('csConfirmAnalysisBtn')?.addEventListener('click',csConfirmAnalysis);
  }
  csStatus('AI가 분류를 추천했습니다. 내용을 확인한 뒤 다음 단계로 진행하세요.','success');
}
function csConfirmAnalysis(){
  if(!contentStudioAnalysis)return alert('먼저 주제를 분석하세요.');
  const override=csValue('csIntentOverride');
  if(override&&override!==contentStudioAnalysis.intent_type){
    contentStudioAnalysis.intent_type=override;
    contentStudioAnalysis.intent_label=override==='business'?'업소 홍보형':override==='mixed'?'혼합형':'생활정보형';
    contentStudioAnalysis.business_requirement=override==='business'?'required':override==='mixed'?'optional':'none';
  }
  contentStudioAnalysisConfirmed=true;
  const analysis=contentStudioAnalysis;
  const req=analysis.business_requirement||'optional';
  const details=csEl('csCampaignDetails');
  if(details)details.hidden=false;
  const businessWrap=csEl('csBusinessWrap');
  const business=csEl('csBusiness');
  if(businessWrap)businessWrap.hidden=req==='none';
  if(req==='none'&&business)business.value='';
  if(csEl('csBusinessRequirement'))csEl('csBusinessRequirement').textContent=req==='required'?'필수':req==='none'?'사용 안 함':'선택';
  if(analysis.suggested_goal&&csEl('csGoal'))csEl('csGoal').value=analysis.suggested_goal;
  if(analysis.suggested_audience&&csEl('csAudience')&&!csValue('csAudience'))csEl('csAudience').value=analysis.suggested_audience;
  if(analysis.suggested_tone&&csEl('csTone')){
    const tone=[...csEl('csTone').options].find(o=>o.value===analysis.suggested_tone||o.textContent===analysis.suggested_tone);
    if(tone)csEl('csTone').value=tone.value;
  }
  const recommended=new Set(Array.isArray(analysis.recommended_types)?analysis.recommended_types:['dalpick']);
  ['coupon','banner','social','push','video','image_prompt'].forEach(type=>{const el=csEl(`csType_${type}`);if(el)el.checked=recommended.has(type);});
  csEl('csCampaignDetails')?.scrollIntoView({behavior:'smooth',block:'start'});
  csStatus('분류가 확정되었습니다. 추천 설정을 확인하고 콘텐츠를 생성하세요.','success');
}
async function csAnalyzeTopic(){
  const topic=csValue('csTopic');if(!topic)return alert('먼저 만들고 싶은 주제를 입력하세요.');
  const btn=csEl('csAnalyzeBtn');const old=btn?.textContent||'주제 분석하기';
  if(btn){btn.disabled=true;btn.textContent='주제 분석 중...';}
  csStatus('AI가 기사 유형과 업소 연결 필요 여부를 판단하고 있습니다...');
  try{
    const r=await fetch('/.netlify/functions/generate-content-suite',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'analyze',topic})});
    const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'주제 분석 실패');
    csApplyAnalysis(j.analysis);
  }catch(e){console.error(e);csStatus(`분석 오류: ${e.message}`,'error');alert(e.message);}finally{if(btn){btn.disabled=false;btn.textContent=old;}}
}
async function csGenerate(){
  const topic=csValue('csTopic'); if(!topic)return alert('캠페인 주제를 입력하세요.');
  if(!contentStudioAnalysis)return alert('먼저 AI로 주제를 분석하세요.');
  if(!contentStudioAnalysisConfirmed)return alert('AI 추천 분류를 확인하고 ‘이 분류로 다음 단계 진행’을 눌러주세요.');
  if(contentStudioAnalysis.business_requirement==='required'&&!csValue('csBusiness'))return alert('이 주제는 연결 업소 선택이 필요합니다.');
  const types=csSelectedTypes();
  const businessId=csValue('csBusiness'); const b=businesses.find(x=>String(x.id)===String(businessId));
  const btn=csEl('csGenerateBtn'); const old=btn?.textContent||'DalPick 중심으로 생성';if(btn){btn.disabled=true;btn.textContent='DalPick 작성 및 분석 중...';}
  csStatus('먼저 DalPick 원본 기사를 만들고 파생 콘텐츠를 설계하고 있습니다...');
  try{
    const r=await fetch('/.netlify/functions/generate-content-suite',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({topic,goal:csValue('csGoal'),audience:csValue('csAudience'),tone:csValue('csTone'),instructions:csValue('csInstructions'),content_types:types,business:b?{id:b.id,name:b.name_ko||b.name_en||'',category:b.category||b.category_ko||'',address:b.address||'',phone:b.phone||'',website:b.website||'',description:b.description||b.description_ko||''}:null})});
    const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'통합 콘텐츠 생성 실패');
    csRenderSuite(j.suite,types);csStatus('DalPick 원본과 파생 콘텐츠가 생성되었습니다. 추천과 체크리스트를 확인하세요.','success');
  }catch(e){console.error(e);csStatus(`오류: ${e.message}`,'error');alert(e.message);}finally{if(btn){btn.disabled=false;btn.textContent=old;}}
}
function initContentStudioV21(){
  if(csEl('section-contentStudio'))return;
  const nav=document.getElementById('adminNav');
  if(nav){const btn=document.createElement('button');btn.type='button';btn.className='nav-item';btn.dataset.section='contentStudio';btn.innerHTML='<span>✦</span><span>AI 콘텐츠 스튜디오</span>';nav.appendChild(btn);btn.addEventListener('click',()=>switchSection('contentStudio'));}
  const host=document.querySelector('.main-content, main, #adminMain, .content')||document.body;
  const sec=document.createElement('section');sec.id='section-contentStudio';sec.className='admin-section';
  sec.innerHTML=`<div style="display:grid;grid-template-columns:minmax(280px,390px) minmax(0,1fr);gap:18px;align-items:start" class="cs-layout"><div><div class="card" style="padding:18px"><div style="font-size:12px;font-weight:800;color:#4f46e5;margin-bottom:5px">3-STEP WORKFLOW</div><h2 style="margin-top:0">새 콘텐츠 캠페인</h2><div style="font-size:13px;color:#64748b;line-height:1.55;margin-bottom:12px">① 주제 입력 → ② AI 추천 분류 확인 → ③ 세부 설정 후 생성 순서로 진행합니다.</div><label style="display:block;font-weight:700;margin:10px 0 5px">1단계 · 주제를 입력하세요 *</label><input id="csTopic" placeholder="예: 텍사스 여름에 갈 만한 계곡 / 김치나라 여름 이벤트" style="width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:9px"><button type="button" id="csAnalyzeBtn" class="btn secondary" style="width:100%;margin-top:10px;padding:11px">주제 분석하기</button><div id="csAnalysisResult" hidden></div><div id="csCampaignDetails" hidden><div style="font-size:12px;font-weight:800;color:#4f46e5;margin:16px 0 6px">3단계 · 추천 설정 확인</div><div id="csBusinessWrap"><label style="display:flex;justify-content:space-between;font-weight:700;margin:14px 0 5px"><span>연결 업소</span><span id="csBusinessRequirement" style="font-size:12px;color:#4f46e5">선택</span></label><select id="csBusiness" style="width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:9px"></select></div><label style="display:block;font-weight:700;margin:10px 0 5px">목표</label><select id="csGoal" style="width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:9px"><option value="홍보와 방문 유도">홍보·방문 유도</option><option value="신규 업소 소개">신규 업소 소개</option><option value="쿠폰 사용 유도">쿠폰 사용 유도</option><option value="브랜드 신뢰도 향상">브랜드 신뢰도 향상</option><option value="정보 제공">정보 제공</option></select><label style="display:block;font-weight:700;margin:10px 0 5px">대상 고객</label><input id="csAudience" placeholder="예: 캐롤튼 거주 한인 가족" style="width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:9px"><label style="display:block;font-weight:700;margin:10px 0 5px">문체</label><select id="csTone" style="width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:9px"><option>친근하고 신뢰감 있게</option><option>고급스럽고 전문적으로</option><option>간결하고 활기차게</option><option>정보 중심으로 차분하게</option></select><label style="display:block;font-weight:700;margin:12px 0 7px">AI 추천 콘텐츠</label><div style="padding:10px;border:1px solid #c7d2fe;background:#eef2ff;border-radius:10px;margin-bottom:8px;font-size:14px"><strong>✓ DalPick 기사</strong> <span style="font-size:12px;color:#64748b">필수 원본</span></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:14px"><label><input type="checkbox" id="csType_coupon"> 쿠폰</label><label><input type="checkbox" id="csType_banner"> 배너</label><label><input type="checkbox" id="csType_social"> SNS</label><label><input type="checkbox" id="csType_push"> 푸시 알림</label><label><input type="checkbox" id="csType_video"> 숏폼 영상</label><label><input type="checkbox" id="csType_image_prompt" checked> 이미지 프롬프트</label></div><label style="display:block;font-weight:700;margin:12px 0 5px">추가 지시</label><textarea id="csInstructions" rows="4" placeholder="가격, 기간, 대표 메뉴 등 확인된 사실만 입력하세요." style="width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:9px;resize:vertical"></textarea><button type="button" id="csGenerateBtn" class="btn primary" style="width:100%;margin-top:14px;padding:12px">분석 결과로 콘텐츠 생성</button></div><div id="csStatus" style="font-size:13px;color:#475569;margin-top:10px">주제를 먼저 입력하세요.</div></div><div class="card" style="padding:16px;margin-top:14px"><h3 style="margin-top:0">최근 작업</h3><div id="csHistory"></div></div></div><div id="csResults"><div class="card" style="padding:30px;text-align:center;color:#64748b"><div style="font-size:34px;margin-bottom:10px">✦</div><strong>주제부터 시작합니다.</strong><div style="margin-top:6px;font-size:13px;line-height:1.55">주제를 입력하고 분석 버튼을 누른 뒤, AI 추천 분류를 확인해야 다음 설정과 생성 단계가 열립니다.</div></div></div></div><style>@media(max-width:900px){.cs-layout{grid-template-columns:1fr!important}}</style>`;
  host.appendChild(sec);csBusinessOptions();csRenderHistory();
  csEl('csAnalyzeBtn')?.addEventListener('click',csAnalyzeTopic);
  csEl('csTopic')?.addEventListener('input',()=>{contentStudioAnalysis=null;contentStudioAnalysisConfirmed=false;const d=csEl('csCampaignDetails');if(d)d.hidden=true;const a=csEl('csAnalysisResult');if(a)a.hidden=true;csStatus('주제가 바뀌었습니다. 다시 분석하세요.');});
  csEl('csGenerateBtn')?.addEventListener('click',csGenerate);
  sec.addEventListener('click',async e=>{
    const h=e.target.closest('[data-cs-history]');if(h){const x=csLoadHistory()[Number(h.dataset.csHistory)];if(x){contentStudioSuite=x.suite;csRenderSuite(x.suite,x.types);csStatus('보관된 작업을 불러왔습니다.','success');}return;}
    const btn=e.target.closest('[data-cs-action]');if(!btn)return;const a=btn.dataset.csAction;const s=csGetEditedSuite();
    if(a==='apply-dalpick')csApply('dalpick');else if(a==='apply-coupon')csApply('coupon');else if(a==='apply-banner')csApply('banner');else if(a==='apply-push')csApply('push');
    else if(a==='apply-recommendations')csApplyRecommendations();
    else if(a==='copy-dalpick-prompt')csCopy(csValue('cs_dalpick_prompt'));
    else if(a==='copy-banner-prompt')csCopy(csValue('cs_banner_prompt'));
    else if(a==='copy-social')csCopy(`Instagram\n${s.social.instagram}\n\nFacebook\n${s.social.facebook}\n\n짧은 캡션\n${s.social.short_caption}`);
    else if(a==='copy-push')csCopy(`${s.push.title}\n${s.push.message}`);
    else if(a==='copy-video')csCopy(`${s.video.hook}\n\n${s.video.script}\n\n썸네일: ${s.video.thumbnail_text}`);
    else if(a==='save-history'){csSaveHistory({title:s.campaign_title,created_at:new Date().toLocaleString('ko-KR'),types:contentStudioTypes,suite:s});csStatus('현재 작업을 브라우저에 보관했습니다.','success');}
  });
  window.addEventListener('kfocus:businesses-loaded',csBusinessOptions);
}
const _v21SetPageMeta=setPageMeta;
setPageMeta=function(){
  if(currentSection==='contentStudio'){safeText('pageTitle','AI 콘텐츠 스튜디오');safeText('pageDesc','DalPick 원본 기사에서 쿠폰·배너·SNS·푸시·영상 콘텐츠를 파생하고 발행 전 점검합니다.');return;}
  return _v21SetPageMeta();
};


// v21.3 — DalPick editor topic-first workflow
let dalpickTopicAnalysis=null;
function dpClosestField(el){return el?.closest?.('label.field, .field')||el?.parentElement||null;}
function dpSetWorkflowReady(ready){
  window.dalpickTopicFirstReady=!!ready;
  const details=qs('dalpickTopicDetails');
  const article=qs('dalpickArticleStep');
  if(details)details.hidden=!ready;
  if(article)article.hidden=!ready;
}
function dpResetTopicAnalysis(message='주제를 입력한 뒤 분석하세요.'){
  dalpickTopicAnalysis=null;
  dpSetWorkflowReady(false);
  const result=qs('dalpickTopicAnalysisResult');
  if(result){result.hidden=true;result.innerHTML='';}
  safeText('dalpickTopicFirstStatus',message);
}
function dpCategoryLabel(category){
  return {local_info:'지역 정보',lifestyle:'생활 정보',themed:'테마 추천',recommended:'추천 업소',new_business:'신규 업소',coupon:'쿠폰',event:'행사',business_story:'업소탐방 Premium'}[category]||category;
}
function dpRecommendedCategory(a,topic){
  if(a?.suggested_dalpick_category)return a.suggested_dalpick_category;
  const t=String(topic||'');
  if(a?.intent_type==='business'){
    if(/쿠폰|할인|프로모션|혜택/.test(t))return 'coupon';
    if(/오픈|개업|신규/.test(t))return 'new_business';
    if(/인터뷰|스토리|탐방/.test(t))return 'business_story';
    return 'recommended';
  }
  if(a?.intent_type==='mixed')return 'themed';
  if(/면허|보험|학교|세금|비자|생활|신청|등록|갱신/.test(t))return 'lifestyle';
  if(/행사|축제|공연|박람회/.test(t))return 'event';
  return 'local_info';
}
function dpRenderTopicAnalysis(a){
  dalpickTopicAnalysis=a||{};
  const result=qs('dalpickTopicAnalysisResult');
  if(!result)return;
  const req=a.business_requirement||'optional';
  const reqText=req==='required'?'업소 연결 필수':req==='none'?'업소 연결 없음':'업소 연결 선택';
  const category=dpRecommendedCategory(a,val('dalpick_topic'));
  dalpickTopicAnalysis.suggested_dalpick_category=category;
  const labels={dalpick:'DalPick 기사',coupon:'쿠폰',banner:'배너',social:'SNS',push:'푸시',video:'숏폼 영상',image_prompt:'대표 이미지'};
  const recs=(Array.isArray(a.recommended_types)?a.recommended_types:['dalpick']).map(x=>`<span style="display:inline-block;margin:4px 4px 0 0;padding:5px 9px;border:1px solid #c7d2fe;border-radius:999px;background:white;font-size:12px;font-weight:700">${esc(labels[x]||x)}</span>`).join('');
  result.hidden=false;
  result.innerHTML=`<div style="margin-top:12px;padding:15px;border:1px solid #c7d2fe;border-radius:12px;background:#eef2ff">
    <div style="font-size:12px;font-weight:800;color:#4f46e5">2단계 · AI 추천 분류</div>
    <div style="font-size:17px;font-weight:800;margin-top:5px">${esc(a.intent_label||'분석 완료')}</div>
    <div style="margin-top:7px;font-size:13px;line-height:1.55;color:#475569">${esc(a.explanation||'')}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px">
      <div style="padding:9px;border-radius:9px;background:white"><small style="color:#64748b">추천 콘텐츠 유형</small><div style="font-weight:800;margin-top:2px">${esc(dpCategoryLabel(category))}</div></div>
      <div style="padding:9px;border-radius:9px;background:white"><small style="color:#64748b">업소 연결</small><div style="font-weight:800;margin-top:2px">${esc(reqText)}</div></div>
    </div>
    <div style="margin-top:10px"><small style="font-weight:800;color:#64748b">추천 생성 항목</small><div>${recs}</div></div>
    <button type="button" id="dalpickConfirmTopicAnalysis" class="btn primary" style="width:100%;margin-top:13px;padding:11px">이 분류로 다음 단계 진행</button>
  </div>`;
  qs('dalpickConfirmTopicAnalysis')?.addEventListener('click',dpConfirmTopicAnalysis);
  safeText('dalpickTopicFirstStatus','분석 결과를 확인하고 다음 단계로 진행하세요.');
}
async function dpAnalyzeTopic(){
  const topic=val('dalpick_topic').trim();
  if(!topic)return alert('먼저 주제를 입력하세요.');
  const btn=qs('dalpickTopicAnalyzeBtn');const old=btn?.textContent||'주제 분석하기';
  if(btn){btn.disabled=true;btn.textContent='분석 중...';}
  safeText('dalpickTopicFirstStatus','AI가 기사 유형과 업소 연결 필요 여부를 분석하고 있습니다...');
  try{
    const r=await fetch('/.netlify/functions/generate-content-suite',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'analyze',topic})});
    const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'주제 분석 실패');
    dpRenderTopicAnalysis(j.analysis||{});
  }catch(e){safeText('dalpickTopicFirstStatus',`분석 오류: ${e.message}`);alert(e.message);}finally{if(btn){btn.disabled=false;btn.textContent=old;}}
}
function dpConfirmTopicAnalysis(){
  if(!dalpickTopicAnalysis)return alert('먼저 주제를 분석하세요.');
  const category=dpRecommendedCategory(dalpickTopicAnalysis,val('dalpick_topic'));
  setVal('dalpick_category',category);
  updateDalpickTypeUI();
  const req=dalpickTopicAnalysis.business_requirement||'optional';
  const businessField=dpClosestField(qs('dalpick_business_id'));
  if(businessField)businessField.hidden=req==='none';
  if(req==='none')setVal('dalpick_business_id','');setMultiBusinessIds('dalpick_business_id',[]);
  safeText('dalpickBusinessRequirement',req==='required'?'필수':req==='none'?'사용 안 함':'선택 사항');
  dpSetWorkflowReady(true);
  safeText('dalpickTopicFirstStatus',`분류 확정: ${dpCategoryLabel(category)} · ${req==='required'?'업소 연결 필수':req==='none'?'업소 연결 없음':'업소 연결 선택'}`);
  qs('dalpickTopicDetails')?.scrollIntoView({behavior:'smooth',block:'start'});
}
function initDalpickTopicFirstWorkflow(){
  const form=qs('dalpickForm'), topic=qs('dalpick_topic');
  if(!form||!topic||qs('dalpickTopicFirstPanel'))return;
  const hidden=qs('dalpick_id');
  const categoryField=dpClosestField(qs('dalpick_category'));
  const regionField=dpClosestField(qs('dalpick_region'));
  const businessField=dpClosestField(qs('dalpick_business_id'));
  const aiBox=topic.closest('.dalpick-ai-box');
  const topicField=dpClosestField(topic);
  const instructionsField=dpClosestField(qs('dalpick_instructions'));
  const sourcesField=dpClosestField(qs('dalpick_sources'));

  const panel=document.createElement('div');panel.id='dalpickTopicFirstPanel';panel.className='field full';
  panel.style.cssText='padding:18px;border:1px solid #93c5fd;border-radius:14px;background:#f8fbff;order:-100;';
  panel.innerHTML=`<div style="font-size:12px;font-weight:800;color:#2563eb">1단계 · 주제부터 입력</div><h3 style="margin:5px 0 4px">무엇에 관한 콘텐츠를 만들까요?</h3><p class="muted" style="margin:0 0 12px">AI가 주제를 분석한 뒤 콘텐츠 유형과 업소 연결 필요 여부를 추천합니다.</p><div id="dalpickTopicInputHost"></div><button type="button" id="dalpickTopicAnalyzeBtn" class="btn primary" style="width:100%;margin-top:10px;padding:11px">주제 분석하기</button><div id="dalpickTopicAnalysisResult" hidden></div><div id="dalpickTopicFirstStatus" class="muted" style="margin-top:10px">주제를 입력한 뒤 분석하세요.</div>`;
  if(hidden?.nextSibling)form.insertBefore(panel,hidden.nextSibling);else form.prepend(panel);
  qs('dalpickTopicInputHost')?.appendChild(topicField);

  const details=document.createElement('div');details.id='dalpickTopicDetails';details.className='field full';details.hidden=true;
  details.style.cssText='padding:16px;border:1px solid #dbeafe;border-radius:12px;background:#fff;';
  details.innerHTML='<div style="font-size:12px;font-weight:800;color:#2563eb;margin-bottom:10px">3단계 · 추천 분류와 연결 설정</div><div id="dalpickClassificationFields" class="form-grid"></div>';
  panel.insertAdjacentElement('afterend',details);
  const fields=qs('dalpickClassificationFields');
  if(categoryField)fields.appendChild(categoryField);
  if(regionField)fields.appendChild(regionField);
  if(businessField)fields.appendChild(businessField);

  const article=document.createElement('div');article.id='dalpickArticleStep';article.className='field full';article.hidden=true;
  article.style.cssText='display:contents;';
  details.insertAdjacentElement('afterend',article);
  if(aiBox){
    article.appendChild(aiBox);
    const head=aiBox.querySelector('.dalpick-ai-head strong');if(head)head.textContent='✨ 4단계 · AI 기사 작성';
    const grid=aiBox.querySelector('.dalpick-ai-grid');
    if(grid){if(instructionsField)grid.appendChild(instructionsField);if(sourcesField)grid.appendChild(sourcesField);}
  }

  qs('dalpickTopicAnalyzeBtn')?.addEventListener('click',dpAnalyzeTopic);
  topic.addEventListener('input',()=>dpResetTopicAnalysis('주제가 바뀌었습니다. 다시 분석하세요.'));
  if(selectedDalpickId||val('dalpick_title')){
    dpSetWorkflowReady(true);
    safeText('dalpickTopicFirstStatus','기존 콘텐츠 수정 모드입니다. 필요하면 주제를 다시 분석할 수 있습니다.');
  }else dpSetWorkflowReady(false);
}

// v25.7: legacy duplicate AI Content Studio menu disabled; unified AI Studio remains active.
// document.addEventListener('DOMContentLoaded',()=>setTimeout(initContentStudioV21,500));
document.addEventListener('DOMContentLoaded',()=>setTimeout(initDalpickTopicFirstWorkflow,650));
window.initDalpickTopicFirstWorkflow=initDalpickTopicFirstWorkflow;
window.initContentStudioV21=initContentStudioV21;


// ADMIN 2.0 AI MARKETING PUBLISH BRIDGE
async function publishAIMarketingDraft(draft, options = {}) {
  if (!supabase) throw new Error('Supabase가 연결되지 않았습니다.');
  if (!draft?.businessId) throw new Error('연결 업소가 없습니다.');
  if (!draft?.title) throw new Error('제목이 없습니다.');
  if (!draft?.image) throw new Error('이미지 URL이 없습니다.');

  const business = businesses.find((b) => String(b.id) === String(draft.businessId));
  const region = business?.region || getAppRegion();

  if (draft.type === 'coupon') {
    const payload = {
      business_id: draft.businessId,
      title: draft.title,
      description: draft.subtitle || null,
      discount_label: draft.subtitle || null,
      image_url: draft.image,
      start_at: new Date().toISOString(),
      end_at: null,
      is_active: true,
      is_today_coupon: options.today !== false,
      sort_order: 1000,
      coupon_code: null,
      use_link_url: null,
      notify_emails: null,
      notify_phones: null
    };

    const { data: coupon, error } = await supabase.from('coupons').insert(payload).select().single();
    if (error) throw error;

    let dalpick = null;
    if (options.dalpick) {
      const dalpickPayload = {
        region,
        category: 'coupon',
        business_id: draft.businessId,
        title: draft.title,
        summary: draft.subtitle || draft.title,
        content: draft.subtitle || draft.title,
        image_url: draft.image,
        is_featured: true,
        is_active: true,
        priority: 0,
        start_at: new Date().toISOString(),
        end_at: null
      };
      const { data, error: dalpickError } = await supabase.from('dalpick').insert(dalpickPayload).select().single();
      if (dalpickError) {
        console.warn('Coupon was published, but DalPick insert failed:', dalpickError);
        throw new Error(`쿠폰은 게시됐지만 DalPick 연결에 실패했습니다: ${dalpickError.message}`);
      }
      dalpick = data;
    }

    await loadCoupons();
    if (options.dalpick) await loadDalpicks();
    return { type: 'coupon', couponId: coupon?.id || null, dalpickId: dalpick?.id || null };
  }

  if (draft.type === 'banner') {
    const placement = options.home ? 'both' : 'detail';
    const payload = {
      title: draft.title,
      image_url: draft.image,
      link_url: `business:${draft.businessId}`,
      business_id: draft.businessId,
      region,
      display_type: 'banner',
      placement,
      description: draft.subtitle || null,
      button_label: '자세히 보기',
      start_at: new Date().toISOString(),
      end_at: null,
      sort_order: 0,
      is_active: true
    };
    const { data: banner, error } = await supabase.from('banners').insert(payload).select().single();
    if (error) throw error;
    await loadBanners();
    return { type: 'banner', bannerId: banner?.id || null, placement };
  }

  throw new Error('쿠폰 또는 배너 초안만 최종 게시할 수 있습니다.');
}

window.KFocusAdminBridge = window.KFocusAdminBridge || {};
window.KFocusAdminBridge.publishAIMarketingDraft = publishAIMarketingDraft;

// ===== v32 Integrated Newsroom =====
let newsroomItems = [];
let v482SelectedArticleIds = new Set();
let selectedNewsroomId = null;
let newsroomBusinessSelection = new Set();
let newsroomStatusFilter = 'all';
const NEWSROOM_DEST_LABELS = {life:'달라스 라이프',notice:'행사안내',guide:'달라스 가이드',urgent:'긴급 공지',exclude:'제외'};
function newsroomJson(v, fallback){ if(Array.isArray(v)||v&&typeof v==='object') return v; try{return JSON.parse(v||'');}catch(_){return fallback;} }
function newsroomLabel(v){return NEWSROOM_DEST_LABELS[v]||v||'달라스 라이프';}
function newsroomLocalDate(v){if(!v)return '';const d=new Date(v);return Number.isNaN(d.getTime())?'':d.toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});}
const NEWSROOM_PRIORITY_LABELS={urgent:'긴급',high:'높음',normal:'보통',low:'낮음'};
function newsroomPriority(row){const stored=String(row.priority_level||'').toLowerCase();if(NEWSROOM_PRIORITY_LABELS[stored])return stored;const text=[row.original_title,row.original_summary,row.ai_title,row.ai_summary].join(' ').toLowerCase();if((row.destination||row.suggested_destination)==='urgent'||/(warning|advisory|closure|closed|emergency|evacuation|폭염|경보|폐쇄|휴교|대피)/i.test(text))return 'urgent';if(Number(row.confidence)>=85||/(txdot|dart|police|fire|county|city of|isd|보건|교통|시청)/i.test(text))return 'high';if((row.destination||row.suggested_destination)==='exclude')return 'low';return 'normal';}
function newsroomPriorityRank(row){return {urgent:4,high:3,normal:2,low:1}[newsroomPriority(row)]||2;}
async function loadNewsroom(){
  if(!supabase) return;
  safeText('newsroomStatus','수집 후보를 불러오는 중입니다.');
  const {data,error}=await supabase.from('newsroom_items').select('*').eq('region',getAppRegion()).in('status',['collected','classified','review']).order('collected_at',{ascending:false}).limit(300);
  if(error){safeText('newsroomStatus',`뉴스룸 테이블 연결 필요: ${error.message}`); newsroomItems=[]; renderNewsroom(); return;}
  newsroomItems=data||[]; safeText('newsroomStatus',`미처리 후보 ${newsroomItems.length}건 · 마지막 확인 ${new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}`); renderNewsroom(); v531LoadHomeDashboard();
}
function filteredNewsroom(){
  const q=(val('newsroomSearch')||'').toLowerCase().trim(); const dest=val('newsroomDestinationFilter')||'all'; const source=val('newsroomSourceFilter')||'all';
  return newsroomItems.filter(r=>{
    if(newsroomStatusFilter!=='all'&&r.status!==newsroomStatusFilter)return false;
    if(dest!=='all'&&(r.destination||r.suggested_destination)!==dest)return false;
    if(source!=='all'&&(r.source_kind||'official')!==source)return false;
    if(q&&!([r.original_title,r.ai_title,r.source_name,r.area,r.ai_summary].join(' ').toLowerCase().includes(q)))return false;
    return true;
  }).sort((a,b)=>newsroomPriorityRank(b)-newsroomPriorityRank(a)||new Date(b.source_published_at||b.collected_at||0)-new Date(a.source_published_at||a.collected_at||0));
}
function v482UpdateSelectionStatus(){
  safeText('v482SelectionStatus',`선택된 기사 ${v482SelectedArticleIds.size}건`);
  const disabled=v482SelectedArticleIds.size===0;['v482ApplyPicksBtn','v487RemovePicksBtn','v491ArchiveSelectedBtn','v491UnarchiveSelectedBtn','v491DeleteSelectedBtn'].forEach(id=>{const el=qs(id);if(el)el.disabled=disabled;});
}
function v511HomeLinkTargetRows(type, query=''){
  const q=String(query||'').trim().toLowerCase();
  if(type==='business') return (businesses||[]).filter(x=>!q||[x.name_ko,x.name_en,x.area,x.category_ko,x.address].join(' ').toLowerCase().includes(q)).slice(0,120).map(x=>({id:String(x.id),label:`${x.name_ko||x.name_en||'업소'}${x.area?` · ${x.area}`:''}`}));
  return (boards||[]).filter(x=>x.is_active!==false&&(!q||[x.title,x.content,boardLabel(x.type),boardSubtypeLabel(x.subtype)].join(' ').toLowerCase().includes(q))).slice(0,120).map(x=>({id:String(x.id),label:`${x.title||'제목 없음'} · ${boardLabel(x.type||'notice')}`}));
}
function v511CloseHomeLinkModal(){document.getElementById('v511HomeLinkModal')?.remove();}
function v511OpenHomeLinkModal(id){
  const pool=(typeof newsroomCache!=='undefined'&&newsroomCache?.length)?newsroomCache:newsroomItems;
  const row=(pool||[]).find(x=>String(x.id)===String(id));if(!row)return;
  const meta=(row.event_data&&typeof row.event_data==='object')?row.event_data:{};
  const currentType=['business','post'].includes(String(meta.home_target_type||''))?String(meta.home_target_type):'post';
  const modal=document.createElement('div');modal.id='v511HomeLinkModal';modal.className='v511-link-modal-backdrop';
  modal.innerHTML=`<section class="v511-link-modal" role="dialog" aria-modal="true" aria-labelledby="v511LinkTitle"><div class="v511-link-modal-head"><div><h3 id="v511LinkTitle">오늘의 달타운 연결 설정</h3><p>메인 정보 카드를 앱 내부의 게시판 글 또는 업소 상세로 연결합니다.</p></div><button type="button" class="v511-link-close" aria-label="닫기">×</button></div><div class="v511-link-source"><b>${esc(row.ai_title||row.original_title||'제목 없음')}</b></div><label class="field"><span>연결 종류</span><select id="v511LinkType"><option value="post">게시판 글</option><option value="business">업소 상세</option></select></label><label class="field"><span>검색</span><input id="v511LinkSearch" type="search" placeholder="제목 또는 업소명을 입력하세요"></label><label class="field"><span>연결 대상</span><select id="v511LinkTarget" size="7"></select></label><label class="field"><span>버튼 문구</span><input id="v511LinkLabel" maxlength="30" value="${esc(meta.home_link_label||'자세히 보기')}"></label><div class="v511-link-modal-actions"><button type="button" class="btn ghost v511-link-cancel">취소</button><button type="button" class="btn primary v511-link-save">연결 저장</button></div></section>`;
  document.body.appendChild(modal);
  const typeEl=modal.querySelector('#v511LinkType'),searchEl=modal.querySelector('#v511LinkSearch'),targetEl=modal.querySelector('#v511LinkTarget');typeEl.value=currentType;
  const render=()=>{const rows=v511HomeLinkTargetRows(typeEl.value,searchEl.value);targetEl.innerHTML=rows.length?rows.map(x=>`<option value="${esc(x.id)}">${esc(x.label)}</option>`).join(''):'<option value="">검색 결과가 없습니다.</option>';const currentId=String(meta.home_target_id||'');if(currentId&&rows.some(x=>x.id===currentId))targetEl.value=currentId;};
  render();typeEl.addEventListener('change',()=>{searchEl.value='';render();});searchEl.addEventListener('input',render);modal.querySelector('.v511-link-close').onclick=v511CloseHomeLinkModal;modal.querySelector('.v511-link-cancel').onclick=v511CloseHomeLinkModal;modal.addEventListener('click',e=>{if(e.target===modal)v511CloseHomeLinkModal();});
  modal.querySelector('.v511-link-save').onclick=async()=>{const targetId=String(targetEl.value||'').trim();if(!targetId)return alert('연결할 업소 또는 게시판 글을 선택하세요.');const btn=modal.querySelector('.v511-link-save');btn.disabled=true;btn.textContent='저장 중…';try{await newsroomEdgeCall('set_home_link',{id,enabled:true,target_type:typeEl.value,target_id:targetId,label:String(modal.querySelector('#v511LinkLabel').value||'자세히 보기').trim()||'자세히 보기',region:getAppRegion()});safeText('newsroomStatus',meta.home_link_enabled===true?'메인 연결을 수정했습니다.':'메인 연결을 저장했습니다.');v511CloseHomeLinkModal();await loadNewsroom();}catch(e){btn.disabled=false;btn.textContent='연결 저장';alert(e.message||String(e));}};
}
async function v485ConfigureHomeLink(id){v511OpenHomeLinkModal(id);}
async function v487DeleteHomeLink(id){
  if(!confirm('이 기사의 내부 연결 버튼을 삭제할까요? 기사는 메인에 계속 표시될 수 있습니다.'))return;
  try{await newsroomEdgeCall('set_home_link',{id,enabled:false,target_type:'',target_id:'',label:'',region:getAppRegion()});safeText('newsroomStatus','메인 링크를 삭제했습니다.');await loadNewsroom();}catch(e){alert(e.message||String(e));}
}
async function v489SetArchiveKeep(id,enabled=true){
  try{
    await newsroomEdgeCall('set_archive_keep',{id,enabled,region:getAppRegion()});
    safeText('newsroomStatus',enabled?'선택한 기사를 30일 자동 삭제 대상에서 제외했습니다.':'보관을 해제했습니다. 이 기사는 수집일 기준 30일 후 자동 삭제됩니다.');
    await loadNewsroom();
  }catch(e){alert(e.message||String(e));}
}
async function v489DeleteArticle(id){
  const row=(newsroomItems||[]).find(x=>String(x.id)===String(id));
  const title=row?.ai_title||row?.original_title||'이 기사';
  if(!confirm(`“${title}”을(를) 완전히 삭제할까요?

삭제 후에는 복구할 수 없습니다.`))return;
  try{
    await newsroomEdgeCall('delete_newsroom_item',{id,region:getAppRegion()});
    v482SelectedArticleIds.delete(String(id));
    safeText('newsroomStatus','기사를 삭제했습니다.');
    await loadNewsroom();
  }catch(e){alert(e.message||String(e));}
}
function v481RenderCollectedPreview(){
  const box=qs('v481CollectedPreview');
  if(!box)return;
  const available=new Set((newsroomItems||[]).map(r=>String(r.id)));
  v482SelectedArticleIds=new Set([...v482SelectedArticleIds].filter(id=>available.has(String(id))));
  const items=(newsroomItems||[]).slice().sort((a,b)=>{
    const sa=v48SelectionSource(a), sb=v48SelectionSource(b);
    const rank={editor:3,scheduled:2,ai:1};
    return (rank[sb]||0)-(rank[sa]||0) || newsroomPriorityRank(b)-newsroomPriorityRank(a) || new Date(b.source_published_at||b.collected_at||0)-new Date(a.source_published_at||a.collected_at||0);
  }).slice(0,50);
  if(!items.length){
    box.innerHTML='<div class="newsroom-empty"><strong>오늘 수집된 기사가 아직 없습니다.</strong><span>오전 자동 수집 전이거나 수집 결과가 없는 경우입니다. ‘지금 다시 수집’ 또는 ‘오늘 자동 편성 실행’을 사용할 수 있습니다.</span></div>';
    v482UpdateSelectionStatus();
    return;
  }
  box.innerHTML=items.map(r=>{
    const [,categoryLabel]=v48ItemCategory(r);
    const checked=v482SelectedArticleIds.has(String(r.id));
    const meta=(r.event_data&&typeof r.event_data==='object')?r.event_data:{};
    const homeLinkEnabled=meta.home_link_enabled===true&&['post','business'].includes(String(meta.home_target_type||''))&&Boolean(String(meta.home_target_id||'').trim());
    const homeShown=v48SelectionSource(r)==='editor';
    const archiveKept=meta.archive_kept===true;
    return `<div class="newsroom-item v481-collected-item ${checked?'is-selected':''}" data-id="${esc(r.id)}" style="display:flex;gap:10px;align-items:flex-start;width:100%">
      <label class="v482-article-check" style="display:flex;align-items:center;gap:7px;padding:8px 4px;cursor:pointer;min-width:72px;font-weight:700" title="이 기사를 선택">
        <input type="checkbox" data-v482-select="${esc(r.id)}" ${checked?'checked':''} style="width:22px;height:22px;accent-color:#2563eb">
        <span>선택</span>
      </label>
      <button type="button" data-v482-open="${esc(r.id)}" style="border:0;background:transparent;text-align:left;padding:4px 0;flex:1;cursor:pointer">
        <span class="newsroom-item-top"><strong><span class="pill">${esc(v48SourceBadge(r))}</span> <span class="pill">${esc(categoryLabel)}</span> ${esc(r.ai_title||r.original_title||'제목 없음')}</strong><span class="newsroom-destination">${esc(newsroomLabel(r.destination||r.suggested_destination))}</span></span>
        <span class="newsroom-item-meta">${esc(r.source_name||'출처 미상')} · ${esc(r.area||'Dallas')} · ${esc(newsroomLocalDate(r.source_published_at||r.collected_at))}</span>
        <span class="newsroom-item-summary">${esc((r.ai_summary||r.original_summary||'').slice(0,110))}</span>
      </button>
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end">
        <label class="v512-home-toggle ${homeShown?'is-on':''}" title="메인 오늘의 달타운에 표시"><input type="checkbox" data-v512-home-show="${esc(r.id)}" ${homeShown?'checked':''}><span>${homeShown?'메인 노출 중':'오늘의 달타운 노출'}</span></label>
        <button type="button" class="btn ${homeLinkEnabled?'primary':'ghost'}" data-v485-home-link="${esc(r.id)}" style="white-space:nowrap;margin-top:5px">${homeLinkEnabled?'연결 수정':'업소·게시판 연결'}</button>
        ${homeLinkEnabled?`<button type="button" class="btn danger" data-v487-delete-link="${esc(r.id)}" style="white-space:nowrap;margin-top:5px">링크 삭제</button>`:''}
        <button type="button" class="btn ${archiveKept?'primary':'ghost'}" data-v489-archive="${esc(r.id)}" data-enabled="${archiveKept?'1':'0'}" style="white-space:nowrap;margin-top:5px">${archiveKept?'보관 해제':'보관'}</button>
        <button type="button" class="btn danger" data-v489-delete="${esc(r.id)}" style="white-space:nowrap;margin-top:5px">기사 삭제</button>
      </div>
    </div>`;
  }).join('');
  box.querySelectorAll('[data-v482-select]').forEach(c=>c.addEventListener('change',()=>{
    const id=String(c.dataset.v482Select);if(c.checked)v482SelectedArticleIds.add(id);else v482SelectedArticleIds.delete(id);c.closest('.v481-collected-item')?.classList.toggle('is-selected',c.checked);v482UpdateSelectionStatus();
  }));
  box.querySelectorAll('[data-v482-open]').forEach(b=>b.addEventListener('click',()=>{
    const row=newsroomItems.find(x=>String(x.id)===String(b.dataset.v482Open));if(row)fillNewsroom(row);
  }));
  box.querySelectorAll('[data-v485-home-link]').forEach(b=>b.addEventListener('click',(event)=>{
    event.preventDefault();event.stopPropagation();v485ConfigureHomeLink(b.dataset.v485HomeLink);
  }));
  box.querySelectorAll('[data-v487-delete-link]').forEach(b=>b.addEventListener('click',(event)=>{event.preventDefault();event.stopPropagation();v487DeleteHomeLink(b.dataset.v487DeleteLink);}));
  box.querySelectorAll('[data-v512-home-show]').forEach(c=>c.addEventListener('change',async(event)=>{
    event.preventDefault();event.stopPropagation();const enabled=c.checked;c.disabled=true;
    try{await v48SetEditorPick(c.dataset.v512HomeShow,enabled);}catch(_){c.checked=!enabled;}finally{c.disabled=false;}
  }));
  box.querySelectorAll('[data-v487-unpick]').forEach(b=>b.addEventListener('click',(event)=>{event.preventDefault();event.stopPropagation();v48SetEditorPick(b.dataset.v487Unpick,false);}));
  box.querySelectorAll('[data-v487-pick]').forEach(b=>b.addEventListener('click',(event)=>{event.preventDefault();event.stopPropagation();v48SetEditorPick(b.dataset.v487Pick,true);}));
  box.querySelectorAll('[data-v489-archive]').forEach(b=>b.addEventListener('click',(event)=>{event.preventDefault();event.stopPropagation();v489SetArchiveKeep(b.dataset.v489Archive,b.dataset.enabled!=='1');}));
  box.querySelectorAll('[data-v489-delete]').forEach(b=>b.addEventListener('click',(event)=>{event.preventDefault();event.stopPropagation();v489DeleteArticle(b.dataset.v489Delete);}));
  v482UpdateSelectionStatus();
}
async function v487RemoveSelectedPicks(){
  const ids=[...v482SelectedArticleIds];if(!ids.length)return;
  if(!confirm(`선택한 ${ids.length}건의 관리자 지정을 해제할까요? 메인 목록에서 즉시 빠집니다.`))return;
  const button=qs('v487RemovePicksBtn'),old=button?.textContent;if(button){button.disabled=true;button.textContent=`${ids.length}건 해제 중…`;}
  let success=0;const failed=[];
  try{for(const id of ids){try{await newsroomEdgeCall('set_editor_pick',{id,enabled:false,region:getAppRegion()});success++;}catch(e){failed.push(`${id}: ${e.message}`);}}v482SelectedArticleIds.clear();await loadNewsroom();safeText('newsroomStatus',`선택 기사 ${success}건의 관리자 지정을 해제했습니다.`);if(failed.length)alert(`일부 기사 해제 실패\n${failed.join('\n')}`);}finally{if(button){button.disabled=false;button.textContent=old;}v482UpdateSelectionStatus();}
}
async function v482ApplySelectedPicks(){
  const ids=[...v482SelectedArticleIds];if(!ids.length)return;
  const button=qs('v482ApplyPicksBtn'),old=button?.textContent;if(button){button.disabled=true;button.textContent=`${ids.length}건 지정 중…`;}
  let success=0;const failed=[];
  try{
    for(const id of ids){try{await newsroomEdgeCall('set_editor_pick',{id,enabled:true,region:getAppRegion()});success++;}catch(e){failed.push(`${id}: ${e.message}`);}}
    v482SelectedArticleIds.clear();await loadNewsroom();
    safeText('newsroomStatus',`선택 기사 ${success}건을 관리자 최우선으로 지정했습니다.${failed.length?` 실패 ${failed.length}건`:''}`);
    if(failed.length)alert(`일부 기사 지정 실패\n${failed.join('\n')}`);
  }finally{if(button){button.disabled=false;button.textContent=old;}v482UpdateSelectionStatus();}
}
function v482SelectVisibleArticles(){
  qs('newsroomList')?.querySelectorAll('[data-v482-select]').forEach(c=>{c.checked=true;v482SelectedArticleIds.add(String(c.dataset.v482Select));c.closest('.v481-collected-item')?.classList.add('is-selected');});v482UpdateSelectionStatus();
}
function v482ClearArticleSelection(){
  v482SelectedArticleIds.clear();qs('newsroomList')?.querySelectorAll('[data-v482-select]').forEach(c=>{c.checked=false;c.closest('.v481-collected-item')?.classList.remove('is-selected');});v482UpdateSelectionStatus();
}
async function v491ArchiveSelected(enabled=true){
  const ids=[...v482SelectedArticleIds];if(!ids.length)return;
  const label=enabled?'보관':'보관 해제';if(!confirm(`선택한 기사 ${ids.length}건을 ${label}할까요?`))return;
  let success=0,failed=0;for(const id of ids){try{await newsroomEdgeCall('set_archive_keep',{id,enabled,region:getAppRegion()});success++;}catch(_){failed++;}}
  v482SelectedArticleIds.clear();await loadNewsroom();safeText('newsroomStatus',`${label} ${success}건 완료${failed?` · 실패 ${failed}건`:''}`);
}
async function v491DeleteSelected(){
  const ids=[...v482SelectedArticleIds];if(!ids.length)return;
  if(!confirm(`선택한 기사 ${ids.length}건을 완전히 삭제할까요?\n\n삭제 후에는 복구할 수 없습니다.`))return;
  let success=0,failed=0;for(const id of ids){try{await newsroomEdgeCall('delete_newsroom_item',{id,region:getAppRegion()});success++;}catch(_){failed++;}}
  v482SelectedArticleIds.clear();selectedNewsroomId=null;await loadNewsroom();safeText('newsroomStatus',`선택 기사 ${success}건 삭제 완료${failed?` · 실패 ${failed}건`:''}`);
}
async function v491DeleteAllVisible(){
  const ids=filteredNewsroom().map(r=>String(r.id));if(!ids.length)return alert('삭제할 기사가 없습니다.');
  if(!confirm(`현재 목록의 기사 ${ids.length}건을 모두 완전히 삭제할까요?\n\n검색·필터가 적용된 경우 현재 표시된 기사만 삭제됩니다. 삭제 후에는 복구할 수 없습니다.`))return;
  const typed=prompt(`확인을 위해 삭제할 기사 수 ${ids.length}을 입력하세요.`);if(String(typed).trim()!==String(ids.length))return alert('입력한 숫자가 일치하지 않아 취소했습니다.');
  let success=0,failed=0;for(const id of ids){try{await newsroomEdgeCall('delete_newsroom_item',{id,region:getAppRegion()});success++;}catch(_){failed++;}}
  v482SelectedArticleIds.clear();selectedNewsroomId=null;await loadNewsroom();safeText('newsroomStatus',`전체 삭제 ${success}건 완료${failed?` · 실패 ${failed}건`:''}`);
}
function renderNewsroom(){
  const counts={all:newsroomItems.length,collected:0,classified:0,review:0}; newsroomItems.forEach(r=>{if(counts[r.status]!==undefined)counts[r.status]++;});
  Object.entries(counts).forEach(([k,v])=>safeText('newsroomCount'+k[0].toUpperCase()+k.slice(1),String(v)));
  v48RenderCategorySummary();
  const available=new Set((newsroomItems||[]).map(r=>String(r.id)));
  v482SelectedArticleIds=new Set([...v482SelectedArticleIds].filter(id=>available.has(String(id))));
  const items=filteredNewsroom(); safeText('newsroomListCount',`${items.length}개`); const box=qs('newsroomList'); if(!box)return;
  if(!items.length){box.innerHTML='<div class="newsroom-empty"><strong>처리할 후보가 없습니다.</strong><span>예정 기사가 없거나 일치하지 않아도 AI 자동 선별이 동작합니다.</span></div>';v482UpdateSelectionStatus();return;}
  box.innerHTML=items.map(r=>{
    const priority=newsroomPriority(r), [,categoryLabel]=v48ItemCategory(r), editor=v48SelectionSource(r)==='editor';
    const meta=(r.event_data&&typeof r.event_data==='object')?r.event_data:{};
    const archiveKept=meta.archive_kept===true;
    const homeLinkEnabled=meta.home_link_enabled===true&&['post','business'].includes(String(meta.home_target_type||''))&&Boolean(String(meta.home_target_id||'').trim());
    const checked=v482SelectedArticleIds.has(String(r.id));
    return `<div class="newsroom-item ${String(r.id)===String(selectedNewsroomId)?'active':''} ${checked?'is-selected':''}" data-id="${esc(r.id)}" style="display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:start">
      <label style="display:flex;align-items:center;gap:6px;padding-top:4px;font-weight:700;cursor:pointer"><input type="checkbox" data-v482-select="${esc(r.id)}" ${checked?'checked':''} style="width:21px;height:21px;accent-color:#2563eb"><span>선택</span></label>
      <div>
        <span class="newsroom-item-top"><strong><span class="pill v48-source-badge">${esc(v48SourceBadge(r))}</span>${archiveKept?'<span class="pill">📌 보관</span>':''}<span class="newsroom-item-priority ${priority}">${priority==='urgent'?'🔴':priority==='high'?'🟠':priority==='normal'?'🔵':'⚪'} ${esc(NEWSROOM_PRIORITY_LABELS[priority])}</span>${esc(r.ai_title||r.original_title)}</strong><span class="newsroom-destination">${esc(categoryLabel)} · ${esc(newsroomLabel(r.destination||r.suggested_destination))}</span></span>
        <span class="newsroom-item-meta">${esc(r.source_name||'출처 미상')} · ${esc(r.area||'Dallas')} · ${esc(newsroomLocalDate(r.source_published_at||r.collected_at))}</span>
        <span class="newsroom-item-summary">${esc((r.ai_summary||r.original_summary||'').slice(0,120))}</span>
        <span style="display:flex;gap:7px;margin-top:8px;flex-wrap:wrap">
          <button type="button" class="btn ghost" data-v48-open="${esc(r.id)}">검토</button>
          <button type="button" class="btn ghost" data-v48-pick="${esc(r.id)}">${editor?'관리자 지정 해제':'관리자 지정'}</button>
          <button type="button" class="btn ${homeLinkEnabled?'primary':'ghost'}" data-v485-home-link="${esc(r.id)}">${homeLinkEnabled?'연결 수정':'업소·게시판 연결'}</button>
          ${homeLinkEnabled?`<button type="button" class="btn ghost" data-v487-delete-link="${esc(r.id)}">연결 제거</button>`:''}
          <button type="button" class="btn ${archiveKept?'primary':'ghost'}" data-v489-list-archive="${esc(r.id)}" data-enabled="${archiveKept?'1':'0'}">${archiveKept?'보관 해제':'보관'}</button>
          <button type="button" class="btn danger" data-v489-list-delete="${esc(r.id)}">삭제</button>
        </span>
      </div>
    </div>`;
  }).join('');
  box.querySelectorAll('[data-v482-select]').forEach(c=>c.addEventListener('change',e=>{e.stopPropagation();const id=String(c.dataset.v482Select);if(c.checked)v482SelectedArticleIds.add(id);else v482SelectedArticleIds.delete(id);c.closest('.newsroom-item')?.classList.toggle('is-selected',c.checked);v482UpdateSelectionStatus();}));
  box.querySelectorAll('[data-v48-open]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();const row=newsroomItems.find(x=>String(x.id)===String(b.dataset.v48Open));if(row)fillNewsroom(row);}));
  box.querySelectorAll('[data-v48-pick]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();const row=newsroomItems.find(x=>String(x.id)===String(b.dataset.v48Pick));if(row)v48SetEditorPick(row.id,v48SelectionSource(row)!=='editor');}));
  box.querySelectorAll('[data-v485-home-link]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();v485ConfigureHomeLink(b.dataset.v485HomeLink);}));
  box.querySelectorAll('[data-v487-delete-link]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();v487DeleteHomeLink(b.dataset.v487DeleteLink);}));
  box.querySelectorAll('[data-v489-list-archive]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();v489SetArchiveKeep(b.dataset.v489ListArchive,b.dataset.enabled!=='1');}));
  box.querySelectorAll('[data-v489-list-delete]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();v489DeleteArticle(b.dataset.v489ListDelete);}));
  box.querySelectorAll('.newsroom-item').forEach(el=>el.addEventListener('click',e=>{if(e.target.closest('button,label,input'))return;const row=newsroomItems.find(x=>String(x.id)===String(el.dataset.id));if(row)fillNewsroom(row);}));
  v482UpdateSelectionStatus();
}
function guideSimilarity(a,b){const A=new Set(String(a||'').toLowerCase().match(/[a-z0-9가-힣]{2,}/g)||[]),B=new Set(String(b||'').toLowerCase().match(/[a-z0-9가-힣]{2,}/g)||[]);let hit=0;A.forEach(x=>{if(B.has(x))hit++});return hit/Math.max(1,Math.min(A.size,B.size));}
function newsroomGuideMatches(row){return boards.filter(b=>normalizeAdminBoardType(b.type)==='guide').map(b=>({...b,_score:guideSimilarity(`${row.ai_title} ${row.ai_summary}`,`${b.title} ${b.content}`)})).filter(b=>b._score>.12).sort((a,b)=>b._score-a._score).slice(0,5);}
function newsroomBusinessScore(b,keywords,area){const hay=[b.name_ko,b.name_en,b.category_ko,b.category,b.description,b.area,b.address].join(' ').toLowerCase();let score=0;keywords.forEach(k=>{if(hay.includes(String(k).toLowerCase()))score+=18});if(area&&hay.includes(String(area).toLowerCase()))score+=22;if(b.is_active!==false)score+=5;return Math.min(99,score);}
function newsroomBusinessMode(){return document.querySelector('input[name="newsroomBusinessMode"]:checked')?.value||'auto';}
function newsroomBindBusinessChecks(){
  qs('newsroomBusinessCandidates')?.querySelectorAll('input[type="checkbox"]').forEach(el=>el.addEventListener('change',()=>{const id=String(el.value);if(el.checked)newsroomBusinessSelection.add(id);else newsroomBusinessSelection.delete(id);updateNewsroomHomeBusinessTargets();}));
}
function renderNewsroomBusinesses(row){
  const keys=newsroomJson(row.category_keywords,[]);
  const mode=newsroomBusinessMode(); const searchWrap=qs('newsroomBusinessSearchWrap'); if(searchWrap)searchWrap.hidden=mode!=='manual';
  const chipBox=qs('newsroomCategoryChips');
  if(mode==='manual'){
    const q=String(val('newsroomBusinessSearch')||'').trim().toLowerCase();
    if(chipBox)chipBox.innerHTML='<span class="newsroom-chip">직접 선택 모드</span>';
    const rows=(businesses||[]).filter(b=>{const hay=[b.name_ko,b.name_en,b.category_ko,b.category,b.area,b.address,b.phone].join(' ').toLowerCase();return !q||hay.includes(q);}).sort((a,b)=>{const ac=newsroomBusinessSelection.has(String(a.id))?1:0,bc=newsroomBusinessSelection.has(String(b.id))?1:0;return bc-ac||String(a.name_ko||a.name_en||'').localeCompare(String(b.name_ko||b.name_en||''),'ko');}).slice(0,80);
    qs('newsroomBusinessCandidates').innerHTML=rows.map(b=>`<label class="newsroom-business"><input type="checkbox" value="${esc(b.id)}" ${newsroomBusinessSelection.has(String(b.id))?'checked':''}><span><strong>${esc(b.name_ko||b.name_en||'업소')}</strong><small>${esc(b.category_ko||b.category||'')} · ${esc(b.area||'')}${b.address?`<br>${esc(b.address)}`:''}</small></span><span class="newsroom-relevance">직접 선택${b.rating?`<br>Google ${esc(b.rating)}`:''}</span></label>`).join('')||'<div class="muted">검색 결과가 없습니다. 다른 업소명이나 지역으로 검색하세요.</div>';
  }else{
    if(chipBox)chipBox.innerHTML=keys.map(k=>`<span class="newsroom-chip">${esc(k)}</span>`).join('')||'<span class="muted">추천 업종 없음</span>';
    const candidates=businesses.map(b=>({b,score:newsroomBusinessScore(b,keys,row.area)})).filter(x=>x.score>=18).sort((a,b)=>b.score-a.score).slice(0,12);
    qs('newsroomBusinessCandidates').innerHTML=candidates.map(({b,score})=>`<label class="newsroom-business"><input type="checkbox" value="${esc(b.id)}" ${newsroomBusinessSelection.has(String(b.id))?'checked':''}><span><strong>${esc(b.name_ko||b.name_en||'업소')}</strong><small>${esc(b.category_ko||b.category||'')} · ${esc(b.area||'')}</small></span><span class="newsroom-relevance">관련도 ${score}%${b.rating?`<br>Google ${esc(b.rating)}`:''}</span></label>`).join('')||'<div class="muted">조건에 맞는 업소가 없습니다. ‘업소 직접 선택’을 사용하세요.</div>';
  }
  newsroomBindBusinessChecks();
}

function newsroomTraceTypeLabel(v){return ({official:'공식기관',research:'연구기관',wire:'통신사',local_media:'미국 지역 언론',national_media:'미국 전국 언론',community_media:'한인·커뮤니티 매체',unknown:'출처 유형 미확인'})[String(v||'')]||'출처 유형 미확인';}
function newsroomTraceRoleLabel(v){return ({primary:'원본 가능성 높음',near_primary:'원본에 가까운 보도',secondary:'후속 보도',discovery_signal:'주제 발견 신호'})[String(v||'')]||'참고 자료';}
function renderNewsroomSourceTrace(trace){
  const status=qs('newsroomSourceTraceStatus'),box=qs('newsroomSourceTraceResults');if(!status||!box)return;
  if(!trace||typeof trace!=='object'){status.textContent='아직 출처를 추적하지 않았습니다.';box.innerHTML='';return;}
  const origin=trace.likely_origin&&typeof trace.likely_origin==='object'?trace.likely_origin:null;
  const sources=Array.isArray(trace.sources)?trace.sources:[];
  const checked=trace.checked_at?new Date(trace.checked_at).toLocaleString('ko-KR'):'확인 시각 없음';
  status.textContent=`마지막 추적 ${checked} · 후보 ${Number(trace.candidate_count||sources.length)}개 검토`;
  const originHtml=origin&&origin.publisher?`<div style="border:1px solid #bcd0f5;background:#fff;border-radius:14px;padding:14px;margin-bottom:12px"><div class="tiny" style="font-weight:800;color:#215fc9">추정 원본 출처 · 신뢰도 ${Math.max(0,Math.min(100,Number(origin.confidence||0)))}%</div><div style="font-weight:900;font-size:16px;margin-top:5px">${esc(origin.publisher)}</div><div style="margin-top:4px">${esc(origin.title||'')}</div><div class="muted" style="margin-top:5px">${esc(newsroomTraceTypeLabel(origin.type))}</div>${origin.url?`<a class="btn ghost" style="margin-top:10px;display:inline-flex" href="${esc(origin.url)}" target="_blank" rel="noopener">후보 원문 열기</a>`:''}</div>`:'<div class="muted" style="margin-bottom:10px">확실한 단일 원본은 찾지 못했습니다. 아래 후보를 참고해 주세요.</div>';
  const notes=trace.notes?`<div style="padding:11px 12px;border-radius:12px;background:#fff7df;margin-bottom:12px">${esc(trace.notes)}</div>`:'';
  const list=sources.map((x,i)=>`<div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;border-top:1px solid #e4ebf6;padding:12px 0"><div><div style="font-weight:800">${i+1}. ${esc(x.publisher||'출처 미상')}</div><div style="margin-top:3px">${esc(x.title||'')}</div><div class="muted" style="margin-top:4px">${esc(newsroomTraceTypeLabel(x.type))} · ${esc(newsroomTraceRoleLabel(x.role))} · 신뢰도 ${Math.max(0,Math.min(100,Number(x.confidence||0)))}%</div>${x.reason?`<div class="tiny" style="margin-top:5px">${esc(x.reason)}</div>`:''}</div>${x.url?`<a class="btn ghost" href="${esc(x.url)}" target="_blank" rel="noopener">열기</a>`:''}</div>`).join('');
  box.innerHTML=originHtml+notes+(list||'<div class="muted">검색된 출처 후보가 없습니다.</div>');
}
async function traceNewsroomSources(){
  if(!selectedNewsroomId)return alert('먼저 기사를 선택하세요.');
  const btn=qs('newsroomTraceSourcesBtn');const old=btn?.textContent;if(btn){btn.disabled=true;btn.textContent='원본 출처 찾는 중…';}
  safeText('newsroomSourceTraceStatus','공식기관·연구기관·미국 언론에서 원출처 후보를 찾고 있습니다.');
  try{const result=await newsroomEdgeCall('trace_sources',{id:selectedNewsroomId,region:getAppRegion()},'원본 출처를 추적하고 있습니다.');renderNewsroomSourceTrace(result.trace);await loadNewsroom();const updated=newsroomItems.find(x=>String(x.id)===String(selectedNewsroomId));if(updated)fillNewsroom(updated);}catch(e){safeText('newsroomSourceTraceStatus',`출처 추적 실패: ${e.message}`);alert(`원본 출처 추적 실패: ${e.message}`);}finally{if(btn){btn.disabled=false;btn.textContent=old||'원본 출처 찾기';}}
}

function fillNewsroom(row){
  selectedNewsroomId=row.id; newsroomBusinessSelection=new Set(newsroomJson(row.selected_business_ids,[]).map(String)); renderNewsroom(); qs('newsroomEmpty').hidden=true; qs('newsroomForm').hidden=false;
  const meta=newsroomJson(row.event_data,{});
  renderNewsroomSourceTrace(meta.source_trace||null);
  const savedMode=meta.business_selection_mode==='manual'?'manual':'auto';
  const modeEl=document.querySelector(`input[name="newsroomBusinessMode"][value="${savedMode}"]`);if(modeEl)modeEl.checked=true;
  setVal('newsroomBusinessSearch','');
  if(qs('newsroomPublishArticle'))qs('newsroomPublishArticle').checked=meta.publish_article===true;
  if(qs('newsroomHomeShow'))qs('newsroomHomeShow').checked=String(meta.selection_source||'')==='editor'||meta.home_show===true;
  setVal('newsroomHomeCategory',meta.home_category||'business');
  setVal('newsroomHomeTargetMode',meta.home_target_type||'business');
  setVal('newsroomHomeLinkLabel',meta.home_link_label||((meta.home_target_type||'business')==='business'?'업소 보기':'기사 보기'));
  if(qs('newsroomIncludeSourceLink'))qs('newsroomIncludeSourceLink').checked=meta.include_source_link===true;
  setVal('newsroomCustomSourceUrl',meta.custom_source_url||'');
  setVal('newsroom_id',row.id); safeText('newsroomSourceKind',row.source_kind==='media'?'지역 언론':'공식기관'); safeText('newsroomOriginalTitle',row.original_title||'원문 제목'); safeText('newsroomMeta',`${row.source_name||''} · ${row.area||'Dallas'} · ${newsroomLocalDate(row.source_published_at)}`);
  const link=qs('newsroomOriginalLink'); link.href=row.original_url||'#'; setVal('newsroomSuggestedDestination',newsroomLabel(row.suggested_destination)); setVal('newsroomDestination',row.destination||row.suggested_destination||'life'); setVal('newsroomConfidence',`${row.confidence||0}%`); setVal('newsroomFactStatus',row.fact_status||'needs_review'); setVal('newsroomAiTitle',row.ai_title||''); setVal('newsroomAiSummary',row.ai_summary||''); setVal('newsroomAiContent',row.ai_content||''); setVal('newsroomClassificationReason',row.classification_reason||''); setVal('newsroomAdminNote',row.admin_note||''); safeText('newsroomOriginalSummary',row.original_summary||'원문 요약이 없습니다. 원문 보기에서 세부 내용을 확인하세요.'); const priority=newsroomPriority(row), priorityEl=qs('newsroomPriorityBadge');if(priorityEl){priorityEl.className=`newsroom-priority ${priority}`;priorityEl.textContent=NEWSROOM_PRIORITY_LABELS[priority];} safeText('newsroomDraftState',row.ai_content?'한국어 기사 초안이 준비되었습니다. 내용을 검토하거나 다시 작성할 수 있습니다.':row.status==='classified'?'AI 분류 완료. 한국어 기사 작성을 실행하세요.':'AI 분석과 한국어 기사 작성을 실행하세요.'); const prepareBtn=qs('newsroomPrepareItemBtn');if(prepareBtn)prepareBtn.textContent=row.ai_content?'AI 분석·기사 다시 만들기':'AI 분석·한국어 기사 만들기';
  const ev=newsroomJson(row.event_data,{}); setVal('newsroomEventName',ev.name||'');setVal('newsroomEventVenue',ev.venue||'');setVal('newsroomEventStart',fmtLocal(ev.start_at));setVal('newsroomEventEnd',fmtLocal(ev.end_at));setVal('newsroomEventAddress',ev.address||'');setVal('newsroomEventCost',ev.cost||'');setVal('newsroomEventOrganizer',ev.organizer||'');
  const matches=newsroomGuideMatches(row), sel=qs('newsroomExistingGuide'); if(sel){sel.innerHTML='<option value="">기존 가이드 선택</option>'+matches.map(g=>`<option value="${esc(g.id)}">${esc(g.title)}</option>`).join(''); if(row.existing_guide_id)sel.value=String(row.existing_guide_id);} safeText('newsroomGuideMatches',matches.length?`관련 기존 글 ${matches.length}개를 찾았습니다.`:'유사한 기존 가이드를 찾지 못했습니다.');
  const action=document.querySelector(`input[name="newsroomGuideAction"][value="${row.guide_action||'update'}"]`);if(action)action.checked=true; updateNewsroomSpecialBoxes(); renderNewsroomBusinesses(row); updateNewsroomUsageControls(); updateNewsroomHomeBusinessTargets(); qs('newsroomForm').scrollIntoView({behavior:'smooth',block:'start'});
}
function updateNewsroomSpecialBoxes(){const article=Boolean(qs('newsroomPublishArticle')?.checked);const d=val('newsroomDestination');const destWrap=qs('newsroomDestinationWrap');if(destWrap)destWrap.hidden=!article;const guideBox=qs('newsroomGuideBox');if(guideBox)guideBox.hidden=!article||d!=='guide';const eventBox=qs('newsroomEventBox');if(eventBox)eventBox.hidden=!article||d!=='notice';}
function updateNewsroomHomeBusinessTargets(){
  const sel=qs('newsroomHomeBusinessTarget');if(!sel)return;
  const current=String(sel.value||'');
  const rows=Array.from(newsroomBusinessSelection).map(id=>businesses.find(b=>String(b.id)===String(id))).filter(Boolean);
  sel.innerHTML=rows.length?rows.map(b=>`<option value="${esc(b.id)}">${esc(b.name_ko||b.name_en||'업소')}${b.area?` · ${esc(b.area)}`:''}</option>`).join(''):'<option value="">먼저 관련 업소에서 업체를 선택하세요</option>';
  if(current&&rows.some(b=>String(b.id)===current))sel.value=current;
}
function updateNewsroomUsageControls(){
  const article=Boolean(qs('newsroomPublishArticle')?.checked),home=Boolean(qs('newsroomHomeShow')?.checked);
  const homeBox=qs('newsroomHomeOptions'),sourceBox=qs('newsroomSourceLinkOptions');if(homeBox)homeBox.hidden=!home;if(sourceBox)sourceBox.hidden=!article;
  updateNewsroomSpecialBoxes();
  const target=qs('newsroomHomeTargetMode');if(target){const postOpt=target.querySelector('option[value="post"]');if(postOpt)postOpt.disabled=!article;if(!article&&target.value==='post')target.value='business';}
  const btn=qs('newsroomPublishBtn');if(btn)btn.textContent=article&&home?'게시판 발행 + 메인 노출':article?'게시판에 기사 발행':home?'메인에만 노출':'노출 방식 선택';
}
function newsroomSelectedBusinessIds(){return Array.from(newsroomBusinessSelection);}
function newsroomEventPayload(){return {name:val('newsroomEventName'),venue:val('newsroomEventVenue'),start_at:fromLocal(val('newsroomEventStart')),end_at:fromLocal(val('newsroomEventEnd')),address:val('newsroomEventAddress'),cost:val('newsroomEventCost'),organizer:val('newsroomEventOrganizer')};}
async function saveNewsroomReview(statusOverride){
  if(!selectedNewsroomId)return; const guideAction=document.querySelector('input[name="newsroomGuideAction"]:checked')?.value||null;
  const row=newsroomItems.find(x=>String(x.id)===String(selectedNewsroomId))||{};
  const oldMeta=newsroomJson(row.event_data,{});
  const eventPayload={...oldMeta,...newsroomEventPayload(),publish_article:Boolean(qs('newsroomPublishArticle')?.checked),home_show:Boolean(qs('newsroomHomeShow')?.checked),home_category:val('newsroomHomeCategory')||'business',home_target_type:val('newsroomHomeTargetMode')||'business',home_target_id:val('newsroomHomeBusinessTarget')||null,home_link_label:val('newsroomHomeLinkLabel').trim()||'업소 보기',include_source_link:Boolean(qs('newsroomIncludeSourceLink')?.checked),custom_source_url:val('newsroomCustomSourceUrl').trim()||null,business_selection_mode:newsroomBusinessMode()};
  const payload={destination:val('newsroomDestination'),fact_status:val('newsroomFactStatus'),ai_title:val('newsroomAiTitle').trim(),ai_summary:val('newsroomAiSummary').trim(),ai_content:val('newsroomAiContent').trim(),selected_business_ids:newsroomSelectedBusinessIds(),event_data:eventPayload,guide_action:guideAction,existing_guide_id:val('newsroomExistingGuide')||null,admin_note:val('newsroomAdminNote').trim()||null,status:statusOverride||'review',reviewed_at:new Date().toISOString(),updated_at:new Date().toISOString()};
  const {error}=await supabase.from('newsroom_items').update(payload).eq('id',selectedNewsroomId);if(error)return alert(`검토 저장 실패: ${error.message}`);await loadNewsroom();const updated=newsroomItems.find(x=>String(x.id)===String(selectedNewsroomId));if(updated)fillNewsroom(updated);return payload;
}
function newsroomRelatedBusinessBlock(ids){const rows=ids.map(id=>businesses.find(b=>String(b.id)===String(id))).filter(Boolean);if(!rows.length)return '';return `\n\n추천 업체\n${rows.map(b=>`• ${b.name_ko||b.name_en}${b.rating?` · Google ${b.rating}`:''}`).join('\n')}`;}
function newsroomEventBlock(ev){const parts=[ev.name&&`행사명: ${ev.name}`,ev.start_at&&`일시: ${new Date(ev.start_at).toLocaleString('ko-KR')}`,ev.venue&&`장소: ${ev.venue}`,ev.address&&`주소: ${ev.address}`,ev.cost&&`비용: ${ev.cost}`,ev.organizer&&`주최: ${ev.organizer}`].filter(Boolean);return parts.length?`\n\n행사 정보\n${parts.join('\n')}`:'';}
async function publishNewsroom(){
  if(!selectedNewsroomId)return;
  const publishArticle=Boolean(qs('newsroomPublishArticle')?.checked),showHome=Boolean(qs('newsroomHomeShow')?.checked);
  if(!publishArticle&&!showHome)return alert('게시판에 기사로 발행하거나 메인 오늘의 달타운에 노출할지 선택하세요.');
  let saved;try{saved=await saveNewsroomReview('review');}catch(e){console.error('[V53.1] review save failed',e);return alert(`검토 저장 실패: ${e.message||e}`);}if(!saved)return;
  const row=newsroomItems.find(x=>String(x.id)===String(selectedNewsroomId))||{};
  let postId=null;
  if(publishArticle){
    let dest=saved.destination;if(dest==='exclude')return alert('기사 발행을 선택한 경우 게시 위치를 정하세요.');
    let type=dest==='notice'?'notice':dest==='guide'?'guide':'life';let title=saved.ai_title;if(dest==='urgent'&&!/^🚨/.test(title))title=`🚨 ${title}`;
    if(dest==='guide'&&saved.guide_action==='life')type='life';const ev=saved.event_data||{};const ids=saved.selected_business_ids||[];
    const includeLink=ev.include_source_link===true&&String(ev.custom_source_url||'').trim();const sourceUrl=includeLink?String(ev.custom_source_url).trim():null;
    const sourceBlock=sourceUrl?`

관련 링크: ${sourceUrl}`:'';
    const content=`${saved.ai_summary?`${saved.ai_summary}

`:''}${saved.ai_content}${type==='notice'?newsroomEventBlock(ev):''}${newsroomRelatedBusinessBlock(ids)}${sourceBlock}`.trim();
    let error=null;
    if(type==='guide'&&saved.guide_action==='update'&&saved.existing_guide_id){const res=await supabase.from(boardTable).update({title,content,external_url:sourceUrl,link_label:sourceUrl?'관련 링크':null,is_active:true}).eq('id',saved.existing_guide_id).select('id').single();postId=res.data?.id;error=res.error;}
    else {const res=await supabase.from(boardTable).insert({type,subtype:type==='life'?(dest==='urgent'?'local_news':null):null,region:getAppRegion(),title,content,external_url:sourceUrl,link_label:sourceUrl?'관련 링크':null,start_at:type==='notice'?(ev.start_at||new Date().toISOString()):new Date().toISOString(),end_at:type==='notice'?(ev.end_at||null):null,is_active:true,created_at:new Date().toISOString()}).select('id').single();postId=res.data?.id;error=res.error;}
    if(error)return alert(`게시 실패: ${error.message}`);
  }
  if(showHome){
    const meta=saved.event_data||{};let targetType=String(meta.home_target_type||'business');let targetId='';
    if(targetType==='post'){if(!publishArticle||!postId)return alert('게시한 기사 연결을 선택하려면 게시판 기사 발행도 체크하세요.');targetId=String(postId);}
    else {targetType='business';targetId=String(val('newsroomHomeBusinessTarget')||newsroomSelectedBusinessIds()[0]||'');if(!targetId)return alert('메인 카드에 연결할 업소를 선택하세요.');}
    try{
      // V51.5: save the final home state directly first, so the selected card is
      // immediately visible even if the deployed Edge Function is one version behind.
      const latestRow=newsroomItems.find(x=>String(x.id)===String(selectedNewsroomId))||row||{};
      const latestMeta=newsroomJson(latestRow.event_data,{});
      const directMeta={...latestMeta,publish_article:publishArticle,home_show:true,home_link_enabled:true,home_target_type:targetType,home_target_id:targetId,home_link_label:String(val('newsroomHomeLinkLabel')||'업소 보기').trim()||'업소 보기',home_category:String(val('newsroomHomeCategory')||'business'),previous_selection_source:String(latestMeta.selection_source||'ai')==='editor'?String(latestMeta.previous_selection_source||'ai'):String(latestMeta.selection_source||'ai'),selection_source:'editor',editor_picked_at:new Date().toISOString(),archive_kept:true,archive_kept_at:new Date().toISOString(),home_link_updated_at:new Date().toISOString()};
      const {error:directError}=await supabase.from('newsroom_items').update({event_data:directMeta,priority_score:999,updated_at:new Date().toISOString()}).eq('id',selectedNewsroomId);
      if(directError)throw directError;
      // Keep the Edge Function calls for server-side compatibility. A stale Edge
      // deployment no longer prevents the direct database state from being saved.
      try{await newsroomEdgeCall('set_home_link',{id:selectedNewsroomId,enabled:true,target_type:targetType,target_id:targetId,label:directMeta.home_link_label,category:directMeta.home_category,region:getAppRegion()});}catch(edgeError){console.warn('[V51.5] set_home_link edge fallback',edgeError);}
      try{await newsroomEdgeCall('set_editor_pick',{id:selectedNewsroomId,enabled:true,region:getAppRegion()});}catch(edgeError){console.warn('[V51.5] set_editor_pick edge fallback',edgeError);}
      try{await newsroomEdgeCall('set_archive_keep',{id:selectedNewsroomId,enabled:true,region:getAppRegion()});}catch(edgeError){console.warn('[V51.5] set_archive_keep edge fallback',edgeError);}
    }catch(homeError){return alert(`${publishArticle?'기사는 발행됐지만 ':''}메인 노출 설정에 실패했습니다: ${homeError.message||homeError}`);}
  }else{
    try{await newsroomEdgeCall('set_editor_pick',{id:selectedNewsroomId,enabled:false,region:getAppRegion()});await newsroomEdgeCall('set_home_link',{id:selectedNewsroomId,enabled:false,target_type:'',target_id:'',label:'',region:getAppRegion()});}catch(_){ }
  }
  alert(publishArticle&&showHome?'게시판 기사 발행과 메인 노출을 완료했습니다.':publishArticle?'게시판 기사만 발행했습니다.':'게시판 기사 없이 오늘의 달타운 메인에만 노출했습니다.');
  selectedNewsroomId=null;newsroomBusinessSelection=new Set();const form=qs('newsroomForm');if(form)form.hidden=true;const empty=qs('newsroomEmpty');if(empty)empty.hidden=false;await Promise.all([loadBoards(),loadNewsroom()]);
}


async function v537EditAutomaticHomeCard(category, item={}){
  category=String(category||'').toLowerCase();
  if(!['weather','traffic'].includes(category))return;
  let settings={};
  try{const r=await newsroomEdgeCall('get_settings',{region:getAppRegion()});settings=r.settings||{};}catch(e){const q=await supabase.from('newsroom_settings').select('*').eq('region',getAppRegion()).maybeSingle();if(q.error)return alert(`자동 카드 설정을 불러오지 못했습니다: ${q.error.message}`);settings=q.data||{};}
  const homeConfig=(settings.home_config&&typeof settings.home_config==='object')?settings.home_config:{};
  const overrides=(homeConfig.auto_card_overrides&&typeof homeConfig.auto_card_overrides==='object')?homeConfig.auto_card_overrides:{};
  const current=(overrides[category]&&typeof overrides[category]==='object')?overrides[category]:{};
  const label=category==='weather'?'날씨':'교통';
  const modal=document.createElement('div');
  modal.style.cssText='position:fixed;inset:0;z-index:999999;background:rgba(15,23,42,.58);display:flex;align-items:center;justify-content:center;padding:18px';
  modal.innerHTML=`<section style="width:min(620px,100%);max-height:90vh;overflow:auto;background:#fff;border-radius:20px;padding:22px;box-shadow:0 25px 80px rgba(0,0,0,.28)"><div style="display:flex;justify-content:space-between;gap:12px;align-items:start"><div><h3 style="margin:0">${label} 메인 문구 수정</h3><p class="tiny muted">자동 데이터는 계속 갱신되고, 관리자가 입력한 제목·특별 메시지만 우선 표시됩니다.</p></div><button type="button" data-close style="border:0;background:#eef2ff;border-radius:10px;padding:8px 12px;font-size:20px">×</button></div><label class="field"><span>메인 제목</span><input data-title maxlength="72" value="${esc(current.title||'')}" placeholder="비워두면 자동 제목 사용"></label><label class="field"><span>특별 메시지</span><textarea data-message rows="4" maxlength="180" placeholder="예: 오후 소나기 가능성이 있으니 우산을 준비하세요.">${esc(current.message||'')}</textarea></label><div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px"><button type="button" class="btn ghost" data-reset>자동 문구로 되돌리기</button><button type="button" class="btn ghost" data-cancel>취소</button><button type="button" class="btn primary" data-save>저장</button></div></section>`;
  document.body.appendChild(modal);
  const close=()=>modal.remove();modal.querySelector('[data-close]').onclick=close;modal.querySelector('[data-cancel]').onclick=close;
  modal.querySelector('[data-reset]').onclick=()=>{modal.querySelector('[data-title]').value='';modal.querySelector('[data-message]').value='';};
  modal.querySelector('[data-save]').onclick=async()=>{const btn=modal.querySelector('[data-save]');btn.disabled=true;btn.textContent='저장 중…';try{const next={...overrides,[category]:{title:String(modal.querySelector('[data-title]').value||'').trim(),message:String(modal.querySelector('[data-message]').value||'').trim(),updated_at:new Date().toISOString()}};const nextConfig={...homeConfig,auto_card_overrides:next};await newsroomEdgeCall('save_settings',{region:getAppRegion(),home_config:nextConfig},'자동 카드 문구를 저장하고 있습니다…');close();await v531LoadHomeDashboard();alert(`${label} 메인 문구를 저장했습니다.`);}catch(e){alert(`저장 실패: ${e.message||e}`);btn.disabled=false;btn.textContent='저장';}};
}



// V53.8: reliable inline editor for the home dashboard.
async function v538RenderInlineEditor(sourceId, categoryOverride=''){
  const host=qs('v518HomeDashboardList');
  if(!host)return;
  let row=null;
  if(sourceId){
    row=newsroomItems.find(x=>String(x.id)===String(sourceId))||null;
    if(!row){
      const q=await supabase.from('newsroom_items').select('*').eq('id',sourceId).maybeSingle();
      if(q.error)return alert(`편집할 콘텐츠를 불러오지 못했습니다: ${q.error.message}`);
      row=q.data||null;
    }
  }
  const meta=newsroomJson(row?.event_data,{});
  const category=String(categoryOverride||meta.home_category||meta.category||'business');
  const automatic=['weather','traffic'].includes(category);
  let currentAuto={};
  let settings={}, homeConfig={}, overrides={};
  if(automatic){
    try{const r=await newsroomEdgeCall('get_settings',{region:getAppRegion()});settings=r.settings||{};}
    catch(_){const q=await supabase.from('newsroom_settings').select('*').eq('region',getAppRegion()).maybeSingle();settings=q.data||{};}
    homeConfig=(settings.home_config&&typeof settings.home_config==='object')?settings.home_config:{};
    overrides=(homeConfig.auto_card_overrides&&typeof homeConfig.auto_card_overrides==='object')?homeConfig.auto_card_overrides:{};
    currentAuto=(overrides[category]&&typeof overrides[category]==='object')?overrides[category]:{};
  }
  const old=qs('v538InlineHomeEditor');if(old)old.remove();
  const panel=document.createElement('section');
  panel.id='v538InlineHomeEditor';
  panel.className='newsroom-item';
  panel.style.cssText='padding:18px;margin:0 0 16px;border:2px solid #2563eb;background:#f8fbff;scroll-margin-top:90px';
  const currentType=automatic?String(currentAuto.target_type||''):String(meta.home_target_type||'');
  const currentTargetId=automatic?String(currentAuto.target_id||''):String(meta.home_target_id||'');
  const businessOptions=(businesses||[]).slice().sort((a,b)=>String(a.name||a.name_ko||'').localeCompare(String(b.name||b.name_ko||''),'ko')).map(b=>`<option value="${esc(b.id)}" ${currentTargetId===String(b.id)?'selected':''}>${esc(b.name||b.name_ko||b.business_name||'업소')} ${b.city?`· ${esc(b.city)}`:''}</option>`).join('');
  const title=automatic?String(currentAuto.title||''):String(meta.home_custom_title||row?.ai_title||row?.original_title||'');
  const message=automatic?String(currentAuto.message||''):String(meta.home_custom_message||meta.home_custom_summary||row?.ai_summary||row?.original_summary||'');
  const external=automatic?String(currentAuto.external_url||''):String(meta.home_external_url||((category==='shopping'&&/^https?:/i.test(String(row?.original_url||'')))?row.original_url:'')||'');
  const linkLabel=automatic?String(currentAuto.link_label||'자세히 보기'):String(meta.home_link_label||((category==='shopping')?'세일 보기':'자세히 보기'));
  panel.innerHTML=`<div style="display:flex;justify-content:space-between;gap:12px;align-items:center"><div><h3 style="margin:0">${esc(v531HomeCategoryLabel(category))} 메인 내용 수정</h3><div class="tiny muted" style="margin-top:4px">이 화면에서 바로 수정하고 저장할 수 있습니다.</div></div><button type="button" class="btn ghost" data-v538-close>닫기</button></div>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin-top:14px">
    <label class="field"><span>메인 제목</span><input data-v538-title maxlength="72" value="${esc(title)}" placeholder="비워두면 자동 제목"></label>
    <label class="field"><span>버튼 문구</span><input data-v538-label maxlength="30" value="${esc(linkLabel)}" placeholder="예: 업소 보기, 자세히 보기"></label>
  </div>
  <label class="field"><span>메인 문구 / 특별 메시지</span><textarea data-v538-message rows="4" maxlength="240" placeholder="관리자가 보여주고 싶은 문구를 입력하세요.">${esc(message)}</textarea></label>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px"><label class="field"><span>연결 방식</span><select data-v538-link><option value="" ${!currentType?'selected':''}>연결 없음</option><option value="external" ${currentType==='external'?'selected':''}>외부 사이트 링크</option><option value="business" ${currentType==='business'?'selected':''}>달타운맵 업소 상세</option>${automatic?'':`<option value="post" ${currentType==='post'?'selected':''}>게시판 글(기존 연결 유지)</option>`}</select></label><label class="field" data-v538-external-box><span>외부 사이트 주소</span><input data-v538-external type="url" value="${esc(external)}" placeholder="https://..."></label><label class="field" data-v538-business-box><span>연결 업소</span><select data-v538-business><option value="">업소 선택</option>${businessOptions}</select></label></div>
  <div style="display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:14px"><button type="button" class="btn ghost" data-v538-reset>자동 문구로 되돌리기</button><button type="button" class="btn primary" data-v538-save>저장</button></div>`;
  host.prepend(panel);panel.scrollIntoView({behavior:'smooth',block:'start'});
  panel.querySelector('[data-v538-close]').onclick=()=>panel.remove();
  panel.querySelector('[data-v538-reset]').onclick=()=>{panel.querySelector('[data-v538-title]').value='';panel.querySelector('[data-v538-message]').value='';};
  {
    const link=panel.querySelector('[data-v538-link]'), eb=panel.querySelector('[data-v538-external-box]'), bb=panel.querySelector('[data-v538-business-box]');
    const sync=()=>{eb.hidden=link.value!=='external';bb.hidden=link.value!=='business';};link.onchange=sync;sync();
  }
  panel.querySelector('[data-v538-save]').onclick=async()=>{
    const btn=panel.querySelector('[data-v538-save]');btn.disabled=true;btn.textContent='저장 중…';
    try{
      const newTitle=String(panel.querySelector('[data-v538-title]').value||'').trim();
      const newMessage=String(panel.querySelector('[data-v538-message]').value||'').trim();
      if(automatic){
        const linkType=String(panel.querySelector('[data-v538-link]').value||'');
        const externalUrl=String(panel.querySelector('[data-v538-external]').value||'').trim();
        const businessId=String(panel.querySelector('[data-v538-business]').value||'').trim();
        if(linkType==='external'&&!/^https?:\/\//i.test(externalUrl))throw new Error('외부 사이트 주소를 https://로 시작해 입력하세요.');
        if(linkType==='business'&&!businessId)throw new Error('연결할 업소를 선택하세요.');
        const next={...overrides,[category]:{title:newTitle,message:newMessage,target_type:linkType||'',target_id:linkType==='business'?businessId:'',external_url:linkType==='external'?externalUrl:'',link_label:linkType?(String(panel.querySelector('[data-v538-label]').value||'자세히 보기').trim()||'자세히 보기'):'',updated_at:new Date().toISOString()}};
        await newsroomEdgeCall('save_settings',{region:getAppRegion(),home_config:{...homeConfig,auto_card_overrides:next}},'자동 카드 문구와 연결을 저장하고 있습니다…');
      }else{
        const linkType=String(panel.querySelector('[data-v538-link]').value||'');
        const externalUrl=String(panel.querySelector('[data-v538-external]').value||'').trim();
        const businessId=String(panel.querySelector('[data-v538-business]').value||'').trim();
        if(linkType==='external'&&!/^https?:\/\//i.test(externalUrl))throw new Error('공식 사이트 주소를 https://로 시작해 입력하세요.');
        if(linkType==='business'&&!businessId)throw new Error('연결할 업소를 선택하세요.');
        const nextMeta={...meta,home_custom_title:newTitle||null,home_custom_message:newMessage||null,home_link_enabled:Boolean(linkType),home_target_type:linkType||null,home_target_id:linkType==='business'?businessId:(linkType==='post'?String(meta.home_target_id||''):null),home_external_url:linkType==='external'?externalUrl:null,home_link_label:linkType?(String(panel.querySelector('[data-v538-label]').value||'자세히 보기').trim()||'자세히 보기'):null,home_content_updated_at:new Date().toISOString()};
        const q=await supabase.from('newsroom_items').update({event_data:nextMeta,updated_at:new Date().toISOString()}).eq('id',sourceId);
        if(q.error)throw q.error;
      }
      await Promise.all([loadNewsroom(),v531LoadHomeDashboard()]);
      alert('메인 내용을 저장했습니다.');
    }catch(e){alert(`저장 실패: ${e.message||e}`);btn.disabled=false;btn.textContent='저장';}
  };
}

function v531HomeCategoryLabel(key){return ({weather:'날씨',traffic:'교통',shopping:'마켓 정보',event:'행사 안내',business:'광고·업소',emergency:'긴급 안내',education:'교육',real_estate:'부동산',finance:'은행·금융'})[String(key||'')]||String(key||'기타');}
function v531HomeItemTargetLabel(item){if(item?.target_type==='business')return '업소 상세 연결';if(item?.target_type==='post')return '게시판 글 연결';if(item?.target_type==='external'||item?.target_url||item?.url)return '공식 사이트 연결';return '연결 없음';}
function v534HomeSourceId(item){return String(item?.source_id||item?.newsroom_id||'').trim();}
async function v534EditHomeCard(sourceId){
  if(!sourceId)return alert('수정할 메인 카드의 원본을 찾지 못했습니다.');
  let row=newsroomItems.find(x=>String(x.id)===String(sourceId));
  if(!row){
    const {data,error}=await supabase.from('newsroom_items').select('*').eq('id',sourceId).maybeSingle();
    if(error)return alert(`편집할 콘텐츠를 불러오지 못했습니다: ${error.message}`);
    row=data;
    if(row&&!newsroomItems.some(x=>String(x.id)===String(row.id)))newsroomItems.unshift(row);
  }
  if(!row)return alert('연결된 원본 콘텐츠를 찾지 못했습니다.');
  const meta=newsroomJson(row.event_data,{});
  const category=String(meta.home_category||meta.category||'business');
  const currentType=String(meta.home_target_type||'');
  const modal=document.createElement('div');
  modal.className='v511-link-modal-wrap';
  const businessOptions=(businesses||[]).slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'ko')).map(b=>`<option value="${esc(b.id)}" ${String(meta.home_target_id||'')===String(b.id)?'selected':''}>${esc(b.name||b.business_name||'업소')} ${b.city?`· ${esc(b.city)}`:''}</option>`).join('');
  const defaultExternal=String(meta.home_external_url||((category==='shopping'&&/^https?:/i.test(String(row.original_url||'')))?row.original_url:'')||'');
  modal.innerHTML=`<section class="v511-link-modal" role="dialog" aria-modal="true"><div class="v511-link-modal-head"><div><h3>메인 카드 문구 수정</h3><p>날씨·교통·마켓·행사·업소 등 메인에 보이는 문구를 직접 수정합니다. 비워두면 자동 생성 문구를 사용합니다.</p></div><button type="button" class="v511-link-close" aria-label="닫기">×</button></div>
  <label class="field"><span>메인 제목</span><input id="v536Title" maxlength="72" value="${esc(meta.home_custom_title||row.ai_title||row.original_title||'')}"></label>
  <label class="field"><span>메인 문구 / 특별 메시지</span><textarea id="v536Message" rows="3" maxlength="180" placeholder="예: 오늘은 비가 예상되니 우산을 준비하세요.">${esc(meta.home_custom_message||meta.home_custom_summary||row.ai_summary||row.original_summary||'')}</textarea></label>
  <label class="field"><span>연결 방식</span><select id="v536LinkType"><option value="" ${!currentType?'selected':''}>연결 없음</option><option value="external" ${currentType==='external'?'selected':''}>공식 사이트 링크</option><option value="business" ${currentType==='business'?'selected':''}>달타운맵 업소 상세</option><option value="post" ${currentType==='post'?'selected':''}>게시판 글(기존 연결 유지)</option></select></label>
  <div id="v536ExternalBox"><label class="field"><span>공식 사이트 주소</span><input id="v536ExternalUrl" type="url" value="${esc(defaultExternal)}" placeholder="https://..."></label></div>
  <div id="v536BusinessBox"><label class="field"><span>연결 업소</span><select id="v536Business"><option value="">업소 선택</option>${businessOptions}</select></label></div>
  <label class="field"><span>버튼 문구</span><input id="v536Label" maxlength="30" value="${esc(meta.home_link_label||((category==='shopping')?'세일 보기':'자세히 보기'))}"></label>
  <div class="v511-link-modal-actions"><button type="button" class="btn ghost v536-reset">자동 문구로 되돌리기</button><button type="button" class="btn ghost v511-link-cancel">취소</button><button type="button" class="btn primary v536-save">저장</button></div></section>`;
  document.body.appendChild(modal);
  const close=()=>modal.remove();
  modal.querySelector('.v511-link-close').onclick=close;modal.querySelector('.v511-link-cancel').onclick=close;
  const typeEl=modal.querySelector('#v536LinkType'), extBox=modal.querySelector('#v536ExternalBox'), bizBox=modal.querySelector('#v536BusinessBox');
  const sync=()=>{extBox.hidden=typeEl.value!=='external';bizBox.hidden=typeEl.value!=='business';};typeEl.onchange=sync;sync();
  modal.querySelector('.v536-reset').onclick=()=>{modal.querySelector('#v536Title').value='';modal.querySelector('#v536Message').value='';};
  modal.querySelector('.v536-save').onclick=async()=>{
    const btn=modal.querySelector('.v536-save');btn.disabled=true;btn.textContent='저장 중…';
    try{
      const linkType=String(typeEl.value||'');
      const externalUrl=String(modal.querySelector('#v536ExternalUrl').value||'').trim();
      const businessId=String(modal.querySelector('#v536Business').value||'').trim();
      if(linkType==='external'&&!/^https?:\/\//i.test(externalUrl))throw new Error('공식 사이트 주소를 https://로 시작해 입력하세요.');
      if(linkType==='business'&&!businessId)throw new Error('연결할 업소를 선택하세요.');
      const newMeta={...meta,
        home_custom_title:String(modal.querySelector('#v536Title').value||'').trim()||null,
        home_custom_message:String(modal.querySelector('#v536Message').value||'').trim()||null,
        home_link_enabled:Boolean(linkType),home_target_type:linkType||null,
        home_target_id:linkType==='business'?businessId:(linkType==='post'?String(meta.home_target_id||''):null),
        home_external_url:linkType==='external'?externalUrl:null,
        home_link_label:linkType?String(modal.querySelector('#v536Label').value||'자세히 보기').trim()||'자세히 보기':null,
        home_content_updated_at:new Date().toISOString()
      };
      const {error}=await supabase.from('newsroom_items').update({event_data:newMeta,updated_at:new Date().toISOString()}).eq('id',sourceId);
      if(error)throw error;
      close();await Promise.all([loadNewsroom(),v531LoadHomeDashboard()]);
    }catch(e){alert(`메인 카드 수정 실패: ${e.message||e}`);btn.disabled=false;btn.textContent='저장';}
  };
}
async function v534RemoveHomeCard(sourceId){
  if(!sourceId)return alert('날씨·교통 자동 카드는 메인에서 직접 삭제할 수 없습니다.');
  if(!confirm('이 콘텐츠를 메인 ‘오늘의 달타운’에서 제거할까요? 게시판에 발행된 글은 그대로 유지됩니다.'))return;
  const {data,error}=await supabase.from('newsroom_items').select('event_data').eq('id',sourceId).maybeSingle();
  if(error)return alert(`콘텐츠 정보를 불러오지 못했습니다: ${error.message}`);
  const oldMeta=newsroomJson(data?.event_data,{});
  const meta={...oldMeta,home_show:false,home_link_enabled:false,home_target_type:null,home_target_id:null,home_link_label:null,selection_source:String(oldMeta.previous_selection_source||'ai'),editor_removed_at:new Date().toISOString()};
  const {error:updateError}=await supabase.from('newsroom_items').update({event_data:meta,updated_at:new Date().toISOString()}).eq('id',sourceId);
  if(updateError)return alert(`메인 제거 실패: ${updateError.message}`);
  try{await newsroomEdgeCall('set_home_link',{id:sourceId,enabled:false,target_type:'',target_id:'',label:'',region:getAppRegion()});}catch(_){ }
  try{await newsroomEdgeCall('set_editor_pick',{id:sourceId,enabled:false,region:getAppRegion()});}catch(_){ }
  await Promise.all([loadNewsroom(),v531LoadHomeDashboard()]);
}
async function v535SetCandidateHome(sourceId, category, enabled){
  if(!sourceId)return;
  const row=newsroomItems.find(x=>String(x.id)===String(sourceId));
  let current=row;
  if(!current){
    const {data,error}=await supabase.from('newsroom_items').select('*').eq('id',sourceId).maybeSingle();
    if(error)return alert(`콘텐츠를 불러오지 못했습니다: ${error.message}`);
    current=data;
  }
  if(!current)return alert('후보 콘텐츠를 찾지 못했습니다.');
  const oldMeta=newsroomJson(current.event_data,{});
  const now=new Date().toISOString();
  const meta={...oldMeta,
    home_show:!!enabled,
    home_category:String(category||oldMeta.home_category||oldMeta.category||'shopping'),
    home_link_enabled:false,
    home_target_type:null,
    home_target_id:null,
    home_link_label:null,
    selection_source:enabled?'editor':String(oldMeta.previous_selection_source||'ai'),
    previous_selection_source:enabled?String(oldMeta.selection_source||'ai'):String(oldMeta.previous_selection_source||oldMeta.selection_source||'ai'),
    editor_picked_at:enabled?now:(oldMeta.editor_picked_at||null),
    editor_removed_at:enabled?null:now,
    archive_kept:enabled?true:!!oldMeta.archive_kept,
    archive_kept_at:enabled?now:(oldMeta.archive_kept_at||null)
  };
  const {error}=await supabase.from('newsroom_items').update({event_data:meta,priority_score:enabled?998:(current.priority_score||0),updated_at:now}).eq('id',sourceId);
  if(error)return alert(`${enabled?'메인 표시':'메인 해제'} 실패: ${error.message}`);
  try{await newsroomEdgeCall('set_editor_pick',{id:sourceId,enabled:!!enabled,region:getAppRegion()});}catch(_){ }
  if(!enabled){try{await newsroomEdgeCall('set_home_link',{id:sourceId,enabled:false,target_type:'',target_id:'',label:'',region:getAppRegion()});}catch(_){ }}
  await Promise.all([loadNewsroom(),v531LoadHomeDashboard()]);
}
function v535CandidateCategory(row){
  const m=newsroomJson(row?.event_data,{});
  const text=`${row?.source_kind||''} ${row?.source_name||''} ${m.category||''} ${m.home_category||''} ${row?.ai_title||''} ${row?.original_title||''}`;
  if(/market|shopping|zion|h\s*mart|마트|세일/i.test(text))return 'shopping';
  if(/event|festival|concert|seminar|행사|공연|축제|세미나/i.test(text))return 'event';
  return '';
}
function v535CandidateIsHome(row){const m=newsroomJson(row?.event_data,{});return m.home_show===true||m.admin_selected===true||m.selected_by_admin===true;}
async function v531LoadHomeDashboard(){
  const status=qs('v518HomeDashboardStatus'),list=qs('v518HomeDashboardList');if(!status||!list||!supabase)return;
  safeText('v518HomeDashboardStatus','메인 피드를 확인하고 있습니다.');
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),12000);
  try{
    const region=getAppRegion();
    const feedUrl=`/.netlify/functions/today-daltown-feed?region=${encodeURIComponent(region)}&_=${Date.now()}`;
    const [feedResult,candidateResult]=await Promise.allSettled([
      fetch(feedUrl,{cache:'no-store',signal:controller.signal}).then(async r=>{const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||`HTTP ${r.status}`);return j;}),
      supabase.from('newsroom_items').select('id,ai_title,ai_summary,original_title,original_summary,status,source_name,source_kind,event_data,priority_score,updated_at,collected_at').eq('region',region).order('updated_at',{ascending:false}).limit(300)
    ]);
    const feed=feedResult.status==='fulfilled'?(feedResult.value.items||[]):[];
    const rows=candidateResult.status==='fulfilled'&&!candidateResult.value.error?(candidateResult.value.data||[]):[];
    const marketRows=rows.filter(x=>v535CandidateCategory(x)==='shopping');
    const eventRows=rows.filter(x=>v535CandidateCategory(x)==='event');
    const adminCards=feed.filter(x=>!['weather','traffic'].includes(String(x.category||'')));
    safeText('v518AdminCardCount',`${adminCards.length}개`);safeText('v518TotalCardCount',`${feed.length}개`);safeText('v518DashboardCheckedAt',new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}));
    const feedOk=feedResult.status==='fulfilled';
    safeText('v518HomeDashboardStatus',feedOk?`메인 연결 정상 · 현재 사용자에게 전달되는 카드 ${feed.length}개 · 마켓 후보 ${marketRows.length}개`:`메인 연결 실패 · ${feedResult.reason?.message||feedResult.reason||'응답 없음'}`);
    const actual=feed.map((x,i)=>{
      const sourceId=v534HomeSourceId(x);const cat=String(x.category||'');const automatic=['weather','traffic'].includes(cat);const editable=!!sourceId;
      let action=automatic?`<button type="button" class="btn ghost" data-v538-auto-inline="${esc(cat)}">문구 수정</button>`:'<span class="tiny muted">관리자 카드</span>';
      if(!automatic){
        action=`<div style="display:flex;gap:7px;flex-wrap:wrap">${editable?`<button type="button" class="btn ghost" data-v538-inline-edit="${esc(sourceId)}" data-v538-category="${esc(cat)}">수정</button>`:''}<button type="button" class="btn danger" data-v535-home-toggle="${esc(sourceId)}" data-v535-category="${esc(cat)}" data-v535-enabled="0">메인에서 숨기기</button></div>`;
      }
      return `<div class="newsroom-item" style="padding:14px;margin-top:9px;border-color:${automatic?'#bfdbfe':'#86efac'}"><div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:start"><div><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="pill">${i+1}번째</span><b>${esc(x.icon||'•')} ${esc(x.title||'제목 없음')}</b></div><div class="tiny muted" style="margin-top:6px">${esc(v531HomeCategoryLabel(cat))} · ${esc(v531HomeItemTargetLabel(x))}${sourceId?` · 원본 ID ${esc(sourceId.slice(0,8))}`:''}</div><div style="margin-top:8px;line-height:1.55">${esc(x.summary||'요약 없음')}</div>${x.link_label?`<div class="tiny" style="margin-top:7px">버튼 문구: <b>${esc(x.link_label)}</b></div>`:''}</div>${action}</div></div>`;
    }).join('');
    const candidateCard=(row,category)=>{const m=newsroomJson(row.event_data,{});const on=v535CandidateIsHome(row);const title=row.ai_title||row.original_title||`${v531HomeCategoryLabel(category)} 후보`;const summary=row.ai_summary||row.original_summary||m.summary||'';return `<div class="newsroom-item" style="padding:12px;margin-top:8px"><div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center"><div><b>${esc(title)}</b><div class="tiny muted" style="margin-top:4px">${esc(row.source_name||'자동 수집')} · ${on?'현재 메인 표시 중':'현재 미표시'}</div>${summary?`<div class="tiny" style="margin-top:6px;line-height:1.45">${esc(String(summary).slice(0,180))}</div>`:''}</div><div style="display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end"><button type="button" class="btn ghost" data-v538-inline-edit="${esc(row.id)}" data-v538-category="${esc(category)}">수정</button><button type="button" class="btn ${on?'danger':'primary'}" data-v535-home-toggle="${esc(row.id)}" data-v535-category="${esc(category)}" data-v535-enabled="${on?'0':'1'}">${on?'메인에서 숨기기':'메인에 표시'}</button></div></div></div>`;};
    const marketCandidates=marketRows.slice(0,8).map(x=>candidateCard(x,'shopping')).join('')||'<div class="empty">현재 수집된 마켓 후보가 없습니다.</div>';
    const eventCandidates=eventRows.slice(0,8).map(x=>candidateCard(x,'event')).join('')||'<div class="empty">현재 수집된 행사 후보가 없습니다.</div>';
    const available=`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:8px">
      <div class="newsroom-item" style="padding:12px"><b>☀️ 날씨</b><div class="tiny muted">자동 표시</div><div class="tiny" style="margin-top:5px;font-weight:800">${feed.some(x=>x.category==='weather')?'현재 표시 중':'현재 피드에 없음'}</div><button type="button" class="btn ghost" style="margin-top:8px" data-v538-auto-inline="weather">문구 수정</button></div>
      <div class="newsroom-item" style="padding:12px"><b>🚗 교통</b><div class="tiny muted">자동 표시</div><div class="tiny" style="margin-top:5px;font-weight:800">${feed.some(x=>x.category==='traffic')?'현재 표시 중':'현재 피드에 없음'}</div><button type="button" class="btn ghost" style="margin-top:8px" data-v538-auto-inline="traffic">문구 수정</button></div>
      <div class="newsroom-item" style="padding:12px"><b>🛒 마켓 정보</b><div class="tiny muted">자동 수집 후 관리자 노출 선택</div><div class="tiny" style="margin-top:5px;font-weight:800">후보 ${marketRows.length}개</div></div>
      <div class="newsroom-item" style="padding:12px"><b>🎉 행사 안내</b><div class="tiny muted">자동 수집 후 관리자 노출 선택</div><div class="tiny" style="margin-top:5px;font-weight:800">후보 ${eventRows.length}개</div></div>
      <div class="newsroom-item" style="padding:12px"><b>⭐ 광고·업소</b><div class="tiny muted">업소 콘텐츠만 수정 가능</div><div class="tiny" style="margin-top:5px;font-weight:800">${feed.filter(x=>x.category==='business').length}개 표시 중</div></div>
    </div>`;
    list.innerHTML=`<h4 style="margin:2px 0 8px">현재 사용자 메인에 표시되는 정확한 내용</h4><div class="tiny muted" style="margin-bottom:8px">모든 카드의 제목과 문구를 수정할 수 있습니다. 날씨·교통도 특별 메시지를 넣을 수 있습니다.</div>${actual||'<div class="empty">현재 사용자 메인에 전달되는 카드가 없습니다.</div>'}<h4 style="margin:18px 0 8px">메인에 표시할 수 있는 항목</h4>${available}<details open style="margin-top:12px"><summary style="cursor:pointer;font-weight:800">🛒 마켓 정보 후보 ${marketRows.length}개 — 표시 여부만 선택</summary><div style="margin-top:8px">${marketCandidates}</div></details><details style="margin-top:12px"><summary style="cursor:pointer;font-weight:800">🎉 행사 안내 후보 ${eventRows.length}개 — 표시 여부만 선택</summary><div style="margin-top:8px">${eventCandidates}</div></details>`;
    list.querySelectorAll('[data-v534-home-edit]').forEach(b=>b.addEventListener('click',(e)=>{e.preventDefault();e.stopPropagation();v534EditHomeCard(b.dataset.v534HomeEdit);}));
    list.querySelectorAll('[data-v537-auto-edit]').forEach(b=>b.addEventListener('click',(e)=>{e.preventDefault();e.stopPropagation();const cat=b.dataset.v537AutoEdit;const item=feed.find(x=>String(x.category||'')===cat)||{};v537EditAutomaticHomeCard(cat,item);}));
    list.querySelectorAll('[data-v538-inline-edit]').forEach(b=>b.addEventListener('click',(e)=>{e.preventDefault();e.stopPropagation();v538RenderInlineEditor(b.dataset.v538InlineEdit,b.dataset.v538Category||'');}));
    list.querySelectorAll('[data-v538-auto-inline]').forEach(b=>b.addEventListener('click',(e)=>{e.preventDefault();e.stopPropagation();v538RenderInlineEditor('',b.dataset.v538AutoInline||'');}));
    list.querySelectorAll('[data-v535-home-toggle]').forEach(b=>b.addEventListener('click',(e)=>{e.preventDefault();e.stopPropagation();v535SetCandidateHome(b.dataset.v535HomeToggle,b.dataset.v535Category,b.dataset.v535Enabled==='1');}));
  }catch(e){safeText('v518HomeDashboardStatus',`메인 현황 확인 실패: ${e.message||e}`);list.innerHTML='<div class="empty">메인 피드 연결을 확인하세요.</div>';}finally{clearTimeout(timer);}
}
async function v531CollectMarkets(){const btn=qs('v531CollectMarketsBtn');if(!btn)return;const old=btn.textContent;btn.disabled=true;btn.textContent='마켓 수집 중…';try{const r=await newsroomEdgeCall('collect_markets',{region:getAppRegion()},'Zion Market·H Mart 정보를 확인하고 있습니다…');alert(`마켓 정보 수집 완료\n새 후보 ${Number(r.inserted||0)}건\n변경 없음 ${Number(r.skipped||0)}건`);await loadNewsroom();}catch(e){alert(`마켓 수집 실패: ${e.message||e}`);}finally{btn.disabled=false;btn.textContent=old;}}

async function excludeNewsroom(){if(!selectedNewsroomId)return;if(!confirm('이 소식을 제외하고 수집 후보에서 삭제할까요?'))return;const {error}=await supabase.from('newsroom_items').delete().eq('id',selectedNewsroomId);if(error)return alert(`후보 삭제 실패: ${error.message}`);selectedNewsroomId=null;await loadNewsroom();qs('newsroomForm').hidden=true;qs('newsroomEmpty').hidden=false;}
function newsroomErrorMessage(value, fallback='뉴스룸 요청 처리 중 오류가 발생했습니다.', depth=0){
  if(typeof value==='string'&&value.trim()){
    const text=value.trim();
    if(text==='[object Object]'||text==='object Object')return '이전 실행의 상세 오류 기록이 없습니다.';
    if((text.startsWith('{')&&text.endsWith('}'))||(text.startsWith('[')&&text.endsWith(']'))){
      try{return newsroomErrorMessage(JSON.parse(text),fallback,depth+1);}catch(_){ }
    }
    return text;
  }
  if(depth>4)return fallback;
  if(value instanceof Error&&value.message)return newsroomErrorMessage(value.message,fallback,depth+1);
  if(value&&typeof value==='object'){
    const nested=value.message??value.error??value.error_description??value.details??value.hint??value.reason;
    if(nested!==undefined&&nested!==value)return newsroomErrorMessage(nested,fallback,depth+1);
    try{const text=JSON.stringify(value);return text&&text!=='{}'?text:fallback;}catch(_){return fallback;}
  }
  return value==null?fallback:String(value);
}
async function newsroomEdgeCall(action, body={}, busyText=''){
  if(busyText)safeText('newsroomStatus',busyText);
  const cfg=window.KFOCUS_CONFIG||{};
  if(!cfg.SUPABASE_URL||!cfg.SUPABASE_ANON_KEY)throw new Error('config.js의 Supabase 설정을 확인하세요.');
  const {data:{session}}=await supabase.auth.getSession();
  if(!session?.access_token)throw new Error('관리자 로그인 세션이 만료되었습니다. 다시 로그인하세요.');
  const functionName=String(cfg.NEWSROOM_FUNCTION_NAME||'newsroom').trim()||'newsroom';
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),125000);
  let res;
  try{
    res=await fetch(`${cfg.SUPABASE_URL.replace(/\/$/,'')}/functions/v1/${encodeURIComponent(functionName)}`,{
      method:'POST',headers:{'Content-Type':'application/json',apikey:cfg.SUPABASE_ANON_KEY,Authorization:`Bearer ${session.access_token}`},
      body:JSON.stringify({action,...body}),signal:controller.signal
    });
  }catch(error){
    if(error?.name==='AbortError')throw new Error('뉴스룸 서버 응답이 125초를 초과했습니다. 잠시 후 해당 분야만 다시 실행해 주세요.');
    throw error;
  }finally{clearTimeout(timer);}
  const text=await res.text();let json={};
  try{json=text?JSON.parse(text):{};}catch(_){throw new Error(`Supabase Edge Function이 JSON이 아닌 응답을 반환했습니다 (${res.status}): ${text.replace(/\s+/g,' ').slice(0,160)}`);}
  if(!res.ok){
    const hint=res.status===404?` Edge Function 이름 '${functionName}'이 배포되어 있는지 확인하세요.`:'';
    const raw=newsroomErrorMessage(json.error||json.message,`뉴스룸 ${action} 실행 실패 (${res.status})`);
    const friendly=/지원하지 않는 뉴스룸 작업/.test(raw)?`배포된 newsroom Edge Function이 관리자 화면보다 오래된 버전입니다. 최신 함수를 배포한 뒤 다시 시도하세요. (요청: ${action})`:raw;
    throw new Error(friendly+hint);
  }
  return json;
}
async function loadNewsroomRunStatus(){
  try{
    let run=null;
    try{
      const json=await newsroomEdgeCall('run_status',{region:getAppRegion()});
      run=json.latest||null;
    }catch(edgeError){
      // Older deployed newsroom functions may not support run_status yet.
      // Fall back to the table directly so one stale function does not break the entire admin UI.
      const {data,error}=await supabase.from('newsroom_runs').select('*').eq('region',getAppRegion()).order('started_at',{ascending:false}).limit(1).maybeSingle();
      if(error)throw edgeError;
      run=data||null;
    }
    const when=run?.started_at?new Date(run.started_at).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'실행 기록 없음';
    safeText('newsroomLastRun',when);
    safeText('newsroomTodayCollected',`${run?.inserted||0}건`);
    safeText('newsroomTodaySkipped',`${run?.skipped||0}건`);
    safeText('newsroomRunResult',run?.status==='success'?'정상 완료':run?.status==='running'?'실행 중':run?.status==='failed'?'실패':'기록 없음');
    const log=qs('newsroomRunLog');
    if(log){
      const parts=[];
      if(run){parts.push(`<b>${esc(run.trigger_type==='scheduled'?'자동':'수동')} 수집</b>`, `<span class="${run.status==='success'?'ok':run.status==='failed'?'bad':''}">${esc(run.status==='success'?'완료':run.status==='failed'?'실패':'진행 중')}</span>`, `<span>검색 ${Number(run.found||0)}건</span>`, `<span>신규 ${Number(run.inserted||0)}건</span>`, `<span>중복·제외 ${Number(run.skipped||0)}건</span>`, `<span>자동정리 ${Number(run.cleaned||0)}건</span>`);if(run.error_message){const msg=newsroomErrorMessage(run.error_message);parts.push(`<span class="bad">${esc(msg)}</span>`);}}else parts.push('<span>아직 수집 실행 기록이 없습니다.</span>');
      log.innerHTML=parts.join('');
    }
  }catch(e){safeText('newsroomLastRun','로그 확인 필요');safeText('newsroomRunResult','연결 확인');const log=qs('newsroomRunLog');if(log)log.innerHTML=`<span class="bad">${esc(e.message)}</span>`;}
}
async function checkNewsroomHealth(showAlert=true){
  const btn=qs('newsroomHealthBtn');if(btn)btn.disabled=true;
  const panel=qs('newsroomHealthPanel');if(panel)panel.hidden=false;
  safeText('newsroomHealthDetails','Supabase Edge Function과 필수 설정을 확인하고 있습니다…');
  try{
    let json;
    try{
      json=await newsroomEdgeCall('status',{region:getAppRegion()});
    }catch(edgeError){
      // Backward-compatible diagnostic when an older Edge Function is still deployed.
      const [items,settings,runs]=await Promise.all([
        supabase.from('newsroom_items').select('id',{count:'exact',head:true}),
        supabase.from('newsroom_settings').select('region',{count:'exact',head:true}),
        supabase.from('newsroom_runs').select('id',{count:'exact',head:true})
      ]);
      json={ok:!items.error&&!settings.error,checks:{edge_function:false,newsroom_items:!items.error,newsroom_settings:!settings.error,newsroom_runs:!runs.error,openai_key:null,service_role_key:null},message:'현재 배포된 Edge Function이 구버전일 수 있습니다. 데이터베이스 연결은 별도로 확인했습니다.'};
    }
    const checks=json.checks||{};
    const rows=[['Edge Function',checks.edge_function],['뉴스룸 테이블',checks.newsroom_items],['설정 테이블',checks.newsroom_settings],['OpenAI API 키',checks.openai_key],['서비스 역할 키',checks.service_role_key]];
    const ok=checks.edge_function===true&&checks.newsroom_items===true&&checks.newsroom_settings===true&&checks.openai_key===true&&checks.service_role_key===true;
    if(qs('newsroomHealthDetails'))qs('newsroomHealthDetails').innerHTML=rows.map(([k,v])=>`<span class="newsroom-health-row ${v===true?'ok':v===false?'bad':''}"><b>${v===true?'✓':v===false?'!':'·'}</b>${esc(k)}</span>`).join('')+`<small>${esc(json.message||'')}</small>`;
    safeText('newsroomAutoBadge',ok?'AI 운영센터 정상':'설정 확인 필요');
    if(showAlert)alert(ok?'AI 운영센터가 정상 연결되어 있습니다.':'확인이 필요한 설정이 있습니다. 상태 표시를 확인하세요.');
    return ok;
  }catch(e){safeText('newsroomHealthDetails',e.message);safeText('newsroomAutoBadge','Edge Function 연결 확인 필요');if(showAlert)alert(`운영 상태 확인 실패: ${e.message}`);return false;}finally{if(btn)btn.disabled=false;}
}
const NEWSROOM_COLLECTION_LANES=[
  ['korean','한인 소식'],['finance','은행·금융'],['shopping','마트·업소'],['events','행사·가족'],['practical','실용정보']
];
async function collectNewsroomLanes(btn,statusPrefix='정보 수집'){
  const region=getAppRegion();
  let cleaned=0,inserted=0,skipped=0,found=0,failed=[];
  const cleanup=await newsroomEdgeCall('cleanup',{region},'지난 날짜 후보를 먼저 정리하고 있습니다…');
  cleaned=Number(cleanup.cleaned||0);
  for(let i=0;i<NEWSROOM_COLLECTION_LANES.length;i++){
    const [lane,label]=NEWSROOM_COLLECTION_LANES[i];
    if(btn)btn.textContent=`${statusPrefix} ${i+1}/${NEWSROOM_COLLECTION_LANES.length} · ${label}`;
    try{
      const r=await newsroomEdgeCall('collect',{region,manual:true,lane},`${label} 분야의 한인 매체·공식 RSS 소스를 수집하고 있습니다…`);
      inserted+=Number(r.inserted||0);skipped+=Number(r.skipped||0);found+=Number(r.found||0);
      if(Array.isArray(r.warnings)&&r.warnings.length)failed.push(`${label}: 일부 RSS 소스 ${r.warnings.length}개를 건너뜀`);
    }catch(e){failed.push(`${label}: ${newsroomErrorMessage(e)}`);console.warn('newsroom lane failed',lane,e);}
  }
  return {ok:failed.length===0,cleaned,inserted,skipped,found,failed};
}
async function prepareTodayNewsroom(){
  const btn=qs('newsroomPrepareTodayBtn');if(!btn)return;const old=btn.textContent;btn.disabled=true;
  try{
    btn.textContent='연결 확인 중…';if(!(await checkNewsroomHealth(false)))throw new Error('먼저 운영 상태의 경고 항목을 해결하세요.');
    btn.textContent='1/3 생활 소식 수집 준비…';const collected=await collectNewsroomLanes(btn,'1/3 수집');
    btn.textContent='2/3 AI 분류 중…';const analyzed=await newsroomEdgeCall('analyze',{region:getAppRegion(),limit:2},'새 수집 자료를 2건씩 AI 분류하고 있습니다…');
    await loadNewsroom();
    const draftTargets=newsroomItems.filter(x=>x.status==='classified'&&x.destination!=='exclude').slice(0,3);let drafted=0;
    for(const item of draftTargets){btn.textContent=`3/3 기사 초안 ${drafted+1}/${draftTargets.length}`;await newsroomEdgeCall('draft',{id:item.id},`${item.ai_title||item.original_title} 기사 초안을 작성하고 있습니다…`);drafted++;}
    await loadNewsroom();
    newsroomStatusFilter='review';$$('.newsroom-filter').forEach(x=>x.classList.toggle('active',x.dataset.status==='review'));renderNewsroom();
    safeText('newsroomStatus',`수집 ${collected.inserted||0}건 · 분류 ${analyzed.analyzed||0}건 · 초안 ${drafted}건 준비 완료`);
    alert(`오늘 자료 준비를 완료했습니다.\n지난 후보 정리 ${collected.cleaned||0}건\n새 수집 ${collected.inserted||0}건\nAI 분류 ${analyzed.analyzed||0}건\n기사 초안 ${drafted}건${collected.failed?.length?`\n일부 분야 실패: ${collected.failed.join(' / ')}`:''}\n\n검토 대기에서 확인한 뒤 게시하세요.`);
  }catch(e){alert(`오늘 자료 준비 실패: ${e.message}`);safeText('newsroomStatus',e.message);}finally{btn.disabled=false;btn.textContent=old;}
}
async function loadNewsroomSettings(){
  const el=qs('newsroomAutoEnabled');
  try{
    let settings=null;
    try{
      const json=await newsroomEdgeCall('get_settings',{region:getAppRegion()});
      settings=json.settings||null;
    }catch(edgeError){
      const {data,error}=await supabase.from('newsroom_settings').select('*').eq('region',getAppRegion()).maybeSingle();
      if(error)throw edgeError;
      settings=data||null;
    }
    if(el)el.checked=settings?.auto_enabled!==false;
    v45FillHomeConfig(settings?.home_config||{});
    safeText('newsroomAutoBadge',el?.checked?'매일 오전 자동 수집 ON':'자동 수집 OFF');
  }catch(e){safeText('newsroomAutoBadge','자동 수집 설정 확인 필요');console.warn(e);}
}
async function saveNewsroomAutoSetting(){const el=qs('newsroomAutoEnabled');if(!el)return;try{await newsroomEdgeCall('save_settings',{region:getAppRegion(),auto_enabled:el.checked},'자동 수집 설정을 저장하고 있습니다…');safeText('newsroomAutoBadge',el.checked?'매일 오전 자동 수집 ON':'자동 수집 OFF');safeText('newsroomStatus',el.checked?'매일 오전 자동 수집을 사용합니다.':'자동 수집을 중지했습니다. 수동 수집은 계속 사용할 수 있습니다.');}catch(e){el.checked=!el.checked;alert(`자동 수집 설정 실패: ${e.message}`);}}
async function collectNewsroom(){
  const btn=qs('newsroomCollectBtn'),old=btn.textContent;btn.disabled=true;btn.textContent='수집 준비…';
  try{
    const json=await collectNewsroomLanes(btn,'분야별 수집');
    const failed=json.failed?.length?`\n\n일부 분야는 건너뛰었습니다.\n${json.failed.join('\n')}`:'';
    alert(`지난 후보 ${json.cleaned||0}건을 정리하고, 새 원문 후보 ${json.inserted||0}건을 저장했습니다.${json.skipped?`\n중복·기간 제외 ${json.skipped}건`:''}${failed}`);
    safeText('newsroomStatus',`${json.inserted||0}건 수집 완료 · 지난 후보 ${json.cleaned||0}건 정리${json.failed?.length?` · ${json.failed.length}개 분야 재시도 필요`:''}`);
    await loadNewsroom();
  }catch(e){alert(`생활 소식 수집 실패: ${e.message}`);safeText('newsroomStatus',e.message);}finally{btn.disabled=false;btn.textContent=old;}
}
async function analyzeNewsroomItem(id=selectedNewsroomId){
  if(!id)return alert('분류할 소식을 먼저 선택하세요.');const btn=qs('newsroomAnalyzeBtn');if(btn)btn.disabled=true;
  try{const json=await newsroomEdgeCall('analyze',{id,region:getAppRegion()},'선택한 소식의 목적지·신뢰도·관련 업종을 분석하고 있습니다.');alert(`${json.analyzed||0}건을 AI 분류했습니다.`);await loadNewsroom();const row=newsroomItems.find(x=>String(x.id)===String(id));if(row)fillNewsroom(row);}catch(e){alert(`AI 분류 실패: ${e.message}`);safeText('newsroomStatus',e.message);}finally{if(btn)btn.disabled=false;}
}
async function analyzeCollectedNewsroom(){
  const btn=qs('newsroomAnalyzeAllBtn');if(btn)btn.disabled=true;
  const old=btn?.textContent||'② 수집분 AI 분류';
  let total=0,excluded=0,failed=[];
  try{
    // Small repeated batches prevent one long 125-second request.
    for(let round=1;round<=5;round++){
      if(btn)btn.textContent=`AI 분류 ${round}/5…`;
      safeText('newsroomStatus',`수집 대기 항목을 2건씩 나누어 분류하고 있습니다. (${round}/5)`);
      const json=await newsroomEdgeCall('analyze',{region:getAppRegion(),limit:2},`AI 분류 ${round}/5 · 최대 2건 처리 중…`);
      total+=Number(json.analyzed||0);excluded+=Number(json.excluded||0);
      if(Array.isArray(json.failed)&&json.failed.length)failed.push(...json.failed);
      if(Number(json.analyzed||0)===0)break;
    }
    await loadNewsroom();
    const note=failed.length?`
일부 실패 ${failed.length}건은 다음 실행에서 다시 시도됩니다.`:'';
    alert(`${total}건을 분류했습니다.${excluded?` 제외 ${excluded}건`:''}${note}`);
    safeText('newsroomStatus',`${total}건 AI 분류 완료${failed.length?` · 일부 ${failed.length}건 재시도 필요`:''}`);
  }catch(e){
    alert(`AI 일괄 분류 실패: ${e.message}

이미 완료된 항목은 저장되어 있습니다. 버튼을 다시 누르면 남은 항목부터 계속합니다.`);
    safeText('newsroomStatus',e.message);
    await loadNewsroom().catch(()=>{});
  }finally{if(btn){btn.disabled=false;btn.textContent=old;}}
}
async function prepareNewsroomItem(){
  if(!selectedNewsroomId)return alert('작성할 소식을 먼저 선택하세요.');
  const btn=qs('newsroomPrepareItemBtn');if(btn)btn.disabled=true;const old=btn?.textContent||'';
  try{
    if(btn)btn.textContent='1/2 AI 분류 중…';
    await newsroomEdgeCall('analyze',{id:selectedNewsroomId,region:getAppRegion()},'선택한 소식의 중요도·목적지·관련 업종을 분석하고 있습니다.');
    if(btn)btn.textContent='2/2 한국어 기사 작성 중…';
    await newsroomEdgeCall('draft',{id:selectedNewsroomId,rewrite:true},'원문을 바탕으로 한국 독자용 기사를 새로 작성하고 있습니다.');
    await loadNewsroom();const updated=newsroomItems.find(x=>String(x.id)===String(selectedNewsroomId));if(updated)fillNewsroom(updated);
    alert('AI 분류와 한국어 기사 작성을 완료했습니다. 제목·날짜·수치와 출처를 검토한 뒤 게시하세요.');
  }catch(e){alert(`AI 기사 준비 실패: ${e.message}`);safeText('newsroomStatus',e.message);}finally{if(btn){btn.disabled=false;btn.textContent=old||'AI 분석·한국어 기사 만들기';}}
}

async function draftNewsroomItem(){
  if(!selectedNewsroomId)return alert('작성할 소식을 먼저 선택하세요.');const row=newsroomItems.find(x=>String(x.id)===String(selectedNewsroomId));if(row?.status==='collected'){return prepareNewsroomItem();}const btn=qs('newsroomDraftBtn');if(btn)btn.disabled=true;
  try{await newsroomEdgeCall('draft',{id:selectedNewsroomId,rewrite:true},'선택한 자료로 한국어 기사를 다시 작성하고 있습니다.');alert('한국어 기사 초안을 다시 작성했습니다.');await loadNewsroom();const updated=newsroomItems.find(x=>String(x.id)===String(selectedNewsroomId));if(updated)fillNewsroom(updated);}catch(e){alert(`기사 작성 실패: ${e.message}`);safeText('newsroomStatus',e.message);}finally{if(btn)btn.disabled=false;}
}


let v48ScheduledTopics=[];
const V48_CATEGORY_DEFS=[
 ['shopping','쇼핑·마켓',/(마트|마켓|h\s?mart|zion|komart|세일|할인|shopping|grocery)/i],['weather','날씨',/(weather|heat|storm|rain|폭염|기상|비|우박)/i],['traffic','교통',/(traffic|road|highway|closure|교통|도로|정체|통제)/i],['event','공연·이벤트',/(event|festival|concert|공연|행사|축제|미팅)/i],['education','교육',/(school|isd|student|교육|학교|학군|개학)/i],['real_estate','부동산',/(real estate|housing|mortgage|부동산|주택|모기지)/i],['finance','은행·금융',/(bank|loan|rate|finance|은행|대출|금리|경제)/i],['seminar','세미나',/(seminar|workshop|세미나|설명회|강연)/i],['faith','종교 행사',/(church|catholic|temple|교회|성당|예배|부흥회)/i]
];
function v48ItemCategory(row){const text=`${row.ai_title||''} ${row.original_title||''} ${(row.category_keywords||[]).join(' ')}`;return V48_CATEGORY_DEFS.find(x=>x[2].test(text))?.slice(0,2)||['other','미분류'];}
function v48SelectionSource(row){return row?.event_data?.selection_source||'ai';}
function v48SourceBadge(row){const source=v48SelectionSource(row);return source==='scheduled'?'🎯 예정 기사':source==='editor'?'✍ 관리자 지정':'🤖 AI 선별';}
function v48RenderCategorySummary(){const box=qs('v48CategorySummary');if(!box)return;const counts={};newsroomItems.forEach(r=>{const [k,l]=v48ItemCategory(r);counts[k]={label:l,n:(counts[k]?.n||0)+1};});const total=newsroomItems.length;box.innerHTML=`<strong>현재 수집 목록 ${total}건</strong><div class="newsroom-chips" style="margin-top:8px">${V48_CATEGORY_DEFS.map(([k,l])=>`<span>${esc(l)} ${counts[k]?.n||0}</span>`).join('')}<span>미분류 ${counts.other?.n||0}</span></div>`;}
async function v48LoadTopics(){try{const j=await newsroomEdgeCall('list_scheduled_topics',{region:getAppRegion()});v48ScheduledTopics=j.items||[];v48RenderTopics();}catch(e){const box=qs('v48TopicList');if(box)box.innerHTML=`<div class="bad">${esc(e.message)}</div>`;}}
function v48RenderTopics(){const box=qs('v48TopicList');if(!box)return;box.innerHTML=v48ScheduledTopics.length?v48ScheduledTopics.map(t=>`<div class="newsroom-item" style="display:flex;gap:10px;align-items:center"><div style="flex:1"><strong>${'★'.repeat(Number(t.priority||1))} ${esc(t.title)}</strong><div class="tiny muted">${esc(t.category)} · ${esc(t.recurrence)} · ${esc(t.search_query)}</div></div><button class="btn ghost" type="button" data-v48-edit="${esc(t.id)}">수정</button><button class="btn danger" type="button" data-v48-delete="${esc(t.id)}">삭제</button></div>`).join(''):'<div class="newsroom-empty"><strong>예정 기사가 없습니다.</strong><span>비어 있어도 AI가 자동으로 오늘의 기사를 선별합니다.</span></div>';box.querySelectorAll('[data-v48-edit]').forEach(b=>b.onclick=()=>v48EditTopic(b.dataset.v48Edit));box.querySelectorAll('[data-v48-delete]').forEach(b=>b.onclick=()=>v48DeleteTopic(b.dataset.v48Delete));}
function v48ResetTopic(){setVal('v48TopicId','');setVal('v48TopicTitle','');setVal('v48TopicQuery','');setVal('v48TopicCategory','shopping');setVal('v48TopicPriority','2');setVal('v48TopicRecurrence','daily');setVal('v48TopicScheduleValue','');if(qs('v48TopicActive'))qs('v48TopicActive').checked=true;}
function v48EditTopic(id){const t=v48ScheduledTopics.find(x=>String(x.id)===String(id));if(!t)return;setVal('v48TopicId',t.id);setVal('v48TopicTitle',t.title);setVal('v48TopicQuery',t.search_query);setVal('v48TopicCategory',t.category);setVal('v48TopicPriority',String(t.priority||2));setVal('v48TopicRecurrence',t.recurrence||'daily');let v='';if(t.recurrence==='weekly')v=(t.days_of_week||[]).join(',');else if(t.recurrence==='monthly')v=t.day_of_month||'';else if(t.recurrence==='once')v=t.run_date||'';setVal('v48TopicScheduleValue',v);qs('v48TopicActive').checked=t.is_active!==false;}
async function v48SaveTopic(){const recurrence=val('v48TopicRecurrence'),sv=val('v48TopicScheduleValue').trim();const body={id:val('v48TopicId')||undefined,region:getAppRegion(),title:val('v48TopicTitle').trim(),search_query:val('v48TopicQuery').trim(),category:val('v48TopicCategory'),priority:Number(val('v48TopicPriority')||2),recurrence,is_active:qs('v48TopicActive')?.checked!==false,days_of_week:recurrence==='weekly'?sv.split(',').map(Number).filter(Number.isFinite):[],day_of_month:recurrence==='monthly'?Number(sv)||null:null,run_date:recurrence==='once'?sv||null:null};try{await newsroomEdgeCall('save_scheduled_topic',body,'예정 기사를 저장하고 있습니다…');v48ResetTopic();await v48LoadTopics();safeText('newsroomStatus','예정 기사를 저장했습니다.');}catch(e){alert(`예정 기사 저장 실패: ${e.message}`);}}
async function v48DeleteTopic(id){if(!confirm('이 예정 기사를 삭제할까요?'))return;try{await newsroomEdgeCall('delete_scheduled_topic',{id,region:getAppRegion()});await v48LoadTopics();}catch(e){alert(e.message);}}
async function v48AutoRun(){const b=qs('v48AutoRunBtn'),old=b?.textContent;if(b){b.disabled=true;b.textContent='예정 기사 우선 검색 중…';}try{const j=await newsroomEdgeCall('auto_run',{region:getAppRegion()},'예정 기사 우선 → AI 자동 선별 순서로 편성하고 있습니다…');await loadNewsroom();alert(`자동 편성 완료\n예정 기사 일치 ${j.planned?.inserted||0}건\nAI 분류 ${j.analyzed||0}건`);}catch(e){alert(`자동 편성 실패: ${e.message}`);}finally{if(b){b.disabled=false;b.textContent=old;}}}
async function v48SetEditorPick(id,enabled=true){try{await newsroomEdgeCall('set_editor_pick',{id,enabled,region:getAppRegion()});await loadNewsroom();safeText('newsroomStatus',enabled?'오늘의 달타운 메인 노출을 켰습니다. 필요하면 업소·게시판 연결을 설정하세요.':'오늘의 달타운 메인 노출을 해제했습니다.');}catch(e){alert(e.message);}}

function initNewsroom(){
  const nav=qs('adminNav');if(!nav||!qs('section-newsroom'))return;
  qs('v48TopicSaveBtn')?.addEventListener('click',v48SaveTopic);qs('v48TopicResetBtn')?.addEventListener('click',v48ResetTopic);qs('v48AutoRunBtn')?.addEventListener('click',v48AutoRun);qs('v482SelectAllBtn')?.addEventListener('click',v482SelectVisibleArticles);qs('v482ClearSelectionBtn')?.addEventListener('click',v482ClearArticleSelection);qs('v482ApplyPicksBtn')?.addEventListener('click',v482ApplySelectedPicks);qs('v487RemovePicksBtn')?.addEventListener('click',v487RemoveSelectedPicks);qs('v491ArchiveSelectedBtn')?.addEventListener('click',()=>v491ArchiveSelected(true));qs('v491UnarchiveSelectedBtn')?.addEventListener('click',()=>v491ArchiveSelected(false));qs('v491DeleteSelectedBtn')?.addEventListener('click',v491DeleteSelected);qs('v491DeleteAllBtn')?.addEventListener('click',v491DeleteAllVisible);qs('v481CollectedRefreshBtn')?.addEventListener('click',loadNewsroom);qs('newsroomPrepareItemBtn')?.addEventListener('click',prepareNewsroomItem);qs('newsroomHealthBtn')?.addEventListener('click',()=>checkNewsroomHealth(true));qs('newsroomCollectBtn')?.addEventListener('click',collectNewsroom);qs('newsroomAutoEnabled')?.addEventListener('change',saveNewsroomAutoSetting);qs('newsroomAnalyzeAllBtn')?.addEventListener('click',analyzeCollectedNewsroom);qs('newsroomAnalyzeBtn')?.addEventListener('click',()=>analyzeNewsroomItem());qs('newsroomDraftBtn')?.addEventListener('click',draftNewsroomItem);qs('newsroomRefreshBtn')?.addEventListener('click',loadNewsroom);qs('v518HomeDashboardRefresh')?.addEventListener('click',v531LoadHomeDashboard);qs('v531CollectMarketsBtn')?.addEventListener('click',v531CollectMarkets);qs('newsroomSearch')?.addEventListener('input',renderNewsroom);qs('newsroomDestinationFilter')?.addEventListener('change',renderNewsroom);qs('newsroomSourceFilter')?.addEventListener('change',renderNewsroom);qs('newsroomDestination')?.addEventListener('change',updateNewsroomSpecialBoxes);qs('newsroomPublishArticle')?.addEventListener('change',updateNewsroomUsageControls);qs('newsroomHomeShow')?.addEventListener('change',updateNewsroomUsageControls);qs('newsroomHomeTargetMode')?.addEventListener('change',updateNewsroomUsageControls);qs('newsroomSaveReviewBtn')?.addEventListener('click',()=>saveNewsroomReview());qs('newsroomExcludeBtn')?.addEventListener('click',excludeNewsroom);qs('newsroomPublishBtn')?.addEventListener('click',publishNewsroom);qs('newsroomRecommendBusinessesBtn')?.addEventListener('click',()=>{const auto=document.querySelector('input[name="newsroomBusinessMode"][value="auto"]');if(auto)auto.checked=true;const r=newsroomItems.find(x=>String(x.id)===String(selectedNewsroomId));if(r)renderNewsroomBusinesses(r);});document.querySelectorAll('input[name="newsroomBusinessMode"]').forEach(el=>el.addEventListener('change',()=>{const r=newsroomItems.find(x=>String(x.id)===String(selectedNewsroomId));if(r)renderNewsroomBusinesses(r);}));qs('newsroomBusinessSearch')?.addEventListener('input',()=>{const r=newsroomItems.find(x=>String(x.id)===String(selectedNewsroomId));if(r&&newsroomBusinessMode()==='manual')renderNewsroomBusinesses(r);});
  $$('.newsroom-filter').forEach(b=>b.addEventListener('click',()=>{$$('.newsroom-filter').forEach(x=>x.classList.remove('active'));b.classList.add('active');newsroomStatusFilter=b.dataset.status;renderNewsroom();}));
  loadNewsroom();loadNewsroomSettings();checkNewsroomHealth(false);
}
document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>{v61HomeSettingsPanel();initNewsroom();},1400));


// V61 메인 자동 편성·날짜별 운영 설정
let v61HomeSchedules=[];
let v117LoadedHomeConfig={};
const V61_MODE_LABELS={featured:'추천업체',popular:'인기업체',new:'신규업체',coupon:'쿠폰 있는 업체',banner:'배너 있는 업체',video:'영상 있는 업체',promotion:'쿠폰·배너·영상 업체',rotation:'날짜별 자동 순환',random:'전체 랜덤'};
function v61HomeSettingsPanel(){
  if(qs('v61HomeSettingsPanel'))return;
  const section=qs('section-newsroom');if(!section)return;
  const panel=document.createElement('section');panel.id='v61HomeSettingsPanel';panel.className='panel';panel.style.marginBottom='18px';
  const modeOptions=Object.entries(V61_MODE_LABELS).filter(([v])=>!['rotation','random'].includes(v)).map(([v,l])=>`<option value="${v}">${l}</option>`).join('');
  panel.innerHTML=`<div class="panel-head"><div><h2>메인 화면 편성</h2><p class="muted">메인에 있는 각 영역을 관리자가 독립적으로 표시하거나 숨길 수 있습니다.</p></div><button id="v45HomeSaveBtn" class="btn primary" type="button">메인 설정 저장</button></div>

  <div style="display:grid;gap:16px">
    <section style="padding:18px;border:1px solid #dbe4f0;border-radius:16px;background:#fff">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px"><div><h3 style="margin:0 0 4px">오늘의 달타운</h3><p class="muted" style="margin:0">날씨·교통·마켓 소식은 자동 편성됩니다.</p></div><label style="font-weight:700"><input id="v119ShowToday" type="checkbox" checked> 메인에 표시</label></div>
    </section>

    <section style="padding:18px;border:1px solid #dbe4f0;border-radius:16px;background:#f8fbff">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px"><div><h3 style="margin:0 0 4px">달타운 추천</h3><p class="muted" style="margin:0">추천 카드와 업소 목록에 사용할 업체 기준을 선택합니다.</p></div><label style="font-weight:700"><input id="v116ShowRecommend" type="checkbox" checked> 메인에 표시</label></div>
      <div class="form-grid">
        <label class="field"><span>업체 기준</span><select id="v45BusinessMode">${modeOptions}</select></label>
        <label class="field full"><span>관리자 직접 지정 업체</span><select id="v45BusinessIds" multiple size="6"></select><small class="muted">직접 지정하지 않으면 선택한 기준에 맞는 업체가 자동으로 표시됩니다. Ctrl/Command로 여러 업체를 선택할 수 있습니다.</small></label>
      </div>
    </section>

    <section style="padding:18px;border:1px solid #dbe4f0;border-radius:16px;background:#fff">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px"><div><h3 style="margin:0 0 4px">커뮤니티</h3><p class="muted" style="margin:0">선택한 게시판의 최신 글을 한 줄씩 순환 표시합니다.</p></div><label style="font-weight:700"><input id="v116ShowCommunity" type="checkbox" checked> 메인에 표시</label></div>
      <div id="v45CommunityTypes" class="checkbox-row">
        <label><input type="checkbox" value="notice" checked> 행사안내</label>
        <label><input type="checkbox" value="life" checked> 달라스 라이프</label>
        <label><input type="checkbox" value="guide" checked> 달라스 가이드</label>
      </div>
    </section>

    <section style="padding:18px;border:1px solid #dbe4f0;border-radius:16px;background:#f8fbff">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px"><div><h3 style="margin:0 0 4px">달타운 알림</h3><p class="muted" style="margin:0">직접 입력한 공지를 우선 표시하고, 비어 있으면 게시판 공지를 사용합니다.</p></div><label style="font-weight:700"><input id="v116ShowAlert" type="checkbox" checked> 메인에 표시</label></div>
      <div class="checkbox-row" style="margin-bottom:12px"><label><input id="v117AlertEnabled" type="checkbox" checked> 알림 사용</label><label><input id="v117UseBoardNotice" type="checkbox" checked> 게시판 공지 사용</label></div>
      <div class="form-grid">
        <label class="field"><span>공지 제목</span><input id="v117AlertTitle" maxlength="100" placeholder="예: 달타운맵 무료 업소 등록 안내"></label>
        <label class="field"><span>버튼 문구</span><input id="v117AlertLabel" maxlength="30" placeholder="예: 자세히 보기"></label>
        <label class="field full"><span>공지 내용</span><textarea id="v117AlertMessage" rows="3" maxlength="300" placeholder="메인 달타운 알림에 표시할 내용을 입력하세요."></textarea></label>
        <label class="field"><span>연결 종류</span><select id="v117AlertLinkType"><option value="none">연결 없음</option><option value="url">외부 링크</option><option value="board">게시판 글 ID</option><option value="business">업소 ID</option><option value="guide">달라스 가이드</option></select></label>
        <label class="field"><span>연결 주소 또는 ID</span><input id="v117AlertLinkValue" placeholder="https://... 또는 게시글/업소 ID"></label>
      </div>
      <small class="muted">제목이나 내용을 입력하지 않아도 ‘알림 사용’이 켜져 있으면 기본 안내 문구가 표시됩니다. 게시판 공지는 게시글 작성·수정 화면에서 ‘달타운 알림 공지’로 지정합니다.</small>
    </section>

    <section style="padding:18px;border:1px solid #dbe4f0;border-radius:16px;background:#fff">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px"><div><h3 style="margin:0 0 4px">한 줄 광고</h3><p class="muted" style="margin:0">광고·쿠폰·직접 입력 문구를 메인에서 순환 표시합니다.</p></div><label style="font-weight:700"><input id="v119ShowTicker" type="checkbox" checked> 메인에 표시</label></div>
      <div class="checkbox-row" style="margin-bottom:12px"><label><input id="v61TickerDalpick" type="checkbox" checked> 등록 광고·콘텐츠</label><label><input id="v61TickerCoupon" type="checkbox" checked> 유효한 쿠폰</label><label><input id="v119TickerDirectEnabled" type="checkbox"> 직접 입력 사용</label></div>
      <div class="form-grid">
        <label class="field full"><span>직접 입력 광고 문구</span><input id="v119TickerText" maxlength="140" placeholder="예: 달타운맵 무료 업소 등록 이벤트"></label>
        <label class="field"><span>버튼·표시 문구</span><input id="v119TickerLabel" maxlength="30" placeholder="예: 자세히 보기"></label>
        <label class="field"><span>연결 주소</span><input id="v119TickerUrl" placeholder="https://... (선택)"></label>
      </div>
    </section>
  </div>

  <hr><div class="panel-head"><div><h3>날짜별 자동 변경 일정</h3><p class="muted">기간이 겹치면 우선순위 숫자가 큰 일정이 적용됩니다. 종료일 다음 날에는 자동으로 기본 설정으로 돌아갑니다.</p></div><button id="v61ScheduleAddBtn" class="btn ghost" type="button">일정 추가</button></div>
  <div class="form-grid">
    <input id="v61ScheduleId" type="hidden">
    <label class="field"><span>일정 이름</span><input id="v61ScheduleName" placeholder="예: 8월 쿠폰 주간"></label>
    <label class="field"><span>추천업체 기준</span><select id="v61ScheduleMode">${Object.entries(V61_MODE_LABELS).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></label>
    <label class="field"><span>시작일</span><input id="v61ScheduleStart" type="date"></label>
    <label class="field"><span>종료일</span><input id="v61ScheduleEnd" type="date"></label>
    <label class="field"><span>우선순위</span><input id="v61SchedulePriority" type="number" value="10"></label>
    <div class="field"><span>한 줄 광고 포함</span><div class="checkbox-row"><label><input id="v61ScheduleDalpick" type="checkbox" checked> 광고·콘텐츠</label><label><input id="v61ScheduleCoupon" type="checkbox" checked> 쿠폰</label></div></div>
    <label class="field checkbox-line"><input id="v61ScheduleEnabled" type="checkbox" checked><span>이 일정 사용</span></label>
    <div class="field"><span>&nbsp;</span><button id="v61ScheduleSaveBtn" class="btn primary" type="button">일정 등록</button></div>
  </div><div id="v61ScheduleList" class="business-list" style="margin-top:14px"></div>`;
  section.prepend(panel);
  qs('v61ScheduleAddBtn').onclick=v61ResetScheduleForm;qs('v61ScheduleSaveBtn').onclick=v61SaveScheduleLocal;
}
function v61ResetScheduleForm(){setVal('v61ScheduleId','');setVal('v61ScheduleName','');setVal('v61ScheduleStart','');setVal('v61ScheduleEnd','');setVal('v61ScheduleMode','featured');setVal('v61SchedulePriority','10');setChecked('v61ScheduleDalpick',true);setChecked('v61ScheduleCoupon',true);setChecked('v61ScheduleEnabled',true);safeText('v61ScheduleSaveBtn','일정 등록')}
function v61SchedulePayload(){const start=val('v61ScheduleStart'),end=val('v61ScheduleEnd');if(!start||!end)throw new Error('시작일과 종료일을 입력하세요.');if(end<start)throw new Error('종료일은 시작일보다 빠를 수 없습니다.');return {id:val('v61ScheduleId')||`schedule-${Date.now()}`,name:val('v61ScheduleName').trim()||`${start} 일정`,start_date:start,end_date:end,business_mode:val('v61ScheduleMode')||'featured',priority:Number(val('v61SchedulePriority')||0),ticker_sources:[checked('v61ScheduleDalpick')?'dalpick':'',checked('v61ScheduleCoupon')?'coupon':''].filter(Boolean),enabled:checked('v61ScheduleEnabled')}}
function v61SaveScheduleLocal(){try{const row=v61SchedulePayload();const i=v61HomeSchedules.findIndex(x=>String(x.id)===String(row.id));if(i>=0)v61HomeSchedules[i]=row;else v61HomeSchedules.push(row);v61HomeSchedules.sort((a,b)=>String(a.start_date).localeCompare(String(b.start_date)));v61RenderSchedules();v61ResetScheduleForm();}catch(e){alert(e.message)}}
function v61RenderSchedules(){const box=qs('v61ScheduleList');if(!box)return;box.innerHTML=v61HomeSchedules.length?v61HomeSchedules.map(r=>`<div class="biz-item"><div style="flex:1"><div class="biz-title">${esc(r.name||'날짜별 일정')} ${r.enabled===false?'<span class="muted">(중지)</span>':''}</div><div class="biz-meta">${esc(r.start_date||'')} ~ ${esc(r.end_date||'')} · ${esc(V61_MODE_LABELS[r.business_mode]||r.business_mode)} · 우선순위 ${esc(r.priority||0)}</div><div class="biz-meta">한 줄 광고: ${(r.ticker_sources||[]).includes('dalpick')?'광고·콘텐츠 ':''}${(r.ticker_sources||[]).includes('coupon')?'쿠폰':''}</div></div><button class="btn ghost" data-v61-edit="${esc(r.id)}" type="button">수정</button><button class="btn danger" data-v61-delete="${esc(r.id)}" type="button">삭제</button></div>`).join(''):'<div class="muted">등록된 날짜별 일정이 없습니다.</div>';box.querySelectorAll('[data-v61-edit]').forEach(b=>b.onclick=()=>v61EditSchedule(b.dataset.v61Edit));box.querySelectorAll('[data-v61-delete]').forEach(b=>b.onclick=()=>{v61HomeSchedules=v61HomeSchedules.filter(x=>String(x.id)!==String(b.dataset.v61Delete));v61RenderSchedules()})}
function v61EditSchedule(id){const r=v61HomeSchedules.find(x=>String(x.id)===String(id));if(!r)return;setVal('v61ScheduleId',r.id);setVal('v61ScheduleName',r.name||'');setVal('v61ScheduleStart',r.start_date||'');setVal('v61ScheduleEnd',r.end_date||'');setVal('v61ScheduleMode',r.business_mode||'featured');setVal('v61SchedulePriority',String(r.priority||0));setChecked('v61ScheduleDalpick',(r.ticker_sources||[]).includes('dalpick'));setChecked('v61ScheduleCoupon',(r.ticker_sources||[]).includes('coupon'));setChecked('v61ScheduleEnabled',r.enabled!==false);safeText('v61ScheduleSaveBtn','일정 수정')}

// V45 main three-zone settings
function v45Csv(value){return String(value||'').split(',').map(x=>x.trim()).filter(Boolean)}
function v45PopulateBusinessSelect(selected=[],mode){const el=qs('v45BusinessIds');if(!el)return;const ids=new Set((selected||[]).map(String));mode=mode||qs('v45BusinessMode')?.value||'featured';let rows=(businesses||[]).slice();if(mode==='featured')rows=rows.filter(b=>b.featured===true||b.is_featured===true);else if(mode==='new')rows=rows.filter(b=>b.is_new===true);else if(mode==='popular')rows=rows.filter(b=>b.is_popular===true);rows.sort((a,b)=>String(a.name_ko||a.name_en||a.name||'').localeCompare(String(b.name_ko||b.name_en||b.name||''),'ko'));el.innerHTML=rows.map(b=>`<option value="${esc(b.id)}" ${ids.has(String(b.id))?'selected':''}>${esc(b.name_ko||b.name_en||b.name||b.id)}</option>`).join('')}
function v45FillHomeConfig(config={}){
  v117LoadedHomeConfig=(config&&typeof config==='object')?{...config}:{};
  v61HomeSettingsPanel();
  v61HomeSchedules=Array.isArray(config.schedule_presets)?config.schedule_presets.map(x=>({...x})):[];v61RenderSchedules();
  setChecked('v61TickerDalpick',!Array.isArray(config.ticker_sources)||config.ticker_sources.includes('dalpick'));setChecked('v61TickerCoupon',!Array.isArray(config.ticker_sources)||config.ticker_sources.includes('coupon'));
  const cats=new Set(config.proposal_categories||[]);$$('#v45ProposalCategories input').forEach(x=>x.checked=cats.has(x.value));
  const links=qs('v45CategoryLinks');if(links)links.value=JSON.stringify(config.category_links||{},null,2);
  setChecked('v119ShowToday',config.show_today_section!==false);setChecked('v116ShowRecommend',config.show_recommend_section!==false);setChecked('v116ShowCommunity',config.show_community_section!==false);setChecked('v116ShowAlert',config.show_alert_section!==false);setChecked('v119ShowTicker',config.show_ticker_section!==false);
  const tickerDirect=(config.ticker_direct&&typeof config.ticker_direct==='object')?config.ticker_direct:{};setChecked('v119TickerDirectEnabled',tickerDirect.enabled===true);setVal('v119TickerText',tickerDirect.text||'');setVal('v119TickerLabel',tickerDirect.label||'');setVal('v119TickerUrl',tickerDirect.url||'');
  const direct=(config.direct_alert&&typeof config.direct_alert==='object')?config.direct_alert:{};setChecked('v117AlertEnabled',direct.enabled!==false);setChecked('v117UseBoardNotice',direct.use_board_notice!==false);setVal('v117AlertTitle',direct.title||'');setVal('v117AlertMessage',direct.message||'');setVal('v117AlertLabel',direct.label||'');setVal('v117AlertLinkType',direct.link_type||'none');setVal('v117AlertLinkValue',direct.link_value||'');
  const mode=qs('v45BusinessMode');if(mode){mode.value=config.business_mode||'featured';mode.onchange=()=>v45PopulateBusinessSelect([],mode.value);}v45PopulateBusinessSelect(config.business_ids||[],config.business_mode||'featured');
  const types=new Set(config.community_board_types||[]);$$('#v45CommunityTypes input').forEach(x=>x.checked=types.has(x.value));
  if(qs('v45CommunityBoostIds'))qs('v45CommunityBoostIds').value=(config.community_boost_ids||[]).join(', ');
  if(qs('v45CommunityPostIds'))qs('v45CommunityPostIds').value=(config.community_post_ids||[]).join(', ');
}
function v45ReadHomeConfig(){
  let links={};try{links=JSON.parse(qs('v45CategoryLinks')?.value||'{}')}catch(_){throw new Error('카테고리별 연결 링크는 올바른 JSON 형식으로 입력하세요.');}
  return {...v117LoadedHomeConfig,proposal_categories:$$('#v45ProposalCategories input:checked').map(x=>x.value),category_links:links,business_mode:qs('v45BusinessMode')?.value||'featured',business_ids:Array.from(qs('v45BusinessIds')?.selectedOptions||[]).map(x=>x.value),show_today_section:checked('v119ShowToday'),show_recommend_section:checked('v116ShowRecommend'),show_community_section:checked('v116ShowCommunity'),show_alert_section:checked('v116ShowAlert'),show_ticker_section:checked('v119ShowTicker'),ticker_direct:{enabled:checked('v119TickerDirectEnabled'),text:val('v119TickerText').trim(),label:val('v119TickerLabel').trim(),url:val('v119TickerUrl').trim(),updated_at:new Date().toISOString()},direct_alert:{enabled:checked('v117AlertEnabled'),use_board_notice:checked('v117UseBoardNotice'),title:val('v117AlertTitle').trim(),message:val('v117AlertMessage').trim(),label:val('v117AlertLabel').trim(),link_type:val('v117AlertLinkType')||'none',link_value:val('v117AlertLinkValue').trim(),updated_at:new Date().toISOString()},ticker_sources:[checked('v61TickerDalpick')?'dalpick':'',checked('v61TickerCoupon')?'coupon':''].filter(Boolean),schedule_presets:v61HomeSchedules,community_board_types:$$('#v45CommunityTypes input:checked').map(x=>x.value),community_post_ids:v45Csv(qs('v45CommunityPostIds')?.value),community_boost_ids:v45Csv(qs('v45CommunityBoostIds')?.value)};
}
async function v45SaveHomeConfig(){const btn=qs('v45HomeSaveBtn');if(btn)btn.disabled=true;try{const home_config=v45ReadHomeConfig();await newsroomEdgeCall('save_settings',{region:getAppRegion(),home_config},'메인 운영 설정을 저장하고 있습니다…');const verified=await newsroomEdgeCall('get_settings',{region:getAppRegion()},'저장된 메인 설정을 확인하고 있습니다…');const saved=verified?.settings?.home_config||verified?.home_config||{};v45FillHomeConfig(saved);safeText('newsroomStatus',`메인 설정 저장·확인 완료 · 선택 분야 ${(saved.proposal_categories||[]).length}개`);alert('메인 운영 설정을 저장하고 서버에서 다시 확인했습니다.');}catch(e){alert(`메인 설정 저장 실패: ${e.message}`);}finally{if(btn)btn.disabled=false;}}

document.addEventListener('click',(e)=>{if(e.target?.id==='v45HomeSaveBtn')v45SaveHomeConfig();});

qs('newsroomTraceSourcesBtn')?.addEventListener('click',traceNewsroomSources);


// V54 지도 대분류·상세 업종 연동
on('map_category','change',()=>{ refreshSubcategoryOptions(); syncLegacyCategoryField(); updatePreview(); });
on('subcategory','change',()=>{ syncLegacyCategoryField(); updatePreview(); });
console.info('[DalTownMap Admin] V55 fixed map/subcategory dropdown loaded');


// V90 — 뉴스룸 관리자: 오늘의 자동 브리핑 확인·수정
(function(){
  const state={homeConfig:null,loaded:false};
  const el=id=>document.getElementById(id);
  const todayDallas=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  function setStatus(text,bad=false){const x=el('v90BriefingStatus');if(x){x.textContent=text;x.style.color=bad?'#b91c1c':'';}}
  function fill(b={}){
    if(el('v90BriefingText')) el('v90BriefingText').value=String(b.text||'');
    if(el('v90BriefingSummary')) el('v90BriefingSummary').value=String(b.summary||'');
    if(el('v90BriefingType')) el('v90BriefingType').value=String(b.type||'생활');
    if(el('v90BriefingDate')) el('v90BriefingDate').value=String(b.date_key||todayDallas()).slice(0,10);
    if(el('v90BriefingLinkType')) el('v90BriefingLinkType').value=String(b.link_type||'board');
    if(el('v90BriefingLinkValue')) el('v90BriefingLinkValue').value=String(b.link_value||b.post_id||'');
    if(el('v90BriefingActive')) el('v90BriefingActive').checked=b.is_active!==false;
    const generated=b.generated_at?new Date(b.generated_at).toLocaleString('ko-KR'):'자동 생성 기록 없음';
    setStatus(`저장 날짜 ${b.date_key||'-'} · ${generated}`);
  }
  async function load(showMessage=false){
    if(!el('v90BriefingManager')||typeof newsroomEdgeCall!=='function') return;
    try{
      setStatus('브리핑 정보를 불러오고 있습니다…');
      const j=await newsroomEdgeCall('get_settings',{region:getAppRegion()},'오늘의 브리핑을 불러오고 있습니다…');
      state.homeConfig={...((j?.settings?.home_config&&typeof j.settings.home_config==='object')?j.settings.home_config:{})};
      fill(state.homeConfig.daily_briefing||{});state.loaded=true;
      if(showMessage) setStatus('서버의 최신 브리핑을 불러왔습니다.');
    }catch(e){console.error('[V90 briefing load]',e);setStatus(`불러오기 실패: ${e.message}`,true);}
  }
  async function save(){
    const btn=el('v90BriefingSaveBtn');if(btn)btn.disabled=true;
    try{
      const latest=await newsroomEdgeCall('get_settings',{region:getAppRegion()},'기존 메인 설정을 확인하고 있습니다…');
      const home={...((latest?.settings?.home_config&&typeof latest.settings.home_config==='object')?latest.settings.home_config:{})};
      const old=(home.daily_briefing&&typeof home.daily_briefing==='object')?home.daily_briefing:{};
      const linkType=el('v90BriefingLinkType')?.value||'board';
      const linkValue=(el('v90BriefingLinkValue')?.value||'').trim();
      home.daily_briefing={
        ...old,
        text:(el('v90BriefingText')?.value||'').trim(),
        summary:(el('v90BriefingSummary')?.value||'').trim(),
        type:el('v90BriefingType')?.value||'생활',
        date_key:el('v90BriefingDate')?.value||todayDallas(),
        link_type:linkType,
        link_value:linkType==='none'?'':linkValue,
        post_id:linkType==='board'?linkValue:null,
        is_active:!!el('v90BriefingActive')?.checked,
        edited_at:new Date().toISOString(),
      };
      await newsroomEdgeCall('save_settings',{region:getAppRegion(),home_config:home},'수정한 브리핑을 저장하고 있습니다…');
      state.homeConfig=home;fill(home.daily_briefing);setStatus('브리핑을 저장했습니다. 메인 달타운 알림에 바로 반영됩니다.');
      try{localStorage.setItem(`kfocus_daily_briefing_updated_${getAppRegion()}`,String(Date.now()));}catch(_){ }
      alert('오늘의 브리핑을 저장했습니다.');
    }catch(e){console.error('[V90 briefing save]',e);setStatus(`저장 실패: ${e.message}`,true);alert(`브리핑 저장 실패: ${e.message}`);}finally{if(btn)btn.disabled=false;}
  }
  async function generate(){
    if(!confirm('자동 뉴스 수집·선별 작업을 지금 실행할까요? 오늘 기사가 이미 있으면 새 기사를 중복 발행하지 않습니다.'))return;
    const btn=el('v90BriefingGenerateBtn');if(btn){btn.disabled=true;btn.textContent='자동 작업 실행 중…';}
    try{
      const j=await newsroomEdgeCall('daily_dallas_life',{region:getAppRegion()},'자료를 수집하고 오늘의 기사와 브리핑을 준비하고 있습니다…');
      await load();
      const reason=j?.published?.reason;
      setStatus(j?.briefing?'새 기사와 브리핑을 생성했습니다.':`자동 작업 완료${reason?` · ${reason}`:''}`);
      alert(j?.briefing?'새 브리핑이 생성되었습니다.':'자동 작업을 마쳤습니다. 오늘 기사가 이미 있거나 적합한 자료가 없어 새 브리핑을 만들지 않았습니다.');
    }catch(e){console.error('[V90 briefing generate]',e);setStatus(`자동 작업 실패: ${e.message}`,true);alert(`자동 작업 실패: ${e.message}`);}finally{if(btn){btn.disabled=false;btn.textContent='AI 자동 작업 실행';}}
  }
  document.addEventListener('DOMContentLoaded',()=>{
    el('v90BriefingRefreshBtn')?.addEventListener('click',()=>load(true));
    el('v90BriefingSaveBtn')?.addEventListener('click',save);
    el('v90BriefingGenerateBtn')?.addEventListener('click',generate);
    document.querySelector('[data-section="newsroom"]')?.addEventListener('click',()=>setTimeout(()=>load(),120));
    setTimeout(()=>load(),900);
  });
  window.V90BriefingManager={load,save,generate};
})();

// === P002-2: 오늘 자동 수집·기사 생성 확인 패널 ===
// 조회 전용 패치입니다. 관리자 페이지를 열어 둔다고 수집을 다시 실행하지 않습니다.
(() => {
  const P = 'p0022';

  function el(id){ return document.getElementById(id); }
  function escHtml(v=''){
    return String(v).replace(/[&<>"']/g, m => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    })[m]);
  }
  function localDayRange(){
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
    return { startIso:start.toISOString(), endIso:end.toISOString() };
  }
  function fmt(v){
    if(!v) return '-';
    const d = new Date(v);
    if(Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString('ko-KR', {
      month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit'
    });
  }
  function statusLabel(run, itemCount){
    if(run){
      const s = String(run.status || '').toLowerCase();
      const trigger = String(run.trigger_type || '').toLowerCase();
      if(s === 'running') return {cls:'running', text:'수집 작업 실행 중'};
      if(s === 'failed') return {cls:'failed', text:'오늘 수집 실행 실패'};
      if(s === 'success'){
        const inserted = Number(run.inserted || 0);
        const auto = trigger === 'scheduled' || trigger === 'cron';
        if(inserted > 0) return {cls:'ok', text:`${auto?'자동 ':''}수집 완료 · 새 자료 ${inserted}건`};
        return {cls:'ok', text:`${auto?'자동 ':''}수집 완료 · 새 자료 없음`};
      }
    }
    if(itemCount > 0) return {cls:'ok', text:`오늘 수집 데이터 ${itemCount}건 확인됨`};
    return {cls:'waiting', text:'오늘 수집 실행 기록을 아직 확인하지 못했습니다'};
  }
  function ensureStyle(){
    if(el(P+'Style')) return;
    const style = document.createElement('style');
    style.id = P+'Style';
    style.textContent = `
      #${P}Panel{margin:0 0 18px;padding:18px;border:1px solid #cddcf6;border-radius:18px;background:#fff;box-shadow:0 8px 24px rgba(32,79,160,.06)}
      #${P}Panel .p0022-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;flex-wrap:wrap}
      #${P}Panel h2{margin:0;font-size:21px}
      #${P}Panel .p0022-sub{margin-top:5px;color:#64748b;font-size:13px}
      #${P}Panel .p0022-state{margin-top:14px;padding:13px 15px;border-radius:14px;font-weight:800}
      #${P}Panel .p0022-state.ok{background:#ecfdf3;color:#087443}
      #${P}Panel .p0022-state.running{background:#eff6ff;color:#1d4ed8}
      #${P}Panel .p0022-state.failed{background:#fff1f2;color:#be123c}
      #${P}Panel .p0022-state.waiting{background:#fff7ed;color:#9a3412}
      #${P}Panel .p0022-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin-top:12px}
      #${P}Panel .p0022-card{border:1px solid #dbe5f5;border-radius:14px;padding:13px;background:#fbfdff}
      #${P}Panel .p0022-card span{display:block;color:#64748b;font-size:12px}
      #${P}Panel .p0022-card strong{display:block;margin-top:5px;font-size:22px}
      #${P}Panel .p0022-detail{display:grid;grid-template-columns:1.1fr .9fr;gap:12px;margin-top:12px}
      #${P}Panel .p0022-box{border:1px solid #e2e8f0;border-radius:14px;padding:14px}
      #${P}Panel .p0022-box h3{margin:0 0 10px;font-size:15px}
      #${P}Panel .p0022-row{display:flex;justify-content:space-between;gap:14px;padding:8px 0;border-top:1px solid #eef2f7;font-size:13px}
      #${P}Panel .p0022-row:first-of-type{border-top:0}
      #${P}Panel .p0022-muted{color:#64748b}
      #${P}Panel .p0022-note{margin-top:11px;padding:11px 13px;border-radius:12px;background:#f8fafc;color:#475569;font-size:13px;line-height:1.55}
      #${P}Panel button{white-space:nowrap}
      @media(max-width:900px){#${P}Panel .p0022-grid{grid-template-columns:repeat(2,minmax(0,1fr))}#${P}Panel .p0022-detail{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }
  function ensurePanel(){
    if(el(P+'Panel')) return el(P+'Panel');
    const section = el('section-newsroom');
    if(!section) return null;
    ensureStyle();
    const panel = document.createElement('section');
    panel.id = P+'Panel';
    panel.innerHTML = `
      <div class="p0022-head">
        <div>
          <h2>오늘 자동 수집·기사 생성 확인</h2>
          <div class="p0022-sub">조회 전용입니다. 새로고침해도 수집이나 기사 생성을 다시 실행하지 않습니다.</div>
        </div>
        <button type="button" class="btn primary" id="${P}Refresh">현황 새로고침</button>
      </div>
      <div id="${P}State" class="p0022-state waiting">확인 중...</div>
      <div class="p0022-grid">
        <div class="p0022-card"><span>오늘 수집</span><strong id="${P}Collected">-</strong></div>
        <div class="p0022-card"><span>AI 기사 생성</span><strong id="${P}Generated">-</strong></div>
        <div class="p0022-card"><span>게시 완료</span><strong id="${P}Published">-</strong></div>
        <div class="p0022-card"><span>보류·검토</span><strong id="${P}Review">-</strong></div>
        <div class="p0022-card"><span>오류</span><strong id="${P}Errors">-</strong></div>
      </div>
      <div class="p0022-detail">
        <div class="p0022-box">
          <h3>오늘 실행 결과</h3>
          <div class="p0022-row"><span>실행 방식</span><b id="${P}Trigger">-</b></div>
          <div class="p0022-row"><span>시작 시간</span><b id="${P}Started">-</b></div>
          <div class="p0022-row"><span>종료 시간</span><b id="${P}Finished">-</b></div>
          <div class="p0022-row"><span>검색 / 신규 / 중복·제외</span><b id="${P}RunCounts">-</b></div>
          <div class="p0022-note" id="${P}Memo">확인 중...</div>
        </div>
        <div class="p0022-box">
          <h3>최근 실행 기록</h3>
          <div id="${P}Runs" class="p0022-muted">불러오는 중...</div>
        </div>
      </div>`;
    const first = section.firstElementChild;
    if(first) first.insertAdjacentElement('afterend', panel);
    else section.prepend(panel);
    el(P+'Refresh')?.addEventListener('click', load);
    return panel;
  }

  async function queryTodayItems(startIso,endIso){
    let res = await supabase.from('newsroom_items')
      .select('*')
      .eq('region', getAppRegion())
      .gte('collected_at', startIso)
      .lt('collected_at', endIso)
      .order('collected_at', {ascending:false})
      .limit(500);
    if(res.error){
      res = await supabase.from('newsroom_items')
        .select('*')
        .eq('region', getAppRegion())
        .gte('created_at', startIso)
        .lt('created_at', endIso)
        .order('created_at', {ascending:false})
        .limit(500);
    }
    return res.error ? [] : (res.data || []);
  }
  async function queryRuns(startIso,endIso){
    const today = await supabase.from('newsroom_runs')
      .select('*')
      .eq('region', getAppRegion())
      .gte('started_at', startIso)
      .lt('started_at', endIso)
      .order('started_at', {ascending:false})
      .limit(20);
    if(today.error) return {today:[], recent:[], error:today.error};
    const recent = await supabase.from('newsroom_runs')
      .select('*')
      .eq('region', getAppRegion())
      .order('started_at', {ascending:false})
      .limit(5);
    return {today:today.data||[], recent:recent.error?today.data||[]:recent.data||[], error:null};
  }
  async function queryTodayPublications(startIso,endIso){
    let res = await supabase.from('newsroom_publications')
      .select('*')
      .eq('region', getAppRegion())
      .gte('created_at', startIso)
      .lt('created_at', endIso)
      .limit(500);
    if(res.error) return [];
    return res.data || [];
  }

  async function load(){
    const panel = ensurePanel();
    if(!panel || !supabase) return;
    const btn = el(P+'Refresh');
    if(btn){btn.disabled=true;btn.textContent='확인 중...';}
    el(P+'State').className='p0022-state running';
    el(P+'State').textContent='오늘 수집 및 기사 생성 기록을 확인하고 있습니다...';
    try{
      const {startIso,endIso}=localDayRange();
      const [items, runResult, publications] = await Promise.all([
        queryTodayItems(startIso,endIso),
        queryRuns(startIso,endIso),
        queryTodayPublications(startIso,endIso)
      ]);

      const todayRuns = runResult.today || [];
      const latest = todayRuns[0] || null;
      const generated = items.filter(r =>
        r.ai_title || r.ai_summary || r.ai_content ||
        ['classified','review','drafted','published'].includes(String(r.status||'').toLowerCase())
      ).length;
      const review = items.filter(r =>
        ['review','classified','collected','hold','pending'].includes(String(r.status||'').toLowerCase())
      ).length;
      const errors = items.filter(r =>
        ['error','failed'].includes(String(r.status||'').toLowerCase()) ||
        r.error_message
      ).length + todayRuns.filter(r=>String(r.status||'').toLowerCase()==='failed').length;
      const published = publications.length || items.filter(r =>
        String(r.status||'').toLowerCase()==='published' || r.published_at
      ).length;

      const s = statusLabel(latest, items.length);
      el(P+'State').className=`p0022-state ${s.cls}`;
      el(P+'State').textContent=s.text;
      el(P+'Collected').textContent=String(items.length);
      el(P+'Generated').textContent=String(generated);
      el(P+'Published').textContent=String(published);
      el(P+'Review').textContent=String(review);
      el(P+'Errors').textContent=String(errors);

      const trigger = String(latest?.trigger_type||'').toLowerCase();
      el(P+'Trigger').textContent = latest ? (
        trigger==='scheduled'||trigger==='cron' ? '오전 자동 실행' :
        trigger==='manual' ? '관리자 수동 실행' :
        latest.trigger_type || '실행 기록'
      ) : '오늘 기록 없음';
      el(P+'Started').textContent=fmt(latest?.started_at);
      el(P+'Finished').textContent=fmt(latest?.finished_at||latest?.ended_at);
      el(P+'RunCounts').textContent=latest
        ? `${Number(latest.found||0)} / ${Number(latest.inserted||0)} / ${Number(latest.skipped||0)}`
        : '-';

      let memo='';
      if(latest){
        const st=String(latest.status||'').toLowerCase();
        if(st==='failed') memo=`수집 실행이 실패했습니다.${latest.error_message?` 오류: ${latest.error_message}`:''}`;
        else if(st==='running') memo='현재 수집 작업이 실행 중입니다. 잠시 후 현황 새로고침을 누르세요.';
        else if(Number(latest.inserted||0)===0) memo='오늘 수집 작업은 정상 실행됐지만 새로 추가할 자료가 없었거나 중복·제외 처리되었습니다.';
        else if(generated===0) memo='오늘 자료 수집은 확인됐지만 아직 AI 기사 생성 기록은 없습니다. 아래 AI 운영센터에서 자동 작업 결과를 확인하세요.';
        else if(published===0) memo=`오늘 자료 ${items.length}건, AI 생성 ${generated}건이 확인됐지만 아직 게시 완료 기록은 없습니다.`;
        else memo=`오늘 수집과 기사 생성이 확인됐습니다. 게시 완료 ${published}건입니다.`;
      }else if(items.length){
        memo=`newsroom_runs 실행 로그는 없지만 오늘 수집 데이터 ${items.length}건이 확인됐습니다.`;
      }else{
        memo='오늘 수집 로그와 오늘 수집 자료가 모두 없습니다. 오전 자동 실행 전이거나, Cron/Edge Function 실행 기록 저장을 확인해야 합니다.';
      }
      el(P+'Memo').textContent=memo;

      const recent = runResult.recent || [];
      el(P+'Runs').innerHTML = recent.length ? recent.map(r=>{
        const st=String(r.status||'').toLowerCase();
        const label=st==='success'?'완료':st==='failed'?'실패':st==='running'?'실행 중':st||'기록';
        const trig=['scheduled','cron'].includes(String(r.trigger_type||'').toLowerCase())?'자동':'수동';
        return `<div class="p0022-row"><span>${escHtml(fmt(r.started_at))} · ${trig}</span><b>${label} · 신규 ${Number(r.inserted||0)}건</b></div>`;
      }).join('') : '<div class="p0022-muted">최근 실행 기록이 없습니다.</div>';

      const checkedAt = new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});
      const sub = panel.querySelector('.p0022-sub');
      if(sub) sub.textContent=`마지막 확인 ${checkedAt} · 조회 전용이며 자동 재수집하지 않습니다.`;
    }catch(e){
      console.error('[P002-2 today newsroom status]',e);
      el(P+'State').className='p0022-state failed';
      el(P+'State').textContent='오늘 수집 현황 확인에 실패했습니다';
      el(P+'Memo').textContent=e?.message||String(e);
    }finally{
      if(btn){btn.disabled=false;btn.textContent='현황 새로고침';}
    }
  }

  document.addEventListener('DOMContentLoaded',()=>{
    document.querySelector('[data-section="newsroom"]')?.addEventListener('click',()=>setTimeout(load,150));
    setTimeout(()=>{ if(el('section-newsroom')){ ensurePanel(); load(); } },1200);
  });
  window.P002TodayNewsroomStatus = {load};
})();

// === P002-4: AI 운영센터 단순 운영 모드 ===
// 기존 세부 기능은 유지하면서, 상단에서 수집 → AI 생성 → 게시 순서로 실행합니다.
(() => {
  const PREFIX='p0024';

  const byId=(id)=>document.getElementById(id);
  const wait=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));

  function ensureStyles(){
    if(byId(PREFIX+'Style')) return;
    const style=document.createElement('style');
    style.id=PREFIX+'Style';
    style.textContent=`
      #${PREFIX}Actions{margin-top:14px;border:1px solid #cbdcf8;border-radius:16px;padding:15px;background:#f8fbff}
      #${PREFIX}Actions .p0024-title{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
      #${PREFIX}Actions .p0024-title h3{margin:0;font-size:16px}
      #${PREFIX}Actions .p0024-title p{margin:4px 0 0;color:#64748b;font-size:12px}
      #${PREFIX}Actions .p0024-flow{display:grid;grid-template-columns:1fr auto 1fr auto 1fr;gap:10px;align-items:stretch;margin-top:13px}
      #${PREFIX}Actions .p0024-step{border:1px solid #dbe6f7;border-radius:14px;padding:13px;background:#fff;display:flex;flex-direction:column;gap:8px}
      #${PREFIX}Actions .p0024-step small{color:#64748b}
      #${PREFIX}Actions .p0024-step strong{font-size:15px}
      #${PREFIX}Actions .p0024-step button{width:100%;min-height:42px}
      #${PREFIX}Actions .p0024-arrow{display:flex;align-items:center;color:#7c93b8;font-size:22px;font-weight:800}
      #${PREFIX}Actions .p0024-help{margin-top:10px;padding:10px 12px;border-radius:11px;background:#eef5ff;color:#334155;font-size:12px;line-height:1.5}
      #${PREFIX}Actions .p0024-busy{opacity:.65;pointer-events:none}
      #${PREFIX}Actions .p0024-advanced{margin-top:10px}
      #${PREFIX}Actions .p0024-advanced button{border:0;background:transparent;color:#2563eb;font-weight:700;cursor:pointer;padding:4px 0}
      #${PREFIX}Actions .p0024-status{font-size:12px;font-weight:700;color:#475569;min-height:18px}
      @media(max-width:900px){
        #${PREFIX}Actions .p0024-flow{grid-template-columns:1fr}
        #${PREFIX}Actions .p0024-arrow{display:none}
      }
    `;
    document.head.appendChild(style);
  }

  function setBusy(active, message=''){
    const box=byId(PREFIX+'Actions');
    if(box) box.classList.toggle('p0024-busy',active);
    ['Collect','Generate','Publish'].forEach(k=>{
      const b=byId(PREFIX+k);
      if(b) b.disabled=active;
    });
    const status=byId(PREFIX+'Status');
    if(status) status.textContent=message;
  }

  async function refreshAll(message='현황을 다시 확인했습니다.'){
    try{
      if(window.P002TodayNewsroomStatus?.load) await window.P002TodayNewsroomStatus.load();
      if(typeof loadNewsroom==='function') await loadNewsroom();
      const status=byId(PREFIX+'Status');
      if(status) status.textContent=message;
    }catch(e){
      console.warn('[P002-4 refresh]',e);
    }
  }

  async function collectNow(){
    if(!confirm('지금 뉴스 자료 수집을 실행할까요?\n이미 수집된 자료는 중복 제외됩니다.')) return;
    setBusy(true,'1단계: 자료를 수집하고 있습니다...');
    try{
      if(typeof collectNewsroom==='function'){
        await collectNewsroom();
      }else{
        await newsroomEdgeCall('auto_run',{region:getAppRegion()},'오늘 자료를 수집하고 있습니다...');
      }
      await wait(500);
      await refreshAll('자료 수집이 끝났습니다. 다음으로 AI 기사 생성을 실행하세요.');
    }catch(e){
      alert(`수집 실행 실패: ${e.message}`);
      const status=byId(PREFIX+'Status'); if(status) status.textContent=`수집 실패: ${e.message}`;
    }finally{ setBusy(false,byId(PREFIX+'Status')?.textContent||''); }
  }

  async function generateNow(){
    const pending=Number(byId('newsroomStatCollected')?.textContent||0);
    const msg=pending>0
      ? `분류 대기 자료 ${pending}건이 있습니다. AI 분류와 기사 준비를 실행할까요?`
      : '현재 표시된 수집 자료를 대상으로 AI 분류와 기사 준비를 실행할까요?';
    if(!confirm(msg)) return;
    setBusy(true,'2단계: AI가 자료를 분류하고 기사 초안을 준비하고 있습니다...');
    try{
      if(typeof analyzeCollectedNewsroom==='function') await analyzeCollectedNewsroom();
      else await newsroomEdgeCall('analyze',{region:getAppRegion(),limit:3},'AI 분류를 실행하고 있습니다...');
      await wait(500);
      await refreshAll('AI 기사 생성 작업이 끝났습니다. 검토 후 오늘 기사 게시를 실행하세요.');
    }catch(e){
      alert(`AI 기사 생성 실패: ${e.message}`);
      const status=byId(PREFIX+'Status'); if(status) status.textContent=`AI 생성 실패: ${e.message}`;
    }finally{ setBusy(false,byId(PREFIX+'Status')?.textContent||''); }
  }

  async function publishNow(){
    if(!confirm('오늘의 기사 1건을 게시할까요?\n오늘 이미 게시한 기사가 있으면 중복 게시하지 않습니다.')) return;
    setBusy(true,'3단계: 오늘의 기사 1건을 게시하고 브리핑을 저장하고 있습니다...');
    try{
      const result=await newsroomEdgeCall('daily_dallas_life',{region:getAppRegion()},'오늘의 기사와 브리핑을 게시하고 있습니다...');
      const p=result?.published;
      let message='';
      if(p?.skipped){
        message=p.reason==='already_published_today'
          ? '오늘 게시된 기사가 이미 있어 중복 게시하지 않았습니다.'
          : `게시하지 않았습니다: ${p.reason||'게시 가능한 후보 없음'}`;
      }else if(p?.post?.id){
        message=`오늘 기사 게시 완료: ${p.post.title||'기사 1건'}`;
      }else{
        message='게시 작업은 완료됐지만 새 게시글은 생성되지 않았습니다.';
      }
      await wait(500);
      await refreshAll(message);
      alert(message);
    }catch(e){
      alert(`오늘 기사 게시 실패: ${e.message}`);
      const status=byId(PREFIX+'Status'); if(status) status.textContent=`게시 실패: ${e.message}`;
    }finally{ setBusy(false,byId(PREFIX+'Status')?.textContent||''); }
  }

  function toggleAdvanced(){
    const ids=[
      'newsroomPrepareTodayBtn','newsroomCollectBtn','newsroomAnalyzeAllBtn',
      'newsroomHealthBtn','newsroomRefreshBtn','v48AutoRunBtn','v90BriefingGenerateBtn'
    ];
    const currentlyHidden=ids.every(id=>!byId(id)||byId(id).dataset.p0024Hidden==='1');
    ids.forEach(id=>{
      const el=byId(id);
      if(!el) return;
      if(currentlyHidden){
        el.style.display='';
        delete el.dataset.p0024Hidden;
      }else{
        el.style.display='none';
        el.dataset.p0024Hidden='1';
      }
    });
    const b=byId(PREFIX+'AdvancedToggle');
    if(b) b.textContent=currentlyHidden?'고급 기능 숨기기':'고급 기능 보기';
  }

  function hideDuplicateButtonsInitially(){
    [
      'newsroomPrepareTodayBtn','newsroomCollectBtn','newsroomAnalyzeAllBtn',
      'newsroomHealthBtn','newsroomRefreshBtn','v48AutoRunBtn','v90BriefingGenerateBtn'
    ].forEach(id=>{
      const el=byId(id);
      if(!el) return;
      el.style.display='none';
      el.dataset.p0024Hidden='1';
    });
  }

  function ensureUI(){
    const panel=byId('p0022Panel');
    if(!panel || byId(PREFIX+'Actions')) return;
    ensureStyles();
    const box=document.createElement('div');
    box.id=PREFIX+'Actions';
    box.innerHTML=`
      <div class="p0024-title">
        <div>
          <h3>AI 뉴스룸 간편 운영</h3>
          <p>아래 순서대로 필요한 단계만 한 번씩 실행하세요. 화면을 열어두는 것만으로는 재실행되지 않습니다.</p>
        </div>
        <div id="${PREFIX}Status" class="p0024-status">먼저 오늘 수집 기록을 확인하세요.</div>
      </div>
      <div class="p0024-flow">
        <div class="p0024-step">
          <small>1단계</small>
          <strong>뉴스 자료 수집</strong>
          <span class="p0024-status">새 자료를 찾고 중복 자료를 제외합니다.</span>
          <button type="button" class="btn primary" id="${PREFIX}Collect">지금 수집 실행</button>
        </div>
        <div class="p0024-arrow">→</div>
        <div class="p0024-step">
          <small>2단계</small>
          <strong>AI 기사 생성</strong>
          <span class="p0024-status">수집 자료를 분류하고 기사 후보를 준비합니다.</span>
          <button type="button" class="btn primary" id="${PREFIX}Generate">AI 기사 생성</button>
        </div>
        <div class="p0024-arrow">→</div>
        <div class="p0024-step">
          <small>3단계</small>
          <strong>오늘 기사 게시</strong>
          <span class="p0024-status">후보 중 1건을 게시하고 브리핑에 연결합니다.</span>
          <button type="button" class="btn primary" id="${PREFIX}Publish">오늘 기사 게시</button>
        </div>
      </div>
      <div class="p0024-help">
        <b>중복 실행 방지:</b> 수집은 기존 URL·제목을 중복 제외하고, 게시 단계는 오늘 이미 게시한 기사가 있으면 새 글을 만들지 않습니다.
        <div class="p0024-advanced"><button type="button" id="${PREFIX}AdvancedToggle">고급 기능 보기</button></div>
      </div>`;
    const state=byId('p0022State');
    if(state) state.insertAdjacentElement('afterend',box);
    else panel.appendChild(box);

    byId(PREFIX+'Collect')?.addEventListener('click',collectNow);
    byId(PREFIX+'Generate')?.addEventListener('click',generateNow);
    byId(PREFIX+'Publish')?.addEventListener('click',publishNow);
    byId(PREFIX+'AdvancedToggle')?.addEventListener('click',toggleAdvanced);
    hideDuplicateButtonsInitially();
  }

  document.addEventListener('DOMContentLoaded',()=>{
    document.querySelector('[data-section="newsroom"]')?.addEventListener('click',()=>setTimeout(ensureUI,250));
    setTimeout(ensureUI,1600);
  });
})();

// === P002-5: 오늘 AI 기사 후보 목록 및 개별 관리 ===
(() => {
  const P='p0025';
  const $id=(id)=>document.getElementById(id);
  const esc=(v='')=>String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const fmt=(v)=>{
    if(!v) return '-';
    const d=new Date(v);
    return Number.isNaN(d.getTime())?'-':d.toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
  };
  const todayKey=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const rowDay=(row)=> {
    const v=row.draft_updated_at||row.updated_at||row.collected_at||row.created_at;
    if(!v) return '';
    return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v));
  };
  const isGenerated=(r)=>Boolean(
    String(r.ai_title||'').trim() ||
    String(r.ai_summary||'').trim() ||
    String(r.ai_content||'').trim() ||
    ['classified','review','drafted','published'].includes(String(r.status||'').toLowerCase())
  );

  function ensureStyle(){
    if($id(P+'Style')) return;
    const s=document.createElement('style');
    s.id=P+'Style';
    s.textContent=`
      #${P}Panel{margin-top:16px;border:1px solid #cbdcf8;border-radius:16px;padding:16px;background:#fff}
      #${P}Panel .p0025-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}
      #${P}Panel h3{margin:0;font-size:18px}
      #${P}Panel .p0025-sub{margin-top:4px;color:#64748b;font-size:12px}
      #${P}List{display:grid;gap:11px;margin-top:13px}
      #${P}Panel .p0025-card{border:1px solid #dbe6f7;border-radius:14px;padding:14px;background:#fbfdff}
      #${P}Panel .p0025-top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
      #${P}Panel .p0025-title{font-size:16px;font-weight:800;line-height:1.4}
      #${P}Panel .p0025-meta{margin-top:5px;color:#64748b;font-size:12px}
      #${P}Panel .p0025-summary{margin-top:9px;line-height:1.55;color:#334155;font-size:13px}
      #${P}Panel .p0025-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}
      #${P}Panel .p0025-actions button{padding:8px 11px;border-radius:10px;border:1px solid #cbdcf8;background:#fff;color:#174ea6;font-weight:700;cursor:pointer}
      #${P}Panel .p0025-actions button.primary{background:#2864e8;color:#fff;border-color:#2864e8}
      #${P}Panel .p0025-actions button.danger{color:#b42318;border-color:#fecaca;background:#fff5f5}
      #${P}Panel .p0025-preview{display:none;margin-top:12px;padding:13px;border-radius:12px;background:#f1f5f9;white-space:pre-wrap;line-height:1.6;font-size:13px;max-height:340px;overflow:auto}
      #${P}Panel .p0025-preview.open{display:block}
      #${P}Panel .p0025-empty{padding:24px;text-align:center;color:#64748b;border:1px dashed #cbd5e1;border-radius:13px}
      #${P}Panel .p0025-badge{display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;background:#e8f0ff;color:#1d4ed8;font-size:11px;font-weight:800}
      @media(max-width:700px){#${P}Panel .p0025-top{display:block}#${P}Panel .p0025-badge{margin-top:8px}}
    `;
    document.head.appendChild(s);
  }

  function ensurePanel(){
    if($id(P+'Panel')) return $id(P+'Panel');
    const anchor=$id('p0024Actions') || $id('p0022Panel');
    if(!anchor) return null;
    ensureStyle();
    const panel=document.createElement('section');
    panel.id=P+'Panel';
    panel.innerHTML=`
      <div class="p0025-head">
        <div>
          <h3>오늘 AI 기사 후보</h3>
          <div class="p0025-sub">오늘 생성된 기사 제목과 내용을 확인하고 개별 관리할 수 있습니다.</div>
        </div>
        <button type="button" class="btn primary" id="${P}Refresh">후보 새로고침</button>
      </div>
      <div id="${P}List"><div class="p0025-empty">기사 후보를 불러오는 중입니다.</div></div>`;
    anchor.insertAdjacentElement('afterend',panel);
    $id(P+'Refresh')?.addEventListener('click',load);
    return panel;
  }

  async function load(){
    const panel=ensurePanel();
    if(!panel||!supabase) return;
    const list=$id(P+'List');
    list.innerHTML='<div class="p0025-empty">오늘 생성된 기사를 확인하고 있습니다.</div>';
    try{
      const {data,error}=await supabase.from('newsroom_items')
        .select('id,original_title,original_summary,ai_title,ai_summary,ai_content,status,source_name,suggested_destination,destination,event_data,collected_at,updated_at,draft_updated_at')
        .eq('region',getAppRegion())
        .order('updated_at',{ascending:false})
        .limit(300);
      if(error) throw error;
      const rows=(data||[]).filter(r=>rowDay(r)===todayKey()&&isGenerated(r));
      if(!rows.length){
        list.innerHTML='<div class="p0025-empty">오늘 생성된 AI 기사 후보가 없습니다. 먼저 “AI 기사 생성”을 실행하세요.</div>';
        return;
      }
      list.innerHTML=rows.map((r,i)=>{
        const meta=r.event_data&&typeof r.event_data==='object'?r.event_data:{};
        const title=String(r.ai_title||r.original_title||'제목 없음').trim();
        const summary=String(r.ai_summary||r.original_summary||'').trim();
        const content=String(r.ai_content||'').trim();
        const picked=String(meta.selection_source||'')==='editor';
        const published=String(r.status||'').toLowerCase()==='published'||Boolean(meta.published_post_id);
        return `
          <article class="p0025-card" data-id="${esc(r.id)}">
            <div class="p0025-top">
              <div>
                <div class="p0025-title">${i+1}. ${esc(title)}</div>
                <div class="p0025-meta">${esc(r.source_name||'출처 미상')} · ${esc(r.destination||r.suggested_destination||'미분류')} · ${esc(fmt(r.draft_updated_at||r.updated_at))}</div>
              </div>
              <span class="p0025-badge">${published?'게시 완료':picked?'달타운 지정':'기사 후보'}</span>
            </div>
            <div class="p0025-summary">${esc(summary||'요약이 없습니다.')}</div>
            <div class="p0025-actions">
              <button type="button" data-act="preview">미리보기</button>
              <button type="button" data-act="redraft">다시 생성</button>
              <button type="button" data-act="pick">${picked?'달타운 해제':'달타운 지정'}</button>
              <button type="button" class="primary" data-act="publish" ${published?'disabled':''}>${published?'게시됨':'이 기사 게시'}</button>
              <button type="button" class="danger" data-act="delete">삭제</button>
            </div>
            <div class="p0025-preview">${esc(content||summary||'작성된 본문이 없습니다. “다시 생성”을 눌러 본문을 작성하세요.')}</div>
          </article>`;
      }).join('');

      list.querySelectorAll('.p0025-card').forEach(card=>{
        card.addEventListener('click',async(e)=>{
          const button=e.target.closest('button[data-act]');
          if(!button) return;
          const id=card.dataset.id;
          const act=button.dataset.act;
          const row=rows.find(x=>String(x.id)===String(id));
          if(!row) return;
          if(act==='preview'){
            const p=card.querySelector('.p0025-preview');
            p.classList.toggle('open');
            button.textContent=p.classList.contains('open')?'미리보기 닫기':'미리보기';
            return;
          }
          button.disabled=true;
          try{
            if(act==='redraft'){
              await newsroomEdgeCall('draft',{id,region:getAppRegion()},'선택 기사를 다시 작성하고 있습니다...');
              alert('선택 기사를 다시 생성했습니다.');
            }else if(act==='pick'){
              const meta=row.event_data&&typeof row.event_data==='object'?row.event_data:{};
              const enabled=String(meta.selection_source||'')!=='editor';
              await newsroomEdgeCall('set_editor_pick',{id,enabled,region:getAppRegion()});
              alert(enabled?'오늘의 달타운 후보로 지정했습니다.':'오늘의 달타운 지정을 해제했습니다.');
            }else if(act==='publish'){
              if(!confirm(`“${row.ai_title||row.original_title}” 기사를 게시할까요?\n오늘 이미 게시한 자동 기사가 있으면 중복 게시하지 않습니다.`)) return;
              const result=await newsroomEdgeCall('publish_item',{id,region:getAppRegion()},'선택 기사를 게시하고 있습니다...');
              const p=result?.published||result;
              const message=p?.skipped
                ? `게시하지 않았습니다: ${p.reason||'오늘 게시글이 이미 있음'}`
                : `게시 완료: ${p?.post?.title||row.ai_title||row.original_title}`;
              alert(message);
            }else if(act==='delete'){
              if(!confirm('이 기사 후보를 삭제할까요?')) return;
              await newsroomEdgeCall('delete_newsroom_item',{id,region:getAppRegion()});
            }
            await load();
            if(window.P002TodayNewsroomStatus?.load) await window.P002TodayNewsroomStatus.load();
            if(typeof loadNewsroom==='function') await loadNewsroom();
          }catch(err){
            alert(`처리 실패: ${err.message}`);
          }finally{
            button.disabled=false;
          }
        });
      });
    }catch(e){
      console.error('[P002-5 candidates]',e);
      list.innerHTML=`<div class="p0025-empty">기사 후보 확인 실패: ${esc(e.message)}</div>`;
    }
  }

  document.addEventListener('DOMContentLoaded',()=>{
    document.querySelector('[data-section="newsroom"]')?.addEventListener('click',()=>setTimeout(()=>{ensurePanel();load();},350));
    setTimeout(()=>{ensurePanel();load();},1900);
  });
  window.P002TodayCandidates={load};
})();

// === P006: 자동화 진행 현황 · 타임라인 · 7일 통계 ===
(() => {
  const P='p006';
  const el=id=>document.getElementById(id);
  const esc=(v='')=>String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const fmt=v=>{
    if(!v)return '-';
    const d=new Date(v);
    return Number.isNaN(d.getTime())?'-':d.toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
  };
  const stageName=s=>({collect:'자료 수집',analyze:'AI 기사 생성',publish:'오늘 기사 게시',item:'기사 처리'}[s]||'기타');
  const statusName=s=>({success:'완료',failed:'실패',running:'실행 중',not_started:'미실행'}[s]||s||'-');

  function ensureStyle(){
    if(el(P+'Style'))return;
    const s=document.createElement('style');
    s.id=P+'Style';
    s.textContent=`
      #${P}Panel{margin-top:14px;display:grid;gap:12px}
      #${P}Panel .p006-pipeline{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
      #${P}Panel .p006-step{border:1px solid #dbe6f7;border-radius:14px;padding:13px;background:#fff}
      #${P}Panel .p006-step.ok{border-color:#86efac;background:#f0fdf4}
      #${P}Panel .p006-step.running{border-color:#93c5fd;background:#eff6ff}
      #${P}Panel .p006-step.failed{border-color:#fda4af;background:#fff1f2}
      #${P}Panel .p006-step.waiting{border-color:#fed7aa;background:#fff7ed}
      #${P}Panel .p006-step small{color:#64748b}
      #${P}Panel .p006-step strong{display:block;margin-top:5px;font-size:15px}
      #${P}Panel .p006-step span{display:block;margin-top:6px;color:#475569;font-size:12px;line-height:1.45}
      #${P}Panel .p006-cols{display:grid;grid-template-columns:1.2fr .8fr;gap:12px}
      #${P}Panel .p006-box{border:1px solid #dbe6f7;border-radius:14px;padding:14px;background:#fff}
      #${P}Panel .p006-box h3{margin:0 0 10px;font-size:15px}
      #${P}Panel .p006-line{display:grid;grid-template-columns:120px 90px 1fr;gap:9px;padding:8px 0;border-top:1px solid #edf2f7;font-size:12px;align-items:start}
      #${P}Panel .p006-line:first-of-type{border-top:0}
      #${P}Panel .p006-line b{color:#163b70}
      #${P}Panel .p006-error{padding:9px 10px;margin-top:7px;border-radius:10px;background:#fff1f2;color:#9f1239;font-size:12px}
      #${P}Panel .p006-history{display:grid;grid-template-columns:repeat(7,1fr);gap:7px}
      #${P}Panel .p006-day{border:1px solid #e2e8f0;border-radius:11px;padding:9px;text-align:center;background:#fbfdff}
      #${P}Panel .p006-day b{display:block;font-size:12px}
      #${P}Panel .p006-day span{display:block;margin-top:5px;font-size:11px;color:#64748b}
      @media(max-width:900px){#${P}Panel .p006-pipeline,#${P}Panel .p006-cols{grid-template-columns:1fr}#${P}Panel .p006-history{grid-template-columns:repeat(2,1fr)}}
    `;
    document.head.appendChild(s);
  }

  function ensureUI(){
    const parent=el('p0022Panel');
    if(!parent)return null;
    ensureStyle();
    let box=el(P+'Panel');
    if(box)return box;
    box=document.createElement('div');
    box.id=P+'Panel';
    box.innerHTML=`
      <div class="p006-pipeline" id="${P}Pipeline"></div>
      <div class="p006-cols">
        <div class="p006-box"><h3>오늘 자동화 실행 타임라인</h3><div id="${P}Timeline">확인 중...</div></div>
        <div class="p006-box"><h3>오류·주의 사항</h3><div id="${P}Errors">확인 중...</div></div>
      </div>
      <div class="p006-box"><h3>최근 7일 실행 현황</h3><div class="p006-history" id="${P}History"></div></div>`;
    parent.appendChild(box);
    return box;
  }

  function stageCard(stage,key){
    const cls=stage.status==='success'?'ok':stage.status==='running'?'running':stage.status==='failed'?'failed':'waiting';
    const extra=key==='collect'
      ? `검색 ${stage.found||0} · 신규 ${stage.inserted||0} · 제외 ${stage.skipped||0}`
      : key==='analyze'
      ? `처리 ${stage.inserted||0} · 제외 ${stage.skipped||0}`
      : `게시 ${stage.inserted||0}건`;
    return `<div class="p006-step ${cls}">
      <small>${key==='collect'?'1단계':key==='analyze'?'2단계':'3단계'}</small>
      <strong>${stageName(key)} · ${statusName(stage.status)}</strong>
      <span>${extra}<br>${stage.latest?.started_at?`최근 ${esc(fmt(stage.latest.started_at))}`:'실행 기록 없음'}</span>
    </div>`;
  }

  async function load(){
    const panel=ensureUI();
    if(!panel)return;
    const refresh=el('p0022Refresh');
    if(refresh){refresh.disabled=true;refresh.textContent='확인 중...';}
    try{
      const data=await newsroomEdgeCall('automation_status',{region:getAppRegion()});
      const c=data.counts||{};
      const stages=data.stages||{};
      const overallText={
        not_started:'오늘 자동 작업이 아직 시작되지 않았습니다.',
        running:'오늘 자동 작업이 현재 실행 중입니다.',
        failed:'오늘 자동 작업 중 오류가 발생했습니다.',
        partial:'오늘 자동 작업이 일부 단계까지 진행되었습니다.',
        complete:'오늘 수집·기사 생성·게시 작업이 완료되었습니다.'
      }[data.overall]||'자동화 상태를 확인했습니다.';
      const state=el('p0022State');
      if(state){
        state.className=`p0022-state ${data.overall==='complete'?'ok':data.overall==='running'?'running':data.overall==='failed'?'failed':data.overall==='partial'?'running':'waiting'}`;
        state.textContent=overallText;
      }
      if(el('p0022Collected'))el('p0022Collected').textContent=String(c.collected||0);
      if(el('p0022Generated'))el('p0022Generated').textContent=String(c.generated||0);
      if(el('p0022Published'))el('p0022Published').textContent=String(c.published||0);
      if(el('p0022Review'))el('p0022Review').textContent=String(c.review||0);
      if(el('p0022Errors'))el('p0022Errors').textContent=String(c.errors||0);

      const latest=data.latest;
      if(el('p0022Trigger'))el('p0022Trigger').textContent=latest
        ? (['scheduled','cron'].includes(String(latest.trigger_type||'').toLowerCase())?'자동 실행':'수동 실행')
        : '오늘 기록 없음';
      if(el('p0022Started'))el('p0022Started').textContent=fmt(latest?.started_at);
      if(el('p0022Finished'))el('p0022Finished').textContent=fmt(latest?.finished_at||latest?.ended_at);
      if(el('p0022RunCounts'))el('p0022RunCounts').textContent=latest?`${latest.found||0} / ${latest.inserted||0} / ${latest.skipped||0}`:'-';
      if(el('p0022Memo'))el('p0022Memo').textContent=overallText+' 이 현황은 Edge Function의 서비스 권한으로 조회되어 RLS와 관계없이 표시됩니다.';

      el(P+'Pipeline').innerHTML=[
        stageCard(stages.collect||{status:'not_started'},'collect'),
        stageCard(stages.analyze||{status:'not_started'},'analyze'),
        stageCard(stages.publish||{status:'not_started'},'publish')
      ].join('');

      const timeline=data.timeline||[];
      el(P+'Timeline').innerHTML=timeline.length?timeline.map(r=>`
        <div class="p006-line">
          <span>${esc(fmt(r.started_at))}</span>
          <b>${esc(stageName(r.stage))}</b>
          <span>${esc(statusName(r.status))} · 신규 ${Number(r.inserted||0)} · 제외 ${Number(r.skipped||0)}
          ${r.note?`<br>${esc(r.note)}`:''}</span>
        </div>`).join(''):'<div class="p0022-muted">오늘 실행 기록이 없습니다.</div>';

      const errors=data.errors||[];
      el(P+'Errors').innerHTML=errors.length?errors.map(e=>`
        <div class="p006-error"><b>${esc(stageName(e.stage))}</b>${e.time?` · ${esc(fmt(e.time))}`:''}<br>${esc(e.message)}</div>`
      ).join(''):'<div class="p0022-muted">확인된 오류가 없습니다.</div>';

      const history=data.history||[];
      el(P+'History').innerHTML=history.map(h=>`
        <div class="p006-day">
          <b>${esc(String(h.date_key||'').slice(5))}</b>
          <span>수집 ${Number(h.collected||0)}</span>
          <span>AI ${Number(h.generated||0)}</span>
          <span>게시 ${Number(h.published||0)}</span>
          <span>${h.failed?`실패 ${h.failed}`:`성공 ${h.success||0}`}</span>
        </div>`).join('');

      const recent=el('p0022Runs');
      if(recent)recent.innerHTML=timeline.slice(0,5).map(r=>`
        <div class="p0022-row"><span>${esc(fmt(r.started_at))} · ${esc(stageName(r.stage))}</span><b>${esc(statusName(r.status))}</b></div>`
      ).join('')||'<div class="p0022-muted">최근 실행 기록이 없습니다.</div>';

      const sub=document.querySelector('#p0022Panel .p0022-sub');
      if(sub)sub.textContent=`마지막 확인 ${new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})} · 조회 전용이며 자동 재실행하지 않습니다.`;
    }catch(e){
      console.error('[P006 automation status]',e);
      const state=el('p0022State');
      if(state){state.className='p0022-state failed';state.textContent='자동화 현황 확인에 실패했습니다.';}
      if(el('p0022Memo'))el('p0022Memo').textContent=e?.message||String(e);
    }finally{
      if(refresh){refresh.disabled=false;refresh.textContent='현황 새로고침';}
    }
  }

  document.addEventListener('DOMContentLoaded',()=>{
    document.querySelector('[data-section="newsroom"]')?.addEventListener('click',()=>setTimeout(load,450));
    const refresh=el('p0022Refresh');
    refresh?.addEventListener('click',()=>setTimeout(load,50));
    setTimeout(()=>{ensureUI();load();},1900);
  });
  window.P002TodayNewsroomStatus={load};
  window.P006AutomationStatus={load};
})();

// === P010-1: AI Smart Flyer 관리자 기반 ===
(() => {
  const P='p010';
  const el=id=>document.getElementById(id);
  const esc=(v='')=>String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  let currentFlyers=[];

  function style(){
    if(el(P+'Style'))return;
    const s=document.createElement('style');
    s.id=P+'Style';
    s.textContent=`
      #${P}Panel{margin-top:16px;padding:16px;border:1px solid #cbdcf8;border-radius:16px;background:#f8fbff}
      #${P}Panel h3{margin:0 0 5px;font-size:17px}
      #${P}Panel .p010-sub{color:#64748b;font-size:12px;margin-bottom:12px}
      #${P}Panel .p010-grid{display:grid;grid-template-columns:1fr 150px 150px;gap:9px}
      #${P}Panel input,#${P}Panel select{width:100%;box-sizing:border-box}
      #${P}Panel .p010-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
      #${P}Panel .p010-list{display:grid;gap:9px;margin-top:14px}
      #${P}Panel .p010-card{background:#fff;border:1px solid #dbe6f7;border-radius:13px;padding:12px}
      #${P}Panel .p010-card b{display:block;color:#163b70}
      #${P}Panel .p010-meta{margin-top:4px;color:#64748b;font-size:12px}
      #${P}Panel .p010-products{margin-top:8px;font-size:12px;line-height:1.6;color:#334155}
      #${P}Panel .p010-card-actions{display:flex;gap:6px;margin-top:9px;flex-wrap:wrap}
      #${P}Panel .p010-card-actions button{padding:7px 9px}
      @media(max-width:760px){#${P}Panel .p010-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(s);
  }

  function panel(){
    if(el(P+'Panel'))return el(P+'Panel');
    const anchor=el('description_images')?.closest('.field')||el('description_images')?.parentElement||el('description');
    if(!anchor)return null;
    style();
    const box=document.createElement('section');
    box.id=P+'Panel';
    box.innerHTML=`
      <h3>AI 스마트 전단 · 이번 주 세일</h3>
      <div class="p010-sub">전단 이미지 한 장을 올리면 상품 분석·이미지 생성·앱 메인 연결까지 자동으로 처리합니다.</div>
      <div class="p010-grid">
        <input type="file" id="${P}File" accept="image/jpeg,image/png,image/webp">
        <input type="date" id="${P}Start" aria-label="행사 시작일">
        <input type="date" id="${P}End" aria-label="행사 종료일">
      </div>
      <label style="display:flex;gap:7px;align-items:center;margin-top:9px;font-size:13px;">
        <input type="checkbox" id="${P}Home" checked style="width:auto"> 오늘의 달타운 노출 후보로 사용
      </label>
      <div class="p010-actions">
        <button type="button" class="btn primary" id="${P}Analyze">전단 업로드·자동 게시 준비</button>
        <button type="button" class="btn" id="${P}Refresh">전단 목록 새로고침</button>
      </div>
      <div id="${P}Status" class="p010-sub" style="margin-top:9px"></div>
      <div id="${P}List" class="p010-list"></div>`;
    anchor.insertAdjacentElement('afterend',box);
    el(P+'Analyze')?.addEventListener('click',analyze);
    el(P+'Refresh')?.addEventListener('click',load);
    return box;
  }

  async function upload(file){
    const safeBusinessId=String(selectedId||'').replace(/[^a-zA-Z0-9_-]/g,'');
    const {bucket,path}=makeUploadPath(file,`weekly-flyers/${safeBusinessId}`);
    const {error}=await supabase.storage.from(bucket).upload(path,file,{
      upsert:false,cacheControl:'31536000',contentType:file.type||'image/jpeg'
    });
    if(error)throw error;
    const {data}=supabase.storage.from(bucket).getPublicUrl(path);
    if(!data?.publicUrl)throw new Error('업로드 URL을 만들지 못했습니다.');
    return data.publicUrl;
  }

  async function analyze(){
    if(!selectedId)return alert('먼저 업소를 선택하고 저장하세요.');
    const file=el(P+'File')?.files?.[0];
    if(!file)return alert('전단 이미지를 선택하세요.');
    const btn=el(P+'Analyze');
    btn.disabled=true;
    el(P+'Status').textContent='이미지를 업로드하고 AI가 상품과 가격을 분석하고 있습니다...';
    try{
      const imageUrl=await upload(file);
      const result=await newsroomEdgeCall('analyze_weekly_flyer',{
        region:getAppRegion(),
        business_id:String(selectedId),
        image_url:imageUrl,
        file_type:file.type,
        start_date:el(P+'Start').value||null,
        end_date:el(P+'End').value||null,
        show_on_home:el(P+'Home').checked
      });
      const flyerId=Number(result?.flyer?.id||0);
      el(P+'Status').textContent=`1/3 AI 분석 완료: 상품 ${result.item_count||0}개 · 상품 이미지를 만들고 있습니다.`;
      el(P+'File').value='';
      await load();

      let cropResult={ok:false,complete:0};
      if(flyerId&&window.P016SmartFlyerCrop?.run){
        cropResult=await window.P016SmartFlyerCrop.run(flyerId,(message)=>{
          el(P+'Status').textContent=`2/3 ${message}`;
        });
      }

      el(P+'Status').textContent=`3/3 앱 메인 연결을 준비하고 있습니다.`;
      if(flyerId){
        await newsroomEdgeCall('activate_weekly_flyer',{id:flyerId});
        try{
          localStorage.setItem('daltownmap_content_changed',String(Date.now()));
          localStorage.removeItem('daltownmap_v38_home');
        }catch{}
        try{
          const bc=new BroadcastChannel('daltownmap-content');
          bc.postMessage({type:'weekly_flyer_changed',flyer_id:flyerId,at:Date.now()});
          bc.close();
        }catch{}
      }

      el(P+'Status').textContent=
        `자동 처리 완료: 상품 ${result.item_count||0}개 · 이미지 ${cropResult.complete||0}개 · 앱 메인 노출 중`;
      await load();
    }catch(e){
      el(P+'Status').textContent=`분석 실패: ${e.message}`;
      alert(`스마트 전단 분석 실패: ${e.message}`);
    }finally{btn.disabled=false;}
  }

  async function load(){
    panel();
    const list=el(P+'List');
    if(!list||!selectedId)return;
    list.innerHTML='<div class="p010-sub">전단 목록을 불러오는 중입니다.</div>';
    try{
      const result=await newsroomEdgeCall('list_weekly_flyers',{region:getAppRegion(),business_id:selectedId});
      currentFlyers=result.flyers||[];
      if(!currentFlyers.length){
        list.innerHTML='<div class="p010-sub">등록된 주간 전단이 없습니다.</div>';
        return;
      }
      list.innerHTML=currentFlyers.map(f=>{
        const items=Array.isArray(f.weekly_flyer_items)?f.weekly_flyer_items:[];
        const top=items.slice().sort((a,b)=>(Number(b.is_featured)-Number(a.is_featured))||(Number(b.ai_score)-Number(a.ai_score))).slice(0,5);
        return `<div class="p010-card">
          <b>${esc(f.title||'주간 세일')}</b>
          <div class="p010-meta">${esc(f.start_date||'-')} ~ ${esc(f.end_date||'-')} · 상태 ${esc(f.status)} · 상품 ${items.length}개</div>
          <div class="p010-products">${top.map(x=>`${esc(x.product_name)} ${x.sale_price!=null?`$${Number(x.sale_price).toFixed(2)}`:''}`).join('<br>')||'추출된 대표상품이 없습니다.'}</div>
          <div class="p010-card-actions">
            <button type="button" class="btn" data-p010-act="${f.status==='active'?'draft':'active'}" data-id="${f.id}">${f.status==='active'?'비활성화':'활성화'}</button>
            <button type="button" class="btn" data-p010-act="delete" data-id="${f.id}">삭제</button>
            <a class="btn" href="${esc(f.image_url)}" target="_blank" rel="noopener">원본 보기</a>
          </div>
        </div>`;
      }).join('');
      list.querySelectorAll('[data-p010-act]').forEach(btn=>btn.addEventListener('click',async()=>{
        const id=Number(btn.dataset.id);
        const act=btn.dataset.p010Act;
        if(act==='delete'){
          if(!confirm('이 전단과 추출 상품을 삭제할까요?'))return;
          await newsroomEdgeCall('delete_weekly_flyer',{id});
        }else{
          await newsroomEdgeCall('set_weekly_flyer_status',{id,status:act});
        }
        await load();
      }));
    }catch(e){
      list.innerHTML=`<div class="p010-sub">전단 목록 조회 실패: ${esc(e.message)}</div>`;
    }
  }

  function onBusinessChanged(){
    panel();
    setTimeout(load,100);
  }
  document.addEventListener('DOMContentLoaded',()=>{
    setTimeout(()=>{panel();load();},1600);
    document.addEventListener('click',e=>{
      if(e.target.closest('.business-row,.biz-item'))setTimeout(onBusinessChanged,200);
    });
  });
  const originalFill=window.fillBusinessForm||null;
  if(typeof fillBusinessForm==='function'){
    const base=fillBusinessForm;
    window.fillBusinessForm=function(row){
      const result=base(row);
      setTimeout(onBusinessChanged,100);
      return result;
    };
  }
  window.P010SmartFlyer={load};
})();
console.info('[DalTownMap] P010-1 UUID Smart Flyer loaded');

// === P010-2: 스마트 전단 상품 검토·수정 ===
(() => {
  const P='p0102a';
  const el=id=>document.getElementById(id);
  const esc=(v='')=>String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  function ensureStyle(){
    if(el(P+'Style'))return;
    const s=document.createElement('style');
    s.id=P+'Style';
    s.textContent=`
      .p0102-edit{margin-top:10px;border-top:1px solid #e2e8f0;padding-top:10px}
      .p0102-edit-row{display:grid;grid-template-columns:1.5fr 110px 110px 95px 70px;gap:7px;align-items:center;margin-top:7px}
      .p0102-edit-row input{width:100%;box-sizing:border-box;padding:8px;border:1px solid #dbe6f7;border-radius:9px}
      .p0102-edit-row label{font-size:11px;color:#64748b}
      .p0102-save-items{margin-top:9px}
      @media(max-width:850px){.p0102-edit-row{grid-template-columns:1fr 1fr}.p0102-edit-row .p0102-name{grid-column:1/-1}}
    `;
    document.head.appendChild(s);
  }

  function appendEditors(){
    ensureStyle();
    document.querySelectorAll('#p010List .p010-card').forEach((card,index)=>{
      if(card.querySelector('.p0102-edit'))return;
      const flyer=(window.P010SmartFlyer?.currentFlyers||window.currentFlyers||[])[index];
      // 기존 P010 closure 변수에 접근할 수 없으므로 카드의 전단 ID를 이용해 다시 조회합니다.
      const id=Number(card.querySelector('[data-id]')?.dataset.id||0);
      if(!id)return;
      const wrap=document.createElement('div');
      wrap.className='p0102-edit';
      wrap.innerHTML=`<button type="button" class="btn" data-p0102-load="${id}">상품 검토·수정 열기</button><div data-p0102-body="${id}"></div>`;
      card.appendChild(wrap);
    });
  }

  async function loadItems(id,body){
    body.innerHTML='<div class="p010-sub">상품을 불러오는 중입니다.</div>';
    try{
      const result=await newsroomEdgeCall('list_weekly_flyers',{region:getAppRegion(),business_id:selectedId});
      const flyer=(result.flyers||[]).find(f=>Number(f.id)===Number(id));
      const items=Array.isArray(flyer?.weekly_flyer_items)?flyer.weekly_flyer_items:[];
      body.innerHTML=items.length?items.map(item=>`
        <div class="p0102-edit-row" data-item-id="${item.id}">
          <input class="p0102-name" value="${esc(item.product_name||'')}" placeholder="상품명">
          <input class="p0102-regular" type="number" step="0.01" value="${item.regular_price??''}" placeholder="정상가">
          <input class="p0102-sale" type="number" step="0.01" value="${item.sale_price??''}" placeholder="할인가">
          <input class="p0102-unit" value="${esc(item.unit_text||'')}" placeholder="단위">
          <label><input class="p0102-featured" type="checkbox" ${item.is_featured?'checked':''}> 대표</label>
        </div>`).join('')+`<button type="button" class="btn primary p0102-save-items" data-p0102-save="${id}">수정 저장</button>`
        :'<div class="p010-sub">추출된 상품이 없습니다.</div>';
    }catch(e){
      body.innerHTML=`<div class="p010-sub">조회 실패: ${esc(e.message)}</div>`;
    }
  }

  async function saveItems(id,body){
    const items=[...body.querySelectorAll('[data-item-id]')].map(row=>({
      id:Number(row.dataset.itemId),
      product_name:row.querySelector('.p0102-name').value.trim(),
      regular_price:row.querySelector('.p0102-regular').value||null,
      sale_price:row.querySelector('.p0102-sale').value||null,
      unit_text:row.querySelector('.p0102-unit').value.trim()||null,
      is_featured:row.querySelector('.p0102-featured').checked
    }));
    try{
      await newsroomEdgeCall('update_weekly_flyer_items',{id,items});
      alert('상품 정보를 저장했습니다.');
      if(window.P010SmartFlyer?.load)await window.P010SmartFlyer.load();
    }catch(e){alert(`저장 실패: ${e.message}`);}
  }

  document.addEventListener('click',e=>{
    const loadBtn=e.target.closest('[data-p0102-load]');
    if(loadBtn){
      const id=Number(loadBtn.dataset.p0102Load);
      const body=document.querySelector(`[data-p0102-body="${id}"]`);
      if(body)loadItems(id,body);
    }
    const saveBtn=e.target.closest('[data-p0102-save]');
    if(saveBtn){
      const id=Number(saveBtn.dataset.p0102Save);
      const body=document.querySelector(`[data-p0102-body="${id}"]`);
      if(body)saveItems(id,body);
    }
  });

  const observer=new MutationObserver(()=>appendEditors());
  document.addEventListener('DOMContentLoaded',()=>{
    setTimeout(()=>{
      ensureStyle();
      const list=el('p010List');
      if(list)observer.observe(list,{childList:true,subtree:true});
      appendEditors();
    },2000);
  });
  console.info('[DalTownMap] P010-2 Smart Flyer editor loaded');
})();

// === P010-3: 스마트 전단 센터 · 미리보기 · 통합 관리 ===
(() => {
  const P='p0103';
  const el=id=>document.getElementById(id);
  const esc=(v='')=>String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  let allFlyers=[];

  function ensureStyle(){
    if(el(P+'Style'))return;
    const s=document.createElement('style');
    s.id=P+'Style';
    s.textContent=`
      #${P}Open{margin-left:8px}
      #${P}Modal{position:fixed;inset:0;z-index:100200;display:none;background:rgba(15,23,42,.58);padding:20px;overflow:auto}
      #${P}Modal.open{display:block}
      #${P}Modal .p0103-shell{max-width:1180px;margin:0 auto;background:#f8fbff;border-radius:20px;min-height:80vh;padding:18px}
      #${P}Modal .p0103-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
      #${P}Modal h2{margin:0;color:#0f2b5b}
      #${P}Modal .p0103-close{width:42px;height:42px;border:0;border-radius:12px;background:#eaf2ff;font-size:25px;color:#24456f}
      #${P}Modal .p0103-toolbar{display:grid;grid-template-columns:1fr 180px 150px;gap:9px;margin-top:14px}
      #${P}Modal .p0103-toolbar input,#${P}Modal .p0103-toolbar select{width:100%;box-sizing:border-box}
      #${P}List{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:14px}
      #${P}Modal .p0103-card{border:1px solid #dbe6f7;border-radius:15px;padding:14px;background:#fff}
      #${P}Modal .p0103-card-top{display:flex;justify-content:space-between;gap:10px}
      #${P}Modal .p0103-card h3{margin:0;color:#163b70;font-size:16px}
      #${P}Modal .p0103-meta{margin-top:5px;color:#64748b;font-size:12px}
      #${P}Modal .p0103-products{margin-top:10px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
      #${P}Modal .p0103-product{border:1px solid #edf2f7;border-radius:10px;padding:9px;background:#fbfdff;font-size:12px}
      #${P}Modal .p0103-price{color:#dc2626;font-weight:900;margin-top:4px}
      #${P}Modal .p0103-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:11px}
      #${P}Preview{position:fixed;inset:0;z-index:100220;display:none;align-items:center;justify-content:center;background:rgba(15,23,42,.65);padding:20px}
      #${P}Preview.open{display:flex}
      #${P}Preview .p0103-phone{width:min(390px,100%);background:#eef4ff;border-radius:32px;padding:14px;box-shadow:0 25px 70px rgba(15,23,42,.35)}
      #${P}Preview .p0103-screen{background:#fff;border-radius:24px;padding:15px}
      #${P}Preview .p0103-preview-products{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:12px}
      #${P}Preview .p0103-preview-product{border:1px solid #e2e8f0;border-radius:12px;padding:10px;background:#fff}
      #${P}Preview .p0103-preview-close{width:100%;margin-top:12px}
      @media(max-width:800px){#${P}List{grid-template-columns:1fr}#${P}Modal .p0103-toolbar{grid-template-columns:1fr}}
    `;
    document.head.appendChild(s);
  }

  function ensureOpenButton(){
    const panel=el('p010Panel');
    if(!panel||el(P+'Open'))return;
    const actions=panel.querySelector('.p010-actions');
    if(!actions)return;
    const btn=document.createElement('button');
    btn.type='button';
    btn.id=P+'Open';
    btn.className='btn';
    btn.textContent='전체 스마트 전단 센터';
    btn.addEventListener('click',openCenter);
    actions.appendChild(btn);
  }

  function ensureModal(){
    ensureStyle();
    let modal=el(P+'Modal');
    if(modal)return modal;
    modal=document.createElement('div');
    modal.id=P+'Modal';
    modal.innerHTML=`
      <div class="p0103-shell">
        <div class="p0103-head">
          <div>
            <h2>AI 스마트 전단 센터</h2>
            <div class="p0103-meta">모든 마트의 전단 상태, 대표상품, 행사기간을 한 화면에서 관리합니다.</div>
          </div>
          <button type="button" class="p0103-close">×</button>
        </div>
        <div class="p0103-toolbar">
          <input id="${P}Search" placeholder="업소명 또는 전단 제목 검색">
          <select id="${P}Status">
            <option value="">전체 상태</option>
            <option value="draft">검토 대기</option>
            <option value="active">활성</option>
            <option value="archived">보관</option>
            <option value="expired">종료</option>
          </select>
          <button type="button" class="btn primary" id="${P}Refresh">새로고침</button>
        </div>
        <div id="${P}List"></div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('.p0103-close')?.addEventListener('click',closeCenter);
    modal.addEventListener('click',e=>{if(e.target===modal)closeCenter();});
    el(P+'Search')?.addEventListener('input',render);
    el(P+'Status')?.addEventListener('change',render);
    el(P+'Refresh')?.addEventListener('click',load);
    return modal;
  }

  function ensurePreview(){
    let p=el(P+'Preview');
    if(p)return p;
    p=document.createElement('div');
    p.id=P+'Preview';
    p.innerHTML='<div class="p0103-phone"><div class="p0103-screen" id="p0103PreviewBody"></div></div>';
    document.body.appendChild(p);
    p.addEventListener('click',e=>{if(e.target===p)p.classList.remove('open');});
    return p;
  }

  function closeCenter(){
    el(P+'Modal')?.classList.remove('open');
    document.body.style.overflow='';
  }

  async function openCenter(){
    ensureModal().classList.add('open');
    document.body.style.overflow='hidden';
    await load();
  }

  async function load(){
    const list=el(P+'List');
    if(list)list.innerHTML='<div class="p0103-meta">전단을 불러오는 중입니다.</div>';
    try{
      const result=await newsroomEdgeCall('list_weekly_flyers',{region:getAppRegion()});
      allFlyers=result.flyers||[];
      render();
    }catch(e){
      if(list)list.innerHTML=`<div class="p0103-meta">조회 실패: ${esc(e.message)}</div>`;
    }
  }

  function businessName(f){
    const b=f.businesses||{};
    return b.name_ko||b.name||b.name_en||`업소 ${String(f.business_id).slice(0,8)}`;
  }

  function products(f){
    return (Array.isArray(f.weekly_flyer_items)?f.weekly_flyer_items:[])
      .slice().sort((a,b)=>Number(b.is_featured)-Number(a.is_featured)||Number(b.ai_score)-Number(a.ai_score));
  }

  function render(){
    const list=el(P+'List');
    if(!list)return;
    const q=String(el(P+'Search')?.value||'').trim().toLowerCase();
    const status=String(el(P+'Status')?.value||'');
    const rows=allFlyers.filter(f=>{
      if(status&&f.status!==status)return false;
      if(q&&!`${businessName(f)} ${f.title||''}`.toLowerCase().includes(q))return false;
      return true;
    });
    list.innerHTML=rows.length?rows.map(f=>{
      const top=products(f).slice(0,6);
      return `<article class="p0103-card">
        <div class="p0103-card-top">
          <div>
            <h3>${esc(businessName(f))}</h3>
            <div class="p0103-meta">${esc(f.title||'주간 세일')} · ${esc(f.start_date||'-')} ~ ${esc(f.end_date||'-')}</div>
          </div>
          <b>${esc(f.status||'draft')}</b>
        </div>
        <div class="p0103-products">
          ${top.map(x=>`<div class="p0103-product"><b>${esc(x.product_name||'상품')}</b><div class="p0103-price">${x.sale_price!=null?`$${Number(x.sale_price).toFixed(2)}`:'가격 확인 필요'}</div></div>`).join('')}
        </div>
        <div class="p0103-actions">
          <button type="button" class="btn" data-p0103-preview="${f.id}">사용자 화면 미리보기</button>
          <button type="button" class="btn" data-p0103-status="${f.status==='active'?'archived':'active'}" data-id="${f.id}">${f.status==='active'?'보관':'활성화'}</button>
          <a class="btn" href="${esc(f.image_url)}" target="_blank" rel="noopener">원본 보기</a>
        </div>
      </article>`;
    }).join(''):'<div class="p0103-meta">조건에 맞는 전단이 없습니다.</div>';

    list.querySelectorAll('[data-p0103-preview]').forEach(btn=>btn.addEventListener('click',()=>preview(Number(btn.dataset.p0103Preview))));
    list.querySelectorAll('[data-p0103-status]').forEach(btn=>btn.addEventListener('click',async()=>{
      await newsroomEdgeCall('set_weekly_flyer_status',{id:Number(btn.dataset.id),status:btn.dataset.p0103Status});
      await load();
      if(window.P010SmartFlyer?.load)window.P010SmartFlyer.load();
    }));
  }

  function preview(id){
    const f=allFlyers.find(x=>Number(x.id)===Number(id));
    if(!f)return;
    const items=products(f).slice(0,6);
    const p=ensurePreview();
    const body=el('p0103PreviewBody');
    body.innerHTML=`
      <div style="font-size:12px;color:#64748b">오늘의 달타운 · 이번 주 특가</div>
      <h2 style="margin:6px 0;color:#0f2b5b">${esc(f.title||businessName(f))}</h2>
      <div style="font-size:12px;color:#64748b">${esc(businessName(f))} · ${esc(f.start_date||'-')} ~ ${esc(f.end_date||'-')}</div>
      <div class="p0103-preview-products">
        ${items.map(x=>`<div class="p0103-preview-product"><b>${esc(x.product_name||'상품')}</b><div class="p0103-price">${x.sale_price!=null?`$${Number(x.sale_price).toFixed(2)}`:''}</div></div>`).join('')}
      </div>
      <button type="button" class="btn primary p0103-preview-close">닫기</button>`;
    body.querySelector('.p0103-preview-close')?.addEventListener('click',()=>p.classList.remove('open'));
    p.classList.add('open');
  }

  document.addEventListener('DOMContentLoaded',()=>{
    setTimeout(()=>{ensureStyle();ensureOpenButton();},1800);
    const observer=new MutationObserver(()=>ensureOpenButton());
    observer.observe(document.body,{childList:true,subtree:true});
  });

  window.P010SmartFlyerCenter={open:openCenter,load};
  console.info('[DalTownMap] P010-3 Smart Flyer Center loaded');
})();

// === P011: 독립 AI 스마트 전단 센터 ===
(() => {
  const P='p011';
  const el=id=>document.getElementById(id);
  const esc=(v='')=>String(v).replace(/[&<>"']/g,m=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[m]);

  let flyers=[];
  let currentStatus='';
  let currentSearch='';

  function styles(){
    if(el(P+'Style'))return;
    const s=document.createElement('style');
    s.id=P+'Style';
    s.textContent=`
      #section-smartFlyer{padding-bottom:40px}
      #section-smartFlyer .p011-hero{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:16px}
      #section-smartFlyer .p011-hero h2{margin:0;color:#0f2b5b}
      #section-smartFlyer .p011-hero p{margin:6px 0 0;color:#64748b;line-height:1.55}
      #section-smartFlyer .p011-toolbar{display:grid;grid-template-columns:minmax(220px,1fr) 180px auto;gap:9px;margin-bottom:14px}
      #section-smartFlyer .p011-toolbar input,#section-smartFlyer .p011-toolbar select{width:100%;box-sizing:border-box}
      #section-smartFlyer .p011-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px}
      #section-smartFlyer .p011-stat{background:#fff;border:1px solid #dbe6f7;border-radius:14px;padding:13px}
      #section-smartFlyer .p011-stat small{color:#64748b}
      #section-smartFlyer .p011-stat strong{display:block;margin-top:5px;font-size:24px;color:#0f2b5b}
      #section-smartFlyer .p011-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
      #section-smartFlyer .p011-card{background:#fff;border:1px solid #dbe6f7;border-radius:16px;padding:14px}
      #section-smartFlyer .p011-card-top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
      #section-smartFlyer .p011-card h3{margin:0;color:#163b70}
      #section-smartFlyer .p011-meta{margin-top:5px;color:#64748b;font-size:12px}
      #section-smartFlyer .p011-badge{padding:5px 9px;border-radius:999px;font-size:11px;font-weight:900}
      #section-smartFlyer .p011-badge.active{background:#dcfce7;color:#166534}
      #section-smartFlyer .p011-badge.draft{background:#fff7ed;color:#b45309}
      #section-smartFlyer .p011-badge.archived{background:#f1f5f9;color:#475569}
      #section-smartFlyer .p011-badge.expired{background:#fee2e2;color:#b91c1c}
      #section-smartFlyer .p011-products{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px}
      #section-smartFlyer .p011-product{border:1px solid #edf2f7;border-radius:11px;padding:10px;background:#fbfdff}
      #section-smartFlyer .p011-product b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #section-smartFlyer .p011-price{margin-top:5px;color:#dc2626;font-weight:900}
      #section-smartFlyer .p011-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}
      #section-smartFlyer .p011-empty{padding:32px;text-align:center;color:#64748b;border:1px dashed #cbd5e1;border-radius:14px;background:#fff}
      #p011Preview{position:fixed;inset:0;z-index:100300;display:none;align-items:center;justify-content:center;background:rgba(15,23,42,.65);padding:20px}
      #p011Preview.open{display:flex}
      #p011Preview .p011-phone{width:min(390px,100%);background:#eaf2ff;border-radius:32px;padding:14px}
      #p011Preview .p011-screen{background:#fff;border-radius:24px;padding:16px}
      #p011Preview .p011-preview-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:12px}
      #p011Preview .p011-preview-item{border:1px solid #e2e8f0;border-radius:12px;padding:10px}
      @media(max-width:900px){
        #section-smartFlyer .p011-list{grid-template-columns:1fr}
        #section-smartFlyer .p011-stats{grid-template-columns:repeat(2,1fr)}
        #section-smartFlyer .p011-toolbar{grid-template-columns:1fr}
      }
    `;
    document.head.appendChild(s);
  }

  function ensureNav(){
    if(document.querySelector('[data-section="smartFlyer"]'))return;
    const nav=el('adminNav');
    if(!nav)return;
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='nav-item';
    btn.dataset.section='smartFlyer';
    btn.innerHTML='<span>🛒</span><span>AI 스마트 전단</span>';
    btn.addEventListener('click',()=>{
      switchSection('smartFlyer');
      load();
    });
    const newsroomBtn=nav.querySelector('[data-section="newsroom"]');
    if(newsroomBtn)newsroomBtn.insertAdjacentElement('beforebegin',btn);
    else nav.appendChild(btn);
  }

  function ensureSection(){
    if(el('section-smartFlyer'))return el('section-smartFlyer');
    styles();
    const host=document.querySelector('.main-content, main, #adminMain, .content')||document.body;
    const sec=document.createElement('section');
    sec.id='section-smartFlyer';
    sec.className='admin-section';
    sec.innerHTML=`
      <div class="p011-hero">
        <div>
          <h2>AI 스마트 전단 센터</h2>
          <p>모든 마트의 전단 분석, 상품 검토, 사용자 화면 미리보기와 활성 상태를 한곳에서 관리합니다.</p>
        </div>
        <button type="button" class="btn primary" id="${P}Refresh">새로고침</button>
      </div>

      <div class="p011-stats">
        <div class="p011-stat"><small>전체 전단</small><strong id="${P}Total">0</strong></div>
        <div class="p011-stat"><small>활성 전단</small><strong id="${P}Active">0</strong></div>
        <div class="p011-stat"><small>검토 대기</small><strong id="${P}Draft">0</strong></div>
        <div class="p011-stat"><small>종료·보관</small><strong id="${P}Closed">0</strong></div>
      </div>

      <div class="p011-toolbar">
        <input id="${P}Search" placeholder="업소명 또는 전단 제목 검색">
        <select id="${P}Status">
          <option value="">전체 상태</option>
          <option value="draft">검토 대기</option>
          <option value="active">활성</option>
          <option value="archived">보관</option>
          <option value="expired">종료</option>
        </select>
        <button type="button" class="btn" id="${P}OpenBusiness">업소 관리에서 새 전단 등록</button>
      </div>

      <div id="${P}List" class="p011-list"></div>`;
    host.appendChild(sec);

    el(P+'Refresh')?.addEventListener('click',load);
    el(P+'Search')?.addEventListener('input',e=>{
      currentSearch=String(e.target.value||'').trim().toLowerCase();
      render();
    });
    el(P+'Status')?.addEventListener('change',e=>{
      currentStatus=String(e.target.value||'');
      render();
    });
    el(P+'OpenBusiness')?.addEventListener('click',()=>switchSection('business'));
    return sec;
  }

  function businessName(f){
    const b=f.businesses||{};
    return b.name_ko||b.name||b.name_en||`업소 ${String(f.business_id||'').slice(0,8)}`;
  }

  function items(f){
    return (Array.isArray(f.weekly_flyer_items)?f.weekly_flyer_items:[])
      .slice()
      .sort((a,b)=>
        Number(b.is_featured||0)-Number(a.is_featured||0)||
        Number(b.ai_score||0)-Number(a.ai_score||0)
      );
  }

  function updateStats(){
    if(el(P+'Total'))el(P+'Total').textContent=String(flyers.length);
    if(el(P+'Active'))el(P+'Active').textContent=String(flyers.filter(f=>f.status==='active').length);
    if(el(P+'Draft'))el(P+'Draft').textContent=String(flyers.filter(f=>f.status==='draft').length);
    if(el(P+'Closed'))el(P+'Closed').textContent=String(flyers.filter(f=>['archived','expired'].includes(f.status)).length);
  }

  async function load(){
    ensureSection();
    const list=el(P+'List');
    if(list)list.innerHTML='<div class="p011-empty">전단 목록을 불러오는 중입니다.</div>';
    try{
      const result=await newsroomEdgeCall('list_weekly_flyers',{region:getAppRegion()});
      flyers=result.flyers||[];
      updateStats();
      render();
    }catch(error){
      if(list)list.innerHTML=`<div class="p011-empty">전단 목록 조회 실패<br><small>${esc(error.message)}</small></div>`;
    }
  }

  function render(){
    const list=el(P+'List');
    if(!list)return;
    const rows=flyers.filter(f=>{
      if(currentStatus&&f.status!==currentStatus)return false;
      const hay=`${businessName(f)} ${f.title||''}`.toLowerCase();
      if(currentSearch&&!hay.includes(currentSearch))return false;
      return true;
    });

    if(!rows.length){
      list.innerHTML='<div class="p011-empty">조건에 맞는 전단이 없습니다.</div>';
      return;
    }

    list.innerHTML=rows.map(f=>{
      const top=items(f).slice(0,6);
      return `<article class="p011-card">
        <div class="p011-card-top">
          <div>
            <h3>${esc(businessName(f))}</h3>
            <div class="p011-meta">${esc(f.title||'주간 세일')} · ${esc(f.start_date||'-')} ~ ${esc(f.end_date||'-')}</div>
            <div class="p011-meta">상품 ${items(f).length}개 · 오늘의 달타운 ${f.show_on_home?'사용':'미사용'}</div>
          </div>
          <span class="p011-badge ${esc(f.status||'draft')}">${esc(f.status||'draft')}</span>
        </div>

        <div class="p011-products">
          ${top.map(x=>`<div class="p011-product">
            <b>${esc(x.product_name||'상품')}</b>
            <div class="p011-price">${x.sale_price!=null?`$${Number(x.sale_price).toFixed(2)}`:'가격 확인 필요'}</div>
          </div>`).join('')}
        </div>

        <div class="p011-actions">
          <button type="button" class="btn" data-p011-preview="${f.id}">사용자 화면 미리보기</button>
          <button type="button" class="btn" data-p011-status="${f.status==='active'?'archived':'active'}" data-id="${f.id}">
            ${f.status==='active'?'보관':'활성화'}
          </button>
          <button type="button" class="btn" data-p011-home="${f.show_on_home?'false':'true'}" data-id="${f.id}">
            오늘의 달타운 ${f.show_on_home?'해제':'사용'}
          </button>
          <a class="btn" href="${esc(f.image_url)}" target="_blank" rel="noopener">원본 보기</a>
        </div>
      </article>`;
    }).join('');

    list.querySelectorAll('[data-p011-preview]').forEach(btn=>{
      btn.addEventListener('click',()=>preview(Number(btn.dataset.p011Preview)));
    });
    list.querySelectorAll('[data-p011-status]').forEach(btn=>{
      btn.addEventListener('click',async()=>{
        btn.disabled=true;
        try{
          await newsroomEdgeCall('set_weekly_flyer_status',{
            id:Number(btn.dataset.id),
            status:btn.dataset.p011Status
          });
          await load();
          if(window.P010SmartFlyer?.load)window.P010SmartFlyer.load();
        }catch(e){alert(`상태 변경 실패: ${e.message}`);}
        finally{btn.disabled=false;}
      });
    });
    list.querySelectorAll('[data-p011-home]').forEach(btn=>{
      btn.addEventListener('click',async()=>{
        btn.disabled=true;
        try{
          await newsroomEdgeCall('set_weekly_flyer_status',{
            id:Number(btn.dataset.id),
            show_on_home:btn.dataset.p011Home==='true'
          });
          await load();
        }catch(e){alert(`노출 설정 실패: ${e.message}`);}
        finally{btn.disabled=false;}
      });
    });
  }

  function ensurePreview(){
    let modal=el(P+'Preview');
    if(modal)return modal;
    modal=document.createElement('div');
    modal.id=P+'Preview';
    modal.innerHTML='<div class="p011-phone"><div class="p011-screen" id="p011PreviewBody"></div></div>';
    document.body.appendChild(modal);
    modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.remove('open');});
    return modal;
  }

  function preview(id){
    const f=flyers.find(x=>Number(x.id)===Number(id));
    if(!f)return;
    const top=items(f).slice(0,6);
    const modal=ensurePreview();
    const body=el('p011PreviewBody');
    body.innerHTML=`
      <div style="font-size:12px;color:#64748b">오늘의 달타운 · 이번 주 특가</div>
      <h2 style="margin:6px 0;color:#0f2b5b">${esc(f.title||businessName(f))}</h2>
      <div style="font-size:12px;color:#64748b">${esc(businessName(f))} · ${esc(f.start_date||'-')} ~ ${esc(f.end_date||'-')}</div>
      <div class="p011-preview-grid">
        ${top.map(x=>`<div class="p011-preview-item">
          <b>${esc(x.product_name||'상품')}</b>
          <div style="margin-top:5px;color:#dc2626;font-weight:900">${x.sale_price!=null?`$${Number(x.sale_price).toFixed(2)}`:''}</div>
        </div>`).join('')}
      </div>
      <button type="button" class="btn primary" style="width:100%;margin-top:12px" id="p011PreviewClose">닫기</button>`;
    el('p011PreviewClose')?.addEventListener('click',()=>modal.classList.remove('open'));
    modal.classList.add('open');
  }

  const baseSetPageMeta=setPageMeta;
  setPageMeta=function(){
    if(currentSection==='smartFlyer'){
      safeText('pageTitle','AI 스마트 전단');
      safeText('pageDesc','모든 마트 전단의 분석 결과, 대표상품, 노출 상태와 사용자 화면을 관리합니다.');
      return;
    }
    return baseSetPageMeta();
  };

  document.addEventListener('DOMContentLoaded',()=>{
    setTimeout(()=>{
      styles();
      ensureNav();
      ensureSection();
    },1200);
  });

  window.P011SmartFlyerCenter={load};
  console.info('[DalTownMap] P011 independent Smart Flyer Center loaded');
})();

// === P012: 스마트 전단 메인 노출 완성 ===
(() => {
  const P='p012';
  const el=id=>document.getElementById(id);
  const esc=(v='')=>String(v).replace(/[&<>"']/g,m=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[m]);

  function ensureStyle(){
    if(el(P+'Style'))return;
    const s=document.createElement('style');
    s.id=P+'Style';
    s.textContent=`
      #section-smartFlyer .p011-card{overflow:hidden}
      #section-smartFlyer .p012-cover{display:grid;grid-template-columns:116px 1fr;gap:13px;align-items:start}
      #section-smartFlyer .p012-thumb{width:116px;height:138px;object-fit:cover;border-radius:13px;border:1px solid #dbe6f7;background:#f8fafc}
      #section-smartFlyer .p012-live{display:inline-flex;align-items:center;gap:5px;padding:5px 9px;border-radius:999px;background:#dcfce7;color:#166534;font-size:11px;font-weight:900}
      #section-smartFlyer .p012-live::before{content:'';width:7px;height:7px;border-radius:50%;background:#16a34a}
      #section-smartFlyer .p012-home-note{margin-top:8px;padding:8px 10px;border-radius:10px;background:#eef4ff;color:#1d4ed8;font-size:11px;font-weight:800}
      #p012HomePreview{position:fixed;inset:0;z-index:100420;display:none;align-items:center;justify-content:center;background:rgba(15,23,42,.68);padding:20px}
      #p012HomePreview.open{display:flex}
      #p012HomePreview .p012-phone{width:min(390px,100%);background:#edf4ff;border-radius:34px;padding:13px;box-shadow:0 30px 80px rgba(15,23,42,.4)}
      #p012HomePreview .p012-screen{background:#fff;border-radius:25px;padding:15px}
      #p012HomePreview .p012-today{padding:16px;border-radius:20px;background:linear-gradient(135deg,#1664c0,#3285d3);color:#fff}
      #p012HomePreview .p012-items{display:grid;gap:7px;margin-top:10px}
      #p012HomePreview .p012-item{display:flex;justify-content:space-between;gap:10px;padding:8px 10px;border-radius:11px;background:rgba(255,255,255,.13)}
      @media(max-width:620px){#section-smartFlyer .p012-cover{grid-template-columns:84px 1fr}#section-smartFlyer .p012-thumb{width:84px;height:110px}}
    `;
    document.head.appendChild(s);
  }

  function flyerName(f){
    const b=f?.businesses||{};
    return b.name||b.name_ko||b.name_en||f?.title||'마트 주간 세일';
  }

  function sortedItems(f){
    return (Array.isArray(f?.weekly_flyer_items)?f.weekly_flyer_items:[])
      .slice().sort((a,b)=>
        Number(b.is_featured||0)-Number(a.is_featured||0)||
        Number(b.ai_score||0)-Number(a.ai_score||0)
      );
  }

  function notifyPublicRefresh(){
    try{
      localStorage.setItem('daltownmap_content_changed',String(Date.now()));
      localStorage.removeItem('daltownmap_v38_home');
    }catch{}
    try{
      const bc=new BroadcastChannel('daltownmap-content');
      bc.postMessage({type:'weekly_flyer_changed',at:Date.now()});
      bc.close();
    }catch{}
  }

  async function activate(id,button){
    button.disabled=true;
    const old=button.textContent;
    button.textContent='메인 연결 중...';
    try{
      const result=await newsroomEdgeCall('activate_weekly_flyer',{id:Number(id)});
      notifyPublicRefresh();
      alert(`활성화 완료\n대표 상품 ${result.item_count||0}개를 앱 메인과 업소 상세에 연결했습니다.`);
      if(window.P011SmartFlyerCenter?.load)await window.P011SmartFlyerCenter.load();
      if(window.P010SmartFlyer?.load)await window.P010SmartFlyer.load();
    }catch(e){
      alert(`활성화 실패: ${e.message}`);
    }finally{
      button.disabled=false;
      button.textContent=old;
    }
  }

  function ensurePreview(){
    let modal=el('p012HomePreview');
    if(modal)return modal;
    modal=document.createElement('div');
    modal.id='p012HomePreview';
    modal.innerHTML='<div class="p012-phone"><div class="p012-screen" id="p012HomePreviewBody"></div></div>';
    document.body.appendChild(modal);
    modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.remove('open');});
    return modal;
  }

  function previewFromCard(card){
    const title=card.querySelector('h3')?.textContent||'마트 주간 세일';
    const meta=card.querySelector('.p011-meta')?.textContent||'';
    const products=[...card.querySelectorAll('.p011-product')].slice(0,4).map(node=>({
      name:node.querySelector('b')?.textContent||'상품',
      price:node.querySelector('.p011-price')?.textContent||''
    }));
    const modal=ensurePreview();
    const body=el('p012HomePreviewBody');
    body.innerHTML=`
      <div style="font-size:12px;color:#64748b;margin-bottom:10px">DalTownMap 앱 메인 미리보기</div>
      <div class="p012-today">
        <div style="font-size:12px;font-weight:800">🛒 이번 주 특가 · LIVE</div>
        <h2 style="margin:8px 0 4px">${esc(title)}</h2>
        <div style="font-size:12px;opacity:.84">${esc(meta)}</div>
        <div class="p012-items">
          ${products.map(x=>`<div class="p012-item"><b>${esc(x.name)}</b><span>${esc(x.price)}</span></div>`).join('')}
        </div>
        <div style="margin-top:12px;text-align:right;font-size:12px;font-weight:800">전체 세일 보기 →</div>
      </div>
      <button type="button" class="btn primary" style="width:100%;margin-top:12px" id="p012PreviewClose">닫기</button>`;
    el('p012PreviewClose')?.addEventListener('click',()=>modal.classList.remove('open'));
    modal.classList.add('open');
  }

  function enhanceCards(){
    ensureStyle();
    document.querySelectorAll('#p011List .p011-card').forEach(card=>{
      if(card.dataset.p012Enhanced==='1')return;
      card.dataset.p012Enhanced='1';

      const originalTop=card.querySelector('.p011-card-top');
      const products=card.querySelector('.p011-products');
      const imageLink=card.querySelector('a[href]');
      const imageUrl=imageLink?.href||'';

      if(originalTop&&imageUrl){
        const wrapper=document.createElement('div');
        wrapper.className='p012-cover';
        const img=document.createElement('img');
        img.className='p012-thumb';
        img.src=imageUrl;
        img.alt='주간 전단';
        originalTop.parentNode.insertBefore(wrapper,originalTop);
        wrapper.appendChild(img);
        wrapper.appendChild(originalTop);
      }

      const status=card.querySelector('.p011-badge');
      if(status?.textContent?.trim()==='active'){
        status.className='p012-live';
        status.textContent='LIVE · 앱 노출 중';
        const note=document.createElement('div');
        note.className='p012-home-note';
        note.textContent='앱 메인의 오늘의 달타운과 해당 업소 상세에 자동 연결되어 있습니다.';
        (products||originalTop)?.insertAdjacentElement('afterend',note);
      }

      const actions=card.querySelector('.p011-actions');
      if(actions){
        const id=card.querySelector('[data-id]')?.dataset.id;
        const statusBtn=card.querySelector('[data-p011-status]');
        if(statusBtn&&statusBtn.dataset.p011Status==='active'){
          statusBtn.textContent='활성화 + 앱 메인 노출';
          statusBtn.replaceWith(statusBtn.cloneNode(true));
          const newBtn=card.querySelector('[data-p011-status]');
          newBtn.addEventListener('click',e=>{
            e.preventDefault();e.stopPropagation();
            activate(id,newBtn);
          });
        }

        const previewBtn=document.createElement('button');
        previewBtn.type='button';
        previewBtn.className='btn';
        previewBtn.textContent='앱 메인 미리보기';
        previewBtn.addEventListener('click',()=>previewFromCard(card));
        actions.insertBefore(previewBtn,actions.firstChild);
      }
    });
  }

  document.addEventListener('DOMContentLoaded',()=>{
    setTimeout(enhanceCards,1800);
    const observer=new MutationObserver(()=>enhanceCards());
    observer.observe(document.body,{childList:true,subtree:true});
  });

  console.info('[DalTownMap] P012 Smart Flyer home publishing loaded');
})();

// === P013: 스마트 전단 메인 연결 상태 확인 ===
(() => {
  function enhance(){
    document.querySelectorAll('#p011List .p011-card').forEach(card=>{
      if(card.dataset.p013Enhanced==='1')return;
      card.dataset.p013Enhanced='1';
      const live=card.querySelector('.p012-live');
      if(live){
        const note=document.createElement('div');
        note.style.cssText='margin-top:8px;padding:9px 11px;border-radius:10px;background:#eafaf0;color:#166534;font-size:12px;font-weight:800';
        note.textContent='공개 전단 API와 앱 메인 캐러셀에 연결된 상태입니다.';
        live.closest('.p011-card-top')?.insertAdjacentElement('afterend',note);
      }
    });
  }
  document.addEventListener('DOMContentLoaded',()=>{
    setTimeout(enhance,1600);
    new MutationObserver(enhance).observe(document.body,{childList:true,subtree:true});
  });
  console.info('[DalTownMap] P013 Smart Flyer publish status loaded');
})();

// === P014: 스마트 전단 공개 피드 상태 안내 ===
(() => {
  function enhance(){
    document.querySelectorAll('#p011List .p011-card').forEach(card=>{
      const live=card.querySelector('.p012-live');
      if(!live || card.querySelector('.p014-public-note'))return;
      const note=document.createElement('div');
      note.className='p014-public-note';
      note.style.cssText='margin-top:8px;padding:9px 11px;border-radius:10px;background:#ecfdf3;color:#166534;font-size:12px;font-weight:800';
      note.textContent='관리자 로그인 없이 앱에서 읽는 공개 전단 피드에 연결되어 있습니다.';
      live.closest('.p011-card-top')?.insertAdjacentElement('afterend',note);
    });
  }
  document.addEventListener('DOMContentLoaded',()=>{
    setTimeout(enhance,1500);
    new MutationObserver(enhance).observe(document.body,{childList:true,subtree:true});
  });
  console.info('[DalTownMap] P014 Smart Flyer public feed status loaded');
})();

// === P016: 상품 이미지 자동 크롭 ===
(() => {
  const P='p016';
  const el=id=>document.getElementById(id);
  const esc=(v='')=>String(v).replace(/[&<>"']/g,m=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[m]);

  function ensureStyle(){
    if(el(P+'Style'))return;
    const s=document.createElement('style');
    s.id=P+'Style';
    s.textContent=`
      .p016-crop-btn{margin-left:6px}
      .p016-crop-status{margin-top:8px;padding:8px 10px;border-radius:10px;background:#eef4ff;color:#1d4ed8;font-size:12px}
      .p016-crop-thumbs{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px;margin-top:9px}
      .p016-crop-thumb{aspect-ratio:1/1;border-radius:9px;overflow:hidden;background:#f1f5f9;border:1px solid #e2e8f0}
      .p016-crop-thumb img{width:100%;height:100%;object-fit:cover}
      @media(max-width:720px){.p016-crop-thumbs{grid-template-columns:repeat(3,minmax(0,1fr))}}
    `;
    document.head.appendChild(s);
  }

  function loadImage(url){
    return new Promise((resolve,reject)=>{
      const img=new Image();
      img.crossOrigin='anonymous';
      img.onload=()=>resolve(img);
      img.onerror=()=>reject(new Error('원본 전단 이미지를 불러오지 못했습니다.'));
      img.src=url+(url.includes('?')?'&':'?')+'crop='+Date.now();
    });
  }

  async function canvasBlob(canvas,type='image/jpeg',quality=.88){
    return await new Promise((resolve,reject)=>{
      canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('크롭 이미지를 만들지 못했습니다.')),type,quality);
    });
  }

  function normalizeBox(box){
    const x=Math.max(0,Math.min(1,Number(box?.x||0)));
    const y=Math.max(0,Math.min(1,Number(box?.y||0)));
    const width=Math.max(0,Math.min(1-x,Number(box?.width||0)));
    const height=Math.max(0,Math.min(1-y,Number(box?.height||0)));
    if(width<.03||height<.03)return null;
    // Add a small visual margin while remaining inside the image.
    const padX=width*.07, padY=height*.07;
    const nx=Math.max(0,x-padX);
    const ny=Math.max(0,y-padY);
    return {
      x:nx,y:ny,
      width:Math.min(1-nx,width+padX*2),
      height:Math.min(1-ny,height+padY*2)
    };
  }

  async function cropOne(img,item,flyerId){
    const box=normalizeBox(item.source_box);
    if(!box)return {item_id:item.id,crop_status:'unavailable',crop_error:'상품 위치 좌표 없음'};

    const sx=Math.round(box.x*img.naturalWidth);
    const sy=Math.round(box.y*img.naturalHeight);
    const sw=Math.max(1,Math.round(box.width*img.naturalWidth));
    const sh=Math.max(1,Math.round(box.height*img.naturalHeight));

    const side=Math.min(720,Math.max(300,Math.min(sw,sh)));
    const canvas=document.createElement('canvas');
    canvas.width=side;
    canvas.height=side;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#fff';
    ctx.fillRect(0,0,side,side);

    const scale=Math.min(side/sw,side/sh);
    const dw=sw*scale, dh=sh*scale;
    const dx=(side-dw)/2, dy=(side-dh)/2;
    ctx.drawImage(img,sx,sy,sw,sh,dx,dy,dw,dh);

    const blob=await canvasBlob(canvas);
    const path=`weekly-flyer-items/${flyerId}/${item.id}-${Date.now()}.jpg`;
    const bucket='public-images';
    const {error}=await supabase.storage.from(bucket).upload(path,blob,{
      upsert:true,cacheControl:'31536000',contentType:'image/jpeg'
    });
    if(error)throw error;
    const {data}=supabase.storage.from(bucket).getPublicUrl(path);
    return {
      item_id:item.id,
      item_image_url:data?.publicUrl||'',
      crop_status:data?.publicUrl?'complete':'failed',
      crop_error:data?.publicUrl?'':'공개 URL 생성 실패'
    };
  }

  async function cropFlyer(flyerId,button,statusNode){
    button.disabled=true;
    const old=button.textContent;
    button.textContent='상품 이미지 생성 중...';
    statusNode.textContent='전단 원본과 AI 상품 위치를 확인하고 있습니다.';
    try{
      const result=await newsroomEdgeCall('list_weekly_flyers',{region:getAppRegion()});
      const flyer=(result.flyers||[]).find(f=>Number(f.id)===Number(flyerId));
      if(!flyer)throw new Error('전단을 찾지 못했습니다.');
      const items=(flyer.weekly_flyer_items||[])
        .filter(x=>x.source_box&&Object.keys(x.source_box).length)
        .sort((a,b)=>Number(b.is_featured)-Number(a.is_featured)||Number(b.ai_score)-Number(a.ai_score))
        .slice(0,12);
      if(!items.length)throw new Error('이 전단에는 상품 위치 좌표가 없습니다. P016 적용 후 새로 AI 분석해야 합니다.');

      const img=await loadImage(flyer.image_url);
      const crops=[];
      for(let i=0;i<items.length;i++){
        statusNode.textContent=`상품 이미지 생성 ${i+1}/${items.length}`;
        try{
          crops.push(await cropOne(img,items[i],flyerId));
        }catch(e){
          crops.push({item_id:items[i].id,crop_status:'failed',crop_error:e.message});
        }
      }

      const saved=await newsroomEdgeCall('save_weekly_flyer_item_crops',{flyer_id:flyerId,crops});
      const complete=crops.filter(x=>x.crop_status==='complete').length;
      statusNode.textContent=`완료: 상품 이미지 ${complete}개 생성 · 저장 ${saved.updated||0}개`;
      if(window.P011SmartFlyerCenter?.load)await window.P011SmartFlyerCenter.load();
      if(window.P010SmartFlyer?.load)await window.P010SmartFlyer.load();
      return {ok:true,complete,updated:saved.updated||0,crops};
    }catch(e){
      statusNode.textContent=`상품 이미지 생성 실패: ${e.message}`;
      alert(`상품 이미지 생성 실패: ${e.message}`);
      return {ok:false,error:e.message,complete:0,updated:0};
    }finally{
      button.disabled=false;
      button.textContent=old;
    }
  }

  function enhanceCards(){
    ensureStyle();
    document.querySelectorAll('#p011List .p011-card').forEach(card=>{
      if(card.dataset.p016Enhanced==='1')return;
      card.dataset.p016Enhanced='1';
      const id=Number(card.querySelector('[data-id]')?.dataset.id||0);
      const actions=card.querySelector('.p011-actions');
      if(!id||!actions)return;

      const btn=document.createElement('button');
      btn.type='button';
      btn.className='btn p016-crop-btn';
      btn.textContent='상품 이미지 자동 생성';

      const status=document.createElement('div');
      status.className='p016-crop-status';
      status.textContent='AI가 찾은 상품 위치를 이용해 대표상품 이미지를 자동으로 만듭니다.';

      btn.addEventListener('click',()=>cropFlyer(id,btn,status));
      actions.appendChild(btn);
      actions.insertAdjacentElement('afterend',status);
    });
  }

  document.addEventListener('DOMContentLoaded',()=>{
    setTimeout(enhanceCards,1700);
    new MutationObserver(enhanceCards).observe(document.body,{childList:true,subtree:true});
  });

  window.P016SmartFlyerCrop={
    run:async(flyerId,onProgress)=>{
      const button={disabled:false,textContent:'자동 크롭'};
      const statusNode={
        _text:'',
        get textContent(){return this._text;},
        set textContent(value){
          this._text=String(value||'');
          if(typeof onProgress==='function')onProgress(this._text);
        }
      };
      return await cropFlyer(Number(flyerId),button,statusNode);
    }
  };

  console.info('[DalTownMap] P016 product image crop loaded');
})();

// === P017: 원본 전단 한 장 자동 게시 흐름 ===
(() => {
  function enhance(){
    const panel=document.getElementById('p010Panel');
    if(!panel || panel.querySelector('.p017-flow'))return;
    const flow=document.createElement('div');
    flow.className='p017-flow';
    flow.style.cssText='margin:10px 0;padding:10px 12px;border-radius:12px;background:#ecfdf3;color:#166534;font-size:12px;font-weight:800;line-height:1.65';
    flow.innerHTML='전단 1장 업로드 → AI 상품·가격 분석 → 상품 이미지 자동 생성 → 대표상품 우선 슬라이드 → 앱 메인 자동 노출';
    const actions=panel.querySelector('.p010-actions');
    actions?.insertAdjacentElement('beforebegin',flow);
  }
  document.addEventListener('DOMContentLoaded',()=>{
    setTimeout(enhance,1400);
    new MutationObserver(enhance).observe(document.body,{childList:true,subtree:true});
  });
  console.info('[DalTownMap] P017 one-click Smart Flyer workflow loaded');
})();

// === P018: 통합 스마트 전단 설치 상태 안내 ===
(() => {
  function addNotice(){
    const panel=document.getElementById('p010Panel');
    if(!panel || panel.querySelector('.p018-install-note'))return;
    const note=document.createElement('div');
    note.className='p018-install-note';
    note.style.cssText='margin:9px 0;padding:9px 11px;border-radius:11px;background:#eff6ff;color:#1e40af;font-size:12px;line-height:1.55';
    note.innerHTML='<b>P018 통합 버전</b> · 최초 1회 Supabase에서 <code>P018_AI_Smart_Flyer_MASTER.sql</code>을 실행해야 상품 이미지 자동 생성이 작동합니다.';
    panel.querySelector('.p017-flow')?.insertAdjacentElement('afterend',note);
  }
  document.addEventListener('DOMContentLoaded',()=>{
    setTimeout(addNotice,1300);
    new MutationObserver(addNotice).observe(document.body,{childList:true,subtree:true});
  });
  console.info('[DalTownMap] P018 integrated Smart Flyer admin loaded');
})();

// === P019: 메인 상품 슬라이드 상태 안내 ===
(() => {
  function enhance(){
    document.querySelectorAll('#p011List .p011-card').forEach(card=>{
      if(card.querySelector('.p019-ui-note'))return;
      const live=card.querySelector('.p012-live');
      if(!live)return;
      const note=document.createElement('div');
      note.className='p019-ui-note';
      note.style.cssText='margin-top:8px;padding:9px 11px;border-radius:10px;background:#fff7ed;color:#9a3412;font-size:12px;font-weight:800';
      note.textContent='메인에서는 상품 이미지 2개씩 자동 슬라이드되며, 화살표와 좌우 스와이프도 지원합니다.';
      live.closest('.p011-card-top')?.insertAdjacentElement('afterend',note);
    });
  }
  document.addEventListener('DOMContentLoaded',()=>{
    setTimeout(enhance,1500);
    new MutationObserver(enhance).observe(document.body,{childList:true,subtree:true});
  });
  console.info('[DalTownMap] P019 final slider status loaded');
})();

// === P020: 기존 전단 상품 이미지 재분석 ===
(() => {
  const el=id=>document.getElementById(id);

  async function run(flyerId,button,status){
    const old=button.textContent;
    button.disabled=true;
    try{
      status.textContent='1/3 기존 전단에서 상품 위치를 다시 찾고 있습니다...';
      button.textContent='재분석 중...';

      const result=await newsroomEdgeCall('reanalyze_weekly_flyer_positions',{
        id:Number(flyerId),region:getAppRegion()
      });

      const found=Number(result.positions_updated||0);
      const returned=Number(result.matches_returned||0);
      if(found<1){
        throw new Error(
          `AI 응답 ${returned}건을 받았지만 유효한 상품 위치를 찾지 못했습니다. `+
          `원본 전단 해상도와 Edge Function P021 배포 상태를 확인하세요.`
        );
      }

      status.textContent=`2/3 상품 위치 ${found}개 확인 · 이미지를 생성하고 있습니다...`;

      if(!window.P016SmartFlyerCrop?.run){
        throw new Error('상품 이미지 생성 모듈이 없습니다. 관리자 파일을 다시 배포하세요.');
      }
      const crop=await window.P016SmartFlyerCrop.run(Number(flyerId),message=>{
        status.textContent=`2/3 ${message}`;
      });

      status.textContent='3/3 앱 메인 연결을 갱신하고 있습니다...';
      await newsroomEdgeCall('activate_weekly_flyer',{id:Number(flyerId)});

      try{
        localStorage.setItem('daltownmap_content_changed',String(Date.now()));
        localStorage.removeItem('daltownmap_v38_home');
      }catch{}
      try{
        const bc=new BroadcastChannel('daltownmap-content');
        bc.postMessage({type:'weekly_flyer_changed',flyer_id:Number(flyerId),at:Date.now()});
        bc.close();
      }catch{}

      status.textContent=`완료: 위치 ${result.positions_updated||0}개 · 상품 이미지 ${crop.complete||0}개 · 메인 슬라이드 연결됨`;
      if(window.P011SmartFlyerCenter?.load)await window.P011SmartFlyerCenter.load();
      if(window.P010SmartFlyer?.load)await window.P010SmartFlyer.load();
      alert(`기존 전단 재분석 완료\n상품 위치 ${result.positions_updated||0}개\n상품 이미지 ${crop.complete||0}개`);
    }catch(e){
      status.textContent=`재분석 실패: ${e.message}`;
      alert(`기존 전단 재분석 실패: ${e.message}`);
    }finally{
      button.disabled=false;
      button.textContent=old;
    }
  }

  function enhance(){
    document.querySelectorAll('#p011List .p011-card').forEach(card=>{
      if(card.dataset.p020==='1')return;
      card.dataset.p020='1';
      const id=Number(card.querySelector('[data-id]')?.dataset.id||0);
      const actions=card.querySelector('.p011-actions');
      if(!id||!actions)return;

      const button=document.createElement('button');
      button.type='button';
      button.className='btn';
      button.style.cssText='background:#fff7ed;color:#9a3412;border:1px solid #fed7aa';
      button.textContent='기존 전단 상품 이미지 재분석';

      const status=document.createElement('div');
      status.style.cssText='margin-top:8px;padding:9px 11px;border-radius:10px;background:#eff6ff;color:#1d4ed8;font-size:12px;font-weight:800';
      status.textContent='기존 원본을 다시 업로드하지 않고 AI가 상품 위치를 다시 찾은 뒤 상품 이미지를 생성합니다. P021 Edge Function 재배포가 필요합니다.';

      button.addEventListener('click',()=>run(id,button,status));
      actions.appendChild(button);
      actions.insertAdjacentElement('afterend',status);
    });
  }

  document.addEventListener('DOMContentLoaded',()=>{
    setTimeout(enhance,1600);
    new MutationObserver(enhance).observe(document.body,{childList:true,subtree:true});
  });

  console.info('[DalTownMap] P020 existing flyer reanalysis loaded');
})();
console.info('[DalTownMap] P021 reanalysis index-mapping fix loaded');

// === P022: 관리자 중복 노출 안내 ===
(() => {
  function enhance(){
    document.querySelectorAll('#p011List .p011-card').forEach(card=>{
      if(card.querySelector('.p022-note'))return;
      const live=card.querySelector('.p012-live');
      if(!live)return;
      const note=document.createElement('div');
      note.className='p022-note';
      note.style.cssText='margin-top:8px;padding:9px 11px;border-radius:10px;background:#eefdf6;color:#166534;font-size:12px;font-weight:800';
      note.textContent='동일 전단은 앱 메인에서 1회만 노출되도록 중복 제거가 적용됩니다.';
      live.closest('.p011-card-top')?.insertAdjacentElement('afterend',note);
    });
  }
  document.addEventListener('DOMContentLoaded',()=>{
    setTimeout(enhance,1500);
    new MutationObserver(enhance).observe(document.body,{childList:true,subtree:true});
  });
  console.info('[DalTownMap] P022 duplicate-status notice loaded');
})();

// === P023: 메인 단일 전단 피드 안내 ===
(() => {
  function enhance(){
    document.querySelectorAll('#p011List .p011-card').forEach(card=>{
      if(card.querySelector('.p023-note'))return;
      const live=card.querySelector('.p012-live');
      if(!live)return;

      const note=document.createElement('div');
      note.className='p023-note';
      note.style.cssText='margin-top:8px;padding:9px 11px;border-radius:10px;background:#eef4ff;color:#1d4ed8;font-size:12px;font-weight:800';
      note.textContent='앱 메인은 공개 전단 피드에서 이 전단을 한 번만 불러오며, 상품 이미지가 있으면 상품 슬라이드로 표시합니다.';
      live.closest('.p011-card-top')?.insertAdjacentElement('afterend',note);
    });
  }

  document.addEventListener('DOMContentLoaded',()=>{
    setTimeout(enhance,1500);
    new MutationObserver(enhance).observe(document.body,{childList:true,subtree:true});
  });

  console.info('[DalTownMap] P023 canonical-feed notice loaded');
})();

// === P024: 메인 레이아웃 충돌 수정 안내 ===
(() => {
  function enhance(){
    document.querySelectorAll('#p011List .p011-card').forEach(card=>{
      if(card.querySelector('.p024-note'))return;
      const live=card.querySelector('.p012-live');
      if(!live)return;

      const note=document.createElement('div');
      note.className='p024-note';
      note.style.cssText='margin-top:8px;padding:9px 11px;border-radius:10px;background:#f0fdf4;color:#166534;font-size:12px;font-weight:800';
      note.textContent='메인 전단 카드는 기존 카드 요소를 완전히 가리고 상품 이미지 전용 고정 레이아웃으로 표시됩니다.';
      live.closest('.p011-card-top')?.insertAdjacentElement('afterend',note);
    });
  }

  document.addEventListener('DOMContentLoaded',()=>{
    setTimeout(enhance,1500);
    new MutationObserver(enhance).observe(document.body,{childList:true,subtree:true});
  });

  console.info('[DalTownMap] P024 final-layout notice loaded');
})();



// === P126: 메인 한 줄 광고 다중 관리자 입력 ===
(() => {
  let items=[];
  let loadedConfig={};
  const el=id=>document.getElementById(id);
  const val=id=>String(el(id)?.value||'').trim();
  const checked=id=>!!el(id)?.checked;
  const esc126=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function reset(){
    if(el('p126ManualId')) el('p126ManualId').value='';
    if(el('p126ManualTitle')) el('p126ManualTitle').value='';
    if(el('p126ManualType')) el('p126ManualType').value='business';
    if(el('p126ManualPriority')) el('p126ManualPriority').value='0';
    if(el('p126ManualStart')) el('p126ManualStart').value='';
    if(el('p126ManualEnd')) el('p126ManualEnd').value='';
    if(el('p126ManualLinkType')) el('p126ManualLinkType').value='url';
    if(el('p126ManualLinkValue')) el('p126ManualLinkValue').value='';
    if(el('p126ManualEnabled')) el('p126ManualEnabled').checked=true;
    setTimeout(()=>window.P131TickerLinkPicker?.render?.(false),0);
  }

  function render(){
    const box=el('p126ManualList'); if(!box)return;
    if(el('p126ManualCount')) el('p126ManualCount').textContent=`${items.length}개`;
    if(!items.length){box.innerHTML='<div class="muted">등록된 관리자 문구가 없습니다.</div>';return;}
    const labels={business:'업체 광고',event:'행사 안내',notice:'공지',other:'기타'};
    box.innerHTML=items.map((x,i)=>`<div class="business-row" style="align-items:center;gap:12px">
      <div style="flex:1;min-width:0"><strong>${esc126(x.title)}</strong><div class="muted" style="margin-top:4px">${esc126(labels[x.type]||'기타')} · ${x.enabled===false?'중지':'노출'}${x.start_date||x.end_date?` · ${esc126(x.start_date||'시작 제한 없음')} ~ ${esc126(x.end_date||'종료 제한 없음')}`:''}</div></div>
      <button class="btn ghost" type="button" data-p126-edit="${i}">수정</button>
      <button class="btn danger" type="button" data-p126-delete="${i}">삭제</button>
    </div>`).join('');
    box.querySelectorAll('[data-p126-edit]').forEach(btn=>btn.onclick=()=>edit(Number(btn.dataset.p126Edit)));
    box.querySelectorAll('[data-p126-delete]').forEach(btn=>btn.onclick=()=>{items.splice(Number(btn.dataset.p126Delete),1);render();});
  }

  function edit(i){
    const x=items[i]; if(!x)return;
    el('p126ManualId').value=x.id||'';
    el('p126ManualTitle').value=x.title||'';
    el('p126ManualType').value=x.type||'business';
    el('p126ManualPriority').value=Number(x.priority||0);
    el('p126ManualStart').value=x.start_date||'';
    el('p126ManualEnd').value=x.end_date||'';
    el('p126ManualLinkType').value=x.link_type||'url';
    el('p126ManualLinkValue').value=x.link_value||x.url||'';
    el('p126ManualEnabled').checked=x.enabled!==false;
    setTimeout(()=>window.P131TickerLinkPicker?.render?.(true),0);
    el('p126ManualTitle')?.focus();
  }

  function saveItem(){
    const title=val('p126ManualTitle'); if(!title){alert('표시 문구를 입력하세요.');return;}
    const start=val('p126ManualStart'), end=val('p126ManualEnd');
    if(start&&end&&end<start){alert('종료일은 시작일보다 빠를 수 없습니다.');return;}
    const id=val('p126ManualId')||`manual-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
    const row={id,title,type:val('p126ManualType')||'business',priority:Number(val('p126ManualPriority')||0),start_date:start||null,end_date:end||null,link_type:val('p126ManualLinkType')||'none',link_value:val('p126ManualLinkValue')||'',enabled:checked('p126ManualEnabled'),updated_at:new Date().toISOString()};
    const index=items.findIndex(x=>String(x.id)===id);
    if(index>=0) items[index]=row; else items.push(row);
    items.sort((a,b)=>Number(b.priority||0)-Number(a.priority||0));
    reset(); render();
  }

  async function load(){
    const result=await newsroomEdgeCall('get_settings',{region:getAppRegion()},'한 줄 광고 설정을 불러오는 중…');
    loadedConfig=result?.settings?.home_config||result?.home_config||{};
    items=Array.isArray(loadedConfig.ticker_manual_items)?loadedConfig.ticker_manual_items.map(x=>({...x})):[];
    render(); reset();
  }

  async function saveAll(){
    const btn=el('p126ManualSaveAllBtn'); if(btn)btn.disabled=true;
    try{
      const latest=await newsroomEdgeCall('get_settings',{region:getAppRegion()},'현재 메인 설정 확인 중…');
      const current=latest?.settings?.home_config||latest?.home_config||loadedConfig||{};
      const home_config={...current,
        show_ticker_section:true,
        show_community_section:false,
        ticker_manual_items:items,
        // P126부터 과거 자동 DalPick/쿠폰 및 단일 직접입력은 메인 ticker에서 사용하지 않습니다.
        ticker_sources:[],
        ticker_direct:{enabled:false,text:'',label:'',url:'',updated_at:new Date().toISOString()},
        updated_at:new Date().toISOString()
      };
      await newsroomEdgeCall('save_settings',{region:getAppRegion(),home_config},'메인 한 줄 광고 저장 중…');
      loadedConfig=home_config;
      try{localStorage.setItem('daltownmap_content_changed',String(Date.now()));}catch(_){ }
      try{const bc=new BroadcastChannel('daltownmap-content');bc.postMessage({type:'home_ticker_changed'});bc.close();}catch(_){ }
      alert(`저장되었습니다. 관리자 입력 ${items.length}개 + 날씨·교통 자동 노출`);
    }catch(error){alert(`저장 실패: ${error.message||error}`);}
    finally{if(btn)btn.disabled=false;}
  }

  function bind(){
    if(!el('p126TickerManager')) return;
    el('p126ManualSaveBtn').onclick=saveItem;
    el('p126ManualResetBtn').onclick=reset;
    el('p126ManualSaveAllBtn').onclick=saveAll;
    load().catch(e=>{console.warn('[P126 admin ticker load]',e);const box=el('p126ManualList');if(box)box.innerHTML='<div class="muted">설정을 불러오지 못했습니다.</div>';});
  }

  document.addEventListener('DOMContentLoaded',()=>setTimeout(bind,500));
  console.info('[DalTownMap Admin] P126 multi manual ticker manager loaded');
})();



// === P127C: 메인 이미지 2장 모달 자체 스타일 ===
(() => {
  if(document.getElementById('p127DualMarketModalStyle')) return;
  const style=document.createElement('style');
  style.id='p127DualMarketModalStyle';
  style.textContent=`
    #p127DualMarketModal{
      position:fixed!important;
      inset:0!important;
      z-index:999999!important;
      display:none!important;
      align-items:center!important;
      justify-content:center!important;
      padding:24px!important;
      background:rgba(15,23,42,.58)!important;
      backdrop-filter:blur(2px)!important;
    }
    #p127DualMarketModal.open{
      display:flex!important;
    }
    #p127DualMarketModal .p057-card{
      position:relative!important;
      width:min(980px,calc(100vw - 32px))!important;
      max-height:calc(100vh - 48px)!important;
      overflow:auto!important;
      padding:24px!important;
      border-radius:22px!important;
      background:#fff!important;
      box-shadow:0 28px 80px rgba(15,23,42,.28)!important;
    }
    #p127DualMarketModal .p057-close{
      position:absolute!important;
      top:14px!important;
      right:14px!important;
      width:38px!important;
      height:38px!important;
      border:0!important;
      border-radius:12px!important;
      background:#eef4ff!important;
      color:#184ea8!important;
      font-size:24px!important;
      font-weight:800!important;
      cursor:pointer!important;
    }
    #p127DualMarketModal input[type=file]{
      width:100%!important;
    }
    @media(max-width:640px){
      #p127DualMarketModal{padding:10px!important;align-items:flex-start!important;overflow:auto!important}
      #p127DualMarketModal .p057-card{width:100%!important;max-height:none!important;margin:10px 0!important;padding:18px!important}
    }
  `;
  (document.head||document.documentElement).appendChild(style);
})();

// === P127: 전단 메인 이미지 2장 관리자 ===
(() => {
  let flyerId=0;
  let files={1:null,2:null};
  const $=id=>document.getElementById(id);
  const fileToBase64=file=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>{const s=String(r.result||'');resolve(s.slice(s.indexOf(',')+1));};r.onerror=()=>reject(r.error);r.readAsDataURL(file);});

  function ensureModal(){
    let modal=$('p127DualMarketModal');if(modal)return modal;
    modal=document.createElement('div');modal.id='p127DualMarketModal';modal.className='p057-modal';
    modal.innerHTML=`<div class="p057-card" style="max-width:980px"><button type="button" class="p057-close" data-p127-close>×</button><h2>메인 마트 이미지 2장</h2><p class="muted">각 전단마다 1200 × 420 이미지를 최대 2장 올릴 수 있습니다. 메인에서는 두 이미지가 자동 슬라이드됩니다.</p><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px;margin-top:16px">${[1,2].map(slot=>`<section style="border:1px solid #dbe3ee;border-radius:16px;padding:14px"><h3 style="margin:0 0 10px">이미지 ${slot}</h3><input id="p127File${slot}" type="file" accept="image/jpeg,image/png,image/webp"><div id="p127Preview${slot}" style="margin-top:10px;aspect-ratio:20/7;border:1px dashed #b9c8df;border-radius:12px;display:grid;place-items:center;overflow:hidden;background:#f8fbff"><span>1200 × 420</span><img style="width:100%;height:100%;object-fit:cover;display:none"></div><div style="display:flex;gap:8px;margin-top:10px"><button type="button" class="btn primary" data-p127-save="${slot}">이미지 ${slot} 저장</button><button type="button" class="btn" data-p127-clear="${slot}">제거</button></div><div id="p127Status${slot}" class="muted" style="margin-top:7px"></div></section>`).join('')}</div></div>`;
    document.body.appendChild(modal);
    modal.querySelector('[data-p127-close]').onclick=close;
    modal.addEventListener('click',e=>{if(e.target===modal)close();});
    [1,2].forEach(slot=>{
      $(`p127File${slot}`).addEventListener('change',e=>onFile(slot,e.target.files?.[0]||null));
      modal.querySelector(`[data-p127-save="${slot}"]`).onclick=()=>save(slot);
      modal.querySelector(`[data-p127-clear="${slot}"]`).onclick=()=>clear(slot);
    });
    return modal;
  }
  function close(){const m=$('p127DualMarketModal');if(m){m.classList.remove('open');m.style.display='';}document.body.style.overflow='';files={1:null,2:null};}
  function open(id){flyerId=Number(id||0);files={1:null,2:null};const m=ensureModal();[1,2].forEach(slot=>{const inp=$(`p127File${slot}`);if(inp)inp.value='';const p=$(`p127Preview${slot}`);const img=p?.querySelector('img'),sp=p?.querySelector('span');if(img){img.removeAttribute('src');img.style.display='none';}if(sp)sp.style.display='block';const st=$(`p127Status${slot}`);if(st)st.textContent='';});m.classList.add('open');document.body.style.overflow='hidden';console.info('[P127C modal open]',{flyerId});}
  function onFile(slot,file){files[slot]=file;if(!file)return;const url=URL.createObjectURL(file);const p=$(`p127Preview${slot}`),img=p?.querySelector('img'),sp=p?.querySelector('span');if(img){img.src=url;img.style.display='block';}if(sp)sp.style.display='none';const probe=new Image();probe.onload=()=>{$(`p127Status${slot}`).textContent=`선택: ${probe.naturalWidth} × ${probe.naturalHeight}px${probe.naturalWidth===1200&&probe.naturalHeight===420?' · 권장 규격':''}`;};probe.src=url;}
  async function save(slot){const file=files[slot];if(!flyerId||!file)return alert(`이미지 ${slot}를 선택하세요.`);const st=$(`p127Status${slot}`);st.textContent='업로드 중…';try{const result=await newsroomEdgeCall('upload_weekly_flyer_main_image',{flyer_id:flyerId,slot,file_name:file.name||`market-${slot}.jpg`,content_type:file.type||'image/jpeg',image_base64:await fileToBase64(file)});const url=slot===2?result?.market_main_image_url_2:result?.market_main_image_url;if(!String(url||'').toLowerCase().startsWith('http'))throw new Error('이미지 URL이 저장되지 않았습니다.');st.textContent=`이미지 ${slot} 저장 완료`;try{localStorage.setItem('daltownmap_content_changed',String(Date.now()));const bc=new BroadcastChannel('daltownmap-content');bc.postMessage({type:'weekly_flyer_main_image_changed',flyer_id:flyerId,slot});bc.close();}catch(_){}}catch(e){st.textContent=`저장 실패: ${e.message||e}`;alert(st.textContent);}}
  async function clear(slot){if(!flyerId||!confirm(`이미지 ${slot}를 제거할까요?`))return;const st=$(`p127Status${slot}`);try{const payload={flyer_id:flyerId,slot,market_main_image_url:null};await newsroomEdgeCall('save_weekly_flyer_main_image',payload);st.textContent=`이미지 ${slot} 제거 완료`;try{localStorage.setItem('daltownmap_content_changed',String(Date.now()));}catch(_){}}catch(e){st.textContent=`제거 실패: ${e.message||e}`;}}
  function inject(){
    document.querySelectorAll('#p011List .p011-card, #p010List .p010-card').forEach(card=>{
      const id=
        card.querySelector('[data-p011-status][data-id]')?.dataset.id ||
        card.querySelector('[data-p011-home][data-id]')?.dataset.id ||
        card.querySelector('[data-p010-act][data-id]')?.dataset.id ||
        card.querySelector('[data-id]')?.dataset.id ||
        '';
      if(!id)return;

      const actions=
        card.querySelector('.p011-actions') ||
        card.querySelector('.p010-card-actions') ||
        card;

      if(actions.querySelector('.p127-dual-image-btn'))return;

      const b=document.createElement('button');
      b.type='button';
      b.className='btn p127-dual-image-btn';
      b.textContent='메인 이미지 2장';
      b.style.cssText='background:#eef4ff;color:#1d4ed8;border:1px solid #cfe0ff;font-weight:800';
      b.onclick=e=>{
        e.preventDefault();
        e.stopPropagation();
        open(id);
      };
      actions.appendChild(b);
    });
  }
  new MutationObserver(()=>inject()).observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',()=>{ensureModal();setTimeout(inject,700);});
  window.P127DualMarketImages={open,inject};
  console.info('[DalTownMap Admin] P127 dual market image manager loaded');
})();

console.info('[DalTownMap Admin] P127A browser regex fix loaded');

console.info('[DalTownMap Admin] P127B flyer-card selector fix loaded');

console.info('[DalTownMap Admin] P127C modal visibility fix loaded');


// === P131: 한 줄 광고 연결 방식별 하위 메뉴 ===
(() => {
  const $=id=>document.getElementById(id);
  const esc131=s=>String(s||'').replace(/[&<>"']/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));

  const INTERNAL_PAGES=[
    ['business-register','업소 등록 신청'],
    ['advertise','게시판 및 광고 문의'],
    ['business','업소 목록'],
    ['coupon','쿠폰'],
    ['map','지도'],
    ['guide','달라스 가이드'],
    ['home','홈']
  ];

  function businessOptions(){
    return (Array.isArray(businesses)?businesses:[])
      .slice()
      .sort((a,b)=>String(a.name_ko||a.name||'').localeCompare(String(b.name_ko||b.name||''),'ko'))
      .map(b=>[
        String(b.id||''),
        `${String(b.name_ko||b.name||b.name_en||'업소명 없음')} · ${String(b.area||b.city||'').trim()}`.replace(/\s+·\s*$/,'')
      ])
      .filter(x=>x[0]);
  }

  function boardOptions(){
    return (Array.isArray(boards)?boards:[])
      .filter(p=>p && p.id)
      .slice()
      .sort((a,b)=>Date.parse(b.created_at||b.updated_at||0)-Date.parse(a.created_at||a.updated_at||0))
      .map(p=>[
        String(p.id),
        `[${String(p.type||p.category||'게시글')}] ${String(p.title||'제목 없음')}`
      ]);
  }

  function couponOptions(){
    return (Array.isArray(coupons)?coupons:[])
      .filter(c=>c && c.id)
      .map(c=>{
        const biz=(Array.isArray(businesses)?businesses:[]).find(b=>String(b.id)===String(c.business_id||c.businessId));
        const bizName=String(biz?.name_ko||biz?.name||'').trim();
        return [String(c.id), `${String(c.title||c.name||'쿠폰')}${bizName?` · ${bizName}`:''}`];
      });
  }

  function guideOptions(){
    const pools=[
      Array.isArray(window.guides)?window.guides:[],
      Array.isArray(window.guideItems)?window.guideItems:[],
      Array.isArray(window.guidePosts)?window.guidePosts:[],
      Array.isArray(typeof guides!=='undefined'?guides:[])?(typeof guides!=='undefined'?guides:[]):[]
    ];
    const merged=[];
    const seen=new Set();
    for(const pool of pools){
      for(const g of pool){
        const id=String(g?.id||g?.guide_id||g?.slug||'').trim();
        if(!id||seen.has(id))continue;
        seen.add(id);
        const category=String(g?.category||g?.type||g?.section||'가이드').trim();
        const title=String(g?.title||g?.name||g?.subject||'제목 없음').trim();
        merged.push([id,`[${category}] ${title}`]);
      }
    }

    // DOM에 이미 렌더된 가이드 카드에서도 fallback 수집
    document.querySelectorAll('[data-guide-id],[data-guide-detail-id]').forEach(node=>{
      const id=String(node.dataset.guideId||node.dataset.guideDetailId||'').trim();
      if(!id||seen.has(id))return;
      seen.add(id);
      const title=String(
        node.querySelector('h3,h4,strong,.title,.guide-title')?.textContent ||
        node.textContent || '가이드 항목'
      ).replace(/\s+/g,' ').trim();
      merged.push([id,title]);
    });

    return merged.sort((a,b)=>a[1].localeCompare(b[1],'ko'));
  }

  function renderPicker(preserveValue=true){
    const type=String($('p126ManualLinkType')?.value||'url');
    const input=$('p126ManualLinkValue');
    const select=$('p131ManualLinkPicker');
    const label=$('p131LinkPickerLabel');
    const help=$('p131LinkPickerHelp');
    if(!input||!select)return;

    const current=preserveValue?String(input.value||select.value||'').trim():'';
    let options=[];
    let useSelect=false;

    if(type==='business'){
      label.textContent='업소 선택';
      help.textContent='메인에서 클릭하면 선택한 업소 상세로 이동합니다.';
      options=businessOptions();
      useSelect=true;
    }else if(type==='board'){
      label.textContent='게시글 선택';
      help.textContent='게시판에 등록된 글 중 연결할 게시글을 선택합니다.';
      options=boardOptions();
      useSelect=true;
    }else if(type==='coupon'){
      label.textContent='쿠폰 선택';
      help.textContent='등록된 쿠폰 중 연결할 쿠폰을 선택합니다.';
      options=couponOptions();
      useSelect=true;
    }else if(type==='internal'){
      label.textContent='앱 화면 선택';
      help.textContent='도메인 주소를 입력하지 않고 앱 내부 화면으로 바로 이동합니다.';
      options=INTERNAL_PAGES;
      useSelect=true;
    }else if(type==='guide'){
      label.textContent='달라스 가이드 항목';
      help.textContent='연결할 달라스 가이드 세부 항목을 선택합니다.';
      options=guideOptions();
      if(!options.length) options=[['','등록된 가이드 항목이 없습니다']];
      useSelect=true;
    }else if(type==='none'){
      label.textContent='연결 대상';
      help.textContent='클릭해도 이동하지 않습니다.';
      input.value='';
      input.disabled=true;
      input.style.display='block';
      select.style.display='none';
      return;
    }else{
      label.textContent='외부 URL';
      help.textContent='https:// 로 시작하는 주소를 입력하세요.';
      input.disabled=false;
      input.style.display='block';
      select.style.display='none';
      input.placeholder='https://example.com';
      if(current) input.value=current;
      return;
    }

    input.disabled=false;
    select.innerHTML='<option value="">선택하세요</option>'+options.map(([value,text])=>
      `<option value="${esc131(value)}">${esc131(text)}</option>`
    ).join('');

    if(current && [...select.options].some(o=>String(o.value)===current)){
      select.value=current;
    }else if(options.length===1){
      select.value=options[0][0];
    }

    input.value=select.value||current||'';
    input.style.display='none';
    select.style.display='block';
  }

  function syncPickerToValue(){
    const input=$('p126ManualLinkValue');
    const select=$('p131ManualLinkPicker');
    if(input&&select&&select.style.display!=='none'){
      input.value=select.value||'';
    }
  }

  function bind(){
    const type=$('p126ManualLinkType');
    const select=$('p131ManualLinkPicker');
    if(!type||!select)return;

    type.addEventListener('change',()=>renderPicker(false));
    select.addEventListener('change',syncPickerToValue);

    // 기존 P126 저장 버튼보다 먼저 hidden value를 맞춥니다.
    $('p126ManualSaveBtn')?.addEventListener('click',syncPickerToValue,{capture:true});

    // boards/businesses/coupons가 늦게 로드되는 경우 목록 갱신
    window.addEventListener('kfocus:boards-loaded',()=>renderPicker(true));
    setInterval(()=>{
      if(document.getElementById('section-dalpick')?.classList.contains('active') ||
         !document.getElementById('section-dalpick')?.classList.contains('hidden')){
        const typeNow=String(type.value||'');
        if(['business','board','coupon','guide'].includes(typeNow)) renderPicker(true);
      }
    },4000);

    renderPicker(true);
  }

  // 기존 수정 버튼이 값을 채운 직후에도 contextual select가 맞춰지도록 감시
  const observer=new MutationObserver(()=>{
    if($('p126ManualLinkType')&&$('p131ManualLinkPicker')) renderPicker(true);
  });

  document.addEventListener('DOMContentLoaded',()=>{
    setTimeout(()=>{
      bind();
      const form=$('p126ManualForm');
      if(form) observer.observe(form,{subtree:true,attributes:true,attributeFilter:['value']});
    },800);
  });

  window.P131TickerLinkPicker={render:renderPicker,sync:syncPickerToValue};
  console.info('[DalTownMap Admin] P131 contextual ticker link picker loaded');
})();

console.info('[DalTownMap Admin] P132 guide detail picker loaded');
