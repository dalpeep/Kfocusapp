import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import config from './functions/config.mjs';
import feed from './functions/today-daltown-feed.mjs';
import target from './target.cjs';

test('QA uses only its pinned public configuration and read transport', async t => {
  const request = new Request('https://preview.netlify.app/.netlify/functions/config');
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url.origin, target.SUPABASE_URL);
    assert.equal(url.pathname, '/rest/v1/newsroom_items');
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.apikey, 'sb_publishable_test');
    return Response.json([]);
  });
  const previous = {...process.env};
  t.after(() => {
    for (const key of ['QA_SUPABASE_URL', 'QA_SUPABASE_PUBLIC_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
      if (Object.hasOwn(previous, key)) process.env[key] = previous[key];
      else delete process.env[key];
    }
  });
  process.env.QA_SUPABASE_URL = 'https://ydrxuqmjzayejlnjzzew.supabase.co';
  process.env.QA_SUPABASE_PUBLIC_KEY = 'sb_publishable_test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-server-key';
  assert.equal((await config(request)).status, 503);
  assert.equal((await feed(request)).status, 503);
  process.env.QA_SUPABASE_URL = target.SUPABASE_URL;
  const response = await config(request);
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.ok(body.includes(target.SUPABASE_URL));
  assert.ok(body.includes('https://preview.netlify.app'));
  assert.ok(!body.includes('test-server-key'));
  assert.equal((await feed(new Request(request.url, {method: 'POST'}))).status, 405);
  assert.equal((await feed(request)).status, 200);
  assert.equal(globalThis.fetch.mock.callCount(), 1);
});

test('QA artifact preserves the application and excludes function sources and auth connections', () => {
  for (const name of ['index.html', 'app-v99.js', 'styles.css', 'assets/community.js', 'owner-uuid/index.html']) {
    assert.deepEqual(fs.readFileSync('.qa-source-public/' + name), fs.readFileSync(name));
  }
  for (const name of ['netlify', 'admin', 'OneSignalSDKWorker.js', 'package.json', '.git']) {
    assert.ok(!fs.existsSync('.qa-source-public/' + name));
  }
  const headers = fs.readFileSync('.qa-source-public/_headers', 'utf8');
  assert.ok(headers.includes(target.SUPABASE_URL + '/rest/v1/'));
  assert.ok(!headers.includes('/auth/v1/') && !headers.includes('ydrxuqmjzayejlnjzzew'));
});
