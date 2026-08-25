DalTownMap V67 수정 내용

1. 게시물 고정 기능을 실제 관리자 화면에 추가
- 게시물 고정 체크박스
- 고정 순서 입력
- Supabase posts.is_pinned / posts.pin_order 저장
- 관리자 목록과 사용자 화면에서 고정글 우선 정렬

2. 달타운 알림의 과거 로컬 편성 차단
- 이벤트 루틴 저장 키를 v67로 새로 분리
- 과거 v63 로컬 알림 문구는 더 이상 읽지 않음
- 배포 후 관리자 이벤트 루틴에서 현재 사용할 알림을 한 번 새로 저장해야 함

3. 실제 배포 경로 확인
- 관리자: admin/index.html -> admin/assets/admin.js
- 사용자: index.html -> app.js

배포 후 Ctrl+Shift+R로 강력 새로고침하세요.
