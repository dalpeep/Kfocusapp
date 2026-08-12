const { json, rest, verifyAdmin } = require('./coupon-campaign-lib');

function cleanIds(value) {
  const input = Array.isArray(value) ? value : [value];
  return [...new Set(input.map(v => String(v || '').trim()).filter(Boolean))].slice(0, 300);
}

async function deleteOne(id) {
  const rows = await rest(`coupon_redemptions?id=eq.${encodeURIComponent(id)}&select=id`, {
    method: 'DELETE',
    headers: { Prefer: 'return=representation' }
  });
  return Array.isArray(rows) ? rows.map(r => String(r.id)) : [];
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true });
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'POST only' });

  try {
    await verifyAdmin(event);
    const body = JSON.parse(event.body || '{}');
    const action = String(body.action || '').trim();

    if (!['delete', 'delete_many'].includes(action)) {
      return json(400, { ok: false, error: '지원하지 않는 작업입니다.' });
    }

    const ids = cleanIds(action === 'delete' ? body.id : body.ids);
    if (!ids.length) return json(400, { ok: false, error: '삭제할 사용 내역 ID가 없습니다.' });

    const deletedIds = [];
    for (const id of ids) {
      const removed = await deleteOne(id);
      deletedIds.push(...removed);
    }

    // service role DELETE가 실제로 반영됐는지 서버에서 다시 확인한다.
    const remaining = [];
    for (const id of ids) {
      const rows = await rest(`coupon_redemptions?select=id&id=eq.${encodeURIComponent(id)}&limit=1`);
      if (Array.isArray(rows) && rows.length) remaining.push(id);
    }

    if (remaining.length) {
      return json(409, {
        ok: false,
        error: `${remaining.length}건이 데이터베이스에 남아 있어 삭제 완료로 처리하지 않았습니다.`,
        requested: ids.length,
        deleted: deletedIds.length,
        remaining_ids: remaining
      });
    }

    return json(200, {
      ok: true,
      requested: ids.length,
      deleted: ids.length,
      deleted_ids: ids
    });
  } catch (error) {
    console.error('[coupon-redemptions-admin]', error);
    return json(500, { ok: false, error: error?.message || String(error) });
  }
};
