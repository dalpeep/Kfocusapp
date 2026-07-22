# DalTownMap v10.2.1 Stable

## AI 달라스 가이드 안정화

- Google Places 검색 4회 순차 호출을 최대 3회 병렬 호출로 변경
- 장소 결과 최대 10곳으로 제한
- 공식 홈페이지 읽기 최대 3곳, 사용자 참고 URL이 있으면 1곳으로 제한
- URL 읽기 제한시간 4~5초 적용
- OpenAI 호출 3회에서 2회로 축소
- 기사 작성과 팩트체크를 한 번의 최종 호출로 통합
- 관리자 화면에 4단계 진행 상태 표시
- Netlify HTML Inactivity Timeout 응답을 사용자 친화적 오류로 변환
- 확인되지 않은 병원명, 주소, 전화번호 생성 금지 규칙 유지

## 필요한 환경변수

- OPENAI_API_KEY
- GOOGLE_MAPS_API_KEY

GOOGLE_SEARCH_API_KEY와 GOOGLE_SEARCH_CX는 필요하지 않습니다.
