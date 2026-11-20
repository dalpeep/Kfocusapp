import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRegion } from '../../region-platform/region-config.mjs';
import { demoPage } from '../../region-platform/qa-app.mjs';

test('community icon selection preserves category filtering and reset', () => {
  const region = createRegion({ name: 'Test region', slug: 'test-region', center: { lat: 0, lng: 0 } });
  region.content.posts.push(
    { category: '행사안내', title: 'QA event entry' },
    { category: '생활정보·질문', title: 'QA question entry' }
  );
  const filtered = demoPage(region, false, new URLSearchParams({ board: '행사안내' }));
  assert.match(filtered, /QA event entry/);
  assert.doesNotMatch(filtered, /QA question entry/);
  const reset = demoPage(region, false, new URLSearchParams());
  assert.match(reset, /QA event entry/);
  assert.match(reset, /QA question entry/);
});
