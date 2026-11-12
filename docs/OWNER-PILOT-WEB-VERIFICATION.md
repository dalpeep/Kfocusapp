# 운영 업주센터 게시 후 확인

Netlify의 자동 게시 잠금을 유지한다. 게시 직전 현재 활성 Deploy ID를 기록한다. 직전 확인 기준은 `6af601d78998ca3b740ce05d`다. 웹 화면에 문제가 있으면 기록한 기존 Deploy를 다시 게시한다.

운영 Supabase의 DB 파일럿과 Edge 런타임 스위치를 OFF로 둔다. 지정 업주와 지정 관리자로 각각 `https://daltownmap.com/owner-uuid/#admin`에 로그인한다. 개발자 도구 Network에서 `owner-phase1`의 GET 응답이 503과 `OWNER_QA_PILOT_OFF`인지 확인한다. 화면에 시험 운영 중지 안내가 표시되고 관리 목록과 신청 버튼은 숨겨져 있어야 한다.

실제 로그인 세션으로 POST 차단을 점검하려면 개발자 도구 Console에서 아래 코드를 실행한다. 업주 세션은 신청·수정, 관리자 세션은 승인·거절을 보낸다. 모든 대상 ID는 실제 업소나 신청을 가리키지 않는 0 UUID다. GET이 OFF를 확인한 경우에만 POST를 보낸다. 결과에는 HTTP 상태와 오류 코드만 기록한다.

```js
await (async () => {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG;
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { storage: sessionStorage, persistSession: true, detectSessionInUrl: false, autoRefreshToken: false }
  });
  const { data: { session } } = await client.auth.getSession();
  if (!session) throw Error('업주센터에 먼저 로그인하세요.');
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: 'Bearer ' + session.access_token,
    'Content-Type': 'application/json'
  };
  const endpoint = SUPABASE_URL + '/functions/v1/owner-phase1';
  const read = await fetch(endpoint, { headers, redirect: 'error', cache: 'no-store' });
  if (read.status !== 503 || (await read.json()).code !== 'OWNER_QA_PILOT_OFF') {
    throw Error('OFF 응답을 확인하지 못했습니다. POST 점검을 중단합니다.');
  }
  const absent = '00000000-0000-0000-0000-000000000000';
  const commands = session.user.email === 'admin@kfocusapp.com'
    ? [{action: 'approve', request_id: absent}, {action: 'reject', request_id: absent, reason: 'OFF 점검'}]
    : [{action: 'submit', kind: 'claim', business_id: absent},
       {action: 'update', business_id: absent, changes: {description: 'OFF 점검'}}];
  for (const command of commands) {
    const response = await fetch(endpoint, {
      method: 'POST', headers, redirect: 'error',
      body: JSON.stringify({ ...command, key: crypto.randomUUID() })
    });
    const { code } = await response.json();
    console.log(command.action, response.status, code);
    if (response.status !== 503 || code !== 'OWNER_QA_PILOT_OFF') throw Error('OFF 차단 확인 실패');
  }
})();
```
