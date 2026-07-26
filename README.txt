DalTownMap V45.1 Main Settings Fix

1. app.js와 index.html을 기존 프로젝트 루트 파일과 교체합니다.
2. 폴더 전체를 Netlify에 다시 배포합니다.
3. 브라우저에서 Ctrl+Shift+R로 강력 새로고침합니다.
4. 개발자도구 Console에서 다음을 확인합니다.
   [V45.1 Main Settings] loaded
5. 직접 확인하려면 Console에서 loadMainSettings()를 실행할 수 있습니다.

수정 내용
- 누락된 loadMainSettings() 함수 추가
- newsroom home_feed의 home_config를 메인 설정으로 연결
- cfg 미정의 오류 수정(getConfig 사용)
- KFOCUS_CONFIG와 APP_CONFIG 모두 지원
- 메인 렌더링 오류가 전체 초기화를 중단하지 않도록 예외 처리
- app.js 캐시 버전 45.1.0
