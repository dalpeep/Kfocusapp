# 온라인업소록 운영 Netlify 연결

이 루트 Netlify 구성은 전용 브랜치에서만 사용한다. 신규 운영 프로젝트를 연결할 때 사용할 값은 다음과 같다.

| 항목 | 값 |
|---|---|
| Branch | `release/online-directory-production` |
| Base directory | `region-platform/production` |
| Build command | `node build.mjs` |
| Publish directory | `public` |
| Functions directory | `functions` |

Publish와 Functions 경로는 Base directory 기준이다. 별도의 Package directory는 비워 둔다. Netlify 대시보드에 기존 Dallas 값이 표시되면 새 브랜치를 먼저 선택하고 표의 설정을 확인한다.

첫 배포 전 새 프로젝트의 Project visibility를 Private으로 설정하고 Preview visibility도 비공개로 유지한다. 비공개 여부는 Netlify 접근 설정으로 결정된다. 로그아웃 상태에서 접근이 차단되고 초대된 관리자로 접근되는지 각각 확인한다.

예정된 운영 Supabase URL은 `https://uzxttrkcagvjiehcjfad.supabase.co`다. 필요할 때 이 주소만 전용 `ONLINE_DIRECTORY_SUPABASE_URL`로 지정할 수 있다. 초기 빌드에는 환경 변수가 필요 없다. 운영 앱 인증·스키마·RLS·비밀키 연결은 별도 승인 범위로 남아 있다. 첫 빌드에는 준비 화면만 있으며 서버 함수와 DB 연결은 비활성이다. Dallas나 QA의 환경 변수를 상속하지 않는 신규 Netlify 프로젝트를 사용한다.

로컬 검증은 이 디렉터리에서 `node build.mjs`로 실행한다. 정상 빌드 결과는 `public/index.html`, `public/logo.png`, `public/robots.txt`다.
