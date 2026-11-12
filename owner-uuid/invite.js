(() => {
  'use strict';

  const fragment = new URLSearchParams(location.hash.slice(1));
  if (fragment.get('type') !== 'invite') return;
  let token = fragment.get('token_hash');
  history.replaceState(history.state, '', location.pathname + location.search);

  window.OwnerInvite = Object.freeze({
    start(createClient, ready) {
      const form = document.getElementById('owner-invite');
      const status = document.getElementById('status');
      if (!token) {
        status.textContent = '초대 링크를 확인할 수 없습니다. 관리자에게 새 초대를 요청해 주세요.';
        return;
      }
      const client = createClient();
      let verified = false;
      form.hidden = false;
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const submit = form.querySelector('button');
        if (submit.disabled) return;
        const fields = new FormData(form);
        const password = fields.get('password');
        if (password !== fields.get('confirmation')) {
          status.textContent = '비밀번호와 확인 값이 일치하지 않습니다.';
          return;
        }
        submit.disabled = true;
        try {
          if (!verified) {
            const {data, error} = await client.auth.verifyOtp({token_hash: token, type: 'invite'});
            if (error || !data?.session || !data.user?.email_confirmed_at) {
              status.textContent = '초대를 확인하지 못했습니다. 링크가 만료됐거나 이미 사용됐다면 관리자에게 문의해 주세요.';
              return;
            }
            verified = true;
            token = null;
          }
          const {error} = await client.auth.updateUser({password});
          if (error) {
            status.textContent = '비밀번호를 저장하지 못했습니다. 이 화면에서 다시 시도해 주세요.';
            return;
          }
          form.reset();
          form.hidden = true;
          await ready();
          status.textContent = '이메일 인증과 비밀번호 설정이 완료됐습니다. 업주 계정으로 로그인해 주세요.';
        } catch {
          status.textContent = '연결을 확인하고 다시 시도해 주세요.';
        } finally {
          submit.disabled = false;
        }
      });
    },
  });
})();
