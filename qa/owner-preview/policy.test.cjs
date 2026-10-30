const { test } = require('node:test');
const assert = require('node:assert/strict');
const { assess, inspectRegistration } = require('./policy.cjs');
const closed = require('./approval.json');
const approval = { buildApproved: true, runtimeApproved: false, pr: 123, head: 'dev/owner-qa-test', commit: 'a'.repeat(40) };
const good = { SITE_ID: 'ec0bc146-8184-4627-90e0-df82ec2b06f9', CONTEXT: 'deploy-preview', NETLIFY: 'true', PULL_REQUEST: 'true', REVIEW_ID: '123', HEAD: approval.head, BRANCH: 'pull/123/head', COMMIT_REF: approval.commit, SUPABASE_URL: 'https://hseaeafmmjnbynfyynao.supabase.co', SUPABASE_ANON_KEY: 'synthetic-public', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-secret', OWNER_UUID_ENABLED: 'false', OWNER_NOTIFICATION_WORKER_ENABLED: 'false', OWNER_NOTIFICATION_MODE: 'mock' };
test('checked-in approval is closed even with matching metadata', () => assert.equal(assess(good, closed).allowed, false));
test('metadata match is not runtime or Service Role authentication approval', () => { const r = assess(good, approval); assert.equal(r.allowed, true); assert.equal(r.runtimeEnabled, false); assert.equal(r.authentication, 'NOT_TESTED'); });
for (const key of Object.keys(good)) {
  test(`missing ${key} fails closed`, () => { const e = { ...good }; delete e[key]; assert.equal(assess(e, approval).allowed, false); });
  test(`mismatched ${key} fails closed`, () => assert.equal(assess({ ...good, [key]: '' }, approval).allowed, false));
}
for (const key of ['RESEND_API_KEY', 'OWNER_QA_RESEND_API_KEY']) test(`${key} presence blocks`, () => assert.equal(assess({ ...good, [key]: 'synthetic-provider' }, approval).allowed, false));
test('HEAD is source branch; BRANCH is checkout reference', () => assert.equal(assess({ ...good, BRANCH: approval.head }, approval).allowed, false));
test('full checkout reference supported', () => assert.equal(assess({ ...good, BRANCH: 'refs/pull/123/head' }, approval).allowed, true));
test('production project rejected', () => assert.equal(assess({ ...good, SUPABASE_URL: 'https://ydrxuqmjzayejlnjzzew.supabase.co' }, approval).allowed, false));
test('runtime approval cannot be smuggled into build-only approval', () => assert.equal(assess(good, { ...approval, runtimeApproved: true }).allowed, false));
test('no credentials or tokens in diagnostics', () => { const out = JSON.stringify([assess(good, approval), inspectRegistration(good)]); for (const k of ['SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) assert.equal(out.includes(good[k]), false); });
test('registration presence never claims key project authentication', () => { const r = inspectRegistration(good); assert.equal(r.servicePresent, true); assert.equal(r.serviceProjectBinding, 'UNVERIFIED'); });
test('module has no network, database, filesystem or provider side effects', () => { const s = require('node:fs').readFileSync(require.resolve('./policy.cjs'), 'utf8'); assert.doesNotMatch(s, /fetch\(|https\.request|createClient\(|process\.env|writeFile|require\(/); });
