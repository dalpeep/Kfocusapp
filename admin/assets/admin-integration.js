(() => {
  const KEY = 'daltownmap_admin_integration_v23_1';
  const MANAGER_KEY = 'daltownmap_ai_manager_v23';
  const DEFAULT_CHECKS = [
    ['business_crud','업소 등록·수정·삭제','업소 정보와 이미지 저장 후 사용자 화면에 정확히 표시되는지 확인'],
    ['google_rating','Google 평점','Place ID 저장, 평점 불러오기, 오류 시 기존 데이터 유지 확인'],
    ['ai_analyze','AI 주제 분석','주제 분석 결과와 업소 연결 권고가 자연스러운지 확인'],
    ['ai_generate','AI 콘텐츠 생성','DalPick·쿠폰·배너 문구가 사실을 임의로 만들지 않는지 확인'],
    ['draft_review','초안 품질 검토','한글 문구 수정, 이미지 교체, 저장 후 새로고침 유지 확인'],
    ['approval','승인 처리','승인·보류 상태 변경과 필터가 정확한지 확인'],
    ['coupon_publish','쿠폰 게시','기간·코드·링크·오늘의 쿠폰 노출 확인'],
    ['banner_publish','배너 게시','PC·모바일 이미지 비율과 링크 이동 확인'],
    ['board_publish','게시판·가이드','작성·수정·이미지 갤러리·상세 화면 확인'],
    ['push','푸시 발송','지역 선택과 실제 수신 여부 확인'],
    ['mobile','모바일·PWA','메뉴, 스크롤, 뒤로가기, 설치 화면 확인'],
    ['permissions','관리자 권한','슈퍼 관리자와 지역 관리자 데이터 범위 확인']
  ];
  const $ = id => document.getElementById(id);
  let state;
  try { state = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { state = {}; }
  state.checks ||= {};
  state.issues ||= [];
  const save = () => localStorage.setItem(KEY, JSON.stringify(state));

  function openSection(section) {
    const btn = document.querySelector(`#adminNav [data-section="${section}"]`);
    if (btn) btn.click();
  }
  function bindNavigation() {
    document.querySelectorAll('[data-go-section]').forEach(btn => {
      btn.addEventListener('click', () => openSection(btn.dataset.goSection));
    });
  }
  function renderChecks() {
    const box = $('intChecklist');
    if (!box) return;
    box.innerHTML = DEFAULT_CHECKS.map(([key,title,desc]) => `
      <label class="integration-check-item ${state.checks[key] ? 'done' : ''}">
        <input type="checkbox" data-int-check="${key}" ${state.checks[key] ? 'checked' : ''}>
        <span><strong>${title}</strong><small>${desc}</small></span>
      </label>`).join('');
    box.querySelectorAll('[data-int-check]').forEach(input => input.addEventListener('change', () => {
      state.checks[input.dataset.intCheck] = input.checked;
      save();
      renderChecks();
    }));
  }
  function renderIssues() {
    const box = $('intIssueList');
    if (!box) return;
    box.innerHTML = state.issues.length ? state.issues.map(issue => `
      <article class="integration-issue">
        <div><strong>${escapeHtml(issue.title)}</strong><p>${escapeHtml(issue.detail || '')}</p><small>${new Date(issue.createdAt).toLocaleString('ko-KR')}</small></div>
        <span class="integration-severity">${severityLabel(issue.severity)}</span>
        <button type="button" aria-label="삭제" data-int-delete="${issue.id}">✕</button>
      </article>`).join('') : '<p class="muted">기록된 문제가 없습니다.</p>';
    box.querySelectorAll('[data-int-delete]').forEach(btn => btn.addEventListener('click', () => {
      state.issues = state.issues.filter(x => x.id !== btn.dataset.intDelete);
      save(); renderIssues();
    }));
  }
  function severityLabel(v) { return ({low:'낮음',medium:'보통',high:'높음',blocker:'운영 중단'})[v] || v; }
  function escapeHtml(v='') { return String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
  function addIssue() {
    const title = $('intIssueTitle')?.value.trim();
    if (!title) return alert('문제 제목을 입력하세요.');
    state.issues.unshift({id: crypto.randomUUID(), title, detail:$('intIssueDetail')?.value.trim() || '', severity:$('intIssueSeverity')?.value || 'medium', createdAt:new Date().toISOString()});
    save(); $('intIssueTitle').value=''; $('intIssueDetail').value=''; renderIssues();
  }
  function updateMetrics() {
    const businesses = window.KFocusAdminBridge?.getBusinesses?.() || window.businesses || [];
    const coupons = window.coupons || [];
    const banners = window.banners || window.bannerRows || [];
    let manager = {drafts:[]};
    try { manager = JSON.parse(localStorage.getItem(MANAGER_KEY) || '{"drafts":[]}'); } catch {}
    if ($('intBusinessCount')) $('intBusinessCount').textContent = businesses.length || '0';
    if ($('intCouponCount')) $('intCouponCount').textContent = coupons.length || '0';
    if ($('intBannerCount')) $('intBannerCount').textContent = banners.length || '0';
    if ($('intDraftCount')) $('intDraftCount').textContent = (manager.drafts || []).filter(x => x.status === 'draft').length;
  }
  function bind() {
    bindNavigation(); renderChecks(); renderIssues(); updateMetrics();
    $('intAddIssue')?.addEventListener('click', addIssue);
    $('intResetChecklist')?.addEventListener('click', () => { if (confirm('테스트 체크 상태를 모두 초기화할까요?')) { state.checks={}; save(); renderChecks(); } });
    window.addEventListener('kfocus:businesses-loaded', updateMetrics);
    window.addEventListener('storage', updateMetrics);
    setInterval(updateMetrics, 3000);
  }
  document.addEventListener('DOMContentLoaded', bind);
})();
