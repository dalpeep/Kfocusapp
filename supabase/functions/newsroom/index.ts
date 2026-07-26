import { createClient } from 'npm:@supabase/supabase-js@2';

const VERSION = '47.1.0';
const DALLAS_TZ = 'America/Chicago';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, max-age=0' },
});
const env = (name: string) => Deno.env.get(name) || '';
const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
});

function outputText(v: any) {
  return v?.output_text || v?.output?.flatMap((x: any) => x.content || []).find((x: any) => x.type === 'output_text')?.text || '';
}
function parseJsonText(text = '') {
  const clean = String(text).replace(/^```json\s*/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(clean); } catch {
    const a = clean.indexOf('{');
    const b = clean.lastIndexOf('}');
    if (a >= 0 && b > a) return JSON.parse(clean.slice(a, b + 1));
    throw new Error('AI 응답을 JSON으로 해석하지 못했습니다.');
  }
}
function slug(v = '') {
  return String(v).toLowerCase().replace(/^https?:\/\//, '').replace(/[?#].*$/, '').replace(/\/$/, '').slice(0, 500);
}
function titleKey(v = '') {
  return String(v).toLowerCase().replace(/[^a-z0-9가-힣]+/g, ' ').trim().split(/\s+/).filter(Boolean).slice(0, 12).join(' ');
}
function dateKeyInDallas(value: Date | string | number = new Date()) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: DALLAS_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}
function parseDateKey(value: any) {
  if (!value) return '';
  const direct = String(value).match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (direct) return direct;
  return dateKeyInDallas(value);
}
function eventDates(row: any) {
  const ev = row?.event_data && typeof row.event_data === 'object' ? row.event_data : {};
  return {
    start: parseDateKey(ev.start_at || row?.event_start_at || row?.expires_at),
    end: parseDateKey(ev.end_at || row?.event_end_at || row?.expires_at),
  };
}
function isFutureOrCurrentEvent(row: any, today: string) {
  const { start, end } = eventDates(row);
  if (end) return end >= today;
  if (start) return start >= today;
  return false;
}

async function openai(payload: any, timeoutMs = 65000) {
  const key = env('OPENAI_API_KEY');
  if (!key) throw new Error('OPENAI_API_KEY가 Supabase Edge Function Secrets에 없습니다.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const t = await r.text();
    let j: any = {};
    try { j = JSON.parse(t); } catch { /* ignore */ }
    if (!r.ok) throw new Error(j?.error?.message || `OpenAI 오류 ${r.status}: ${t.slice(0, 180)}`);
    return parseJsonText(outputText(j));
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw new Error('정보 검색이 65초 안에 완료되지 않아 이 분야를 건너뛰었습니다.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function authorize(req: Request) {
  const cronSecret = req.headers.get('x-cron-secret');
  if (cronSecret && cronSecret === env('NEWSROOM_CRON_SECRET')) return { cron: true };
  const auth = req.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) throw new Error('관리자 로그인이 필요합니다.');
  const userClient = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: auth } }, auth: { persistSession: false },
  });
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) throw new Error('로그인 세션을 확인하지 못했습니다.');
  const { data: profile, error: pe } = await admin.from('profiles').select('role,area').eq('user_id', user.id).maybeSingle();
  if (pe || !profile || !['super_admin', 'regional_editor'].includes(profile.role)) throw new Error('뉴스룸 관리자 권한이 없습니다.');
  return { user, profile };
}

async function startRun(region: string, triggerType: string, note = '') {
  const { data, error } = await admin.from('newsroom_runs').insert({
    region, trigger_type: triggerType, status: 'running', note: note || null, started_at: new Date().toISOString(),
  }).select().single();
  if (error) { console.warn('newsroom_runs start failed', error.message); return null; }
  return data;
}
async function finishRun(id: any, patch: any) {
  if (!id) return;
  const { error } = await admin.from('newsroom_runs').update({ ...patch, finished_at: new Date().toISOString() }).eq('id', id);
  if (error) console.warn('newsroom_runs finish failed', error.message);
}

async function cleanup(region = 'dallas') {
  const today = dateKeyInDallas();
  const staleNoDate = Date.now() - 36 * 60 * 60 * 1000;
  const { data: rows, error } = await admin.from('newsroom_items')
    .select('id,status,source_published_at,collected_at,event_data,original_title,source_name')
    .eq('region', region)
    .limit(1500);
  if (error) throw error;

  const ids: any[] = [];
  for (const row of rows || []) {
    if (['published', 'excluded'].includes(String(row.status || ''))) { ids.push(row.id); continue; }
    const ev = eventDates(row);
    if (ev.end && ev.end < today) { ids.push(row.id); continue; }
    if (isFutureOrCurrentEvent(row, today)) continue;

    const published = parseDateKey(row.source_published_at);
    if (published && published < today) { ids.push(row.id); continue; }
    if (!published) {
      const collectedMs = new Date(row.collected_at || 0).getTime();
      if (collectedMs && collectedMs < staleNoDate) ids.push(row.id);
    }
  }
  if (!ids.length) return { ok: true, cleaned: 0, today };
  const { data: deleted, error: de } = await admin.from('newsroom_items').delete().in('id', ids).select('id');
  if (de) throw de;
  return { ok: true, cleaned: deleted?.length || 0, today };
}

async function runStatus(region = 'dallas') {
  const { data, error } = await admin.from('newsroom_runs').select('*').eq('region', region).order('started_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return { ok: true, version: VERSION, latest: data || null };
}

const LANE_QUERIES: Record<string, string[]> = {
  korean: [
    'Dallas Korean community',
    'DFW Korean event OR Korean association',
    '달라스 한인 행사 OR 달라스 한인회',
    '달라스 한인교회 행사 OR 교회 바자회 OR 부흥회 OR VBS',
    'DFW Korean church event OR Korean Catholic OR Korean temple',
  ],
  finance: [
    'Texas SBA small business IRS tax deadline',
    'Dallas bank mortgage CD rate promotion',
    'Korean American bank Texas Hanmi Bank Bank of Hope',
  ],
  shopping: [
    'Dallas H Mart sale OR event',
    'Dallas Zion Market Korean grocery sale',
    'Dallas Korean business opening promotion',
  ],
  events: [
    'Dallas family events this weekend',
    'DFW festival museum library event',
    'Dallas Fort Worth sports concert community event',
  ],
  practical: [
    'Dallas weather alert road closure traffic airport',
    'Dallas school closure delayed start early dismissal city service public safety',
    'Plano ISD Frisco ISD Lewisville ISD Carrollton Farmers Branch ISD Coppell ISD school closure delay bus route',
    'Dallas ISD Richardson ISD Allen ISD McKinney ISD Garland ISD school alert attendance change',
    'DFW airport delay DART TxDOT Dallas advisory',
  ],
};

function decodeXml(value = '') {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
function xmlTag(block: string, tag: string) {
  const m = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return m ? decodeXml(m[1]) : '';
}
function xmlSource(block: string) {
  const m = block.match(/<source(?:\s[^>]*)?>([\s\S]*?)<\/source>/i);
  return m ? decodeXml(m[1]) : '';
}
function googleNewsFeedUrl(query: string) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
}
async function fetchTextWithTimeout(url: string, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 DalTownMap-Newsroom/41.0.0' },
      signal: controller.signal,
    });
    if (!r.ok) throw new Error(`RSS HTTP ${r.status}`);
    return await r.text();
  } finally {
    clearTimeout(timer);
  }
}
function parseGoogleNewsRss(xml: string, lane: string) {
  const blocks = String(xml).match(/<item>[\s\S]*?<\/item>/gi) || [];
  return blocks.map((block) => {
    const title = xmlTag(block, 'title').replace(/\s+-\s+[^-]+$/, '').trim();
    const url = xmlTag(block, 'link');
    const pubDateRaw = xmlTag(block, 'pubDate');
    const source = xmlSource(block) || 'Google News';
    const description = xmlTag(block, 'description');
    const published = pubDateRaw ? new Date(pubDateRaw) : null;
    return {
      original_title: title,
      original_summary: description || null,
      original_url: url,
      source_name: source,
      source_kind: lane === 'korean' ? 'korean_media' : (lane === 'shopping' ? 'business' : 'media'),
      source_published_at: published && !Number.isNaN(published.getTime()) ? published.toISOString() : null,
      area: 'Dallas-Fort Worth',
      event_start_at: null,
      event_end_at: null,
      expires_at: null,
      topic_key: titleKey(title),
    };
  }).filter((x) => x.original_title && x.original_url);
}


const KOREAN_DIRECT_SOURCES = [
  {
    key: 'ktn', name: 'KTN 코리아타운뉴스', kind: 'korean_media', priority: 100,
    urls: ['https://koreatownnews.com/feed/', 'https://koreatownnews.com/'],
    articlePattern: /\/\d{4}\/\d{2}\/\d{2}\/|\/news\/|\/article/i,
  },
  {
    key: 'weeklyfocus', name: '주간 포커스 텍사스', kind: 'korean_media', priority: 95,
    urls: ['https://www.weeklyfocustx.com/rss/allArticle.xml', 'https://www.weeklyfocustx.com/news/articleList.html'],
    articlePattern: /articleView\.html\?idxno=|\/news\/article/i,
  },
  {
    key: 'dalsaram', name: '달사람닷컴', kind: 'korean_community', priority: 90,
    urls: ['https://www.dalsaram.com/'],
    articlePattern: /news|board|community|event|hot|detail|view/i,
  },
  {
    key: 'dalkora', name: 'DK NET 달라스 코리안 라디오', kind: 'korean_media', priority: 85,
    urls: ['https://dalkora.com/feed/', 'https://dalkora.com/'],
    articlePattern: /\/\d{4}\/\d{2}\/|news|article|post/i,
  },
  {
    key: 'koreansociety', name: '달라스 한인회', kind: 'official_community', priority: 80,
    urls: ['https://thedallaskorea.org/'],
    articlePattern: /event|notice|news|festival|community|post/i,
  },
];

function absoluteUrl(base: string, href = '') {
  try { return new URL(href, base).toString(); } catch { return ''; }
}
function isLikelyHeadline(text = '') {
  const t = decodeXml(text).replace(/\s+/g, ' ').trim();
  if (t.length < 8 || t.length > 220) return false;
  const banned = /^(홈|로그인|회원가입|검색|메뉴|더보기|전체기사|기사목록|광고|문의|회사소개|개인정보|이용약관|facebook|instagram|youtube)$/i;
  if (banned.test(t)) return false;
  return /[가-힣]/.test(t) || t.split(/\s+/).length >= 4;
}
function parseGenericHtml(html: string, source: any, baseUrl: string) {
  const rows: any[] = [];
  const anchorRe = /<a\b([^>]*?)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(String(html)))) {
    const href = String(m[2] || '').trim();
    const title = decodeXml(m[4] || '');
    if (!href || !isLikelyHeadline(title)) continue;
    const url = absoluteUrl(baseUrl, href);
    if (!url || !/^https?:/i.test(url)) continue;
    let sameHost = false;
    try { sameHost = new URL(url).hostname.replace(/^www\./,'') === new URL(baseUrl).hostname.replace(/^www\./,''); } catch { /* ignore */ }
    if (!sameHost) continue;
    if (source.articlePattern && !source.articlePattern.test(url) && title.length < 18) continue;
    rows.push({
      original_title: title.slice(0, 500), original_summary: null, original_url: url,
      source_name: source.name, source_kind: source.kind, source_published_at: null,
      area: 'Dallas-Fort Worth', topic_key: titleKey(title), source_priority: source.priority,
    });
  }
  return rows;
}
function parseRssOrAtom(xml: string, source: any) {
  const itemBlocks = String(xml).match(/<item\b[\s\S]*?<\/item>/gi) || [];
  const entryBlocks = String(xml).match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  const blocks = itemBlocks.length ? itemBlocks : entryBlocks;
  return blocks.map((block) => {
    const title = xmlTag(block, 'title');
    let url = xmlTag(block, 'link');
    if (!url) {
      const lm = block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?\s*>/i);
      url = lm ? decodeXml(lm[1]) : '';
    }
    const publishedRaw = xmlTag(block, 'pubDate') || xmlTag(block, 'published') || xmlTag(block, 'updated');
    const summary = xmlTag(block, 'description') || xmlTag(block, 'summary') || xmlTag(block, 'content');
    const d = publishedRaw ? new Date(publishedRaw) : null;
    return {
      original_title: title.slice(0, 500), original_summary: summary || null, original_url: absoluteUrl(source.urls[0], url),
      source_name: source.name, source_kind: source.kind,
      source_published_at: d && !Number.isNaN(d.getTime()) ? d.toISOString() : null,
      area: 'Dallas-Fort Worth', topic_key: titleKey(title), source_priority: source.priority,
    };
  }).filter((x) => x.original_title && x.original_url);
}
async function fetchKoreanDirectSources() {
  const tasks = KOREAN_DIRECT_SOURCES.flatMap((source) => source.urls.map(async (url) => {
    const text = await fetchTextWithTimeout(url, 14000);
    const contentLooksXml = /<rss\b|<feed\b|<channel\b/i.test(text.slice(0, 2000));
    const items = contentLooksXml ? parseRssOrAtom(text, source) : parseGenericHtml(text, source, url);
    return { source, url, items };
  }));
  const results = await Promise.allSettled(tasks);
  const items: any[] = [];
  const warnings: string[] = [];
  results.forEach((r) => {
    if (r.status === 'fulfilled') items.push(...r.value.items);
    else warnings.push(r.reason instanceof Error ? r.reason.message : String(r.reason));
  });
  return { items, warnings };
}


const DFW_COUNTY_RE = /(Dallas|Collin|Denton|Tarrant|Rockwall|Ellis|Kaufman|Johnson|Parker|Wise)\s+County/i;
const EMERGENCY_RE = /(AMBER Alert|Silver Alert|CLEAR Alert|Blue Alert|Endangered Missing|tornado warning|severe thunderstorm warning|flash flood warning|flood warning|extreme heat warning|heat advisory|winter storm warning|ice storm warning|shelter in place|evacuation|hazardous materials|active shooter|major road closure|emergency alert|school closure|delayed start|early dismissal|classes canceled|campus closed|bus route change)/i;

async function fetchNwsDfwAlerts() {
  const url = 'https://api.weather.gov/alerts/active?area=TX';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'DalTownMap/42.1 emergency-alerts contact: admin@daltownmap.com',
        'Accept': 'application/geo+json, application/json',
      },
      signal: controller.signal,
    });
    if (!r.ok) throw new Error(`NWS alerts HTTP ${r.status}`);
    const j = await r.json();
    const features = Array.isArray(j?.features) ? j.features : [];
    return features.map((f: any) => {
      const a = f?.properties || {};
      const area = String(a.areaDesc || '');
      const event = String(a.event || 'Weather Alert');
      if (!DFW_COUNTY_RE.test(area)) return null;
      return {
        original_title: `${event} — ${area}`,
        original_summary: [a.headline, a.description, a.instruction].filter(Boolean).join(' ').slice(0, 4000),
        original_url: a['@id'] || f?.id || 'https://www.weather.gov/alerts',
        source_name: 'National Weather Service',
        source_kind: 'official_emergency',
        source_published_at: a.sent || a.effective || new Date().toISOString(),
        area: area || 'Dallas-Fort Worth',
        source_priority: 1000,
        emergency: true,
        alert_expires_at: a.expires || a.ends || null,
      };
    }).filter(Boolean);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTexasPublicSafetyAlerts() {
  const queries = [
    'site:txsubscribealerts.dps.texas.gov/alerts (AMBER Alert OR Silver Alert OR CLEAR Alert OR Blue Alert) Texas',
    'site:dps.texas.gov (AMBER Alert OR Silver Alert OR CLEAR Alert OR Endangered Missing) Dallas OR Collin OR Denton OR Tarrant',
    '(AMBER Alert OR Silver Alert OR CLEAR Alert OR Blue Alert) Dallas Fort Worth Texas',
  ];
  const settled = await Promise.allSettled(queries.map(async (q) => {
    const xml = await fetchTextWithTimeout(googleNewsFeedUrl(q), 10000);
    return parseGoogleNewsRss(xml, 'practical').map((x: any) => ({
      ...x,
      source_kind: 'official_emergency',
      source_priority: 950,
      emergency: true,
    }));
  }));
  const items: any[] = [];
  for (const r of settled) if (r.status === 'fulfilled') items.push(...r.value);
  const cutoff = Date.now() - 36 * 3600000;
  return items.filter((x) => {
    const text = `${x.original_title || ''} ${x.original_summary || ''}`;
    const published = new Date(x.source_published_at || 0).getTime();
    return EMERGENCY_RE.test(text) && (!published || published >= cutoff);
  });
}

async function collect(region = 'dallas', scheduled = false, lane = 'practical') {
  const normalizedLane = LANE_QUERIES[lane] ? lane : 'practical';
  const triggerType = scheduled ? 'scheduled' : 'manual';
  const run = await startRun(region, triggerType, `lane:${normalizedLane}; provider:google-news-rss`);
  try {
    if (scheduled) {
      const { data: setting } = await admin.from('newsroom_settings').select('auto_enabled').eq('region', region).maybeSingle();
      if (setting && setting.auto_enabled === false) {
        await finishRun(run?.id, { status: 'success', found: 0, inserted: 0, skipped: 0, cleaned: 0, note: `lane:${normalizedLane}; auto disabled` });
        return { ok: true, version: VERSION, lane: normalizedLane, disabled: true, found: 0, inserted: 0, skipped: 0, cleaned: 0 };
      }
    }

    const queries = LANE_QUERIES[normalizedLane];
    const fetched: any[] = [];
    const warnings: string[] = [];

    if (normalizedLane === 'practical') {
      const emergencySettled = await Promise.allSettled([fetchNwsDfwAlerts(), fetchTexasPublicSafetyAlerts()]);
      emergencySettled.forEach((r) => {
        if (r.status === 'fulfilled') fetched.push(...r.value);
        else warnings.push(`긴급 공지 직접 소스: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
      });
    }

    if (normalizedLane === 'korean') {
      const direct = await fetchKoreanDirectSources();
      fetched.push(...direct.items);
      warnings.push(...direct.warnings.map((x) => `한인 직접 소스: ${x}`));

      // Site-specific Google News is only a fallback and supplement. Direct Korean sources always rank first.
      const fallbackQueries = [
        'site:koreatownnews.com 달라스',
        'site:weeklyfocustx.com 달라스 OR 한인',
        'site:dalsaram.com 달라스 OR 한인',
        'site:dalkora.com 달라스 OR 한인',
        '달라스 한인교회 행사 부흥회 바자회 VBS',
        'DFW Korean church Catholic temple community event',
      ];
      const fallback = await Promise.allSettled(fallbackQueries.map(async (query) => {
        const xml = await fetchTextWithTimeout(googleNewsFeedUrl(query), 10000);
        return parseGoogleNewsRss(xml, normalizedLane).map((x: any) => ({ ...x, source_priority: 60 }));
      }));
      fallback.forEach((r, i) => {
        if (r.status === 'fulfilled') fetched.push(...r.value);
        else warnings.push(`${fallbackQueries[i]}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
      });
    } else {
      const results = await Promise.allSettled(queries.map(async (query) => {
        const xml = await fetchTextWithTimeout(googleNewsFeedUrl(query), 12000);
        return parseGoogleNewsRss(xml, normalizedLane);
      }));
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') fetched.push(...r.value);
        else warnings.push(`${queries[i]}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
      });
    }

    // Collection must be useful even when exact same-day coverage is sparse.
    // Keep recent practical/news items for 72 hours, and event candidates for 14 days.
    const nowMs = Date.now();
    const maxAgeMs = normalizedLane === 'events' ? 14 * 86400000 : 72 * 3600000;
    const recent = fetched.filter((x) => {
      if (!x.source_published_at) return true;
      const ms = new Date(x.source_published_at).getTime();
      return Number.isNaN(ms) || nowMs - ms <= maxAgeMs;
    });

    const unique = new Map<string, any>();
    for (const x of recent) {
      const key = slug(x.original_url) || titleKey(x.original_title);
      if (!key || unique.has(key)) continue;
      unique.set(key, x);
    }
    const items = [...unique.values()]
      .sort((a, b) => Number(b.source_priority || 0) - Number(a.source_priority || 0) || new Date(b.source_published_at || 0).getTime() - new Date(a.source_published_at || 0).getTime())
      .slice(0, normalizedLane === 'korean' ? 18 : 8);

    const { data: existing, error: e } = await admin.from('newsroom_items')
      .select('original_url,original_title,source_published_at,event_data')
      .eq('region', region).limit(1500);
    if (e) throw e;
    const seenUrls = new Set((existing || []).map((x: any) => slug(x.original_url)));
    const seenTitles = new Set((existing || []).map((x: any) => titleKey(x.original_title)));
    const rows: any[] = [];
    let skipped = 0;

    for (const x of items) {
      const key = slug(x.original_url);
      const tKey = titleKey(x.original_title);
      if (!key || seenUrls.has(key) || (tKey && seenTitles.has(tKey))) { skipped++; continue; }
      seenUrls.add(key);
      if (tKey) seenTitles.add(tKey);
      rows.push({
        region,
        original_title: String(x.original_title).slice(0, 500),
        original_summary: x.original_summary || null,
        original_url: x.original_url,
        source_name: x.source_name || null,
        source_kind: x.source_kind || 'media',
        source_published_at: x.source_published_at || null,
        area: x.area || 'Dallas-Fort Worth',
        status: 'collected', confidence: 0, fact_status: 'needs_review',
        duplicate_key: key,
        category_keywords: x.emergency ? [normalizedLane, 'emergency', 'local_alert'] : [normalizedLane],
        priority_level: x.emergency ? 'urgent' : 'normal',
        priority_score: x.emergency ? 100 : 0,
        suggested_destination: x.emergency ? 'urgent' : null,
        event_data: { start_at: null, end_at: x.alert_expires_at || null },
        collected_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      });
    }

    let insertedCount = 0;
    if (rows.length) {
      const { data: inserted, error } = await admin.from('newsroom_items')
        .upsert(rows, { onConflict: 'duplicate_key', ignoreDuplicates: true }).select('id');
      if (error) throw error;
      insertedCount = inserted?.length || 0;
    }
    const provider = normalizedLane === 'korean' ? 'korean-direct-plus-google-news' : (normalizedLane === 'practical' ? 'official-alerts-plus-google-news' : 'google-news-rss');
    const note = `lane:${normalizedLane}; provider:${provider}${warnings.length ? `; warnings:${warnings.length}` : ''}`;
    await finishRun(run?.id, {
      status: 'success', found: items.length, inserted: insertedCount, skipped, cleaned: 0, note,
    });
    return {
      ok: true, version: VERSION, lane: normalizedLane, provider,
      found: items.length, inserted: insertedCount, skipped, cleaned: 0,
      warnings,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await finishRun(run?.id, { status: 'failed', error_message: message, note: `lane:${normalizedLane}; provider:${normalizedLane === 'korean' ? 'korean-direct-plus-google-news' : 'google-news-rss'}` });
    throw e;
  }
}

async function analyzeOne(item: any) {
  return await openai({
    model: env('NEWSROOM_OPENAI_MODEL') || 'gpt-5-mini',
    input: `Analyze one Dallas-Fort Worth lifestyle-newsroom source record. The product is a friendly Dallas Korean lifestyle guide, not a hard-news wire.\nTitle: ${item.original_title}\nSummary: ${item.original_summary || ''}\nSource: ${item.source_name || ''}\nURL: ${item.original_url}\nPublished: ${item.source_published_at || ''}\nArea: ${item.area || ''}\nReturn ONLY JSON with suggested_destination exactly life, notice, guide, urgent, or exclude; confidence 0-100; fact_status official_verified or needs_review; priority_level urgent, high, normal, or low; priority_score 0-100; classification_reason in concise Korean; a natural Korean working title and 2-3 sentence summary; category_keywords; event_data fields name,start_at,end_at,venue,address,cost,organizer,registration_url. Keep useful Korean-community, finance, shopping, family and practical lifestyle information even if it is not major news. Exclude only duplicates, expired items, weak DFW relevance, unverifiable claims, or pure evergreen advertising. Use gentle suggestion language rather than commands. {"suggested_destination":"life","confidence":90,"fact_status":"official_verified","priority_level":"normal","priority_score":70,"classification_reason":"","ai_title":"","ai_summary":"","category_keywords":[],"event_data":{}}`,
  });
}

async function analyze(body: any) {
  let q = admin.from('newsroom_items').select('*');
  if (body.id) q = q.eq('id', body.id);
  else q = q.eq('region', String(body.region || 'dallas').toLowerCase())
    .eq('status', 'collected')
    .order('collected_at', { ascending: false })
    // Keep each Edge invocation short. The admin repeats small batches.
    .limit(Math.min(3, Math.max(1, Number(body.limit) || 2)));

  const { data: rows, error } = await q;
  if (error) throw error;

  let analyzed = 0, excluded = 0;
  const failed: Array<{id:string,error:string}> = [];

  for (const item of rows || []) {
    try {
      const a = await analyzeOne(item);
      const dest = ['life', 'notice', 'guide', 'urgent', 'exclude'].includes(a.suggested_destination) ? a.suggested_destination : 'life';
      const priority = ['urgent', 'high', 'normal', 'low'].includes(a.priority_level) ? a.priority_level : (dest === 'urgent' ? 'urgent' : dest === 'exclude' ? 'low' : 'normal');
      const mergedEvent = { ...(item.event_data || {}), ...(a.event_data && typeof a.event_data === 'object' ? a.event_data : {}) };
      const { error: u } = await admin.from('newsroom_items').update({
        suggested_destination: dest, destination: dest,
        confidence: Math.max(0, Math.min(100, Number(a.confidence) || 0)),
        fact_status: a.fact_status === 'official_verified' ? 'official_verified' : 'needs_review',
        priority_level: priority,
        priority_score: Math.max(0, Math.min(100, Number(a.priority_score) || 0)),
        classification_reason: String(a.classification_reason || '').slice(0, 1000),
        ai_title: a.ai_title || item.original_title,
        ai_summary: a.ai_summary || item.original_summary || '',
        category_keywords: Array.isArray(a.category_keywords) ? a.category_keywords.slice(0, 12) : [],
        event_data: mergedEvent,
        status: dest === 'exclude' ? 'excluded' : 'classified',
        updated_at: new Date().toISOString(),
      }).eq('id', item.id);
      if (u) throw u;
      analyzed++;
      if (dest === 'exclude') excluded++;
    } catch (e) {
      failed.push({ id: String(item.id), error: e instanceof Error ? e.message : String(e) });
    }
  }

  return { ok: true, version: VERSION, analyzed, excluded, failed, remaining_hint: Math.max(0, (rows || []).length - analyzed) };
}

async function draft(body: any) {
  if (!body.id) throw new Error('기사 ID가 없습니다.');
  const { data: item, error } = await admin.from('newsroom_items').select('*').eq('id', body.id).single();
  if (error) throw error;
  const a = await openai({
    model: env('NEWSROOM_OPENAI_MODEL') || 'gpt-5-mini',
    input: `Write an original Korean lifestyle-information article for Korean readers in Dallas-Fort Worth. This is not a literal translation and not a command. Preserve exact facts, dates, times, names, addresses, rates, deadlines and source details. Use a warm local-guide tone and offer options with expressions such as '~할 수 있습니다', '~살펴보는 것도 좋겠습니다', or '~도 도움이 될 수 있습니다'. Do not invent facts, give financial guarantees, or turn bank information into personalized financial advice.\nDestination: ${item.destination || item.suggested_destination || 'life'}\nTitle: ${item.original_title}\nSource summary: ${item.original_summary || ''}\nSource: ${item.source_name || ''}\nURL: ${item.original_url}\nWorking title: ${item.ai_title || ''}\nWorking summary: ${item.ai_summary || ''}\nReturn ONLY JSON {"ai_title":"clear Korean headline","ai_summary":"2-3 Korean sentences with the key takeaway","ai_content":"original Korean article body, normally 3-7 short paragraphs, without a source footer"}.`,
  });
  const { error: u } = await admin.from('newsroom_items').update({
    ai_title: a.ai_title || item.ai_title || item.original_title,
    ai_summary: a.ai_summary || item.ai_summary || '',
    ai_content: a.ai_content || '', status: 'review',
    draft_updated_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq('id', item.id);
  if (u) throw u;
  return { ok: true, version: VERSION };
}

async function homeFeed(region = 'dallas') {
  const since = new Date(Date.now() - 10 * 86400000).toISOString();
  const [{ data, error }, { data: setting, error: settingError }] = await Promise.all([
    admin.from('newsroom_items')
      .select('id,original_title,original_summary,original_url,source_name,source_kind,source_published_at,ai_title,ai_summary,status,priority_score,priority_level,category_keywords,suggested_destination,destination,event_data,collected_at')
      .eq('region', region)
      .in('status', ['collected','classified','review'])
      .gte('collected_at', since)
      .order('source_published_at', { ascending: false, nullsFirst: false })
      .limit(180),
    admin.from('newsroom_settings').select('home_config').eq('region', region).maybeSingle(),
  ]);
  if (error) throw error;
  if (settingError) throw settingError;

  const defaultConfig: any = {
    proposal_categories: [], category_links: {}, business_mode: 'featured', business_ids: [],
    community_board_types: [], community_post_ids: [], community_boost_ids: [],
  };
  const rawConfig = ((setting as any)?.home_config && typeof (setting as any).home_config === 'object')
    ? (setting as any).home_config
    : {};
  const homeConfig = { ...defaultConfig, ...rawConfig };
  const selected = Array.isArray(homeConfig.proposal_categories)
    ? homeConfig.proposal_categories.map((v:any)=>String(v||'').trim()).filter(Boolean)
    : [];
  const enabled = new Set(selected.length ? selected : ['shopping','weather','traffic','event','education','real_estate','finance','seminar','faith']);

  const defs: any[] = [
    { key:'emergency', label:'긴급 안내', icon:'🚨', re:/(amber alert|silver alert|clear alert|blue alert|tornado warning|flash flood warning|severe thunderstorm warning|evacuation|shelter in place|긴급|대피|경보|통제|휴교|지연 등교|조기 하교)/i, title:'지금 확인해야 할 지역 긴급 공지가 있습니다.', summary:'안전과 이동에 영향을 줄 수 있는 긴급 안내입니다. 공식 안내와 현재 상황을 확인해 주세요.', base:5000 },
    { key:'seminar', label:'세미나', icon:'📋', re:/(세미나|설명회|강연|워크숍|seminar|workshop|법률.*설명|부동산.*설명|은행.*설명|대출.*설명|세금.*설명|은퇴.*설명|메디케어.*설명|보험.*설명|창업.*설명|투자.*설명)/i, title:'생활에 도움이 되는 세미나를 확인해 보세요.', summary:'법률·부동산·은행·세금 등 관심 분야의 설명회와 세미나 일정이 확인됐습니다.' , base:470 },
    { key:'faith', label:'종교 행사', icon:'⛪', re:/(교회|성당|천주교|불교|사찰|예배|부흥회|찬양집회|여름성경학교|vbs|선교|기도회|수련회|바자회|church|catholic|temple|worship)/i, title:'지역 종교·커뮤니티 행사를 확인해 보세요.', summary:'지역 교회·성당·사찰의 행사와 모임 일정이 확인됐습니다.', base:430 },
    { key:'shopping', label:'쇼핑·마켓', icon:'🛒', re:/(h\s?mart|zion|komart|코마트|시온|마트|마켓|grocery|sale|discount|할인|세일|특가|장보기)/i, title:'장보기 전 할인 정보를 확인해 보세요.', summary:'마켓 세일과 쇼핑 관련 정보가 확인됐습니다. 방문 전 행사 기간과 품목을 살펴보세요.', base:460 },
    { key:'weather', label:'날씨', icon:'☀️', re:/(heat advisory|extreme heat|폭염|무더위|한파|강추위|비|소나기|폭우|눈|우박|storm|thunder|weather|대기질|꽃가루)/i, title:'오늘 날씨에 맞춰 일정을 조정해 보세요.', summary:'외출 전 최신 기상 안내를 확인하고 이동 시간과 준비물을 조정해 보세요.', base:455 },
    { key:'traffic', label:'교통', icon:'🚗', re:/(i-?121|highway 121|i-?35|i-?635|pgbt|dallas north tollway|george bush|tollway|유료도로|교통|정체|사고|road closure|도로 공사|우회)/i, title:'출발 전 주요 도로 상황을 확인해 보세요.', summary:'정체·사고·공사 관련 정보가 확인됐습니다. 출발 시간과 우회 경로를 살펴보세요.', base:450 },
    { key:'event', label:'공연·이벤트', icon:'🎉', re:/(공연|콘서트|축제|박람회|가족행사|문화행사|festival|concert|performance|event)/i, title:'가까운 공연과 행사를 살펴보세요.', summary:'오늘과 이번 주말에 열리는 공연·행사의 시간과 장소를 확인해 보세요.', base:440 },
    { key:'education', label:'교육', icon:'🎓', re:/(학교|학원|교육|개학|휴교|학부모|sat|student|school|isd|설명회)/i, title:'학교와 교육 일정을 미리 확인해 보세요.', summary:'학교 일정과 교육 관련 공지가 확인됐습니다. 필요한 준비를 미리 살펴보세요.', base:420 },
    { key:'real_estate', label:'부동산', icon:'🏠', re:/(부동산|주택|모기지|오픈하우스|분양|집값|real estate|housing|mortgage)/i, title:'주택과 부동산 정보를 살펴보세요.', summary:'주택·모기지·오픈하우스 관련 정보가 확인됐습니다. 조건과 일정을 비교해 보세요.', base:410 },
    { key:'finance', label:'은행·금융', icon:'🏦', re:/(은행|대출|예금|금리|sba|bank|loan|금융|소상공인 금융)/i, title:'은행과 금융 안내를 비교해 보세요.', summary:'대출·예금·금리 관련 안내가 확인됐습니다. 세부 조건을 비교해 보세요.', base:405 },
  ];

  const clean = (value:any) => String(value || '')
    .replace(/<[^>]*>/g,' ')
    .replace(/&nbsp;|&#160;/gi,' ')
    .replace(/\s+/g,' ')
    .replace(/(?:first appeared on|원문|출처)\s*[:：]?[^.!?。！？]{0,80}/gi,' ')
    .replace(/\b(?:KTN|DKNET|Dalkora|KoreaTownNews|Dallas Korean Radio)\b/gi,' ')
    .replace(/(?:KTN\s*코리아타운뉴스|달사람닷컴|주간\s*포커스|미주중앙일보|코리아타운뉴스)/gi,' ')
    .replace(/\s+/g,' ').trim();

  const proposals:any[]=[];
  for (const x of (data || [])) {
    // V47: category is determined from the headline first. This prevents a hospital/business
    // description in a summary from being mislabeled as weather or another unrelated topic.
    const headline = clean(x.ai_title || x.original_title || '');
    const originalHeadline = clean(x.original_title || '');
    const titleText = `${headline} ${originalHeadline}`.trim();
    const emergencyDef = defs[0];
    let def:any = emergencyDef.re.test(titleText) ? emergencyDef : null;
    if (!def) {
      def = defs.slice(1).find((d:any)=> enabled.has(d.key) && d.re.test(titleText)) || null;
    }
    if (!def) continue;

    const ageHours=Math.max(0,(Date.now()-new Date(x.source_published_at||x.collected_at||0).getTime())/3600000);
    const link=String(homeConfig.category_links?.[def.key]||'').trim();
    const originalUrl=String(x.original_url||'').trim();
    proposals.push({
      id:`${x.id}-${def.key}`,
      source_id:String(x.id),
      category:def.key,
      category_label:def.label,
      icon:def.icon,
      title:def.key==='emergency' ? (headline || def.title).slice(0,72) : def.title,
      summary:def.summary,
      source_title:headline || originalHeadline,
      link:link || originalUrl,
      has_link:Boolean(link || originalUrl),
      is_sponsored:Boolean(link),
      published_at:x.source_published_at||x.collected_at,
      score:def.base+Number(x.priority_score||0)-Math.min(80,ageHours/2),
      emergency:def.key==='emergency',
    });
  }

  const rows=proposals.sort((a,b)=>b.score-a.score);
  const emergency=rows.filter(x=>x.emergency).slice(0,4);
  const normal=rows.filter(x=>!x.emergency);
  const byCat=new Map<string,any>();
  normal.forEach(x=>{if(!byCat.has(x.category))byCat.set(x.category,x)});
  const varied=[...byCat.values()];
  const feed=[...emergency,...varied].slice(0,10);

  return {
    ok:true,
    version:VERSION,
    items:feed,
    proposals:feed,
    home_config:homeConfig,
    meta:{
      total:feed.length,
      urgent:emergency.length,
      categories:[...new Set(feed.map(x=>x.category))],
      configured_categories:selected,
      settings_loaded:true,
    },
    generated_at:new Date().toISOString(),
  };
}
async function publicHomeSettings(region = 'dallas') {
  const { data, error } = await admin.from('newsroom_settings')
    .select('home_config,updated_at')
    .eq('region', region)
    .maybeSingle();
  if (error) throw error;
  const defaultConfig:any = {
    proposal_categories: [], category_links: {}, business_mode: 'featured', business_ids: [],
    community_board_types: [], community_post_ids: [], community_boost_ids: [],
  };
  const raw = (data as any)?.home_config && typeof (data as any).home_config === 'object'
    ? (data as any).home_config : {};
  return { ok:true, version:VERSION, home_config:{...defaultConfig,...raw}, updated_at:(data as any)?.updated_at||null };
}

async function status(region = 'dallas') {
  const checks: any = {
    edge_function: true,
    openai_key: Boolean(env('OPENAI_API_KEY')),
    service_role_key: Boolean(env('SUPABASE_SERVICE_ROLE_KEY')),
    newsroom_items: false, newsroom_settings: false, newsroom_runs: false,
  };
  const a = await admin.from('newsroom_items').select('id', { count: 'exact', head: true }).eq('region', region); checks.newsroom_items = !a.error;
  const b = await admin.from('newsroom_settings').select('region', { count: 'exact', head: true }).eq('region', region); checks.newsroom_settings = !b.error;
  const c = await admin.from('newsroom_runs').select('id', { count: 'exact', head: true }).eq('region', region); checks.newsroom_runs = !c.error;
  const ok = Object.values(checks).every(Boolean);
  return {
    ok, version: VERSION, checks,
    supported_actions: ['status', 'run_status', 'cleanup', 'collect', 'analyze', 'draft', 'get_settings', 'save_settings', 'version', 'ping', 'home_feed', 'home_settings'],
    message: ok ? `newsroom Edge Function V${VERSION}이 정상 연결되어 있습니다.` : 'SQL 테이블, Edge Function Secrets 또는 함수 배포 상태를 확인하세요.',
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = new URL(req.url);
    const body = req.method === 'GET' ? {} : await req.json().catch(() => ({}));
    const action = String(url.searchParams.get('action') || body.action || '');
    const region = String(url.searchParams.get('region') || body.region || 'dallas').toLowerCase();

    if (action === 'ping' || action === 'version') return json({ ok: true, version: VERSION, action });
    if (action === 'home_feed') return json(await homeFeed(region));
    if (action === 'home_settings') return json(await publicHomeSettings(region));

    const auth = await authorize(req);
    if (action === 'status' || action === 'health') return json(await status(region));
    if (action === 'run_status') return json(await runStatus(region));
    if (action === 'cleanup') return json(await cleanup(region));
    if (action === 'collect') return json(await collect(region, Boolean((auth as any).cron || body.scheduled), String(body.lane || 'practical')));
    if (action === 'analyze') return json(await analyze(body));
    if (action === 'draft') return json(await draft(body));
    if (action === 'get_settings') {
      const { data, error } = await admin.from('newsroom_settings').select('*').eq('region', region).maybeSingle();
      if (error) throw error;
      return json({ ok: true, version: VERSION, settings: data || { region, auto_enabled: true } });
    }
    if (action === 'save_settings') {
      const payload:any = { region, updated_at: new Date().toISOString() };
      if (typeof body.auto_enabled === 'boolean') payload.auto_enabled = body.auto_enabled;
      if (body.home_config && typeof body.home_config === 'object') payload.home_config = body.home_config;
      const { data, error } = await admin.from('newsroom_settings').upsert(payload, { onConflict: 'region' }).select().single();
      if (error) throw error;
      return json({ ok: true, version: VERSION, settings: data });
    }
    return json({
      ok: false, version: VERSION,
      error: `지원하지 않는 뉴스룸 작업입니다: ${action || '(빈 요청)'}`,
      supported_actions: ['status', 'run_status', 'cleanup', 'collect', 'analyze', 'draft', 'get_settings', 'save_settings', 'version', 'ping', 'home_feed', 'home_settings'],
    }, 400);
  } catch (e) {
    console.error(e);
    return json({ ok: false, version: VERSION, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
