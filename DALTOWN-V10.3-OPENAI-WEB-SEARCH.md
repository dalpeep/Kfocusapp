# DalTownMap v10.3 OpenAI Web Search

AI 가이드 생성 구조를 Google Places 선검색 방식에서 OpenAI Responses API의 실시간 web_search 우선 방식으로 변경했습니다.

## 검색 순서
1. 주제의 한국어·영어 웹 검색
2. 한인·한국어·지역명 등 필수 조건 보존
3. 웹 검색에서 실제 후보와 출처 URL 수집
4. 장소형 주제는 Google Places에서 동일 장소와 요청 도시를 교차검증
5. 공식 홈페이지와 사용자 참고 URL 읽기
6. 검증된 근거만으로 기사 생성 및 자체 검수

## 환경변수
- OPENAI_API_KEY
- OPENAI_MODEL 또는 OPENAI_SEARCH_MODEL (선택)
- GOOGLE_MAPS_API_KEY (장소형 기사 검증용)

별도의 Google Search API Key나 CX는 필요하지 않습니다.

웹 검색 도구를 지원하지 않는 OpenAI 모델/계정이면 임의로 Places 결과를 대신 사용하지 않고 설정 오류를 표시합니다.
