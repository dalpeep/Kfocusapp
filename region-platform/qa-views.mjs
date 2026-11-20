import { createRegion, REGION_STATUS } from './region-config.mjs';
import { areaOptions, menuKeys } from './qa-settings.mjs';
export { demoPage } from './qa-app.mjs';

const modules = {
  promotions: ['프로모션'],
  deals: ['할인'],
  guide: ['가이드'],
  directory: ['업소록', 'businesses'],
  map: ['지도 검색', 'businesses'],
  community: ['커뮤니티', 'posts'],
  coupons: ['쿠폰', 'coupons'],
  events: ['이벤트', 'events'],
  jobs: ['구인·구직', 'jobs'],
  ownerPortal: ['업주 포털', null],
  localAds: ['지역 광고', 'ads'],
  reservations: ['예약', 'reservations']
};

const presets = {
  'daltown-default': '달타운 기본',
  'slate': '슬레이트',
  'sand': '샌드'
};
const layouts = { default: '균형형', map: '지도 우선', community: '커뮤니티 우선', directory: '업소록 우선' };
const escape = value => String(value ?? '').replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
);

export function page(title, content, theme = {}) {
  const surface = { sand: '#f8f1e5', slate: '#e6edf4' }[theme.preset] || '#f1f6f2';
  const accent = /^#[0-9a-f]{6}$/i.test(theme.primaryColor ?? '') ? theme.primaryColor : '#22734b';
  return `<!doctype html><html lang="ko"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)}</title>
<style>
:root{color-scheme:light;--surface:${surface};--accent:${accent};color:#142820;font:16px/1.55 system-ui,sans-serif;background:var(--surface)}
*{box-sizing:border-box}body{margin:0}main{max-width:70rem;margin:auto;padding:1.5rem}
header{border-bottom:5px solid var(--accent);padding:0 0 1rem;display:flex;align-items:center;gap:1rem}
h1,h2,p{margin:.4rem 0 .75rem}h1{overflow-wrap:anywhere}a{color:#164e3a}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,19rem),1fr));gap:1rem}
.panel{background:#fff;border:1px solid #b7c9bf;border-radius:1rem;padding:1rem;min-width:0;overflow-wrap:anywhere}
fieldset{border:0;margin:0;padding:0}.fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,10rem),1fr));gap:.75rem}
label{display:block}input:not([type=checkbox]),select{display:block;width:100%;max-width:100%;padding:.55rem;border:1px solid #879991;border-radius:.4rem;font:inherit;background:white;color:inherit}
button,.action{display:inline-block;border:0;border-radius:.5rem;background:#184a36;color:white;font:inherit;padding:.55rem .9rem;text-decoration:none;cursor:pointer}
form>*,nav{margin-block:1rem}nav{display:flex;gap:.8rem;flex-wrap:wrap}ul{padding-inline-start:1.3rem}
.wide{grid-column:1/-1}iframe{display:block;width:100%;height:clamp(16rem,40vw,26rem);border:1px solid #879991;border-radius:.5rem}
.logo{width:clamp(3rem,12vw,5rem);height:4rem;object-fit:contain}section{scroll-margin-top:1rem}
@media(max-width:480px){main{padding:1rem}}
</style><main>${content}</main></html>`;
}

function input(label, name, value, attributes = '') {
  return `<label>${label}<input name="${name}" value="${escape(value)}" ${attributes}></label>`;
}

function select(label, name, value, choices) {
  return `<label>${label}<select name="${name}">${Object.entries(choices).map(([key, text]) =>
    `<option value="${key}" ${key === value ? 'selected' : ''}>${text}</option>`).join('')}</select></label>`;
}

const checkbox = (label, name, checked) =>
  `<label><input type="checkbox" name="${name}" ${checked ? 'checked' : ''}> ${label}</label>`;

export function adminPage(regions, region, error) {
  const defaults = createRegion({ name: 'QA', slug: 'qa', center: { lat: 0, lng: 0 } });
  const data = region || defaults;
  return page('지역 관리', `<header><h1>지역 관리</h1></header>
<nav aria-label="지역 관리"><a href="/admin/regions">신규 지역 추가</a> <a href="/admin/businesses${region ? '?region=' + data.slug : ''}">업소관리</a>
${region ? `<a href="/admin/regions/preview/${data.slug}">미리보기</a>
${data.status === REGION_STATUS.demo ? `<a href="/regions/${data.slug}">공개 데모 열기</a>` : ''}` : ''}</nav>
${error ? `<p role="alert">저장 실패 (${escape(error)})</p>` : ''}
<div class="grid"><section class="panel"><h2>등록 지역</h2>
${regions.length ? `<ul>${regions.map(item =>
  `<li><a href="/admin/regions?edit=${item.slug}">${escape(item.name)}</a> · ${item.status === REGION_STATUS.demo ? '공개' : '비공개'}</li>`).join('')}</ul>` : '<p>등록된 지역이 없습니다.</p>'}
</section><section class="panel"><h2>${region ? '지역 수정' : '지역 추가'}</h2>
<form method="post" action="/admin/regions">
<input type="hidden" name="moduleForm" value="1">
<input type="hidden" name="mode" value="${region ? 'edit' : 'create'}">
<fieldset><legend>지역 정보</legend><div class="fields">
${input('지역 이름', 'name', region?.name, 'required maxlength="120"')}
${input('주소 이름', 'slug', region?.slug, 'pattern="[a-z][a-z0-9\\-]{0,61}[a-z0-9]" ' + (region ? 'readonly' : ''))}
${select('지역 범위', 'areaPreset', data.geography?.preset ?? '', areaOptions)}
${input('주·도', 'state', data.state, 'maxlength="120"')}
${input('도시·하위 지역', 'subregion', data.geography?.subregion, 'maxlength="120"')}
</div></fieldset>
<fieldset><legend>지도 및 검색</legend><div class="fields">
${input('중심 위도', 'lat', region?.map.center.lat, 'type="number" step="any" min="-90" max="90"')}
${input('중심 경도', 'lng', region?.map.center.lng, 'type="number" step="any" min="-180" max="180"')}
${input('확대 수준', 'zoom', region?.map.zoom, 'type="number" min="3" max="18"')}
${input('검색 반경 (km)', 'radiusKm', region?.map.radiusKm, 'type="number" step="any" min="1" max="500" placeholder="자동"')}

</div></fieldset>
<fieldset><legend>메인 디자인</legend><div class="fields">
${select('테마', 'preset', data.theme.preset, presets)}
${select('레이아웃', 'layout', data.home.layout, layouts)}
${input('대표 색상', 'primaryColor', data.theme.primaryColor ?? '#2458bd', 'type="color"')}
${input('로고 URL (HTTPS)', 'logoUrl', data.theme.logoUrl, 'type="url" maxlength="1024"')}
${input('배너 제목', 'bannerTitle', data.home.banner?.title, 'maxlength="60"')}
${input('배너 설명', 'bannerText', data.home.banner?.message, 'maxlength="140"')}
${input('배너 이미지 URL (HTTPS)', 'bannerImage', data.home.banner?.image, 'type="url" maxlength="1024"')}
${input('메뉴 순서', 'menuOrder', data.home.menuOrder?.join(', '), 'aria-describedby="menu-order-help"')}
<p id="menu-order-help">${menuKeys.join(', ')}</p>

</div></fieldset>
<fieldset><legend>표시할 기능</legend><div class="fields">
${Object.entries(modules).map(([key, [label]]) => checkbox(label, key, (data.modules[key] ?? true))).join('')}

</div></fieldset>
${checkbox('데모 공개', 'public', data.status === REGION_STATUS.demo)}
<button>${region ? '변경 저장' : '지역 생성'}</button></form></section></div>`);
}
