DalTownMap V52 · 원본 출처 추적

추가 기능
- AI 운영센터 기사 편집기에 “원본 출처 찾기” 추가
- 한인 매체는 주제 발견 신호로만 취급
- Google News 후보를 수집한 뒤 AI가 공식기관·연구기관·통신사·미국 지역 언론을 우선 평가
- 추정 원본, 신뢰도, 출처 유형, 역할과 판단 이유를 관리자에게 표시
- 추적 결과는 newsroom_items.event_data.source_trace에 저장
- 게시 기사에는 자동으로 원본 링크를 삽입하지 않음

배포
1. ZIP 전체를 Netlify에 배포
2. supabase/functions/newsroom/index.ts를 Supabase Edge Function newsroom으로 재배포
3. Supabase Secrets에 OPENAI_API_KEY가 필요함

주의
- “추정 원본”은 자동 분석 결과이므로 관리자가 최종 확인해야 함
- 원문 링크는 관리자 내부 검토용이며, 사용자 기사에는 기본적으로 노출되지 않음
