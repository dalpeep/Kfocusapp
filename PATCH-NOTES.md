# DalTownMap V6 Alpha Patch 01

Version: `6.0.0-alpha.1`

## 적용된 변경

- `index.html`의 중첩된 `<script>` 태그 오류 수정
- Supabase SDK 중복 로딩 제거
- `main-banners.js` 중복 실행 제거
- OneSignal 초기화 코드를 단일 블록으로 정리
- `APP_CONFIG`와 `KFOCUS_CONFIG` 모두 지원
- `denver → colorado`, `dfw → dallas` 지역명 정규화
- 관리자 게시판의 `selectedBoardId` 저장 상태 보강
- 게시판 갤러리 URL 입력·미리보기·저장 처리 통일
- 관리자 `BUSINESS_FIELDS`의 중복 `google_maps_url` 제거
- Supabase 미연결 시 게시판 로딩 오류 방지
- 캐시 버전을 `6.0.0-alpha.1`로 갱신
- 안전한 추가형 SQL migration 포함

## 교체할 파일

프로젝트 루트를 기준으로 아래 파일만 교체합니다.

- `index.html`
- `app.js`
- `styles.css`
- `config.js`
- `admin/index.html`
- `admin/assets/admin.js`
- `admin/assets/admin.css`

SQL은 필요할 때만 `migrations/2026-07-v6-alpha-01.sql`을 Supabase SQL Editor에서 실행합니다.

## 주의

1. 먼저 GitHub `develop` 브랜치에서 작업합니다.
2. 기존 파일을 별도 폴더에 복사하거나 커밋한 뒤 교체합니다.
3. Netlify 자동 배포 후 develop 사이트에서 먼저 확인합니다.
4. 운영 `main` 브랜치에는 아직 반영하지 않습니다.
