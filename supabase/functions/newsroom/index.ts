import { createClient } from 'npm:@supabase/supabase-js@2';

const VERSION = '40.0.1';
const DALLAS_TZ = 'America/Chicago';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' },
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

async function openai(payload: any, timeoutMs = 110000) {
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
    if (e instanceof DOMException && e.name === 'AbortError') throw new Error('정보 검색이 110초 안에 완료되지 않았습니다. 잠시 후 해당 분야만 다시 실행해 주세요.');
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

const LANE_PROMPTS: Record<string, string> = {
  korean: `한인 생활 소식을 우선 수집합니다. KTN News, 주간포커스 달라스, 미주중앙일보 달라스, 달사람, 달라스 한인회, 주휴스턴총영사관 달라스 관련 공지, 한국학교·한인 문화단체·한인 커뮤니티의 최근 소식을 폭넓게 찾으세요. 큰 뉴스뿐 아니라 행사, 모집, 교육, 건강강좌, 새 업소, 커뮤니티 안내도 생활 가치가 있으면 포함합니다.`,
  finance: `은행·금융·세금·소상공인 정보를 수집합니다. Bank of Hope, Hanmi Bank, Open Bank, PCB Bank, CBB Bank, Chase, Bank of America, Wells Fargo, Capital One, SBA, IRS, Texas Comptroller의 공식 최신 자료를 우선합니다. CD·예금·계좌 프로모션·모기지·SBA·세금 일정·송금·소상공인 지원처럼 한인 생활에 실제 도움이 될 항목을 찾으세요.`,
  shopping: `마트·쇼핑·업소·생활경제 정보를 수집합니다. H Mart, Zion Market, Komart와 달라스 지역 한인 업소의 공식 세일, 오픈, 프로모션, 계절 행사 및 생활비 절약 정보를 찾으세요. 종료일이나 행사일이 확인되는 정보만 포함하고 단순 상시 광고는 제외합니다.`,
  events: `향후 30일 안의 달라스-포트워스 가족 행사, 공연, 축제, 박물관, 도서관, 공원, 학교, 스포츠 일정, 캠프와 커뮤니티 이벤트를 찾으세요. 게시일이 어제여도 행사가 오늘 이후라면 포함합니다.`,
  practical: `오늘 생활에 영향을 주는 날씨, 교통, 도로 통제, 공항, 학교, 도시 서비스, 공공안전, 건강 및 지역기관 정보를 찾으세요. 같은 폭염·예보·도로 공지의 반복은 대표 항목 하나만 남기고, 일반 날씨 예보보다 경보·폐쇄·일정 변경처럼 행동에 도움이 되는 정보를 우선합니다.`,
};

async function collect(region = 'dallas', scheduled = false, lane = 'practical') {
  const normalizedLane = LANE_PROMPTS[lane] ? lane : 'practical';
  const triggerType = scheduled ? 'scheduled' : 'manual';
  const run = await startRun(region, triggerType, `lane:${normalizedLane}`);
  try {
    if (scheduled) {
      const { data: setting } = await admin.from('newsroom_settings').select('auto_enabled').eq('region', region).maybeSingle();
      if (setting && setting.auto_enabled === false) {
        await finishRun(run?.id, { status: 'success', found: 0, inserted: 0, skipped: 0, cleaned: 0, note: `lane:${normalizedLane}; auto disabled` });
        return { ok: true, version: VERSION, lane: normalizedLane, disabled: true, found: 0, inserted: 0, skipped: 0, cleaned: 0 };
      }
    }

    const now = new Date();
    const today = dateKeyInDallas(now);
    const prompt = `${LANE_PROMPTS[normalizedLane]}\n현재 달라스 날짜는 ${today}, 현재 UTC 시각은 ${now.toISOString()}입니다.\n수집 원칙:\n- 뉴스 여부보다 달라스 한인 생활에 도움이 될 가능성을 우선합니다.\n- 일반 뉴스·날씨·공지의 source_published_at은 반드시 오늘(${today})이어야 합니다.\n- 단, 향후 행사·세일·모집은 게시일이 이전이어도 event_start_at 또는 expires_at이 오늘 이후면 허용합니다.\n- 같은 사건이나 같은 날씨 내용은 한 건만 반환합니다.\n- 최대 8건만 반환하고 정확한 원문 URL을 사용합니다.\n- 확인되지 않은 SNS 글과 검색 결과 요약 URL은 제외합니다.\nReturn ONLY JSON {"items":[{"original_title":"","original_summary":"1-3 factual sentences","original_url":"https://...","source_name":"","source_kind":"official|korean_media|media|business","source_published_at":"ISO or null","area":"Dallas-Fort Worth","event_start_at":"ISO or null","event_end_at":"ISO or null","expires_at":"ISO or null","topic_key":"short duplicate grouping key"}]}`;

    const result = await openai({
      model: env('NEWSROOM_OPENAI_MODEL') || 'gpt-5-mini',
      tools: [{ type: 'web_search' }],
      input: prompt,
    });
    const items = Array.isArray(result.items) ? result.items.slice(0, 8) : [];

    const { data: existing, error: e } = await admin.from('newsroom_items')
      .select('original_url,original_title,source_published_at,event_data')
      .eq('region', region).limit(1500);
    if (e) throw e;
    const seenUrls = new Set((existing || []).map((x: any) => slug(x.original_url)));
    const seenTitles = new Set((existing || []).map((x: any) => titleKey(x.original_title)));
    const rows: any[] = [];
    let skipped = 0;

    for (const x of items) {
      if (!x?.original_url || !x?.original_title) { skipped++; continue; }
      const key = slug(x.original_url);
      const tKey = titleKey(x.original_title);
      if (!key || seenUrls.has(key) || (tKey && seenTitles.has(tKey))) { skipped++; continue; }

      const eventData = {
        start_at: x.event_start_at || null,
        end_at: x.event_end_at || x.expires_at || null,
      };
      const futureEvent = isFutureOrCurrentEvent({ event_data: eventData }, today);
      const published = parseDateKey(x.source_published_at);
      if (published && published < today && !futureEvent) { skipped++; continue; }
      if (eventData.end_at && parseDateKey(eventData.end_at) < today) { skipped++; continue; }

      seenUrls.add(key);
      if (tKey) seenTitles.add(tKey);
      const kind = ['official', 'korean_media', 'media', 'business'].includes(x.source_kind) ? x.source_kind : 'official';
      rows.push({
        region,
        original_title: String(x.original_title).slice(0, 500),
        original_summary: x.original_summary || null,
        original_url: x.original_url,
        source_name: x.source_name || null,
        source_kind: kind,
        source_published_at: x.source_published_at || null,
        area: x.area || 'Dallas-Fort Worth',
        status: 'collected', confidence: 0, fact_status: 'needs_review',
        duplicate_key: key,
        category_keywords: [],
        event_data: eventData,
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
    await finishRun(run?.id, {
      status: 'success', found: items.length, inserted: insertedCount, skipped, cleaned: 0,
      note: `lane:${normalizedLane}`,
    });
    return { ok: true, version: VERSION, lane: normalizedLane, found: items.length, inserted: insertedCount, skipped, cleaned: 0 };
  } catch (e) {
    await finishRun(run?.id, { status: 'failed', error_message: e instanceof Error ? e.message : String(e), note: `lane:${normalizedLane}` });
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
  else q = q.eq('region', String(body.region || 'dallas').toLowerCase()).eq('status', 'collected').order('collected_at', { ascending: false }).limit(Math.min(20, Number(body.limit) || 10));
  const { data: rows, error } = await q;
  if (error) throw error;
  let analyzed = 0, excluded = 0;
  for (const item of rows || []) {
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
  }
  return { ok: true, version: VERSION, analyzed, excluded };
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
    supported_actions: ['status', 'run_status', 'cleanup', 'collect', 'analyze', 'draft', 'get_settings', 'save_settings', 'version', 'ping'],
    message: ok ? `newsroom Edge Function V${VERSION}이 정상 연결되어 있습니다.` : 'SQL 테이블, Edge Function Secrets 또는 함수 배포 상태를 확인하세요.',
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const auth = await authorize(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');
    const region = String(body.region || 'dallas').toLowerCase();

    if (action === 'ping' || action === 'version') return json({ ok: true, version: VERSION, action });
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
      const { data, error } = await admin.from('newsroom_settings').upsert({
        region, auto_enabled: Boolean(body.auto_enabled), updated_at: new Date().toISOString(),
      }, { onConflict: 'region' }).select().single();
      if (error) throw error;
      return json({ ok: true, version: VERSION, settings: data });
    }
    return json({
      ok: false, version: VERSION,
      error: `지원하지 않는 뉴스룸 작업입니다: ${action || '(빈 요청)'}`,
      supported_actions: ['status', 'run_status', 'cleanup', 'collect', 'analyze', 'draft', 'get_settings', 'save_settings', 'version', 'ping'],
    }, 400);
  } catch (e) {
    console.error(e);
    return json({ ok: false, version: VERSION, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
