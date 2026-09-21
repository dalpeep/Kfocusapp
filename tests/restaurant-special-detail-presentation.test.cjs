const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const path=require('path');
const source=fs.readFileSync(path.join(__dirname,'../app-v99.js'),'utf8');

test('detail uses structured rows and legacy price only when no items exist',()=>{
  assert.match(source,/function restaurantSpecialMenuRowsHTML/);
  assert.match(source,/if\(!all\.length\)return row\.price_text\?/);
  assert.match(source,/restaurantSpecialMenuRowsHTML\(row,\{detail:true\}\)/);
  const detail=source.slice(source.indexOf('function restaurantSpecialDetailArticleHTML'),source.indexOf('function restaurantSpecialCardHTML'));
  assert.doesNotMatch(detail,/\[row\.price_text,row\.description\]\.filter/);
});
test('detail removes generic availability status and renders optional media and description',()=>{
  const detail=source.slice(source.indexOf('function restaurantSpecialDetailArticleHTML'),source.indexOf('function restaurantSpecialCardHTML'));
  assert.doesNotMatch(detail,/statusLabel|이용 가능 일정 확인/);
  assert.match(detail,/row\.image_url\?/);
  assert.match(detail,/description\?`<p class="restaurant-special-description"/);
});
test('lunch and happy hour share one generic independent-block renderer',()=>{
  assert.match(source,/bizSpecials\.map\(restaurantSpecialDetailArticleHTML\)/);
  assert.match(source,/data-special-kind="\$\{esc\(kind\)\}"/);
  assert.match(source,/restaurant-special-type\[data-special-kind="lunch_special"\]\{background:#ef2b2d;color:#fff/);
});
test('schedule is readable and consecutive weekdays are compressed without changing authority',()=>{
  assert.match(source,/return `\$\{names\[days\[0\]\]\} - \$\{names\[days\.at\(-1\)\]\}`/);
  assert.match(source,/formatTime\(row\.start_time\)\} - \$\{globalThis\.DtmRestaurantSpecials\.formatTime\(row\.end_time\)/);
  assert.match(source,/DtmRestaurantSpecials\.forBusiness\(businessSpecials,b\.id\)/);
});
test('discount cards sort before rendering and show at most three structured items',()=>{
  assert.match(source,/restaurantSpecialMenuRowsHTML\(row,\{limit:3\}\)/);
  assert.match(source,/DtmRestaurantSpecials\.sort\(globalThis\.DtmRestaurantSpecials\.filter/);
});
test('mobile styles protect long names, prices and images',()=>{
  assert.match(source,/\.special-menu-row\{display:flex!important;[\s\S]*min-width:0\}/);
  assert.match(source,/\.special-menu-name\{[\s\S]*overflow-wrap:anywhere\}/);
  assert.match(source,/\.special-menu-price\{[\s\S]*white-space:nowrap\}/);
  assert.match(source,/#detailCard \.restaurant-special-detail \.restaurant-special-detail-image\{display:block;width:100%;max-width:100%;height:auto;max-height:none;aspect-ratio:auto;object-fit:contain;object-position:center/);
});
test('detail image fit is isolated from the cropped list thumbnail contract',()=>{
  assert.match(source,/\.restaurant-special-card>img\{width:88px;height:88px;object-fit:cover/);
  assert.match(source,/#detailCard \.restaurant-special-detail \.restaurant-special-detail-image\{[^}]*height:auto;[^}]*object-fit:contain/);
  assert.doesNotMatch(source,/#detailCard \.restaurant-special-detail \.restaurant-special-detail-image\{[^}]*(?:height:\d+px|object-fit:cover|aspect-ratio:16)/);
});
