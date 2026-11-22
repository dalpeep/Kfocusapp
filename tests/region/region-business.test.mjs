import assert from 'node:assert/strict';
import { test } from 'node:test';
import { manageBusinesses, publicBusinesses, businessCategories } from '../../region-platform/qa-business.mjs';
import { saveRegion } from '../../region-platform/qa-settings.mjs';

test('approval, visibility and ownership requests stay in their selected region', () => {
  let regions = ['Houston', 'Austin'].reduce((items, name) => saveRegion(items, '', new URLSearchParams({ name })), []);
  const directory = slug => regions.find(region => region.slug === slug);
  const write = (slug, form) => { regions = manageBusinesses(regions, slug, new URLSearchParams(form)); };
  const data = {
    name: 'Sample Houston', category: '식당', address: 'QA address', contact: '555-0100',
    lat: '29.7604', lng: '-95.3698', image: 'https://example.com/image.png'
  };

  for (const slug of ['houston', 'austin']) assert.deepEqual(publicBusinesses(directory(slug)), []);
  write('houston', { ...data, action: 'create' });
  const id = directory('houston').businessQa.records[0].id;
  assert.throws(() => write('austin', { ...data, id, action: 'edit' }), /NOT_FOUND/);
  assert.throws(() => write('austin', { id, action: 'approve' }), /NOT_FOUND/);
  assert.throws(() => write('houston', { id, action: 'publish' }), /APPROVAL_REQUIRED/);
  write('houston', { id, action: 'approve' });
  write('houston', { id, action: 'publish' });
  assert.equal(publicBusinesses(directory('houston'))[0].name, data.name);
  assert.equal(publicBusinesses(directory('houston'))[0].image, data.image);
  assert.deepEqual(publicBusinesses(directory('austin')), []);
  write('houston', { ...data, name: 'Revised Houston', id, action: 'edit' });
  assert.equal(publicBusinesses(directory('houston'))[0].name, data.name);
  write('houston', { id, action: 'approve' });
  assert.equal(publicBusinesses(directory('houston'))[0].name, 'Revised Houston');

  write('houston', { id, action: 'claim', reference: 'fictional-owner' });
  const [claim] = directory('houston').businessQa.records[0].claims;
  write('houston', { id, action: 'claim-approve', claimId: claim.id });
  assert.equal(directory('houston').businessQa.records[0].claims[0].status, 'approved');
  assert.equal(publicBusinesses(directory('houston'))[0].claims, undefined);
  write('houston', { id, action: 'hide' });
  assert.deepEqual(publicBusinesses(directory('houston')), []);

  write('austin', { action: 'category-add', category: 'QA category' });
  assert.ok(businessCategories(directory('austin')).includes('QA category'));
  assert.ok(!businessCategories(directory('houston')).includes('QA category'));
  assert.throws(() => write('houston', { action: 'category-remove', category: '식당' }), /CATEGORY_IN_USE/);
  assert.throws(() => write('austin', { ...data, action: 'create', image: 'javascript:alert(1)' }), /INVALID_IMAGE/);
  write('austin', { ...data, name: 'Sample Austin', action: 'create' });
  const austinId = directory('austin').businessQa.records[0].id;
  write('austin', { ...data, name: 'Revised Austin', id: austinId, action: 'edit' });
  write('austin', { id: austinId, action: 'approve' });
  assert.equal(directory('austin').businessQa.records[0].approved.name, 'Revised Austin');
  regions = saveRegion(regions, 'houston', new URLSearchParams({ name: 'Houston', mode: 'edit' }));
  assert.equal(directory('houston').businessQa.records[0].approved.name, 'Revised Houston');
});
