import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { chromium } from 'playwright';

test('지역 관리부터 공개 및 비공개 전환까지 데스크톱과 모바일에서 실행', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'region-qa-'));
  const storage = join(temp, 'regions.json');
  const origin = 'http://127.0.0.1:4177';
  const server = spawn(process.execPath, ['region-platform/qa-server.mjs'], {
    env: { ...process.env, REGION_QA_PORT: '4177', REGION_QA_FILE: storage }
  });
  let browser;
  try {
    await Promise.race([
      once(server.stdout, 'data'),
      once(server, 'exit').then(() => { throw Error('QA server failed to start'); })
    ]);
    browser = await chromium.launch({
      executablePath: process.env.REGION_QA_BROWSER || undefined
    });
    const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
    for (const page of [desktop, mobile]) {
      await page.route('https://www.openstreetmap.org/**', route => route.fulfill({ body: 'QA map fixture' }));
    }

    async function addRegion(page, name, slug, configure = false) {
      await page.goto(origin + '/admin/regions');
      await page.getByLabel('지역 이름').fill(name);
      if (configure) {
        await page.getByLabel('주소 이름').fill(slug);
        await page.getByLabel('중심 위도').fill('29.76');
        await page.getByLabel('중심 경도').fill('-95.37');
        await page.getByLabel('검색 반경 (km)').fill('40');
      }
      await page.getByRole('button', { name: '지역 생성' }).click();
      await page.waitForURL(origin + '/admin/regions?edit=' + slug, { timeout: 5000 }).catch(async error => { throw Error(await page.locator('main').innerText(), { cause: error }); });
    }
    async function assertFits(page) {
      assert.equal(await page.evaluate(() =>
        document.documentElement.scrollWidth <= window.innerWidth), true);
    }
    await addRegion(desktop, '휴스턴', 'houston', true);
    await assertFits(desktop);
    assert.equal((await mobile.goto(origin + '/regions/houston')).status(), 404);
    await desktop.getByRole('link', { name: '미리보기' }).click();
    await desktop.getByRole('heading', { name: '휴스턴맵', level: 1 }).waitFor();
    await desktop.getByRole('navigation', { name: '하단 메뉴' }).getByRole('link', { name: '지도' }).click();
    await desktop.getByTitle('지역 지도').waitFor();
    assert.match(await desktop.getByTitle('지역 지도').getAttribute('src'), /marker=29.76%2C-95.37/);
    await assertFits(desktop);

    await desktop.goto(origin + '/admin/regions?edit=houston');
    await desktop.getByLabel('테마').selectOption('sand');
    await desktop.getByLabel('레이아웃').selectOption('community');
    await desktop.getByLabel('배너 제목').fill('휴스턴 행사 소식');
    await desktop.getByLabel('메뉴 순서').fill('map, directory');
    await desktop.getByLabel('쿠폰', { exact: true }).uncheck();
    await desktop.getByLabel('데모 공개').check();
    await desktop.getByRole('button', { name: '변경 저장' }).click();
    await desktop.getByRole('link', { name: '공개 데모 열기' }).waitFor();
    assert.equal((await mobile.goto(origin + '/regions/houston')).status(), 200);
    await mobile.getByRole('heading', { name: '휴스턴맵', level: 1 }).waitFor();
    assert.equal(await mobile.locator('.home-card').first().getAttribute('data-module'), 'community');
    assert.equal(await mobile.locator('#coupons').count(), 0);
    assert.equal(await mobile.locator('html').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(248, 241, 229)');
    await assertFits(mobile);
    await mobile.getByRole('heading', { name: '휴스턴 행사 소식' }).waitFor();
    assert.equal(await mobile.locator('.bottom-nav a').nth(1).textContent(), '지도');
    await mobile.getByRole('link', { name: '검색 열기' }).click();
    await mobile.getByRole('searchbox', { name: '업소 / 쿠폰 / 게시판 검색' }).fill('Houston QA');
    await mobile.locator('#search button').click();
    await mobile.getByText('검색 결과가 없습니다.').first().waitFor();
    await addRegion(mobile, '오스틴', 'austin');
    await assertFits(mobile);
    await mobile.getByRole('link', { name: '미리보기' }).click();
    await mobile.getByRole('heading', { name: '오스틴맵', level: 1 }).waitFor();
    assert.equal(await mobile.locator('#coupons').count(), 1);
    assert.equal(await mobile.getByRole('heading', { name: '휴스턴 행사 소식' }).count(), 0);
    await mobile.getByRole('link', { name: '메뉴 열기' }).click();
    await mobile.getByRole('navigation', { name: '지역 메뉴' }).getByRole('link', { name: '내 업소 등록' }).click();
    await mobile.getByRole('heading', { name: '내 업소 등록' }).waitFor();
    assert.equal((await mobile.request.get(origin + '/regions/dallas')).status(), 404);

    const invalidOrigin = await mobile.request.post(origin + '/admin/regions', {
      headers: { origin: 'http://localhost:4177' }, form: { slug: 'houston' }
    });
    assert.equal(invalidOrigin.status(), 403);

    await desktop.goto(origin + '/admin/regions?edit=houston');
    await desktop.getByLabel('데모 공개').uncheck();
    await desktop.getByRole('button', { name: '변경 저장' }).click();
    await desktop.getByRole('link', { name: '공개 데모 열기' }).waitFor({ state: 'detached' });
    assert.equal((await mobile.goto(origin + '/regions/houston')).status(), 404);
    const stored = JSON.parse(await readFile(storage, 'utf8'));
    assert.deepEqual(stored.map(region => region.status), ['draft', 'draft']);
    for (const region of stored) {
      assert.ok(Object.values(region.content).every(items => items.length === 0));
    }
  } finally {
    await browser?.close();
    if (server.exitCode === null) {
      const exited = once(server, 'exit');
      server.kill();
      await exited;
    }
    await rm(temp, { force: true, recursive: false }).catch(async () => {
      await rm(storage, { force: true });
      const { rmdir } = await import('node:fs/promises');
      await rmdir(temp);
    });
  }
});




