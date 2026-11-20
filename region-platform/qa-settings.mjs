import { registerRegion, setRegionModule, updateRegionPresentation, REGION_STATUS } from './region-config.mjs';

const cities = {
  houston: ['휴스턴', 'Texas', 29.7604, -95.3698, ['houston', '휴스턴', '휴스턴맵']],
  austin: ['오스틴', 'Texas', 30.2672, -97.7431, ['austin', '오스틴', '오스틴맵']],
  'los-angeles': ['로스앤젤레스', 'California', 34.0522, -118.2437, ['los angeles', 'la', '로스앤젤레스', '엘에이']]
};

const coloradoAreas = {
  colorado: { label: '콜로라도 전체', aliases: ['colorado', '콜로라도', '콜로라도맵'], name: '콜로라도',
    subregion: '', center: { lat: 39.0, lng: -105.5 }, zoom: 5, radiusKm: 450 },
  denver: { label: 'Colorado · Denver', aliases: ['denver', '덴버', '덴버맵'], name: '덴버',
    subregion: 'Denver', center: { lat: 39.7392, lng: -104.9903 }, zoom: 11, radiusKm: 35 },
  aurora: { label: 'Colorado · Aurora', aliases: ['aurora', '오로라', '오로라맵'], name: '오로라',
    subregion: 'Aurora', center: { lat: 39.7294, lng: -104.8319 }, zoom: 11, radiusKm: 35 }
};

export const areaOptions = {
  '': '이름에서 자동 설정',
  custom: '직접 설정',
  ...Object.fromEntries(Object.entries(coloradoAreas).map(([key, area]) => [key, area.label]))
};

function coloradoAreaFor(name) {
  return Object.keys(coloradoAreas).find(key => coloradoAreas[key].aliases.includes(name.toLowerCase()));
}
export const menuKeys = ['directory', 'coupons', 'map', 'guide', 'promotions', 'deals', 'community', 'events', 'jobs', 'ownerPortal', 'localAds', 'reservations'];

function cityFor(name) {
  return Object.entries(cities).find(([, city]) => city[4].includes(name.toLowerCase()));
}

export function regionBrand(name) {
  const label = coloradoAreas[coloradoAreaFor(name)]?.name || cityFor(name)?.[1][0] || name;
  return label.endsWith('맵') ? label : label + '맵';
}

function imageUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (value.length <= 1024 && url.protocol === 'https:' && !url.username && !url.password) return url.href;
  } catch {
    // Invalid URL syntax uses the same form error as an unsupported scheme.
  }
  throw Error('INVALID_IMAGE_URL');
}

export function saveRegion(regions, slug, form) {
  const name = (form.get('name') || '').trim();
  if (!name || name.length > 120) throw Error('INVALID_REGION_NAME');
  const [knownSlug, city] = cityFor(name) || [];
  const requestedArea = form.get('areaPreset');
  if (requestedArea && !Object.hasOwn(areaOptions, requestedArea)) throw Error('INVALID_AREA_PRESET');
  const inferredArea = coloradoAreaFor(name);
  const asciiSlug = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 58).replace(/-$/, '');
  const utf8Slug = Array.from(name).slice(0, 9).map(character => character.codePointAt(0).toString(36)).join('-');
  const editing = form.get('mode') === 'edit';
  const normalizedName = name.toLowerCase().replace(/[^a-z가-힣]/g, '');
  if (['dallas', 'daltownmap', '달라스', '달라스맵', '달타운맵'].includes(normalizedName)) throw Error('RESERVED_REGION');
  slug = slug || inferredArea || knownSlug || (/^[a-z][a-z0-9-]+$/.test(asciiSlug) ? asciiSlug : 'city-' + utf8Slug);
  if (slug === 'dallas') throw Error('RESERVED_REGION');
  const previous = regions.find(region => region.slug === slug);
  if (editing && !previous) throw Error('UNKNOWN_REGION');
  const selection = requestedArea ?? previous?.geography?.preset ?? '';
  const areaKey = selection === 'custom' ? null : selection || inferredArea;
  const area = coloradoAreas[areaKey];
  const subregion = (form.get('subregion') ?? previous?.geography?.subregion ?? '').trim() || area?.subregion || '';
  if (subregion.length > 120) throw Error('INVALID_SUBREGION');
  const parseNumber = (key, fallback) => form.get(key)?.trim() ? Number(form.get(key)) : fallback;
  const state = (form.get('state') ?? previous?.state ?? '').trim() || (area ? 'Colorado' : '') || city?.[1] || '';
  if (state.length > 120) throw Error('INVALID_STATE');
  const input = {
    slug, name, state,
    center: {
      lat: parseNumber('lat', previous?.map.center.lat ?? area?.center.lat ?? city?.[2] ?? 39.5),
      lng: parseNumber('lng', previous?.map.center.lng ?? area?.center.lng ?? city?.[3] ?? -98.35)
    },
    zoom: parseNumber('zoom', previous?.map.zoom ?? area?.zoom ?? (city ? 11 : 4))
  };
  const radiusKm = parseNumber('radiusKm', previous?.map.radiusKm ?? area?.radiusKm ?? 35);
  if (!Number.isFinite(radiusKm) || radiusKm < 1 || radiusKm > 500) throw Error('INVALID_RADIUS');
  const candidate = registerRegion(editing ? [] : regions, input).at(-1);
  candidate.map.radiusKm = radiusKm;
  if (area || selection === 'custom' || subregion) {
    candidate.geography = { preset: areaKey ?? 'custom', subregion };
  }
  candidate.status = form.has('public') ? REGION_STATUS.demo : REGION_STATUS.draft;
  if (previous) {
    candidate.content = previous.content;
    if (previous.businessQa) candidate.businessQa = previous.businessQa;
  }
  let updated = updateRegionPresentation(candidate, {
    preset: form.get('preset') || 'daltown-default',
    primaryColor: form.get('primaryColor') || null,
    logoUrl: imageUrl(form.get('logoUrl')),
    layout: form.get('layout') || 'default'
  });
  const order = (form.get('menuOrder') || '').split(',').map(key => key.trim()).filter(Boolean);
  if (new Set(order).size !== order.length || order.some(key => !menuKeys.includes(key))) throw Error('INVALID_MENU_ORDER');
  const title = (form.get('bannerTitle') || '').trim();
  const message = (form.get('bannerText') || '').trim();
  if (title.length > 60 || message.length > 140) throw Error('INVALID_BANNER_TEXT');
  updated.home = {
    ...updated.home, menuOrder: order,
    banner: { title, message, image: imageUrl(form.get('bannerImage')) }
  };
  if (form.has('moduleForm')) {
    for (const key of Object.keys(updated.modules)) updated = setRegionModule(updated, key, form.has(key));
  }
  return [...regions.filter(region => region.slug !== slug), updated];
}
