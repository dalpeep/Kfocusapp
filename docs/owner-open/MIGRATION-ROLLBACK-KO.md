# Owner 통합 SQL·Storage 적용 및 복구 계획

현재 단계는 개발 브랜치 검토용이다. 운영/공유 QA SQL은 실행하지 않았다.

## 적용 전
- 운영 프로젝트 `ydrxuqmjzayejlnjzzew`와 대상 DB를 읽기 전용으로 확인한다.
- 기존 카탈로그/ACL/RLS/버킷/UUID/FK/쿠폰 UNIQUE 인덱스 및 비즈니스 ID 지문을 다시 수집한다. 과거238건/지문 가드를 무조건 해제하거나 새 값으로 덮어쓰지 않는다.
- 최신 암호화 백업을 별도 승인으로 생성하고 격리 복구를 확인한다. 10/22의37PASS는 과거 복구 증거이며 최신 백업은 아니다.
- 현재 Published `6ae36f4905a1d0956a59feb8`, GitHub main,44개 Functions/4cron/정적 경로/기존 Storage 객체 지문을 보존한다.
- Owner/메일/v2실발급은OFF. 신규추첨·예약·영상·Phase5A·QA mock은 제외한다.

## SQL 순서
`01-security →02-apply →03-storage(관리자 호환r1) →03b-legacy-image-authorization →03c-owner-image-link →06-owner-extensions →07-owner-coupon-plans →08-owner-coupon-transition →09-owner-open-hardening`

01..08은 기존 검토본을 복사했으며 원래 승인 가드는 그대로다.09도 `owner_preview.owner_open_approved=true`가 별도로 필요하다. 스크립트가 운영 승인 플래그를 켜거나 SQL을 실행하지 않는다.

- 기존 테이블을 재생성하거나 QA 업무 행을 복사하지 않는다. 신규 private 요청/membership/명령/audit/plan/template 구조와 제한된 RPC를 추가한다.
- 기존 표에 컬럼·트리거·restrictive RLS/ACL 변경이 있으므로 순수 신규 테이블 추가로 취급하지 않는다.
- 09는 Owner 추첨 작성/수정을 차단하고 feature_policy.raffle=false를 강제한다. 기존 Legacy raffle/당첨/응모 행·스케줄은 수정하지 않는다.
- 09의 계정 RPC 확장은 기존 승인등급 RPC를 재사용한다. actor는 검증된 Auth 사용자이며 역할은profiles에서 확인한다. 일반 클라이언트는 직접 실행할 수 없다. 지역 외 조회·변경403, 동일명령 재시도는기존결과,다른내용동일키409.
- 기본 소개 옵션은 승인된 문구 목록이 정해진 뒤 별도 초기 데이터 변경으로 적용한다. 현재 설명을 덮어쓰거나 임의 광고 문구를 만들지 않는다.

## Storage
새 private `owner-portal-quarantine`과 클라이언트/서버 이름을 일치시켰다. 기존 `public-images` 등 공개 버킷·객체·URL은 보존한다.
기존관리자 Legacy 업로드는호환helper로유지. Paid도직접Storage쓰기대신검증gateway사용. Free/미승인/타업소 쓰기 차단, 실제 디코딩과 JPEG/PNG/WebP·5MiB제한 적용.
공개이미지읽기는종전처럼공개이며자기업소제한은관리/수정/삭제/비공개staging에적용된다. 신규영상버킷은만들지않고영상API도403차단.

## 검증과 중단
각파일실패시트랜잭션ROLLBACK후STOP. 추가SQL/배포자동재시도금지.
정책적용후기존관리자업로드/교체/삭제와새Paid/FreeStorageHTTP검증은승인된합성이미지와테스트업소만사용한다. 실패하면Owner를켜지않는다.
DB전후기존레코드수·ID·업무필드·쿠폰원장·정책/ACL·Storage객체와공개URL을비교한다. 기존권한/데이터손실을0건으로확인하지못하면오픈하지않는다.

## 복구
DB적용전:실패한Owner배포대신현재Modern44개Published를공식게시·잠금API로복구.새빌드/잠금해제불필요.
DB적용후:먼저신규Owner/v2/메일쓰기OFF.기존Modern44개게시본으로복귀하되private요청/audit/원장/Storage보안fence보존.09의계정·콘텐츠RPC를실수로public/anon에열지않는다.
기존이미지/쿠폰/승인기록삭제,스키마DROP,취약했던익명쓰기복원,등급일괄변경은자동롤백에포함하지않는다.새v2기록이생긴후에는Legacy코드만복귀하면발급/사용까지모두복구된다고가정하지않는다.정확한원인수정후forward회복이기본이다.

## 현재 별도 남은 작업
현재Legacy쿠폰발급/사용/이메일3경로는원본그대로다.신규Owner v2쿠폰의실발급/사용을운영에연결하는protocol dispatcher와알림경계검증은별도미완성이다.따라서이번후보는기본OFF로만빌드검토가능하며실고객신규쿠폰공개/발급오픈후보로승인하면안된다.
