# DalTownMap v23 · AI Marketing Manager

추가 기능
- Free / Basic 100 / Business 300 / Premier 500 플랜 관리
- 업소별 상태, 갱신일, 담당자, 운영 방식 저장
- 플랜별 AI Studio 제작물 잠금
- 월간 허용량/사용량 표시
- 쿠폰·배너 품질 검토함
- 제목·설명 수정, 이미지 URL 변경, 로컬 이미지 업로드 후 승인/보류
- AI 생성 결과는 기본적으로 Draft → Review → Approve 구조

현재 데모 데이터는 브라우저 localStorage에 저장됩니다. 운영 DB 연결용 SQL은 SUPABASE-V23-AI-MANAGER.sql을 참고하세요.
Stripe 자동 결제는 키와 Webhook 설정이 필요하므로 이번 패키지에는 실제 결제 실행 대신 Stripe ID 저장 필드 구조만 준비했습니다.
