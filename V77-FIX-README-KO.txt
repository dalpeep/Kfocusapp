DalTownMap V77 - 이벤트 루틴 단일 서버 저장소 수정

- 관리자 이벤트 루틴 저장/조회: 기존 Supabase newsroom Edge Function의 save_settings/get_settings 사용
- 공개 메인 조회: 동일 함수의 home_settings 사용
- 별도 runtime-settings Netlify 함수 의존 제거
- 30초 동기화와 앱 복귀 시 추천/알림/커뮤니티를 모두 즉시 다시 렌더링
- 배포 후 관리자에서 이벤트 루틴을 한 번 저장하세요.
