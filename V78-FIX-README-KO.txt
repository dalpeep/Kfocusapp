V78 실제 수정

원인: V77 관리자 HTML이 event-routines.js?v=76.0을 계속 참조해 브라우저가 이전 파일을 사용했습니다.

수정:
- 관리자 event-routines.js 캐시 버전 V78로 변경
- 관리자/모바일 모두 /.netlify/functions/runtime-settings 단일 경로 사용
- 저장 후 서버 응답의 event_routines를 즉시 검증
- 저장 실패 시 성공처럼 처리하지 않고 오류 표시
- 서버 설정을 읽은 뒤에는 오래된 localStorage 루틴으로 되돌아가지 않음
