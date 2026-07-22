# DalTownMap v10.2.3 — 웹 검색 + Google Places 조건 일치 검색

## 변경 사항

- OpenAI Responses API의 `web_search` 도구로 공개 웹 검색 근거를 먼저 수집합니다.
- Google 검색 결과 URL을 참고 URL로 넣으면 `q` 검색어를 추출하여 웹 검색과 Places 검색에 반영합니다.
- 웹 검색에서 확인된 후보 이름을 Google Places에서 다시 조회해 실제 장소·주소·전화·웹사이트를 검증합니다.
- `한인`, `한국어`, `여의사`, `소아`, 특정 도시 등 제목의 핵심 제한 조건을 후보 선정 점수에 반영합니다.
- 같은 업종이지만 제한 조건이 확인되지 않은 장소는 우선순위에서 제외합니다.
- 공식 홈페이지는 상위 검증 후보 2~3개만 읽어 Netlify timeout을 줄였습니다.
- 사용된 웹 검색 출처와 장소 검증 결과를 관리자 품질 정보에 포함합니다.

## 환경변수

- `OPENAI_API_KEY`
- `GOOGLE_MAPS_API_KEY`
- 선택: `OPENAI_WEB_MODEL` (미설정 시 `OPENAI_MODEL`, 그마저 없으면 `gpt-4.1-mini`)

별도의 Google Custom Search API 키와 CX는 필요하지 않습니다.

## 참고

이 버전은 Google AI Overview 화면 자체를 복사하지 않습니다. 공개 웹 검색으로 후보와 근거를 찾고, Google Places 및 공식 웹사이트로 실제 장소 정보를 교차 검증합니다.
