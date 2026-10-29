(()=>{'use strict';
function group(category,groups){const text=String(category||'').toLowerCase();return (groups||[]).find(g=>g.key!=='general'&&(g.terms||[]).some(term=>term&&text.includes(term.toLowerCase())))?.key||'general';}
function choices(catalog,category){const key=group(category,catalog?.groups);return (catalog?.options||[]).filter(o=>o.category_key==='general'||o.category_key===key);}
function fill(select,options,current='',useId=false){select.replaceChildren();const add=(value,label)=>{const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option);};add('','소개 선택 안 함');if(current&&!useId&&!options.some(o=>o.phrase===current))add(current,'기존 소개 유지 — '+current);for(const o of options)add(useId?o.id:o.phrase,`${o.locale==='en'?'English':'한국어'} · ${o.phrase}`);select.value=[...select.options].some(o=>o.value===current)?current:'';}
function registration(form,catalog){let select=form.querySelector('[name=description_choice]');if(!select){const label=document.createElement('label');label.textContent='업소 소개 선택 (한국어 / English)';select=document.createElement('select');select.name='description_choice';label.append(select);const help=document.createElement('p');help.textContent='업종에 맞는 문구를 선택하세요. 관리자 승인 후 새 업소에 적용됩니다.';label.append(help);form.elements.category_ko.closest('label').after(label);}
const category=form.elements.category_ko;const refresh=()=>fill(select,choices(catalog,category.value),select.value,true);category.oninput=refresh;refresh();}
window.OwnerDescriptions={group,choices,fill,registration};
})();
