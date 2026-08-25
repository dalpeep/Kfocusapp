DalTownMap V57 테스트 글 생성 기능

변경 사항
1. 관리자 > AI 운영센터에 “🧪 테스트 글 생성” 버튼 추가
2. 버튼 클릭 시 OpenAI/뉴스 수집 없이 Supabase Edge Function의 test_post 작업 호출
3. posts 테이블에 type=life, subtype=test 게시물 즉시 저장
4. 버튼 로딩/성공/실패 메시지 처리

배포
1. 전체 프로젝트를 Netlify/GitHub에 배포
2. supabase/functions/newsroom/index.ts를 Supabase Edge Function newsroom에 재배포
3. 관리자 페이지에서 Ctrl+Shift+R 강력 새로고침
4. AI 운영센터 > 🧪 테스트 글 생성 클릭

주의
- 관리자 로그인 세션과 profiles.role의 super_admin 또는 regional_editor 권한이 필요합니다.
- posts 테이블이 기존 프로젝트와 동일한 스키마여야 합니다.
