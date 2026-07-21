# DalTownMap Integrated v2.0

이 ZIP은 2026-07-21까지 확정된 기능을 한 프로젝트에 통합한 기준 버전입니다.

## 포함 기능

- AI 콘텐츠 스튜디오 및 기사 하단 저장 버튼
- 업소탐방(`business_story`) 업소 연결 및 게시 상태 처리
- 추천 테마(`themed`) 업종별 노출 설정
- 추천 테마의 홈 DalPick 선택 노출(`show_in_dalpick`)
- 추천 테마를 커뮤니티에서 제외하고 업소 탭 메인 상단에 광범위 노출
- AI 대표 이미지 생성, Supabase Storage 업로드 및 미리보기
- 업소 상세의 연결 배너/카드 광고, 쿠폰, 업소 전용 AI Pick 노출
- 배너 노출 위치: 홈 / 업소 상세 / 둘 다
- 업소 영상 미리보기의 가로 폭을 대표 이미지와 동일하게 표시
- 기존 Google 평점 및 앱 기능 유지

## 최초 배포 전 SQL

Supabase SQL Editor에서 다음 파일을 순서대로 실행하세요. 이미 컬럼이 있으면 `if not exists`로 안전하게 넘어갑니다.

1. `supabase-theme-display.sql`
2. `supabase-business-detail-promotions.sql`
3. 필요할 때만 `fix-existing-theme-records.sql`

## Netlify 환경변수

AI 대표 이미지 생성을 사용하려면 다음 환경변수가 필요합니다.

- `OPENAI_API_KEY`

## 이미지 저장

Supabase Storage의 `public-images` 버킷에 관리자 업로드 권한이 있어야 합니다.

## 노출 규칙

- 추천 테마: 업소 탭 메인 상단에 노출
- 추천 테마 + `홈 DalPick에도 표시`: 홈 DalPick에도 추가 노출
- 추천 테마: 커뮤니티에는 노출하지 않음
- 업소 상세 상단: 연결 배너/카드 → 쿠폰 → 업소 전용 AI Pick 순으로 노출
