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
let slides = [];
let banners = [];
let boardTable = 'posts';
let businessStatsMap = {};

let currentSection = 'business';
let selectedId = null;
let selectedCouponId = null;
let selectedBoardId = null;
let selectedSlideBusinessId = null;

const BUSINESS_FIELDS = [
  'id', 'name_ko', 'name_en', 'category_ko', 'area', 'region', 'phone',
  'website', 'email', 'address', 'description', 
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
  'promo_text', 'promo_image_url', 'home_fixed_sort'
  'paid_product',
  'paid_weight',
  'paid_start_at',
  'paid_end_at',
];
const BUSINESS_CHECKS = [
  'is_active', 'is_featured', 'is_new', 'is_popular', 'promo_enabled', 'home_fixed' 'paid_active', 'rotation_enabled',
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
}
function setPageMeta() {
  const titleMap = {
    business: ['업소 관리자', 'Colorado / Dallas 업소를 조회하고 수정/추가할 수 있습니다.'],
    coupon: ['쿠폰 관리자', '쿠폰을 생성하고 기간 / 정렬 / 지역 노출을 관리합니다.'],
    slide: ['슬라이드 관리자', '홈 상단 통합 슬라이더에 노출할 프로모션을 관리합니다.'],
    board: ['게시판 관리자', '행사안내 / 구인구직 / 렌트 / 매매 글을 관리합니다.'],
	banners: ['배너 관리자', '메인 스폰서 배너를 등록/수정/삭제합니다.']
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
  setVal('region', 'dallas');
  if (qs('imageFile')) qs('imageFile').value = '';
  selectedId = null;
  safeText('formTitle', '새 업소 등록');
  $$('.business-row').forEach((el) => el.classList.remove('active'));
  updatePreview();
  renderGalleryList(null);
}
function fillBusinessForm(row) {
  BUSINESS_FIELDS.forEach((id) => setVal(id, row?.[id] ?? ''));
  BUSINESS_CHECKS.forEach((id) => setChecked(id, !!row?.[id]));

  if (qs('#imageFile')) qs('#imageFile').value = '';

  selectedId = row?.id ?? null;

  safeText(
    'formTitle',
    row?.id ? `업소 수정 #${row.id}` : '업소 정보'
  );

  updatePreview();
  renderGalleryList(row);
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
 'region',
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
 'rating',
 'review_count',
 'google_maps_url',
 'insurance',

 'image_url',
 'video_url',
 'promo_text',
 'promo_image_url'
]
['lat', 'lng', 'paid_weight'].forEach((id) => {
  const raw = val(id);
  p[id] = raw === '' ? null : Number(raw);
});
.forEach((id) => {
    p[id] = val(id).trim() ? val(id).trim() : null;
  });
  ['lat', 'lng'].forEach((id) => {
    const raw = val(id);
    p[id] = raw === '' ? null : Number(raw);
  });

  p.is_active = checked('is_active');
  p.is_featured = checked('is_featured');
  p.is_new = checked('is_new');
  p.is_popular = checked('is_popular');
  p.promo_enabled = checked('promo_enabled');
  p.home_fixed = checked('home_fixed');

  ['featured_rank', 'new_rank', 'popular_rank', 'home_fixed_sort'].forEach((id) => {
    const raw = val(id);
    let n = raw === '' ? 1000 : Number(raw);
    if (Number.isNaN(n)) n = 1000;
    p[id] = n;
  });

  return p;
}
async function loadBusinesses() {
  if (!supabase) return;
  setStatus('업소 불러오는 중');
  const { data, error } = await supabase.from('businesses').select('*').order('id', { ascending: false }).limit(2000);
  if (error) {
    setStatus('업소 조회 실패');
    alert(`업소 조회 실패: ${error.message}`);
    return;
  }
  businesses = data || [];
  businessCategoryOptions();
  renderBusinessList(filterBusinesses());
  fillBusinessOptions();
  renderSlideBusinessOptions();
  renderSlideList(filterSlides());
  setStatus('연결됨');
}
async function saveBusiness() {
  const payload = collectBusinessPayload();
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
}
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
async function uploadBoardImage() {
  const file = qs('board_image_file')?.files?.[0];
  if (!file) return alert('게시판 이미지를 선택하세요.');

  try {
    const publicUrl = await uploadFileToStorage(file, 'boards');
    setVal('board_image_url', publicUrl || '');
    if (qs('board_image_file')) qs('board_image_file').value = '';
    alert('게시판 이미지 업로드 완료');
  } catch (e) {
    alert(`게시판 이미지 업로드 실패: ${e.message}`);
  }
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
  ['coupon_id', 'coupon_title', 'coupon_code', 'coupon_discount_label', 'coupon_description', 'coupon_image_url', 'coupon_start_at', 'coupon_end_at', 'coupon_sort_order'].forEach((id) => setVal(id, ''));
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
    if (region !== 'all' && (biz?.region || 'colorado') !== region) return false;
    if (bizId !== 'all' && String(c.business_id) !== String(bizId)) return false;
    if (!q) return true;
    const hay = [c.title, c.description, c.coupon_code, biz?.name_ko, biz?.name_en].join(' ').toLowerCase();
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
    sort_order: Number(val('coupon_sort_order') || 1000)
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

/* ---------------------------
   Boards
--------------------------- */
function boardLabel(t) {
  return ({ notice: '행사안내', job: '구인/구직', rent: '렌트', sale: '매매' })[t] || '행사안내';
}
async function loadBoards() {
  if (!supabase) return;
  const selects = [
    'id,title,content,type,region,image_url,address,phone,business_id,start_at,end_at,is_active,created_at',
    'id,title,content,type,region,image_url,address,phone,start_at,end_at,is_active,created_at',
    'id,title,content,type,region,image_url,start_at,end_at,is_active,created_at'
  ];
  let loaded = null;
  for (const select of selects) {
    const res = await supabase.from('posts').select(select).order('created_at', { ascending: false });
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
  setVal('board_region', currentRegionScope() === 'all' ? 'colorado' : currentRegionScope());
  setVal('board_title', '');
  setVal('board_content', '');
  setVal('board_phone', '');
  setVal('board_address', '');
  setVal('board_image_url', '');
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
  setVal('board_type', row.type || 'notice');
  setVal('board_region', row.region || 'colorado');
  setVal('board_title', row.title || '');
  setVal('board_content', row.content || '');
  setVal('board_phone', row.phone || '');
  setVal('board_address', row.address || '');
  setVal('board_business_id', row.business_id || row.linked_business_id || '');
  setVal('board_business_search', '');
  renderBoardBusinessOptions();
  setVal('board_image_url', row.image_url || '');
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
    if (t !== 'all' && (b.type || 'notice') !== t) return false;
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
      : `<div class="biz-thumb board-thumb-fallback">${({ notice: '🎉', job: '💼', rent: '🏘️', sale: '🏠' })[row.type] || '📝'}</div>`;

    return `
      <button type="button" class="biz-item board-row ${row.id === selectedBoardId ? 'active' : ''}" data-id="${esc(row.id)}">
        ${thumb}
        <div>
          <div class="biz-title">${esc(row.title || '게시글')}</div>
          <div class="biz-meta">${esc(boardLabel(row.type))} · ${esc(row.region || 'colorado')} ${row.is_active === false ? '· 비활성' : ''}</div>
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

  const linkedBusinessId = val('board_business_select') || val('board_business_id') || null;
  const payloadBase = {
    type: val('board_type') || 'notice',
    region: val('board_region') || 'colorado',
    title: val('board_title').trim(),
    content: val('board_content').trim(),
    image_url: imageUrl,
    start_at: fromLocal(val('board_start_at')),
    end_at: fromLocal(val('board_end_at')),
    is_active: checked('board_is_active'),
    business_id: linkedBusinessId || null
  };
  if (!payloadBase.title) return alert('제목을 입력하세요.');

  const payloads = [
    { ...payloadBase, phone: val('board_phone').trim() || null, address: val('board_address').trim() || null },
    { ...payloadBase, phone: val('board_phone').trim() || null, address: val('board_address').trim() || null, business_id: undefined },
    { ...payloadBase, business_id: undefined },
    payloadBase
  ];

  let res = null;
  for (const rawPayload of payloads) {
    const payload = Object.fromEntries(Object.entries(rawPayload).filter(([,v]) => v !== undefined));
    res = selectedBoardId
      ? await supabase.from(boardTable).update(payload).eq('id', selectedBoardId).select().single()
      : await supabase.from(boardTable).insert({ ...payload, created_at: new Date().toISOString() }).select().single();
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
   Slides
--------------------------- */
function slideByBusinessId(id) {
  return slides.find((s) => String(s.business_id) === String(id)) || null;
}
async function loadSlides() {
  if (!supabase) return;
  const { data, error } = await supabase.from('slides').select('*').order('home_fixed_sort', { ascending: true }).order('created_at', { ascending: false });
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
  const rows = businesses.filter((b) => region === 'all' || (b.region || 'colorado') === region);
  el.innerHTML = '<option value="">업소 선택</option>' +
    rows.map((b) => `<option value="${esc(b.id)}">${esc(b.name_ko || b.name_en || b.id)}</option>`).join('');
}
function clearSlideForm() {
  setVal('slide_business_id', '');
  setVal('slide_business_select', '');
  setChecked('slide_promo_enabled', true);
  setChecked('slide_home_fixed', false);
  setVal('slide_home_fixed_sort', '1000');
  setVal('slide_promo_text', '');
  setVal('slide_promo_image_url', '');
  setVal('slide_video_url', '');
  setVal('slide_start_at', '');
  setVal('slide_end_at', '');
  selectedSlideBusinessId = null;
  safeText('slideFormTitle', '새 슬라이드');
  $$('.slide-row').forEach((el) => el.classList.remove('active'));
}
function fillSlideForm(rowOrBusiness) {
  const businessId = rowOrBusiness?.business_id || rowOrBusiness?.id || '';
  const slide = rowOrBusiness?.business_id ? rowOrBusiness : slideByBusinessId(businessId);
  setVal('slide_business_id', businessId);
  setVal('slide_business_select', businessId);
  setChecked('slide_promo_enabled', slide?.promo_enabled !== false);
  setChecked('slide_home_fixed', !!slide?.home_fixed);
  setVal('slide_home_fixed_sort', slide?.home_fixed_sort ?? 1000);
  setVal('slide_promo_text', slide?.promo_text || '');
  setVal('slide_promo_image_url', slide?.promo_image_url || '');
  setVal('slide_video_url', slide?.video_url || '');
  setVal('slide_start_at', fmtLocal(slide?.promo_start_at));
  setVal('slide_end_at', fmtLocal(slide?.promo_end_at));
  selectedSlideBusinessId = businessId || null;
  safeText('slideFormTitle', businessId ? `슬라이드 설정 #${businessId}` : '새 슬라이드');
}
function filterSlides() {
  const q = val('slideSearchInput').trim().toLowerCase();
  const region = currentRegionScope();
  const bizRows = businesses.filter((b) => region === 'all' || (b.region || 'colorado') === region);
  return bizRows.filter((b) => {
    const slide = slideByBusinessId(b.id);
    if (!q) return true;
    return [b.name_ko, b.name_en, slide?.promo_text, b.category_ko].join(' ').toLowerCase().includes(q);
  }).sort((a, b) => {
    const sa = slideByBusinessId(a.id);
    const sb = slideByBusinessId(b.id);
    const aActive = sa ? 0 : 1;
    const bActive = sb ? 0 : 1;
    return aActive - bActive || (sa?.home_fixed_sort ?? 1000) - (sb?.home_fixed_sort ?? 1000) || String(a.name_ko || '').localeCompare(String(b.name_ko || ''), 'ko');
  });
}
function renderSlideList(items) {
  const activeCount = slides.filter((s) => currentRegionScope() === 'all' || (s.region || 'colorado') === currentRegionScope()).length;
  safeText('slideCountText', `${activeCount}개`);
  const listEl = qs('slideList');
  if (!listEl) return;
  
  const slideBusinessIds = new Set(
  slides
    .filter(s =>
      s &&
      s.business_id &&
      (currentRegionScope() === 'all' || (s.region || 'colorado') === currentRegionScope())
    )
    .map(s => String(s.business_id))
);

items = (items || []).filter(biz => slideBusinessIds.has(String(biz.id)));

  listEl.innerHTML = items.map((biz) => {
    const slide = slideByBusinessId(biz.id);
    const img = slide?.promo_image_url || biz.image_url || 'https://placehold.co/120x120?text=Slide';
    const meta = slide ? (slide.promo_text || '슬라이드 문구 없음') : '슬라이드 미등록';
    const state = slide ? `${slide.promo_enabled ? '프로모션' : '비활성'}${slide.home_fixed ? ' · 홈고정' : ''}` : '업소 선택 가능';
    return `
      <button type="button" class="biz-item slide-row ${biz.id === selectedSlideBusinessId ? 'active' : ''}" data-id="${esc(biz.id)}">
        <img class="biz-thumb" src="${esc(img)}" alt="thumb" />
        <div>
          <div class="biz-title">${esc(biz.name_ko || biz.name_en || `ID ${biz.id}`)}</div>
          <div class="biz-meta">${esc(meta)}</div>
          <div class="biz-meta">${esc(state)}</div>
        </div>
      </button>
    `;
  }).join('');

  listEl.querySelectorAll('.slide-row').forEach((btn) => {
    btn.addEventListener('click', () => {
      const biz = businesses.find((b) => String(b.id) === String(btn.dataset.id));
      if (biz) {
        fillSlideForm(biz);
        renderSlideList(filterSlides());
      }
    });
  });
}
async function saveSlide() {
  const businessId = val('slide_business_select') || val('slide_business_id');
  if (!businessId) return alert('업소를 선택하세요.');
  const biz = businesses.find((b) => String(b.id) === String(businessId));
  
  console.log('slide_video_url raw =', val('slide_video_url'));
  
const payload = {
  business_id: businessId,
  region: biz?.region || currentRegionScope() || 'colorado',
  promo_enabled: checked('slide_promo_enabled'),
  home_fixed: checked('slide_home_fixed'),
  home_fixed_sort: Number(val('slide_home_fixed_sort') || 1000),
  promo_text: val('slide_promo_text').trim() || null,
  promo_image_url: val('slide_promo_image_url').trim() || null,

  // ⭐ 이거 추가
  video_url: val('slide_video_url').trim() || null,

  promo_start_at: fromLocal(val('slide_start_at')),
  promo_end_at: fromLocal(val('slide_end_at')),
  updated_at: new Date().toISOString()
};

  console.log('SAVE PAYLOAD =', payload);

  const { data, error } = await supabase.from('slides').upsert(payload, { onConflict: 'business_id' }).select().single();
  if (error) return alert(`슬라이드 저장 실패: ${error.message}`);

  await loadSlides();
  if (data) fillSlideForm(data);
  alert('슬라이드 저장 완료');
}
async function deleteSlide() {
  const businessId = val('slide_business_select') || val('slide_business_id') || selectedSlideBusinessId;
  if (!businessId) return alert('삭제할 슬라이드를 선택하세요.');
  if (!confirm('선택한 슬라이드를 삭제할까요?')) return;
  const { error } = await supabase.from('slides').delete().eq('business_id', businessId);
  if (error) return alert(`슬라이드 삭제 실패: ${error.message}`);
  await loadSlides();
  clearSlideForm();
  alert('슬라이드 삭제 완료');
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
  on('regionFilter','change', async () => {
  renderBusinessList(filterBusinesses());
  renderCouponList(filterCoupons());
  renderBoardList(filterBoards());
  fillBusinessOptions();
  renderSlideBusinessOptions();
  renderSlideList(filterSlides());
  on('fetchGoogleRatingBtn', 'click', fetchGoogleRating);
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

  on('boardSearchInput', 'input', () => renderBoardList(filterBoards()));
  on('boardTypeFilter', 'change', () => renderBoardList(filterBoards()));
  on('boardNewBtn', 'click', clearBoardForm);
  on('boardSaveBtn', 'click', saveBoard);
  on('boardDeleteBtn', 'click', deleteBoard);
  
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

  on('bnBusinessSearch', 'input', renderBannerBusinessOptions);
  on('bnBusinessSelect', 'change', () => {
    const bid = val('bnBusinessSelect');
    setVal('bnBusinessId', bid);
    const row = businesses.find((b) => String(b.id) === String(bid));
    if (row) setVal('bnBusinessSearch', row.name_ko || row.name_en || row.name || '');
  });
  on('bnRegion', 'change', renderBannerBusinessOptions);
  on('bannerImageUploadBtn', 'click', uploadBannerImageToField);

  renderBannerBusinessOptions();
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

  await Promise.all([loadBusinesses(), loadCoupons(), loadBanners() ,loadBoards(), loadSlides(), loadBusinessStats()]);
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
  setVal('bnRegion', currentRegionScope() === 'all' ? 'dallas' : currentRegionScope());
  setVal('bnOrder', '0');
  setChecked('bnActive', true);
  setVal('bnBusinessId', '');
  setVal('bnBusinessSearch', '');
  const sel = qs('bnBusinessSelect'); if (sel) sel.innerHTML = '<option value="">업소를 검색하세요</option>';
}

function fillBannerForm(row) {
  if (!row) return clearBannerForm();
  setVal('bnId', row.id || '');
  setVal('bnTitle', row.title || '');
  setVal('bnImage', row.image_url || '');
  setVal('bnLink', row.link_url || '');
  setVal('bnRegion', row.region || '');
  setVal('bnOrder', row.sort_order == null ? '0' : String(row.sort_order));
  setChecked('bnActive', row.is_active !== false);
  setVal('bnBusinessId', row.business_id || '');
  setVal('bnBusinessSearch', '');
  if (typeof renderBannerBusinessOptions === 'function') setTimeout(() => { renderBannerBusinessOptions(); const sel = qs('bnBusinessSelect'); if (sel && row.business_id) sel.value = String(row.business_id); }, 0);
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
        <div class="biz-meta">${b.is_active === false ? '비활성' : '활성'}</div>
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
    link_url: val('bnLink').trim(),
    business_id: val('bnBusinessId').trim() || null,
    region: val('bnRegion').trim() || null,
    sort_order: Number(val('bnOrder') || 0),
    is_active: checked('bnActive')
  };

  if (!payload.title) return alert('배너 제목을 입력해 주세요.');
  if (!payload.image_url) return alert('배너 이미지 URL을 입력해 주세요.');

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

showSection('business'); // 기본 화면

function showSection(name) {
  document.querySelectorAll('.admin-section').forEach(el => {
    el.classList.remove('active-section');
  });

  const target = document.getElementById('section-' + name);
  if (target) {
    target.classList.add('active-section');
  }
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
  return profile;
}

// ===== ADMIN USER MANAGER (SUPER ADMIN ONLY) =====
function initAdminUserManager(){
  if(window.ADMIN_ROLE !== 'super_admin') return;

  const btn = document.getElementById('saveAdminUserBtn');
  if(!btn) return;

  btn.addEventListener('click', async ()=>{
    const email = document.getElementById('adminEmailInput').value;
    const role = document.getElementById('adminRoleSelect').value;
    const area = document.getElementById('adminAreaSelect').value;

    if(!email){
      alert('이메일을 입력하세요');
      return;
    }

    const { data: userData } = await supabase.auth.admin.listUsers();
    const user = userData?.users?.find(u => u.email === email);

    if(!user){
      alert('사용자를 찾을 수 없습니다.');
      return;
    }

    const { error } = await supabase
      .from('profiles')
      .upsert({
        user_id: user.id,
        role: role,
        area: area
      });

    if(error){
      alert('저장 실패: ' + error.message);
    }else{
      alert('저장 완료');
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