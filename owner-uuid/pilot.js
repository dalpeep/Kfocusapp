(() => {
  'use strict';
  const get = id => document.getElementById(id);
  const status = get('pilot-status');
  const owner = get('pilot-owner');
  const ownerTitle = owner.querySelector('h2');
  const admin = get('admin');
  const labels = {new: '신규 업소', claim: '소유권', core: '핵심 정보', name_ko: '업소명',
    name_en: '영문 업소명', address: '주소', phone: '전화', category_ko: '업종'};
  const endpoint = 'https://ydrxuqmjzayejlnjzzew.supabase.co/functions/v1/owner-phase1';
  const off = '업주 관리 시험 운영이 중지됐습니다.';
  let generation = 0;
  let descriptionObserver;

  function append(parent, tag, value) {
    const element = document.createElement(tag);
    element.textContent = value;
    parent.append(element);
    return element;
  }

  function show(client, active) {
    const current = ++generation;
    ownerTitle.textContent = '내 업소';
    descriptionObserver?.disconnect();
    descriptionObserver = undefined;
    admin.hidden = owner.hidden = true;
    get('pilot-queue').replaceChildren();
    get('pilot-businesses').replaceChildren();
    status.textContent = '';
    if (!active) return;
    let offset = 0;

    async function request(query, command) {
      const {data} = await client.auth.getSession();
      if (current !== generation || !data?.session) throw Error('다시 로그인해 주세요.');
      const response = await fetch(endpoint + query, {
        method: command ? 'POST' : 'GET', redirect: 'error', cache: 'no-store',
        headers: {apikey: window.APP_CONFIG.SUPABASE_ANON_KEY,
          Authorization: 'Bearer ' + data.session.access_token,
          ...(command ? {'Content-Type': 'application/json'} : {})},
        ...(command ? {body: JSON.stringify(command)} : {}),
      });
      const body = await response.json();
      if (response.ok && body.ok) return body.result;
      const error = Error(response.status === 503 ? off : response.status === 401 ? '다시 로그인해 주세요.'
        : response.status === 403 ? '이 작업에 대한 시험 운영 권한이 없습니다.'
        : response.status === 409 ? '신청이 변경됐습니다. 목록을 다시 확인해 주세요.'
        : '입력 내용을 확인해 주세요.');
      error.status = response.status;
      throw error;
    }

    function action(parent, label, command) {
      const button = append(parent, 'button', label);
      button.type = 'button';
      let pending;
      button.onclick = async () => {
        if (button.disabled || current !== generation) return;
        button.disabled = true;
        try {
          if (!pending) {
            const payload = command();
            if (!payload) return;
            pending = {...payload, key: crypto.randomUUID()};
          }
          await request('', pending);
          pending = null;
          if (await load() && current === generation) status.textContent = '처리했습니다.';
        } catch (error) {
          if (error.status >= 400 && error.status < 500) pending = null;
          if (current === generation) status.textContent = error.status ? error.message : '응답을 확인하지 못했습니다. 같은 버튼으로 재시도해 주세요.';
        } finally {
          button.disabled = false;
        }
      };
    }

    async function load() {
      try {
        const data = await request('?status=pending&offset=' + offset);
        if (current !== generation) return;
        const isAdmin = data.is_admin === true;
        ownerTitle.textContent = isAdmin ? '관리 업소' : '내 업소';
        const businesses = get('pilot-businesses');
        descriptionObserver?.disconnect();
        descriptionObserver = undefined;
        businesses.replaceChildren();
        const resizeDescriptions = new Map();
        if (!isAdmin) {
          for (const candidate of data.claim_candidates || []) {
            const card = append(businesses, 'article', '');
            append(card, 'h3', candidate.name_ko || candidate.name_en || '지정 시험 업소');
            const pending = data.requests.some(r => r.kind === 'claim' && r.business_id === candidate.id);
            if (pending) append(card, 'p', '소유권 신청 승인 대기 중');
            else action(card, '소유권 신청', () => ({action: 'submit', kind: 'claim', business_id: candidate.id}));
          }
        }
        if (!data.businesses.length) append(businesses, 'p', '아직 승인된 시험 업소가 없습니다.');
        for (const business of data.businesses) {
          const card = append(businesses, 'article', '');
          append(card, 'h3', business.name_ko || business.name_en || '시험 업소');
          const description = append(append(card, 'label', '소개'), 'textarea', '');
          description.className = 'pilot-business-description';
          description.value = business.description || '';
          const fitDescription = () => {
            description.style.height = '0px';
            const borders = description.offsetHeight - description.clientHeight;
            description.style.height = (description.scrollHeight + borders) + 'px';
          };
          description.addEventListener('input', fitDescription);
          descriptionObserver ??= new ResizeObserver(entries => {
            for (const {target} of entries) resizeDescriptions.get(target)();
          });
          let width;
          resizeDescriptions.set(card, () => {
            if (width === card.clientWidth) return;
            width = card.clientWidth;
            fitDescription();
          });
          descriptionObserver.observe(card);
          const hours = append(append(card, 'label', '영업시간'), 'input', '');
          hours.value = business.hours || '';
          action(card, '정보 저장', () => ({action: 'update', business_id: business.id,
            changes: {description: description.value, hours: hours.value}}));
        }
        owner.hidden = false;
        for (const fitDescription of resizeDescriptions.values()) fitDescription();
        const queue = get('pilot-queue');
        queue.replaceChildren();
        admin.hidden = !isAdmin;
        if (admin.hidden) return true;
        const {data: sessionData} = await client.auth.getSession();
        if (current !== generation || !sessionData?.session) return;
        if (!data.requests.length) append(queue, 'p', '승인 대기 신청이 없습니다.');
        for (const item of data.requests) {
          const card = append(queue, 'article', '');
          append(card, 'h3', (labels[item.kind] || item.kind) + ' · ' + item.region);
          const candidate = data.claim_candidates?.find(business => business.id === item.business_id);
          if (candidate) append(card, 'p', candidate.name_ko || candidate.name_en || '지정 시험 업소');
          append(card, 'p', '신청 ' + item.id + ' · 업소 ' + (item.business_id || '신규'));
          for (const [heading, fields] of [['변경 전', item.baseline], ['신청 내용', item.changes]]) {
            if (!Object.keys(fields || {}).length) continue;
            append(card, 'h4', heading);
            for (const [key, value] of Object.entries(fields)) append(card, 'p', (labels[key] || key) + ' ' + (value ?? '없음'));
          }
          if (item.submission_reason) append(card, 'p', '신청 사유 ' + item.submission_reason);
          if (item.user_id === sessionData.session.user.id) continue;
          const reason = append(append(card, 'label', '처리 사유'), 'textarea', '');
          reason.maxLength = 1000;
          const area = item.kind === 'new' ? append(append(card, 'label', '승인 지역'), 'input', '') : null;
          action(card, '승인', () => {
            if (area && !area.value.trim()) { status.textContent = '승인 지역을 입력해 주세요.'; return; }
            return {action: 'approve', request_id: item.id, reason: reason.value, ...(area ? {area: area.value.trim()} : {})};
          });
          action(card, '거절', () => {
            if (!reason.value.trim()) { status.textContent = '거절 사유를 입력해 주세요.'; return; }
            return {action: 'reject', request_id: item.id, reason: reason.value.trim()};
          });
        }
        get('pilot-prev').disabled = offset === 0;
        get('pilot-next').disabled = offset + 20 >= data.request_total;
        if (location.hash === '#admin') admin.scrollIntoView();
        return true;
      } catch (error) {
        if (current !== generation) return;
        owner.hidden = admin.hidden = true;
        status.textContent = error.status ? error.message : '업주 관리 상태를 확인할 수 없습니다.';
      }
    }
    get('pilot-prev').onclick = () => { offset = Math.max(0, offset - 20); void load(); };
    get('pilot-next').onclick = () => { offset += 20; void load(); };
    void load();
  }
  window.OwnerPilot = Object.freeze({show});
})();
