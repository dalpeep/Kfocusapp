import assert from 'node:assert/strict';
import { test } from 'node:test';
import { saveRegion, regionBrand } from '../../region-platform/qa-settings.mjs';
import { publicBusinesses } from '../../region-platform/qa-business.mjs';

test('Colorado can be the statewide QA region with no launch city or imported records', () => {
  const [region] = saveRegion([], '', new URLSearchParams({ name: '콜로라도' }));
  assert.equal(region.slug, 'colorado');
  assert.equal(region.state, 'Colorado');
  assert.equal(region.status, 'draft');
  assert.equal(regionBrand(region.name), '콜로라도맵');
  assert.deepEqual(region.geography, { preset: 'colorado', subregion: '' });
  assert.deepEqual(region.map, { center: { lat: 39, lng: -105.5 }, zoom: 5, radiusKm: 450 });
  assert.ok(Object.values(region.content).every(items => items.length === 0));
  assert.deepEqual(publicBusinesses(region), []);
});

test('Colorado subregions are independent and allow an editable display name', () => {
  const initial = saveRegion([], '', new URLSearchParams({ name: 'Denver' }));
  const [denver, aurora] = saveRegion(initial, '', new URLSearchParams({
    name: 'Aurora Neighborhood', areaPreset: 'aurora'
  }));
  assert.equal(denver.geography.subregion, 'Denver');
  assert.equal(aurora.geography.subregion, 'Aurora');
  assert.notDeepEqual(denver.map.center, aurora.map.center);
  assert.equal(aurora.state, 'Colorado');
  assert.equal(aurora.status, 'draft');
  const [unchanged, updated] = saveRegion([denver, aurora], aurora.slug, new URLSearchParams({
    mode: 'edit', name: '오로라 한인 생활', subregion: 'Central Aurora', radiusKm: '45'
  }));
  assert.deepEqual(unchanged, denver);
  assert.equal(updated.slug, aurora.slug);
  assert.equal(updated.state, 'Colorado');
  assert.equal(updated.geography.subregion, 'Central Aurora');
  assert.equal(updated.map.radiusKm, 45);
  assert.throws(() => saveRegion([], '', new URLSearchParams({ name: 'Other', areaPreset: 'constructor' })), /INVALID_AREA_PRESET/);
});

test('existing city defaults and unselected custom regions remain supported', () => {
  const records = ['Houston', 'Austin', 'Other'].reduce((regions, name) =>
    saveRegion(regions, '', new URLSearchParams({ name })), []);
  assert.deepEqual(records.map(region => [region.slug, region.map.radiusKm]), [['houston', 35], ['austin', 35], ['other', 35]]);
  assert.ok(records.every(region => !region.geography && region.status === 'draft'));
});
