DalTownMap V56 · 달라스 라이프 하루 1건 자동 게시

1. Supabase SQL Editor에서 supabase/newsroom-v56-auto-publish.sql 실행
2. Supabase Edge Function newsroom을 supabase/functions/newsroom/index.ts로 재배포
3. Edge Function Secrets 확인
   - SUPABASE_URL
   - SUPABASE_ANON_KEY
   - SUPABASE_SERVICE_ROLE_KEY
   - OPENAI_API_KEY
   - NEWSROOM_CRON_SECRET
4. Netlify 환경변수 확인
   - SUPABASE_URL
   - NEWSROOM_CRON_SECRET (Supabase와 같은 값)
   - NEWSROOM_FUNCTION_NAME=newsroom (선택)
5. Netlify 재배포

동작
- Netlify Scheduled Function이 Dallas 시간 오전 6시에 auto_run 실행
- 자료 수집 → AI 분석 → 안전 후보 1건 기사 작성 → posts(type=life)에 저장
- newsroom_publications의 region+날짜 unique로 같은 날 중복 게시 방지
- 업소 연결은 하지 않음

즉시 테스트
- 관리자 AI Newsroom의 자동 편성 실행 버튼을 누르면 auto_run이 실행되고,
  당일 게시가 없을 경우 달라스 라이프에 1건 게시됩니다.
- 당일 이미 게시되었으면 자동 게시 단계는 건너뜁니다.

주의
- 실제 웹 배포 후 Supabase SQL/Edge Function/Netlify 환경변수를 모두 적용해야 자동 실행됩니다.
