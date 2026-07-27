DalTownMap V50.0 - 오늘의 달라스 메인

핵심 변경
1. 메인 자동 노출은 매일 달라스 날씨, DFW 교통, 쇼핑·마트 세일로 제한합니다.
2. 날씨는 National Weather Service API를 이용해 매일 새 내부 브리핑을 만듭니다.
3. 교통은 511DFW와 TxDOT Dallas를 우선 확인하고, 필요할 때 DFW 로컬 방송을 보조 참고해 하루 1건의 내부 브리핑을 만듭니다.
4. 행사·교육·부동산·금융·일반 뉴스 등은 관리자가 '관리자 지정'한 경우에만 메인에 추가합니다.
5. 외부 링크는 메인에서 사용하지 않습니다. 링크가 필요한 경우 관리자 지정 내부 게시판 또는 업소만 연결합니다.
6. 날씨·교통 데이터 수집에 실패해도 메인에는 각각 안전한 기본 안내가 생성됩니다.

배포
- Supabase Edge Function newsroom을 다시 배포해야 합니다.
- 전체 사이트를 Netlify에 배포합니다.
- NEWSROOM_OPENAI_MODEL 및 OPENAI_API_KEY가 Edge Function Secrets에 있어야 교통 브리핑의 웹 검색이 작동합니다.

주의
- NWS와 511DFW/TxDOT 정보는 운영 중 외부 서비스 응답 상태에 따라 지연될 수 있습니다.
- 실제 Supabase/Netlify 운영 환경 통합 테스트는 배포 후 확인해야 합니다.
