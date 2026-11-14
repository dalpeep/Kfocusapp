(() => {
  'use strict';
  const config = window.APP_CONFIG || {};
  const status = document.getElementById('status');
  const login = document.getElementById('auth');
  const account = document.getElementById('owner-auth');
  const signUp = document.getElementById('owner-signup');
  const redirect = 'https://daltownmap.com/owner-uuid/';
  const signedIn = document.getElementById('signed-in');
  const logout = document.getElementById('logout');
  if (location.origin !== 'https://daltownmap.com' ||
      config.SUPABASE_URL !== 'https://ydrxuqmjzayejlnjzzew.supabase.co' ||
      !config.SUPABASE_ANON_KEY || !window.supabase) {
    status.textContent = '운영 업주센터 연결 설정을 확인해 주세요.';
    return;
  }

  const createClient = options => window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY,
    {auth: {detectSessionInUrl: false, ...options}});

  async function startLogin({showLogin = false} = {}) {
    const client = createClient({storage: sessionStorage, persistSession: true});
    const showSession = active => {
      signedIn.hidden = !active;
      account.hidden = login.hidden = active;
      window.OwnerPilot.show(client, active);
    };
    const {data} = await client.auth.getSession();
    showSession(!showLogin && Boolean(data.session));
    const loginTab = document.getElementById('owner-login-tab');
    const signupTab = document.getElementById('owner-signup-tab');
    function selectAuth(signingUp) {
      loginTab.setAttribute('aria-pressed', String(!signingUp));
      signupTab.setAttribute('aria-pressed', String(signingUp));
      document.getElementById('owner-login-panel').hidden = signingUp;
      document.getElementById('owner-signup-panel').hidden = !signingUp;
      status.textContent = '';
    }
    loginTab.onclick = () => selectAuth(false);
    signupTab.onclick = () => selectAuth(true);
    signUp.addEventListener('submit', async event => {
      event.preventDefault();
      const button = signUp.querySelector('button');
      if (button.disabled) return;
      const fields = new FormData(signUp);
      const password = fields.get('password');
      if (password !== fields.get('confirmation')) {
        status.textContent = '비밀번호와 확인 값이 일치하지 않습니다.';
        return;
      }
      button.disabled = true;
      try {
        const {data, error} = await client.auth.signUp({
          email: String(fields.get('email')).trim(), password,
          options: {emailRedirectTo: redirect},
        });
        if (data?.session) await client.auth.signOut({scope:'local'});
        if (error || data?.session) {
          status.textContent = '가입 인증을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.';
          return;
        }
        signUp.reset();
        status.textContent = '인증 메일을 확인해 주세요. 기존 계정이 있다면 로그인 또는 비밀번호 찾기를 이용해 주세요.';
      } catch {
        status.textContent = '연결을 확인하고 다시 시도해 주세요.';
      } finally {
        button.disabled = false;
      }
    });
    const reset = document.getElementById('password-reset');
    reset.addEventListener('submit', async event => {
      event.preventDefault();
      const button = reset.querySelector('button');
      if (button.disabled) return;
      button.disabled = true;
      try {
        const email = String(new FormData(reset).get('email')).trim();
        const {error} = await client.auth.resetPasswordForEmail(email, {
          redirectTo: redirect,
        });
        status.textContent = error
          ? '재설정 메일을 요청하지 못했습니다. 잠시 후 다시 시도해 주세요.'
          : '등록된 이메일이라면 비밀번호 재설정 링크를 받을 수 있습니다.';
        if (!error) reset.reset();
      } catch {
        status.textContent = '연결을 확인하고 다시 시도해 주세요.';
      } finally {
        button.disabled = false;
      }
    });
    login.addEventListener('submit', async event => {
      event.preventDefault();
      const button = login.querySelector('button');
      if (button.disabled) return;
      button.disabled = true;
      try {
        const fields = new FormData(login);
        const {data: result, error} = await client.auth.signInWithPassword({
          email: String(fields.get('email')).trim(), password: fields.get('password'),
        });
        if (error || !result?.session) {
          status.textContent = '이메일 인증 상태와 로그인 정보를 확인해 주세요.';
          return;
        }
        login.reset();
        showSession(true);
        status.textContent = '';
      } catch {
        status.textContent = '연결을 확인하고 다시 로그인해 주세요.';
      } finally {
        button.disabled = false;
      }
    });
    logout.addEventListener('click', async () => {
      const {error} = await client.auth.signOut({scope: 'local'});
      if (error) {
        status.textContent = '로그아웃하지 못했습니다. 다시 시도해 주세요.';
        return;
      }
      showSession(false);
      status.textContent = '';
    });
  }

  if (window.OwnerInvite) {
    window.OwnerInvite.start(() => createClient({persistSession: false, autoRefreshToken: false}), startLogin);
  } else {
    void startLogin();
  }
})();
