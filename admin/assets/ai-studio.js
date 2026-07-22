const $ = (id) => document.getElementById(id);
const clean = (v = '') => String(v ?? '').trim();

let businessRows = [];
let lastPackage = null;
let currentCampaignId = null;
const CAMPAIGN_STORAGE_KEY = 'daltown-ai-campaigns-v1';

const STYLE_LABELS = {
  premium: '고급스럽고 신뢰감 있는 프리미엄',
  modern: '깔끔하고 현대적인',
  minimal: '여백이 많고 간결한 미니멀',
  warm: '따뜻하고 친근한',
  energetic: '활기차고 역동적인'
};


function uid() {
  return `cmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function readCampaigns() {
  try {
    const rows = JSON.parse(localStorage.getItem(CAMPAIGN_STORAGE_KEY) || '[]');
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function writeCampaigns(rows) {
  localStorage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(rows));
}

function statusLabel(status) {
  return ({ draft: '작성중', completed: '완료', published: '게시' })[status] || '작성중';
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
}

function saveCampaign(pkg, options = {}) {
  const rows = readCampaigns();
  const now = new Date().toISOString();
  const id = options.id || pkg.id || currentCampaignId || uid();
  const existing = rows.find((row) => row.id === id);
  const status = options.status || $('aiCampaignWorkflowStatus')?.value || existing?.status || 'draft';
  const record = {
    ...pkg,
    id,
    status,
    createdAt: existing?.createdAt || pkg.createdAt || now,
    updatedAt: now
  };
  const next = [record, ...rows.filter((row) => row.id !== id)];
  writeCampaigns(next);
  currentCampaignId = id;
  lastPackage = record;
  if ($('aiCampaignWorkflowStatus')) $('aiCampaignWorkflowStatus').value = status;
  renderCampaignList();
  return record;
}

function renderCampaignList() {
  const list = $('aiCampaignList');
  const empty = $('aiCampaignListEmpty');
  if (!list || !empty) return;
  const q = clean($('aiCampaignSearch')?.value).toLowerCase();
  const status = clean($('aiCampaignStatusFilter')?.value) || 'all';
  const rows = readCampaigns().filter((row) => {
    const haystack = `${row.businessName || ''} ${row.name || ''} ${row.benefit || ''}`.toLowerCase();
    return (!q || haystack.includes(q)) && (status === 'all' || row.status === status);
  });
  list.innerHTML = rows.map((row) => {
    const updated = row.updatedAt ? new Date(row.updatedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    return `<article class="ai-campaign-row ${row.id === currentCampaignId ? 'is-active' : ''}" data-campaign-id="${escapeHtml(row.id)}">
      <div><div class="ai-campaign-title">${escapeHtml(row.name || '이름 없는 캠페인')}</div><div class="ai-campaign-meta">${escapeHtml(row.benefit || '')}</div></div>
      <div><strong>${escapeHtml(row.businessName || '업소 미지정')}</strong><div class="ai-campaign-meta">${escapeHtml(row.category || '')}</div></div>
      <div><span class="ai-status-pill ai-status-${escapeHtml(row.status || 'draft')}">${statusLabel(row.status)}</span></div>
      <div class="ai-campaign-meta">${escapeHtml(updated)}</div>
      <div class="ai-row-actions"><button class="btn secondary ai-open-campaign" type="button" data-id="${escapeHtml(row.id)}">열기</button><button class="btn ghost ai-duplicate-campaign" type="button" data-id="${escapeHtml(row.id)}">복제</button></div>
    </article>`;
  }).join('');
  empty.classList.toggle('hidden', rows.length > 0);
  list.classList.toggle('hidden', rows.length === 0);
  list.querySelectorAll('.ai-open-campaign').forEach((btn) => btn.addEventListener('click', () => openCampaign(btn.dataset.id)));
  list.querySelectorAll('.ai-duplicate-campaign').forEach((btn) => btn.addEventListener('click', () => duplicateCampaign(btn.dataset.id)));
}

function fillInput(pkg) {
  if ($('aiCampaignBusiness')) $('aiCampaignBusiness').value = String(pkg.business?.id || '');
  if ($('aiCampaignName')) $('aiCampaignName').value = pkg.name || '';
  if ($('aiCampaignBenefit')) $('aiCampaignBenefit').value = pkg.benefit || '';
  if ($('aiCampaignStart')) $('aiCampaignStart').value = pkg.start || '';
  if ($('aiCampaignEnd')) $('aiCampaignEnd').value = pkg.end || '';
  if ($('aiCampaignStyle')) $('aiCampaignStyle').value = pkg.style || 'premium';
  if ($('aiCampaignCta')) $('aiCampaignCta').value = pkg.cta || '자세히 보기';
  if ($('aiCampaignNotes')) $('aiCampaignNotes').value = pkg.notes || '';
}

function ensureCompletePackage(pkg) {
  if (!pkg) return null;
  const hasOutputs = pkg.article && pkg.banner && pkg.coupon && pkg.social && pkg.grok && pkg.runway;
  if (hasOutputs) return pkg;
  const business = pkg.business || businessRows.find((row) => String(row.id) === String(pkg.business?.id || pkg.businessId || '')) || null;
  const rebuilt = makePackage({
    business,
    businessName: clean(pkg.businessName || business?.name_ko || business?.name_en),
    category: clean(pkg.category || business?.category_ko),
    phone: clean(pkg.phone || business?.phone),
    website: clean(pkg.website || business?.website),
    address: clean(pkg.address || business?.address),
    name: clean(pkg.name),
    benefit: clean(pkg.benefit),
    start: clean(pkg.start),
    end: clean(pkg.end),
    style: clean(pkg.style) || 'premium',
    cta: clean(pkg.cta) || '자세히 보기',
    notes: clean(pkg.notes)
  });
  return { ...pkg, ...rebuilt, business: business || pkg.business };
}

function openCampaign(id) {
  const raw = readCampaigns().find((row) => row.id === id);
  if (!raw) return alert('캠페인을 찾을 수 없습니다.');
  const pkg = ensureCompletePackage(raw);
  if (pkg.article !== raw.article || pkg.banner !== raw.banner) {
    const rows = readCampaigns().map((row) => row.id === id ? { ...pkg, updatedAt: row.updatedAt || new Date().toISOString() } : row);
    writeCampaigns(rows);
  }
  currentCampaignId = id;
  fillInput(pkg);
  renderPackage(pkg, false);
  if ($('aiCampaignWorkflowStatus')) $('aiCampaignWorkflowStatus').value = pkg.status || 'draft';
  renderCampaignList();
  $('section-aiStudio')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function duplicateCampaign(id) {
  const pkg = readCampaigns().find((row) => row.id === id);
  if (!pkg) return;
  const copy = { ...pkg, id: uid(), name: `${pkg.name} 복사본`, status: 'draft', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  const rows = readCampaigns();
  writeCampaigns([copy, ...rows]);
  openCampaign(copy.id);
}

function deleteCurrentCampaign() {
  if (!currentCampaignId) return alert('삭제할 캠페인을 먼저 여세요.');
  if (!confirm('이 캠페인을 삭제할까요?')) return;
  writeCampaigns(readCampaigns().filter((row) => row.id !== currentCampaignId));
  resetForm();
  renderCampaignList();
}

function formatDate(v) {
  if (!v) return '';
  const d = new Date(`${v}T00:00:00`);
  if (Number.isNaN(d.getTime())) return v;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function getBusiness() {
  const id = clean($('aiCampaignBusiness')?.value);
  return businessRows.find((row) => String(row.id) === id) || null;
}

function collectInput() {
  const business = getBusiness();
  return {
    business,
    businessName: clean(business?.name_ko || business?.name_en),
    category: clean(business?.category_ko),
    phone: clean(business?.phone),
    website: clean(business?.website),
    address: clean(business?.address),
    name: clean($('aiCampaignName')?.value),
    benefit: clean($('aiCampaignBenefit')?.value),
    start: clean($('aiCampaignStart')?.value),
    end: clean($('aiCampaignEnd')?.value),
    style: clean($('aiCampaignStyle')?.value) || 'premium',
    cta: clean($('aiCampaignCta')?.value) || '자세히 보기',
    notes: clean($('aiCampaignNotes')?.value)
  };
}

function validate(data) {
  if (!data.businessName) return '업소를 선택하세요.';
  if (!data.name) return '캠페인·행사명을 입력하세요.';
  if (!data.benefit) return '혜택을 입력하세요.';
  return '';
}

function makePackage(d) {
  const period = d.start || d.end
    ? `${formatDate(d.start) || '시작일 미정'} ~ ${formatDate(d.end) || '종료일 미정'}`
    : '기간은 업소에 문의';
  const style = STYLE_LABELS[d.style] || STYLE_LABELS.premium;
  const facts = [d.notes, d.phone && `전화: ${d.phone}`, d.address && `주소: ${d.address}`].filter(Boolean).join('\n');
  const title = `${d.businessName}, ${d.name}`;
  const summary = `${d.businessName}에서 ${d.benefit} 혜택을 제공하는 ${d.name} 캠페인을 진행합니다.`;
  const article = `${title}\n\n${summary}\n\n${d.businessName}은(는) 이번 캠페인을 통해 고객에게 ${d.benefit} 혜택을 제공합니다. 행사 기간은 ${period}입니다. 참여 조건과 제공 내용은 방문 또는 예약 전에 업소에 다시 확인하는 것이 좋습니다.\n\n${d.notes ? `주요 안내\n${d.notes}\n\n` : ''}${d.cta}: ${d.phone || d.website || '업소 상세페이지에서 확인'}\n\n※ 본 문안은 입력된 정보만을 바탕으로 작성된 초안입니다. 게시 전 가격, 기간, 조건을 반드시 확인하세요.`;
  const banner = `메인 문구: ${d.name}\n보조 문구: ${d.benefit}\n업소명: ${d.businessName}\n기간: ${period}\n버튼: ${d.cta}\n디자인 방향: ${style} 광고 배너, 글자는 선명하고 모바일에서도 읽기 쉽게, 과도한 장식 없이 업소와 혜택을 가장 크게 표시`;
  const couponCode = `${d.businessName.replace(/\s+/g, '').slice(0, 6).toUpperCase()}-${new Date().getMonth() + 1}`;
  const coupon = `쿠폰 제목: ${d.name}\n할인·혜택: ${d.benefit}\n사용 기간: ${period}\n쿠폰 코드 예시: ${couponCode}\n사용 방법: 직원에게 쿠폰 화면 제시\n주의사항: 다른 행사와 중복 적용 여부 및 세부 조건은 업소 확인 필요\n버튼: ${d.cta}`;
  const social = `${d.businessName}에서 ${d.name}을(를) 진행합니다.\n\n🎁 혜택: ${d.benefit}\n📅 기간: ${period}\n${d.address ? `📍 ${d.address}\n` : ''}${d.phone ? `☎️ ${d.phone}\n` : ''}\n${d.notes ? `${d.notes}\n\n` : ''}${d.cta}\n\n#달라스 #달타운맵 #${d.category.replace(/\s+/g, '') || '지역업소'} #이벤트`;
  const grok = `[Grok 이미지 생성 프롬프트]\n${d.businessName}의 “${d.name}” 광고 이미지를 제작해 주세요. ${style} 스타일. 핵심 혜택은 “${d.benefit}”. 업종은 “${d.category || '지역 비즈니스'}”. 실제 로고나 상표를 임의로 만들지 말고, 한글 텍스트를 이미지에 직접 넣기보다는 텍스트를 배치할 깨끗한 여백을 확보해 주세요. 16:9 배너, 1:1 SNS, 9:16 스토리 버전의 구도를 각각 제안해 주세요. 고해상도, 자연스러운 조명, 과장되거나 사실과 다른 장면 금지.\n\n[Grok 영상 구성 프롬프트]\n${d.businessName}의 ${d.name} 15초 광고 영상을 기획해 주세요. 장면 4개, 고정적이고 부드러운 카메라, 자막은 짧게. Scene 1 업종과 분위기를 보여주는 오프닝, Scene 2 핵심 서비스, Scene 3 혜택 “${d.benefit}”, Scene 4 업소명과 CTA “${d.cta}”. 각 장면의 이미지 생성 프롬프트, 화면 자막, 권장 길이를 표로 작성해 주세요. 확인되지 않은 가격이나 조건은 만들지 마세요.`;
  const runway = `[Runway image-to-video 프롬프트]\nCreate a polished 15-second local business advertisement for ${d.businessName}. ${style} visual direction. Use four short scenes with subtle natural motion, stable camera, realistic lighting, no distorted hands or faces, no invented logos, no camera shake, and no sudden zoom. Emphasize the promotion: ${d.benefit}. End with clean space for the Korean call-to-action: ${d.cta}.\n\nScene plan\n1) 0–3s: Establishing visual for ${d.category || 'the business'}\n2) 3–7s: Close-up of the main service or product\n3) 7–11s: Benefit-focused visual, leave room for “${d.benefit}”\n4) 11–15s: Calm branded ending, leave room for business name and CTA\n\nNegative prompt: unreadable text, warped objects, extra fingers, fake logos, aggressive camera movement, flicker, low resolution.`;
  return { ...d, title, summary, article, banner, coupon, social, grok, runway, period, couponCode, facts };
}

function setOutput(id, value) {
  const el = $(id);
  if (el) el.value = value;
}

function renderPackage(pkg, persist = true) {
  lastPackage = pkg;
  setOutput('aiArticleResult', pkg.article);
  setOutput('aiBannerResult', pkg.banner);
  setOutput('aiCouponResult', pkg.coupon);
  setOutput('aiSocialResult', pkg.social);
  setOutput('aiGrokResult', pkg.grok);
  setOutput('aiRunwayResult', pkg.runway);
  $('aiCampaignEmpty')?.classList.add('hidden');
  $('aiCampaignResults')?.classList.remove('hidden');
  if ($('aiCampaignStatus')) $('aiCampaignStatus').textContent = `${pkg.businessName} · ${pkg.name} 캠페인 상세입니다.`;
  if (persist) {
    const saved = saveCampaign(pkg, { id: currentCampaignId || undefined });
    lastPackage = saved;
    if ($('aiCampaignStatus')) $('aiCampaignStatus').textContent = `${saved.businessName} · ${saved.name} 캠페인이 자동 저장되었습니다.`;
  }
}

async function copyText(text) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

function switchSection(name) {
  const btn = document.querySelector(`#adminNav .nav-item[data-section="${name}"]`);
  btn?.click();
}

function sendDalpick() {
  if (!lastPackage) return alert('먼저 캠페인을 생성하세요.');
  switchSection('dalpick');
  setTimeout(() => {
    const map = {
      dalpick_business_id: String(lastPackage.business?.id || ''),
      dalpick_title: lastPackage.title,
      dalpick_summary: lastPackage.summary,
      dalpick_content: lastPackage.article,
      dalpick_instructions: lastPackage.notes
    };
    Object.entries(map).forEach(([id, value]) => { if ($(id)) $(id).value = value; });
    if ($('dalpick_category')) $('dalpick_category').value = 'recommended';
    $('dalpick_title')?.focus();
  }, 50);
}

function setValueWhenReady(id, value) {
  const el = $(id);
  if (!el) return false;
  if (el.type === 'checkbox') el.checked = Boolean(value);
  else el.value = value ?? '';
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

function sendBanner() {
  if (!lastPackage) return alert('먼저 캠페인을 생성하거나 목록에서 여세요.');
  lastPackage = ensureCompletePackage(lastPackage);
  const businessId = String(lastPackage.business?.id || '');
  const bannerDraft = {
    title: `${lastPackage.businessName} · ${lastPackage.name}`,
    description: `${lastPackage.benefit}${lastPackage.notes ? `\n${lastPackage.notes}` : ''}`,
    buttonLabel: lastPackage.cta || '자세히 보기',
    region: lastPackage.business?.region || window.getAppRegion?.() || 'dallas',
    businessId,
    placement: businessId ? 'detail' : 'home',
    displayType: 'banner',
    startAt: lastPackage.start ? `${lastPackage.start}T00:00` : '',
    endAt: lastPackage.end ? `${lastPackage.end}T23:59` : '',
    campaignId: lastPackage.id || currentCampaignId || '',
    campaignPrompt: lastPackage.banner || ''
  };
  sessionStorage.setItem('daltown-banner-draft-v1', JSON.stringify(bannerDraft));
  switchSection('banners');

  let tries = 0;
  const applyDraft = () => {
    tries += 1;
    setValueWhenReady('bnTitle', bannerDraft.title);
    setValueWhenReady('bnDescription', bannerDraft.description);
    setValueWhenReady('bnButtonLabel', bannerDraft.buttonLabel);
    setValueWhenReady('bnRegion', bannerDraft.region);
    setValueWhenReady('bnDisplayType', bannerDraft.displayType);
    setValueWhenReady('bnPlacement', bannerDraft.placement);
    setValueWhenReady('bnStartAt', bannerDraft.startAt);
    setValueWhenReady('bnEndAt', bannerDraft.endAt);
    setValueWhenReady('bnActive', true);
    if (businessId) {
      setValueWhenReady('bnBusinessId', businessId);
      setValueWhenReady('bnBusinessSearch', lastPackage.businessName || '');
      setValueWhenReady('bnBusinessSelect', businessId);
    }
    const image = $('bnImage');
    if (image || tries >= 12) {
      image?.focus();
      const formPanel = image?.closest('.form-panel') || $('section-banners');
      formPanel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      alert('캠페인 내용을 배너 입력란에 불러왔습니다. 이미지 URL을 넣거나 이미지 파일을 업로드한 뒤 저장하세요.');
      return;
    }
    setTimeout(applyDraft, 100);
  };
  setTimeout(applyDraft, 80);
}

function sendCoupon() {
  if (!lastPackage) return alert('먼저 캠페인을 생성하세요.');
  switchSection('coupon');
  setTimeout(() => {
    const set = (id, value) => { if ($(id)) $(id).value = value ?? ''; };
    set('coupon_business_id', String(lastPackage.business?.id || ''));
    set('coupon_title', lastPackage.name);
    set('coupon_code', lastPackage.couponCode);
    set('coupon_discount_label', lastPackage.benefit);
    set('coupon_description', `${lastPackage.benefit}\n${lastPackage.notes}`.trim());
    set('coupon_start_at', lastPackage.start ? `${lastPackage.start}T00:00` : '');
    set('coupon_end_at', lastPackage.end ? `${lastPackage.end}T23:59` : '');
    if ($('coupon_is_active')) $('coupon_is_active').checked = true;
    $('coupon_title')?.focus();
  }, 50);
}

function fillBusinessOptions(rows) {
  businessRows = Array.isArray(rows) ? rows : [];
  const select = $('aiCampaignBusiness');
  if (!select) return;
  const current = select.value;
  select.innerHTML = '<option value="">업소를 선택하세요</option>' + businessRows
    .map((b) => `<option value="${String(b.id).replace(/"/g, '&quot;')}">${clean(b.name_ko || b.name_en || b.id)}</option>`)
    .join('');
  if (businessRows.some((b) => String(b.id) === current)) select.value = current;
}

function seasonIdeas() {
  const month = new Date().getMonth() + 1;
  const map = {
    1: ['신년 감사 이벤트', '건강관리 새해 계획', '겨울 특별 할인'],
    2: ['설 명절 감사 행사', '발렌타인 이벤트', '봄 준비 프로모션'],
    3: ['봄맞이 이벤트', '세금·재정 상담', '새 학기 프로모션'],
    4: ['봄 나들이 특가', '가정의 달 사전 예약', '집수리 시즌'],
    5: ['가정의 달 감사 행사', '졸업 시즌 이벤트', '여름 준비 프로모션'],
    6: ['여름맞이 이벤트', '휴가 준비 할인', '냉방·자동차 점검'],
    7: ['여름 특별 이벤트', '폭염 건강관리', '여름 별미 프로모션'],
    8: ['개학 준비 이벤트', '여름 마감 특가', '가을 사전 예약'],
    9: ['가을맞이 이벤트', '추석 감사 행사', '주택·재정 상담'],
    10: ['가을 축제 프로모션', '할로윈 이벤트', '연말 사전 예약'],
    11: ['추수감사절 이벤트', '블랙프라이데이 특가', '연말 모임 예약'],
    12: ['크리스마스 이벤트', '송년 감사 행사', '신년 사전 예약']
  };
  const el = $('aiSeasonIdeas');
  if (!el) return;
  el.innerHTML = map[month].map((idea) => `<button type="button" class="ai-season-chip">${idea}</button>`).join('');
  el.querySelectorAll('.ai-season-chip').forEach((btn) => btn.addEventListener('click', () => {
    if ($('aiCampaignName')) $('aiCampaignName').value = btn.textContent;
  }));
}

function resetForm() {
  $('aiCampaignForm')?.reset();
  lastPackage = null;
  currentCampaignId = null;
  if ($('aiCampaignWorkflowStatus')) $('aiCampaignWorkflowStatus').value = 'draft';
  $('aiCampaignResults')?.classList.add('hidden');
  $('aiCampaignEmpty')?.classList.remove('hidden');
  if ($('aiCampaignStatus')) $('aiCampaignStatus').textContent = '정보를 입력하고 캠페인 생성 버튼을 누르세요.';
}

function init() {
  seasonIdeas();
  $('aiCampaignGenerateBtn')?.addEventListener('click', () => {
    const data = collectInput();
    const error = validate(data);
    if (error) return alert(error);
    renderPackage(makePackage(data));
  });
  $('aiCampaignResetBtn')?.addEventListener('click', resetForm);
  $('aiCopyAllBtn')?.addEventListener('click', async () => {
    if (!lastPackage) return alert('먼저 캠페인을 생성하세요.');
    await copyText([lastPackage.article, lastPackage.banner, lastPackage.coupon, lastPackage.social, lastPackage.grok, lastPackage.runway].join('\n\n--------------------\n\n'));
    alert('전체 캠페인 문안을 복사했습니다.');
  });
  document.querySelectorAll('.ai-copy-btn').forEach((btn) => btn.addEventListener('click', async () => {
    await copyText($(btn.dataset.copyTarget)?.value || '');
    btn.textContent = '복사됨';
    setTimeout(() => { btn.textContent = '복사'; }, 1000);
  }));
  $('aiSendDalpickBtn')?.addEventListener('click', sendDalpick);
  $('aiSendBannerBtn')?.addEventListener('click', sendBanner);
  $('aiCampaignRegisterBannerBtn')?.addEventListener('click', sendBanner);
  $('aiSendCouponBtn')?.addEventListener('click', sendCoupon);
  $('aiCampaignSaveBtn')?.addEventListener('click', () => {
    if (!lastPackage) return alert('먼저 캠페인을 생성하거나 목록에서 여세요.');
    const data = collectInput();
    const error = validate(data);
    if (error) return alert(error);
    const updated = makePackage(data);
    const saved = saveCampaign(updated, { id: currentCampaignId || undefined, status: $('aiCampaignWorkflowStatus')?.value || 'draft' });
    renderPackage(saved, false);
    alert('캠페인 수정 내용을 저장했습니다.');
  });
  $('aiCampaignDeleteBtn')?.addEventListener('click', deleteCurrentCampaign);
  $('aiCampaignWorkflowStatus')?.addEventListener('change', () => {
    if (!lastPackage || !currentCampaignId) return;
    saveCampaign(lastPackage, { id: currentCampaignId, status: $('aiCampaignWorkflowStatus').value });
  });
  $('aiCampaignSearch')?.addEventListener('input', renderCampaignList);
  $('aiCampaignStatusFilter')?.addEventListener('change', renderCampaignList);
  renderCampaignList();

  window.addEventListener('kfocus:businesses-loaded', (event) => fillBusinessOptions(event.detail || []));
  if (window.KFocusAdminBridge?.getBusinesses) fillBusinessOptions(window.KFocusAdminBridge.getBusinesses());
}

document.addEventListener('DOMContentLoaded', init);
