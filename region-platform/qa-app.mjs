import { appStyles } from './qa-app-styles.mjs';
import { businessCategories, publicBusinesses } from './qa-business.mjs';
import { regionBrand } from './qa-settings.mjs';

const iconPaths = {
  home: '<path d="m3 10 9-7 9 7v11h-6v-7H9v7H3z"/>',
  directory: '<path d="M3 9h18l-2-5H5L3 9v3a3 3 0 0 0 5 2 3 3 0 0 0 4 0 3 3 0 0 0 4 0 3 3 0 0 0 5-2V9M5 15v5h14v-5M10 20v-4h4v4"/>',
  coupons: '<path d="M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4zM12 7v2m0 2v2m0 2v2"/>',
  map: '<path d="M19 9c0 5-7 11-7 11S5 14 5 9a7 7 0 0 1 14 0Z"/><circle cx="12" cy="9" r="2.5"/>',
  guide: '<path d="M12 6C9 3 5 3 2 4v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-3-1-7-1-10 2Zm0 0v14"/>',
  promotions: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v8h14v-8M12 8v12M12 8H8a2.5 2.5 0 1 1 2-4c1 1 2 4 2 4Zm0 0h4a2.5 2.5 0 1 0-2-4c-1 1-2 4-2 4Z"/>',
  deals: '<path d="M2 4h3l3 11h11l3-8H6"/><circle cx="10" cy="20" r="1"/><circle cx="18" cy="20" r="1"/>',
  events: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18m-9 2 1 2 2 .3-1.5 1.5.3 2.2-1.8-1-1.8 1 .3-2.2L9 14.3l2-.3Z"/>',
  community: '<path d="M21 11a8 8 0 0 1-8 8H8l-5 2 1-5a8 8 0 0 1 7-13h2a8 8 0 0 1 8 8Z"/>',
  menu: '<path d="M5 6h14M5 12h14M5 18h14"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>'
};
const icon = name => `<svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${iconPaths[name] || iconPaths.community}</svg>`;
const labels = {
  home: '홈', directory: '업소', coupons: '쿠폰', map: '지도', guide: '가이드',
  promotions: '프로모션', deals: '할인', events: '이벤트', community: '커뮤니티',
  jobs: '구인·구직', ownerPortal: '업소관리', ownerRegister: '내 업소 등록',
  localAds: '한 줄 광고', reservations: '예약'
};
const collections = {
  directory: 'businesses', map: 'businesses', coupons: 'coupons', promotions: 'promotions',
  deals: 'deals', events: 'events', community: 'posts', jobs: 'jobs', localAds: 'ads', reservations: 'reservations',
  guide: 'guides'
};
const quickColors = { promotions: '#ff8b00', coupons: '#18bd5c', deals: '#245eee', events: '#8958f5' };

const communityBoards = [
  ['전체', '#4756bb', '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'],
  ['행사안내', '#773dd0', iconPaths.events],
  ['지역 라이프', '#23734d', '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.9M16 3.2a4 4 0 0 1 0 7.6"/><circle cx="9" cy="7" r="4"/>'],
  ['업체홍보', '#a84811', '<path d="m3 11 18-6v14L3 14v-3Zm3 4 2 6h3l-2-5"/>'],
  ['구인·구직', '#2459b7', '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V4h8v3M3 13h18m-11 0v2h4v-2"/>'],
  ['사고팔기', '#ac3565', '<path d="M5 8h14l2 13H3L5 8Zm4 0V6a3 3 0 0 1 6 0v2"/>'],
  ['부동산', '#167083', iconPaths.home],
  ['생활정보·질문', '#5844a2', iconPaths.community + '<path d="M10 8a2 2 0 1 1 3 1.7c-.7.4-1 1-1 1.8m0 3h.01"/>']
];
const escape = value => String(value ?? '').replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function withinRadius(center, item, radiusKm) {
  if (!Number.isFinite(item.lat) || !Number.isFinite(item.lng)) return false;
  const radians = degrees => degrees * Math.PI / 180;
  const lat = radians(item.lat - center.lat);
  const lng = radians(item.lng - center.lng);
  const angle = Math.sin(lat / 2) ** 2 + Math.cos(radians(center.lat)) *
    Math.cos(radians(item.lat)) * Math.sin(lng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(Math.min(1, angle))) <= radiusKm;
}

function mapPanel(region) {
  const { center: { lat, lng }, zoom, radiusKm } = region.map;
  const map = new URL('https://www.openstreetmap.org/export/embed.html');
  const span = 180 / 2 ** zoom;
  const latitude = Math.max(-85, Math.min(85, lat));
  map.searchParams.set('bbox', [
    Math.max(-180, lng - span), Math.max(-85, latitude - span),
    Math.min(180, lng + span), Math.min(85, latitude + span)
  ].join(','));
  map.searchParams.set('marker', `${lat},${lng}`);
  return `<p class="small">중심 ${lat}, ${lng} · 검색 반경 ${radiusKm} km</p>
<iframe class="map-frame" title="지역 지도" src="${escape(map.href)}" loading="lazy" referrerpolicy="no-referrer"></iframe>
<a class="small" href="https://www.openstreetmap.org/#map=${zoom}/${lat}/${lng}" rel="noreferrer">OpenStreetMap에서 열기</a>`;
}

function nav(key, caption = labels[key]) {
  return `<a href="#${key}"><span>${icon(key)}</span>${caption}</a>`;
}

function itemList(items, empty = '등록된 콘텐츠가 없습니다.') {
  return items.length ? `<ul class="results">${items.map(item => `<li>${escape(item.title || item.name)}</li>`).join('')}</ul>` :
    `<p class="empty">${empty}</p>`;
}

function businessList(items) {
  if (!items.length) return itemList(items);
  return `<ul class="results business-results">${items.map(item => `<li>
${item.image ? `<img class="business-photo" src="${escape(item.image)}" alt="" loading="lazy">` : ''}
<div><strong>${escape(item.name)}</strong><p>${escape(item.category)} · ${escape(item.address)}</p>
${item.contact ? `<p>${escape(item.contact)}</p>` : ''}
<a href="https://www.openstreetmap.org/?mlat=${item.lat}&amp;mlon=${item.lng}#map=17/${item.lat}/${item.lng}">지도 위치</a></div>
</li>`).join('')}</ul>`;
}
function sectionCard(key, title, body, link = true) {
  return `<article class="card home-card" data-module="${key}"><div class="card-head"><h2>${icon(key)}${title}</h2>${link ? `<a href="#${key}">전체보기</a>` : ''}</div>${body}</article>`;
}

function searchForm(target, value, hint) {
  return `<form class="search-form" action="#${target}" method="get"><label>
<span class="visually-hidden">${hint}</span><input name="q" type="search" maxlength="100" placeholder="${hint}" value="${escape(value)}">
</label><button type="submit">검색</button></form>`;
}

function filterLinks(key, parameter, values) {
  return `<div class="chips" aria-label="${labels[key]} 분류">${values.map((value, index) =>
    `<a href="?${index ? parameter + '=' + encodeURIComponent(value) : ''}#${key}">${value}</a>`).join('')}</div>`;
}

function communityCategories(board) {
  const active = communityBoards.some(([label]) => label === board) ? board : '전체';
  return `<nav class="community-categories" aria-label="커뮤니티 분류">${communityBoards.map(([label, color, path]) => {
    const href = label === '전체' ? '?#community' : '?board=' + encodeURIComponent(label) + '#community';
    return `<a href="${href}"${label === active ? ' aria-current="true"' : ''}>
<span class="community-category-icon" style="--category-color:${color}"><svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${path}</svg></span>
<span>${label}</span></a>`;
  }).join('')}</nav>`;
}
function screen(key, content) {
  return `<section id="${key}" class="screen" aria-label="${labels[key]}"><h2 class="page-title">${labels[key]}</h2>${content}</section>`;
}

export function demoPage(region, preview, query) {
  const title = regionBrand(region.name);
  const categoryNames = ['전체', ...businessCategories(region)];
  const businesses = publicBusinesses(region);
  const enabled = key => region.modules[key] ?? ['guide', 'promotions', 'deals'].includes(key);
  const menu = region.home.menuOrder ?? [];
  const ordered = keys => [...menu.filter(key => keys.includes(key)), ...keys.filter(key => !menu.includes(key))].filter(enabled);
  const featured = ordered(['promotions', 'coupons', 'deals', 'events']);
  const bottom = ['home', ...ordered(['directory', 'coupons', 'map', 'guide'])];
  const drawer = ordered(['community', 'events', 'guide', 'directory', 'coupons', 'map',
    'promotions', 'deals', 'jobs', 'ownerPortal', 'localAds', 'reservations']);
  if (enabled('ownerPortal')) drawer.splice(drawer.indexOf('ownerPortal'), 0, 'ownerRegister');
  const surface = { slate: '#e6edf4', sand: '#f8f1e5' }[region.theme.preset] || '#f3f7fd';
  const accent = /^#[0-9a-f]{6}$/i.test(region.theme.primaryColor ?? '') ? region.theme.primaryColor : '#2458bd';
  const banner = region.home.banner ?? {};
  const term = (query.get('q') || '').trim().slice(0, 100);
  const category = query.get('category');
  const board = query.get('board');
  const list = key => (collections[key] === 'businesses' ? businesses : region.content[collections[key]] || []).filter(item => {
    if (key === 'directory' || key === 'map') {
      if (!withinRadius(region.map.center, item, region.map.radiusKm)) return false;
      if (categoryNames.includes(category) && category !== '전체' && item.category !== category) return false;
    }
    if (key === 'community' && communityBoards.some(([label]) => label === board) && board !== '전체' && item.category !== board) return false;
    return [item.title, item.name, item.category].some(text => String(text ?? '').toLowerCase().includes(term.toLowerCase()));
  });

  const tabs = `<div class="tabs" aria-label="업소 정렬">${['추천', '신규', '인기'].map((mode, index) =>
    `<label><input type="radio" name="directory-order" ${index ? '' : 'checked'}>${mode}</label>`).join('')}</div>`;
  const homeContent = {
    directory: () => sectionCard('directory', '업소 목록', tabs + businessList(list('directory'))),
    community: () => sectionCard('community', '커뮤니티', communityCategories(board) + itemList(list('community'))),
    map: () => sectionCard('map', '지역 지도', `<p class="empty">중심 ${region.map.center.lat}, ${region.map.center.lng} · 검색 반경 ${region.map.radiusKm} km</p>`)
  };
  const priority = region.home.layout;
  const homeSections = [...new Set([priority, 'directory', 'community'])].filter(key => Object.hasOwn(homeContent, key) && enabled(key));
  const appScreens = drawer.map(key => {
    if (key === 'map') return screen(key, searchForm(key, term, '업소 검색') + mapPanel(region) + businessList(list(key)));
    if (key === 'directory') return screen(key, searchForm(key, term, '업소명, 카테고리, 지역 검색') +
      '<br>' + filterLinks(key, 'category', categoryNames) + businessList(list(key)));
    if (key === 'community') return screen(key, communityCategories(board) + itemList(list(key)));
    if (key === 'ownerRegister' || key === 'ownerPortal') return screen(key,
      `<article class="card"><p>QA 관리자 로그인으로 등록·수정·소유권 신청을 테스트할 수 있습니다.</p>
<a href="/admin/businesses?region=${escape(region.slug)}">업소관리 열기</a></article>`);
    return screen(key, itemList(list(key)));
  }).join('');
  const searchKeys = ['directory', 'coupons', 'community', 'events'].filter(enabled);
  return `<!doctype html><html lang="ko" style="--surface:${surface};--accent:${accent}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>온라인업소록</title><style>${appStyles}</style>
</head><body><div class="app-shell">
<header class="app-header">
<a class="header-icon" href="#menu" aria-label="메뉴 열기">${icon('menu')}</a>
<a class="brand" href="#home"><img src="${escape(region.theme.logoUrl || '/qa-ui/kfocus-icon.png')}" alt=""><div class="brand-names"><h1>온라인업소록</h1><span>${escape(title)}</span></div></a>
<a class="header-icon" href="#search" aria-label="검색 열기">${icon('search')}</a>
</header>
${preview ? '<div class="preview-note">관리자 미리보기 <a href="/admin/regions">지역 관리</a></div>' : ''}
<main class="pages"><section id="home" class="screen" aria-label="홈">
${enabled('ownerPortal') ? `<section class="owner"><p>업소를 운영하시나요?</p><div class="owner-links"><a href="#ownerRegister">내 업소 등록</a><a href="#ownerPortal">${icon('directory')}내 업소관리</a></div></section>` : ''}
<section class="card hero" aria-label="메인 배너"><div class="hero-art">
${banner.image ? `<img src="${escape(banner.image)}" alt="">` : ''}
<div class="hero-copy"><small>${escape([region.state, region.geography?.subregion].filter(Boolean).join(' · ') || 'DalTownMap')}</small><h2>${escape(banner.title || title)}</h2>
<p>${escape(banner.message || '지역 소식과 한인 업소를 한곳에서')}</p></div></div><span class="hero-dot" aria-hidden="true"></span></section>
${featured.length ? `<section class="quick"><h2>오늘의 ${escape(title)}</h2><div class="quick-links">${featured.map(key =>
  `<a href="#${key}"><span class="quick-icon" style="--icon-color:${quickColors[key]}">${icon(key)}</span>${labels[key]}</a>`).join('')}</div></section>` : ''}
${enabled('localAds') ? `<a class="ticker" href="#localAds"><b>📣 한 줄 광고</b><span>${escape(list('localAds')[0]?.title || '등록된 광고가 없습니다.')}</span></a>` : ''}
${homeSections.map(key => homeContent[key]()).join('')}
</section>${appScreens}</main>
<nav class="bottom-nav" aria-label="하단 메뉴">${bottom.map(key => nav(key)).join('')}</nav>
<aside id="menu" class="overlay drawer" aria-label="전체 메뉴"><div class="overlay-head"><h2>${escape(title)}</h2><a class="close" href="#home" aria-label="메뉴 닫기">닫기</a></div>
<nav aria-label="지역 메뉴">${drawer.map(key => nav(key)).join('')}</nav></aside>
<section id="search" class="overlay search-overlay" aria-label="통합 검색"><div class="overlay-head"><h2>통합 검색</h2><a class="close" href="#home" aria-label="검색 닫기">닫기</a></div>
${searchForm('search', term, '업소 / 쿠폰 / 게시판 검색')}
${term ? `<div class="search-results">${searchKeys.map(key => `<section><h3>${labels[key]}</h3>${itemList(list(key), '검색 결과가 없습니다.')}</section>`).join('') || '<p>검색 가능한 기능이 없습니다.</p>'}</div>` : ''}
</section></div></body></html>`;
}

