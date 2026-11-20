import { businessCategories } from './qa-business.mjs';
import { page } from './qa-views.mjs';
import { regionBrand } from './qa-settings.mjs';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const field = (label, key, value, attributes) =>
  `<label>${label}<input name="${key}" value="${escape(value)}" ${attributes}></label>`;

export function businessAdminPage(regions, region, id, error) {
  const selectable = regions.filter(item => item.status !== 'disabled');
  const categories = region ? businessCategories(region) : [];
  const records = region?.businessQa?.records ?? [];
  const record = records.find(item => item.id === id);
  const values = record?.pending ?? record?.approved ?? {};
  const url = '/admin/businesses?region=' + (region?.slug ?? '');
  const controls = (action, label, extra = '') => `<form method="post" action="${url}">
<input type="hidden" name="action" value="${action}"><input type="hidden" name="id" value="${record.id}">${extra}<button>${label}</button></form>`;
  return page('온라인업소록 관리자', `<header><h1>온라인업소록 관리자</h1></header>
<nav aria-label="관리자 메뉴"><a href="/admin/regions">지역 관리</a><a href="/admin/businesses" aria-current="page">업소관리</a></nav>
<h2>업소관리</h2><form method="get" action="/admin/businesses"><label>지역
<select name="region" required><option value="">지역 선택</option>${selectable.map(item => `<option value="${item.slug}" ${item === region ? 'selected' : ''}>${escape(regionBrand(item.name))}</option>`).join('')}</select>
</label><button>지역 열기</button></form>
${error ? `<p role="alert">${escape(error)}</p>` : ''}
${region ? `<div class="grid">
<section class="panel"><h2>${escape(regionBrand(region.name))} 업소 목록</h2>
<a href="${url}">신규 업소 등록</a>
${records.length ? `<ul>${records.map(item => `<li><a href="${url}&amp;id=${item.id}">${escape(item.pending?.name ?? item.approved?.name)}</a>
· ${item.pending ? '승인 대기' : '승인됨'} · ${item.visible ? '공개' : '비공개'}</li>`).join('')}</ul>` : '<p>등록된 업소가 없습니다.</p>'}
<h3>업소 카테고리</h3><ul>${categories.map(category => `<li>${escape(category)}
<form method="post" action="${url}"><input type="hidden" name="category" value="${escape(category)}"><button name="action" value="category-remove">삭제</button></form></li>`).join('')}</ul>
<form method="post" action="${url}">${field('새 카테고리', 'category', '', 'required maxlength="40"')}<button name="action" value="category-add">카테고리 추가</button></form>
</section>
<section class="panel"><h2>${record ? '업소 정보 수정' : '신규 업소 등록'}</h2>
<form method="post" action="${url}"><input type="hidden" name="id" value="${record?.id ?? ''}">
${field('업소명', 'name', values.name, 'required maxlength="120"')}
<label>카테고리<select name="category" required>${categories.map(category => `<option ${category === values.category ? 'selected' : ''}>${escape(category)}</option>`).join('')}</select></label>
${field('주소', 'address', values.address, 'required maxlength="240"')}
${field('연락처', 'contact', values.contact, 'maxlength="80"')}
${field('이미지 URL (HTTPS)', 'image', values.image, 'type="url" maxlength="1024"')}
${field('위도', 'lat', values.lat ?? region.map.center.lat, 'required type="number" step="any" min="-90" max="90"')}
${field('경도', 'lng', values.lng ?? region.map.center.lng, 'required type="number" step="any" min="-180" max="180"')}
<button name="action" value="${record ? 'edit' : 'create'}">승인 요청 저장</button></form>
${record?.pending ? controls('approve', '업소 승인') + controls('reject', '변경 반려') : ''}
${record?.approved ? controls(record.visible ? 'hide' : 'publish', record.visible ? '업소 비공개' : '업소 공개') +
  '<h3>QA 소유권 신청</h3><p>가상의 신청 식별자를 사용하세요. 승인 결과는 QA 기록에 저장됩니다.</p>' +
  controls('claim', '소유권 신청', field('가상 신청 식별자', 'reference', '', 'required maxlength="80"')) +
  record.claims.map(claim => `<p>${escape(claim.reference)} · ${({pending:'승인 대기',approved:'승인됨',rejected:'반려됨'})[claim.status]}</p>` +
    (claim.status === 'pending' ? controls('claim-approve', '소유권 승인', `<input name="claimId" type="hidden" value="${claim.id}">`) +
      controls('claim-reject', '소유권 반려', `<input name="claimId" type="hidden" value="${claim.id}">`) : '')).join('') : ''}
</section></div>` : ''}`);
}
