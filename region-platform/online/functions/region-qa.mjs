import { createHash, timingSafeEqual } from 'node:crypto';
import { getDeployStore, getStore } from '@netlify/blobs';
import { REGION_STATUS } from '../../region-config.mjs';
import { saveRegion } from '../../qa-settings.mjs';
import { adminPage, demoPage, page } from '../../qa-views.mjs';

import { manageBusinesses } from '../../qa-business.mjs';
import { businessAdminPage } from '../../qa-business-views.mjs';

export const config = {
  path: ['/', '/admin', '/admin/regions', '/admin/businesses', '/admin/regions/preview/:slug', '/regions/:slug']
};

const headers = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'private, no-store',
  'Vary': 'Authorization',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src https:; frame-src https://www.openstreetmap.org; frame-ancestors 'none'; form-action 'self'; base-uri 'none'"
};
const respond = (html, status = 200, extra = {}) =>
  new Response(html, { status, headers: { ...headers, ...extra } });

function authorized(request, verifier) {
  const header = request.headers.get('authorization') || '';
  if (typeof verifier !== 'string' || !/^[a-f0-9]{64}$/.test(verifier)) return false;
  const provided = createHash('sha256').update(header).digest();
  return timingSafeEqual(provided, Buffer.from(verifier, 'hex'));
}

async function readForm(request) {
  const reader = request.body?.getReader();
  if (!reader) return null;
  let total = 0;
  const chunks = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > 8192) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

export default async function handler(request) {
  const url = new URL(request.url);
  const route = url.pathname;
  if (url.protocol !== 'https:' || !url.hostname.endsWith('--comforting-shortbread-ee588e.netlify.app')) {
    return respond(page('접근 제한', '지역 QA 배포 주소를 확인하세요.'), 404);
  }

  const admin = route === '/admin' || route.startsWith('/admin/');
  try {
    if (admin) {
      const credentials = getStore({ name: 'daltownmap-region-qa-136-access', consistency: 'strong' });
      const verifier = await credentials.get('basic-sha256');
      if (!authorized(request, verifier)) {
        return respond(page('관리자 인증', 'QA 관리자 계정으로 로그인하세요.'), 401, {
          'WWW-Authenticate': 'Basic realm="DalTownMap Region QA", charset="UTF-8"'
        });
      }
    }
    const store = getDeployStore({ name: 'daltownmap-region-qa-136', consistency: 'strong' });
    const saved = await store.getWithMetadata('regions', { type: 'json' });
    const regions = saved?.data || [];
    if (route === '/admin/businesses') {
      const slug = url.searchParams.get('region');
      const region = regions.find(item => item.slug === slug && item.status !== REGION_STATUS.disabled);
      if (slug && !region) return respond(page('지역을 찾을 수 없습니다', '지역을 확인하세요.'), 404);
      if (request.method === 'GET') {
        const id = url.searchParams.get('id');
        if (id && !region?.businessQa?.records.some(record => record.id === id)) {
          return respond(page('업소를 찾을 수 없습니다', '선택한 지역에 등록된 업소를 확인하세요.'), 404);
        }
        return respond(businessAdminPage(regions, region, id));
      }
      if (request.method !== 'POST') return respond(page('요청 오류', '지원하지 않는 요청입니다.'), 405);
      if (!region || request.headers.get('origin') !== url.origin ||
          request.headers.get('content-type')?.split(';')[0] !== 'application/x-www-form-urlencoded') {
        return respond(page('접근 제한', 'QA 관리자에서 지역을 선택한 뒤 다시 시도하세요.'), 403);
      }
      const form = await readForm(request);
      if (!form) return respond(page('입력 오류', '입력값 길이를 확인하세요.'), 413);
      const id = form.get('id');
      let updated;
      try {
        updated = manageBusinesses(regions, slug, form);
      } catch (error) {
        if (error.message === 'NOT_FOUND') return respond(page('업소를 찾을 수 없습니다', '선택한 지역에 등록된 업소를 확인하세요.'), 404);
        if (!/^[A-Z_]+$/.test(error.message)) throw error;
        return respond(businessAdminPage(regions, region, id, error.message), 400);
      }
      const { modified } = await store.setJSON('regions', updated, { onlyIfMatch: saved.etag });
      if (!modified) return respond(page('저장 충돌', '업소관리 화면을 새로 열고 다시 저장하세요.'), 409);
      const current = updated.find(item => item.slug === slug);
      const selected = form.get('action') === 'create' ? current.businessQa.records.at(-1).id :
        current.businessQa.records.find(record => record.id === id)?.id;
      return respond(null, 303, { Location: `/admin/businesses?region=${slug}${selected ? '&id=' + selected : ''}` });
    }
    if (request.method === 'POST' && route === '/admin/regions') {
      if (request.headers.get('origin') !== url.origin ||
          request.headers.get('content-type')?.split(';')[0] !== 'application/x-www-form-urlencoded') {
        return respond(page('접근 제한', 'QA 관리자 화면에서 다시 시도하세요.'), 403);
      }
      const form = await readForm(request);
      if (!form) return respond(page('입력 오류', '입력값 길이를 확인하세요.'), 413);
      let slug = form.get('slug')?.trim();
      let updated;
      try {
        updated = saveRegion(regions, slug, form);
        slug = updated.at(-1).slug;
      } catch (error) {
        const current = form.get('mode') === 'edit' && regions.find(region => region.slug === slug);
        const message = /^[A-Z_]+$/.test(error.message) ? error.message : '입력값을 확인하세요.';
        return respond(adminPage(regions, current, message), 400);
      }
      const { modified } = await store.setJSON('regions', updated,
        saved ? { onlyIfMatch: saved.etag } : { onlyIfNew: true });
      if (!modified) return respond(page('저장 충돌', '<p><a href="/admin/regions">지역 관리 화면을 다시 열고 저장하세요.</a></p>'), 409);
      return respond(null, 303, { Location: `/admin/regions?edit=${slug}` });
    }

    if (request.method !== 'GET') return respond(page('요청 오류', '지원하지 않는 요청입니다.'), 405);
    if (route === '/admin' || route === '/admin/regions') {
      return respond(adminPage(regions, regions.find(region => region.slug === url.searchParams.get('edit'))));
    }
    if (route === '/') {
      const publicRegions = regions.filter(region => region.status === REGION_STATUS.demo);
      return respond(page('온라인업소록', `<h1>온라인업소록</h1>
        <nav><a href="/admin/regions">관리자 지역 관리</a> <a href="/admin/businesses">업소관리</a></nav>
        ${publicRegions.length ? '<ul>' + publicRegions.map(region =>
          `<li><a href="/regions/${region.slug}">${region.slug}</a></li>`).join('') + '</ul>' :
          '<p>공개된 지역이 없습니다.</p>'}`));
    }
    const match = /^\/(regions|admin\/regions\/preview)\/([a-z][a-z0-9-]{1,62})\/?$/.exec(route);
    const region = match && regions.find(item => item.slug === match[2]);
    const preview = match?.[1] === 'admin/regions/preview';
    if (region && region.status !== REGION_STATUS.disabled && (preview || region.status === REGION_STATUS.demo)) {
      return respond(demoPage(region, preview, url.searchParams));
    }
    return respond(page('지역을 찾을 수 없습니다', '주소와 지역 공개 상태를 확인하세요.'), 404);
  } catch (error) {
    console.error('Region QA storage or runtime error', error.name);
    return respond(page('요청 처리 오류', '잠시 후 다시 시도하세요.'), 500);
  }
}


