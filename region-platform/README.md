# 달타운맵 지역 확장 QA

GitHub PR #136의 지역 설정 모델을 사용하는 독립 데모입니다. Dallas의 관리자 화면, 공개 사이트, Supabase와 배포 설정에는 연결하지 않습니다.

## 로컬 실행

저장 없이 실행하려면 프로젝트 루트에서 `node region-platform/qa-server.mjs`를 실행한 뒤 [지역 관리](http://127.0.0.1:4176/admin/regions)를 엽니다. 재시작 후에도 지역을 보존하려면 쓰기 가능한 QA 전용 경로를 지정합니다.

```powershell
$env:REGION_QA_FILE = Join-Path $env:TEMP 'daltownmap-region-qa.json'
node region-platform/qa-server.mjs
```

지역을 추가하면 비공개 미리보기 주소가 생성됩니다. 관리자 화면에서 **데모 공개**를 선택해 저장하면 같은 서버의 `/regions/<주소 이름>`으로 열 수 있습니다. 비공개로 전환하면 이 주소는 404를 반환합니다. 공개 범위는 이 QA 서버에 한정됩니다. 지역 주소 이름은 생성 후 고정됩니다.

테마와 기능 표시 상태는 지역별로 저장됩니다. 업소록과 지도 검색은 해당 지역에 속하고 지정된 검색 반경 안에 있는 업소만 표시합니다. 커뮤니티, 쿠폰, 광고 등도 지역별 빈 데이터에서 시작합니다. 이 데모는 콘텐츠 등록, 실제 업주 서비스, 예약 처리 등 Dallas의 운영 백엔드 기능과 연동하지 않습니다. 지도는 OpenStreetMap에 연결합니다.

## 검증

`node --test tests/region/region-config.test.mjs`는 PR #136의 설정 모델을 확인합니다. Playwright와 Chrome이 설치된 QA 환경에서는 아래 명령으로 관리자와 데모를 데스크톱·모바일 화면에서 확인할 수 있습니다. 외부 지도 응답은 테스트 대역을 사용합니다.

```powershell
$env:REGION_QA_BROWSER = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
node --test tests/region/*.test.mjs
```

## 운영 통합 승인 범위

운영 관리자 인증에 지역 관리와 비공개 미리보기를 연결하는 작업, 영속 데이터의 지역별 읽기·쓰기 권한, 콘텐츠 모듈의 테넌트 경계 검토가 필요합니다. 현재 서버는 루프백 전용이며 배포 진입점으로 사용하지 않습니다.

## 온라인 QA

온라인 어댑터는 `region-platform/online`에 있습니다. 이 디렉터리를 프로젝트 루트로 사용하는 별도 작업 폴더에서 의존성을 설치하고, 기존 `comforting-shortbread-ee588e` 프로젝트에 초안 배포합니다. 상위 `region-platform`의 설정 및 렌더링 모듈이 작업 폴더에도 있어야 합니다. 운영 프로젝트 및 QA 기본 주소에 게시하지 않습니다.

온라인 관리자는 HTTPS 브라우저 로그인에서 QA 전용 계정을 사용합니다. 원본 암호는 배포 파일과 저장소에 기록하지 않습니다. SHA-256 검증값은 QA 사이트 전용 Blobs 저장소 `daltownmap-region-qa-136-access`의 `basic-sha256` 키에 보관합니다. 지역 레코드는 각 초안 배포 전용 Blobs 저장소에 보관되며, 조건부 쓰기로 저장 충돌을 검출합니다. 새 초안을 배포할 때 지역 레코드는 별도로 초기화됩니다.

중단할 때에는 해당 초안 배포를 삭제합니다. QA 관리자 접근만 중지하려면 전용 저장소의 검증값을 삭제합니다.

### 지역 앱 템플릿

지역 이름만 입력하면 비공개 앱과 미리보기 주소가 만들어집니다. Houston, Austin, Los Angeles는 내장 도시 중심으로 시작하며, 다른 이름에는 미국 전체 지도 중심을 사용합니다. 관리자는 지도 중심·반경, 로고, 테마와 대표 색상, 배너, 메뉴 순서, 홈 레이아웃, 기능 토글을 지역별로 설정할 수 있습니다.

QA 앱에는 Dallas와 같은 헤더, 검색 오버레이, 카테고리 바로가기, 하단 탭, 지역별 지도와 빈 목록을 표시합니다. QA 업소 등록 화면은 개인정보를 제출받지 않습니다.

온라인 배포 시 저장소의 `assets/kfocus-icon.png`를 별도 배포 작업 폴더의 `region-platform/online/public/qa-ui/kfocus-icon.png`로 복사합니다. 이전 QA 설정을 계속 사용하려면 이전 초안의 지역 레코드를 새 초안 전용 Blobs 저장소로 이관합니다. 두 초안의 저장소는 독립적으로 유지됩니다.
