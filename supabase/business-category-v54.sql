-- DalTownMap V54: 지도 대분류 / 상세 업종 / 검색 키워드
alter table public.businesses add column if not exists map_category text;
alter table public.businesses add column if not exists subcategory text;
alter table public.businesses add column if not exists search_keywords text;

-- 기존 값에서 지도 대분류를 보정합니다. 기존 교회 분류는 종교로 전환합니다.
update public.businesses
set map_category = case
  when coalesce(category_ko,'') ~* '(식당|restaurant|bbq|치킨|분식|한식|중식|일식|카페|bakery|베이커리|cafe|coffee|디저트)' then '식당'
  when coalesce(category_ko,'') ~* '(쇼핑|마트|마켓|잡화|수산|의류|전자|store|market|shopping)' then '쇼핑'
  when coalesce(category_ko,'') ~* '(병원|치과|한의원|약국|의원|clinic|medical|doctor|dental|pharmacy)' then '병원'
  when coalesce(category_ko,'') ~* '(금융|은행|보험|회계|세무|finance|mortgage|loan|bank|investment|accounting|tax)' then '금융'
  when coalesce(category_ko,'') ~* '(법률|변호사|법무|이민|law|lawyer|attorney|legal)' then '법률'
  when coalesce(category_ko,'') ~* '(종교|교회|성당|사찰|절|church|catholic|mission|선교|temple)' then '종교'
  when coalesce(category_ko,'') ~* '(부동산|리얼터|렌트|매매|realtor|real estate|lease|rental|property)' then '부동산'
  else '서비스' end
where map_category is null or btrim(map_category) = '';

update public.businesses
set subcategory = category_ko
where (subcategory is null or btrim(subcategory) = '') and category_ko is not null;

create index if not exists businesses_map_category_idx on public.businesses(region, map_category);
