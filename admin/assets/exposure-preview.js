/* Read-only preview: public anonymous GETs and the shared public selector. */
export async function refreshExposurePreview(config, region, requestedOrigin) {
  const host = document.getElementById('actualExposureResults');
  const status = document.getElementById('actualExposureStatus');
  if (!host || !status) return;
  const request = ++refreshExposurePreview.sequence;
  host.replaceChildren();
  status.textContent = '공개 데이터와 주간 클릭을 조회하고 있습니다…';
  const now = Date.now();
  const engine = globalThis.DtmHomeSelection.create({now});
  const day = engine.day();
  const since = engine.midnight(engine.weekStart(day));
  const base = String(config.SUPABASE_URL || '').replace(/\/$/, '');
  const key = config.SUPABASE_ANON_KEY;
  const headers = {apikey:key, Authorization:`Bearer ${key}`};
  async function read(query) {
    const response = await fetch(`${base}/rest/v1/${query}`, {headers, cache:'no-store'});
    if (!response.ok) throw new Error(`공개 데이터 조회 실패 (${response.status})`);
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error('공개 데이터 응답 형식 오류');
    return rows;
  }
  try {
    if (!base || !key) throw new Error('공개 DB 연결 설정이 없습니다.');
    const fields = 'id,name_ko,name_en,name,area,category_ko,address,phone,lat,lng,region,is_active,list_visible,created_at,paid_active,paid_start_at,paid_end_at,paid_weight,rotation_enabled,is_featured,is_new,is_popular,featured_rank,new_rank,popular_rank';
    const [raw, clicks, origin] = await Promise.all([
      read(`businesses?select=${fields}&region=eq.${encodeURIComponent(region)}&is_active=eq.true&order=created_at.desc.nullslast`),
      read(`business_activity?select=business_id,created_at&action_type=eq.business_click&created_at=gte.${encodeURIComponent(since)}&limit=20000`),
      requestedOrigin === undefined ? permittedPosition() : requestedOrigin
    ]);
    if (request !== refreshExposurePreview.sequence) return;
    const clickCounts = new Map();
    clicks.forEach(r => {
      const id = String(r.business_id || '').trim();
      if (id) clickCounts.set(id, (clickCounts.get(id) || 0) + 1);
    });
    const rows = globalThis.DtmHomeSelection.prepareRows(raw, region);
    const selector = globalThis.DtmHomeSelection.create({now, origin, clickCounts});
    const groups = selector.select(day, rows, 6);
    const time = new Intl.DateTimeFormat('ko-KR', {timeZone:'America/Chicago', dateStyle:'medium', timeStyle:'medium'}).format(now);
    status.textContent = `${time} (Dallas) · 지역 ${region} · ${origin ? '관리자 GPS 적용 미리보기' : 'GPS 미적용 미리보기'} · 주간 집계 시작 ${engine.weekStart(day)} (Dallas 월요일 00시)`;
    for (const [group, label] of [['featured','추천'], ['new','신규'], ['popular','인기']]) {
      const card = document.createElement('article');
      card.className = 'card ads-rotation-card';
      const title = document.createElement('h3');
      title.textContent = `${label} · ${groups[group].length}개`;
      const detail = document.createElement('p');
      detail.className = 'muted';
      detail.textContent = `유료 우선 ${groups.meta[group].paid}개 · 무료 ${groups.meta[group].free}개`;
      const list = document.createElement('ol');
      list.className = 'ads-preview-list';
      groups[group].forEach((b, i) => {
        const item = document.createElement('li');
        const content = document.createElement('div');
        const name = document.createElement('b');
        name.textContent = b.name;
        name.title = b.name;
        const paid = selector.paid(b, day);
        const info = document.createElement('span');
        info.className = 'ads-compact-badge' + (paid ? ' paid' : '');
        info.textContent = paid ? (b.rotation_enabled === false ? '유료 고정' : '유료') : '무료';
        const number = document.createElement('span');
        number.className = 'exposure-number';
        number.textContent = String(i + 1) + ' ·';
        const line = document.createElement('div');
        line.className = 'exposure-row-line';
        line.append(number, name, info);
        const meta = document.createElement('small');
        meta.className = 'exposure-row-meta';
        meta.textContent = [b.area || b.region, b.category_ko, group === 'popular' ? '주간 클릭 ' + (clickCounts.get(String(b.id)) || 0) + '회' : ''].filter(Boolean).join(' · ');
        meta.title = meta.textContent;
        const disclosure = document.createElement('details');
        disclosure.className = 'exposure-id-details';
        const summary = document.createElement('summary');
        summary.textContent = '상세';
        const id = document.createElement('small');
        id.className = 'exposure-business-id';
        id.textContent = 'ID: ' + b.id;
        disclosure.append(summary, id);
        content.className = 'exposure-row-content';
        content.append(line, meta, disclosure);
        item.append(content);
        list.append(item);
      });
      card.append(title, detail, list);
      if (!groups[group].length) {
        const empty = document.createElement('p');
        empty.textContent = '현재 조건에 맞는 업체가 없습니다.';
        card.append(empty);
      }
      host.append(card);
    }
  } catch (error) {
    if (request !== refreshExposurePreview.sequence) return;
    host.replaceChildren();
    status.textContent = `${error.message} · 실제 노출 미리보기를 계산하지 못했습니다. 새로고침해 주세요.`;
  }
}
refreshExposurePreview.sequence = 0;

async function permittedPosition() {
  try {
    // Do not prompt or grant permission automatically. The explicit location button can request it.
    if (!navigator.geolocation || !navigator.permissions) return null;
    const permission = await navigator.permissions.query({name:'geolocation'});
    if (permission.state !== 'granted') return null;
    return await position();
  } catch { return null; }
}
function position() {
  return new Promise(resolve => navigator.geolocation.getCurrentPosition(
    p => resolve({lat:p.coords.latitude, lng:p.coords.longitude}),
    () => resolve(null),
    {enableHighAccuracy:false, timeout:8000, maximumAge:300000}
  ));
}
export async function requestPreviewLocation(config, region) {
  const origin = navigator.geolocation ? await position() : null;
  return refreshExposurePreview(config, region, origin);
}
