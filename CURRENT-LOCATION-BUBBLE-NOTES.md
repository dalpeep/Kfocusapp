# Current Location Bubble Fix

- 지도에는 선택된 분류의 전체 업소 핀을 표시합니다.
- 주변 업소 목록은 현재 지도 중심과 반경을 기준으로 유지합니다.
- `현재 위치 표시 중` 문구를 고정 화면 배지에서 제거했습니다.
- 현재 위치 마커 SVG 안에 말풍선을 포함하여 지도 이동·확대·축소 시 핀과 함께 움직입니다.
- `app.js`와 `admin/assets/admin.js` JavaScript 문법 검사를 통과했습니다.
- `npm run build`를 실행했습니다. Supabase 환경변수가 없는 로컬 환경에서는 정적 기본 SEO만 생성됩니다.
