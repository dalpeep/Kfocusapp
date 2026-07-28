import { createClient } from 'npm:@supabase/supabase-js@2';

const VERSION = '59.1.0';
const DALLAS_TZ = 'America/Chicago';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret, cache-control',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
  // V48.9: 일반 수집 기사는 30일 보관 후 자동 삭제합니다.
  // 관리자가 '보관'한 기사는 기간과 관계없이 유지되며, 관리자 화면에서 직접 삭제할 수 있습니다.
  const cutoffMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const { data: rows, error } = await admin.from('newsroom_items')
    .select('id,collected_at,source_published_at,event_data')
    .eq('region', region)
    .limit(5000);
  if (error) throw error;

  const ids: any[] = [];
  for (const row of rows || []) {
    const meta = (row.event_data && typeof row.event_data === 'object') ? row.event_data : {};
    if (meta.archive_kept === true) continue;
    const basis = new Date(row.collected_at || row.source_published_at || 0).getTime();
    if (basis && basis < cutoffMs) ids.push(row.id);
  }
  if (!ids.length) return { ok: true, cleaned: 0, retention_days: 30 };
  let cleaned = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const { data: deleted, error: de } = await admin.from('newsroom_items').delete().in('id', ids.slice(i, i + 200)).select('id');
    if (de) throw de;
    cleaned += deleted?.length || 0;
  }
  return { ok: true, cleaned, retention_days: 30 };
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
  korea: [
    'site:yna.co.kr 재외국민 OR 여권 OR 환율 OR 항공 OR 건강 OR 교육 OR 자동차 OR AI',
    'site:ytn.co.kr 재외국민 OR 여권 OR 환율 OR 항공 OR 건강 OR 교육 OR 자동차 OR AI',
    'site:joongang.co.kr 재외국민 OR 환율 OR 항공 OR 건강 OR 교육 OR 자동차 OR AI',
    'site:hankyung.com 환율 OR 항공 OR 반도체 OR AI OR 자동차 OR 재외국민',
    'site:mk.co.kr 환율 OR 항공 OR 반도체 OR AI OR 자동차 OR 재외국민',
  ],
  practical: [
    'Dallas weather alert road closure traffic airport',
    'Dallas school closure delayed start early dismissal city service public safety',
    'Plano ISD Frisco ISD Lewisville ISD Carrollton Farmers Branch ISD Coppell ISD school closure delay bus route',
    'Dallas ISD Richardson ISD Allen ISD McKinney ISD Garland ISD school alert attendance change',
    'DFW airport delay DART TxDOT Dallas advisory',
    'site:wfaa.com Dallas OR Plano OR Frisco OR Carrollton OR DFW',
    'site:nbcdfw.com Dallas OR Plano OR Frisco OR Carrollton OR DFW',
    'site:fox4news.com Dallas OR Plano OR Frisco OR Carrollton OR DFW',
    'site:cbsnews.com/texas Dallas OR Plano OR Frisco OR Carrollton OR DFW',
    'site:dallasnews.com Dallas OR Plano OR Frisco OR Carrollton OR DFW',
    'site:communityimpact.com Dallas OR Plano OR Frisco OR Carrollton',
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

function parseArticlePublishedAt(html: string) {
  const raw = String(html || '');
  const candidates: string[] = [];
  const metaPatterns = [
    /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']article:published_time["']/i,
    /<meta[^>]+name=["']date["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']pubdate["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+itemprop=["']datePublished["'][^>]+content=["']([^"']+)["']/i,
    /<time[^>]+datetime=["']([^"']+)["']/i,
    /["']datePublished["']\s*:\s*["']([^"']+)["']/i,
    /["']uploadDate["']\s*:\s*["']([^"']+)["']/i,
  ];
  for (const re of metaPatterns) {
    const m = raw.match(re);
    if (m?.[1]) candidates.push(m[1]);
  }
  const text = decodeXml(raw.slice(0, 220000));
  const textPatterns = [
    /(20\d{2})[.\/-]\s*(\d{1,2})[.\/-]\s*(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/,
    /(20\d{2})년\s*(\d{1,2})월\s*(\d{1,2})일(?:\s+(\d{1,2}):(\d{2}))?/,
  ];
  for (const re of textPatterns) {
    const m = text.match(re);
    if (m) {
      const y=m[1], mo=String(m[2]).padStart(2,'0'), d=String(m[3]).padStart(2,'0');
      const hh=String(m[4]||'12').padStart(2,'0'), mm=String(m[5]||'00').padStart(2,'0');
      candidates.push(`${y}-${mo}-${d}T${hh}:${mm}:00-05:00`);
      break;
    }
  }
  for (const value of candidates) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime()) && d.getFullYear() >= 2020 && d.getTime() <= Date.now() + 86400000) return d.toISOString();
  }
  return null;
}
async function enrichDirectPublishedDates(items: any[], maxItems = 24) {
  const selected = items.filter((x:any)=>!x.source_published_at && /^https?:/i.test(String(x.original_url||''))).slice(0,maxItems);
  for (let i=0;i<selected.length;i+=6) {
    const batch=selected.slice(i,i+6);
    const settled=await Promise.allSettled(batch.map(async(item:any)=>{
      const html=await fetchTextWithTimeout(item.original_url,10000);
      const published=parseArticlePublishedAt(html);
      if (published) item.source_published_at=published;
      return published;
    }));
    settled.forEach((r,j)=>{ if(r.status==='rejected') console.warn('article date lookup failed',batch[j]?.original_url,String(r.reason)); });
  }
  return items;
}
function sourceFreshnessHours(item:any, lane:string) {
  if (lane==='events') return 24*14;
  const name=String(item?.source_name||'').toLowerCase();
  if (/ktn|koreatown|주간 포커스|weekly focus/.test(name)) return 72;
  if (/달사람|dalsaram|dalkora|dk net/.test(name)) return 96;
  return 72;
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
  await enrichDirectPublishedDates(items, 30);
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


function scheduledTopicDue(row: any, today = new Date()) {
  if (row.is_active === false) return false;
  const dateKey = dateKeyInDallas(today);
  if (row.start_date && String(row.start_date).slice(0,10) > dateKey) return false;
  if (row.end_date && String(row.end_date).slice(0,10) < dateKey) return false;
  const recurrence = String(row.recurrence || 'daily');
  const weekday = Number(new Intl.DateTimeFormat('en-US',{timeZone:DALLAS_TZ,weekday:'short'}).format(today).match(/Sun|Mon|Tue|Wed|Thu|Fri|Sat/) ? ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(new Intl.DateTimeFormat('en-US',{timeZone:DALLAS_TZ,weekday:'short'}).format(today)) : today.getDay());
  if (recurrence === 'once') return !row.run_date || String(row.run_date).slice(0,10) === dateKey;
  if (recurrence === 'weekly') return !Array.isArray(row.days_of_week) || !row.days_of_week.length || row.days_of_week.map(Number).includes(weekday);
  if (recurrence === 'monthly') return !row.day_of_month || Number(row.day_of_month) === Number(dateKey.slice(8,10));
  return true;
}

async function listScheduledTopics(region='dallas') {
  const {data,error}=await admin.from('newsroom_scheduled_topics').select('*').eq('region',region).order('priority',{ascending:false}).order('created_at',{ascending:true});
  if(error) throw error;
  return {ok:true,version:VERSION,items:data||[],today:dateKeyInDallas()};
}

async function saveScheduledTopic(body:any) {
  const payload:any={
    region:String(body.region||'dallas').toLowerCase(),
    title:String(body.title||'').trim(),
    search_query:String(body.search_query||body.title||'').trim(),
    category:String(body.category||'').trim()||'general',
    priority:Math.max(1,Math.min(3,Number(body.priority)||2)),
    recurrence:String(body.recurrence||'daily'),
    days_of_week:Array.isArray(body.days_of_week)?body.days_of_week.map(Number):[],
    day_of_month:body.day_of_month?Number(body.day_of_month):null,
    run_date:body.run_date||null,
    start_date:body.start_date||null,
    end_date:body.end_date||null,
    is_active:body.is_active!==false,
    updated_at:new Date().toISOString(),
  };
  if(!payload.title) throw new Error('예정 기사 제목을 입력하세요.');
  if(body.id) payload.id=body.id;
  const {data,error}=await admin.from('newsroom_scheduled_topics').upsert(payload).select().single();
  if(error) throw error;
  return {ok:true,version:VERSION,item:data};
}

async function deleteScheduledTopic(body:any) {
  if(!body.id) throw new Error('삭제할 예정 기사 ID가 없습니다.');
  const {error}=await admin.from('newsroom_scheduled_topics').delete().eq('id',body.id);
  if(error) throw error;
  return {ok:true,version:VERSION};
}

async function collectScheduledTopics(region='dallas') {
  const {data:topics,error}=await admin.from('newsroom_scheduled_topics').select('*').eq('region',region).eq('is_active',true).order('priority',{ascending:false});
  if(error) throw error;
  const due=(topics||[]).filter((x:any)=>scheduledTopicDue(x));
  if(!due.length) return {ok:true,version:VERSION,due:0,found:0,inserted:0,matched_topics:[]};
  const {data:existing,error:ee}=await admin.from('newsroom_items').select('original_url,original_title').eq('region',region).limit(1500);
  if(ee) throw ee;
  const seenUrls=new Set((existing||[]).map((x:any)=>slug(x.original_url)));
  const seenTitles=new Set((existing||[]).map((x:any)=>titleKey(x.original_title)));
  const rows:any[]=[]; const matched:any[]=[];
  for(const topic of due){
    try{
      const xml=await fetchTextWithTimeout(googleNewsFeedUrl(`${topic.search_query} Dallas OR DFW`),12000);
      const candidates=parseGoogleNewsRss(xml,'scheduled').slice(0,4);
      let topicMatches=0;
      for(const x of candidates){
        const key=slug(x.original_url), tk=titleKey(x.original_title);
        if(!key||seenUrls.has(key)||(tk&&seenTitles.has(tk))) continue;
        seenUrls.add(key); if(tk) seenTitles.add(tk);
        rows.push({region,original_title:String(x.original_title).slice(0,500),original_summary:x.original_summary||null,original_url:x.original_url,source_name:x.source_name||null,source_kind:x.source_kind||'media',source_published_at:x.source_published_at||null,area:x.area||'Dallas-Fort Worth',status:'collected',confidence:0,fact_status:'needs_review',duplicate_key:key,category_keywords:['scheduled',topic.category,String(topic.title)],priority_level:topic.priority>=3?'high':'normal',priority_score:700+Number(topic.priority||2)*100,suggested_destination:topic.category==='event'?'notice':'life',event_data:{scheduled_topic_id:topic.id,scheduled_topic_title:topic.title,selection_source:'scheduled',scheduled_priority:topic.priority},collected_at:new Date().toISOString(),updated_at:new Date().toISOString()});
        topicMatches++; if(topicMatches>=2) break;
      }
      if(topicMatches) matched.push({id:topic.id,title:topic.title,count:topicMatches});
    }catch(e){console.warn('scheduled topic collect failed',topic.title,e);}
  }
  let inserted=0;
  if(rows.length){const {data,error}=await admin.from('newsroom_items').upsert(rows,{onConflict:'duplicate_key',ignoreDuplicates:true}).select('id');if(error)throw error;inserted=data?.length||0;}
  return {ok:true,version:VERSION,due:due.length,found:rows.length,inserted,matched_topics:matched};
}



async function fetchDallasWeatherBrief() {
  const headers = { 'User-Agent': 'DalTownMap/50.0 (Dallas Korean community app)', 'Accept': 'application/geo+json' };
  const point = await fetch('https://api.weather.gov/points/32.7767,-96.7970', { headers });
  if (!point.ok) throw new Error(`NWS points HTTP ${point.status}`);
  const pointJson:any = await point.json();
  const forecastUrl = pointJson?.properties?.forecast;
  if (!forecastUrl) throw new Error('NWS forecast URL을 찾지 못했습니다.');
  const forecast = await fetch(forecastUrl, { headers });
  if (!forecast.ok) throw new Error(`NWS forecast HTTP ${forecast.status}`);
  const forecastJson:any = await forecast.json();
  const periods = Array.isArray(forecastJson?.properties?.periods) ? forecastJson.properties.periods : [];
  const current = periods[0] || {};
  const next = periods[1] || {};
  const temperature = Number(current.temperature);
  const unit = String(current.temperatureUnit || 'F');
  const short = String(current.shortForecast || '날씨 정보').trim();
  const detail = String(current.detailedForecast || '').trim();
  const text = `${short} ${detail}`;
  let title = `달라스 ${Number.isFinite(temperature) ? `${temperature}°${unit}` : ''} ${short}`.replace(/\s+/g,' ').trim();
  let subtitle = '외출 전 날씨를 확인하세요.';
  if (/heat|hot|excessive/i.test(text) || temperature >= 98) subtitle = '오늘 폭염에 유의하세요.';
  else if (/thunder|storm|rain|shower/i.test(text)) subtitle = '비 소식에 대비하고 안전 운전하세요.';
  else if (/snow|ice|freez|cold/i.test(text) || temperature <= 38) subtitle = '추위와 도로 결빙에 유의하세요.';
  else if (/wind/i.test(text)) subtitle = '강한 바람에 유의하세요.';
  return {
    title: title.slice(0, 64),
    summary: [detail, next?.name && next?.shortForecast ? `${next.name}: ${next.shortForecast}` : ''].filter(Boolean).join(' '),
    subtitle,
    source_name: 'National Weather Service Fort Worth/Dallas',
  };
}

async function fetchDallasTrafficBrief() {
  const now = new Date().toISOString();
  const result:any = await openai({
    model: env('NEWSROOM_OPENAI_MODEL') || 'gpt-5-mini',
    tools: [{ type: 'web_search_preview' }],
    input: `Current time: ${now}. Create one current Dallas-Fort Worth traffic brief for a Korean community app. Check official 511DFW and TxDOT Dallas information first. You may use WFAA, NBC 5 DFW, FOX 4 or CBS Texas only as secondary confirmation. Focus on significant active crashes, closures, construction, DART disruptions, or unusual congestion affecting major roads such as I-35E, I-635, US-75, SH-121, PGBT and Dallas North Tollway. If no verified major issue is found, say major routes have no verified major closure and advise checking conditions before departure. Do not include URLs. Do not invent travel times. Return ONLY JSON: {"title":"Korean concise title under 32 characters","summary":"Korean factual sentence under 120 characters","subtitle":"Korean action sentence under 35 characters"}`,
  }, 65000);
  return {
    title: String(result?.title || 'DFW 주요 도로 교통 점검').slice(0,64),
    summary: String(result?.summary || '확인된 대형 통제 정보가 없더라도 출발 전 실시간 교통 상황을 확인하세요.').slice(0,240),
    subtitle: String(result?.subtitle || '출발 전 교통 상황을 확인하세요.').slice(0,80),
    source_name: '511DFW·TxDOT Dallas 종합',
  };
}

async function ensureDailyCoreBriefs(region='dallas') {
  const today = dateKeyInDallas();
  const now = new Date().toISOString();
  const results:any = { ok:true, version:VERSION, weather:null, traffic:null };
  const create = async(kind:string, payload:any) => {
    const category = kind === 'weather' ? 'weather' : 'traffic';
    const icon = kind === 'weather' ? '☀️' : '🚗';
    const duplicateKey = `daily-core-${kind}-${region}-${today}`;
    const {data:exists,error:ee}=await admin.from('newsroom_items').select('id,event_data').eq('duplicate_key',duplicateKey).maybeSingle();
    if(ee) throw ee;
    if(exists) {
      const event_data={...(exists.event_data||{}),selection_source:'daily_core',daily_core:true,category,icon,subtitle:payload.subtitle,generated_for_date:today,refreshed_at:now};
      const {error:ue}=await admin.from('newsroom_items').update({
        original_title:payload.title,original_summary:payload.summary,source_name:payload.source_name,
        source_published_at:now,ai_title:payload.title,ai_summary:payload.summary,event_data,updated_at:now,
      }).eq('id',exists.id);
      if(ue) throw ue;
      return {created:false,refreshed:true,id:exists.id,title:payload.title};
    }
    const {data,error}=await admin.from('newsroom_items').insert({
      region, original_title:payload.title, original_summary:payload.summary,
      original_url:`internal://daily-core/${kind}/${today}`, source_name:payload.source_name,
      source_kind:'daily_core', source_published_at:now, area:'Dallas-Fort Worth',
      status:'classified', confidence:95, fact_status:'official_verified', duplicate_key:duplicateKey,
      ai_title:payload.title, ai_summary:payload.summary, category_keywords:['daily_core',category],
      priority_level:'high', priority_score:900, suggested_destination:'life', destination:'life',
      event_data:{selection_source:'daily_core',daily_core:true,category,icon,subtitle:payload.subtitle,generated_for_date:today},
      collected_at:now, updated_at:now,
    }).select('id').single();
    if(error) throw error;
    return {created:true,id:data?.id,title:payload.title};
  };
  try { results.weather = await create('weather', await fetchDallasWeatherBrief()); }
  catch(e) {
    console.warn('daily weather brief failed',e);
    results.weather = await create('weather',{title:'오늘의 달라스 날씨',summary:'외출 전 최신 기상 상황을 확인하세요.',subtitle:'오늘 날씨에 맞게 준비하세요.',source_name:'NWS Fort Worth/Dallas'});
  }
  try { results.traffic = await create('traffic', await fetchDallasTrafficBrief()); }
  catch(e) {
    console.warn('daily traffic brief failed',e);
    results.traffic = await create('traffic',{title:'DFW 주요 도로 교통 점검',summary:'출발 전 511DFW 또는 지도 앱에서 현재 교통 상황을 확인하세요.',subtitle:'출발 전 교통 상황을 확인하세요.',source_name:'511DFW·TxDOT Dallas'});
  }
  return results;
}

async function ensureDailyLifestyleScenario(region='dallas') {
  // V49: 주간 발행 위주의 한인 뉴스가 없는 날에도 메인에 신선한 생활 제안을 제공합니다.
  const today=dateKeyInDallas();
  const weekday=Number(new Intl.DateTimeFormat('en-US',{timeZone:DALLAS_TZ,weekday:'short'}).format(new Date()).match(/Sun|Mon|Tue|Wed|Thu|Fri|Sat/) ? ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(new Intl.DateTimeFormat('en-US',{timeZone:DALLAS_TZ,weekday:'short'}).format(new Date())) : new Date().getDay());
  const scenarios:any[]=[
    {category:'education',title:'다음 주 생활 준비',summary:'학교 일정과 가족 계획을 미리 정리해 보세요.',label:'관련 정보'},
    {category:'traffic',title:'이번 주 교통·일정 점검',summary:'출퇴근 경로와 이번 주 주요 일정을 확인해 보세요.',label:'교통 정보'},
    {category:'shopping',title:'한 주를 위한 생활 정비',summary:'미용·건강·장보기 등 필요한 생활 일정을 살펴보세요.',label:'생활 정보'},
    {category:'real_estate',title:'이번 주 생활·재정 체크',summary:'주택·금융·세금 관련 생활 정보를 점검해 보세요.',label:'관련 정보'},
    {category:'event',title:'이번 주말 행사 미리보기',summary:'가족 행사와 공연 일정을 미리 살펴보세요.',label:'행사 보기'},
    {category:'event',title:'주말 나들이·외식 정보',summary:'가족과 함께할 행사와 가까운 업소를 찾아보세요.',label:'주말 정보'},
    {category:'event',title:'오늘의 가족 나들이',summary:'가까운 행사와 가족 활동을 확인해 보세요.',label:'행사 보기'},
  ];
  const item=scenarios[weekday]||scenarios[1];
  const duplicateKey=`daily-scenario-${region}-${today}`;
  const {data:exists,error:ee}=await admin.from('newsroom_items').select('id').eq('duplicate_key',duplicateKey).maybeSingle();
  if(ee) throw ee;
  if(exists) return {ok:true,created:false,id:exists.id,title:item.title};
  const now=new Date().toISOString();
  const {data,error}=await admin.from('newsroom_items').insert({
    region,original_title:item.title,original_summary:item.summary,original_url:`internal://daily-scenario/${today}`,
    source_name:'DalTownMap AI 생활 캘린더',source_kind:'ai_scenario',source_published_at:now,area:'Dallas-Fort Worth',
    status:'classified',confidence:95,fact_status:'official_verified',duplicate_key:duplicateKey,
    ai_title:item.title,ai_summary:item.summary,category_keywords:['daily_scenario',item.category],
    priority_level:'normal',priority_score:65,suggested_destination:'life',destination:'life',
    event_data:{selection_source:'ai_scenario',category:item.category,internal_link_label:item.label,generated_for_date:today},
    collected_at:now,updated_at:now,
  }).select('id').single();
  if(error) throw error;
  return {ok:true,created:true,id:data?.id,title:item.title};
}

async function resetDailyEditorialState(region='dallas') {
  const {data,error}=await admin.from('newsroom_items')
    .select('id,event_data,priority_score')
    .eq('region',region)
    .order('collected_at',{ascending:false})
    .limit(1000);
  if(error) throw error;
  const targets=(data||[]).filter((row:any)=>{
    const meta=(row.event_data&&typeof row.event_data==='object')?row.event_data:{};
    return String(meta.selection_source||'')==='editor' || meta.home_link_enabled===true || Boolean(meta.home_link_url);
  });
  let reset=0;
  for(let i=0;i<targets.length;i+=20){
    const batch=targets.slice(i,i+20);
    const results=await Promise.all(batch.map(async(row:any)=>{
      const current=(row.event_data&&typeof row.event_data==='object')?row.event_data:{};
      const restored=String(current.previous_selection_source||'ai');
      const event_data={
        ...current,
        selection_source:String(current.selection_source||'')==='editor'?restored:String(current.selection_source||'ai'),
        previous_selection_source:null,
        editor_picked_at:null,
        home_link_enabled:false,
        home_link_url:null,
        home_target_type:null,
        home_target_id:null,
        home_link_label:null,
        home_category:null,
        home_show:false,
        home_link_updated_at:null,
        daily_editorial_reset_at:new Date().toISOString(),
      };
      const {error:updateError}=await admin.from('newsroom_items').update({
        event_data,
        priority_score:Number(row.priority_score||0)>=999?50:row.priority_score,
        updated_at:new Date().toISOString(),
      }).eq('id',row.id);
      if(updateError) throw updateError;
      return 1;
    }));
    reset+=results.length;
  }
  return {ok:true,reset};
}


function marketText(html='') {
  return decodeXml(String(html)
    .replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ')
    .replace(/\s+/g,' ')
    .trim());
}
function marketFingerprint(value='') {
  let h=2166136261;
  for(const ch of String(value)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}
  return (h>>>0).toString(16);
}
function clipAround(text='', re:RegExp, radius=240) {
  const m=String(text).match(re); if(!m||m.index==null) return String(text).slice(0,radius*2);
  return String(text).slice(Math.max(0,m.index-radius),Math.min(String(text).length,m.index+radius)).trim();
}
async function fetchDirectMarketCandidates() {
  const sources=[
    {key:'zion-texas',name:'Zion Market',url:'https://zionmarket.com/event/',kind:'zion'},
    {key:'hmart-online-sale',name:'H Mart',url:'https://www.hmart.com/sale?map=productClusterIds',kind:'hmart'},
  ];
  const settled=await Promise.allSettled(sources.map(async(src)=>{
    const html=await fetchTextWithTimeout(src.url,15000);
    const text=marketText(html);
    if(!text) throw new Error(`${src.name} 페이지 내용이 비어 있습니다.`);
    if(src.kind==='zion'){
      const hasTexas=/\bTexas\b|\bTX\b|Lewisville/i.test(text);
      if(!hasTexas) throw new Error('Zion Market 페이지에서 Texas/Lewisville 정보를 확인하지 못했습니다.');
      const duration=text.match(/Event Duration\s*:?\s*([0-9/\-\s]+(?:202\d)?)/i)?.[1]?.trim()||'';
      const snippet=clipAround(text,/(Texas|Lewisville|Event Duration|Weekly Sale)/i,300);
      const fingerprint=marketFingerprint(`${duration}|${snippet}`);
      return {duplicate_key:'market-direct-zion-texas',fingerprint,original_title:'Zion Market Texas 이벤트·세일 정보',original_summary:(duration?`행사 기간 ${duration}. `:'')+snippet.slice(0,700),original_url:src.url,source_name:src.name,source_kind:'market_direct',area:'Lewisville · Dallas-Fort Worth',category_keywords:['shopping','market','zion','texas'],event_data:{market_source:'zion',market_scope:'texas',fingerprint,home_category:'shopping'}};
    }
    const weekly=clipAround(text,/(Weekly Sale|Flash Sale|Online Exclusive Deals)/i,500);
    const fingerprint=marketFingerprint(weekly);
    return {duplicate_key:'market-direct-hmart-online',fingerprint,original_title:'H Mart 온라인 세일 정보',original_summary:`H Mart 웹사이트의 온라인 세일 정보입니다. 매장별 가격과 재고는 다를 수 있습니다. ${weekly.slice(0,700)}`,original_url:src.url,source_name:src.name,source_kind:'market_direct',area:'Online · Dallas-Fort Worth residents',category_keywords:['shopping','market','hmart','online_sale'],event_data:{market_source:'hmart',market_scope:'online',fingerprint,home_category:'shopping',store_price_notice:true}};
  }));
  const items:any[]=[];const warnings:string[]=[];
  settled.forEach((r,i)=>{if(r.status==='fulfilled')items.push(r.value);else warnings.push(`${sources[i].name}: ${r.reason instanceof Error?r.reason.message:String(r.reason)}`)});
  return {items,warnings};
}
async function collectDirectMarkets(region='dallas') {
  const now=new Date().toISOString();
  const {items,warnings}=await fetchDirectMarketCandidates();
  let inserted=0,updated=0,unchanged=0;
  for(const item of items){
    const {data:existing,error:readError}=await admin.from('newsroom_items').select('id,event_data').eq('region',region).eq('duplicate_key',item.duplicate_key).maybeSingle();
    if(readError) throw readError;
    const oldMeta=(existing?.event_data&&typeof existing.event_data==='object')?existing.event_data:{};
    if(existing&&String(oldMeta.fingerprint||'')===String(item.fingerprint||'')){
      const {error}=await admin.from('newsroom_items').update({collected_at:now,updated_at:now}).eq('id',existing.id);if(error)throw error;unchanged++;continue;
    }
    const payload={region,original_title:item.original_title,original_summary:item.original_summary,original_url:item.original_url,source_name:item.source_name,source_kind:item.source_kind,source_published_at:now,area:item.area,status:'collected',confidence:0,fact_status:'needs_review',duplicate_key:item.duplicate_key,category_keywords:item.category_keywords,priority_level:'normal',priority_score:40,suggested_destination:'life',event_data:{...item.event_data,market_collected_at:now},collected_at:now,updated_at:now};
    if(existing){const {error}=await admin.from('newsroom_items').update(payload).eq('id',existing.id);if(error)throw error;updated++;}
    else{const {error}=await admin.from('newsroom_items').insert(payload);if(error)throw error;inserted++;}
  }
  return {ok:true,version:VERSION,found:items.length,inserted,updated,unchanged,warnings,sources:['Zion Market Texas event','H Mart online sale']};
}

async function autoRun(region='dallas') {
  const run=await startRun(region,'scheduled','V49 daily content engine auto run');
  try{
    const reset=await resetDailyEditorialState(region);
    const cleaned=await cleanup(region);
    const planned=await collectScheduledTopics(region);
    const dailyCore=await ensureDailyCoreBriefs(region);
    let markets:any=null;try{markets=await collectDirectMarkets(region);}catch(e){markets={ok:false,error:e instanceof Error?e.message:String(e)};}
    const lanes:any[]=[];
    for(const lane of ['practical','shopping','events','korean','korea']){try{lanes.push(await collect(region,false,lane));}catch(e){lanes.push({lane,error:e instanceof Error?e.message:String(e)});}}
    const dailyScenario=await ensureDailyLifestyleScenario(region);
    let analyzed=0;
    for(let i=0;i<5;i++){const r=await analyze({region,limit:3});analyzed+=Number(r.analyzed||0);if(!r.analyzed)break;}
    await finishRun(run?.id,{status:'success',found:Number(planned.found||0)+lanes.reduce((n,x)=>n+Number(x.found||0),0),inserted:Number(planned.inserted||0)+lanes.reduce((n,x)=>n+Number(x.inserted||0),0),skipped:lanes.reduce((n,x)=>n+Number(x.skipped||0),0),cleaned:Number(cleaned.cleaned||0),note:`planned:${planned.inserted}; analyzed:${analyzed}`});
    return {ok:true,version:VERSION,reset,planned,dailyCore,markets,lanes,dailyScenario,analyzed,selection_order:['daily_weather','daily_traffic','editor_markets','editor_events','editor_business']};
  }catch(e){await finishRun(run?.id,{status:'failed',error_message:e instanceof Error?e.message:String(e)});throw e;}
}

async function setEditorPick(body:any){
  if(!body.id) throw new Error('기사 ID가 없습니다.');
  const {data:item,error}=await admin.from('newsroom_items').select('event_data').eq('id',body.id).single();if(error)throw error;
  const current=(item?.event_data&&typeof item.event_data==='object')?item.event_data:{};
  const enabled=body.enabled!==false;
  const currentSource=String(current.selection_source||'ai');
  const restoreSource=String(current.previous_selection_source||'ai');
  const event_data=enabled
    ? {...current,previous_selection_source:currentSource==='editor'?restoreSource:currentSource,selection_source:'editor',editor_picked_at:new Date().toISOString()}
    : {...current,selection_source:restoreSource,previous_selection_source:null,editor_picked_at:null};
  const {error:u}=await admin.from('newsroom_items').update({event_data,priority_score:enabled?999:50,updated_at:new Date().toISOString()}).eq('id',body.id);if(u)throw u;
  return {ok:true,version:VERSION};
}

async function setHomeLink(body:any){
  if(!body.id) throw new Error('기사 ID가 없습니다.');
  const {data:item,error}=await admin.from('newsroom_items').select('event_data').eq('id',body.id).single();
  if(error) throw error;
  const enabled=body.enabled===true;
  const targetType=String(body.target_type||'').trim();
  const targetId=String(body.target_id||'').trim();
  if(enabled && !['post','business'].includes(targetType)) throw new Error('연결 대상은 우리 게시판 또는 업소만 선택할 수 있습니다.');
  if(enabled && !targetId) throw new Error('연결할 게시글 또는 업소 ID를 입력하세요.');
  const event_data={
    ...(item?.event_data||{}),
    home_link_enabled:enabled,
    home_link_url:null,
    home_target_type:enabled?targetType:null,
    home_target_id:enabled?targetId:null,
    home_link_label:enabled?String(body.label||'기사 보기').trim()||'기사 보기':null,
    home_category:enabled?String(body.category||'business').trim()||'business':null,
    home_show:enabled,
    home_link_updated_at:new Date().toISOString(),
  };
  const {error:u}=await admin.from('newsroom_items').update({event_data,updated_at:new Date().toISOString()}).eq('id',body.id);
  if(u) throw u;
  return {ok:true,version:VERSION,id:String(body.id),home_link_enabled:enabled,home_target_type:enabled?targetType:null,home_target_id:enabled?targetId:null};
}

async function setArchiveKeep(body:any){
  if(!body.id) throw new Error('기사 ID가 없습니다.');
  const {data:item,error}=await admin.from('newsroom_items').select('event_data').eq('id',body.id).single();
  if(error) throw error;
  const enabled=body.enabled===true;
  const event_data={
    ...(item?.event_data||{}),
    archive_kept:enabled,
    archive_kept_at:enabled?new Date().toISOString():null,
    archive_updated_at:new Date().toISOString(),
  };
  const {error:u}=await admin.from('newsroom_items').update({event_data,updated_at:new Date().toISOString()}).eq('id',body.id);
  if(u) throw u;
  return {ok:true,version:VERSION,id:String(body.id),archive_kept:enabled};
}

async function deleteNewsroomItem(body:any){
  if(!body.id) throw new Error('기사 ID가 없습니다.');
  const {data,error}=await admin.from('newsroom_items').delete().eq('id',body.id).select('id').maybeSingle();
  if(error) throw error;
  return {ok:true,version:VERSION,id:String(body.id),deleted:Boolean(data)};
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
    const dailyCore = normalizedLane === 'practical' ? await ensureDailyCoreBriefs(region) : null;
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
    const recent = fetched.filter((x) => {
      // V52.1: Korean weekly/community pages must be selected by the article's actual publication date,
      // never by the listing page's changing date or the time we happened to crawl it.
      if (!x.source_published_at) {
        return normalizedLane !== 'korean' && normalizedLane !== 'korea';
      }
      const ms = new Date(x.source_published_at).getTime();
      if (Number.isNaN(ms)) return normalizedLane !== 'korean' && normalizedLane !== 'korea';
      const maxAgeMs = sourceFreshnessHours(x, normalizedLane) * 3600000;
      return nowMs >= ms && nowMs - ms <= maxAgeMs;
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
      ok: true, version: VERSION, lane: normalizedLane, provider, dailyCore,
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
    input: `Analyze one Dallas-Fort Worth lifestyle-newsroom source record. The product is a friendly Dallas Korean lifestyle guide, not a hard-news wire.\nTitle: ${item.original_title}\nSummary: ${item.original_summary || ''}\nSource: ${item.source_name || ''}\nURL: ${item.original_url}\nPublished: ${item.source_published_at || ''}\nArea: ${item.area || ''}\nReturn ONLY JSON with suggested_destination exactly life, notice, guide, urgent, or exclude; confidence 0-100; fact_status official_verified or needs_review; priority_level urgent, high, normal, or low; priority_score 0-100; classification_reason in concise Korean; a concise Korean headline preferably under 22 Korean characters and a newly written 1-2 sentence Dallas-Korean lifestyle summary; category_keywords; event_data fields name,start_at,end_at,venue,address,cost,organizer. The source URL is internal evidence only: never place a source name, original-link invitation, external URL, or attribution call-to-action in ai_title, ai_summary, or event_data. For Korean domestic news, keep only topics useful to Korean residents in Dallas such as overseas Koreans, passports, exchange rates, flights, travel, health, education, technology, automobiles, semiconductors, and practical finance; exclude Korean political conflict, gossip, routine crime, and game scores. Reframe useful topics for Dallas Korean residents instead of copying the original wording. Keep useful Korean-community, finance, shopping, family and practical lifestyle information even if it is not major news. Exclude only duplicates, expired items, weak resident relevance, unverifiable claims, or pure evergreen advertising. Use concise information-style noun phrases rather than long invitation sentences. {"suggested_destination":"life","confidence":90,"fact_status":"official_verified","priority_level":"normal","priority_score":70,"classification_reason":"","ai_title":"","ai_summary":"","category_keywords":[],"event_data":{}}`,
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


async function traceSources(body: any) {
  if (!body.id) throw new Error('기사 ID가 없습니다.');
  const { data: item, error } = await admin.from('newsroom_items').select('*').eq('id', body.id).single();
  if (error) throw error;

  const title = String(item.ai_title || item.original_title || '').trim();
  const summary = String(item.ai_summary || item.original_summary || '').trim();
  if (!title) throw new Error('출처를 추적할 제목이 없습니다.');

  const compact = title.replace(/[“”"'‘’]/g, ' ').replace(/\s+/g, ' ').trim();
  const queries = [
    `"${compact}"`,
    `${compact} official announcement`,
    `${compact} source report`,
  ];
  const raw: any[] = [];
  for (const q of queries) {
    try {
      const xml = await fetchTextWithTimeout(googleNewsFeedUrl(q), 15000);
      raw.push(...parseGoogleNewsRss(xml, 'trace').slice(0, 12));
    } catch (e) {
      console.warn('source trace query failed', q, e instanceof Error ? e.message : String(e));
    }
  }
  const dedup = new Map<string, any>();
  for (const r of raw) {
    const key = `${titleKey(r.original_title)}|${String(r.source_name || '').toLowerCase()}`;
    if (!key || dedup.has(key)) continue;
    dedup.set(key, {
      title: r.original_title,
      url: r.original_url,
      publisher: r.source_name || '출처 미상',
      published_at: r.source_published_at || null,
      summary: String(r.original_summary || '').slice(0, 600),
    });
  }
  const candidates = Array.from(dedup.values()).slice(0, 24);

  const ranked = await openai({
    model: env('NEWSROOM_OPENAI_MODEL') || 'gpt-5-mini',
    input: `You are tracing the likely original public source behind a news topic. The Korean/community article is only a discovery signal. Do not copy it and do not assume it is the origin. Identify official agencies, research institutions, wire services, local broadcasters/newspapers, and other primary or near-primary sources among the candidates. Be conservative: call something a likely origin only when evidence supports it.

Topic title: ${title}
Topic summary: ${summary}
Discovery source: ${item.source_name || ''}
Discovery URL: ${item.original_url || ''}
Candidates JSON: ${JSON.stringify(candidates)}

Return ONLY JSON with this shape:
{
  "likely_origin": {"publisher":"","title":"","url":"","type":"official|research|wire|local_media|national_media|community_media|unknown","confidence":0},
  "notes":"Korean explanation of why this is or is not likely to be the original source",
  "sources":[{"publisher":"","title":"","url":"","published_at":null,"type":"official|research|wire|local_media|national_media|community_media|unknown","role":"primary|near_primary|secondary|discovery_signal","confidence":0,"reason":"brief Korean reason"}]
}
Keep at most 8 sources. Prefer official and primary sources.`,
  }, 80000);

  const sources = Array.isArray(ranked.sources) ? ranked.sources.slice(0, 8) : [];
  const trace = {
    checked_at: new Date().toISOString(),
    likely_origin: ranked.likely_origin || null,
    notes: String(ranked.notes || ''),
    sources,
    discovery_source: { publisher: item.source_name || '', url: item.original_url || '' },
    query_count: queries.length,
    candidate_count: candidates.length,
  };
  const oldEvent = item.event_data && typeof item.event_data === 'object' ? item.event_data : {};
  const { error: updateError } = await admin.from('newsroom_items').update({
    event_data: { ...oldEvent, source_trace: trace },
    updated_at: new Date().toISOString(),
  }).eq('id', item.id);
  if (updateError) throw updateError;
  return { ok: true, version: VERSION, trace };
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
  const since = new Date(Date.now() - 14 * 86400000).toISOString();
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
    ? (setting as any).home_config : {};
  const homeConfig = { ...defaultConfig, ...rawConfig };
  const selected = Array.isArray(homeConfig.proposal_categories)
    ? homeConfig.proposal_categories.map((v:any)=>String(v||'').trim()).filter(Boolean)
    : [];
  const preferred = new Set(selected);

  const defs: any[] = [
    { key:'business', label:'업소 추천', icon:'🏪', re:/(업소 추천|업체 추천|비즈니스 추천|business promotion|business recommendation)/i, title:'오늘의 추천 업소', summary:'달라스 지역의 추천 업소를 소개합니다.', base:480 },
    { key:'emergency', label:'긴급 안내', icon:'🚨', re:/(amber alert|silver alert|clear alert|blue alert|tornado warning|flash flood warning|severe thunderstorm warning|evacuation|shelter in place|긴급|대피|경보|통제|휴교|지연 등교|조기 하교)/i, title:'지역 긴급 공지', summary:'안전과 이동에 영향을 줄 수 있는 긴급 안내입니다. 공식 안내와 현재 상황을 확인해 주세요.', base:5000 },
    { key:'seminar', label:'세미나', icon:'📋', re:/(세미나|설명회|강연|워크숍|seminar|workshop|법률.*설명|부동산.*설명|은행.*설명|대출.*설명|세금.*설명|은퇴.*설명|메디케어.*설명|보험.*설명|창업.*설명|투자.*설명)/i, title:'생활 세미나 안내', summary:'법률·부동산·은행·세금 등 관심 분야의 설명회와 세미나 일정이 확인됐습니다.', base:470 },
    { key:'faith', label:'종교 행사', icon:'⛪', re:/(교회|성당|천주교|불교|사찰|예배|부흥회|찬양집회|여름성경학교|vbs|선교|기도회|수련회|바자회|church|catholic|temple|worship)/i, title:'종교·커뮤니티 행사', summary:'지역 교회·성당·사찰의 행사와 모임 일정이 확인됐습니다.', base:430 },
    { key:'shopping', label:'쇼핑·마켓', icon:'🛒', re:/(h\s?mart|zion|komart|코마트|시온|마트|마켓|grocery|sale|discount|할인|세일|특가|장보기|shopping)/i, title:'이번 주 마켓·쇼핑', summary:'마켓 세일과 쇼핑 관련 정보가 확인됐습니다. 방문 전 행사 기간과 품목을 살펴보세요.', base:460 },
    { key:'weather', label:'날씨', icon:'☀️', re:/(heat advisory|extreme heat|폭염|무더위|한파|강추위|비|소나기|폭우|눈|우박|storm|thunder|weather|대기질|꽃가루)/i, title:'오늘의 날씨·생활', summary:'외출 전 최신 기상 안내를 확인하고 이동 시간과 준비물을 조정해 보세요.', base:455 },
    { key:'traffic', label:'교통', icon:'🚗', re:/(i-?121|highway 121|i-?35|i-?635|pgbt|dallas north tollway|george bush|tollway|유료도로|교통|정체|사고|road closure|도로 공사|우회|traffic|highway|closure)/i, title:'DFW 교통 정보', summary:'정체·사고·공사 관련 정보가 확인됐습니다. 출발 시간과 우회 경로를 살펴보세요.', base:450 },
    { key:'event', label:'공연·이벤트', icon:'🎉', re:/(공연|콘서트|축제|박람회|가족행사|문화행사|행사|미팅|모임|festival|concert|performance|event|meeting)/i, title:'이번 주 공연·행사', summary:'오늘과 이번 주말에 열리는 공연·행사의 시간과 장소를 확인해 보세요.', base:440 },
    { key:'education', label:'교육', icon:'🎓', re:/(학교|학원|교육|개학|휴교|학부모|sat|student|school|isd|설명회)/i, title:'학교·교육 일정', summary:'학교 일정과 교육 관련 공지가 확인됐습니다. 필요한 준비를 미리 살펴보세요.', base:420 },
    { key:'real_estate', label:'부동산', icon:'🏠', re:/(부동산|주택|모기지|오픈하우스|분양|집값|real estate|housing|mortgage)/i, title:'주택·부동산 정보', summary:'주택·모기지·오픈하우스 관련 정보가 확인됐습니다. 조건과 일정을 비교해 보세요.', base:410 },
    { key:'finance', label:'은행·금융', icon:'🏦', re:/(은행|대출|예금|금리|sba|bank|loan|금융|경제|소상공인 금융|finance)/i, title:'은행·금융 정보', summary:'대출·예금·금리 관련 안내가 확인됐습니다. 세부 조건을 비교해 보세요.', base:405 },
  ];

  const aliases:any = {
    '업소 추천':'business', '업체 추천':'business', business:'business',
    '쇼핑·마켓':'shopping', shopping:'shopping', market:'shopping',
    '날씨':'weather', weather:'weather',
    '교통':'traffic', traffic:'traffic',
    '공연·이벤트':'event', '공연':'event', '행사':'event', event:'event',
    '교육':'education', education:'education',
    '부동산':'real_estate', real_estate:'real_estate', 'real-estate':'real_estate',
    '은행·금융':'finance', '금융':'finance', finance:'finance',
    '세미나':'seminar', seminar:'seminar',
    '종교 행사':'faith', '종교':'faith', faith:'faith',
    '긴급 안내':'emergency', emergency:'emergency', urgent:'emergency',
  };
  const clean = (value:any) => String(value || '').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/\s+/g,' ').trim();
  const categoryFromItem = (x:any) => {
    const meta = (x.event_data && typeof x.event_data === 'object') ? x.event_data : {};
    const explicit = [meta.home_category, meta.category, meta.category_key, meta.scheduled_topic_category, ...(Array.isArray(x.category_keywords)?x.category_keywords:[])]
      .map((v:any)=>String(v||'').trim()).filter(Boolean);
    for (const value of explicit) {
      const key = aliases[value] || aliases[value.toLowerCase?.()] || '';
      const found = defs.find(d=>d.key===key);
      if (found) return found;
    }
    const text = clean(`${x.ai_title||''} ${x.original_title||''} ${(x.category_keywords||[]).join(' ')} ${x.ai_summary||''} ${x.original_summary||''}`);
    return defs.find(d=>d.re.test(text)) || null;
  };

  const proposals:any[]=[];
  for (const x of (data || [])) {
    const def:any = categoryFromItem(x);
    if (!def) continue;
    const headline = clean(x.ai_title || x.original_title || '');
    const ageHours=Math.max(0,(Date.now()-new Date(x.source_published_at||x.collected_at||0).getTime())/3600000);
    const meta = (x.event_data && typeof x.event_data === 'object') ? x.event_data : {};
    const selectionSource = String(meta.selection_source || 'ai');
    const sourceBonus = selectionSource === 'editor' ? 1500 : selectionSource === 'scheduled' ? 1000 : 0;
    const preferredBonus = preferred.size === 0 || preferred.has(def.key) ? 300 : 0;
    // V48.5: 원문 링크는 수집용 근거로만 보관합니다. 메인에서는 관리자가
    // 기사별로 명시적으로 허용한 링크만 사용합니다. 카테고리 공통 링크도
    // 관리자가 직접 설정한 값이므로 보조 선택지로 유지합니다.
    // V48.8: 자동 공개 기사는 기본적으로 링크 없이 노출합니다.
    // 기사별 링크는 관리자가 해당 기사에서 명시적으로 승인한 경우에만 사용합니다.
    const itemLinkEnabled=meta.home_link_enabled===true;
    const targetType=itemLinkEnabled?String(meta.home_target_type||'').trim():'';
    const targetId=itemLinkEnabled?String(meta.home_target_id||'').trim():'';
    const externalUrl=String(meta.home_external_url||'').trim();
    const approvedInternalTarget=['post','business'].includes(targetType)&&Boolean(targetId);
    const approvedExternalTarget=targetType==='external'&&/^https?:\/\//i.test(externalUrl);
    proposals.push({
      id:`${x.id}-${def.key}`, source_id:String(x.id), category:def.key, category_label:def.label, icon:def.icon,
      title:clean(meta.home_custom_title||((meta.daily_core===true || def.key==='emergency' || selectionSource==='editor') ? (headline || def.title) : def.title)).slice(0,72),
      summary:clean(meta.home_custom_message||(selectionSource==='editor'?x.ai_summary||x.original_summary||'':'')).slice(0,180), source_title:headline, link:approvedExternalTarget?externalUrl:'', url:approvedExternalTarget?externalUrl:'', has_link:approvedInternalTarget||approvedExternalTarget,
      target_type:approvedInternalTarget?targetType:(approvedExternalTarget?'external':''), target_id:approvedInternalTarget?targetId:'',
      link_label:(approvedInternalTarget||approvedExternalTarget)?String(meta.home_link_label||meta.internal_link_label||'자세히 보기'):'',
      is_sponsored:false, published_at:x.source_published_at||x.collected_at,
      updated_at:x.updated_at||x.collected_at||x.source_published_at,
      score:def.base+sourceBonus+preferredBonus+Number(x.priority_score||0)-Math.min(80,ageHours/2),
      selection_source:selectionSource, subtitle:clean(meta.home_custom_message||meta.subtitle||''), daily_core:meta.daily_core===true, scheduled_topic_title:String(meta.scheduled_topic_title||''), emergency:def.key==='emergency',
    });
  }

  // V51.4 메인 운영: 날씨와 교통만 자동 표시합니다.
  // 쇼핑·행사·업소 및 기타 정보는 관리자가 메인 노출로 지정한 경우에만 추가합니다.
  const sorted=proposals.sort((a,b)=>b.score-a.score);
  const editorRows=sorted.filter((x:any)=>x.selection_source==='editor');
  const emergency=sorted.filter((x:any)=>x.emergency);
  const latestCore=(category:string)=>sorted.find((x:any)=>x.category===category && x.daily_core===true)
    || sorted.find((x:any)=>x.category===category && x.selection_source!=='editor');
  const autoRows:any[]=[latestCore('weather'),latestCore('traffic')].filter(Boolean);
  const feed:any[]=[];
  const seen=new Set<string>();
  for(const row of [...emergency,...autoRows,...editorRows]){
    const key=String(row.source_id||row.id||'');
    if(!key||seen.has(key))continue;
    seen.add(key);feed.push(row);
    if(feed.length>=10)break;
  }
  return {
    ok:true, version:VERSION, items:feed, proposals:feed, home_config:homeConfig,
    meta:{
      total:feed.length, urgent:feed.filter((x:any)=>x.emergency).length,
      categories:[...new Set(feed.map((x:any)=>x.category))], configured_categories:['weather','traffic'],
      editor_mode:editorRows.length>0, editor_picked_total:editorRows.length,
      daily_core_weather:Boolean(latestCore('weather')), daily_core_traffic:Boolean(latestCore('traffic')),
      shopping_auto:false, fallback_used:false, settings_loaded:true,
    },
    generated_at:new Date().toISOString(),
  };
}


async function insertLifePost(payload: any) {
  const base:any = {
    type: 'life',
    subtype: payload.subtype || 'news',
    region: payload.region || 'dallas',
    title: String(payload.title || '').trim(),
    content: String(payload.content || '').trim(),
    is_active: true,
    created_at: new Date().toISOString(),
  };
  if (!base.title || !base.content) throw new Error('게시할 제목 또는 본문이 없습니다.');
  const variants = [
    { ...base, author_name: 'DalTownMap', external_url: null },
    { ...base, author_name: 'DalTownMap' },
    base,
  ];
  let last:any = null;
  for (const row of variants) {
    const { data, error } = await admin.from('posts').insert(row).select('id,title,created_at').single();
    if (!error) return data;
    last = error;
  }
  throw last || new Error('posts 테이블 저장에 실패했습니다.');
}

async function testPost(region='dallas') {
  const stamp = new Intl.DateTimeFormat('ko-KR', {
    timeZone: DALLAS_TZ, year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false,
  }).format(new Date());
  const title = `[테스트] 달라스 라이프 자동 게시 ${stamp}`;
  const content = `달타운맵 자동 게시 기능을 확인하기 위한 테스트 글입니다. 생성 시각: ${stamp} (Dallas 시간).`;
  const post = await insertLifePost({region,title,content,subtype:'test'});
  return {ok:true,version:VERSION,post};
}


const LIFE_ALLOWED_TOPICS = [
  { subtype:'life', label:'생활', re:/(생활|날씨|폭염|한파|도서관|공원|시청|카운티|공공서비스|쓰레기|정전|수도|재난|안전|community|weather|library|park|city service|utility|public service)/i },
  { subtype:'education', label:'교육', re:/(교육|학교|학군|학생|교사|등록|개학|휴교|장학금|대학|도서관 프로그램|ISD|school|education|student|teacher|college|university|scholarship)/i },
  { subtype:'health', label:'의료', re:/(의료|건강|병원|보건|예방접종|백신|독감|모기|웨스트나일|질병|clinic|hospital|health|medical|vaccine|flu|west nile|public health)/i },
  { subtype:'traffic', label:'교통', re:/(교통|도로|통제|공사|우회|버스|철도|공항|DART|TxDOT|traffic|road|closure|construction|transit|airport|highway)/i },
  { subtype:'finance', label:'세금·재정', re:/(세금|재정|재산세|소득세|판매세|IRS|금융|은행|금리|대출|지원금|tax|finance|financial|property tax|sales tax|interest rate|loan|grant)/i },
  { subtype:'realestate', label:'부동산', re:/(부동산|주택|렌트|임대|아파트|모기지|HOA|개발계획|주택시장|real estate|housing|rent|rental|mortgage|development|home price)/i },
];
function lifeTopicForItem(item:any){
  const keywordText = Array.isArray(item?.category_keywords) ? item.category_keywords.join(' ') : String(item?.category_keywords||'');
  const text = [item?.ai_title,item?.original_title,item?.ai_summary,item?.original_summary,keywordText,item?.source_name].filter(Boolean).join(' ');
  return LIFE_ALLOWED_TOPICS.find(x=>x.re.test(text)) || null;
}

async function publishOne(region='dallas', force=false) {
  const today = dateKeyInDallas();
  if (!force) {
    const start = new Date(`${today}T00:00:00-05:00`).toISOString();
    const { data: existing } = await admin.from('posts')
      .select('id,title,created_at')
      .eq('region', region).eq('type','life')
      .gte('created_at', start)
      .order('created_at',{ascending:false}).limit(20);
    const auto = (existing || []).find((x:any)=>!String(x.title||'').startsWith('[테스트]'));
    if (auto) return {ok:true,version:VERSION,skipped:true,reason:'already_published_today',post:auto};
  }

  const { data: rows, error } = await admin.from('newsroom_items')
    .select('*')
    .eq('region', region)
    .in('status',['review','classified'])
    .in('suggested_destination',['life','notice','guide'])
    .neq('fact_status','rejected')
    .order('priority_score',{ascending:false})
    .order('source_published_at',{ascending:false, nullsFirst:false})
    .limit(15);
  if (error) throw error;
  const candidate = (rows || []).find((x:any)=>{
    const title=String(x.ai_title||x.original_title||'');
    return title
      && !/범죄|살인|총격|정치|선거|소송|의료 조언|법률 조언|연예|스포츠 경기 결과/i.test(title)
      && Boolean(lifeTopicForItem(x));
  });
  if (!candidate) throw new Error('생활·교육·의료·교통·세금·재정·부동산 분야의 게시 가능한 후보가 없습니다. 먼저 “지금 다시 수집”과 “수집분 AI 분류”를 실행해 주세요.');

  let item:any = candidate;
  if (!String(item.ai_content||'').trim()) {
    await draft({id:item.id});
    const refreshed = await admin.from('newsroom_items').select('*').eq('id',item.id).single();
    if (refreshed.error) throw refreshed.error;
    item = refreshed.data;
  }
  const title = String(item.ai_title || item.original_title || '').trim();
  const summary = String(item.ai_summary || '').trim();
  const article = String(item.ai_content || '').trim();
  const content = [summary, article].filter(Boolean).join('\n\n');
  const topic = lifeTopicForItem(item);
  const post = await insertLifePost({region,title,content,subtype:topic?.subtype || 'life'});
  const meta = item.event_data && typeof item.event_data === 'object' ? item.event_data : {};
  await admin.from('newsroom_items').update({
    status:'published',
    event_data:{...meta,published_post_id:post.id,published_at:new Date().toISOString()},
    updated_at:new Date().toISOString(),
  }).eq('id',item.id);
  return {ok:true,version:VERSION,post,item_id:item.id,source_name:item.source_name||null,topic:topic?.label||'생활'};
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
    supported_actions: ['status', 'run_status', 'test_post', 'publish_one', 'cleanup', 'collect', 'analyze', 'draft', 'get_settings', 'save_settings', 'version', 'ping', 'home_feed', 'home_settings', 'list_scheduled_topics', 'save_scheduled_topic', 'delete_scheduled_topic', 'collect_scheduled_topics', 'auto_run', 'set_editor_pick', 'set_home_link', 'set_archive_keep', 'delete_newsroom_item', 'trace_sources', 'collect_markets'],
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
    if (action === 'test_post') return json(await testPost(region));
    if (action === 'publish_one') return json(await publishOne(region, body.force === true));
    if (action === 'cleanup') return json(await cleanup(region));
    if (action === 'collect') return json(await collect(region, Boolean((auth as any).cron || body.scheduled), String(body.lane || 'practical')));
    if (action === 'list_scheduled_topics') return json(await listScheduledTopics(region));
    if (action === 'save_scheduled_topic') return json(await saveScheduledTopic({...body,region}));
    if (action === 'delete_scheduled_topic') return json(await deleteScheduledTopic(body));
    if (action === 'collect_scheduled_topics') return json(await collectScheduledTopics(region));
    if (action === 'collect_markets') return json(await collectDirectMarkets(region));
    if (action === 'auto_run') return json(await autoRun(region));
    if (action === 'set_editor_pick') return json(await setEditorPick(body));
    if (action === 'set_home_link') return json(await setHomeLink(body));
    if (action === 'set_archive_keep') return json(await setArchiveKeep(body));
    if (action === 'delete_newsroom_item') return json(await deleteNewsroomItem(body));
    if (action === 'analyze') return json(await analyze(body));
    if (action === 'draft') return json(await draft(body));
    if (action === 'trace_sources') return json(await traceSources(body));
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
      supported_actions: ['status', 'run_status', 'test_post', 'publish_one', 'cleanup', 'collect', 'analyze', 'draft', 'get_settings', 'save_settings', 'version', 'ping', 'home_feed', 'home_settings', 'list_scheduled_topics', 'save_scheduled_topic', 'delete_scheduled_topic', 'collect_scheduled_topics', 'auto_run', 'set_editor_pick', 'set_home_link', 'set_archive_keep', 'delete_newsroom_item', 'trace_sources', 'collect_markets'],
    }, 400);
  } catch (e) {
    console.error(e);
    return json({ ok: false, version: VERSION, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
