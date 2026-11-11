import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {runInNewContext} from 'node:vm';
import ownerPortal, {pilotFetch} from './functions/owner-portal-uuid.mjs';
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

test('owner transport blocks every origin except UUID QA and every path outside pilot RPC and Auth', () => {
  assert.throws(() => pilotFetch('https://ydrxuqmjzayejlnjzzew.supabase.co/auth/v1/user'), /QA_OWNER_TARGET_REQUIRED/);
  assert.throws(() => pilotFetch(target.SUPABASE_URL + '/rest/v1/businesses'), /QA_OWNER_TARGET_REQUIRED/);
  assert.throws(() => pilotFetch(target.SUPABASE_URL + '/storage/v1/object/public/'), /QA_OWNER_TARGET_REQUIRED/);
});
