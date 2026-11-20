import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { chromium } from 'playwright';
import handler from '../../region-platform/owner-test/functions/directory-qa.mjs';

const host = process.env.OWNER_TEST_DIRECTORY_QA_URL;
const users = {
  admin: ['directory-admin', process.env.OWNER_TEST_DIRECTORY_ADMIN_PASSWORD],
  regional: ['co-qa-admin', process.env.OWNER_TEST_DIRECTORY_REGION_PASSWORD],
  owner: ['co-qa-owner', process.env.OWNER_TEST_DIRECTORY_OWNER_PASSWORD]
};
const localFunction = process.env.OWNER_TEST_DIRECTORY_LOCAL_FUNCTION === '1';
const qaFetch = (url, options) => localFunction ? handler(new Request(url, options)) : fetch(url, options);
const fixtureRegion = 'colorado-fixture';
const urlFor = slug => host + '/admin/businesses?region=' + slug;
const open = (page, url) => page.goto(url, { waitUntil: 'domcontentloaded' });

test('owner-test online QA: private Colorado, region permissions and image approval', { skip: !host }, async () => {
  assert.equal(host, 'https://colorado-qa--online-business-directory-qa-138.netlify.app');
  const header = key => 'Basic ' + Buffer.from(users[key].join(':')).toString('base64');
  assert.equal((await qaFetch(urlFor(fixtureRegion))).status, 401);
  assert.equal((await qaFetch(host + '/regions/colorado')).status, 404);
  assert.equal((await qaFetch(urlFor('colorado'), { headers: { authorization: header('regional') } })).status, 404);
  assert.equal((await qaFetch(urlFor('colorado'), {
    method: 'POST', headers: { authorization: header('owner'), origin: host },
    body: new URLSearchParams({ action: 'create' })
  })).status, 404);

  const browser = await chromium.launch({ executablePath: process.env.REGION_QA_BROWSER || undefined });
  const authorizedPage = async (role, width) => {
    const page = await browser.newPage({
      viewport: { width, height: width === 390 ? 844 : 960 }, isMobile: width === 390,
      ...(!localFunction ? { httpCredentials: { username: users[role][0], password: users[role][1], origin: host } } : {})
    });
    if (localFunction) {
      await page.route(host + '/**', async route => {
        const request = route.request();
        if (new URL(request.url()).pathname === '/qa-ui/kfocus-icon.png') {
          await route.fulfill({ contentType: 'image/png', body: await readFile(new URL('../../assets/kfocus-icon.png', import.meta.url)) });
          return;
        }
        const headers = { ...request.headers(), authorization: header(role) };
        if (request.method() === 'POST') headers.origin = host;
        const response = await qaFetch(request.url(), {
          method: request.method(), headers, body: request.postDataBuffer() || undefined
        });
        await route.fulfill({
          status: response.status, headers: Object.fromEntries(response.headers),
          body: Buffer.from(await response.arrayBuffer())
        });
      });
    }
    return page;
  };
  try {
    for (const width of [390, 1440]) {
      const page = await authorizedPage('admin', width);
      const result = await open(page, host + '/admin/regions/preview/colorado');
      assert.equal(result.status(), 200);
      await page.getByText('콜로라도맵', { exact: true }).first().waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.getByRole('navigation', { name: '하단 메뉴' }).getByRole('link', { name: '업소', exact: true }).click();
      await page.locator('#directory .empty').waitFor();
      await page.close();
    }

    const owner = await authorizedPage('owner', 390);
    const regional = await authorizedPage('regional', 1440);
    owner.setDefaultTimeout(12000);
    regional.setDefaultTimeout(12000);
    const regionalUrl = urlFor(fixtureRegion);
    const suffix = Date.now().toString(36);
    const name = 'QA Business ' + suffix;
    async function submit(page, label) {
      const [response] = await Promise.all([
        page.waitForResponse(result => result.url() === regionalUrl && result.request().method() === 'POST'),
        page.getByRole('button', { name: label, exact: true }).click()
      ]);
      assert.equal(response.status(), 303);
      const address = new URL(response.headers().location, host).href;
      await open(page, address);
      return address;
    }
    async function create(page, title) {
      assert.equal((await open(page, regionalUrl)).status(), 200);
      await page.getByLabel('업소명').fill(title);
      await page.getByLabel('주소', { exact: true }).fill('Synthetic QA location');
      return submit(page, '승인 요청 저장');
    }
    const owned = await create(owner, name);
    const foreign = await create(regional, 'QA Claim ' + suffix);
    const ownedId = new URL(owned).searchParams.get('id');
    const foreignId = new URL(foreign).searchParams.get('id');
    const ownerHeaders = { authorization: header('owner'), origin: host };
    assert.equal((await qaFetch(regionalUrl, { method: 'POST', headers: ownerHeaders,
      body: new URLSearchParams({ action: 'approve', id: ownedId })
    })).status, 403);
    assert.equal((await qaFetch(regionalUrl, { method: 'POST', headers: ownerHeaders,
      body: new URLSearchParams({ action: 'edit', id: foreignId })
    })).status, 404);
    await submit(regional, '업소 승인');
    await submit(regional, '업소 공개');
    await open(owner, foreign);
    await owner.getByLabel('가상 신청 식별자').fill('qa-' + suffix);
    await submit(owner, '소유권 신청');
    await open(regional, foreign);
    await submit(regional, '소유권 승인');
    await open(owner, foreign);
    await owner.getByLabel('업소명').waitFor();
    await open(owner, owned);
    await owner.getByLabel('업소명').fill(name + ' revised');
    await submit(owner, '승인 요청 저장');
    await owner.getByLabel('QA 이미지 파일').setInputFiles({
      name: 'qa-logo.png', mimeType: 'image/png',
      buffer: await readFile(new URL('../../assets/kfocus-icon.png', import.meta.url))
    });
    await submit(owner, '이미지 승인 요청');
    const image = await owner.getByLabel('이미지 URL (HTTPS)').inputValue();
    assert.ok(image.startsWith(host + '/media/' + fixtureRegion + '/'));
    assert.equal((await qaFetch(image)).status, 404);
    assert.equal((await qaFetch(image, { headers: { authorization: header('owner') } })).status, 200);
    await open(regional, owned);
    await submit(regional, '업소 승인');
    await submit(regional, '업소 공개');
    await open(regional, host + '/admin/regions/preview/' + fixtureRegion + '#directory');
    const result = regional.locator('#directory').getByText(name + ' revised', { exact: true });
    await result.waitFor();
    await regional.waitForFunction(address =>
      Array.from(document.querySelectorAll('#directory img')).some(img => img.src === address && img.naturalWidth > 0), image);
    assert.equal((await qaFetch(host + '/regions/' + fixtureRegion)).status, 404);
    await open(regional, owned);
    await submit(regional, '업소 비공개');
    await open(regional, foreign);
    await submit(regional, '업소 비공개');
  } finally {
    await browser.close();
  }
});

