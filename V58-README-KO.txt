Kfocusapp V58 · 실제 기사 1건 생성

추가 기능
- 테스트 글 생성 유지
- AI 운영센터에 “실제 기사 1건 생성” 버튼 자동 추가
- 요청을 AI 분류 1건과 기사 작성·게시로 나누어 125초 시간 초과 방지
- 하루 실제 기사 1건 중복 방지 (테스트 글은 제외)
- 업소 자동 연결 없음

배포
1. 전체 프로젝트를 Netlify/GitHub에 배포
2. supabase/functions/newsroom/index.ts를 Supabase Edge Function newsroom으로 재배포
3. 관리자에서 Ctrl+Shift+R
4. AI 운영센터 → 실제 기사 1건 생성

필수 Secrets
SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY
