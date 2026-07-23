# DalTownMap v22 통합형 AI 콘텐츠 스튜디오

## 변경 내용

- `AI 광고 스튜디오`와 `AI 콘텐츠 스튜디오` 시작 흐름을 하나의 `AI 콘텐츠 스튜디오`로 통합
- 첫 단계는 업소나 제작물 선택이 아니라 `무엇에 관한 콘텐츠를 만들까요?` 주제 입력
- AI 분석 결과로 콘텐츠 성격, 추천 목표, 대상 고객, 문체, 추천 테마를 표시
- AI가 DalPick, AI Guide, 쿠폰, 배너, SNS, 푸시, 영상, 대표 이미지의 추천 여부와 이유를 제안
- 관리자가 필요한 항목만 체크한 뒤 한 번에 생성
- 결과별 복사 및 DalPick/가이드/쿠폰/배너/푸시 관리 화면으로 전달
- AI 마케팅 점수와 발행 전 체크리스트 표시
- 기존 DalPick 편집 화면은 `DalPick 관리`로 유지

## 교체 파일

- `admin/index.html`
- `admin/assets/admin.js`
- `admin/assets/ai-studio.js` (신규/교체)
- `netlify/functions/generate-content-suite.js`

## 배포 전 확인

Netlify 환경변수에 `OPENAI_API_KEY`가 있어야 합니다.
