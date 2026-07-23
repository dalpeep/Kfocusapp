# DalTownMap v19 · 통합 콘텐츠 스튜디오 1단계

## 추가된 기능
AI 콘텐츠 스튜디오의 기존 `주제`, `추가 지시`, `연결 업소`를 이용하여 한 번의 요청으로 다음 초안을 생성합니다.

- DalPick 기사
- 쿠폰 문구
- 배너 문구
- Instagram/Facebook 문구
- 30~45초 숏폼 대본과 썸네일 문구
- DalPick·배너용 이미지 생성 프롬프트

생성 후 현재 관리자 화면의 DalPick, 쿠폰, 배너 입력란에 자동 반영됩니다. 각 항목은 검토한 후 기존 저장 버튼으로 별도 발행합니다. 자동 발행을 막아 실수로 광고나 쿠폰이 공개되는 문제를 방지했습니다.

## 설치
ZIP의 폴더 구조를 기존 프로젝트 루트에 덮어쓰고 Netlify에 재배포합니다.

필수 환경변수:
- `OPENAI_API_KEY`
- 선택: `OPENAI_MODEL` (기본값 `gpt-4.1-mini`)

## 수정 파일
- `admin/assets/admin.js`
- `netlify/functions/generate-content-suite.js`

## 다음 단계
2단계에서는 캠페인 저장함, 각 채널별 발행 상태, 예약 발행, 기존 캠페인 재사용 기능을 연결할 수 있습니다.
