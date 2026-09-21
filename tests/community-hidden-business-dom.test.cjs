const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'app-v99.js'), 'utf8');
const businessRenderer = source.match(/function renderBusinessList\(\) \{[\s\S]*?\r?\n\}\r?\nfunction formatBusinessHours/);
const navigation = source.match(/function showPage\(page, opts=\{\}\)\{[\s\S]*?\n\}\nglobalThis\.DtmNavigatePage=showPage/);
assert.ok(businessRenderer && navigation, 'business rendering and navigation functions exist');

function harness() {
  const list = { innerHTML: '', replaceChildren() { this.innerHTML = ''; this.cleared++; }, cleared: 0 };
  const rows = Array.from({ length: 1508 }, (_, n) => ({ id: n + 1, name: `Business ${n + 1}` }));
  const context = {
    businesses: rows,
    businessSearch: null,
    businessQuickFilter: '',
    currentPage: 'community',
    document: { getElementById: id => id === 'businessList' ? list : null },
    renderBusinessThemeSpot() {},
    sortBusinessesByDistance: items => items,
    isPremiumBusiness: () => false,
    nearbyBusinessItemHTML: row => `<article data-id="${row.id}"></article>`,
    setMapPageMode() {},
    getPageOrder: () => ['home', 'business', 'community'],
    animatePageTransition() {},
    $$: () => [],
    updateBottomNavMode() {},
    setRoute() {},
    closeSideMenu() {},
    window: { scrollTo() {} },
  };
  vm.createContext(context);
  vm.runInContext(businessRenderer[0].replace(/\r?\nfunction formatBusinessHours$/, ''), context);
  vm.runInContext(navigation[0], context);
  return { context, list, rows };
}

test('Community does not retain 1,508 hidden business cards', () => {
  const { context, list } = harness();
  context.renderBusinessList();
  assert.equal(list.innerHTML, '');
});

test('business page still renders every loaded business and releases hidden cards on exit', () => {
  const { context, list, rows } = harness();
  context.showPage('business');
  assert.equal((list.innerHTML.match(/<article /g) || []).length, rows.length);
  context.showPage('community');
  assert.equal(list.innerHTML, '');
  assert.equal(list.cleared, 1);
  context.showPage('business');
  assert.equal((list.innerHTML.match(/<article /g) || []).length, rows.length);
});
