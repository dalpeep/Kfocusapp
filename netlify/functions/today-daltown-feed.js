function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true });
  try {
    const base = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
    const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
    if (!base || !key) throw new Error('Supabase 환경변수가 없습니다.');
    const region = String(event.queryStringParameters?.region || process.env.APP_REGION || 'dallas').trim().toLowerCase();
    const params = new URLSearchParams({
      select: 'id,ai_title,ai_summary,original_title,original_summary,event_data,priority_score,source_published_at,collected_at,updated_at,region',
      region: `eq.${region}`,
      order: 'updated_at.desc',
      limit: '100',
    });
    const res = await fetch(`${base}/rest/v1/newsroom_items?${params.toString()}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    const raw = await res.text();
    if (!res.ok) throw new Error(raw || `Supabase ${res.status}`);
    const rows = raw ? JSON.parse(raw) : [];
    const inferCategory = (row, meta) => {
      const explicit = String(meta.home_category || meta.category || '').trim();
      if (['business', 'shopping', 'event'].includes(explicit)) return explicit;
      const text = `${row.ai_title || ''} ${row.original_title || ''} ${row.ai_summary || ''} ${row.original_summary || ''}`;
      if (/market|shopping|zion|h\s*mart|마트|마켓|세일|할인|장보기/i.test(text)) return 'shopping';
      if (/event|festival|concert|seminar|행사|공연|축제|세미나|박람회|모임/i.test(text)) return 'event';
      return '';
    };
    const normalized = rows.map((row) => {
      const meta = row.event_data && typeof row.event_data === 'object' ? row.event_data : {};
      const category = inferCategory(row, meta);
      if (!category) return null;
      const pinned = meta.home_show === true || String(meta.selection_source || '') === 'editor';
      return { row, meta, category, pinned };
    }).filter(Boolean);
    // V111: every administrator-pinned market/event item must become its own home slide.
    // Only when a category has no pinned item do we fall back to its newest candidate.
    const chooseCategory = (category) => {
      const pinnedRows = normalized.filter((x) => x.category === category && x.pinned);
      if (pinnedRows.length) return pinnedRows;
      const latest = normalized.find((x) => x.category === category);
      return latest ? [latest] : [];
    };
    const selectedRows = [
      ...chooseCategory('shopping'),
      ...chooseCategory('event'),
      ...normalized.filter((x) => x.category === 'business' && x.pinned),
    ]
      .filter(Boolean)
      .filter((x, i, arr) => arr.findIndex((y) => String(y.row.id) === String(x.row.id)) === i);
    const items = selectedRows.map(({ row, meta, category, pinned }) => {
      const targetType = ['business', 'post', 'external'].includes(String(meta.home_target_type || ''))
        ? String(meta.home_target_type)
        : '';
      const externalUrl = targetType === 'external' ? String(meta.home_external_url || '').trim() : '';
      const targetId = String(meta.home_target_id || '').trim();
      return {
        id: `netlify-${row.id}-${category}`,
        source_id: String(row.id),
        category,
        title: String(meta.home_custom_title || row.ai_title || row.original_title || '오늘의 달타운').trim(),
        summary: String(meta.home_custom_message || row.ai_summary || row.original_summary || '').trim(),
        subtitle: String(meta.home_custom_message || meta.subtitle || '').trim(),
        target_type: targetType === 'external' && externalUrl ? 'external' : (targetType && targetId ? targetType : ''),
        target_id: targetType !== 'external' && targetType && targetId ? targetId : '',
        url: targetType === 'external' && externalUrl ? externalUrl : '',
        link_label: ((targetType === 'external' && externalUrl) || (targetType && targetId)) ? String(meta.home_link_label || '자세히 보기') : '',
        selected_by_admin: pinned,
        admin_selected: pinned,
        is_manual: pinned,
        is_pinned: pinned,
        auto_selected: !pinned && ['shopping', 'event'].includes(category),
        priority: Number(row.priority_score || (pinned ? 999 : 0)),
        published_at: row.source_published_at || row.collected_at,
        updated_at: row.updated_at || row.collected_at || row.source_published_at,
      };
    });
    return json(200, { ok: true, items, count: items.length, source: 'netlify-service-feed-v111' });
  } catch (error) {
    return json(500, { ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};
