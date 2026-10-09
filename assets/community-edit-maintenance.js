(function(){'use strict';
let paused=false,message='게시글 수정 기능을 잠시 점검 중입니다. 잠시 후 다시 시도해 주세요.';
function paint(){document.querySelectorAll('[data-owner-action="update"]').forEach(button=>{
 if(paused){if(!button.dataset.beforePause)button.dataset.beforePause=button.textContent;if(button.textContent!=='수정 · 임시 중단')button.textContent='수정 · 임시 중단';button.title=message;button.setAttribute('aria-disabled','true');}
 else if(button.dataset.beforePause){button.textContent=button.dataset.beforePause;delete button.dataset.beforePause;button.removeAttribute('title');button.removeAttribute('aria-disabled');}
});}
async function refresh(){try{const r=await fetch('/.netlify/functions/community-edit-status',{cache:'no-store'});if(!r.ok)return;const data=await r.json();paused=data.edit_paused===true;if(data.message)message=data.message;paint();}catch{}}
document.addEventListener('click',e=>{if(paused&&e.target.closest('[data-owner-action="update"]')){e.preventDefault();e.stopImmediatePropagation();alert(message);}},true);
new MutationObserver(paint).observe(document.body,{childList:true,subtree:true});
refresh();document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});setInterval(refresh,30000);
})();
