/* Canonical unique-business authority for public discount/event counts. */
(function(root,factory){
  const api=factory();
  root.DtmBenefitBusinessAuthority=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis,function(){
  'use strict';
  function idsForKind(records,kind){
    const ids=new Set();
    (Array.isArray(records)?records:[]).forEach(record=>{
      if(record?.kind!==kind)return;
      (Array.isArray(record.businessIds)?record.businessIds:[]).forEach(id=>{
        const key=String(id||'').trim();if(key)ids.add(key);
      });
    });
    return ids;
  }
  const activeDiscountBusinessIds=records=>idsForKind(records,'promotion');
  const activeEventBusinessIds=records=>idsForKind(records,'event');
  return {idsForKind,activeDiscountBusinessIds,activeEventBusinessIds};
});
