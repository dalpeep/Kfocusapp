# DalTownMap AI Guide v14 Upgrade

## 수정 파일
- `admin/assets/admin.js`
- `netlify/functions/search-guide.js`
- `netlify/functions/generate-guide.js` (현재 업로드본 포함, 기능 유지)

## 핵심 변경
1. `escapeHtml is not defined` 오류 수정
   - 프로젝트에 이미 존재하는 `esc()` 함수로 통일했습니다.
2. 한인·한국어 조건 유지 강화
   - 한국어/영어/동의어/한인 업소록 검색을 함께 수행하도록 프롬프트를 강화했습니다.
3. 도시 필터 완화 및 점수화
   - 검색 단계에서 도시가 조금 다르다는 이유만으로 후보를 즉시 삭제하지 않고, 도시 일치 점수와 감점 방식으로 정렬합니다.
4. Google Places 역할 분리
   - 주소·전화·공식 웹사이트 검증에만 사용하고, 한인 여부는 웹 근거 점수로 판단합니다.
5. 약한 후보도 표시
   - 근거가 부족한 후보는 삭제하지 않고 `추가 확인 필요`로 표시합니다.
6. 게시판 세부 분류 값 수정
   - `병원·보험` 등 실제 select 값과 정확히 맞도록 수정했습니다.

## 배포
ZIP을 풀고 같은 경로에 덮어쓴 뒤 Netlify에 배포하세요.

## 환경 변수
- `OPENAI_API_KEY`
- `GOOGLE_MAPS_API_KEY` (선택이지만 권장)
- `OPENAI_SEARCH_MODEL` (선택)
