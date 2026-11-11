import assert from 'node:assert/strict';
import test from 'node:test';
import ownerPortal, {pilotFetch} from './functions/owner-portal-uuid.mjs';
import target from './target.cjs';

const host = 'https://deploy-preview-99--daltownmap-owner-uuid-qa.netlify.app';
const site = {id: target.SITE_ID};

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
