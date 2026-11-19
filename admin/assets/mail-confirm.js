const token = location.hash.slice(1);
history.replaceState(null, '', location.pathname);
const button = document.querySelector('#confirm');
const status = document.querySelector('#status');
button.onclick = async () => {
  button.disabled = true;
  try {
    const cfg = window.KFOCUS_CONFIG;
    const response = await fetch(cfg.SUPABASE_URL + '/functions/v1/admin-application-mail', {
      method: 'POST', redirect: 'error',
      headers: { apikey: cfg.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'confirm', token }),
    });
    const result = await response.json();
    status.textContent = response.ok && result.confirmed
      ? '이메일 주소를 확인했습니다.' : '확인 링크가 만료되었거나 이미 사용되었습니다.';
  } catch {
    status.textContent = '이메일 확인에 실패했습니다. 다시 시도해 주세요.';
    button.disabled = false;
  }
};
