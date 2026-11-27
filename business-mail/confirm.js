(() => {
  const params = new URLSearchParams(location.hash.slice(1));
  const purpose = params.get('purpose');
  const token = params.get('token') || '';
  history.replaceState(null,'',location.pathname);
  const form = document.querySelector('#confirmation');
  const status = document.querySelector('#status');
  const button = document.querySelector('#confirm');
  if (!['verify','unsubscribe'].includes(purpose) || !/^[a-f0-9]{64}$/.test(token)) {
    status.textContent = '올바른 이메일 링크를 다시 열어 주세요.';
    return;
  }
  const verify = purpose === 'verify';
  document.querySelector('#heading').textContent = verify ? '업소 이메일 인증' : '홍보 이메일 수신 거부';
  document.querySelector('#consent-choice').hidden = !verify;
  button.textContent = verify ? '이메일 인증하기' : '수신 거부하기';
  form.hidden = false;
  status.textContent = '';
  form.addEventListener('submit', async event => {
    event.preventDefault();
    button.disabled = true;
    try {
      const response = await fetch('https://ydrxuqmjzayejlnjzzew.supabase.co/functions/v1/business-mail-public?action=confirm',{
        method:'POST',headers:{'Content-Type':'application/json'},credentials:'omit',
        body:JSON.stringify({purpose,token,consent:verify && document.querySelector('#consent').checked})
      });
      if (response.status === 204 || response.status === 410) {
        form.hidden = true;
        status.textContent = response.status === 410 ? '이미 사용되었거나 만료된 링크입니다. 운영팀에 문의해 주세요.' :
          verify ? '이메일 인증이 완료되었습니다.' : '홍보 이메일 수신이 해제되었습니다.';
        return;
      }
      throw new Error('Confirmation failed');
    } catch {
      status.textContent = '지금은 처리할 수 없습니다. 다시 시도해 주세요.';
      button.disabled = false;
    }
  });
})();
