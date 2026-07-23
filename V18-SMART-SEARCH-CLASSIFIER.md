# DalTownMap v18 Smart Search Classifier

## 핵심 변경

검색 주제를 자동으로 세 가지 유형으로 분류합니다.

- BUSINESS: 업소 검색
- INFORMATION: 생활정보 검색
- MIXED: 생활정보와 관련 업소를 함께 검색

## BUSINESS

기존 v17 검색을 유지합니다.

- DalTownMap Supabase businesses DB
- KTN 과거 업소록 파일
- 달사람 온라인 업소록
- Google Places 최신 정보 확인
- 전화번호, 주소, 웹사이트, 이름 유사도로 중복 병합

## INFORMATION

업소 DB를 검색하지 않고 공식 출처를 우선합니다.

- 연방 및 텍사스 정부기관
- 시·카운티
- 교육청 및 학교
- 공공기관
- 공식 전문기관

분야별 공식 도메인 예시:

- 운전·차량: Texas DPS, TxDMV, Texas.gov, NTTA
- 병원·보험: Medicare, Medicaid, HealthCare.gov, Texas HHS, CDC
- 학교·교육: Texas Education Agency, 지역 ISD, U.S. Department of Education
- 세금·비즈니스: IRS, Texas Comptroller, Texas Secretary of State, SBA, TWC
- 주거·생활: 시청, 카운티, Texas PUC
- 비자·여권: USCIS, U.S. State Department, 한국 공관

## MIXED

생활정보 공식 근거와 관련 업소 후보를 병렬 검색하고 한 기사에서 분리해 안내합니다.

## 기사 생성

- 생활정보: 절차, 자격, 준비서류, 비용, 기간, 주의사항 중심
- 업소: 선택된 모든 업소를 빠짐없이 소개
- 혼합형: 공식 생활정보를 먼저 설명한 뒤 관련 업소를 별도 섹션으로 안내
- 확인되지 않은 날짜, 비용, 법률 요건, 연락처 생성 금지

## 변경 파일

- netlify/functions/search-guide.js
- netlify/functions/generate-guide.js
- admin/assets/admin.js
