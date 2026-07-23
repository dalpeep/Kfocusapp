# DalTownMap v11 AI Search & Re-ranking

## 변경 사항
- OpenAI Responses API 웹 검색 도구를 실제 사용
- 한국어·영어 검색어 8~12개 자동 생성
- 한인/한국어, 여의사, 소아과, 내과 등 필수 조건을 코드에서 별도 추출해 검색 전 과정에 고정
- 실시간 웹검색 후보를 먼저 수집하고 필수조건 근거가 없는 후보 제거
- 요청 도시와 다른 지역의 후보 제거
- 웹검색 후보 이름을 Google Places에서 재확인
- 검증 후보만 기사 작성에 사용
- 일반 병원을 한인 병원으로 대체하지 않음

## 환경변수
- OPENAI_API_KEY
- GOOGLE_MAPS_API_KEY
- OPENAI_MODEL (선택)
- OPENAI_SEARCH_MODEL (선택)

검색 도구를 지원하지 않는 OpenAI 계정/모델이면 오류를 표시하며 Google Places 일반 검색으로 몰래 대체하지 않습니다.
