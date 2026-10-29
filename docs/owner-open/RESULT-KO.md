# Owner Portal Modern 통합 개발 결과

기준: Published6ae36f4905a1d0956a59feb8 / source e0aecb4c91726f3be5031df3f6244c86e1e58c93.
개발 브랜치: dev/owner-modern-integration-20261029. 운영/QA 적용은 하지 않았다.

## 완료 범위
- 현재 운영 런타임119파일과 핵심 UI5파일의 SHA256 보존. 기존 Functions44개 이름/업무코드/보안 helper/Legacy쿠폰·이메일 처리 변경0. Scheduled4개 이름/UTCcron보존.
- 기존Owner코드에서4개 엔트리와필요lib/폰트만선택이식.과거Community보안lib는복사하지않음.
- Owner4개도기존Modern어댑터재사용.전역플래그true가아니면모든요청503 OWNER_DISABLED.운영프로젝트/사이트/origin/프로토콜추가가드유지.
- 기존Auth·가입·업소선택·신규/소유권신청·승인/거절/회수·콘텐츠관리재사용.별도계정/로그인시스템없음.
- owner-uuid9파일과검증업로더1파일만공개출력허용.메인에업주센터진입1개추가.기존메뉴항목과URL변경없음,닫기함수재사용.
- 예약연결스크립트/QA버튼/QA mock/Owner키진단/Phase5A/미배포Phase6대시보드제외.신규영상업로드도403으로닫음.
- 관리자계정관리스크립트연결.승인된업소선택→현재등급읽기→기본/구독활성/구독중단변경구성.현재등급조회실패시저장불가.변경사유·확인절차·감사/멱등RPC사용.서버actor는실제인증UID에서만취득.
- 신규Owner추첨입력은API와신규09RPC에서거절.기존추첨행/기존Legacy추첨로직/10분cron은수정하지않음.
- 클라이언트/server/SQL의private staging이 owner-portal-quarantine으로일치.쿠폰purpose/business_id를prepare/publish모두전달.서버거절시signed업로드0.
- sharp0.35.5와Linux optional의존성·한글폰트/OFL을Owner이미지2개함수에만명시포함.기존SDK포함정책보존.

## 실제 검증
1. Node22.23.4 격리Linux의공식ZISI:48개 API2 패키징PASS,UTCcron4개유지.실제Netlify업로드아님.
2. 실제ZIP을소스밖으로추출:imports48/SDK48/Owner기본OFF4 PASS.심볼릭링크·경로탈출·CRC검사PASS.소스/node_modules우회없음.
3. 실제ZIP내sharp/폰트로기본4종을2개이미지함수에서각각렌더링(8PNG),JPEG/PNG/WebP6검사,5MiB초과2거절PASS.
4. 실제SDK+가상네트워크Community권한11 PASS.운영HTTP아님,실제외부요청0.
5. Linux회귀254 PASS/0FAIL.이후클라이언트업로드계약2건과미게시승인가드1건추가PASS.기존44개소스불변확인으로최종미소수정의기존회귀보존.
6. PostgreSQL17 network=none:기존02DDL/승인RPC를가상공개기본테이블에적용한15 PASS.승인전business행없음/익명조회0,private신청접근차단,지역외승인차단,승인후단건공개,재시도일관성,타업소/철회권한차단,거절/자기승인차단,이력/기존업소보존.
7. 실제09SQL+기존access/feature/plan helper28 PASS:지역별등급조회/변경,일반업주·banned·미확인이메일거절,service전용RPC권한,동시동일명령10개→원장1건,키충돌409,추첨금지/과거행보존.기존content/account기본명령은이테스트에서stub이며전체운영스키마복제검증으로표현하지않음.
8. 브라우저는로컬가상데이터·읽기전용.1280/375에서가로넘침0.기본4종canvas미리보기/Free파일입력0/Paid파일선택·자유소개/관리자현재등급조회/기존4탭/신청·이벤트·특선진입확인.새관리자버튼44px,기존주요버튼48px.실제Auth/StorageHTTP저장테스트아님.
9. 비밀정보검사PASS,값출력0.미게시빌드--verify-only가드PASS.현재ignore=exit0,운영/미게시승인플래그모두false.

## 기능 상태
READY(로컬통합후보):기존가입/로그인연결,승인업소선택,신규업소·소유권신청,자기업소수정,승인·거절·회수,Free/Paid분기,기본4종/맞춤이미지입력·렌더링,이벤트·스페셜,관리자계정·등급UI/API.
INCOMPLETE:실고객용신규v2쿠폰발급/사용/알림dispatcher.이번작업은기존Legacy발급·이메일을그대로보존했고Owner-only함수로교체하지않았다.08적용후신규v2쿠폰을기존Legacy발급경로로즉시오픈하면안됨.
INCOMPLETE:운영기본소개선택문구목록초기데이터.임의문구등록/기존소개덮어쓰기없음.
BLOCKED(운영실사용):신규SQL/RLS/Storage·운영설정·실제Auth/Storage HTTP/Canary검증·게시승인미실행.현재Owner4개는기본OFF다.
BLOCKED(정책):신규추첨활성화.동시성SQL별도단계전에는Owner경로에서계속거절.

## CI와미게시빌드
새GitHub Actions워크플로준비완료:Linux새설치,119파일/44+4보존,ZIP실행/템플릿/보안/회귀/PostgreSQL가상권한검사,진단JSON아티팩트.배포토큰/운영DB인증/외부발송없음.
GitHub Push/원격Actions/Netlify공식서버빌드는이번에실행하지않았다.로컬DockerLinuxPASS를GitHubCI또는NetlifyReady로보고하지않는다.
다음승인은정확한개발Commit Push+LinuxCI,그후검증Commit의Production-context미게시Git빌드1회로분리.게시잠금/Firewall/main유지.후보의owner-build-state.unpublishedBuildApproved는false이며승인전실제빌드가실패종료하도록구성.

## 운영적용 전 조건
9개SQL과Storage/복구계획은 docs/owner-open/MIGRATION-ROLLBACK-KO.md 및supabase/owner-open에보존.적용한SQL0건.원래01..08승인가드유지,09도별도승인필요.
최신운영카탈로그/이미설치된RPC/RLS/ACL/지문과새암호화백업검증후SQL범위확정.현재10/22복구37PASS를오늘최신백업으로간주하지않음.
실제StorageHTTP는승인된테스트업소/이미지로관리자Legacy업로드·교체·삭제,새Paid/Free/미승인/타업소경계를확인해야함.
신규Owner/v2실고객공개는Legacy/v2분기와수신자제한·메일검증전까지진행하지않음.예약/추첨/Phase5A는범위외.

## 최종운영경계
2026-10-29T17:14:58Z 읽기전용확인:Published6ae36f4905a1d0956a59feb8/locked=true/44Functions/4cron/main524c984389ec44a83bd612682aadb91ecac6c5fc/미게시Firewall404 유지.운영DB·SQL·Storage·환경변수·게시변경0.실제발급·추첨·메일·푸시실행0.

## 파일군
- netlify/functions/owner-{portal,content,image,account}-uuid.mjs 및 대응Owner전용legacy/lib/폰트.
- owner-uuid9개/validated-image-upload.js/index.html.
- package.json/package-lock.json/netlify.toml의정확한이미지의존성확장.
- release보존·ZIP·빌드·standalone가드/전용CI/Owner검사.
- supabase/owner-open의검토SQL9개/해시명세,운영적용·복구문서.

검증증거는.release-artifacts의functions-build.json,standalone-runtime-qa.json,linux-regression-final.tap,zip-integrity.json,owner-postgres-qa.json,owner-approval-postgres.json,ui-qa.json,production-boundary.json과PC/모바일JPG.실제운영데이터·토큰·비밀번호·이미지객체를복사하지않음.
