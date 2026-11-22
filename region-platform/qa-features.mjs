export const featureGroups = {
  '업소': {directory:'업소 목록',ownerPortal:'업주 메뉴',registration:'신규 등록',claims:'소유권 신청',editing:'정보 수정',photos:'사진·갤러리',approvals:'관리자 승인'},
  '혜택 및 탐색': {coupons:'쿠폰 목록',promotions:'프로모션 목록',deals:'할인 목록',events:'이벤트 목록',localAds:'광고',banner:'배너',map:'지도',guide:'가이드',search:'검색',jobs:'구인·구직 메뉴'},
  '커뮤니티': {community:'커뮤니티',boardEvents:'행사안내',boardLife:'지역 라이프',boardAds:'업체홍보',boardJobs:'구인·구직',boardMarket:'사고팔기',boardRealty:'부동산',boardHelp:'생활정보·질문'}
};
export const boardFeatures = {
  '행사안내':'boardEvents','지역 라이프':'boardLife','업체홍보':'boardAds','구인·구직':'boardJobs',
  '사고팔기':'boardMarket','부동산':'boardRealty','생활정보·질문':'boardHelp'
};
export const unavailable = ['추천·신규·인기 정렬','예약','글쓰기','댓글','승인 알림','지역 관리자 지정·해제'];
export const featureKeys = Object.keys(Object.assign({}, ...Object.values(featureGroups)));
const newDefaults = ['registration','claims','editing','photos','approvals','banner','search', ...Object.values(boardFeatures)];
export function enabled(region, key) {
  return region.featureOverrides?.[key] ?? region.featureDefaults?.[key] ??
    region.modules?.[key] ?? (newDefaults.includes(key) || ['guide','promotions','deals'].includes(key));
}
export function actionEnabled(region, action) {
  const features = {
    create:['registration'], edit:['editing'], image:['editing','photos'], claim:['claims'],
    approve:['approvals'], reject:['approvals'], 'claim-approve':['approvals','claims'],
    'claim-reject':['approvals','claims'], publish:['approvals','directory'], hide:['approvals'],
    'category-add':['directory'], 'category-remove':['directory']
  };
  return Object.hasOwn(features,action) && features[action].every(key=>enabled(region,key));
}
export function allowsQuery(region, query) {
  const board = query.get('board');
  return (!query.has('q') || enabled(region,'search')) &&
    (!(query.has('category') || query.has('business')) || enabled(region,'directory')) &&
    (!query.has('board') || (enabled(region,'community') && (!Object.hasOwn(boardFeatures,board) || enabled(region,boardFeatures[board]))));
}
