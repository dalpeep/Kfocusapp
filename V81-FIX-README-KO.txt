DalTownMap V81 - Supabase 단일 저장소 수정

1. 관리자 이벤트 루틴 저장/조회는 Supabase newsroom Edge Function의 get_settings/save_settings만 사용합니다.
2. 기존 home_config를 먼저 읽고 event_routines만 병합하여 다른 메인 설정을 덮어쓰지 않습니다.
3. 사용자 메인은 newsroom Edge Function의 public home_settings를 직접 읽습니다.
4. 사용하지 않는 Netlify runtime-settings 함수를 제거했습니다.
5. 배포 후 관리자 이벤트 루틴을 한 번 다시 저장하세요.
6. Supabase에 배포된 newsroom 함수가 home_settings/get_settings/save_settings를 지원해야 합니다.
