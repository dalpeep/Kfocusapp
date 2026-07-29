V87 안전한 이중 URL 구조

- 기존 해시 링크는 삭제하지 않았습니다.
- 새 검색/공유용 실제 경로를 추가했습니다.
  /business/ID
  /coupon/ID
  /board/ID
  /guide/ID
- 새 경로로 직접 접속하거나 새로고침해도 index.html로 연결됩니다.
- 기존 /#business-detail?id=..., /#board-detail?id=... 링크도 계속 작동합니다.
- 상세 화면을 열면 주소창은 새 실제 경로로 정리됩니다.

주의: 이번 버전은 호환 라우팅 1단계입니다. 정적 SEO 페이지와 자동 sitemap 확장은 다음 단계에서 별도로 진행할 수 있습니다.
