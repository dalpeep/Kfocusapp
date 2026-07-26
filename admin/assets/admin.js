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
  'id', 'name_ko', 'name_en', 'category_ko', 'area', 'region', 'phone',
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

  updatePreview();
  renderGalleryList(row);
  fillBusinessHours(row?.business_hours);
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
    const hay = [r.name_ko, r.name_en, r.category_ko, r.area, r.address, r.phone].join(' ').toLowerCase();
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
        <div class="biz-meta">${esc([row.category_ko, row.area, row.phone].filter(Boolean).join(' · '))}</div>
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
  if (!payload.category_ko) return alert('카테고리를 입력해 주세요.');

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
    'id,title,content,type,subtype,region,image_url,image_link_url,gallery_urls,video_url,external_url,link_label,author_name,address,phone,business_id,start_at,end_at,is_active,created_at',
    'id,title,content,type,subtype,region,image_url,image_link_url,gallery_urls,video_url,external_url,link_label,author_name,address,phone,start_at,end_at,is_active,created_at',
    'id,title,content,type,subtype,region,image_url,image_link_url,gallery_urls,video_url,external_url,link_label,author_name,start_at,end_at,is_active,created_at'
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
          <div class="biz-title">${esc(row.title || '게시글')}</div>
          <div class="biz-meta">${esc(boardLabel(row.type))}${row.subtype ? ' · ' + esc(boardSubtypeLabel(row.subtype)) : ''} · ${esc(row.region || 'colorado')} ${row.is_active === false ? '· 비활성' : ''}</div>
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
  await loadBoards();
  if (res.data) fillBoardForm(res.data);
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
let selectedNewsroomId = null;
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
  newsroomItems=data||[]; safeText('newsroomStatus',`미처리 후보 ${newsroomItems.length}건 · 마지막 확인 ${new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}`); renderNewsroom(); loadNewsroomRunStatus();
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
function v481RenderCollectedPreview(){
  const box=qs('v481CollectedPreview');
  if(!box)return;
  const items=(newsroomItems||[]).slice().sort((a,b)=>{
    const sa=v48SelectionSource(a), sb=v48SelectionSource(b);
    const rank={editor:3,scheduled:2,ai:1};
    return (rank[sb]||0)-(rank[sa]||0) || newsroomPriorityRank(b)-newsroomPriorityRank(a) || new Date(b.source_published_at||b.collected_at||0)-new Date(a.source_published_at||a.collected_at||0);
  }).slice(0,12);
  if(!items.length){
    box.innerHTML='<div class="newsroom-empty"><strong>오늘 수집된 기사가 아직 없습니다.</strong><span>오전 자동 수집 전이거나 수집 결과가 없는 경우입니다. ‘지금 다시 수집’ 또는 ‘오늘 자동 편성 실행’을 사용할 수 있습니다.</span></div>';
    return;
  }
  box.innerHTML=items.map(r=>{
    const [,categoryLabel]=v48ItemCategory(r);
    return `<button type="button" class="newsroom-item v481-collected-item" data-id="${esc(r.id)}" style="text-align:left;width:100%">
      <span class="newsroom-item-top"><strong><span class="pill">${esc(v48SourceBadge(r))}</span> <span class="pill">${esc(categoryLabel)}</span> ${esc(r.ai_title||r.original_title||'제목 없음')}</strong><span class="newsroom-destination">${esc(newsroomLabel(r.destination||r.suggested_destination))}</span></span>
      <span class="newsroom-item-meta">${esc(r.source_name||'출처 미상')} · ${esc(r.area||'Dallas')} · ${esc(newsroomLocalDate(r.source_published_at||r.collected_at))}</span>
      <span class="newsroom-item-summary">${esc((r.ai_summary||r.original_summary||'').slice(0,110))}</span>
    </button>`;
  }).join('');
  box.querySelectorAll('[data-id]').forEach(b=>b.addEventListener('click',()=>{
    const row=newsroomItems.find(x=>String(x.id)===String(b.dataset.id));
    if(row)fillNewsroom(row);
  }));
}
function renderNewsroom(){
  const counts={all:newsroomItems.length,collected:0,classified:0,review:0}; newsroomItems.forEach(r=>{if(counts[r.status]!==undefined)counts[r.status]++;});
  Object.entries(counts).forEach(([k,v])=>safeText('newsroomCount'+k[0].toUpperCase()+k.slice(1),String(v)));
  v48RenderCategorySummary();
  v48RenderCategorySummary(); v481RenderCollectedPreview();
  const items=filteredNewsroom(); safeText('newsroomListCount',`${items.length}개`); const box=qs('newsroomList'); if(!box)return;
  if(!items.length){box.innerHTML='<div class="newsroom-empty"><strong>처리할 후보가 없습니다.</strong><span>예정 기사가 없거나 일치하지 않아도 AI 자동 선별이 동작합니다.</span></div>';return;}
  box.innerHTML=items.map(r=>{const priority=newsroomPriority(r);const [categoryKey,categoryLabel]=v48ItemCategory(r);const editor=v48SelectionSource(r)==='editor';return `<div class="newsroom-item ${String(r.id)===String(selectedNewsroomId)?'active':''}" data-id="${esc(r.id)}"><span class="newsroom-item-top"><strong><span class="pill v48-source-badge">${esc(v48SourceBadge(r))}</span><span class="newsroom-item-priority ${priority}">${priority==='urgent'?'🔴':priority==='high'?'🟠':priority==='normal'?'🔵':'⚪'} ${esc(NEWSROOM_PRIORITY_LABELS[priority])}</span>${esc(r.ai_title||r.original_title)}</strong><span class="newsroom-destination ${(r.destination||r.suggested_destination)==='urgent'?'urgent':(r.destination||r.suggested_destination)==='exclude'?'exclude':''}">${esc(categoryLabel)} · ${esc(newsroomLabel(r.destination||r.suggested_destination))}</span></span><span class="newsroom-item-meta">${esc(r.source_name||'출처 미상')} · ${esc(r.area||'Dallas')} · ${esc(newsroomLocalDate(r.source_published_at||r.collected_at))}</span><span class="newsroom-item-summary">${esc((r.ai_summary||r.original_summary||'').slice(0,120))}</span><span style="display:flex;gap:8px;margin-top:8px"><button type="button" class="btn ghost" data-v48-open="${esc(r.id)}">검토</button><button type="button" class="btn ghost" data-v48-pick="${esc(r.id)}">${editor?'최우선 해제':'관리자 최우선'}</button></span></div>`;}).join('');
  box.querySelectorAll('[data-v48-open]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();const row=newsroomItems.find(x=>String(x.id)===String(b.dataset.v48Open));if(row)fillNewsroom(row);}));
  box.querySelectorAll('[data-v48-pick]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();const row=newsroomItems.find(x=>String(x.id)===String(b.dataset.v48Pick));if(row)v48SetEditorPick(row.id,v48SelectionSource(row)!=='editor');}));
  box.querySelectorAll('.newsroom-item').forEach(el=>el.addEventListener('click',()=>{const row=newsroomItems.find(x=>String(x.id)===String(el.dataset.id));if(row)fillNewsroom(row);}));
}
function guideSimilarity(a,b){const A=new Set(String(a||'').toLowerCase().match(/[a-z0-9가-힣]{2,}/g)||[]),B=new Set(String(b||'').toLowerCase().match(/[a-z0-9가-힣]{2,}/g)||[]);let hit=0;A.forEach(x=>{if(B.has(x))hit++});return hit/Math.max(1,Math.min(A.size,B.size));}
function newsroomGuideMatches(row){return boards.filter(b=>normalizeAdminBoardType(b.type)==='guide').map(b=>({...b,_score:guideSimilarity(`${row.ai_title} ${row.ai_summary}`,`${b.title} ${b.content}`)})).filter(b=>b._score>.12).sort((a,b)=>b._score-a._score).slice(0,5);}
function newsroomBusinessScore(b,keywords,area){const hay=[b.name_ko,b.name_en,b.category_ko,b.category,b.description,b.area,b.address].join(' ').toLowerCase();let score=0;keywords.forEach(k=>{if(hay.includes(String(k).toLowerCase()))score+=18});if(area&&hay.includes(String(area).toLowerCase()))score+=22;if(b.is_active!==false)score+=5;return Math.min(99,score);}
function renderNewsroomBusinesses(row){
  const keys=newsroomJson(row.category_keywords,[]); const chosen=new Set(newsroomJson(row.selected_business_ids,[]).map(String));
  qs('newsroomCategoryChips').innerHTML=keys.map(k=>`<span class="newsroom-chip">${esc(k)}</span>`).join('')||'<span class="muted">추천 업종 없음</span>';
  const candidates=businesses.map(b=>({b,score:newsroomBusinessScore(b,keys,row.area)})).filter(x=>x.score>=18).sort((a,b)=>b.score-a.score).slice(0,12);
  qs('newsroomBusinessCandidates').innerHTML=candidates.map(({b,score})=>`<label class="newsroom-business"><input type="checkbox" value="${esc(b.id)}" ${chosen.has(String(b.id))?'checked':''}><span><strong>${esc(b.name_ko||b.name_en||'업소')}</strong><small>${esc(b.category_ko||b.category||'')} · ${esc(b.area||'')}</small></span><span class="newsroom-relevance">관련도 ${score}%${b.rating?`<br>Google ${esc(b.rating)}`:''}</span></label>`).join('')||'<div class="muted">조건에 맞는 업소가 없습니다. 업종 키워드를 검토하세요.</div>';
}
function fillNewsroom(row){
  selectedNewsroomId=row.id; renderNewsroom(); qs('newsroomEmpty').hidden=true; qs('newsroomForm').hidden=false;
  setVal('newsroom_id',row.id); safeText('newsroomSourceKind',row.source_kind==='media'?'지역 언론':'공식기관'); safeText('newsroomOriginalTitle',row.original_title||'원문 제목'); safeText('newsroomMeta',`${row.source_name||''} · ${row.area||'Dallas'} · ${newsroomLocalDate(row.source_published_at)}`);
  const link=qs('newsroomOriginalLink'); link.href=row.original_url||'#'; setVal('newsroomSuggestedDestination',newsroomLabel(row.suggested_destination)); setVal('newsroomDestination',row.destination||row.suggested_destination||'life'); setVal('newsroomConfidence',`${row.confidence||0}%`); setVal('newsroomFactStatus',row.fact_status||'needs_review'); setVal('newsroomAiTitle',row.ai_title||''); setVal('newsroomAiSummary',row.ai_summary||''); setVal('newsroomAiContent',row.ai_content||''); setVal('newsroomClassificationReason',row.classification_reason||''); setVal('newsroomAdminNote',row.admin_note||''); safeText('newsroomOriginalSummary',row.original_summary||'원문 요약이 없습니다. 원문 보기에서 세부 내용을 확인하세요.'); const priority=newsroomPriority(row), priorityEl=qs('newsroomPriorityBadge');if(priorityEl){priorityEl.className=`newsroom-priority ${priority}`;priorityEl.textContent=NEWSROOM_PRIORITY_LABELS[priority];} safeText('newsroomDraftState',row.ai_content?'한국어 기사 초안이 준비되었습니다. 내용을 검토하거나 다시 작성할 수 있습니다.':row.status==='classified'?'AI 분류 완료. 한국어 기사 작성을 실행하세요.':'AI 분석과 한국어 기사 작성을 실행하세요.'); const prepareBtn=qs('newsroomPrepareItemBtn');if(prepareBtn)prepareBtn.textContent=row.ai_content?'AI 분석·기사 다시 만들기':'AI 분석·한국어 기사 만들기';
  const ev=newsroomJson(row.event_data,{}); setVal('newsroomEventName',ev.name||'');setVal('newsroomEventVenue',ev.venue||'');setVal('newsroomEventStart',fmtLocal(ev.start_at));setVal('newsroomEventEnd',fmtLocal(ev.end_at));setVal('newsroomEventAddress',ev.address||'');setVal('newsroomEventCost',ev.cost||'');setVal('newsroomEventOrganizer',ev.organizer||'');
  const matches=newsroomGuideMatches(row), sel=qs('newsroomExistingGuide'); sel.innerHTML='<option value="">기존 가이드 선택</option>'+matches.map(g=>`<option value="${esc(g.id)}">${esc(g.title)}</option>`).join(''); if(row.existing_guide_id)sel.value=String(row.existing_guide_id); safeText('newsroomGuideMatches',matches.length?`관련 기존 글 ${matches.length}개를 찾았습니다.`:'유사한 기존 가이드를 찾지 못했습니다.');
  const action=document.querySelector(`input[name="newsroomGuideAction"][value="${row.guide_action||'update'}"]`);if(action)action.checked=true; updateNewsroomSpecialBoxes(); renderNewsroomBusinesses(row); qs('newsroomForm').scrollIntoView({behavior:'smooth',block:'start'});
}
function updateNewsroomSpecialBoxes(){const d=val('newsroomDestination');qs('newsroomGuideBox').hidden=d!=='guide';qs('newsroomEventBox').hidden=d!=='notice';}
function newsroomSelectedBusinessIds(){return Array.from(qs('newsroomBusinessCandidates')?.querySelectorAll('input:checked')||[]).map(x=>x.value);}
function newsroomEventPayload(){return {name:val('newsroomEventName'),venue:val('newsroomEventVenue'),start_at:fromLocal(val('newsroomEventStart')),end_at:fromLocal(val('newsroomEventEnd')),address:val('newsroomEventAddress'),cost:val('newsroomEventCost'),organizer:val('newsroomEventOrganizer')};}
async function saveNewsroomReview(statusOverride){
  if(!selectedNewsroomId)return; const guideAction=document.querySelector('input[name="newsroomGuideAction"]:checked')?.value||null;
  const payload={destination:val('newsroomDestination'),fact_status:val('newsroomFactStatus'),ai_title:val('newsroomAiTitle').trim(),ai_summary:val('newsroomAiSummary').trim(),ai_content:val('newsroomAiContent').trim(),selected_business_ids:newsroomSelectedBusinessIds(),event_data:newsroomEventPayload(),guide_action:guideAction,existing_guide_id:val('newsroomExistingGuide')||null,admin_note:val('newsroomAdminNote').trim()||null,status:statusOverride||'review',reviewed_at:new Date().toISOString(),updated_at:new Date().toISOString()};
  const {error}=await supabase.from('newsroom_items').update(payload).eq('id',selectedNewsroomId);if(error)return alert(`검토 저장 실패: ${error.message}`);await loadNewsroom();const row=newsroomItems.find(x=>String(x.id)===String(selectedNewsroomId));if(row)fillNewsroom(row);return payload;
}
function newsroomRelatedBusinessBlock(ids){const rows=ids.map(id=>businesses.find(b=>String(b.id)===String(id))).filter(Boolean);if(!rows.length)return '';return `\n\n추천 업체\n${rows.map(b=>`• ${b.name_ko||b.name_en}${b.rating?` · Google ${b.rating}`:''}`).join('\n')}`;}
function newsroomEventBlock(ev){const parts=[ev.name&&`행사명: ${ev.name}`,ev.start_at&&`일시: ${new Date(ev.start_at).toLocaleString('ko-KR')}`,ev.venue&&`장소: ${ev.venue}`,ev.address&&`주소: ${ev.address}`,ev.cost&&`비용: ${ev.cost}`,ev.organizer&&`주최: ${ev.organizer}`].filter(Boolean);return parts.length?`\n\n행사 정보\n${parts.join('\n')}`:'';}
async function publishNewsroom(){
  if(!selectedNewsroomId)return; const saved=await saveNewsroomReview('review');if(!saved)return;let dest=saved.destination;if(dest==='exclude')return excludeNewsroom();
  const row=newsroomItems.find(x=>String(x.id)===String(selectedNewsroomId))||{}; let type=dest==='notice'?'notice':dest==='guide'?'guide':'life';let title=saved.ai_title; if(dest==='urgent'&&!/^🚨/.test(title))title=`🚨 ${title}`;
  if(dest==='guide'&&saved.guide_action==='life')type='life'; const ev=saved.event_data||{}; const ids=saved.selected_business_ids||[]; const sourceBlock=`\n\n출처: ${row.source_name||'공식기관'}\n원문 보기: ${row.original_url||''}`; const content=`${saved.ai_summary?`${saved.ai_summary}\n\n`:''}${saved.ai_content}${type==='notice'?newsroomEventBlock(ev):''}${newsroomRelatedBusinessBlock(ids)}${sourceBlock}`.trim();
  let postId=null,error=null;
  if(type==='guide'&&saved.guide_action==='update'&&saved.existing_guide_id){const res=await supabase.from(boardTable).update({title,content,external_url:row.original_url||null,link_label:'원문 보기',is_active:true}).eq('id',saved.existing_guide_id).select('id').single();postId=res.data?.id;error=res.error;}
  else {const res=await supabase.from(boardTable).insert({type,subtype:type==='life'?(dest==='urgent'?'local_news':null):null,region:getAppRegion(),title,content,external_url:row.original_url||null,link_label:'원문 보기',start_at:type==='notice'?(ev.start_at||new Date().toISOString()):new Date().toISOString(),end_at:type==='notice'?(ev.end_at||null):null,is_active:true,created_at:new Date().toISOString()}).select('id').single();postId=res.data?.id;error=res.error;}
  if(error)return alert(`게시 실패: ${error.message}`);
  const {error:deleteError}=await supabase.from('newsroom_items').delete().eq('id',selectedNewsroomId);if(deleteError)alert(`기사는 게시됐지만 수집 후보 정리에 실패했습니다: ${deleteError.message}`);else alert(`${newsroomLabel(dest)}에 게시하고 수집 후보에서 정리했습니다.`);selectedNewsroomId=null;qs('newsroomForm').hidden=true;qs('newsroomEmpty').hidden=false;await Promise.all([loadBoards(),loadNewsroom()]);
}
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
async function v48SetEditorPick(id,enabled=true){try{await newsroomEdgeCall('set_editor_pick',{id,enabled,region:getAppRegion()});await loadNewsroom();safeText('newsroomStatus',enabled?'관리자 최우선 기사로 지정했습니다.':'관리자 지정을 해제했습니다.');}catch(e){alert(e.message);}}

function initNewsroom(){
  const nav=qs('adminNav');if(!nav||!qs('section-newsroom'))return;
  qs('v48TopicSaveBtn')?.addEventListener('click',v48SaveTopic);qs('v48TopicResetBtn')?.addEventListener('click',v48ResetTopic);qs('v48AutoRunBtn')?.addEventListener('click',v48AutoRun);qs('v481CollectedRefreshBtn')?.addEventListener('click',loadNewsroom);qs('v481GoDetailBtn')?.addEventListener('click',()=>qs('newsroomList')?.scrollIntoView({behavior:'smooth',block:'start'}));qs('newsroomPrepareItemBtn')?.addEventListener('click',prepareNewsroomItem);qs('newsroomHealthBtn')?.addEventListener('click',()=>checkNewsroomHealth(true));qs('newsroomCollectBtn')?.addEventListener('click',collectNewsroom);qs('newsroomAutoEnabled')?.addEventListener('change',saveNewsroomAutoSetting);qs('newsroomAnalyzeAllBtn')?.addEventListener('click',analyzeCollectedNewsroom);qs('newsroomAnalyzeBtn')?.addEventListener('click',()=>analyzeNewsroomItem());qs('newsroomDraftBtn')?.addEventListener('click',draftNewsroomItem);qs('newsroomRefreshBtn')?.addEventListener('click',loadNewsroom);qs('newsroomSearch')?.addEventListener('input',renderNewsroom);qs('newsroomDestinationFilter')?.addEventListener('change',renderNewsroom);qs('newsroomSourceFilter')?.addEventListener('change',renderNewsroom);qs('newsroomDestination')?.addEventListener('change',updateNewsroomSpecialBoxes);qs('newsroomSaveReviewBtn')?.addEventListener('click',()=>saveNewsroomReview());qs('newsroomExcludeBtn')?.addEventListener('click',excludeNewsroom);qs('newsroomPublishBtn')?.addEventListener('click',publishNewsroom);qs('newsroomRecommendBusinessesBtn')?.addEventListener('click',()=>{const r=newsroomItems.find(x=>String(x.id)===String(selectedNewsroomId));if(r)renderNewsroomBusinesses({...r,selected_business_ids:newsroomSelectedBusinessIds()});});
  $$('.newsroom-filter').forEach(b=>b.addEventListener('click',()=>{$$('.newsroom-filter').forEach(x=>x.classList.remove('active'));b.classList.add('active');newsroomStatusFilter=b.dataset.status;renderNewsroom();}));
  loadNewsroom();loadNewsroomSettings();v48LoadTopics();checkNewsroomHealth(false);
}
document.addEventListener('DOMContentLoaded',()=>setTimeout(initNewsroom,1400));


// V45 main three-zone settings
function v45Csv(value){return String(value||'').split(',').map(x=>x.trim()).filter(Boolean)}
function v45PopulateBusinessSelect(selected=[]){const el=qs('v45BusinessIds');if(!el)return;const ids=new Set((selected||[]).map(String));el.innerHTML=(businesses||[]).slice().sort((a,b)=>String(a.name_ko||a.name_en||'').localeCompare(String(b.name_ko||b.name_en||''),'ko')).map(b=>`<option value="${esc(b.id)}" ${ids.has(String(b.id))?'selected':''}>${esc(b.name_ko||b.name_en||b.name||b.id)}</option>`).join('')}
function v45FillHomeConfig(config={}){
  const cats=new Set(config.proposal_categories||[]);$$('#v45ProposalCategories input').forEach(x=>x.checked=cats.has(x.value));
  const links=qs('v45CategoryLinks');if(links)links.value=JSON.stringify(config.category_links||{},null,2);
  const mode=qs('v45BusinessMode');if(mode)mode.value=config.business_mode||'featured';v45PopulateBusinessSelect(config.business_ids||[]);
  const types=new Set(config.community_board_types||[]);$$('#v45CommunityTypes input').forEach(x=>x.checked=types.has(x.value));
  if(qs('v45CommunityBoostIds'))qs('v45CommunityBoostIds').value=(config.community_boost_ids||[]).join(', ');
  if(qs('v45CommunityPostIds'))qs('v45CommunityPostIds').value=(config.community_post_ids||[]).join(', ');
}
function v45ReadHomeConfig(){
  let links={};try{links=JSON.parse(qs('v45CategoryLinks')?.value||'{}')}catch(_){throw new Error('카테고리별 연결 링크는 올바른 JSON 형식으로 입력하세요.');}
  return {proposal_categories:$$('#v45ProposalCategories input:checked').map(x=>x.value),category_links:links,business_mode:qs('v45BusinessMode')?.value||'featured',business_ids:Array.from(qs('v45BusinessIds')?.selectedOptions||[]).map(x=>x.value),community_board_types:$$('#v45CommunityTypes input:checked').map(x=>x.value),community_post_ids:v45Csv(qs('v45CommunityPostIds')?.value),community_boost_ids:v45Csv(qs('v45CommunityBoostIds')?.value)};
}
async function v45SaveHomeConfig(){const btn=qs('v45HomeSaveBtn');if(btn)btn.disabled=true;try{const home_config=v45ReadHomeConfig();await newsroomEdgeCall('save_settings',{region:getAppRegion(),home_config},'메인 운영 설정을 저장하고 있습니다…');const verified=await newsroomEdgeCall('get_settings',{region:getAppRegion()},'저장된 메인 설정을 확인하고 있습니다…');const saved=verified?.settings?.home_config||verified?.home_config||{};v45FillHomeConfig(saved);safeText('newsroomStatus',`메인 설정 저장·확인 완료 · 선택 분야 ${(saved.proposal_categories||[]).length}개`);alert('메인 운영 설정을 저장하고 서버에서 다시 확인했습니다.');}catch(e){alert(`메인 설정 저장 실패: ${e.message}`);}finally{if(btn)btn.disabled=false;}}

document.addEventListener('click',(e)=>{if(e.target?.id==='v45HomeSaveBtn')v45SaveHomeConfig();});
