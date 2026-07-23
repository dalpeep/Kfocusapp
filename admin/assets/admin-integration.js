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
  function rows(name, fallback = []) {
    const getter = window.KFocusAdminBridge?.[`get${name}`];
    try { return typeof getter === 'function' ? (getter() || []) : fallback; } catch { return fallback; }
  }
  function currentRegion() {
    try { return String(window.KFocusAdminBridge?.getRegion?.() || localStorage.getItem('admin_region') || 'dallas').toLowerCase(); }
    catch { return 'dallas'; }
  }
  function businessMap(businesses) { return new Map(businesses.map(b => [String(b.id), b])); }
  function inRegion(row, region, businessesById) {
    const own = String(row?.region || '').toLowerCase();
    if (own) return own === region;
    const linked = businessesById.get(String(row?.business_id || ''));
    return !linked?.region || String(linked.region).toLowerCase() === region;
  }
  function rangeState(row, startKey='start_at', endKey='end_at', enabled=true) {
    if (!enabled) return 'inactive';
    const now = Date.now();
    const start = row?.[startKey] || row?.start_date;
    const end = row?.[endKey] || row?.end_date;
    const sm = start ? new Date(start).getTime() : NaN;
    const em = end ? new Date(end).getTime() : NaN;
    if (Number.isFinite(sm) && sm > now) return 'scheduled';
    if (Number.isFinite(em) && em < now) return 'expired';
    return 'live';
  }
  function setText(id, value) { if ($(id)) $(id).textContent = String(value); }
  function escape(v='') { return escapeHtml(v); }
  function exposureItem(title, subtitle, source, rank) {
    return `<div class="dashboard-exposure-item"><span class="dashboard-exposure-rank">${rank}</span><div class="dashboard-exposure-copy"><strong>${escape(title || '제목 없음')}</strong><span>${escape(subtitle || '')}</span></div><span class="dashboard-source">${escape(source)}</span></div>`;
  }
  function renderExposure(id, items, emptyText) {
    const box = $(id); if (!box) return;
    box.innerHTML = items.length ? items.slice(0, 8).map((x,i)=>exposureItem(x.title,x.subtitle,x.source,i+1)).join('') : `<div class="dashboard-empty">${escape(emptyText)}</div>`;
  }
  function summarizeStates(items, stateFn) {
    const counts = {live:0, scheduled:0, expired:0, inactive:0};
    items.forEach(x => counts[stateFn(x)] = (counts[stateFn(x)] || 0) + 1);
    return counts;
  }
  function updateMetrics() {
    const businesses = rows('Businesses', window.businesses || []);
    const coupons = rows('Coupons');
    const banners = rows('Banners');
    const slides = rows('Slides');
    const dalpicks = rows('Dalpicks');
    const boards = rows('Boards');
    const region = currentRegion();
    const bizMap = businessMap(businesses);
    const regionalBusinesses = businesses.filter(b => !b.region || String(b.region).toLowerCase() === region);
    const regionalCoupons = coupons.filter(c => inRegion(c, region, bizMap));
    const regionalBanners = banners.filter(b => inRegion(b, region, bizMap));
    const regionalSlides = slides.filter(s => inRegion(s, region, bizMap));
    const regionalDalpicks = dalpicks.filter(d => inRegion(d, region, bizMap));
    const regionalBoards = boards.filter(b => inRegion(b, region, bizMap));

    const couponStates = summarizeStates(regionalCoupons, c => rangeState(c,'start_at','end_at',c.is_active !== false));
    const bannerStates = summarizeStates(regionalBanners, b => rangeState(b,'start_at','end_at',b.is_active !== false));
    const slideStates = summarizeStates(regionalSlides, s => rangeState(s,'promo_start_at','promo_end_at',s.promo_enabled === true));
    const dalpickStates = summarizeStates(regionalDalpicks, d => {
      const status = String(d.status || '').toLowerCase();
      return rangeState(d,'start_at','end_at',d.is_active !== false && status !== 'draft' && status !== 'inactive');
    });

    const liveTodayCoupons = regionalCoupons.filter(c => c.is_today_coupon === true && rangeState(c,'start_at','end_at',c.is_active !== false) === 'live');
    const liveSlides = regionalSlides.filter(s => s.home_fixed === true && rangeState(s,'promo_start_at','promo_end_at',s.promo_enabled === true) === 'live').sort((a,b)=>(a.home_fixed_sort ?? 1000)-(b.home_fixed_sort ?? 1000));
    const liveDalpicks = regionalDalpicks.filter(d => {
      const status = String(d.status || '').toLowerCase();
      if (rangeState(d,'start_at','end_at',d.is_active !== false && status !== 'draft' && status !== 'inactive') !== 'live') return false;
      const themed = String(d.category || '').toLowerCase() === 'themed' || (Array.isArray(d.target_categories) && d.target_categories.length > 0);
      return !themed || d.show_in_dalpick === true;
    }).sort((a,b)=>(b.is_featured===true)-(a.is_featured===true) || (b.priority||0)-(a.priority||0));

    let manager = {drafts:[]};
    try { manager = JSON.parse(localStorage.getItem(MANAGER_KEY) || '{"drafts":[]}'); } catch {}
    setText('intBusinessCount', regionalBusinesses.length);
    setText('intCouponCount', regionalCoupons.length);
    setText('intBannerCount', regionalBanners.length);
    setText('intSlideCount', regionalSlides.length);
    setText('intDalpickCount', regionalDalpicks.length);
    setText('intTodayCouponCount', liveTodayCoupons.length);
    setText('intBoardCount', regionalBoards.length);
    setText('intDraftCount', (manager.drafts || []).filter(x => x.status === 'draft').length);
    setText('intCouponSummary', `게시 ${couponStates.live} · 예약 ${couponStates.scheduled} · 만료 ${couponStates.expired}`);
    setText('intBannerSummary', `게시 ${bannerStates.live} · 예약 ${bannerStates.scheduled} · 만료 ${bannerStates.expired}`);
    setText('intSlideSummary', `노출 ${liveSlides.length} · 숨김/종료 ${Math.max(0, regionalSlides.length-liveSlides.length)}`);
    setText('intDalpickSummary', `홈 노출 ${liveDalpicks.length} · 비노출 ${Math.max(0, regionalDalpicks.length-liveDalpicks.length)}`);
    setText('intSlideExposureNote', `현재 ${liveSlides.length}개 노출`);
    setText('intCouponExposureNote', `현재 ${liveTodayCoupons.length}개 노출`);
    setText('intDalpickExposureNote', `DalPick ${liveDalpicks.length}개 + 쿠폰 ${liveTodayCoupons.length}개`);

    renderExposure('intSlideExposure', liveSlides.map(s => {
      const b = bizMap.get(String(s.business_id || ''));
      return {title:s.promo_text || b?.name_ko || b?.name_en || '독립 슬라이드', subtitle:b ? `연결 업소 · ${b.name_ko || b.name_en}` : '업소 연결 없음', source:s.video_url ? '영상' : '슬라이드'};
    }), '현재 노출 중인 메인 슬라이드가 없습니다.');
    renderExposure('intCouponExposure', liveTodayCoupons.map(c => {
      const b = bizMap.get(String(c.business_id || ''));
      return {title:c.title || '쿠폰', subtitle:b?.name_ko || b?.name_en || '연결 업소 없음', source:'쿠폰'};
    }), '오늘의 쿠폰으로 노출 중인 항목이 없습니다.');
    const combined = [
      ...liveDalpicks.map(d => ({title:d.title || 'DalPick', subtitle:d.is_featured ? '대표 노출' : (d.category || 'DalPick'), source:'DalPick', date:d.created_at || d.start_at || ''})),
      ...liveTodayCoupons.map(c => { const b=bizMap.get(String(c.business_id||'')); return {title:c.title || '쿠폰', subtitle:b?.name_ko || b?.name_en || '오늘의 쿠폰', source:'쿠폰', date:c.created_at || c.start_at || ''}; })
    ].sort((a,b)=>new Date(b.date||0)-new Date(a.date||0)).slice(0,8);
    renderExposure('intDalpickExposure', combined, '현재 홈 DalPick에 노출되는 항목이 없습니다.');
  }

  function selectedBusinessId(type) {
    const ids = type === 'coupon'
      ? ['coupon_business_id','couponBusinessFilter']
      : type === 'banner'
        ? ['bnBusinessId','banner_business_id','slide_business_select']
        : ['dalpick_business_id'];
    for (const id of ids) { const value=$(id)?.value; if (value && value !== 'all') return value; }
    return '';
  }
  function businessNameById(id) {
    const rows=window.KFocusAdminBridge?.getBusinesses?.() || [];
    const b=rows.find(x=>String(x.id)===String(id));
    return b?.name_ko || b?.name_en || b?.name || '';
  }
  function launchAI(type) {
    const businessId=selectedBusinessId(type);
    const businessName=businessNameById(businessId);
    const ctx={businessId,businessName,assetType:type,mode:'create',topic:businessName?`${businessName} ${type==='coupon'?'쿠폰':type==='banner'?'배너':'DalPick'} 제작`:'',returnSection:type==='banner'?'banners':type};
    if(window.DalTownAIStudio?.open) window.DalTownAIStudio.open(ctx);
    else { localStorage.setItem('daltownmap_ai_studio_workflow_v1',JSON.stringify(ctx)); openSection('aiStudio'); }
  }
  function injectAIButtons() {
    const targets=[
      ['couponNewBtn','coupon','✨ AI로 쿠폰 만들기'],
      ['bannerNewBtn','banner','✨ AI로 배너 만들기']
    ];
    targets.forEach(([anchorId,type,label])=>{
      const anchor=$(anchorId); if(!anchor || document.querySelector(`[data-ai-create="${type}"]`)) return;
      const btn=document.createElement('button'); btn.type='button'; btn.className='btn secondary inline-btn'; btn.dataset.aiCreate=type; btn.textContent=label;
      btn.addEventListener('click',()=>launchAI(type)); anchor.insertAdjacentElement('afterend',btn);
    });
  }

  function bind() {
    bindNavigation(); renderChecks(); renderIssues(); updateMetrics(); injectAIButtons();
    $('intAddIssue')?.addEventListener('click', addIssue);
    $('intResetChecklist')?.addEventListener('click', () => { if (confirm('테스트 체크 상태를 모두 초기화할까요?')) { state.checks={}; save(); renderChecks(); } });
    ['kfocus:businesses-loaded','kfocus:coupons-loaded','kfocus:banners-loaded','kfocus:slides-loaded','kfocus:dalpicks-loaded','kfocus:boards-loaded'].forEach(name => window.addEventListener(name, updateMetrics));
    window.addEventListener('storage', updateMetrics);
    setInterval(()=>{ updateMetrics(); injectAIButtons(); }, 3000);
  }
  document.addEventListener('DOMContentLoaded', bind);
})();
