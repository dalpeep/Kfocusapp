DalTownMap V54 업종 대분류/상세분류 개편

지도 대분류 8개:
식당, 쇼핑, 병원, 금융, 법률, 종교, 서비스, 부동산

주요 변경:
- 교회 대분류를 종교로 확대
- 서비스 상세 업종에 건강, 건강기기, 안마의자 추가
- 지도는 map_category로 분류
- 업소 목록/상세는 subcategory를 우선 표시
- search_keywords를 검색에 포함
- 기존 category_ko 데이터는 자동 호환

배포 순서:
1. Supabase SQL Editor에서 supabase/business-category-v54.sql 실행
2. ZIP 전체를 Netlify에 배포
3. 관리자 페이지 강력 새로고침(Ctrl+Shift+R)

예시:
세라젬: 지도 대분류=서비스, 상세 업종=건강 또는 건강기기
파리바게뜨: 지도 대분류=식당, 상세 업종=카페·베이커리
교회: 지도 대분류=종교, 상세 업종=교회
