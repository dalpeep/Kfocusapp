# 온라인업소록 owner-test 연결 사전점검

2026-11-20 · Issue #138 · PR #136

## 읽기 전용 확인 결과

| 범위 | 실측 결과 |
|---|---|
| 대상 | Supabase 프로젝트 `owner-test`, ref `aaikttogoejfvxbosktg`, 조직 ID `drkxnfbvklmrpjudijwo`. CLI가 지정한 프로젝트를 확인하고 `--read-only`로 두 카탈로그 쿼리를 실행했다. |
| 데이터 구조 | `public` 22개 테이블에 RLS가 활성화돼 있다. `businesses`와 `business_requests`의 PK는 bigint이며 `region`은 NOT NULL text다. `profiles`에는 `user_id` UUID와 `role`이 있다. `owner_portal_internal`에는 memberships, requests, commands, audit가 있고, `owner_phase1b_internal`과 업주/커뮤니티 백업 스키마가 존재한다. |
| 기존 업주 흐름 | 기존 `owner_portal_read`, `owner_portal_command`, `phase1b_admin_region` 등 SECURITY DEFINER 함수가 존재한다. 정적 의존 구조를 확인했다. 현재 사용자 트래픽 또는 함수 호출 여부는 확인하지 않았다. |
| RLS와 권한 | `public` 정책 29개, `storage` 정책 9개. `public.businesses`는 anon/authenticated SELECT 권한과 무조건 공개 SELECT 정책을 갖는다. 기존 업소·요청 관리자 쓰기 정책에는 지역 참조가 있지만, 익명 업소 등록 요청 INSERT 정책에는 지역 참조가 없다. 기존 정책을 신규 앱 테넌트 경계로 그대로 적용할 수 없다. |
| 인증 | 사용자 6명, email identity 6개. 기존 계정 정보와 식별자는 조회하거나 저장하지 않았다. 프로젝트 수준 가입, MFA, 리디렉션 허용 목록은 전환 전 별도 읽기 전용 확인이 필요하다. |
| Storage | 버킷 7개가 모두 public이다. `community-images`, `public-images`에 객체가 각각 1개 있고, `banner-media`, `business-media`, `coupon-media`, `ktownad`, `media`는 비어 있다. Storage 테이블의 광범위한 grants만으로 실제 쓰기 권한을 판단할 수 없으며, 기존 9개 정책과 버킷 공개 여부를 함께 고려해야 한다. |
| Netlify | 현재 지역 QA 초안은 `comforting-shortbread-ee588e`, 연결 브랜치 `develop`, 초안 `6b009f8d3c4dc1286edf78a7`, 컨텍스트 `branch-deploy`다. 이 사이트의 branch-deploy, production, dev, dev-server에 등록된 `SUPABASE_URL`은 Dallas 프로젝트를 가리킨다. deploy-preview의 URL은 별도 프로젝트를 가리킨다. 키 값은 확인 결과에 포함하지 않았으며 키의 귀속은 미확인이다. |
| 현재 지역 QA 저장 | QA 함수는 Supabase 환경 변수를 읽지 않으며, Netlify의 배포 전용 Blobs에 레코드를, 별도 사이트 Blobs에 QA 관리자 검증값을 저장한다. 환경 자체는 Dallas 변수와 같은 사이트를 공유하므로 독립 연결 대상으로 재사용하지 않는다. 기존 `daltownmap-owner-uuid-qa`도 별도 프로젝트를 가리켜 연결 대상에서 제외한다. |

카탈로그 재확인은 [테이블·정책·집계](owner-test-catalog.readonly.sql)와 [유효 권한·루틴](owner-test-boundaries.readonly.sql)을 사용한다. 두 파일은 SELECT만 포함한다. 실행 시 CLI 대상 프로젝트를 명시하며 로컬 프로젝트 연결 설정에 의존하지 않는다.

```powershell
supabase db query --remote=aaikttogoejfvxbosktg --read-only --agent=no -o json --file region-platform/audit/owner-test-catalog.readonly.sql
supabase db query --remote=aaikttogoejfvxbosktg --read-only --agent=no -o json --file region-platform/audit/owner-test-boundaries.readonly.sql
```

## 연결 설계안

1. 온라인업소록 전용 Netlify QA 프로젝트를 준비한다. 지금의 공유 사이트와 기존 owner UUID 사이트는 그대로 운영한다. 팀 공유 환경 변수까지 점검해 Dallas URL·키·DB 연결 문자열이 상속되지 않는 배포 컨텍스트를 사용한다. QA 전용 변수 이름을 사용하고 서버에서 정확한 owner-test ref와 HTTPS 호스트를 확인한다. 값이 없거나 다르면 접속을 중단한다. 브라우저에는 서버 전용 자격 증명이 전달되지 않도록 빌드 산출물과 함수 번들을 점검한다.
2. 승인 후 owner-test에 `online_directory` 전용 스키마를 추가한다. 기존 업주·커뮤니티 테이블, 함수, 역할, Storage 버킷은 재사용하거나 수정하지 않는다. 신규 테이블은 불변 UUID 지역 ID, 고유 slug, 주 코드와 선택적 하위 지역, 공개 상태, 지도/테마 설정을 갖는다. 주 전체와 도시 레코드는 독립 관리 단위다. 검색 반경은 지도 기본값이며 행정구역이나 접근 권한 경계를 정의하지 않는다.
3. 지역별 업소, 승인 대기 변경본, 공개 승인본, 카테고리, 소유권 신청, 미디어 메타데이터, 감사 이벤트를 분리한다. 참조는 `(region_id, object_id)` 복합 키로 묶는다. 소유권 승인은 대상 업소와 신청을 같은 지역에서 검증하고, 승인·감사 기록을 한 트랜잭션에 저장한다. 소유권 신청 증빙은 공개 응답에서 제외한다.
4. 총괄 관리자, 지역 관리자, 업주 권한은 신규 앱의 멤버십으로 부여한다. 같은 owner-test Auth 사용자 풀을 사용하면 로그인 인프라가 공유된다. 기존 가입자가 멤버십을 자동으로 얻는 흐름은 두지 않는다. 물리적으로 분리된 인증이 필수라면 별도 프로젝트나 IdP를 승인받아야 한다. 관리자와 업주는 사용자 JWT 및 지역 멤버십을 서버와 RLS 양쪽에서 검증한다. 일반 요청에는 RLS를 우회하는 service role을 사용하지 않는다. 공개 읽기는 지역 slug와 승인·공개 상태를 확인한 공개 필드로 제한하고 민감 테이블의 직접 공개 권한을 부여하지 않는다.
5. 필요 시 신규 비공개 이미지 버킷과 지역 UUID 경로를 사용한다. 서명된 업로드 및 미리보기는 권한 확인 후 짧게 발급하고, 공개 이미지 접근은 승인된 업소와 이미지 상태를 함께 확인한다. 버킷 및 Storage 정책 추가는 승인 범위에 포함한다.

## Blobs 이관과 롤백

실측 기준은 Houston 공개, Austin 및 Austin QA 비공개로 총 세 지역이다. Houston과 Austin에는 각각 비공개 승인 업소 한 건과 QA 소유권 신청 한 건이 있다. Austin QA에는 업소나 신청이 없다. 별도 업소 콘텐츠 배열과 게시글, 쿠폰, 이벤트, 광고는 모두 비어 있다.

- 승인 후 원본 JSON을 접근 제한 저장소에 보관하고 체크섬, 지역별 건수, 상태를 기록한다. 현재 초안은 읽기/이관 원본으로 유지한다. 지역 slug와 공개 상태, 디자인·지도·모듈 설정을 보존한다. 기존 업소 UUID, 공개 플래그, 승인본/대기본, 카테고리, 가상 소유권 결과를 전용 QA 레코드에 보존한다. 가상 소유권 결과를 실제 Auth 멤버십으로 변환하지 않는다.
- dry-run에서 누락·중복·교차지역 참조를 검출한다. 검증된 스냅샷만 트랜잭션으로 적재한다. 재실행 시 같은 원본 ID는 중복 생성하지 않으며, 충돌하면 덮어쓰기 전에 중단한다. 전환 직전 원본 변경을 확인한 뒤 지역별 건수·공개 상태·권한을 대조한다.
- 새 QA 주소에서 비인가 접근, 지역 관리자 교차지역 조회·수정·승인, 업주 소유권, 공개/비공개, 이미지 경로, 동시 승인, 390px·1440px 및 기존 owner-test 업주 흐름을 검증한다. 출시 후보는 Colorado 전체 또는 운영자가 선택한 도시 형태로 비공개·빈 상태로 만든다. Dallas/Denver 등 기존 운영 데이터를 가져오지 않는다.
- 문제가 발생하면 신규 QA 쓰기를 중지하고 새 QA 배포만 중단한다. 기존 Blobs 초안과 owner-test 레거시 워크플로는 유지한다. 전환 후 생성된 데이터는 회수할 수 있게 보관하고, 승인 범위 없이 테이블·이미지·계정을 삭제하지 않는다.

## 이번 단계에서 처리한 범위

Colorado 전체, Denver, Aurora 프리셋과 직접 입력 옵션을 로컬 지역 설정에 추가했다. 지역명 편집 및 독립된 지도 초기값을 지원하며 기본은 비공개·빈 데이터다. 어떤 도시도 운영 지역으로 지정하지 않았다. 실제 연결, 신규 Netlify 프로젝트 구성, Blobs 데이터 복사, DB 마이그레이션, RLS·Storage 정책, 인증 구성이나 계정 변경은 실행 전 검토 대상이다.
