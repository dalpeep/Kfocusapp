# DalTownMap v16 — 교차 업소록 + 자체 DB 검색

## 검색 소스

1. DalTownMap Supabase `businesses` 테이블
2. KTN 과거 업소록 파일 (`5,534` rows)
3. 달사람 온라인 업소록
4. Google Places 최신 정보 검증

주간포커스와 중앙일보 업소록은 이번 버전에서 제외했습니다.

## 주요 동작

- 세 소스에서 후보를 병렬 수집합니다.
- 전화번호 → 주소 → 웹사이트 → 이름/주소 유사도 순서로 중복을 판정합니다.
- 중복 후보는 하나로 합치고 모든 출처를 유지합니다.
- DalTownMap DB의 업소는 자체 등록 정보와 평점/지도 링크를 우선 활용합니다.
- KTN CSV는 과거 후보 발굴용으로 사용하고 Google Places로 현재 주소·전화·영업 상태를 재검증합니다.
- 달사람은 OpenAI Web Search에서 업소록 URL과 `site:dalsaram.com/shop` 검색을 명시적으로 사용합니다.

## 포함 파일

- `netlify/functions/search-guide.js`
- `netlify/functions/data/ktn-businesses.json`
- `netlify/functions/data/dalkora_business_full.csv`
- `admin/assets/admin.js`
- `netlify/functions/generate-guide.js`

## 필요한 Netlify 환경변수

- `OPENAI_API_KEY`
- `GOOGLE_MAPS_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` 권장
  - 없으면 `SUPABASE_ANON_KEY`를 사용합니다.
  - anon key를 사용할 경우 `businesses` 테이블 SELECT RLS 정책이 허용되어야 합니다.

## 자체 DB 활용 방식

`businesses` 테이블에서 다음 필드를 읽습니다.

- `name_ko`, `name_en`
- `category_ko`, `area`
- `phone`, `website`, `address`
- `languages`, `description`
- `google_maps_url`, `rating`, `review_count`
- `is_active`, `region`

DB 레코드가 KTN 또는 달사람 후보와 전화번호/주소/웹사이트로 일치하면 하나의 후보로 병합됩니다.

## 배포

ZIP의 폴더 구조를 유지해서 기존 프로젝트 루트에 덮어씁니다. JSON 파일은 `require()`로 직접 포함되므로 별도의 Netlify `included_files` 설정은 필요하지 않습니다.
