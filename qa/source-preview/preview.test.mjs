import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import config from './functions/config.mjs';
import feed from './functions/today-daltown-feed.mjs';
import createPost from './functions/community-post-create.mjs';
import admin from './functions/community-admin.mjs';
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
  for (const name of ['index.html', 'app-v99.js', 'assets/community.js', 'owner-uuid/index.html']) {
    assert.deepEqual(fs.readFileSync('.qa-source-public/' + name), fs.readFileSync(name));
  }
  for (const name of ['netlify', 'admin', 'OneSignalSDKWorker.js', 'package.json', '.git']) {
    assert.ok(!fs.existsSync('.qa-source-public/' + name));
  }
  const headers = fs.readFileSync('.qa-source-public/_headers', 'utf8');
  assert.ok(headers.includes(target.SUPABASE_URL + '/rest/v1/'));
  assert.ok(headers.includes('frame-src https://challenges.cloudflare.com'));
  assert.ok(!headers.includes('/auth/v1/') && !headers.includes('ydrxuqmjzayejlnjzzew'));
  const css = fs.readFileSync('.qa-source-public/styles.css', 'utf8');
  assert.ok(css.startsWith(fs.readFileSync('styles.css', 'utf8')));
  assert.match(css, /#communityModal input\[type="file"\] \{ display: none; \}/);
});

test('QA community writes require QA target, correct Turnstile hostname, and existing admin authorization', async t => {
  const host = 'deploy-preview-56--daltownmap-owner-uuid-qa.netlify.app';
  const jwt = ref => ['eyJhbGciOiJIUzI1NiJ9',
    Buffer.from(JSON.stringify({role: 'service_role', ref})).toString('base64url'), 'test-signature'].join('.');
  const service = jwt('hseaeafmmjnbynfyynao');
  const qa = {
    QA_SUPABASE_URL: target.SUPABASE_URL,
    QA_SUPABASE_PUBLIC_KEY: 'sb_publishable_test',
    QA_COMMUNITY_SERVICE_ROLE_KEY: service,
    QA_COMMUNITY_TURNSTILE_SITE_KEY: 'qa-site-test',
    QA_COMMUNITY_TURNSTILE_SECRET_KEY: 'qa-secret-test',
    QA_COMMUNITY_PASSWORD_PEPPER: 'qa-pepper',
    QA_COMMUNITY_RATE_LIMIT_HMAC_SECRET: 'qa-rate',
  };
  const previous = Object.fromEntries(Object.keys(qa).map(key => [key, process.env[key]]));
  Object.assign(process.env, qa);
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  let challengeHost = 'daltownmap.com';
  const calls = [];
  const postId = '00000000-0000-4000-8000-000000000056';
  t.mock.method(globalThis, 'fetch', async (input, options) => {
    const url = new URL(input instanceof Request ? input.url : input);
    calls.push(url.pathname);
    assert.equal(options.redirect, 'error');
    if (url.hostname === 'challenges.cloudflare.com') {
      assert.equal(options.body.get('secret'), 'qa-secret-test');
      return Response.json({success: true, hostname: challengeHost});
    }
    assert.equal(url.origin, target.SUPABASE_URL);
    assert.equal(new Headers(options.headers).get('apikey'), service);
    if (url.pathname.endsWith('/community_rate_limit_take')) return Response.json(true);
    if (url.pathname === '/auth/v1/user') {
      assert.equal(new Headers(options.headers).get('Authorization'), 'Bearer qa-admin-token');
      return Response.json({id: '00000000-0000-4000-8000-000000000001'});
    }
    if (url.pathname.endsWith('/profiles')) return Response.json({role: 'regional_editor', area: 'dallas'});
    if (options.method === 'GET') return Response.json({id: postId, region: 'dallas', category: 'qna',
      status: 'pending', created_at: '2026-11-11T12:00:00Z'});
    const body = JSON.parse(options.body);
    assert.equal(body.status, 'approved');
    if (options.method === 'PATCH') return Response.json([{id: postId}]);
    assert.equal(body.region, 'dallas');
    return Response.json({id: postId}, {status: 201});
  });
  const context = {ip: '192.0.2.1'};
  const post = {region: 'dallas', area: 'dallas', category: 'qna', title: 'QA TEST DL56',
    body: 'Testing the QA community submission.', author_name: 'QA', password: 'test-password',
    details: {post_type: 'question', topic: 'Library'}, turnstile_token: 'test-token'};
  const request = (body, hostname = host) => new Request('https://' + hostname + '/', {
    method: 'POST', body: JSON.stringify(body),
  });
  const configBody = await (await config(new Request('https://' + host))).text();
  assert.match(configBody, /qa-site-test/);
  assert.doesNotMatch(configBody, /qa-secret-test|qa-pepper/);
  assert.equal((await createPost(request(post, 'daltownmap.com'), context)).status, 503);
  process.env.QA_COMMUNITY_SERVICE_ROLE_KEY = jwt('ydrxuqmjzayejlnjzzew');
  assert.equal((await createPost(request(post), context)).status, 503);
  process.env.QA_COMMUNITY_SERVICE_ROLE_KEY = service;
  assert.equal((await createPost(request({...post, upload_ids: ['photo']}), context)).status, 400);
  assert.equal((await admin(request({region: 'dallas', action: 'status', status: 'approved',
    id: '00000000-0000-4000-8000-000000000056'}), context)).status, 401);
  assert.deepEqual(calls, []);
  assert.equal((await createPost(request(post), context)).status, 403);
  assert.deepEqual(calls, ['/turnstile/v0/siteverify']);
  challengeHost = host;
  assert.equal((await createPost(request(post), context)).status, 201);
  assert.deepEqual(calls.slice(1), ['/turnstile/v0/siteverify', '/rest/v1/rpc/community_rate_limit_take',
    '/rest/v1/community_posts']);
  const approval = new Request('https://' + host + '/', {method: 'POST',
    headers: {Authorization: 'Bearer qa-admin-token'},
    body: JSON.stringify({region: 'dallas', action: 'status', status: 'approved', id: postId})});
  assert.equal((await admin(approval, context)).status, 200);
  assert.deepEqual(calls.slice(4), ['/auth/v1/user', '/rest/v1/profiles',
    '/rest/v1/community_posts', '/rest/v1/community_posts']);
});
