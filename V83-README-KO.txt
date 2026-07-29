V83 이벤트 루틴 메인 최종 반영 수정

1. Supabase REST 조회 URL에서 잘못된 `_` 필터를 제거했습니다.
2. newsroom_settings.home_config의 event_routines를 최신 원본으로 직접 읽습니다.
3. 추천 옵션을 표준화하여 추천/신규/인기/쿠폰/배너/주소/관리자 지정/랜덤을 확실히 적용합니다.
4. 추천 카드 라벨도 현재 이벤트 루틴 선택값을 표시합니다.
5. Console에서 [V83 recommendation] authoritative 로그로 실제 옵션과 업소 목록을 확인할 수 있습니다.
