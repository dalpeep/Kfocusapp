# DalTownMap v6.0 자동 이미지 생성

- AI 광고 스튜디오 안에서 배너·쿠폰·포스터·SNS·썸네일을 직접 생성합니다.
- OpenAI가 텍스트 없는 광고 배경을 생성하고, 브라우저 Canvas가 정확한 한국어 문구를 합성합니다.
- 완성 이미지는 Supabase `public-images` 버킷에 자동 저장됩니다.
- 생성된 배너·쿠폰을 관리 화면으로 보내면 이미지 URL도 자동 입력됩니다.

## Netlify 환경변수

`OPENAI_API_KEY`를 Netlify Site configuration > Environment variables에 설정한 뒤 재배포해야 합니다. API 키를 프런트엔드 코드에 직접 넣지 마세요.
