import assert from 'node:assert/strict';
import test from 'node:test';
import {makeEdgeHandler, origin, supabase} from '../supabase/functions/owner-phase1/handler.generated.mjs';

test('the authentication-only release denies all owner business operations', async () => {
  let serve;
  const previous = globalThis.Deno;
  globalThis.Deno = {serve: handler => { serve = handler; }};
  try {
    await import('../supabase/functions/owner-phase1/index.ts');
    const headers = {Origin: origin, Authorization: 'Bearer fixture'};
    for (const method of ['GET', 'POST']) {
      const response = await serve(new Request(supabase, {method, headers}));
      assert.equal(response.status, 503);
      assert.equal((await response.json()).code, 'OWNER_QA_PILOT_OFF');
    }
    assert.equal((await serve(new Request(supabase, {method: 'OPTIONS', headers}))).status, 204);
  } finally {
    if (previous === undefined) delete globalThis.Deno;
    else globalThis.Deno = previous;
  }
});

test('production owner claim uses the authenticated actor and preserves the request key', async () => {
  const actor = '11111111-1111-4111-8111-111111111111';
  const key = '22222222-2222-4222-8222-222222222222';
  const business = '33333333-3333-4333-8333-333333333333';
  const request = new Request(supabase, {method: 'POST', headers: {Origin: origin, Authorization: 'Bearer fixture'},
    body: JSON.stringify({action: 'submit', kind: 'claim', key, business_id: business})});
  let calls = 0;
  const handle = makeEdgeHandler({projectUrl: supabase, serviceKey: 'fixture-server', transport: async (url, options) => {
    calls++;
    if (url === supabase + '/auth/v1/user') {
      assert.equal(options.headers.Authorization, 'Bearer fixture');
      return Response.json({id: actor, email_confirmed_at: '2026-01-01'});
    }
    assert.equal(url, supabase + '/rest/v1/rpc/owner_pilot_command_v1');
    assert.deepEqual(JSON.parse(options.body), {p_actor: actor, p_command: {
      action: 'submit', kind: 'claim', key, business_id: business,
    }});
    return Response.json({action: 'submit', pilot: true});
  }});
  assert.equal((await handle(new Request(supabase, {headers: {Origin: 'https://preview.example'}}))).status, 403);
  assert.equal((await handle(new Request(supabase, {headers: {Origin: origin}}))).status, 401);
  assert.equal(calls, 0);
  const result = await handle(request);
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), {ok: true, result: {action: 'submit', pilot: true}});
  assert.equal(calls, 2);
});
