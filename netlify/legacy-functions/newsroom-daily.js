/*
 * DalTownMap newsroom daily pipeline
 * cleanup old unpublished -> collect -> analyze/classify -> draft -> review
 * IMPORTANT: this function NEVER publishes articles automatically.
 */

const jsonHeaders = { 'Content-Type': 'application/json; charset=utf-8' };

function clampInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); }
  catch { return { raw: text }; }
}

async function supabase(path, options = {}) {
  const base = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = String(
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    ''
  ).trim();

  if (!base || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  const response = await fetch(`${base}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  const body = await readJson(response);
  if (!response.ok) {
    throw new Error(body?.message || body?.error || body?.raw || `Supabase HTTP ${response.status}`);
  }
  return body;
}

function siteBase(event) {
  const envUrl = String(
    process.env.URL ||
    process.env.DEPLOY_PRIME_URL ||
    process.env.SITE_URL ||
    ''
  ).replace(/\/$/, '');
  if (envUrl) return envUrl;

  const host = event?.headers?.host || event?.headers?.Host;
  if (host) return `https://${host}`;
  throw new Error('Netlify site URL을 확인할 수 없습니다. URL 또는 SITE_URL 환경변수가 필요합니다.');
}

async function callFunction(base, name, payload) {
  const response = await fetch(`${base}/.netlify/functions/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {})
  });
  const body = await readJson(response);
  if (!response.ok || body?.ok === false) {
    throw new Error(body?.error || body?.message || body?.raw || `${name} HTTP ${response.status}`);
  }
  return body;
}

async function runCollect(region) {
  const supabaseUrl = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const cronSecret = String(process.env.NEWSROOM_CRON_SECRET || '').trim();
  const functionName = process.env.NEWSROOM_FUNCTION_NAME || 'newsroom';

  if (!supabaseUrl || !cronSecret) {
    throw new Error('Missing SUPABASE_URL or NEWSROOM_CRON_SECRET');
  }

  const response = await fetch(
    `${supabaseUrl}/functions/v1/${encodeURIComponent(functionName)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-secret': cronSecret
      },
      body: JSON.stringify({
        action: 'collect',
        region,
        scheduled: true
      })
    }
  );

  const body = await readJson(response);
  if (!response.ok || body?.ok === false) {
    throw new Error(body?.error || body?.message || body?.raw || `collect HTTP ${response.status}`);
  }
  return body;
}


async function cleanupOldUnpublished(region, days = 7) {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();

  // 게시되지 않은 뉴스룸 작업만 조회합니다.
  const params = new URLSearchParams({
    select: 'id,status,source_published_at,collected_at,created_at,updated_at',
    region: `eq.${region}`,
    order: 'updated_at.asc.nullslast',
    limit: '1000'
  });

  const rows = await supabase(`newsroom_items?${params.toString()}`);
  const unpublishedStatuses = new Set([
    'collected',
    'classified',
    'draft',
    'review',
    'pending',
    'queued'
  ]);

  const expiredIds = (Array.isArray(rows) ? rows : [])
    .filter(row => unpublishedStatuses.has(String(row.status || '').toLowerCase()))
    .filter(row => {
      const basis =
        row.source_published_at ||
        row.collected_at ||
        row.created_at ||
        row.updated_at ||
        '';
      const ts = Date.parse(basis);
      return Number.isFinite(ts) && ts < Date.parse(cutoff);
    })
    .map(row => String(row.id))
    .filter(Boolean);

  if (!expiredIds.length) {
    return {
      cutoff,
      days,
      matched: 0,
      deleted: 0,
      ids: []
    };
  }

  let deleted = 0;
  const deletedIds = [];

  // URL 길이와 PostgREST in() 제한을 피하기 위해 100개씩 삭제합니다.
  for (let i = 0; i < expiredIds.length; i += 100) {
    const chunk = expiredIds.slice(i, i + 100);
    const encoded = chunk.map(id => `"${id.replace(/"/g, '\\"')}"`).join(',');

    const result = await supabase(
      `newsroom_items?id=in.(${encodeURIComponent(encoded)})`,
      {
        method: 'DELETE',
        headers: { Prefer: 'return=representation' }
      }
    );

    const rowsDeleted = Array.isArray(result) ? result : [];
    deleted += rowsDeleted.length;
    deletedIds.push(...rowsDeleted.map(row => String(row.id)).filter(Boolean));
  }

  return {
    cutoff,
    days,
    matched: expiredIds.length,
    deleted,
    ids: deletedIds
  };
}

async function classifiedForDraft(region, limit) {
  const params = new URLSearchParams({
    select: 'id,ai_title,original_title,updated_at,collected_at',
    region: `eq.${region}`,
    status: 'eq.classified',
    order: 'updated_at.asc.nullslast,collected_at.asc.nullslast',
    limit: String(limit)
  });
  const rows = await supabase(`newsroom_items?${params.toString()}`);
  return Array.isArray(rows) ? rows : [];
}

exports.handler = async function(event) {
  const startedAt = new Date().toISOString();
  const region = String(
    event?.queryStringParameters?.region ||
    process.env.NEWSROOM_DAILY_REGION ||
    'dallas'
  ).toLowerCase();

  const retentionDays = clampInt(process.env.NEWSROOM_RETENTION_DAYS, 7, 1, 90);
  // analyze-newsroom.js itself caps this at 20.
  const analyzeLimit = clampInt(process.env.NEWSROOM_DAILY_ANALYZE_LIMIT, 20, 1, 20);
  // Draft calls are one article per request, so keep this conservative for scheduled runtime.
  const draftLimit = clampInt(process.env.NEWSROOM_DAILY_DRAFT_LIMIT, 6, 1, 12);

  const report = {
    ok: false,
    region,
    started_at: startedAt,
    cleanup: null,
    collect: null,
    analyze: null,
    draft: { requested: 0, completed: 0, failed: 0, items: [] },
    publish: { attempted: false, reason: '자동 게시 비활성화 — review 상태에서 관리자 검토 필요' }
  };

  try {
    // 0) Delete unpublished newsroom candidates older than the retention window.
    // Published content is never included in this cleanup.
    report.cleanup = await cleanupOldUnpublished(region, retentionDays);

    // 1) Collect new source records.
    report.collect = await runCollect(region);

    // 2) Classify/analyze collected records. This moves valid rows to status=classified.
    const base = siteBase(event);
    report.analyze = await callFunction(base, 'analyze-newsroom', {
      region,
      limit: analyzeLimit,
      scheduled: true
    });

    // 3) Generate drafts only for classified items. Each successful draft becomes status=review.
    const draftRows = await classifiedForDraft(region, draftLimit);
    report.draft.requested = draftRows.length;

    for (const row of draftRows) {
      try {
        const result = await callFunction(base, 'draft-newsroom', {
          id: row.id,
          scheduled: true
        });
        report.draft.completed += 1;
        report.draft.items.push({
          id: row.id,
          title: row.ai_title || row.original_title || '',
          ok: true,
          result
        });
      } catch (error) {
        report.draft.failed += 1;
        report.draft.items.push({
          id: row.id,
          title: row.ai_title || row.original_title || '',
          ok: false,
          error: error?.message || String(error)
        });
        // One bad source must not stop the remaining drafts.
        console.warn('[newsroom-daily] draft failed', row.id, error?.message || error);
      }
    }

    report.ok = true;
    report.finished_at = new Date().toISOString();

    console.info('[newsroom-daily] pipeline completed', {
      region,
      cleanup_deleted: report.cleanup?.deleted || 0,
      analyzed: report.analyze?.analyzed || 0,
      excluded: report.analyze?.excluded || 0,
      drafted: report.draft.completed,
      draft_failed: report.draft.failed,
      auto_publish: false
    });

    return {
      statusCode: 200,
      headers: jsonHeaders,
      body: JSON.stringify(report)
    };
  } catch (error) {
    report.error = error?.message || String(error);
    report.finished_at = new Date().toISOString();
    console.error('[newsroom-daily] pipeline failed', error);
    return {
      statusCode: 500,
      headers: jsonHeaders,
      body: JSON.stringify(report)
    };
  }
};

// 06:00 Dallas during CDT. Existing schedule preserved.
exports.config = { schedule: '0 11 * * *' };
