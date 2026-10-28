const {loadTodayRows}=require('./lib/daily-core');

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

    const missing = ['weather','traffic'].filter(key => !loaded.byCategory.has(key));

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
        // 기존 공개 응답 필드는 유지하되, 조회 요청에서는 자동 생성/복구를 하지 않습니다.
        repaired: false,
        repair_error: undefined,
        missing,
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
