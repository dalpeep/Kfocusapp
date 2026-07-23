# DalTownMap v23.2 관리자 AI 배경 생성

## 추가 기능
- 승인 대기 초안마다 `AI 배경 생성` 버튼
- 쿠폰 1:1, 배너 3:2 이미지 생성
- 업종 기반 스타일 자동 추천
- Premium / Modern / Luxury / Food / Medical / Beauty / Kids 선택
- 이미지에는 문자를 넣지 않고 배경만 생성
- 제목과 혜택 문구는 관리자 미리보기에서 HTML 레이어로 합성
- AI 재생성, 직접 업로드, URL 교체, 수정 저장, 승인, 보류
- 생성 및 업로드 이미지는 브라우저 저장을 위해 JPEG로 축소

## 배포 전 확인
Netlify 환경변수에 `OPENAI_API_KEY`가 있어야 합니다.
`netlify/functions/generate-campaign-image.js`가 함께 배포되어야 합니다.

## 현재 테스트 저장 방식
승인 초안은 localStorage에 저장됩니다. 큰 이미지를 많이 보관하면 브라우저 저장 한도를 넘을 수 있으므로 운영 단계에서는 Supabase Storage 연결이 필요합니다.
