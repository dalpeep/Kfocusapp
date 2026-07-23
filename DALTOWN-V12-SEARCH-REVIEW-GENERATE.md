# DalTownMap v12 — 검색·검토·기사작성 분리

## 변경된 흐름

1. 관리자에서 주제를 입력합니다.
2. `1. 검색 후보 찾기`를 누릅니다.
3. OpenAI Responses API의 `web_search`가 한국어·영어 검색을 수행합니다.
4. Google Places가 이름·주소·전화번호·공식 웹사이트를 검증합니다.
5. 관리자가 후보와 근거 URL을 확인하고 체크합니다.
6. `2. 선택 결과로 초안 만들기`를 누릅니다.
7. 선택된 검증 후보만 사용해 기사를 작성합니다.

검색과 기사 작성을 각각 별도 Netlify Function으로 분리하여 한 요청에서 모든 작업을 처리하던 기존 Inactivity Timeout 위험을 줄였습니다.

## Netlify 환경변수

- `OPENAI_API_KEY` 필수
- `GOOGLE_MAPS_API_KEY` 권장
- `OPENAI_SEARCH_MODEL` 선택
- `OPENAI_MODEL` 선택

## 새 Function

- `/.netlify/functions/search-guide`
- `/.netlify/functions/generate-guide`

## 안전장치

- 한인·한국어 조건을 일반 병원으로 대체하지 않음
- 요청 도시 밖 후보 제외
- 웹 근거가 없는 후보 제외
- Google Places 값이 없는 임의 주소·전화번호 생성 금지
- 555 예시 전화번호 생성 금지
