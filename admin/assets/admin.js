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
  if (el) el.textContent = text ?? '';
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
    coupon: ['쿠폰 관리자', '쿠폰을 생성하고 기간 / 정렬 / 지역 노출을 관리합니다.'],
    couponRedemptions: ['쿠폰 사용 내역', '사용자가 확인한 쿠폰 기록을 조회합니다.'],
    slide: ['슬라이드 관리자', '홈 상단 통합 슬라이더에 노출할 프로모션을 관리합니다.'],
    aiStudio: ['AI 광고 스튜디오', '업소 정보 한 번으로 기사·배너·쿠폰·SNS·영상 제작안을 만듭니다.'],
    dalpick: ['AI 콘텐츠 스튜디오', 'DalPick과 업소탐방 Premium 콘텐츠를 AI로 작성하고 발행합니다.'],
    performance: ['광고 성과 센터', '관리자 전용 비공개 광고 성과를 확인합니다.'],
    board: ['커뮤니티 관리자', '지역소식 / 라이프 / 비즈니스 글을 관리합니다.'],
	banners: ['배너 관리자', '메인 스폰서 배너를 등록/수정/삭제합니다.'],
    requests: ['신청 관리', '업소 등록 신청과 광고 문의를 확인합니다.'],
    adsOps: ['광고 운영', '유료 업소와 자동 로테이션을 관리합니다.'],
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

function rotationScore(b, section){
  const weight = Number(b.paid_weight || 1);
  return adSeededRandom(`${todayKey()}-${section}-${b.id}`) / weight;
}

function pickRotation(list, section, limit = 6){
  return list
    .filter(isPaidBusinessActive)
    .filter(b => b.rotation_enabled !== false)
    .sort((a,b) => rotationScore(a, section) - rotationScore(b, section))
    .slice(0, limit);
}

async function loadAdsOps(){
  const { data, error } = await supabase
    .from('businesses')
    .select('id,name_ko,name_en,area,category_ko,paid_active,paid_product,paid_weight,paid_start_at,paid_end_at,rotation_enabled,is_active')
    .order('paid_active', { ascending:false });

  if(error) return alert(error.message);

  const paid = (data || []).filter(isPaidBusinessActive);

  document.querySelector('#adsOpsSummary').innerHTML = `
    <div class="admin-card">
      <h3>광고 운영 요약</h3>
      <p><b>현재 유료 활성 업소:</b> ${paid.length}개</p>
      <p><b>월 목표:</b> 100개 × $100 = $10,000</p>
      <p><b>추천/신규/인기:</b> 각 6개, 총 18개 자동 노출</p>
    </div>
  `;

  document.querySelector('#adsOpsList').innerHTML = `
    <h3>유료 업소 목록</h3>
    <table class="request-table">
      <thead>
        <tr>
          <th>업소명</th>
          <th>지역</th>
          <th>상품</th>
          <th>가중치</th>
          <th>시작일</th>
          <th>종료일</th>
          <th>로테이션</th>
          <th>상태</th>
        </tr>
      </thead>
      <tbody>
        ${(data || []).filter(b => b.paid_active).map(b => `
          <tr>
            <td>${esc(b.name_ko || b.name_en || '')}</td>
            <td>${esc(b.area || '')}</td>
            <td>${esc(b.paid_product || 'basic')}</td>
            <td>${esc(b.paid_weight || 1)}</td>
            <td>${esc(b.paid_start_at || '')}</td>
            <td>${esc(b.paid_end_at || '')}</td>
            <td>${b.rotation_enabled === false ? 'OFF' : 'ON'}</td>
            <td>${isPaidBusinessActive(b) ? '활성' : '비활성/기간외'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  document.querySelector('#rotationPreview').innerHTML = '';
}
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
async function previewRotation(){
  const { data, error } = await supabase
    .from('businesses')
    .select('*')
    .eq('is_active', true);

  if(error) return alert(error.message);

  const featured = pickRotation(data || [], 'featured', 6);
  const newest = pickRotation(data || [], 'new', 6);
  const popular = pickRotation(data || [], 'popular', 6);

  const renderList = (title, rows) => `
    <div class="admin-card">
      <h3>${title}</h3>
      ${rows.length ? rows.map((b,i) => `
        <p>${i + 1}. ${esc(b.name_ko || b.name_en || '')} / ${esc(b.paid_product || 'basic')} / weight ${esc(b.paid_weight || 1)}</p>
      `).join('') : '<p>노출 대상이 없습니다.</p>'}
    </div>
  `;

  document.querySelector('#rotationPreview').innerHTML = `
    <h3>오늘 로테이션 미리보기 (${todayKey()})</h3>
    ${renderList('추천', featured)}
    ${renderList('신규', newest)}
    ${renderList('인기', popular)}
  `;
}

window.loadAdsOps = loadAdsOps;
window.previewRotation = previewRotation;

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
  setVal('coupon_business_id', '');
  setChecked('coupon_is_active', true);
  setChecked('coupon_is_today', false);
  selectedCouponId = null;
  safeText('couponFormTitle', '새 쿠폰');
  $$('.coupon-row').forEach((el) => el.classList.remove('active'));
}
function fillCouponForm(row) {
  setVal('coupon_id', row.id || '');
  setVal('coupon_business_id', row.business_id || '');
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
  renderCouponList(filterCoupons());
  renderBusinessList(filterBusinesses());
}
function collectCouponPayload() {
  return {
    business_id: val('coupon_business_id') || null,
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
  if (!p.business_id || !p.title) return alert('연결 업소와 쿠폰 제목을 입력하세요.');

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

const DALPICK_LABELS={local_info:'지역 정보',lifestyle:'생활 정보',themed:'테마 추천',recommended:'추천 업소',new_business:'신규 업소',coupon:'쿠폰',event:'행사',business_story:'업소탐방 Premium',ai_pick:'AI 추천',seasonal:'시즌 추천',promotion:'프로모션'};
const DALPICK_BUSINESS_REQUIRED=new Set(['recommended','new_business','business_story']);
const DALPICK_TYPE_HELP={local_info:'지역 명소, 여행지, 계절 정보를 업소 연결 없이 작성할 수 있습니다.',lifestyle:'텍사스 생활 팁과 실용 정보를 특정 업체 홍보 없이 작성합니다.',themed:'하나의 주제로 정보형 기사를 만들고 필요할 때만 업소를 연결합니다.',recommended:'선택한 업소를 중심으로 추천 콘텐츠를 작성합니다.',new_business:'새로 등록된 업소의 특징을 소개합니다.',coupon:'쿠폰이나 프로모션 내용을 소개합니다. 업소 연결을 권장합니다.',event:'지역 행사나 이벤트를 소개합니다. 업소 연결은 선택 사항입니다.',business_story:'선택한 업소를 중심으로 업소탐방 기사를 작성합니다. 연결 업소가 반드시 필요합니다.'};
function dalpickLabel(v){return DALPICK_LABELS[v]||v||'DalPick';}
function renderDalpickBusinessOptions(){const el=qs('dalpick_business_id');if(!el)return;const cur=el.value;el.innerHTML='<option value="">연결 안 함</option>'+businesses.map(b=>`<option value="${esc(b.id)}">${esc(b.name_ko||b.name_en||b.id)}</option>`).join('');el.value=cur;}
async function loadDalpicks(){if(!supabase)return;const {data,error}=await supabase.from('dalpick').select('*').eq('region',getAppRegion()).order('is_featured',{ascending:false}).order('priority',{ascending:false}).order('created_at',{ascending:false});if(error){console.warn('DalPick load:',error.message);safeText('dalpickCountText','테이블 필요');return;}dalpicks=data||[];renderDalpickBusinessOptions();renderDalpickList(filterDalpicks());}
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
function clearDalpickForm(){selectedDalpickId=null;setVal('dalpick_id','');setVal('dalpick_image_instruction','');setVal('dalpick_category','local_info');setVal('dalpick_region',getAppRegion());setVal('dalpick_title','');setVal('dalpick_summary','');setVal('dalpick_content','');setVal('dalpick_business_id','');setVal('dalpick_image_url','');setVal('dalpick_start_at','');setVal('dalpick_end_at','');setVal('dalpick_priority','0');setChecked('dalpick_is_featured',false);setChecked('dalpick_is_active',true);setChecked('dalpick_show_in_dalpick',false);setChecked('dalpick_auto_image',true);document.querySelectorAll('[name="dalpick_target_category"]').forEach(x=>x.checked=false);setVal('dalpick_topic','');setVal('dalpick_instructions','');setVal('dalpick_sources','');safeText('dalpickAiStatus','준비됨');safeText('dalpickFormTitle','DalPick 콘텐츠 스튜디오');updateDalpickTypeUI();updateDalpickImagePreview();renderDalpickList(filterDalpicks());}
function fillDalpickForm(d){selectedDalpickId=d.id;setVal('dalpick_id',d.id);setVal('dalpick_category',d.category||'local_info');setVal('dalpick_region',d.region||getAppRegion());setVal('dalpick_title',d.title||'');setVal('dalpick_summary',d.summary||'');setVal('dalpick_content',d.content||'');setVal('dalpick_business_id',d.business_id||'');setVal('dalpick_image_url',d.image_url||'');setVal('dalpick_start_at',fmtLocal(d.start_at));setVal('dalpick_end_at',fmtLocal(d.end_at));setVal('dalpick_priority',d.priority||0);setChecked('dalpick_is_featured',!!d.is_featured);setChecked('dalpick_is_active',d.is_active!==false);setChecked('dalpick_show_in_dalpick',!!d.show_in_dalpick);{const targets=Array.isArray(d.target_categories)?d.target_categories:[];document.querySelectorAll('[name="dalpick_target_category"]').forEach(x=>x.checked=targets.includes(x.value));}safeText('dalpickFormTitle',`DalPick 수정 #${d.id}`);updateDalpickTypeUI();updateDalpickImagePreview();}
async function saveDalpick(){
  const selectedCategory=val('dalpick_category')||'local_info';
  const themeMode=selectedCategory==='themed';
  const selectedTargets=themeMode?[...document.querySelectorAll('[name="dalpick_target_category"]:checked')].map(x=>x.value):[];
  const payload={region:getAppRegion(),category:selectedCategory,title:val('dalpick_title').trim(),summary:val('dalpick_summary').trim()||null,content:val('dalpick_content').trim()||null,business_id:val('dalpick_business_id')||null,image_url:val('dalpick_image_url').trim()||null,start_at:fromLocal(val('dalpick_start_at')),end_at:fromLocal(val('dalpick_end_at')),priority:Number(val('dalpick_priority')||0),is_featured:checked('dalpick_is_featured'),is_active:checked('dalpick_is_active'),status:checked('dalpick_is_active')?'published':'draft',target_categories:selectedTargets,show_in_dalpick:themeMode&&checked('dalpick_show_in_dalpick')};
  if(!payload.title)return alert('제목을 입력하세요.');
  if(payload.category==='themed'&&!payload.target_categories.length)return alert('추천 테마를 표시할 업종을 하나 이상 선택하세요.');
  if(DALPICK_BUSINESS_REQUIRED.has(payload.category)&&!payload.business_id)return alert('이 콘텐츠 유형은 연결 업소를 선택해야 합니다.');
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
  safeText('slideFormTitle', `슬라이드 수정 · ${biz?.name_ko || biz?.name_en || (businessId ? '연결 업소' : '업소 미연결')}`);
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

  let query;
  if (slideId) {
    query = supabase.from('slides').update(payload).eq('id', slideId).select().single();
  } else {
    query = supabase.from('slides').insert(payload).select().single();
  }
  const { data, error } = await query;
  if (error) return alert(`슬라이드 저장 실패: ${error.message}`);

  await loadSlides();
  if (data) fillSlideForm(data);
  renderSlideList(filterSlides());
  alert(slideId ? '슬라이드 수정 완료' : '새 슬라이드 추가 완료');
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
  on('dalpickNewBtn','click',clearDalpickForm);
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
  on('slide_business_select', 'change', () => {
    const row = businesses.find((b) => String(b.id) === String(val('slide_business_select')));
    if (row) fillSlideForm(row);
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
    if (row) setVal('bnBusinessSearch', row.name_ko || row.name_en || row.name || '');
  });
  on('bnRegion', 'change', renderBannerBusinessOptions);
  on('bnLinkType', 'change', renderBannerLinkOptions);
  on('bannerImageUploadBtn', 'click', uploadBannerImageToField);

  renderBannerBusinessOptions();
  renderBannerLinkOptions();
}

function renderBannerLinkOptions() {
  const type = val('bnLinkType') || 'business';
  const target = qs('bnLinkTarget');
  const custom = qs('bnLinkCustom');
  const help = qs('bnLinkHelp');
  if (!target || !custom) return;
  target.hidden = ['external','phone','none'].includes(type);
  custom.hidden = !['external','phone'].includes(type);
  let rows = [];
  if (type === 'business') rows = businesses.map(x => ({id:x.id,label:x.name_ko||x.name_en||x.name||x.id}));
  if (type === 'post') rows = boards.map(x => ({id:x.id,label:x.title||`게시글 #${x.id}`}));
  if (type === 'dalpick') rows = dalpicks.map(x => ({id:x.id,label:x.title||`DalPick #${x.id}`}));
  if (type === 'coupon') rows = coupons.map(x => ({id:x.id,label:x.title||`쿠폰 #${x.id}`}));
  const current = target.dataset.value || '';
  target.innerHTML = '<option value="">대상을 선택하세요</option>' + rows.map(x=>`<option value="${esc(x.id)}">${esc(x.label)}</option>`).join('');
  if (current) target.value = current;
  if (help) help.textContent = ({business:'배너 클릭 시 연결 업소 상세페이지를 엽니다.',post:'특정 게시글 상세로 이동합니다.',dalpick:'DalPick 또는 추천 테마 상세를 엽니다.',coupon:'선택한 쿠폰 상세를 엽니다.',external:'웹사이트나 예약 페이지 주소를 입력하세요.',phone:'전화번호를 입력하면 클릭 시 전화 앱이 열립니다.',none:'배너는 표시되지만 클릭 동작은 없습니다.'})[type] || '';
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
  if (type === 'business') return target ? `business:${target}` : '';
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

// =============================
// BANNER MANAGEMENT
// =============================
function clearBannerForm() {
  setVal('bnId', '');
  setVal('bnTitle', '');
  setVal('bnImage', '');
  setVal('bnLink', '');
  setVal('bnLinkType', 'business');
  const linkTarget = qs('bnLinkTarget'); if (linkTarget) { linkTarget.dataset.value=''; linkTarget.value=''; }
  setVal('bnLinkCustom', '');
  setVal('bnRegion', currentRegionScope() === 'all' ? 'dallas' : currentRegionScope());
  setVal('bnOrder', '0');
  setChecked('bnActive', true);
  setVal('bnBusinessId', '');
  setVal('bnBusinessSearch', '');
  setVal('bnDisplayType', 'banner');
  setVal('bnPlacement', 'home');
  setVal('bnDescription', '');
  setVal('bnButtonLabel', '자세히 보기');
  setChecked('bnShowButton', true);
  const bnBtnInput = qs('bnButtonLabel'); if (bnBtnInput) { bnBtnInput.disabled = false; bnBtnInput.style.opacity = '1'; }
  setVal('bnStartAt', '');
  setVal('bnEndAt', '');
  const sel = qs('bnBusinessSelect'); if (sel) sel.innerHTML = '<option value="">업소를 검색하세요</option>';
  renderBannerLinkOptions();
}

function fillBannerForm(row) {
  if (!row) return clearBannerForm();
  setVal('bnId', row.id || '');
  setVal('bnTitle', row.title || '');
  setVal('bnImage', row.image_url || '');
  setVal('bnLink', row.link_url || '');
  const parsedLink = parseBannerLink(row.link_url, row.business_id);
  setVal('bnLinkType', parsedLink.type);
  setVal('bnLinkCustom', parsedLink.custom);
  const linkTarget = qs('bnLinkTarget'); if (linkTarget) linkTarget.dataset.value = parsedLink.target || '';
  setVal('bnRegion', row.region || '');
  setVal('bnOrder', row.sort_order == null ? '0' : String(row.sort_order));
  setChecked('bnActive', row.is_active !== false);
  setVal('bnBusinessId', row.business_id || '');
  setVal('bnBusinessSearch', '');
  setVal('bnDisplayType', row.display_type || 'banner');
  setVal('bnPlacement', row.placement || (row.business_id ? 'both' : 'home'));
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
        src="${esc(b.image_url || 'https://placehold.co/120x80?text=Banner')}"
        alt="${esc(b.title || '배너')}"
      />
      <div class="biz-main">
        <div class="biz-title">${esc(b.title || '배너')}</div>
        <div class="biz-meta">${esc(b.region || '')}${b.sort_order != null ? ` · ${esc(String(b.sort_order))}` : ''}</div>
        <div class="biz-meta">${esc(b.display_type === 'card' ? '카드형' : '배너형')} · ${esc(b.placement || (b.business_id ? 'both' : 'home'))} · ${b.is_active === false ? '비활성' : '활성'}</div>
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
    image_url: val('bnImage').trim(),
    link_url: buildBannerLink(),
    business_id: val('bnBusinessId').trim() || null,
    region: getAppRegion(),
    display_type: val('bnDisplayType') || 'banner',
    placement: val('bnPlacement') || 'home',
    description: val('bnDescription').trim() || null,
    button_label: checked('bnShowButton') ? (val('bnButtonLabel').trim() || '자세히 보기') : '',
    start_at: fromLocal(val('bnStartAt')),
    end_at: fromLocal(val('bnEndAt')),
    sort_order: Number(val('bnOrder') || 0),
    is_active: checked('bnActive')
  };

  if (!payload.title) return alert('배너 제목을 입력해 주세요.');
  if (!payload.image_url) return alert('배너 이미지 URL을 입력해 주세요.');
  if (['detail','both'].includes(payload.placement) && !payload.business_id) return alert('업소 상세에 노출하려면 연결 업소를 선택해 주세요.');
  const linkType = val('bnLinkType') || 'business';
  if (['post','dalpick','coupon','business'].includes(linkType) && !val('bnLinkTarget').trim()) return alert('클릭 연결 대상을 선택해 주세요.');
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

// ===== v20.1 AI Content Studio =====
let contentStudioSuite = null;
const CONTENT_STUDIO_HISTORY_KEY = 'daltownmap_content_studio_v20_history';

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
  return ['dalpick','coupon','banner','social','video'].filter(x=>csChecked(`csType_${x}`));
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
  if(s.dalpick){s.dalpick.title=get('cs_dalpick_title',s.dalpick.title);s.dalpick.summary=get('cs_dalpick_summary',s.dalpick.summary);s.dalpick.content=get('cs_dalpick_content',s.dalpick.content);}
  if(s.coupon){s.coupon.title=get('cs_coupon_title',s.coupon.title);s.coupon.discount_label=get('cs_coupon_discount',s.coupon.discount_label);s.coupon.description=get('cs_coupon_description',s.coupon.description);s.coupon.coupon_code=get('cs_coupon_code',s.coupon.coupon_code);}
  if(s.banner){s.banner.title=get('cs_banner_title',s.banner.title);s.banner.description=get('cs_banner_description',s.banner.description);s.banner.button_label=get('cs_banner_button',s.banner.button_label);}
  if(s.social){s.social.instagram=get('cs_social_instagram',s.social.instagram);s.social.facebook=get('cs_social_facebook',s.social.facebook);s.social.short_caption=get('cs_social_short',s.social.short_caption);}
  if(s.video){s.video.hook=get('cs_video_hook',s.video.hook);s.video.script=get('cs_video_script',s.video.script);s.video.thumbnail_text=get('cs_video_thumb',s.video.thumbnail_text);}
  return s;
}
function csCard(title,body,actions,type){
  return `<article class="cs-card" data-type="${type}" style="border:1px solid #dbe3ee;border-radius:16px;background:#fff;padding:16px;box-shadow:0 3px 12px rgba(15,23,42,.05)"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:12px"><h3 style="margin:0;font-size:17px">${title}</h3><span style="font-size:12px;padding:4px 8px;background:#f1f5f9;border-radius:999px">초안</span></div>${body}<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">${actions}</div></article>`;
}
function csRenderSuite(suite, selectedTypes=['dalpick','coupon','banner','social','video']){
  contentStudioSuite=suite;
  const box=csEl('csResults'); if(!box)return;
  const cards=[];
  const input=(id,label,value)=>`<label style="display:block;font-size:12px;font-weight:700;margin:9px 0 4px">${label}</label><input id="${id}" value="${esc(value||'')}" style="width:100%;padding:9px;border:1px solid #cbd5e1;border-radius:9px">`;
  const area=(id,label,value,rows=5)=>`<label style="display:block;font-size:12px;font-weight:700;margin:9px 0 4px">${label}</label><textarea id="${id}" rows="${rows}" style="width:100%;padding:9px;border:1px solid #cbd5e1;border-radius:9px;resize:vertical">${esc(value||'')}</textarea>`;
  if(selectedTypes.includes('dalpick')&&suite.dalpick)cards.push(csCard('DalPick 기사',input('cs_dalpick_title','제목',suite.dalpick.title)+area('cs_dalpick_summary','요약',suite.dalpick.summary,3)+area('cs_dalpick_content','본문',suite.dalpick.content,10),'<button type="button" class="btn primary" data-cs-action="apply-dalpick">DalPick 입력란으로 보내기</button>','dalpick'));
  if(selectedTypes.includes('coupon')&&suite.coupon)cards.push(csCard('쿠폰',input('cs_coupon_title','제목',suite.coupon.title)+input('cs_coupon_discount','혜택',suite.coupon.discount_label)+area('cs_coupon_description','설명',suite.coupon.description,4)+input('cs_coupon_code','쿠폰 코드',suite.coupon.coupon_code),'<button type="button" class="btn primary" data-cs-action="apply-coupon">쿠폰 입력란으로 보내기</button>','coupon'));
  if(selectedTypes.includes('banner')&&suite.banner)cards.push(csCard('배너',input('cs_banner_title','제목',suite.banner.title)+area('cs_banner_description','설명',suite.banner.description,3)+input('cs_banner_button','버튼 문구',suite.banner.button_label)+area('cs_banner_prompt','이미지 프롬프트',suite.banner.image_prompt,4),'<button type="button" class="btn primary" data-cs-action="apply-banner">배너 입력란으로 보내기</button><button type="button" class="btn secondary" data-cs-action="copy-banner-prompt">이미지 프롬프트 복사</button>','banner'));
  if(selectedTypes.includes('social')&&suite.social)cards.push(csCard('SNS 문구',area('cs_social_instagram','Instagram',suite.social.instagram,6)+area('cs_social_facebook','Facebook',suite.social.facebook,6)+area('cs_social_short','짧은 캡션',suite.social.short_caption,3),'<button type="button" class="btn secondary" data-cs-action="copy-social">전체 복사</button>','social'));
  if(selectedTypes.includes('video')&&suite.video)cards.push(csCard('숏폼 영상',input('cs_video_hook','첫 문장',suite.video.hook)+area('cs_video_script','30~45초 대본',suite.video.script,8)+input('cs_video_thumb','썸네일 문구',suite.video.thumbnail_text),'<button type="button" class="btn secondary" data-cs-action="copy-video">대본 복사</button>','video'));
  box.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px"><div><h2 style="margin:0">${esc(suite.campaign_title||'생성 결과')}</h2><div style="font-size:13px;color:#64748b;margin-top:4px">각 카드에서 내용을 수정한 뒤 필요한 항목만 기존 입력란으로 보낼 수 있습니다.</div></div><button type="button" class="btn secondary" data-cs-action="save-history">작업 보관</button></div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(310px,1fr));gap:14px">${cards.join('')}</div>`;
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
    setVal('bnTitle',s.banner.title);setVal('bnDescription',s.banner.description);setVal('bnButtonLabel',s.banner.button_label);setVal('bnBusinessId',businessId); if(csEl('bnBusinessSelect'))setVal('bnBusinessSelect',businessId);
    switchSection('banners'); csStatus('배너 입력란으로 이동했습니다. 이미지를 지정한 후 저장하세요.','success');
  }
}
async function csGenerate(){
  const topic=csValue('csTopic'); if(!topic)return alert('캠페인 주제를 입력하세요.');
  const types=csSelectedTypes(); if(!types.length)return alert('생성할 콘텐츠를 하나 이상 선택하세요.');
  const businessId=csValue('csBusiness'); const b=businesses.find(x=>String(x.id)===String(businessId));
  const btn=csEl('csGenerateBtn'); const old=btn?.textContent||'통합 생성';if(btn){btn.disabled=true;btn.textContent='생성 중...';}
  csStatus('선택한 콘텐츠 초안을 생성하고 있습니다...');
  try{
    const r=await fetch('/.netlify/functions/generate-content-suite',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({topic,goal:csValue('csGoal'),audience:csValue('csAudience'),tone:csValue('csTone'),instructions:csValue('csInstructions'),content_types:types,business:b?{id:b.id,name:b.name_ko||b.name_en||'',category:b.category||b.category_ko||'',address:b.address||'',phone:b.phone||'',website:b.website||'',description:b.description||b.description_ko||''}:null})});
    const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'통합 콘텐츠 생성 실패');
    csRenderSuite(j.suite,types);csStatus('초안 생성 완료. 카드에서 직접 수정할 수 있습니다.','success');
  }catch(e){console.error(e);csStatus(`오류: ${e.message}`,'error');alert(e.message);}finally{if(btn){btn.disabled=false;btn.textContent=old;}}
}
function initContentStudioV20(){
  if(csEl('section-contentStudio'))return;
  const nav=document.getElementById('adminNav');
  if(nav){const btn=document.createElement('button');btn.type='button';btn.className='nav-item';btn.dataset.section='contentStudio';btn.innerHTML='<span>✦</span><span>AI 콘텐츠 스튜디오</span>';nav.appendChild(btn);btn.addEventListener('click',()=>switchSection('contentStudio'));}
  const host=document.querySelector('.main-content, main, #adminMain, .content')||document.body;
  const sec=document.createElement('section');sec.id='section-contentStudio';sec.className='admin-section';
  sec.innerHTML=`<div style="display:grid;grid-template-columns:minmax(280px,380px) minmax(0,1fr);gap:18px;align-items:start" class="cs-layout"><div><div class="card" style="padding:18px"><h2 style="margin-top:0">새 캠페인</h2><label style="display:block;font-weight:700;margin:10px 0 5px">캠페인 주제 *</label><input id="csTopic" placeholder="예: 여름 보양식 이벤트" style="width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:9px"><label style="display:block;font-weight:700;margin:10px 0 5px">연결 업소</label><select id="csBusiness" style="width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:9px"></select><label style="display:block;font-weight:700;margin:10px 0 5px">목표</label><select id="csGoal" style="width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:9px"><option value="홍보와 방문 유도">홍보·방문 유도</option><option value="신규 업소 소개">신규 업소 소개</option><option value="쿠폰 사용 유도">쿠폰 사용 유도</option><option value="브랜드 신뢰도 향상">브랜드 신뢰도 향상</option><option value="정보 제공">정보 제공</option></select><label style="display:block;font-weight:700;margin:10px 0 5px">대상 고객</label><input id="csAudience" placeholder="예: 캐롤튼 거주 한인 가족" style="width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:9px"><label style="display:block;font-weight:700;margin:10px 0 5px">문체</label><select id="csTone" style="width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:9px"><option>친근하고 신뢰감 있게</option><option>고급스럽고 전문적으로</option><option>간결하고 활기차게</option><option>정보 중심으로 차분하게</option></select><label style="display:block;font-weight:700;margin:12px 0 7px">생성 항목</label><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:14px"><label><input type="checkbox" id="csType_dalpick" checked> DalPick</label><label><input type="checkbox" id="csType_coupon" checked> 쿠폰</label><label><input type="checkbox" id="csType_banner" checked> 배너</label><label><input type="checkbox" id="csType_social" checked> SNS</label><label><input type="checkbox" id="csType_video" checked> 숏폼 영상</label></div><label style="display:block;font-weight:700;margin:12px 0 5px">추가 지시</label><textarea id="csInstructions" rows="4" placeholder="가격이나 기간 등 반드시 반영할 내용을 입력하세요." style="width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:9px;resize:vertical"></textarea><button type="button" id="csGenerateBtn" class="btn primary" style="width:100%;margin-top:14px;padding:12px">통합 생성</button><div id="csStatus" style="font-size:13px;color:#475569;margin-top:10px">준비됨</div></div><div class="card" style="padding:16px;margin-top:14px"><h3 style="margin-top:0">최근 작업</h3><div id="csHistory"></div></div></div><div id="csResults"><div class="card" style="padding:30px;text-align:center;color:#64748b"><div style="font-size:34px;margin-bottom:10px">✦</div><strong>캠페인 정보를 입력하고 통합 생성을 누르세요.</strong><div style="margin-top:6px;font-size:13px">생성 결과는 콘텐츠별 카드로 나타나며, 필요한 것만 기존 관리 화면으로 보낼 수 있습니다.</div></div></div></div><style>@media(max-width:900px){.cs-layout{grid-template-columns:1fr!important}}</style>`;
  host.appendChild(sec);csBusinessOptions();csRenderHistory();
  csEl('csGenerateBtn')?.addEventListener('click',csGenerate);
  sec.addEventListener('click',async e=>{
    const h=e.target.closest('[data-cs-history]');if(h){const x=csLoadHistory()[Number(h.dataset.csHistory)];if(x){contentStudioSuite=x.suite;csRenderSuite(x.suite,x.types);csStatus('보관된 작업을 불러왔습니다.','success');}return;}
    const btn=e.target.closest('[data-cs-action]');if(!btn)return;const a=btn.dataset.csAction;const s=csGetEditedSuite();
    if(a==='apply-dalpick')csApply('dalpick');else if(a==='apply-coupon')csApply('coupon');else if(a==='apply-banner')csApply('banner');
    else if(a==='copy-banner-prompt')csCopy(csValue('cs_banner_prompt'));
    else if(a==='copy-social')csCopy(`Instagram\n${s.social.instagram}\n\nFacebook\n${s.social.facebook}\n\n짧은 캡션\n${s.social.short_caption}`);
    else if(a==='copy-video')csCopy(`${s.video.hook}\n\n${s.video.script}\n\n썸네일: ${s.video.thumbnail_text}`);
    else if(a==='save-history'){csSaveHistory({title:s.campaign_title,created_at:new Date().toLocaleString('ko-KR'),types:csSelectedTypes(),suite:s});csStatus('현재 작업을 브라우저에 보관했습니다.','success');}
  });
  window.addEventListener('kfocus:businesses-loaded',csBusinessOptions);
}
const _v20SetPageMeta=setPageMeta;
setPageMeta=function(){
  if(currentSection==='contentStudio'){safeText('pageTitle','AI 콘텐츠 스튜디오');safeText('pageDesc','하나의 캠페인에서 DalPick·쿠폰·배너·SNS·영상 초안을 만들고 필요한 항목만 발행합니다.');return;}
  return _v20SetPageMeta();
};
document.addEventListener('DOMContentLoaded',()=>setTimeout(initContentStudioV20,500));
window.initContentStudioV20=initContentStudioV20;
