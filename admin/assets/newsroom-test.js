import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const cfg = window.APP_CONFIG || window.KFOCUS_CONFIG || {};
const statusId = 'newsroomStatus';
function setStatus(message){ const el=document.getElementById(statusId); if(el) el.textContent=message; }
let authClient = null;
async function context(){
  if(!cfg.SUPABASE_URL||!cfg.SUPABASE_ANON_KEY) throw new Error('Supabase 설정을 찾지 못했습니다.');

  // 관리자 로그인 세션은 Supabase가 localStorage에 저장합니다.
  // persistSession:false로 별도 클라이언트를 만들면 기존 세션을 읽지 못해
  // Authorization에 anon key가 들어가므로 Edge Function에서 인증이 실패합니다.
  if(!authClient){
    authClient=createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY,{
      auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}
    });
  }

  let {data,error}=await authClient.auth.getSession();
  if(error) throw new Error(`관리자 로그인 세션 확인 실패: ${error.message}`);

  let session=data?.session||null;
  if(session?.expires_at && session.expires_at*1000-Date.now()<60000 && session.refresh_token){
    const refreshed=await authClient.auth.refreshSession();
    if(refreshed.error) throw new Error(`관리자 로그인 갱신 실패: ${refreshed.error.message}`);
    session=refreshed.data?.session||session;
  }

  if(!session?.access_token){
    throw new Error('관리자 로그인 세션이 없습니다. 관리자 화면에서 로그아웃 후 다시 로그인해 주세요.');
  }

  return {
    token:session.access_token,
    region:String(cfg.APP_REGION||cfg.app_region||cfg.APP_CITY||cfg.app_city||'dallas').toLowerCase()
  };
}
async function call(action, extra={}){
  const {token,region}=await context();
  const response=await fetch(`${String(cfg.SUPABASE_URL).replace(/\/$/,'')}/functions/v1/newsroom`,{method:'POST',headers:{'Content-Type':'application/json','apikey':cfg.SUPABASE_ANON_KEY,'Authorization':`Bearer ${token}`},body:JSON.stringify({action,region,...extra})});
  const raw=await response.text(); let result={}; try{result=raw?JSON.parse(raw):{}}catch{result={error:raw}}
  if(!response.ok||result?.ok===false) throw new Error(result?.error||result?.message||`HTTP ${response.status}`);
  return result;
}
async function busy(button,text,work){
  if(!button||button.dataset.busy==='1') return; const old=button.textContent; button.dataset.busy='1';button.disabled=true;button.textContent=text;
  try{return await work();}finally{button.disabled=false;button.textContent=old;button.dataset.busy='0';}
}
async function createTest(){
  const b=document.getElementById('newsroomTestPostBtn');
  await busy(b,'테스트 글 생성 중…',async()=>{try{setStatus('테스트 글을 생성하고 있습니다…');const r=await call('test_post');setStatus(`테스트 글 생성 완료 · ${r.post?.title||''}`);alert(`테스트 글을 생성했습니다.\n\n${r.post?.title||''}`);}catch(e){setStatus(`테스트 글 생성 실패 · ${e.message}`);alert(`테스트 글 생성 실패: ${e.message}`);}});
}
async function createRealArticle(){
  const b=document.getElementById('newsroomRealPostBtn');
  await busy(b,'실제 기사 생성 중…',async()=>{try{
    setStatus('1/2 · 후보 1건을 AI로 분류하고 있습니다…');
    const a=await call('analyze',{limit:1});
    setStatus(`2/2 · 기사 작성·게시 중… (분류 ${a.analyzed||0}건)`);
    const r=await call('publish_one');
    if(r.skipped){setStatus(`오늘 실제 기사가 이미 있습니다 · ${r.post?.title||''}`);alert(`오늘 실제 기사가 이미 게시되어 있습니다.\n\n${r.post?.title||''}`);return;}
    setStatus(`실제 기사 게시 완료 · ${r.post?.title||''}`);
    alert(`달라스 라이프에 실제 기사 1건을 게시했습니다.\n\n${r.post?.title||''}`);
  }catch(e){console.error('[Newsroom real article]',e);setStatus(`실제 기사 생성 실패 · ${e.message}`);alert(`실제 기사 생성 실패: ${e.message}`);}});
}
function ensureActionButtons(){
  const actions = document.querySelector('#section-newsroom .newsroom-actions');
  const collect = document.getElementById('newsroomCollectBtn');
  if (!actions && !collect) return {};

  let test = document.getElementById('newsroomTestPostBtn');
  if (!test) {
    test = document.createElement('button');
    test.id = 'newsroomTestPostBtn';
    test.className = 'btn primary';
    test.type = 'button';
    test.textContent = '🧪 테스트 글 생성';
    (collect || actions.firstElementChild)?.insertAdjacentElement('beforebegin', test);
  }

  let real = document.getElementById('newsroomRealPostBtn');
  if (!real) {
    real = document.createElement('button');
    real.id = 'newsroomRealPostBtn';
    real.className = 'btn primary';
    real.type = 'button';
    real.textContent = '📰 실제 기사 1건 생성';
    test.insertAdjacentElement('afterend', real);
  }
  return {test, real};
}

function bind(){
  const {test, real} = ensureActionButtons();
  if(test && !test.dataset.bound){
    test.dataset.bound='1';
    test.addEventListener('click',createTest);
  }
  if(real && !real.dataset.bound){
    real.dataset.bound='1';
    real.addEventListener('click',createRealArticle);
  }
  if(test || real) console.log('[Newsroom V59] 테스트·실제 기사 버튼 연결 완료');
}
document.addEventListener('DOMContentLoaded',bind);window.addEventListener('load',bind);setTimeout(bind,1500);
