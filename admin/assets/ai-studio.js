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

const DEFAULT_ASSETS = ['article', 'banner', 'coupon', 'social'];
function selectedAssets() {
  return [...document.querySelectorAll('#aiAssetSelector input[type="checkbox"]:checked')].map((el) => el.value);
}
function applySelectedAssets(assets) {
  const set = new Set(Array.isArray(assets) && assets.length ? assets : DEFAULT_ASSETS);
  document.querySelectorAll('#aiAssetSelector input[type="checkbox"]').forEach((el) => { el.checked = set.has(el.value); });
  syncAssetCards();
}
function syncAssetCards() {
  const set = new Set(selectedAssets());
  document.querySelectorAll('[data-asset-result]').forEach((el) => el.classList.toggle('asset-hidden', !set.has(el.dataset.assetResult)));
  ['aiCouponType','aiCouponStyle','aiCouponCode','aiCouponUsage','aiCouponToday'].forEach((id) => {
    const field = $(id)?.closest('.field');
    if (field) field.classList.toggle('hidden', !set.has('coupon'));
  });
}


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
    return `<article class="ai-campaign-row ${row.id === currentCampaignId ? 'is-active' : ''}" data-campaign-id="${escapeHtml(row.id)}" tabindex="0" role="button" aria-label="${escapeHtml(row.name || '캠페인')} 열기">
      <div><div class="ai-campaign-title">${escapeHtml(row.name || '이름 없는 캠페인')}</div><div class="ai-campaign-meta">${escapeHtml(row.benefit || '')}</div></div>
      <div><strong>${escapeHtml(row.businessName || '업소 미지정')}</strong><div class="ai-campaign-meta">${escapeHtml(row.category || '')}</div></div>
      <div><span class="ai-status-pill ai-status-${escapeHtml(row.status || 'draft')}">${statusLabel(row.status)}</span></div>
      <div class="ai-campaign-meta">${escapeHtml(updated)}</div>
      <div class="ai-row-actions"><button class="btn secondary ai-open-campaign" type="button" data-id="${escapeHtml(row.id)}">수정</button><button class="btn ghost ai-duplicate-campaign" type="button" data-id="${escapeHtml(row.id)}">복제</button><button class="btn danger ai-delete-campaign" type="button" data-id="${escapeHtml(row.id)}">삭제</button></div>
    </article>`;
  }).join('');
  empty.classList.toggle('hidden', rows.length > 0);
  list.classList.toggle('hidden', rows.length === 0);

  list.querySelectorAll('.ai-campaign-row').forEach((row) => {
    const open = () => openCampaign(row.dataset.campaignId);
    row.addEventListener('click', (event) => {
      if (!event.target.closest('button')) open();
    });
    row.addEventListener('keydown', (event) => {
      if ((event.key === 'Enter' || event.key === ' ') && !event.target.closest('button')) {
        event.preventDefault();
        open();
      }
    });
  });
  list.querySelectorAll('.ai-open-campaign').forEach((btn) => btn.addEventListener('click', () => openCampaign(btn.dataset.id)));
  list.querySelectorAll('.ai-duplicate-campaign').forEach((btn) => btn.addEventListener('click', () => duplicateCampaign(btn.dataset.id)));
  list.querySelectorAll('.ai-delete-campaign').forEach((btn) => btn.addEventListener('click', () => deleteCampaignById(btn.dataset.id)));
}

function fillInput(pkg) {
  if ($('aiCampaignBusiness')) $('aiCampaignBusiness').value = String(pkg.business?.id || pkg.businessId || '');
  if ($('aiCampaignName')) $('aiCampaignName').value = pkg.name || '';
  if ($('aiCampaignBenefit')) $('aiCampaignBenefit').value = pkg.benefit || '';
  if ($('aiCampaignStart')) $('aiCampaignStart').value = pkg.start || '';
  if ($('aiCampaignEnd')) $('aiCampaignEnd').value = pkg.end || '';
  if ($('aiCampaignStyle')) $('aiCampaignStyle').value = pkg.style || 'premium';
  if ($('aiCampaignCta')) $('aiCampaignCta').value = pkg.cta || '자세히 보기';
  if ($('aiCampaignNotes')) $('aiCampaignNotes').value = pkg.notes || '';
  if ($('aiCouponType')) $('aiCouponType').value = pkg.couponType || 'discount';
  if ($('aiCouponStyle')) $('aiCouponStyle').value = pkg.couponStyle || 'premium';
  if ($('aiCouponCode')) $('aiCouponCode').value = pkg.customCouponCode || '';
  if ($('aiCouponUsage')) $('aiCouponUsage').value = pkg.couponUsage || '직원에게 쿠폰 화면 제시';
  if ($('aiCouponToday')) $('aiCouponToday').checked = pkg.couponToday !== false;
  applySelectedAssets(pkg.assets || DEFAULT_ASSETS);
}


function ensureCompletePackage(pkg) {
  if (!pkg) return null;
  const hasOutputs = pkg.article && pkg.banner && pkg.coupon && pkg.social && pkg.grok && pkg.runway;
  if (hasOutputs) return pkg;
  const business = pkg.business || businessRows.find((row) => String(row.id) === String(pkg.business?.id || pkg.businessId || '')) || null;
  const rebuilt = makePackage({
    assets: Array.isArray(pkg.assets) && pkg.assets.length ? pkg.assets : DEFAULT_ASSETS,
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
    notes: clean(pkg.notes),
    couponType: clean(pkg.couponType) || 'discount',
    couponStyle: clean(pkg.couponStyle) || 'premium',
    customCouponCode: clean(pkg.customCouponCode),
    couponUsage: clean(pkg.couponUsage) || '직원에게 쿠폰 화면 제시',
    couponToday: Boolean(pkg.couponToday)
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

function deleteCampaignById(id) {
  const campaign = readCampaigns().find((row) => row.id === id);
  if (!campaign) return alert('삭제할 캠페인을 찾을 수 없습니다.');
  if (!confirm(`“${campaign.name || '이 캠페인'}”을 삭제할까요?\n삭제한 캠페인은 복구할 수 없습니다.`)) return;
  writeCampaigns(readCampaigns().filter((row) => row.id !== id));
  if (currentCampaignId === id) resetForm();
  renderCampaignList();
}

function deleteCurrentCampaign() {
  if (!currentCampaignId) return alert('삭제할 캠페인을 목록에서 먼저 선택하세요.');
  deleteCampaignById(currentCampaignId);
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
    assets: selectedAssets(),
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
    notes: clean($('aiCampaignNotes')?.value),
    couponType: clean($('aiCouponType')?.value) || 'discount',
    couponStyle: clean($('aiCouponStyle')?.value) || 'premium',
    customCouponCode: clean($('aiCouponCode')?.value),
    couponUsage: clean($('aiCouponUsage')?.value) || '직원에게 쿠폰 화면 제시',
    couponToday: Boolean($('aiCouponToday')?.checked)
  };
}

function validate(data) {
  if (!data.assets || !data.assets.length) return '만들 제작물을 하나 이상 선택하세요.';
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
  const couponCode = d.customCouponCode || `${d.businessName.replace(/\s+/g, '').slice(0, 6).toUpperCase()}-${new Date().getMonth() + 1}`;
  const couponTypeLabel = ({ discount: '할인', free: '무료', gift: '사은품', event: '이벤트', reservation: '예약', limited: '기간 한정' })[d.couponType] || '할인';
  const couponStyleLabel = ({ premium: 'Premium', modern: 'Modern', luxury: 'Luxury', minimal: 'Minimal' })[d.couponStyle] || 'Premium';
  const couponDesigns = [
    `Style A · Premium: 어두운 고급 배경, 금색 포인트, 혜택 문구를 가장 크게, 업소명과 기간은 작게`,
    `Style B · Modern: 밝은 흰색 배경, 선명한 컬러 블록, 모바일 가독성 중심`,
    `Style C · Luxury: 고급 소재 질감과 여백, 차분한 타이포그래피, 과장 없는 프리미엄 분위기`,
    `Style D · Minimal: 이미지 한 장과 핵심 혜택만 강조, 불필요한 장식 제거`
  ].join('\n');
  const couponImagePrompt = `[Grok 쿠폰 이미지 생성 프롬프트]\n${d.businessName}의 “${d.name}” 쿠폰 이미지를 제작해 주세요. 쿠폰 유형은 ${couponTypeLabel}, 핵심 혜택은 “${d.benefit}”, 기본 스타일은 ${couponStyleLabel}. 한글 문구가 들어갈 깨끗한 여백을 확보하고, 실제 로고를 임의로 만들지 마세요. 1:1 정사각형과 16:9 가로형 두 버전의 구도를 제안해 주세요. 쿠폰 코드 ${couponCode}, 기간 ${period}, CTA ${d.cta}.\n\n${couponDesigns}`;
  const coupon = `쿠폰 제목: ${d.name}\n쿠폰 유형: ${couponTypeLabel}\n할인·혜택: ${d.benefit}\n사용 기간: ${period}\n쿠폰 코드: ${couponCode}\n사용 방법: ${d.couponUsage || '직원에게 쿠폰 화면 제시'}\n오늘의 쿠폰: ${d.couponToday ? '표시' : '표시 안 함'}\n주의사항: 다른 행사와 중복 적용 여부 및 세부 조건은 업소 확인 필요\n버튼: ${d.cta}\n\n${couponImagePrompt}`;
  const social = `${d.businessName}에서 ${d.name}을(를) 진행합니다.\n\n🎁 혜택: ${d.benefit}\n📅 기간: ${period}\n${d.address ? `📍 ${d.address}\n` : ''}${d.phone ? `☎️ ${d.phone}\n` : ''}\n${d.notes ? `${d.notes}\n\n` : ''}${d.cta}\n\n#달라스 #달타운맵 #${d.category.replace(/\s+/g, '') || '지역업소'} #이벤트`;
  const poster = `[포스터 제작안]
형식: A4 세로형 및 4:5 디지털 포스터
제목: ${d.name}
업소명: ${d.businessName}
핵심 혜택: ${d.benefit}
기간: ${period}
CTA: ${d.cta}
디자인: ${style}, 상단에는 강한 제목, 중앙에는 관련 대표 이미지, 하단에는 기간·연락처·CTA를 명확하게 배치

[ChatGPT 이미지 생성용 프롬프트]
${d.businessName}의 “${d.name}” 홍보 포스터를 제작한다. ${style} 스타일, A4 세로형, 한글 제목과 혜택을 정확히 읽을 수 있도록 넓은 텍스트 영역을 확보한다. 실제 로고를 임의로 만들지 않는다. 제목 “${d.name}”, 혜택 “${d.benefit}”, 기간 “${period}”, CTA “${d.cta}”를 사용한다.`;
  const thumbnail = `[유튜브·숏폼 썸네일 제작안]
메인 제목: ${d.name}
보조 문구: ${d.benefit}
업소명: ${d.businessName}
권장 비율: YouTube 16:9 / Shorts 9:16
구성: 핵심 이미지 1개, 큰 제목 6~12자, 보조 문구 1줄, 모바일에서 즉시 읽히는 대비

[ChatGPT 이미지 생성용 프롬프트]
${d.businessName}의 “${d.name}” 유튜브 썸네일을 제작한다. ${style} 스타일, 강한 시각적 대비, 제목 “${d.name}”과 혜택 “${d.benefit}”이 선명하게 보이게 한다. 16:9와 9:16 두 구도를 제안하고, 과도한 글자나 가짜 로고는 사용하지 않는다.`;
  const grok = `[Grok 이미지 생성 프롬프트]\n${d.businessName}의 “${d.name}” 광고 이미지를 제작해 주세요. ${style} 스타일. 핵심 혜택은 “${d.benefit}”. 업종은 “${d.category || '지역 비즈니스'}”. 실제 로고나 상표를 임의로 만들지 말고, 한글 텍스트를 이미지에 직접 넣기보다는 텍스트를 배치할 깨끗한 여백을 확보해 주세요. 16:9 배너, 1:1 SNS, 9:16 스토리 버전의 구도를 각각 제안해 주세요. 고해상도, 자연스러운 조명, 과장되거나 사실과 다른 장면 금지.\n\n[Grok 영상 구성 프롬프트]\n${d.businessName}의 ${d.name} 15초 광고 영상을 기획해 주세요. 장면 4개, 고정적이고 부드러운 카메라, 자막은 짧게. Scene 1 업종과 분위기를 보여주는 오프닝, Scene 2 핵심 서비스, Scene 3 혜택 “${d.benefit}”, Scene 4 업소명과 CTA “${d.cta}”. 각 장면의 이미지 생성 프롬프트, 화면 자막, 권장 길이를 표로 작성해 주세요. 확인되지 않은 가격이나 조건은 만들지 마세요.`;
  const runway = `[Runway image-to-video 프롬프트]\nCreate a polished 15-second local business advertisement for ${d.businessName}. ${style} visual direction. Use four short scenes with subtle natural motion, stable camera, realistic lighting, no distorted hands or faces, no invented logos, no camera shake, and no sudden zoom. Emphasize the promotion: ${d.benefit}. End with clean space for the Korean call-to-action: ${d.cta}.\n\nScene plan\n1) 0–3s: Establishing visual for ${d.category || 'the business'}\n2) 3–7s: Close-up of the main service or product\n3) 7–11s: Benefit-focused visual, leave room for “${d.benefit}”\n4) 11–15s: Calm branded ending, leave room for business name and CTA\n\nNegative prompt: unreadable text, warped objects, extra fingers, fake logos, aggressive camera movement, flicker, low resolution.`;
  return { ...d, title, summary, article, banner, coupon, poster, social, thumbnail, grok, runway, period, couponCode, facts };
}

function setOutput(id, value) {
  const el = $(id);
  if (el) el.value = value;
}

function renderPackage(pkg, persist = true) {
  lastPackage = pkg;
  updateEditorState(true);
  setOutput('aiArticleResult', pkg.article);
  setOutput('aiBannerResult', pkg.banner);
  setOutput('aiCouponResult', pkg.coupon);
  setOutput('aiPosterResult', pkg.poster);
  setOutput('aiSocialResult', pkg.social);
  setOutput('aiThumbnailResult', pkg.thumbnail);
  setOutput('aiGrokResult', pkg.grok);
  setOutput('aiRunwayResult', pkg.runway);
  applySelectedAssets(pkg.assets || DEFAULT_ASSETS);
  ['banner','coupon','poster','social','thumbnail'].forEach((asset) => renderGeneratedPreview(asset, pkg.generatedImages?.[asset] || ''));
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
    campaignPrompt: lastPackage.banner || '',
    imageUrl: lastPackage.generatedImages?.banner || ''
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
    if (bannerDraft.imageUrl) setValueWhenReady('bnImage', bannerDraft.imageUrl);
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
      alert(bannerDraft.imageUrl ? '생성된 이미지와 캠페인 내용을 배너 입력란에 불러왔습니다. 확인 후 저장하세요.' : '캠페인 내용을 배너 입력란에 불러왔습니다. 이미지를 생성하거나 이미지 URL을 넣은 뒤 저장하세요.');
      return;
    }
    setTimeout(applyDraft, 100);
  };
  setTimeout(applyDraft, 80);
}

function sendCoupon() {
  if (!lastPackage) return alert('먼저 캠페인을 생성하거나 목록에서 여세요.');
  lastPackage = ensureCompletePackage(lastPackage);
  const couponDraft = {
    businessId: String(lastPackage.business?.id || ''),
    title: lastPackage.name || '',
    code: lastPackage.couponCode || '',
    discountLabel: lastPackage.benefit || '',
    description: [lastPackage.benefit, lastPackage.notes, lastPackage.couponUsage].filter(Boolean).join('\n'),
    startAt: lastPackage.start ? `${lastPackage.start}T00:00` : '',
    endAt: lastPackage.end ? `${lastPackage.end}T23:59` : '',
    isToday: Boolean(lastPackage.couponToday),
    campaignId: lastPackage.id || currentCampaignId || '',
    imagePrompt: lastPackage.coupon || '',
    imageUrl: lastPackage.generatedImages?.coupon || ''
  };
  sessionStorage.setItem('daltown-coupon-draft-v1', JSON.stringify(couponDraft));
  switchSection('coupon');

  let tries = 0;
  const applyDraft = () => {
    tries += 1;
    setValueWhenReady('coupon_business_id', couponDraft.businessId);
    setValueWhenReady('coupon_title', couponDraft.title);
    setValueWhenReady('coupon_code', couponDraft.code);
    setValueWhenReady('coupon_discount_label', couponDraft.discountLabel);
    setValueWhenReady('coupon_description', couponDraft.description);
    setValueWhenReady('coupon_start_at', couponDraft.startAt);
    setValueWhenReady('coupon_end_at', couponDraft.endAt);
    if (couponDraft.imageUrl) setValueWhenReady('coupon_image_url', couponDraft.imageUrl);
    setValueWhenReady('coupon_is_active', true);
    setValueWhenReady('coupon_is_today', couponDraft.isToday);
    const image = $('coupon_image_url');
    if (image || tries >= 12) {
      image?.focus();
      image?.closest('.form-panel, .card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      alert(couponDraft.imageUrl ? '생성된 이미지와 쿠폰 내용을 쿠폰 관리에 불러왔습니다. 확인 후 저장하세요.' : 'AI 캠페인의 쿠폰 내용을 불러왔습니다. 이미지를 생성하거나 이미지 URL을 입력한 뒤 저장하세요.');
      return;
    }
    setTimeout(applyDraft, 100);
  };
  setTimeout(applyDraft, 80);
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


function buildChatGPTImagePrompt(asset, pkg) {
  const style = STYLE_LABELS[pkg.style] || pkg.style || '프리미엄';
  const exactText = {
    banner: [`${pkg.name}`, `${pkg.benefit}`, `${pkg.businessName}`, `${pkg.cta}`],
    coupon: [`${pkg.name}`, `${pkg.benefit}`, `${pkg.businessName}`, `${pkg.period}`, `${pkg.couponCode}`],
    poster: [`${pkg.name}`, `${pkg.benefit}`, `${pkg.businessName}`, `${pkg.period}`, `${pkg.cta}`],
    social: [`${pkg.name}`, `${pkg.benefit}`, `${pkg.businessName}`],
    thumbnail: [`${pkg.name}`, `${pkg.benefit}`, `${pkg.businessName}`]
  }[asset] || [];
  const specs = {
    banner: '업소 상세페이지용 16:9 가로 배너. 모바일에서도 제목과 혜택이 또렷하게 보이게 구성하고, CTA 버튼 영역을 포함한다.',
    coupon: '1:1 정사각형 쿠폰 이미지. 혜택을 가장 크게 표시하고 쿠폰 코드와 기간을 정확히 넣는다.',
    poster: 'A4 세로 포스터와 4:5 SNS 포스터에 모두 사용할 수 있는 세로형 구성.',
    social: '인스타그램 1:1 정사각형 광고 이미지. 핵심 혜택과 업소명을 간결하게 표시한다.',
    thumbnail: 'YouTube 16:9 썸네일. 큰 제목, 강한 대비, 모바일 가독성을 우선한다.'
  }[asset] || '광고 이미지';
  return `DalTownMap 지역 비즈니스 광고 이미지를 만들어 주세요.\n\n형식: ${specs}\n스타일: ${style}\n업소명: ${pkg.businessName}\n캠페인: ${pkg.name}\n혜택: ${pkg.benefit}\n기간: ${pkg.period}\nCTA: ${pkg.cta}\n\n이미지 안에 아래 한국어 문구를 철자와 띄어쓰기를 바꾸지 말고 정확히 넣어 주세요:\n${exactText.map((t, i) => `${i + 1}. “${t}”`).join('\n')}\n\n중요 조건:\n- 한국어 글자가 깨지거나 다른 언어로 바뀌지 않게 한다.\n- 실제 로고가 제공되지 않았으므로 임의의 로고를 만들지 않는다.\n- 과장된 가격, 할인율, 연락처 등 입력되지 않은 사실을 추가하지 않는다.\n- 텍스트가 배경과 겹치지 않게 충분한 여백과 대비를 둔다.\n- 완성된 광고 이미지만 생성한다.`;
}

async function openChatGPTImage(asset) {
  if (!lastPackage) return alert('먼저 캠페인을 생성하거나 목록에서 여세요.');
  const prompt = buildChatGPTImagePrompt(asset, ensureCompletePackage(lastPackage));
  await copyText(prompt);
  const popup = window.open('https://chatgpt.com/', '_blank', 'noopener,noreferrer');
  if (!popup) {
    alert('ChatGPT 이미지 프롬프트를 복사했습니다. 새 탭이 차단되었으면 ChatGPT를 직접 열어 붙여넣으세요.');
    return;
  }
  alert('ChatGPT 이미지 프롬프트를 복사하고 ChatGPT를 새 탭에서 열었습니다. 입력창에 붙여넣고 이미지를 생성하세요.');
}


const GENERATED_ASSET_LABELS = { banner:'배너', coupon:'쿠폰', poster:'포스터', social:'SNS 이미지', thumbnail:'썸네일' };

function base64ToBlob(base64, mime = 'image/png') {
  const bytes = atob(base64);
  const array = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) array[i] = bytes.charCodeAt(i);
  return new Blob([array], { type: mime });
}

function loadImageFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('생성 이미지를 읽지 못했습니다.')); };
    image.src = url;
  });
}

function wrapCanvasText(ctx, text, maxWidth) {
  const source = clean(text);
  if (!source) return [];
  const words = source.split(/\s+/);
  const lines = [];
  let line = '';
  words.forEach((word) => {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; }
    else line = test;
  });
  if (line) lines.push(line);
  return lines;
}

async function composeCampaignImage(asset, backgroundBlob, pkg) {
  const image = await loadImageFromBlob(backgroundBlob);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  const portrait = canvas.height > canvas.width;
  const square = Math.abs(canvas.width - canvas.height) < 30;
  const pad = Math.round(canvas.width * 0.06);
  const panelW = portrait ? canvas.width - pad * 2 : Math.round(canvas.width * 0.58);
  const panelX = pad;
  const panelY = portrait ? Math.round(canvas.height * 0.48) : pad;
  const panelH = portrait ? canvas.height - panelY - pad : canvas.height - pad * 2;

  const grad = ctx.createLinearGradient(panelX, panelY, panelX + panelW, panelY);
  grad.addColorStop(0, 'rgba(0,0,0,.84)');
  grad.addColorStop(0.72, 'rgba(0,0,0,.54)');
  grad.addColorStop(1, 'rgba(0,0,0,.08)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  const r = Math.round(canvas.width * 0.025);
  ctx.roundRect(panelX, panelY, panelW, panelH, r);
  ctx.fill();

  const innerX = panelX + Math.round(pad * 0.62);
  const maxTextW = panelW - Math.round(pad * 1.2);
  let y = panelY + Math.round(panelH * 0.14);
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#fff';
  ctx.shadowColor = 'rgba(0,0,0,.5)';
  ctx.shadowBlur = 8;

  const businessSize = Math.max(24, Math.round(canvas.width * 0.025));
  ctx.font = `700 ${businessSize}px Arial, "Noto Sans KR", sans-serif`;
  ctx.fillStyle = '#dbeafe';
  ctx.fillText(pkg.businessName || '', innerX, y);
  y += Math.round(businessSize * 1.55);

  const titleSize = Math.max(42, Math.round(canvas.width * (portrait ? 0.064 : square ? 0.058 : 0.048)));
  ctx.font = `900 ${titleSize}px Arial, "Noto Sans KR", sans-serif`;
  ctx.fillStyle = '#fff';
  const titleLines = wrapCanvasText(ctx, pkg.name || '', maxTextW).slice(0, 3);
  titleLines.forEach((line) => { ctx.fillText(line, innerX, y); y += Math.round(titleSize * 1.12); });

  const benefitSize = Math.max(27, Math.round(canvas.width * 0.029));
  ctx.font = `700 ${benefitSize}px Arial, "Noto Sans KR", sans-serif`;
  ctx.fillStyle = '#fde68a';
  y += Math.round(benefitSize * .4);
  wrapCanvasText(ctx, pkg.benefit || '', maxTextW).slice(0, 3).forEach((line) => { ctx.fillText(line, innerX, y); y += Math.round(benefitSize * 1.25); });

  if (asset === 'coupon' && pkg.couponCode) {
    const codeSize = Math.max(22, Math.round(canvas.width * .026));
    ctx.font = `700 ${codeSize}px ui-monospace, monospace`;
    ctx.fillStyle = '#fff';
    y += Math.round(codeSize * .45);
    ctx.fillText(`쿠폰 코드  ${pkg.couponCode}`, innerX, y);
    y += Math.round(codeSize * 1.35);
  }
  if ((asset === 'coupon' || asset === 'poster') && pkg.period) {
    const periodSize = Math.max(20, Math.round(canvas.width * .023));
    ctx.font = `600 ${periodSize}px Arial, "Noto Sans KR", sans-serif`;
    ctx.fillStyle = '#e5e7eb';
    ctx.fillText(pkg.period, innerX, y);
    y += Math.round(periodSize * 1.5);
  }

  if (asset === 'banner' || asset === 'poster') {
    const cta = clean(pkg.cta);
    if (cta) {
      const btnSize = Math.max(21, Math.round(canvas.width * .023));
      ctx.font = `800 ${btnSize}px Arial, "Noto Sans KR", sans-serif`;
      const btnW = Math.min(maxTextW, ctx.measureText(cta).width + Math.round(btnSize * 2.2));
      const btnH = Math.round(btnSize * 2.15);
      const btnY = Math.min(panelY + panelH - btnH - Math.round(pad * .55), y + Math.round(btnSize * .5));
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.roundRect(innerX, btnY, btnW, btnH, btnH / 2); ctx.fill();
      ctx.fillStyle = '#1d4ed8';
      ctx.fillText(cta, innerX + Math.round(btnSize * 1.05), btnY + Math.round(btnSize * .55));
    }
  }

  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('이미지 합성에 실패했습니다.')), 'image/png', 0.95));
}

function generatedPreviewContainer(asset) {
  return document.querySelector(`[data-generated-preview="${asset}"]`);
}

function renderGeneratedPreview(asset, url) {
  const box = generatedPreviewContainer(asset);
  if (!box) return;
  if (!url) { box.classList.add('hidden'); box.innerHTML = ''; return; }
  box.classList.remove('hidden');
  box.innerHTML = `<img src="${escapeHtml(url)}" alt="${escapeHtml(GENERATED_ASSET_LABELS[asset] || 'AI 생성 이미지')} 미리보기"><div class="ai-generated-meta"><span>✓ 생성·저장 완료</span><a href="${escapeHtml(url)}" target="_blank" rel="noopener">원본 열기</a></div>`;
}

async function generateImageInStudio(asset, button) {
  if (!lastPackage) return alert('먼저 캠페인을 생성하거나 목록에서 여세요.');
  const pkg = ensureCompletePackage(lastPackage);
  const label = GENERATED_ASSET_LABELS[asset] || '이미지';
  const original = button?.textContent || '';
  if (button) { button.disabled = true; button.textContent = `⏳ ${label} 생성 중...`; }
  try {
    const response = await fetch('/.netlify/functions/generate-campaign-image', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ asset, businessName: pkg.businessName, campaignName: pkg.name, benefit: pkg.benefit, style: STYLE_LABELS[pkg.style] || pkg.style, notes: pkg.notes || '' })
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(json?.error || `${label} 생성에 실패했습니다.`);
    const background = base64ToBlob(json.b64_json, 'image/png');
    const composed = await composeCampaignImage(asset, background, pkg);
    const filename = `${asset}-${pkg.id || currentCampaignId || Date.now()}.png`;
    const url = await window.KFocusAdminBridge?.uploadGeneratedImage?.(composed, filename);
    if (!url) throw new Error('Supabase Storage 업로드 기능을 사용할 수 없습니다. 관리자 연결 상태를 확인하세요.');
    const generatedImages = { ...(pkg.generatedImages || {}), [asset]: url };
    const saved = saveCampaign({ ...pkg, generatedImages }, { id: currentCampaignId || pkg.id || undefined, status: pkg.status || 'draft' });
    lastPackage = saved;
    renderGeneratedPreview(asset, url);
    alert(`${label} 이미지를 만들고 Supabase Storage에 저장했습니다.`);
  } catch (error) {
    console.error('generateImageInStudio:', error);
    alert(error.message || '이미지 생성 중 오류가 발생했습니다.');
  } finally {
    if (button) { button.disabled = false; button.textContent = original; }
  }
}

function updateEditorState(hasCampaign) {
  const ids = ['aiCampaignSaveBtn', 'aiCampaignDeleteBtn', 'aiCampaignRegisterBannerBtn', 'aiCopyAllBtn', 'aiSendCouponBtn'];
  ids.forEach((id) => {
    const el = $(id);
    if (el) el.disabled = !hasCampaign;
  });
  const status = $('aiCampaignWorkflowStatus');
  if (status) status.disabled = !hasCampaign;
}

function resetForm() {
  $('aiCampaignForm')?.reset();
  lastPackage = null;
  currentCampaignId = null;
  if ($('aiCampaignWorkflowStatus')) $('aiCampaignWorkflowStatus').value = 'draft';
  $('aiCampaignResults')?.classList.add('hidden');
  $('aiCampaignEmpty')?.classList.remove('hidden');
  if ($('aiCampaignStatus')) $('aiCampaignStatus').textContent = '정보를 입력하고 캠페인 생성 버튼을 누르세요.';
  applySelectedAssets(DEFAULT_ASSETS);
  updateEditorState(false);
}

function init() {
  seasonIdeas();
  applySelectedAssets(DEFAULT_ASSETS);
  document.querySelectorAll('#aiAssetSelector input[type="checkbox"]').forEach((el) => el.addEventListener('change', syncAssetCards));
  $('aiSelectAllAssets')?.addEventListener('click', () => { document.querySelectorAll('#aiAssetSelector input[type="checkbox"]').forEach((el) => { el.checked = true; }); syncAssetCards(); });
  $('aiClearAssets')?.addEventListener('click', () => { document.querySelectorAll('#aiAssetSelector input[type="checkbox"]').forEach((el) => { el.checked = false; }); syncAssetCards(); });
  updateEditorState(false);
  $('aiCampaignGenerateBtn')?.addEventListener('click', () => {
    const data = collectInput();
    const error = validate(data);
    if (error) return alert(error);
    renderPackage(makePackage(data));
  });
  $('aiCampaignResetBtn')?.addEventListener('click', resetForm);
  $('aiCopyAllBtn')?.addEventListener('click', async () => {
    if (!lastPackage) return alert('먼저 캠페인을 생성하세요.');
    const parts = { article:lastPackage.article, banner:lastPackage.banner, coupon:lastPackage.coupon, poster:lastPackage.poster, social:lastPackage.social, thumbnail:lastPackage.thumbnail, video:[lastPackage.grok,lastPackage.runway].join('\n\n') };
    await copyText((lastPackage.assets || DEFAULT_ASSETS).map((key) => parts[key]).filter(Boolean).join('\n\n--------------------\n\n'));
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
  document.querySelectorAll('.ai-chatgpt-image-btn').forEach((btn) => btn.addEventListener('click', () => openChatGPTImage(btn.dataset.chatgptAsset)));
  document.querySelectorAll('.ai-direct-image-btn').forEach((btn) => btn.addEventListener('click', () => generateImageInStudio(btn.dataset.directAsset, btn)));
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
