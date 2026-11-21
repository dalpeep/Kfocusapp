import { randomUUID } from 'node:crypto';
import { manageBusinesses } from '../../qa-business.mjs';
import { businessAdminPage } from '../../qa-business-views.mjs';
import { saveRegion } from '../../qa-settings.mjs';
import { adminPage, demoPage, page } from '../../qa-views.mjs';

import { enabled, actionEnabled, allowsQuery } from '../../qa-features.mjs';
import { withFeatures, settings, saveSettings, featuresPage } from '../feature-store.mjs';

const project = 'https://aaikttogoejfvxbosktg.supabase.co';
const site = 'online-business-directory-qa-138.netlify.app';
const slugPattern = /^[a-z][a-z0-9-]{1,62}$/;
const uuidPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;

export const config = {
  path: ['/', '/admin', '/admin/regions', '/admin/businesses', '/admin/features', '/admin/regions/preview/:slug', '/regions/:slug', '/media/:slug/:id']
};

const headers = {
  'Cache-Control': 'private, no-store',
  'Vary': 'Authorization',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src https:; frame-src https://www.openstreetmap.org; frame-ancestors 'none'; form-action 'self'; base-uri 'none'"
};

const html = (body, status = 200, extra = {}) =>
  new Response(body, { status, headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8', ...extra } });
const error = (status, message) => html(page('온라인업소록 QA', message), status);
const redirect = location => html(null, 303, { Location: location });
const challenge = () => html(page('온라인업소록 QA', '온라인업소록 QA 전용 계정으로 로그인하세요.'), 401,
  { 'WWW-Authenticate': 'Basic realm="Online Directory QA", charset="UTF-8"' });

function credentials(request) {
  const header = request.headers.get('authorization') ?? '';
  if (!header.startsWith('Basic ') || header.length > 256) return null;
  const value = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const match = /^([a-z][a-z0-9-]{2,40}):([a-fA-F0-9]{64})$/.exec(value);
  return match ? { actor: match[1], proof: match[2] } : null;
}

export async function database(op, auth, area, expected, payload) {
  const key = process.env.DIRECTORY_QA_PUBLIC_KEY;
  const gate = process.env.DIRECTORY_QA_GATE;
  if (!key || !/^[a-fA-F0-9]{64}$/.test(gate ?? '')) throw Error('QA connection unavailable');
  const response = await fetch(project + '/rest/v1/rpc/online_directory_qa_v1', {
    method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ op, gate, ...auth, area, expected, payload }),
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw Error('QA database operation failed: ' + response.status);
  return response.json();
}

async function formData(request, multipart) {
  const maxBytes = multipart ? 370000 : 8192;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = Buffer.concat(chunks);
  if (!multipart) return new URLSearchParams(body.toString('utf8'));
  return new Response(body, { headers: { 'Content-Type': request.headers.get('content-type') } }).formData();
}

function ownerView(region, identity) {
  if (identity.role !== 'owner' || !region?.businessQa) return region;
  const qa = region.businessQa;
  return { ...region, businessQa: { ...qa, records: qa.records
    .filter(record => record.ownerAccount === identity.name || (record.approved && record.visible))
    .map(record => ({ ...record, pending: record.ownerAccount === identity.name ? record.pending : null,
      claims: record.claims.filter(claim => claim.account === identity.name) })) } };
}

async function prepareImage(form, record, region, url) {
  const file = form.get('file');
  if (!record || !file || typeof file.arrayBuffer !== 'function' || file.size < 12 || file.size > 358400) {
    throw Error('INVALID_QA_IMAGE');
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const png = bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a','hex'));
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if ((file.type !== 'image/png' || !png) && (file.type !== 'image/jpeg' || !jpeg)) throw Error('INVALID_QA_IMAGE');
  const id = randomUUID();
  const address = url.origin + '/media/' + region.slug + '/' + id;
  const data = record.pending ?? record.approved;
  const edit = new URLSearchParams(Object.entries({ ...data, image: address, action: 'edit', id: record.id }));
  return { edit, upload: { id, url: address, type: file.type, bytes: bytes.toString('base64') } };
}

async function businesses(request, url, auth, identity) {
  const slug = url.searchParams.get('region') ?? identity.region;
  const scoped = identity.role !== 'superadmin';
  if (slug && (!slugPattern.test(slug) || (scoped && slug !== identity.region))) return error(404, '지역을 찾을 수 없습니다.');
  const saved = slug ? await database('read', auth, slug) : {};
  if (slug && saved.status !== 200) return error(saved.status, '지역을 찾을 수 없습니다.');
  const region = saved.region ? await withFeatures(saved.region) : null;
  if (region && identity.role === 'owner' && !enabled(region,'ownerPortal')) return error(404,'업주 메뉴가 꺼져 있습니다.');
  const selected = url.searchParams.get('id');
  const filtered = ownerView(region, identity);
  const display = async (id, message, status = 200) => {
    const regions = scoped ? [filtered].filter(Boolean) : (await database('list', auth)).regions;
    const menuRegions = regions.map(item => item.slug === filtered?.slug ? filtered : item);
    return html(businessAdminPage(menuRegions, filtered, id, message, { ...identity, upload: true, photos: !region || enabled(region,'photos'), allowed: action => !region || actionEnabled(region,action), listing: !region || enabled(region,'directory') || identity.role !== 'owner' }), status);
  };
  if (request.method === 'GET') {
    if (selected && identity.role === 'owner' && !enabled(region ?? {},'directory') && !filtered?.businessQa?.records.some(record=>record.id===selected && record.ownerAccount===identity.name)) return error(404,'업소를 찾을 수 없습니다.');
    if (selected && !filtered?.businessQa?.records.some(record => record.id === selected)) return error(404, '업소를 찾을 수 없습니다.');
    return display(selected);
  }
  if (!region) return error(400, '지역을 선택하세요.');
  const multipart = request.headers.get('content-type')?.startsWith('multipart/form-data;');
  const form = await formData(request, multipart);
  if (!form) return error(413, '입력 또는 이미지 크기를 확인하세요.');
  const action = form.get('action');
  if (!actionEnabled(region,action)) return error(404, '이 지역에서 꺼져 있는 기능입니다.');
  const id = form.get('id');
  const record = region.businessQa?.records.find(item => item.id === id);
  if (!enabled(region,'photos') && ['create','edit'].includes(action)) form.set('image',(record?.pending ?? record?.approved)?.image ?? '');
  if (identity.role === 'owner') {
    if (!['create','edit','image','claim'].includes(action)) return error(403, '관리자 권한이 필요합니다.');
    if (action !== 'create' && (!record ||
       (action === 'claim' ? !record.approved || !record.visible : record.ownerAccount !== identity.name))) {
      return error(404, '업소를 찾을 수 없습니다.');
    }
    if (action === 'claim' && record.ownerAccount) return error(409, '소유권이 이미 지정됐습니다.');
  }
  if (multipart !== true && action === 'image') return error(400, '이미지 파일을 선택하세요.');
  if (multipart && action !== 'image') return error(400, '이미지 업로드 요청을 확인하세요.');
  let document, upload;
  try {
    const prepared = action === 'image' ? await prepareImage(form, record, region, url) : null;
    upload = prepared?.upload;
    [document] = manageBusinesses([saved.region], slug, prepared?.edit ?? form);
    const next = action === 'create' ? document.businessQa.records.at(-1) :
      document.businessQa.records.find(item => item.id === id);
    if (action === 'create' && identity.role === 'owner') next.ownerAccount = identity.name;
    if (action === 'claim' && identity.role === 'owner') next.claims.at(-1).account = identity.name;
    if (action === 'claim-approve') {
      const claim = next.claims.find(item => item.id === form.get('claimId'));
      if (claim.account && next.ownerAccount && claim.account !== next.ownerAccount) return error(409, '소유권이 이미 지정됐습니다.');
      if (claim.account) next.ownerAccount = claim.account;
    }
  } catch (e) {
    if (e.message === 'NOT_FOUND') return error(404, '업소를 찾을 수 없습니다.');
    if (/^[A-Z_]+$/.test(e.message)) return display(id, e.message, 400);
    throw e;
  }
  const result = await database('write', auth, slug, saved.version, { document, action, upload });
  if (result.status !== 200) return error(result.status, '최신 지역 정보를 확인하고 다시 시도하세요.');
  const nextId = action === 'create' ? document.businessQa.records.at(-1).id :
    document.businessQa.records.find(item => item.id === id)?.id;
  return redirect(`/admin/businesses?region=${slug}${nextId ? '&id=' + nextId : ''}`);
}

async function regions(request, url, auth) {
  const current = (await database('list', auth)).regions;
  if (request.method === 'GET') return html(adminPage(current, current.find(item => item.slug === url.searchParams.get('edit'))));
  const form = await formData(request, false);
  if (!form) return error(413, '입력값 길이를 확인하세요.');
  try {
    const [document] = saveRegion(form.get('mode') === 'edit' ? current.filter(item => item.slug === form.get('slug')) : [],
      form.get('slug')?.trim(), form).slice(-1);
    const editing = form.get('mode') === 'edit';
    if (!editing && current.some(region => region.slug === document.slug)) return html(adminPage(current, null, 'REGION_ALREADY_EXISTS'), 409);
    const previous = editing ? await database('read', auth, document.slug) : {};
    // Recompute from the version that is written to preserve parallel business edits.
    const next = editing ? saveRegion([previous.region], document.slug, form).at(-1) : document;
    const result = await database('write', auth, next.slug, previous.version, { document: next, action: editing ? 'region-edit' : 'region-create' });
    if (!editing && result.status === 409) return html(adminPage(current, null, 'REGION_ALREADY_EXISTS'), 409);
    if (result.status !== 200) return error(result.status, '최신 지역 정보를 확인하고 다시 저장하세요.');
    return redirect('/admin/regions?edit=' + next.slug);
  } catch (e) {
    if (/^[A-Z_]+$/.test(e.message)) return html(adminPage(current, null, e.message), 400);
    throw e;
  }
}

async function featureAdmin(request,url,auth,identity) {
  const central = identity.role === 'superadmin';
  if (!central && identity.role !== 'region-admin') return error(403,'관리자 권한이 필요합니다.');
  const requested = url.searchParams.get('region') ?? (central ? '*' : identity.region);
  if (!central && requested !== identity.region) return error(404,'지역을 찾을 수 없습니다.');
  const scope = requested;
  const record = scope === '*' ? null : await database('read',auth,scope);
  if (record && record.status!==200) return error(404,'지역을 찾을 수 없습니다.');
  if(request.method==='POST'){
    if(request.headers.get('content-type')?.split(';')[0]!=='application/x-www-form-urlencoded')return error(400,'지원하지 않는 양식입니다.');
    const form=await formData(request,false);
    if(!form)return error(413,'입력값 길이를 확인하세요.');
    try {
      if(!await saveSettings(scope,form,identity))return error(409,'다른 변경이 저장됐습니다. 설정을 다시 여세요.');
    } catch(e) {
      if(e.message==='INVALID_FEATURE')return error(400,'설정값을 확인하세요.');
      throw e;
    }
    return redirect('/admin/features?region='+encodeURIComponent(requested)+'&saved=1');
  }
  const regions=central?(await database('list',auth)).regions:[];
  return html(featuresPage(regions,scope,record?await withFeatures(record.region):null,await settings(scope),url.searchParams.has('saved'),central));
}

async function renderRegion(region,preview,query){
  const view=await withFeatures(region);
  return allowsQuery(view,query)?html(demoPage(view,preview,query)):error(404,'이 지역에서 꺼져 있는 기능입니다.');
}
export default async function handler(request) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (url.protocol !== 'https:' || !url.hostname.endsWith('--' + site)) return error(404, 'QA 주소를 확인하세요.');
  if (!['GET','POST'].includes(request.method)) return error(405, '지원하지 않는 요청입니다.');
  const auth = credentials(request);
  try {
    if (path.startsWith('/media/') && request.method === 'GET') {
      const [, , slug, id] = path.split('/');
      if (!uuidPattern.test(id)) return error(404, '이미지를 찾을 수 없습니다.');
      const visible = auth ? await database('read',auth,slug) : {};
      const scope = visible.status===200 ? visible : await database('public',null,slug);
      if(scope.status!==200)return error(404,'이미지를 찾을 수 없습니다.');
      const mediaRegion = await withFeatures(scope.region);
      if(!enabled(mediaRegion,'photos') || (visible.status!==200 && !enabled(mediaRegion,'directory')))return error(404,'이미지를 찾을 수 없습니다.');
      const result = await database('image', auth, slug, undefined, { id });
      return result.status === 200 ? new Response(Buffer.from(result.image,'base64'), {
        headers: { ...headers, 'Content-Type': result.type }
      }) : error(result.status, '이미지를 찾을 수 없습니다.');
    }
    if (path.startsWith('/admin')) {
      if (!auth) return challenge();
      const identity = await database('identity', auth);
      if (identity.status !== 200) return challenge();
      if (request.method === 'POST' && request.headers.get('origin') !== url.origin) return error(403, 'QA 양식에서 다시 시도하세요.');
      if (path === '/admin/features') return await featureAdmin(request,url,auth,identity);
      if (path === '/admin/businesses') return await businesses(request, url, auth, identity);
      const preview = /^\/admin\/regions\/preview\/([a-z0-9-]+)$/.exec(path);
      if (preview && request.method === 'GET') {
        const result = await database('read', auth, preview[1]);
        if (result.status !== 200) return error(result.status, '지역을 찾을 수 없습니다.');
        const viewRegion = identity.role === 'owner' ?
          { ...result.region, businessQa: ownerView(result.region, identity).businessQa } : result.region;
        return await renderRegion(viewRegion,true,url.searchParams);
      }
      if (identity.role !== 'superadmin') return error(403, '총괄 관리자 권한이 필요합니다.');
      if (path === '/admin' || path === '/admin/regions') return await regions(request, url, auth);
    }
    const match = /^\/regions\/([a-z0-9-]+)$/.exec(path);
    if (match && request.method === 'GET') {
      const result = await database('public', null, match[1]);
      return result.status === 200 ? await renderRegion(result.region,false,url.searchParams) :
        error(result.status, '공개된 지역을 찾을 수 없습니다.');
    }
    if (path === '/' && request.method === 'GET') return html(page('온라인업소록', `<h1>온라인업소록 Colorado QA</h1>
<p>콜로라도 전체 지역은 비공개 QA 상태입니다.</p><nav><a href="/admin/regions/preview/colorado">콜로라도맵 미리보기</a>
<a href="/admin/businesses?region=colorado">업소관리</a><a href="/admin/regions">지역 관리</a><a href="/admin/features?region=colorado">기능 설정</a></nav>`));
    return error(404, '페이지를 찾을 수 없습니다.');
  } catch (e) {
    console.error('Directory QA:', e.message);
    return error(503, 'QA 저장소에 연결할 수 없습니다.');
  }
}



