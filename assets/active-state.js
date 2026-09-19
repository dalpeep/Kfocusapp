/* Authoritative coupon/event/benefit active-state and count contract. */
(function(root,factory){
  const time=root.DtmDallasTime||(typeof module!=='undefined'&&module.exports?require('./dallas-time.js'):null);
  const api=factory(time);
  root.DtmActiveState=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis,function(time){
  'use strict';
  if(!time)throw new Error('DtmDallasTime must load before DtmActiveState');
  const INACTIVE_STATUS=new Set(['draft','inactive','disabled','scheduled','expired','ended','cancelled','canceled','archived','deleted','hidden']);
  const falseFlag=(row,key)=>row?.[key]===false||row?.[key]==='false'||row?.[key]===0;
  function linkedBusinessIds(row={}){
    return [...new Set([row.businessId,row.business_id,row.bizId,row.biz_id,row.linked_business_id,...(Array.isArray(row.business_ids)?row.business_ids:[])].filter(Boolean).map(String))];
  }
  function bounds(row={},type='benefit'){
    if(type==='coupon'){
      const raffle=String(row.delivery_mode||'display')==='raffle';
      return {start:row.startAt||row.start_at||row.start_date||'',end:(raffle?row.raffle_end_at:'')||row.endAt||row.end_at||row.end_date||row.expire_date||''};
    }
    if(type==='event')return {start:row.event_start_at||row.start_at||row.startAt||row.start_date||'',end:row.event_end_at||row.end_at||row.endAt||row.end_date||''};
    if(type==='business-promotion')return {start:row.promo_start_at||row.start_at||row.start_date||'',end:row.promo_end_at||row.end_at||row.end_date||''};
    return {start:row.start_at||row.startAt||row.start_date||row.promo_start_at||'',end:row.end_at||row.endAt||row.end_date||row.promo_end_at||''};
  }
  function explicitlyEnabled(row={},type='benefit'){
    if(!row||row.deleted===true||row.hidden===true)return false;
    if(['is_active','isActive','active','enabled'].some(key=>falseFlag(row,key)))return false;
    if(INACTIVE_STATUS.has(String(row.status||'').trim().toLowerCase()))return false;
    if(type==='event'&&row.is_published===false)return false;
    if(type==='business-promotion'&&row.promo_enabled===false)return false;
    return true;
  }
  function isActive(row,type='benefit',now=Date.now(),context={}){
    if(!explicitlyEnabled(row,type))return false;
    if(context.region&&row?.region&&String(row.region).toLowerCase()!==String(context.region).toLowerCase())return false;
    const period=bounds(row,type);
    if(type==='event'&&(!period.start||!period.end))return false;
    return time.periodActive(period.start,period.end,now);
  }
  function activeRecords(rows,type,now=Date.now(),context={}){return (Array.isArray(rows)?rows:[]).filter(row=>isActive(row,type,now,context));}
  function hasForBusiness(rows,businessId,type,now=Date.now(),context={}){
    const id=String(businessId||'');
    return !!id&&activeRecords(rows,type,now,context).some(row=>linkedBusinessIds(row).includes(id));
  }
  function recordCount(rows,type,now=Date.now(),context={}){return activeRecords(rows,type,now,context).length;}
  function uniqueBusinessIds(rows,type,now=Date.now(),context={}){
    return [...new Set(activeRecords(rows,type,now,context).flatMap(linkedBusinessIds))];
  }
  function uniqueBusinessCount(rows,type,now=Date.now(),context={}){return uniqueBusinessIds(rows,type,now,context).length;}
  return {INACTIVE_STATUS,bounds,explicitlyEnabled,isActive,activeRecords,linkedBusinessIds,hasForBusiness,recordCount,uniqueBusinessIds,uniqueBusinessCount};
});
