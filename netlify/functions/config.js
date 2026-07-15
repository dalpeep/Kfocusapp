exports.handler = async () => {
  const appCity = String(
    process.env.APP_CITY || 'dallas'
  )
    .trim()
    .toLowerCase();

  /*
   * 도시별 공통 설정
   *
   * key:
   *   Netlify의 APP_CITY 값
   *
   * region:
   *   Supabase 테이블의 region 컬럼에 실제 저장되는 값
   */
  const CITY_CONFIG = {
dallas: {
  city: 'dallas',
  region: 'dallas',
  cityLabel: 'Dallas',

  appName: 'DalTownMap',

  brandNameKo: '달타운맵',
  brandNameEn: 'DalTownMap',

  siteUrl: 'https://daltownmap.com',

  seoTitle:
    '달타운맵 | 달라스 한인 업소록·쿠폰·행사·커뮤니티',

  seoDescription:
    '달타운맵은 달라스·DFW 한인 업소 정보, 할인 쿠폰, 행사, 구인구직, 렌트·매매 및 지역 커뮤니티 소식을 제공하는 플랫폼입니다.',

  seoKeywords:
    '달타운맵, DalTownMap, 달라스 한인 업소, 달라스 쿠폰, 달라스 행사, Dallas Korean, DFW Korean',

  seoImage:
    'https://daltownmap.com/icons/icon-512.png',

  locale: 'ko_KR',
  language: 'ko',

  singleCity: true
},

    denver: {
      city: 'denver',

      // 현재 DB가 Colorado로 저장되어 있다면 그대로 사용
      region: 'colorado',

      cityLabel: 'Denver',
      appName: 'Denver KTownMap',
      brandName: 'KTownMap',
      siteUrl: 'https://denver.ktownmap.com',
      singleCity: true
    },

    seattle: {
      city: 'seattle',
      region: 'seattle',
      cityLabel: 'Seattle',
      appName: 'Seattle KTownMap',
      brandName: 'KTownMap',
      siteUrl: 'https://seattle.ktownmap.com',
      singleCity: true
    }
  };

  /*
   * 등록되지 않은 APP_CITY가 들어오면
   * Dallas 설정을 안전한 기본값으로 사용
   */
  const cityConfig =
    CITY_CONFIG[appCity] ||
    CITY_CONFIG.dallas;

  const cfg = {
    /*
     * 기존 서비스 설정
     */
    SUPABASE_URL:
      process.env.SUPABASE_URL || '',

    SUPABASE_ANON_KEY:
      process.env.SUPABASE_ANON_KEY || '',

    GOOGLE_MAPS_API_KEY:
      process.env.GOOGLE_MAPS_API_KEY || '',
	
	ONESIGNAL_APP_ID:
    process.env.ONESIGNAL_APP_ID || '',

    /*
     * 도시별 자동 설정
     */
    APP_CITY:
      cityConfig.city,

    APP_REGION:
      cityConfig.region,

    APP_CITY_LABEL:
      cityConfig.cityLabel,

    APP_NAME:
      cityConfig.appName,

    APP_BRAND:
      cityConfig.brandName,

    APP_SITE_URL:
      cityConfig.siteUrl,

    APP_SINGLE_CITY:
      cityConfig.singleCity
  };

  return {
    statusCode: 200,

    headers: {
      'Content-Type':
        'application/javascript; charset=utf-8',

      /*
       * 도시별 환경변수를 즉시 반영하기 위해
       * 브라우저 캐시를 사용하지 않음
       */
      'Cache-Control':
        'no-store, no-cache, must-revalidate',

      Pragma: 'no-cache'
    },

    body: `
window.APP_CONFIG = ${JSON.stringify(cfg)};
window.KFOCUS_CONFIG = ${JSON.stringify(cfg)};
`
  };
};