const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const source=fs.readFileSync(path.join(__dirname,'..','assets','community.js'),'utf8');

test('modal lifecycle removes the active widget and invalidates pending renders',()=>{
  assert.match(source,/function removeTurnstile\(\)\{turnstileGeneration\+\+/);
  assert.match(source,/root\.turnstile\.remove\(turnstileWidgetId\)/);
  assert.match(source,/function closeModal\(\)\{removeTurnstile\(\)/);
  assert.match(source,/if\(generation!==turnstileGeneration\|\|!box\.isConnected/);
  assert.match(source,/function openPostDelete\(\)[\s\S]*?removeTurnstile\(\)/);
});

test('one explicit script and one widget are retained through category changes',()=>{
  assert.match(source,/if\(!turnstileScriptPromise\)turnstileScriptPromise=/);
  assert.match(source,/if\(turnstileWidgetBox===box&&turnstileWidgetId!==null\)return/);
  assert.match(source,/turnstileWidgetId=root\.turnstile\.render\(box,/);
  assert.doesNotMatch(source,/f\.category\.onchange=\(\)=>\{[^}]*renderTurnstile/);
});

test('token is scoped to the current widget and failures reset it',()=>{
  assert.match(source,/function token\(\)\{return turnstileWidgetBox\?\.isConnected&&turnstileWidgetId!==null\?turnstileToken:''\}/);
  assert.match(source,/callback:value=>\{if\(generation===turnstileGeneration\)turnstileToken=value\}/);
  assert.match(source,/'expired-callback':\(\)=>\{if\(generation===turnstileGeneration\)turnstileToken=''\}/);
  assert.match(source,/'error-callback':\(\)=>\{if\(generation===turnstileGeneration\)turnstileToken=''\}/);
  assert.match(source,/if\(!res\.ok\)throw new Error\([^\n]+catch\(error\)\{if\(generation===turnstileGeneration\)resetTurnstile\(\);throw error\}/);
});
