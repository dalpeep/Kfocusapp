# DalTownMap v8.6 독립 슬라이드

- 같은 업소에 슬라이드를 여러 개 등록할 수 있습니다.
- 새 슬라이드 저장 시 기존 업소 슬라이드를 덮어쓰지 않습니다.
- 업소 연결 없이도 독립 슬라이드를 등록할 수 있습니다.
- 수정과 삭제는 `business_id`가 아니라 슬라이드 고유 `id` 기준으로 처리합니다.
- 배포 전에 `supabase-slides-multiple-upgrade.sql`을 Supabase SQL Editor에서 한 번 실행해야 합니다.
