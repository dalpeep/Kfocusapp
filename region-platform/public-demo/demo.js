const query = new URLSearchParams(location.search);
const term = (query.get('q') ?? '').trim().slice(0, 100);
const category = query.get('category');
const board = query.get('board');
const matches = row => row.textContent.toLowerCase().includes(term.toLowerCase());

if (term) {
  document.querySelectorAll('input[name="q"]').forEach(input => { input.value = term; });
  const search = document.querySelector('#search');
  const results = document.createElement('div');
  results.className = 'search-results';
  for (const id of ['directory', 'coupons', 'community', 'events']) {
    const source = document.getElementById(id);
    if (!source) continue;
    const heading = document.createElement('h3');
    heading.textContent = source.getAttribute('aria-label');
    const list = document.createElement('ul');
    list.className = 'results';
    for (const row of source.querySelectorAll('.results > li')) {
      if (matches(row)) list.append(row.cloneNode(true));
    }
    if (!list.children.length) {
      const empty = document.createElement('li');
      empty.textContent = '검색 결과가 없습니다.';
      list.append(empty);
    }
    results.append(heading, list);
  }
  search?.append(results);
}

for (const [selector, filter] of [['#directory', category], ['#map', category], ['#community', board]]) {
  if (!term && !filter) continue;
  const section = document.querySelector(selector);
  const list = section?.querySelector('.results');
  if (!list) continue;
  for (const row of list.querySelectorAll('li')) {
    if (!matches(row) || (filter && row.dataset.category !== filter)) row.remove();
  }
  if (!list.children.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = '검색 결과가 없습니다.';
    list.replaceWith(empty);
  }
}

if (board) {
  document.querySelectorAll('.community-categories a').forEach(link => {
    if (new URL(link.href).searchParams.get('board') === board) link.setAttribute('aria-current', 'true');
    else link.removeAttribute('aria-current');
  });
}
