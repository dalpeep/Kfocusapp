import { registerRegion, setRegionModule, updateRegionPresentation, REGION_STATUS } from './region-config.mjs';

export function saveRegion(regions, slug, form) {
  const name = form.get('name');
  const parseNumber = key => form.get(key)?.trim() ? Number(form.get(key)) : NaN;
  const input = {
    slug, name, state: form.get('state'),
    center: { lat: parseNumber('lat'), lng: parseNumber('lng') },
    zoom: parseNumber('zoom')
  };
  const radiusKm = parseNumber('radiusKm');
  if (!Number.isFinite(radiusKm) || radiusKm < 1 || radiusKm > 200) throw Error('INVALID_RADIUS');
  if (slug === 'dallas') throw Error('RESERVED_REGION');
  const previous = regions.find(region => region.slug === slug);
  const editing = form.get('mode') === 'edit';
  if (editing && !previous) throw Error('UNKNOWN_REGION');
  const candidate = registerRegion(editing ? [] : regions, input).at(-1);
  candidate.map.radiusKm = radiusKm;
  candidate.status = form.has('public') ? REGION_STATUS.demo : REGION_STATUS.draft;
  if (previous) candidate.content = previous.content;
  let updated = updateRegionPresentation(candidate, {
    preset: form.get('preset'), primaryColor: form.get('primaryColor'),
    logoUrl: form.get('logoUrl') || null, layout: form.get('layout')
  });
  if (updated.theme.logoUrl) {
    const logo = new URL(updated.theme.logoUrl);
    if (logo.protocol !== 'https:' || logo.username || logo.password) throw Error('INVALID_LOGO');
  }
  for (const key of Object.keys(updated.modules)) {
    updated = setRegionModule(updated, key, form.has(key));
  }
  return [...regions.filter(region => region.slug !== slug), updated];
}
