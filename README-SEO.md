# DalTownMap SEO v2 설치 안내

## 포함 파일

- `scripts/generate-seo.js` : Supabase 데이터를 읽어서 SEO 페이지와 sitemap 생성
- `robots.txt` : 검색엔진 크롤링 허용
- `llms.txt` : AI 검색 크롤러용 사이트 설명
- `package.json` : Netlify 빌드 실행용
- `netlify.toml` : Netlify 빌드/헤더 설정

## Netlify 설정

Build command:

```txt
node scripts/generate-seo.js
```

Publish directory:

```txt
.
```

Functions directory:

```txt
netlify/functions
```

## 필수 환경변수

Netlify → Site configuration → Environment variables 에 추가 또는 기존 값 확인:

```txt
SUPABASE_URL
SUPABASE_ANON_KEY
```

이미 다른 이름으로 저장되어 있다면 아래 이름도 자동 인식합니다.

```txt
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

## 생성되는 파일

- `/business/업소-slug.html`
- `/category/카테고리-slug.html`
- `/sitemap.xml`
- `/seo-index.json`
- `/business-index.json`

## 기존 앱 영향

기존 `index.html`, `app.js`, `admin.js` 기능을 수정하지 않습니다. 검색엔진과 AI 크롤러가 읽을 수 있는 정적 SEO 페이지를 추가 생성합니다.
