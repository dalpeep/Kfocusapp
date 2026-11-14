import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {runInNewContext} from 'node:vm';

const script = readFileSync(new URL('../../owner-uuid/invite.js', import.meta.url), 'utf8');

for (const scenario of [
  {fragment: 'type=invite&token_hash=fixture', method: 'verifyOtp'},
  {fragment: 'type=recovery&token_hash=fixture', method: 'verifyOtp'},
  {fragment: 'type=recovery&access_token=fixture&refresh_token=fixture', method: 'setSession'},
]) {
  test('password callback validates ' + scenario.fragment.split('&')[0] + ' using ' + scenario.method, async () => {
    let submit;
    let cleanedUrl;
    const calls = [];
    const button = {disabled: false};
    const form = {
      hidden: true, querySelector: selector => selector === 'button' ? button : {},
      addEventListener: (_, listener) => { submit = listener; }, reset() {},
    };
    const status = {};
    const window = {};
    runInNewContext(script, {
      window, URLSearchParams, location: {hash: '#' + scenario.fragment, pathname: '/owner-uuid/', search: ''},
      history: {replaceState: (_, __, path) => { cleanedUrl = path; }},
      document: {getElementById: id => id === 'status' ? status : form},
      FormData: class { get() { return 'synthetic-password'; } },
    });
    assert.equal(cleanedUrl, '/owner-uuid/');
    const user = {id: 'fixture', email_confirmed_at: '2026-01-01'};
    window.OwnerInvite.start(() => ({auth: {
      [scenario.method]: async () => {
        calls.push('session');
        return {data: {session: {}, user}};
      },
      getUser: async () => { calls.push('identity'); return {data: {user}}; },
      updateUser: async () => { calls.push('update'); return {}; },
    }}), async options => { assert.equal(options.showLogin, true); calls.push('login'); });
    await submit({preventDefault() {}});
    assert.deepEqual(calls, ['session', 'identity', 'update', 'login']);
    assert.equal(form.hidden, true);
  });
}

test('signup callback scrubs credentials and routes verified users to owner lookup without changing the password', async () => {
  const routes = [];
  const calls = [];
  const user = {id:'fixture', email_confirmed_at:'2026-01-01'};
  const window = {};
  runInNewContext(script, {
    window, URLSearchParams,
    location:{hash:'#type=signup&access_token=fixture&refresh_token=fixture', pathname:'/owner-uuid/', search:''},
    history:{replaceState:(_,__,path)=>routes.push(path)},
    document:{getElementById:()=>({})},
  });
  assert.deepEqual(routes,['/owner-uuid/']);
  await window.OwnerInvite.start(()=>({auth:{
    setSession:async()=>{calls.push('session');return {data:{session:{},user}};},
    getUser:async()=>{calls.push('identity');return {data:{user}};},
  }}), async options=>{assert.equal(options.showLogin,true);calls.push('login');});
  assert.deepEqual(routes,['/owner-uuid/','/owner-uuid/#find']);
  assert.deepEqual(calls,['session','identity','login']);
});
