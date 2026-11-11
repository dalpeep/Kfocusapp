import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {runInNewContext} from 'node:vm';
import ownerPortal from './functions/owner-portal-uuid.mjs';
import {makeEdgeHandler, origin, supabase} from './owner-edge.mjs';
import target from './target.cjs';

const host = 'https://deploy-preview-99--daltownmap-owner-uuid-qa.netlify.app';
const site = {id: target.SITE_ID};

test('QA login is available only for the explicit pilot OFF response', async () => {
  const browser = {window: {}};
  runInNewContext(readFileSync(new URL('../../owner-uuid/availability.js', import.meta.url), 'utf8'), browser);
  const start = browser.window.OwnerAvailability.start;
  const check = (code, status = 503) => async () => Response.json({
    ok: false, phase1: true, code, error: 'fixture',
  }, {status});
  const calls = [];
  const options = {createClient: () => 'qa-client', ready: (...args) => calls.push(args),
    disabled: reason => calls.push(reason)};
  assert.equal(await start({...options, check: check('OWNER_QA_PILOT_OFF'), allowQaLogin: true}), true);
  assert.deepEqual(calls.pop(), ['qa-client', true, true]);
  assert.equal(await start({...options, check: check('OWNER_QA_PILOT_OFF')}), false);
  assert.equal(calls.pop(), 'disabled');
  assert.equal(await start({...options, check: check('OTHER_ERROR'), allowQaLogin: true}), false);
  assert.equal(calls.pop(), 'disabled');
  assert.equal(await start({...options, check: check(undefined, 401)}), true);
  assert.deepEqual(calls.pop(), ['qa-client', true, false]);
});

test('QA owner portal stays OFF for reads and mutations without runtime approval', async t => {
  const previous = process.env.QA_OWNER_PHASE1_RUNTIME_ENABLED;
  delete process.env.QA_OWNER_PHASE1_RUNTIME_ENABLED;
  t.after(() => {
    if (previous === undefined) delete process.env.QA_OWNER_PHASE1_RUNTIME_ENABLED;
    else process.env.QA_OWNER_PHASE1_RUNTIME_ENABLED = previous;
  });
  for (const method of ['GET', 'POST']) {
    const response = await ownerPortal(new Request(host, {method}), {site});
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, 'OWNER_QA_PILOT_OFF');
  }
});

test('edge rejects other origins and projects before contacting Supabase', async () => {
  const transport = () => assert.fail('unexpected request');
  const edge = makeEdgeHandler({projectUrl: supabase, serviceKey: 'fixture', transport});
  assert.equal((await edge(new Request(supabase, {headers: {origin: host}}))).status, 403);
  const wrongProject = makeEdgeHandler({projectUrl: 'https://other.supabase.co', serviceKey: 'fixture', transport});
  assert.equal((await wrongProject(new Request(supabase, {headers: {origin}}))).status, 503);
});

test('Netlify forwards only the #59 request to the pinned Edge Function without a service key', async t => {
  for (const [key, value] of Object.entries({OWNER_UUID_ACCESS_MODE: 'phase1',
    QA_OWNER_PHASE1_RUNTIME_ENABLED: 'true', QA_SUPABASE_URL: supabase,
    QA_SUPABASE_PUBLIC_KEY: 'sb_publishable_fixture'})) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }
  const stub = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url.href, supabase + '/functions/v1/owner-phase1-qa?offset=0');
    assert.equal(options.headers.get('apikey'), 'sb_publishable_fixture');
    assert.equal(options.headers.get('authorization'), 'Bearer user-token');
    assert.equal(options.redirect, 'error');
    return Response.json({ok: false}, {status: 503});
  });
  const headers = {authorization: 'Bearer user-token'};
  await ownerPortal(new Request(host, {headers}), {site});
  assert.equal((await ownerPortal(new Request(origin), {site})).status, 401);
  assert.equal(stub.mock.callCount(), 0);
  const result = await ownerPortal(new Request(origin + '/?offset=0', {headers}), {site});
  assert.equal(result.status, 503);
  assert.equal(stub.mock.callCount(), 1);
});

test('edge derives actor from Auth and preserves RPC authorization and the DB switch', async () => {
  const user = '54123e4d-e3a7-44b9-838d-4748c514340b';
  const calls = [];
  const edge = makeEdgeHandler({projectUrl: supabase, serviceKey: 'fixture', transport: async (url, options) => {
    calls.push([url, options]);
    if (url.endsWith('/auth/v1/user')) {
      assert.equal(options.headers.Authorization, 'Bearer user-token');
      return Response.json({id: user, email_confirmed_at: '2026-01-01'});
    }
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, 'Bearer fixture');
    assert.equal(JSON.parse(options.body).p_actor, user);
    return url.endsWith('command_v1')
      ? Response.json({code: 'OP403', message: 'Pilot reviewer denied'}, {status: 400})
      : Response.json({code: 'OP503', message: 'Owner pilot disabled'}, {status: 400});
  }});
  const probe = await edge(new Request(supabase, {headers: {origin}}));
  assert.equal(probe.status, 401);
  const headers = {origin, Authorization: 'Bearer user-token'};
  const read = await edge(new Request(supabase, {headers}));
  assert.equal(read.status, 503);
  assert.equal((await read.json()).code, 'OWNER_QA_PILOT_OFF');
  const command = await edge(new Request(supabase, {method: 'POST', headers, body: JSON.stringify({
    action: 'approve', key: user, request_id: user,
  })}));
  assert.equal(command.status, 403);
  assert.equal((await command.json()).code, 'OWNER_PILOT_REVIEW_FORBIDDEN');
  assert.equal(calls.length, 4);
  assert.ok(calls.every(([url]) => new URL(url).origin === supabase));
});
