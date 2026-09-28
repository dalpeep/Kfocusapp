const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const originalLoad = Module._load;
Module._load = function (request, ...args) {
  if (request === '@supabase/supabase-js') {
    return { createClient() { throw new Error('Database client must not be created.'); } };
  }
  return originalLoad.call(this, request, ...args);
};
const { handler } = require('../netlify/functions/set-admin-user');
Module._load = originalLoad;

test('set-admin-user rejects every POST before database access', async () => {
  for (const body of [
    '{}',
    '{invalid',
    JSON.stringify({ email: 'synthetic@example.invalid', role: 'super_admin', area: 'all' })
  ]) {
    const result = await handler({ httpMethod: 'POST', body });
    assert.equal(result.statusCode, 403);
  }
  assert.equal((await handler({ httpMethod: 'GET' })).statusCode, 405);
});
