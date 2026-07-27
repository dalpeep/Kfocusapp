DalTownMap V53 — 생활정보 수집 단순화

변경 내용
1. AI 운영센터의 복잡한 '수집·추천 편성 설정' 영역 삭제
   - 카테고리별 JSON 링크
   - 추천 업체 자동 모드
   - 광고·고정 업체 선택
   - 커뮤니티 한 줄 편성 입력
2. 날씨·교통 당일 갱신 오류 수정
   - 기존 당일 카드 갱신 시 category/icon 변수가 선언되기 전에 사용되던 오류 수정
3. 마켓 전용 직접 수집 추가
   - Zion Market Texas/Lewisville 이벤트 페이지
   - H Mart 온라인 Sale 페이지
   - 자동 실행(auto_run)에 포함
   - 새 action: collect_markets
4. 동일 마켓 페이지는 내용 지문(fingerprint)이 바뀐 경우에만 다시 검토 후보로 갱신
5. 관리자 기사 편집 화면의 삭제된 가이드 선택 요소 접근 오류 방지

중요
- H Mart 제공 URL은 온라인 세일 페이지입니다. Carrollton/Plano 매장 주간 전단 가격으로 단정하지 않고 '온라인 세일'로 표시합니다.
- Zion Market은 Texas/Lewisville 문구가 확인될 때만 후보로 저장합니다.
- 마켓 정보는 자동으로 메인에 게시되지 않습니다. AI 운영센터에서 검토 후 '오늘의 달타운 메인 노출'을 선택해야 합니다.

배포
1. ZIP 전체를 Netlify에 배포
2. supabase/functions/newsroom/index.ts를 Supabase newsroom Edge Function에 재배포
3. 관리자에서 '지금 다시 수집' 실행

별도 파일은 필요하지 않습니다. 이 ZIP에는 웹앱과 최신 newsroom 함수가 모두 포함되어 있습니다.
