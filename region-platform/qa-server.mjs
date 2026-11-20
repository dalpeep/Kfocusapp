import { createServer } from 'node:http';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { REGION_STATUS } from './region-config.mjs';
import { saveRegion } from './qa-settings.mjs';
import { adminPage, demoPage, page } from './qa-views.mjs';

const port = Number(process.env.REGION_QA_PORT || 4176);
const origin = `http://127.0.0.1:${port}`;
const storage = process.env.REGION_QA_FILE ? resolve(process.env.REGION_QA_FILE) : null;
let regions = [];
if (storage) {
  try {
    regions = JSON.parse(await readFile(storage, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
let writes = Promise.resolve();

function send(res, status, html) {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow',
    'Referrer-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' https:; frame-src https://www.openstreetmap.org; frame-ancestors 'none'; form-action 'self'; base-uri 'none'"
  });
  res.end(html);
}

createServer(async (req, res) => {
  try {
    if (req.headers.host !== new URL(origin).host) return send(res, 403, page('접근 제한', '로컬 QA 주소를 사용하세요.'));
    const url = new URL(req.url, origin);
    const route = url.pathname;
    if (req.method === 'GET' && route === '/qa-ui/kfocus-icon.png') {
      const logo = await readFile(new URL('../assets/kfocus-icon.png', import.meta.url));
      res.writeHead(200, { 'Content-Type': 'image/png' });
      return res.end(logo);
    }
    if (req.method === 'POST' && route === '/admin/regions') {
      if (req.headers.origin !== origin || !req.headers['content-type']?.startsWith('application/x-www-form-urlencoded')) {
        return send(res, 403, page('접근 제한', '로컬 QA 화면에서 다시 시도하세요.'));
      }
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 8192) return send(res, 413, page('입력 오류', '입력값이 너무 깁니다.'));
      }
      const form = new URLSearchParams(body);
      let slug = form.get('slug')?.trim();
      const operation = writes.then(async () => {
        const updated = saveRegion(regions, slug, form);
        slug = updated.at(-1).slug;
        if (storage) {
          const temporary = `${storage}.${randomUUID()}.tmp`;
          await writeFile(temporary, JSON.stringify(updated), { flag: 'wx' });
          await rename(temporary, storage);
        }
        regions = updated;
      });
      writes = operation.catch(() => {});
      try {
        await operation;
      } catch (error) {
        const validation = /^[A-Z_]+$/.test(error.message);
        return send(res, validation ? 400 : 500, adminPage(regions, null, validation ? error.message : '저장소에 기록할 수 없습니다.'));
      }
      res.writeHead(303, { Location: `/admin/regions?edit=${slug}`, 'Cache-Control': 'no-store' });
      return res.end();
    }
    if (req.method !== 'GET') return send(res, 405, page('요청 오류', '지원하지 않는 요청입니다.'));
    if (route === '/' || route === '/admin' || route === '/admin/regions') {
      return send(res, 200, adminPage(regions, regions.find(region => region.slug === url.searchParams.get('edit'))));
    }
    const match = /^\/(regions|admin\/regions\/preview)\/([a-z][a-z0-9-]{1,62})\/?$/.exec(route);
    const region = match && regions.find(item => item.slug === match[2]);
    const preview = match?.[1] === 'admin/regions/preview';
    if (region && region.status !== REGION_STATUS.disabled && (preview || region.status === REGION_STATUS.demo)) {
      return send(res, 200, demoPage(region, preview, url.searchParams));
    }
    return send(res, 404, page('지역을 찾을 수 없습니다', '주소와 지역 공개 상태를 확인하세요.'));
  } catch {
    return send(res, 500, page('요청 처리 오류', '잠시 후 다시 시도하세요.'));
  }
}).listen(port, '127.0.0.1', () => console.log(origin + '/admin/regions'));




