import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { demoPage } from '../qa-app.mjs';
import { saveRegion } from '../qa-settings.mjs';

const outputPath = process.argv[2];
if (!outputPath) throw new Error('Pass an empty directory for the public demo output.');
const output = pathToFileURL(resolve(outputPath) + sep);
await mkdir(output);

const [region] = saveRegion([], null, new URLSearchParams({name:'콜로라도'}));
region.nameEn = 'Colorado';
region.home.banner = {
  title:'콜로라도 생활·한인 업소록',
  message:'업소, 지역 소식, 쿠폰과 이벤트를 둘러보세요.'
};
region.modules.ownerPortal = false;
region.modules.localAds = false;
region.businessQa = {
  categories:['식당','카페','생활 서비스'],
  records:[
    ['sample-cafe','콜로라도 카페 (예시)','카페',39.7392,-104.9903],
    ['sample-restaurant','산마루 식당 (예시)','식당',39.7294,-104.8319],
    ['sample-services','콜로라도 생활 서비스 (예시)','생활 서비스',39.7144,-104.956]
  ].map(([id,name,category,lat,lng])=>({id,visible:true,approved:{name,category,lat,lng,address:'Colorado 지도 예시 위치'}}))
};
region.content.posts = [
  {title:'콜로라도 주말 모임 소개 (예시)',category:'행사안내'},
  {title:'새로 이사 온 이웃을 위한 생활 팁 (예시)',category:'지역 라이프'}
];
region.content.coupons = [{title:'카페 음료 할인 쿠폰 (예시)'}];
region.content.events = [{title:'Colorado 한인 커뮤니티 모임 (예시)'}];
region.content.promotions = [{title:'봄맞이 동네 업소 소개 (예시)'}];
region.content.deals = [{title:'점심 할인 안내 (예시)'}];
region.content.guides = [{title:'콜로라도 생활 가이드 (예시)'}];

const render = query => demoPage(region, false, query, {staticDemo:true});
await writeFile(new URL('index.html', output), render(new URLSearchParams()));
await mkdir(new URL('business/', output));
for (const {id} of region.businessQa.records) {
  const folder = new URL('business/' + id + '/', output);
  await mkdir(folder);
  await writeFile(new URL('index.html', folder), render(new URLSearchParams({business:id})));
}
await copyFile(new URL('./demo.js', import.meta.url), new URL('demo.js', output));
await copyFile(new URL('../../assets/kfocus-icon.png', import.meta.url), new URL('logo.png', output));
await writeFile(new URL('_headers', output), `/*
  Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self'; frame-src https://www.openstreetmap.org; form-action 'self'; frame-ancestors 'none'; base-uri 'none'
  Referrer-Policy: no-referrer
  X-Content-Type-Options: nosniff
  X-Robots-Tag: noindex, nofollow
`);
