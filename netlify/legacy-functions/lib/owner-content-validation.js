'use strict';
const specialNullable=['start_date','end_date','start_time','end_time'];
function validateDates(kind,p){
 const reject=()=>{throw Object.assign(Error('날짜·시간과 요일을 확인해 주세요.'),{status:400});};
 if(kind==='special'){
  for(const k of ['start_date','end_date'])if(p[k]!==undefined&&p[k]!==null){if(!/^\d{4}-\d{2}-\d{2}$/.test(p[k])||!Number.isFinite(Date.parse(p[k]+'T00:00:00Z'))||new Date(p[k]+'T00:00:00Z').toISOString().slice(0,10)!==p[k])reject();}
  for(const k of ['start_time','end_time'])if(p[k]!==undefined&&p[k]!==null&&!/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(p[k]))reject();
  if(p.start_date&&p.end_date&&p.start_date>p.end_date)reject();
  if(Object.hasOwn(p,'start_time')&&Object.hasOwn(p,'end_time')&&Boolean(p.start_time)!==Boolean(p.end_time))reject();
 }else if(['coupon','event'].includes(kind)){
  for(const k of ['start_at','end_at'])if(p[k]!==undefined&&!Number.isFinite(Date.parse(p[k])))reject();
  if(p.start_at&&p.end_at&&Date.parse(p.start_at)>Date.parse(p.end_at))reject();
 }
}
module.exports={specialNullable,validateDates};
