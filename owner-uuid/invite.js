(() => {
  'use strict';

  const fragment = new URLSearchParams(location.hash.slice(1));
  const type = fragment.get('type');
  const recovery = type === 'recovery';
  const signup = type === 'signup' || type === 'email';
  if (type !== 'invite' && !recovery && !signup && !fragment.has('error_code')) return;
  let token = fragment.get('token_hash');
  let recoverySession = (recovery || signup) && fragment.has('access_token') && fragment.has('refresh_token')
    ? {access_token: fragment.get('access_token'), refresh_token: fragment.get('refresh_token')}
    : null;
  for (const key of [...fragment.keys()]) fragment.delete(key);
  history.replaceState(history.state, '', location.pathname + location.search);

  window.OwnerInvite = Object.freeze({
    async start(createClient, ready) {
      const form = document.getElementById('owner-invite');
      const status = document.getElementById('status');
      if (!token && !recoverySession) {
        void ready();
        status.textContent = '인증 링크를 확인할 수 없습니다. 새 링크를 요청해 주세요.';
        return;
      }
      const client = createClient();
      if (signup) {
        try {
          const result = token
            ? await client.auth.verifyOtp({token_hash: token, type: 'email'})
            : await client.auth.setSession(recoverySession);
          const {data: identity, error} = result.error ? {} : await client.auth.getUser();
          const confirmed = !error && result.data?.session && identity?.user?.email_confirmed_at
            && identity.user.id === result.data.user?.id;
          if (confirmed) history.replaceState(history.state, '', location.pathname + location.search + '#find');
          await ready({showLogin:true});
          status.textContent = confirmed
            ? '이메일 인증을 완료했습니다. 로그인해 소유권 신청 가능 여부를 확인해 주세요.'
            : '인증 링크가 만료됐거나 이미 사용됐습니다.';
        } catch {
          await ready({showLogin:true});
          status.textContent = '이메일 인증을 확인하지 못했습니다.';
        } finally {
          token = recoverySession = null;
        }
        return;
      }
      let verified = false;
      if (recovery) {
        form.querySelector('h2').textContent = '비밀번호 재설정';
        form.querySelector('button').textContent = '새 비밀번호 저장';
      }
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
            const {data, error} = token
              ? await client.auth.verifyOtp({token_hash: token, type})
              : await client.auth.setSession(recoverySession);
            if (error || !data?.session || !data.user?.email_confirmed_at) {
              status.textContent = '인증 링크가 만료됐거나 이미 사용됐습니다. 새 링크를 요청해 주세요.';
              return;
            }
            const {data: identity, error: identityError} = await client.auth.getUser();
            if (identityError || identity?.user?.id !== data.user.id || !identity?.user?.email_confirmed_at) {
              status.textContent = '인증 세션을 확인하지 못했습니다. 새 링크를 요청해 주세요.';
              return;
            }
            verified = true;
            token = null;
            recoverySession = null;
          }
          const {error} = await client.auth.updateUser({password});
          if (error) {
            status.textContent = '비밀번호를 저장하지 못했습니다. 이 화면에서 다시 시도해 주세요.';
            return;
          }
          form.reset();
          form.hidden = true;
          await ready({showLogin: true});
          status.textContent = recovery
            ? '비밀번호를 재설정했습니다. 새 비밀번호로 로그인해 주세요.'
            : '이메일 인증과 비밀번호 설정이 완료됐습니다. 업주 계정으로 로그인해 주세요.';
        } catch {
          status.textContent = '연결을 확인하고 다시 시도해 주세요.';
        } finally {
          submit.disabled = false;
        }
      });
    },
  });
})();
