import { randomUUID } from 'node:crypto';

export const defaultCategories = ['식당', '카페', '마트', '병원', '교회', '생활 서비스'];
export const businessCategories = region => region.businessQa?.categories ?? defaultCategories;
export const publicBusinesses = region => (region.businessQa?.records ?? [])
  .filter(record => record.visible && record.approved).map(record => ({ ...record.approved, id: record.id }));

function text(form, key, limit, required = false) {
  const value = (form.get(key) ?? '').trim();
  if (value.length > limit || (required && !value)) throw Error('INVALID_' + key.toUpperCase());
  return value;
}

function businessFields(form, categories) {
  const category = text(form, 'category', 40, true);
  if (!categories.includes(category)) throw Error('UNKNOWN_CATEGORY');
  const lat = Number(text(form, 'lat', 20, true));
  const lng = Number(text(form, 'lng', 20, true));
  if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lng) || Math.abs(lng) > 180) throw Error('INVALID_COORDINATES');
  const image = text(form, 'image', 1024);
  if (image) {
    let url;
    try { url = new URL(image); } catch { throw Error('INVALID_IMAGE'); }
    if (!url || url.protocol !== 'https:' || url.username || url.password) throw Error('INVALID_IMAGE');
  }
  return { name: text(form, 'name', 120, true), category, lat, lng, image,
    address: text(form, 'address', 240, true), contact: text(form, 'contact', 80) };
}

export function manageBusinesses(regions, slug, form) {
  const index = regions.findIndex(region => region.slug === slug && region.status !== 'disabled');
  if (index < 0) throw Error('NOT_FOUND');
  const region = regions[index];
  const state = structuredClone(region.businessQa ?? { categories: defaultCategories, records: [] });
  const action = form.get('action');
  const id = form.get('id');
  if (action === 'category-add' || action === 'category-remove') {
    const name = text(form, 'category', 40, true);
    if (action === 'category-add') {
      if (state.categories.includes(name) || state.categories.length >= 50) throw Error('CATEGORY_UNAVAILABLE');
      state.categories.push(name);
    } else {
      if (state.records.some(record => record.approved?.category === name || record.pending?.category === name)) throw Error('CATEGORY_IN_USE');
      state.categories = state.categories.filter(category => category !== name);
    }
  } else if (action === 'create') {
    if (state.records.length >= 100) throw Error('QA_LIMIT');
    const pending = businessFields(form, state.categories);
    state.records.push({ id: randomUUID(), visible: false, approved: null, pending, claims: [] });
  } else {
    const record = state.records.find(item => item.id === id);
    if (!record) throw Error('NOT_FOUND');
    switch (action) {
      case 'edit':
        record.pending = businessFields(form, state.categories);
        break;
      case 'approve':
        if (!record.pending) throw Error('NO_PENDING_CHANGE');
        record.approved = record.pending;
        record.pending = null;
        break;
      case 'reject':
        if (!record.pending) throw Error('NO_PENDING_CHANGE');
        if (!record.approved) state.records = state.records.filter(item => item !== record);
        else record.pending = null;
        break;
      case 'publish':
      case 'hide':
        if (!record.approved) throw Error('APPROVAL_REQUIRED');
        record.visible = action === 'publish';
        break;
      case 'claim':
        if (!record.approved) throw Error('APPROVAL_REQUIRED');
        if (record.claims.length >= 20) throw Error('QA_LIMIT');
        record.claims.push({ id: randomUUID(), reference: text(form, 'reference', 80, true), status: 'pending' });
        break;
      case 'claim-approve':
      case 'claim-reject': {
        const claim = record.claims.find(item => item.id === form.get('claimId') && item.status === 'pending');
        if (!claim) throw Error('NOT_FOUND');
        claim.status = action === 'claim-approve' ? 'approved' : 'rejected';
        break;
      }
      default:
        throw Error('INVALID_ACTION');
    }
  }
  return regions.map((item, position) => position === index ? { ...item, businessQa: state } : item);
}

