DalTownMap Newsroom V59

변경 내용
1. AI 운영센터에 버튼이 없어도 JS가 자동으로 생성합니다.
   - 🧪 테스트 글 생성
   - 📰 실제 기사 1건 생성
2. 실제 기사 생성은 analyze 1건 후 publish_one을 호출합니다.
3. 달라스 라이프 자동 게시 허용 주제를 다음으로 제한합니다.
   - 생활, 교육, 의료, 교통, 세금·재정, 부동산
4. 범죄·정치·선거·소송·연예·스포츠 결과는 자동 게시에서 제외합니다.

배포
- 전체 프로젝트를 Netlify/GitHub에 반영
- supabase/functions/newsroom/index.ts를 newsroom Edge Function으로 재배포
- 관리자에서 Ctrl+Shift+R 후 “📰 실제 기사 1건 생성” 클릭

후보가 없다는 메시지가 나오면:
1) 지금 다시 수집
2) 수집분 AI 분류
3) 실제 기사 1건 생성
