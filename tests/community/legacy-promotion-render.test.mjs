import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {runInNewContext} from 'node:vm';

const source=readFileSync('assets/community.js','utf8');

test('outdated home requests cannot append another legacy promotion list',async()=>{
  const requests=[],openings=[];
  const elements=[];
  const container={
    isConnected:true,
    html:'',
    set innerHTML(value){this.html=value;elements.length=0;},
    insertAdjacentHTML(_position,markup){
      this.html+=markup;
      for(const match of markup.matchAll(/data-legacy-promotion="([^"]+)"/g)){
        elements.push({dataset:{legacyPromotion:match[1]}});
      }
    },
    querySelectorAll(){return elements;}
  };
  const active={dataset:{board:'business_promotion'}};
  const context={container,ensureUI(){},ensureHomeSearch(){},ui4RenderCategoryChips(){},el(){},
    esc:value=>String(value),cfg:()=>({APP_REGION:'dallas'}),ui4Categories:[],ui4Labels:{business_promotion:'업체홍보'},
    rpc:()=>new Promise(resolve=>requests.push(resolve)),document:{querySelector:()=>active},
    root:{openBoardPost:id=>openings.push(id)},
    homeCard:(row,mode)=>mode?'<button data-legacy-promotion="'+row.id+'"></button>':'<button></button>'
  };
  const home=source.slice(source.indexOf('renderHome=async function(container,selectedCategory='),
    source.indexOf('const ui4RenderList=renderList;'));
  const promotion=source.slice(source.indexOf('function uniqueLegacyPromotionRows('),
    source.indexOf('function lifeCategoryButton('));
  runInNewContext('let ui42HomeRequest=0,homeQuery="",renderHome;'+home+promotion+
    'globalThis.renderPromotion=renderPromotionHome;',context);
  const old=context.renderPromotion(container,[{id:'old'}]);
  const recent=context.renderPromotion(container,[{id:'a'},{id:'a'},{id:'b'}]);
  requests[1]([{id:'current'}]);
  await recent;
  requests[0]([{id:'old-public'}]);
  await old;
  assert.equal((container.html.match(/기존 업소탐방/g)||[]).length,1);
  assert.deepEqual(elements.map(element=>element.dataset.legacyPromotion),['a','b']);
  elements[1].onclick();
  assert.deepEqual(openings,['b']);
});
