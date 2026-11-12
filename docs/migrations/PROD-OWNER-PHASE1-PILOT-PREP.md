# 달타운맵 운영 업주 관리 제한 테스트 준비

운영 코드 기준은 GitHub main의 `e18ee77c4be03a24bb1418df1a660a20365524b5`다. QA 브랜치에는 운영 함수 진입점과 배포 설정의 차이가 있으므로 운영 후보는 최신 main에서 시작한다.

## 운영 코드와 빌드

- main의 기존 공개 산출물을 그대로 검사하고 `/owner-uuid/` 전용 정적 파일 7개를 별도 해시 목록으로 추가한다. 기존 Netlify 함수 44개와 스케줄 4개는 기존 배포 검사로 검증한다.
- 브라우저는 운영 호스트와 운영 Supabase URL이 일치할 때만 운영 Edge Function을 호출한다. Edge Function은 정확한 Origin, 프로젝트 URL, 런타임 스위치를 검사하고 Supabase가 주입한 서비스 역할 키를 사용한다. 게이트웨이 JWT 검증을 켠 상태로 배포한다. 새 Netlify 비밀 변수는 필요 없다.
- 인증된 사용자 UUID는 Supabase Auth 검증 결과에서 가져온다. 파일럿 RPC가 허용 계정, 업소 범위, 소유권과 지역별 관리자 자격을 검사한다. 신청·승인은 파일럿 스키마에 기록되며 공개 업소 테이블에는 등록되지 않는다.
- 예약·결제·SMS·PREMIUM 진입점은 이 후보에 추가하지 않는다.

## SQL 및 복구

1. 운영 카탈로그에서 UUID 업소 ID, 기존 프로필 권한 계약, 파일럿 스키마·RPC 이름 충돌 여부를 읽기 전용으로 대조한다. 운영 Physical Backup의 최신 복구 지점과 격리 복원 검증 범위를 기록한다.
2. 별도 승인 후 [추가형 파일럿 SQL](DRAFT-owner-phase1-pilot.sql)을 적용한다. 초기값은 OFF이며 기존 공개 RPC·테이블의 변경은 이 SQL에 포함되지 않는다.
3. 별도 승인 후 운영 관리자 1명, 운영 테스트 업주 2명, 합의된 운영 테스트 업소만 운영 UUID로 지정한다. [계정 읽기 전용 사전 검사](PROD-OWNER-PHASE1-ACCOUNT-PREFLIGHT-READONLY.sql)에서 세 행의 모든 확인 값이 true인지 확인한다. QA 등록 SQL의 UUID나 업소 행을 가져오지 않는다. 기존 운영 소유권은 별도로 유지한다.
4. 장애가 발생하면 파일럿을 OFF로 전환한다. 공개 페이지나 배포에 영향이 있으면 Netlify에서 배포 전 기록한 이전 Production Deploy를 재게시한다. 파일럿 신청·감사 기록은 남겨 조사한다. 스키마 제거는 별도 승인을 받고 종속 관계와 기록 백업을 확인한 뒤 수행한다.

## 게시 조건

GitHub PR → Release QA → 승인 후 main 병합 → Auto Publishing 잠금 상태에서 Netlify Production 빌드 → 기존 함수 44개, 스케줄 4개, 신규 정적 포털 및 공개 화면 검증 → 별도 승인 후 Publish deploy 순서로 진행한다. 운영 Edge Function 배포도 별도로 승인받는다. 운영 게시 후 파일럿 OFF 상태에서 로그인과 서버 차단을 확인하고 지정 계정에 한해 파일럿 ON을 승인받는다.
