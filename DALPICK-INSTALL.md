# DalPick Sprint 1 설치

1. Supabase SQL Editor에서 `supabase-dalpick.sql`을 실행합니다.
2. 이 ZIP의 파일을 develop 브랜치 루트에 덮어씁니다.
3. Netlify develop 배포가 끝난 뒤 `/admin/?v=dalpick8`을 엽니다.
4. 왼쪽 메뉴의 `DalPick 관리`에서 새 콘텐츠를 등록합니다.
5. `게시`를 체크하고 노출 기간을 비워 두거나 현재 날짜가 포함되도록 설정합니다.
6. 메인 화면의 기존 오늘의 쿠폰 위치에 DalPick 카드가 나타나는지 확인합니다.

주요 변경 파일:
- `admin/index.html`
- `admin/assets/admin.js`
- `index.html`
- `app.js`
- `styles.css`
- `supabase-dalpick.sql`
