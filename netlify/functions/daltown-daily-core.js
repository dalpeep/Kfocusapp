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
    const base = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
    const serviceKey = String(
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_KEY ||
      ''
    ).trim();

    if (!base || !serviceKey) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          ok: false,
          error: 'SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다.'
        })
      };
    }

    const region = String(event.queryStringParameters?.region || 'dallas').toLowerCase();

    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Chicago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());

    const select = [
      'id','ai_title','ai_summary','original_title','original_summary',
      'original_url','source_name','duplicate_key','event_data','status',
      'source_published_at','collected_at','created_at','updated_at','region'
    ].join(',');

    const params = new URLSearchParams({
      select,
      region: `eq.${region}`,
      order: 'updated_at.desc',
      limit: '100'
    });

    const response = await fetch(`${base}/rest/v1/newsroom_items?${params.toString()}`, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Accept: 'application/json'
      }
    });

    const rows = await response.json().catch(() => []);

    if (!response.ok) {
      throw new Error(
        rows?.message || rows?.error || `Supabase HTTP ${response.status}`
      );
    }

    const byCategory = new Map();

    for (const row of Array.isArray(rows) ? rows : []) {
      let meta = {};
      if (row?.event_data && typeof row.event_data === 'object') {
        meta = row.event_data;
      } else if (typeof row?.event_data === 'string' && row.event_data.trim()) {
        try { meta = JSON.parse(row.event_data); } catch (_) {}
      }

      const duplicateKey = String(row.duplicate_key || '').trim().toLowerCase();
      const probe = [
        String(meta.category || meta.home_category || ''),
        duplicateKey,
        String(row.ai_title || ''),
        String(row.original_title || ''),
        String(row.source_name || '')
      ].join(' ').toLowerCase();

      let category = '';
      if (/daily-core-weather|\bweather\b|national weather service|\bnws\b|날씨|기상/.test(probe)) {
        category = 'weather';
      } else if (/daily-core-traffic|tra+f+ic|511dfw|txdot|traffic|교통|도로/.test(probe)) {
        category = 'traffic';
      }

      if (!category) continue;

      const rowDate = String(
        row.updated_at || row.collected_at || row.created_at || row.source_published_at || ''
      ).slice(0, 10);

      const dateMatch = duplicateKey.includes(`-${today}`) || rowDate === today;
      if (!dateMatch) continue;
      if (String(row.status || 'active').toLowerCase() === 'inactive') continue;
      if (byCategory.has(category)) continue;

      byCategory.set(category, {
        id: `server-core-${row.id}-${category}`,
        source_id: String(row.id),
        category,
        category_label: category === 'weather' ? '날씨' : '교통',
        icon: category === 'weather' ? '☀️' : '🚗',
        title: String(
          row.ai_title || row.original_title ||
          (category === 'weather' ? '오늘의 날씨' : 'DFW 교통 정보')
        ).trim(),
        summary: String(
          row.ai_summary || row.original_summary || meta.summary || ''
        ).trim(),
        subtitle: String(
          row.ai_summary || row.original_summary || meta.summary || ''
        ).trim(),
        source_name: String(row.source_name || '').trim(),
        source_url: String(row.original_url || '').trim(),
        url: String(row.original_url || '').trim(),
        duplicate_key: duplicateKey,
        event_data: meta,
        published_at: row.source_published_at || row.collected_at || row.created_at,
        updated_at: row.updated_at || row.collected_at || row.created_at,
        daily_core: true,
        server_core: true
      });
    }

    const items = ['weather', 'traffic']
      .map(key => byCategory.get(key))
      .filter(Boolean);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        date: today,
        region,
        count: items.length,
        categories: items.map(x => x.category),
        items
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        ok: false,
        error: error?.message || String(error)
      })
    };
  }
};
