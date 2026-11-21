import { getStore } from '@netlify/blobs';
import { enabled, featureGroups, featureKeys, unavailable } from '../qa-features.mjs';
import { page } from '../qa-views.mjs';

const store = () => getStore({name:'directory-qa-feature-controls-v1',consistency:'strong'});
const keyFor = scope => scope === '*' ? 'common' : 'region/' + scope;
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
export async function withFeatures(region) {
  const configs = store();
  const [global, local] = await Promise.all([configs.get('common',{type:'json'}),configs.get(keyFor(region.slug),{type:'json'})]);
  return {...region,featureDefaults:global?.flags,featureOverrides:local?.flags};
}
export async function settings(scope) {
  return store().getWithMetadata(keyFor(scope),{type:'json'});
}
export async function saveSettings(scope, form, identity) {
  const previous = await settings(scope);
  if ((form.get('version') || '') !== (previous?.etag ?? '')) return false;
  const flags = {};
  for (const key of featureKeys) {
    const value = form.get(key);
    if (!['on','off','inherit'].includes(value)) throw Error('INVALID_FEATURE');
    if(value !== 'inherit') flags[key] = value === 'on';
  }
  const changes = Object.fromEntries(featureKeys.filter(k=>flags[k]!==previous?.data.flags[k]).map(k=>[k,{before:previous?.data.flags[k]??null,after:flags[k]??null}]));
  if(!Object.keys(changes).length) return true;
  const audit = [...(previous?.data.audit??[]),{actor:identity.name,at:new Date().toISOString(),changes}];
  return (await store().setJSON(keyFor(scope),{flags,audit},previous ? {onlyIfMatch:previous.etag}:{onlyIfNew:true})).modified;
}
export function featuresPage(regions, scope, region, configuration, saved, central) {
  const selector = central ? `<form method="get"><label>적용 범위<select name="region"><option value="*">중앙 공통 기본값</option>${regions.map(r=>`<option value="${r.slug}" ${r.slug===scope?'selected':''}>${escape(r.name)}</option>`).join('')}</select></label><button>열기</button></form>` : '';
  const address = '/admin/features?region=' + encodeURIComponent(scope);
  return page('기능 설정',`<header><h1>기능 설정 · ${escape(region?.name ?? '중앙 공통 기본값')}</h1></header>
<nav>${central?'<a href="/admin/regions">지역 관리</a>':''}${region?`<a href="/admin/businesses?region=${scope}">업소관리</a><a href="/admin/regions/preview/${scope}">미리보기</a>`:''}</nav>
${selector}${saved?'<p role="status">저장했습니다.</p>':''}
<form method="post" action="${address}">
<input type="hidden" name="version" value="${escape(configuration?.etag)}">
<div class="grid">${Object.entries(featureGroups).map(([title,group])=>`<fieldset class="panel"><legend>${title}</legend>${Object.entries(group).map(([key,label])=>{
 const value=configuration?.data.flags[key];
 const state=region?enabled(region,key):value;
 return `<label>${label} · ${state==null?'지역 기본값':state?'ON':'OFF'}<select name="${key}">
<option value="inherit" ${value==null?'selected':''}>${scope==='*'?'지역 기본값':'기본값 상속'}</option>
<option value="on" ${value===true?'selected':''}>ON</option><option value="off" ${value===false?'selected':''}>OFF</option>
</select></label>`;
 }).join('')}</fieldset>`).join('')}</div><button>저장</button> <a href="${address}">취소</a></form>
<section class="panel"><h2>준비 중</h2><p>${unavailable.join(' · ')}</p></section>
<section><h2>변경 이력</h2><ul>${(configuration?.data.audit??[]).slice(-10).reverse().map(a=>`<li>${escape(a.at)} · ${escape(a.actor)} · ${escape(Object.keys(a.changes).join(', '))}</li>`).join('')}</ul></section>`);
}


