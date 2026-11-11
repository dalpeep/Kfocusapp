/* Structured menu-item helpers for Restaurant Specials Phase 1.1. */
(function(root,factory){
  const api=factory();
  root.DtmRestaurantSpecialItems=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis,function(){
  'use strict';
  const CARD_ITEM_LIMIT=4;
  function normalize(row={}){
    return {id:row.id,special_id:row.special_id,item_name:String(row.item_name||'').trim(),description:String(row.description||'').trim(),price_text:String(row.price_text||'').trim(),sort_order:Number(row.sort_order||0)};
  }
  function valid(row){return !!normalize(row).item_name;}
  function sort(rows){return (Array.isArray(rows)?rows:[]).filter(valid).map(normalize).sort((a,b)=>a.sort_order-b.sort_order||String(a.id||'').localeCompare(String(b.id||'')));}
  function group(rows){const out=new Map();sort(rows).forEach(row=>{const key=String(row.special_id||'');if(!key)return;if(!out.has(key))out.set(key,[]);out.get(key).push(row);});return out;}
  function forSpecial(rows,specialId){return sort(rows).filter(row=>String(row.special_id||'')===String(specialId||''));}
  function cardItems(rows,specialId,limit=CARD_ITEM_LIMIT){const all=forSpecial(rows,specialId);return {rows:all.slice(0,limit),total:all.length,remaining:Math.max(0,all.length-limit)};}
  return {CARD_ITEM_LIMIT,normalize,valid,sort,group,forSpecial,cardItems};
});
