/**
 * Region-platform foundation (design-only, no runtime integration).
 * All region records are configuration, never copies of Dallas business data.
 */
export const REGION_STATUS = Object.freeze({
  draft: 'draft',
  demo: 'demo',
  live: 'live',
  disabled: 'disabled'
});

const DEFAULT_MODULES = Object.freeze({
  directory: true,
  promotions: true,
  deals: true,
  guide: true,
  map: true,
  community: true,
  coupons: true,
  events: true,
  jobs: true,
  ownerPortal: true,
  localAds: true,
  reservations: false
});

const SLUG_RE = /^[a-z][a-z0-9-]{1,62}$/;
const OWN = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const copy = value => JSON.parse(JSON.stringify(value));

export function createRegion({name, slug, state = '', center, zoom = 11} = {}) {
  if (typeof name !== 'string' || !name.trim() || name.length > 120) throw Error('INVALID_REGION_NAME');
  if (typeof slug !== 'string' || !SLUG_RE.test(slug) || slug.endsWith('-')) throw Error('INVALID_REGION_SLUG');
  if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng) ||
      Math.abs(center.lat) > 90 || Math.abs(center.lng) > 180) throw Error('INVALID_MAP_CENTER');
  if (!Number.isInteger(zoom) || zoom < 3 || zoom > 18) throw Error('INVALID_MAP_ZOOM');
  return {
    id: slug,
    slug,
    name: name.trim(),
    state: typeof state === 'string' ? state.trim() : '',
    status: REGION_STATUS.draft,
    map: {center: {lat: center.lat, lng: center.lng}, zoom},
    theme: {preset: 'daltown-default', logoUrl: null, primaryColor: null},
    home: {layout: 'default', sections: []},
    modules: {...DEFAULT_MODULES},
    // New regions must have NO copied Dallas listings or user content.
    content: {businesses: [], posts: [], coupons: [], events: [], ads: []}
  };
}

export function setRegionModule(region, module, enabled) {
  if (!OWN(DEFAULT_MODULES, module)) throw Error('UNKNOWN_REGION_MODULE');
  if (typeof enabled !== 'boolean') throw Error('INVALID_MODULE_VALUE');
  if (region.status === REGION_STATUS.live && module === 'directory' && !enabled &&
      region.modules.coupons) throw Error('MODULE_DEPENDENCY_CONFLICT');
  const updated = copy(region);
  updated.modules[module] = enabled;
  return updated;
}

export function updateRegionPresentation(region, {preset, logoUrl, primaryColor, layout, sections} = {}) {
  const updated = copy(region);
  if (preset !== undefined) {
    if (typeof preset !== 'string' || !/^[a-z0-9-]{2,48}$/.test(preset)) throw Error('INVALID_THEME');
    updated.theme.preset = preset;
  }
  if (logoUrl !== undefined) {
    if (logoUrl !== null && (typeof logoUrl !== 'string' || !/^https:\/\//.test(logoUrl))) throw Error('INVALID_LOGO');
    updated.theme.logoUrl = logoUrl;
  }
  if (primaryColor !== undefined) {
    if (primaryColor !== null && (typeof primaryColor !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(primaryColor))) throw Error('INVALID_COLOR');
    updated.theme.primaryColor = primaryColor;
  }
  if (layout !== undefined) {
    if (!['default', 'map', 'community', 'directory'].includes(layout)) throw Error('INVALID_LAYOUT');
    updated.home.layout = layout;
  }
  if (sections !== undefined) {
    if (!Array.isArray(sections) || sections.length > 25 ||
        sections.some(s => !['map', 'directory', 'community', 'coupons', 'events', 'localAds'].includes(s))) throw Error('INVALID_SECTIONS');
    updated.home.sections = [...sections];
  }
  return updated;
}

export function resolveRegion(regions, slug) {
  if (!Array.isArray(regions)) throw Error('INVALID_REGION_LIST');
  const match = regions.find(region => region.slug === slug);
  return match && match.status !== REGION_STATUS.disabled ? copy(match) : null;
}

export function registerRegion(regions, input) {
  if (!Array.isArray(regions)) throw Error('INVALID_REGION_LIST');
  const candidate = createRegion(input);
  if (regions.some(region => region.slug === candidate.slug)) throw Error('REGION_ALREADY_EXISTS');
  return [...copy(regions), candidate];
}
