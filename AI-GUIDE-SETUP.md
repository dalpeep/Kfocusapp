# AI 달라스 가이드 설정

관리자 > 게시판 관리에 `AI 달라스 가이드 작성` 기능이 추가되었습니다.

## Netlify 환경변수

Netlify의 Site configuration > Environment variables에 아래 값을 추가하세요.

- `OPENAI_API_KEY`: OpenAI API 키
- `OPENAI_MODEL`: 선택 사항. 미설정 시 `gpt-4.1-mini`

환경변수 저장 후 새로 Deploy해야 적용됩니다.

## 사용 방법

1. 관리자에서 게시판 관리로 이동
2. 주제와 가이드 분야 선택
3. 가능하면 공식 기관 URL 입력
4. `AI 초안 만들기` 또는 `AI 작성 후 바로 게시` 선택

`AI 초안 만들기`는 비활성 상태로 양식에 채우므로 관리자가 검토한 뒤 저장할 수 있습니다.
`AI 작성 후 바로 게시`는 확인창 이후 활성 글로 Supabase `posts` 테이블에 저장합니다.

법률, 세금, 의료, 보험, 이민 관련 글은 공식 출처와 최신 날짜를 반드시 검토하세요.
