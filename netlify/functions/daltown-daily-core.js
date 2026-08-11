const {loadTodayRows,ensureDailyCore}=require('./lib/daily-core');

exports.handler = async function(event) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Access-Control-Allow-Origin': '*'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  }

  try {
    const region = String(event.queryStringParameters?.region || 'dallas').toLowerCase();
    let loaded = await loadTodayRows(region);

    // P135: 오늘 weather/traffic 중 하나라도 없으면 Daily Core 생성기를 한 번 실행해 자동 복구합니다.
    const missing = ['weather','traffic'].filter(key => !loaded.byCategory.has(key));
    let repaired = false;
    let repairError = '';
    if (missing.length) {
      try {
        await ensureDailyCore(region, { force:false });
        loaded = await loadTodayRows(region);
        repaired = true;
      } catch (error) {
        repairError = error?.message || String(error);
        console.warn('[P135 daily core auto-repair]', repairError);
      }
    }

    const items = ['weather', 'traffic'].map(category => {
      const row = loaded.byCategory.get(category);
      if (!row) return null;
      let meta = {};
      if (row?.event_data && typeof row.event_data === 'object') meta = row.event_data;
      else if (typeof row?.event_data === 'string' && row.event_data.trim()) { try { meta = JSON.parse(row.event_data); } catch (_) {} }
      const duplicateKey = String(row.duplicate_key || '').trim().toLowerCase();
      return {
        id: `server-core-${row.id}-${category}`,
        source_id: String(row.id),
        category,
        category_label: category === 'weather' ? '날씨' : '교통',
        icon: category === 'weather' ? '☀️' : '🚗',
        title: String(row.ai_title || row.original_title || (category === 'weather' ? '오늘의 날씨' : 'DFW 교통 정보')).trim(),
        summary: String(row.ai_summary || row.original_summary || meta.summary || '').trim(),
        subtitle: String(row.ai_summary || row.original_summary || meta.summary || '').trim(),
        source_name: String(row.source_name || '').trim(),
        source_url: String(row.original_url || '').trim(),
        url: String(row.original_url || '').trim(),
        duplicate_key: duplicateKey,
        event_data: meta,
        published_at: row.source_published_at || row.collected_at || row.created_at,
        updated_at: row.updated_at || row.collected_at || row.created_at,
        daily_core: true,
        server_core: true
      };
    }).filter(Boolean);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        date: loaded.today,
        region,
        count: items.length,
        categories: items.map(x => x.category),
        repaired,
        repair_error: repairError || undefined,
        items
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ ok: false, error: error?.message || String(error) })
    };
  }
};
