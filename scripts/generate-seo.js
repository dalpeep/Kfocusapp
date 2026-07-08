/*
  DalTownMap SEO Generator v2
  - Generates static SEO pages from Supabase without changing the existing app.
  - Output: /business/*.html, /category/*.html, /sitemap.xml, /seo-index.json, /business-index.json
*/

const fs = require('fs');
const path = require('path');

const SITE_URL = (process.env.SITE_URL || process.env.URL || 'https://www.daltownmap.com').replace(/\/$/, '');
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const ROOT = path.resolve(__dirname, '..');
const BUSINESS_DIR = path.join(ROOT, 'business');
const CATEGORY_DIR = path.join(ROOT, 'category');

const MAX_BUSINESSES = Number(process.env.SEO_MAX_BUSINESSES || 5000);
const DEFAULT_REGION = process.env.SEO_DEFAULT_REGION || 'dallas';

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function esc(input = '') {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripHtml(input = '') {
  return String(input ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function truncate(input = '', length = 160) {
  const s = stripHtml(input);
  return s.length > length ? s.slice(0, length - 1).trim() + '…' : s;
}

function slugify(input = '') {
  return String(input || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9가-힣\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase()
    .slice(0, 80) || 'business';
}

function nameOf(b) {
  return b.name_ko || b.name || b.name_en || 'DalTownMap Business';
}

function englishNameOf(b) {
  return b.name_en || b.name || b.name_ko || '';
}

function categoryOf(b) {
  return b.category_ko || b.category || '업소';
}

function regionOf(b) {
  return b.area || b.region || DEFAULT_REGION || 'Dallas';
}

function businessSlug(b) {
  const base = englishNameOf(b) || nameOf(b) || b.id;
  return `${slugify(base)}-${String(b.id || '').slice(0, 8)}`;
}

function categorySlug(cat, region = '') {
  return slugify(`${region}-${cat}`);
}

function schemaType(category = '') {
  const c = String(category).toLowerCase();
  if (/restaurant|식당|한식|중식|일식|카페|cafe|coffee|bbq|치킨|bakery|베이커리|디저트|dessert/.test(c)) return 'Restaurant';
  if (/병원|clinic|medical|dental|치과|약국|pharmacy|doctor|health/.test(c)) return 'MedicalBusiness';
  if (/law|lawyer|attorney|변호|법률/.test(c)) return 'LegalService';
  if (/church|성당|교회|temple|mission/.test(c)) return 'PlaceOfWorship';
  if (/real estate|부동산|realtor|lease|rental/.test(c)) return 'RealEstateAgent';
  if (/beauty|hair|spa|nail|미용|헤어|스파|네일/.test(c)) return 'BeautySalon';
  if (/auto|repair|mechanic|자동차|정비|타이어/.test(c)) return 'AutoRepair';
  return 'LocalBusiness';
}

function parseJsonMaybe(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function hoursText(b) {
  if (b.hours) return String(b.hours);
  const bh = parseJsonMaybe(b.business_hours, null);
  if (!bh || typeof bh !== 'object') return '';
  const days = [
    ['mon', '월요일'], ['tue', '화요일'], ['wed', '수요일'], ['thu', '목요일'],
    ['fri', '금요일'], ['sat', '토요일'], ['sun', '일요일']
  ];
  return days.map(([key, label]) => {
    const h = bh[key];
    if (!h) return '';
    if (h.closed) return `${label}: 휴무`;
    if (h.text) return `${label}: ${h.text}`;
    const open1 = h.open1 || h.start1 || h.open || '';
    const close1 = h.close1 || h.end1 || h.close || '';
    const open2 = h.open2 || h.start2 || '';
    const close2 = h.close2 || h.end2 || '';
    if (open1 && close1 && open2 && close2) return `${label}: ${open1} - ${close1}, ${open2} - ${close2}`;
    if (open1 && close1) return `${label}: ${open1} - ${close1}`;
    return '';
  }).filter(Boolean).join('\n');
}

async function supabaseFetch(table, select, query = '') {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn('Missing Supabase env variables. SEO pages will be generated with static defaults only.');
    return [];
  }
  const url = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${table}?select=${encodeURIComponent(select)}${query}`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json'
    }
  });
  if (!res.ok) {
    console.warn(`[SEO] ${table} fetch failed ${res.status}: ${await res.text()}`);
    return [];
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

function layout({ title, description, canonical, image, body, jsonLd = [], lang = 'ko' }) {
  const safeTitle = esc(title);
  const safeDesc = esc(truncate(description, 180));
  const safeCanonical = esc(canonical);
  const safeImage = esc(image || `${SITE_URL}/assets/kfocus-icon.png`);
  const jsonLdScripts = jsonLd.filter(Boolean).map(obj => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`).join('\n  ');

  return `<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safeTitle}</title>
  <meta name="description" content="${safeDesc}">
  <link rel="canonical" href="${safeCanonical}">
  <meta name="robots" content="index, follow, max-image-preview:large">

  <meta property="og:type" content="website">
  <meta property="og:title" content="${safeTitle}">
  <meta property="og:description" content="${safeDesc}">
  <meta property="og:url" content="${safeCanonical}">
  <meta property="og:image" content="${safeImage}">

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${safeTitle}">
  <meta name="twitter:description" content="${safeDesc}">
  <meta name="twitter:image" content="${safeImage}">

  ${jsonLdScripts}
  <style>
    body{font-family:Arial,'Noto Sans KR',sans-serif;line-height:1.65;color:#0f172a;background:#f8fbff;margin:0;padding:0}
    main{max-width:860px;margin:0 auto;padding:32px 18px 56px}
    .card{background:#fff;border:1px solid #dbeafe;border-radius:20px;padding:24px;box-shadow:0 12px 30px rgba(37,99,235,.08)}
    h1{font-size:32px;line-height:1.25;margin:0 0 12px;color:#0b2a5b}.muted{color:#64748b}.meta{display:grid;gap:8px;margin:20px 0}.meta p{margin:0;padding:10px 0;border-bottom:1px solid #e2e8f0}.hero{width:100%;max-height:420px;object-fit:contain;background:#fff;border-radius:16px;margin:18px 0}.btn{display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 18px;border-radius:999px;font-weight:700;margin:8px 8px 8px 0}.btn.light{background:#eff6ff;color:#1d4ed8}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}.biz{display:block;text-decoration:none;color:#0f172a;background:#fff;border:1px solid #dbeafe;border-radius:16px;padding:16px}.small{font-size:13px;color:#64748b}.footer{margin-top:26px;color:#64748b;font-size:13px}
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

function businessPage(b, slug) {
  const name = nameOf(b);
  const category = categoryOf(b);
  const region = regionOf(b);
  const canonical = `${SITE_URL}/business/${slug}.html`;
  const appUrl = `${SITE_URL}/#business-detail?id=${encodeURIComponent(b.id)}`;
  const image = b.image_url || b.image || `${SITE_URL}/assets/kfocus-icon.png`;
  const hours = hoursText(b);
  const desc = b.description || `${name}는 ${region} 지역의 ${category} 업소입니다. DalTownMap에서 주소, 전화번호, 지도, 쿠폰, 영업정보를 확인하세요.`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': schemaType(category),
    '@id': canonical,
    name,
    alternateName: englishNameOf(b) || undefined,
    description: stripHtml(desc),
    image,
    url: canonical,
    telephone: b.phone || undefined,
    address: b.address || undefined,
    areaServed: region,
    priceRange: '$$',
    sameAs: [b.website, b.google_maps_url, b.google_review_url].filter(Boolean),
    openingHoursSpecification: undefined
  };

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'DalTownMap', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: category, item: `${SITE_URL}/category/${categorySlug(category, region)}.html` },
      { '@type': 'ListItem', position: 3, name, item: canonical }
    ]
  };

  const body = `<main>
  <div class="card">
    <p class="small">DalTownMap · ${esc(region)} · ${esc(category)}</p>
    <h1>${esc(name)}</h1>
    <p class="muted">${esc(desc)}</p>
    ${image ? `<img class="hero" src="${esc(image)}" alt="${esc(name)}">` : ''}
    <div>
      <a class="btn" href="${esc(appUrl)}">DalTownMap 앱에서 보기</a>
      ${b.phone ? `<a class="btn light" href="tel:${esc(String(b.phone).replace(/[^0-9+]/g,''))}">전화하기</a>` : ''}
      ${b.website ? `<a class="btn light" href="${esc(b.website)}">웹사이트</a>` : ''}
      ${b.google_maps_url ? `<a class="btn light" href="${esc(b.google_maps_url)}">지도 보기</a>` : ''}
    </div>
    <section class="meta">
      ${b.address ? `<p><strong>주소</strong><br>${esc(b.address)}</p>` : ''}
      ${b.phone ? `<p><strong>전화</strong><br>${esc(b.phone)}</p>` : ''}
      ${hours ? `<p><strong>영업시간</strong><br>${esc(hours).replace(/\n/g,'<br>')}</p>` : ''}
      ${b.parking ? `<p><strong>주차</strong><br>${esc(b.parking)}</p>` : ''}
      ${b.reservation ? `<p><strong>예약</strong><br>${esc(b.reservation)}</p>` : ''}
      ${b.languages ? `<p><strong>언어</strong><br>${esc(b.languages)}</p>` : ''}
    </section>
    <p class="footer">이 페이지는 DalTownMap 검색엔진 최적화를 위해 생성된 공개 업소 정보 페이지입니다.</p>
  </div>
</main>`;

  return layout({
    title: `${name} | ${region} ${category} | DalTownMap`,
    description: desc,
    canonical,
    image,
    body,
    jsonLd: [jsonLd, breadcrumb]
  });
}

function categoryPage(category, region, businesses) {
  const slug = categorySlug(category, region);
  const canonical = `${SITE_URL}/category/${slug}.html`;
  const title = `${region} ${category} 업소 목록 | DalTownMap`;
  const desc = `${region} 지역의 ${category} 관련 한인 업소를 DalTownMap에서 확인하세요. 주소, 전화번호, 지도, 쿠폰, 홍보 정보를 제공합니다.`;
  const items = businesses.map(b => {
    const slug = businessSlug(b);
    return `<a class="biz" href="${SITE_URL}/business/${slug}.html"><strong>${esc(nameOf(b))}</strong><br><span class="small">${esc(b.address || region)} ${b.phone ? ' · ' + esc(b.phone) : ''}</span></a>`;
  }).join('\n');

  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: title,
    itemListElement: businesses.slice(0, 100).map((b, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: nameOf(b),
      url: `${SITE_URL}/business/${businessSlug(b)}.html`
    }))
  };

  const body = `<main>
  <div class="card">
    <h1>${esc(title)}</h1>
    <p class="muted">${esc(desc)}</p>
    <div class="grid">${items || '<p>등록된 업소가 없습니다.</p>'}</div>
    <p class="footer"><a href="${SITE_URL}">DalTownMap 홈으로 이동</a></p>
  </div>
</main>`;

  return layout({ title, description: desc, canonical, body, jsonLd: [itemList] });
}

function homeSeoPage() {
  const canonical = `${SITE_URL}/seo.html`;
  const title = 'DalTownMap | Dallas Korean Business Directory';
  const desc = 'DalTownMap is a Dallas Korean business directory with local business listings, coupons, maps, events, and community information.';
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'DalTownMap',
    url: SITE_URL,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${SITE_URL}/?q={search_term_string}`,
      'query-input': 'required name=search_term_string'
    }
  };
  const org = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'DalTownMap',
    url: SITE_URL,
    description: desc,
    areaServed: 'Dallas-Fort Worth'
  };
  return layout({
    title,
    description: desc,
    canonical,
    body: `<main><div class="card"><h1>DalTownMap</h1><p>${esc(desc)}</p><a class="btn" href="${SITE_URL}">앱 열기</a></div></main>`,
    jsonLd: [jsonLd, org]
  });
}

function sitemapXml(urls) {
  const unique = [...new Map(urls.map(u => [u.loc, u])).values()];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${unique.map(u => `  <url><loc>${esc(u.loc)}</loc><lastmod>${u.lastmod || new Date().toISOString()}</lastmod><changefreq>${u.changefreq || 'weekly'}</changefreq><priority>${u.priority || '0.7'}</priority></url>`).join('\n')}\n</urlset>\n`;
}

async function main() {
  ensureDir(BUSINESS_DIR);
  ensureDir(CATEGORY_DIR);

  const businessSelect = [
    'id','name_ko','name_en','name','category_ko','category','area','region','phone','address','description','image_url','image','website','google_maps_url','google_review_url','business_hours','hours','parking','reservation','languages','is_active','updated_at','created_at'
  ].join(',');

  const couponSelect = ['id','business_id','title','description','coupon_code','image_url','discount_label','is_active','start_at','end_at','updated_at','created_at'].join(',');
  const postSelect = ['id','title','content','type','category','created_at','updated_at'].join(',');

  const businessesRaw = await supabaseFetch('businesses', businessSelect, `&limit=${MAX_BUSINESSES}`);
  const businesses = businessesRaw.filter(b => b && b.is_active !== false);
  const coupons = await supabaseFetch('coupons', couponSelect, '&is_active=eq.true&limit=5000');
  const posts = await supabaseFetch('posts', postSelect, '&limit=1000');

  const urls = [
    { loc: `${SITE_URL}/`, priority: '1.0', changefreq: 'daily' },
    { loc: `${SITE_URL}/seo.html`, priority: '0.8', changefreq: 'weekly' },
    { loc: `${SITE_URL}/llms.txt`, priority: '0.4', changefreq: 'monthly' }
  ];

  fs.writeFileSync(path.join(ROOT, 'seo.html'), homeSeoPage(), 'utf8');

  const businessIndex = [];
  const groups = new Map();

  for (const b of businesses) {
    const slug = businessSlug(b);
    const file = path.join(BUSINESS_DIR, `${slug}.html`);
    fs.writeFileSync(file, businessPage(b, slug), 'utf8');
    const loc = `${SITE_URL}/business/${slug}.html`;
    urls.push({ loc, priority: '0.8', changefreq: 'weekly', lastmod: b.updated_at || b.created_at });
    businessIndex.push({ id: b.id, name: nameOf(b), category: categoryOf(b), region: regionOf(b), url: loc, phone: b.phone || '', address: b.address || '' });

    const key = `${regionOf(b)}|||${categoryOf(b)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(b);
  }

  for (const [key, list] of groups.entries()) {
    const [region, category] = key.split('|||');
    const slug = categorySlug(category, region);
    fs.writeFileSync(path.join(CATEGORY_DIR, `${slug}.html`), categoryPage(category, region, list), 'utf8');
    urls.push({ loc: `${SITE_URL}/category/${slug}.html`, priority: '0.7', changefreq: 'weekly' });
  }

  const couponUrls = coupons.map(c => ({
    loc: `${SITE_URL}/#coupon-detail?id=${encodeURIComponent(c.id)}`,
    priority: '0.5',
    changefreq: 'weekly',
    lastmod: c.updated_at || c.created_at
  }));
  urls.push(...couponUrls);

  const postUrls = posts.map(p => ({
    loc: `${SITE_URL}/#board-detail?id=${encodeURIComponent(p.id)}`,
    priority: '0.5',
    changefreq: 'weekly',
    lastmod: p.updated_at || p.created_at
  }));
  urls.push(...postUrls);

  const aiIndex = {
    site: 'DalTownMap',
    url: SITE_URL,
    description: 'Dallas Korean community business directory and local information platform.',
    generated_at: new Date().toISOString(),
    business_count: businesses.length,
    coupon_count: coupons.length,
    post_count: posts.length,
    categories: [...groups.keys()].map(k => {
      const [region, category] = k.split('|||');
      return { region, category, url: `${SITE_URL}/category/${categorySlug(category, region)}.html`, count: groups.get(k).length };
    }),
    businesses: businessIndex.slice(0, 5000)
  };

  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemapXml(urls), 'utf8');
  fs.writeFileSync(path.join(ROOT, 'business-index.json'), JSON.stringify(businessIndex, null, 2), 'utf8');
  fs.writeFileSync(path.join(ROOT, 'seo-index.json'), JSON.stringify(aiIndex, null, 2), 'utf8');

  // Always ensure robots and llms exist even if user did not copy them.
  fs.writeFileSync(path.join(ROOT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`, 'utf8');

  if (!fs.existsSync(path.join(ROOT, 'llms.txt'))) {
    fs.writeFileSync(path.join(ROOT, 'llms.txt'), `# DalTownMap\n\nMain site: ${SITE_URL}\n\nDalTownMap is a Korean community business directory and local information platform for Dallas-Fort Worth.\n`, 'utf8');
  }

  console.log(`[SEO] Generated ${businesses.length} business pages, ${groups.size} category pages, ${coupons.length} coupon sitemap entries, ${posts.length} post sitemap entries.`);
}

main().catch(err => {
  console.error('[SEO] Build failed:', err);
  process.exit(1);
});
