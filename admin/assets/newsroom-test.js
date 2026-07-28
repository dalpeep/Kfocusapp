import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const cfg = window.APP_CONFIG || window.KFOCUS_CONFIG || {};
const buttonId = 'newsroomTestPostBtn';
const statusId = 'newsroomStatus';

function setStatus(message) {
  const el = document.getElementById(statusId);
  if (el) el.textContent = message;
}

async function callNewsroomTestPost() {
  const button = document.getElementById(buttonId);
  if (!button || button.dataset.testBusy === '1') return;

  const oldText = button.textContent;
  button.dataset.testBusy = '1';
  button.disabled = true;
  button.textContent = '테스트 글 생성 중…';
  setStatus('테스트 글을 생성하고 있습니다…');

  try {
    if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
      throw new Error('Supabase 설정을 찾지 못했습니다.');
    }

    const client = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    const { data: sessionData } = await client.auth.getSession();
    const accessToken = sessionData?.session?.access_token || cfg.SUPABASE_ANON_KEY;
    const region = String(cfg.APP_REGION || cfg.app_region || cfg.APP_CITY || cfg.app_city || 'dallas').toLowerCase();

    const response = await fetch(`${String(cfg.SUPABASE_URL).replace(/\/$/, '')}/functions/v1/newsroom`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': cfg.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({ action: 'test_post', region })
    });

    const raw = await response.text();
    let result = {};
    try { result = raw ? JSON.parse(raw) : {}; } catch (_) { result = { error: raw }; }

    if (!response.ok || result?.ok === false) {
      throw new Error(result?.error || result?.message || `HTTP ${response.status}`);
    }

    const title = result?.post?.title || result?.title || '테스트 글';
    setStatus(`테스트 글 생성 완료 · ${title}`);
    alert(`테스트 글을 생성했습니다.\n\n${title}\n\n달라스 라이프에서 확인하세요.`);
  } catch (error) {
    console.error('[Newsroom Test Post]', error);
    setStatus(`테스트 글 생성 실패 · ${error.message}`);
    alert(`테스트 글 생성 실패: ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = oldText;
    button.dataset.testBusy = '0';
  }
}

function bindNewsroomTestButton() {
  const button = document.getElementById(buttonId);
  if (!button || button.dataset.testBound === '1') return;
  button.dataset.testBound = '1';
  button.addEventListener('click', callNewsroomTestPost);
  console.log('[Newsroom Test Fix] 테스트 글 생성 버튼 연결 완료');
}

document.addEventListener('DOMContentLoaded', bindNewsroomTestButton);
window.addEventListener('load', bindNewsroomTestButton);
setTimeout(bindNewsroomTestButton, 1500);
