V82 메인 설정 직접 반영 수정

확인된 사실
- 관리자 저장과 newsroom_settings.home_config 저장은 정상입니다.
- 문제는 메인에서 최신 event_routines를 안정적으로 읽지 못하는 경로였습니다.

수정 내용
1. 메인은 newsroom Edge Function의 home_settings와 Supabase newsroom_settings 테이블을 모두 조회합니다.
2. DB 테이블에 event_routines가 있으면 DB 값을 최우선으로 적용합니다.
3. 30초 자동 동기화와 화면 재진입 시에도 같은 최신 설정을 다시 적용합니다.
4. 적용된 활성 루틴 수를 문서 data-event-routine-count에도 기록하여 확인할 수 있게 했습니다.
5. app.js 캐시 버전을 V82로 변경했습니다.

배포
- 전체 프로젝트를 Netlify/GitHub에 덮어써서 배포합니다.
- Supabase Edge Function을 다시 배포할 필요는 없습니다.
- 배포 후 브라우저에서 강력 새로고침(Ctrl+Shift+R)을 한 번 실행합니다.
