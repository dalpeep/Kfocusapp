# DalTownMap v10.2 — Google Places + 공식 URL 팩트체크

## 변경 사항
- Google Custom Search API 의존성 제거
- `GOOGLE_SEARCH_API_KEY`, `GOOGLE_SEARCH_CX` 불필요
- 병원·학교·업소 등 장소형 콘텐츠는 Google Maps/Places에서 실제 장소 확인
- 장소의 이름, 주소, 전화번호, 웹사이트, Google 지도 링크, 영업 상태를 근거로 사용
- 확인된 공식 웹사이트 본문을 추가로 읽어 기사 근거 강화
- 사용자가 입력한 참고 URL 본문을 실제로 읽고 최우선 반영
- 근거 없는 이름·주소·전화번호·후기·순위 생성 금지
- 장소형이 아닌 일반 정보 글은 공식 참고 URL이 없으면 생성을 중단하여 환각 방지

## 필요한 Netlify 환경변수
- `OPENAI_API_KEY`
- `GOOGLE_MAPS_API_KEY`

## 더 이상 필요 없는 환경변수
- `GOOGLE_SEARCH_API_KEY`
- `GOOGLE_SEARCH_CX`

## 중요
Google Places는 일반 웹 검색이 아닙니다. 병원, 학교, 식당, 변호사 사무실 등 실제 장소 확인에 사용합니다. 법률·제도·학군 특징 같은 일반 정보 글은 공식기관 또는 신뢰할 수 있는 참고 URL을 입력해야 합니다.
