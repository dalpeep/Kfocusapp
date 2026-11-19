/* Shared DaltownMap date/time contract.
 * Date-only bounds are inclusive Dallas calendar dates.
 * Timestamp bounds are exact instants. Elapsed-hour rules remain duration based.
 */
(function(root,factory){
  const api=factory();
  root.DtmDallasTime=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis,function(){
  'use strict';
  const TIME_ZONE='America/Chicago';
  const DATE_RE=/^(\d{4})-(\d{2})-(\d{2})$/;
  const LOCAL_RE=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;
  const dateFormatter=new Intl.DateTimeFormat('en-US',{timeZone:TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'});
  const dateTimeFormatter=new Intl.DateTimeFormat('en-US',{timeZone:TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  const parts=(formatter,value)=>formatter.formatToParts(new Date(value)).reduce((out,part)=>(out[part.type]=part.value,out),{});
  function validDateOnly(value){
    const match=DATE_RE.exec(String(value||'').trim());
    if(!match)return '';
    const y=Number(match[1]),m=Number(match[2]),d=Number(match[3]);
    const check=new Date(Date.UTC(y,m-1,d));
    return check.getUTCFullYear()===y&&check.getUTCMonth()===m-1&&check.getUTCDate()===d?match[0]:'';
  }
  function dateKey(value=Date.now()){
    const date=new Date(value);
    if(!Number.isFinite(date.getTime()))return '';
    const p=parts(dateFormatter,date);
    return `${p.year}-${p.month}-${p.day}`;
  }
  function bound(value){
    if(value===null||value===undefined||String(value).trim()==='')return {kind:'none',value:null};
    const raw=String(value).trim();
    const day=validDateOnly(raw);
    if(day)return {kind:'date',value:day};
    if(DATE_RE.test(raw))return {kind:'invalid',value:null};
    const time=Date.parse(raw);
    return Number.isFinite(time)?{kind:'timestamp',value:time}:{kind:'invalid',value:null};
  }
  function periodState(start,end,now=Date.now()){
    const instant=Number(new Date(now).getTime());
    if(!Number.isFinite(instant))return 'invalid';
    const today=dateKey(instant),a=bound(start),b=bound(end);
    if(a.kind==='invalid'||b.kind==='invalid')return 'invalid';
    const before=a.kind==='date'?today<a.value:a.kind==='timestamp'?instant<a.value:false;
    if(before)return 'scheduled';
    const after=b.kind==='date'?today>b.value:b.kind==='timestamp'?instant>=b.value:false;
    return after?'ended':'active';
  }
  function periodActive(start,end,now=Date.now()){return periodState(start,end,now)==='active';}
  function withinElapsedHours(value,hours,now=Date.now()){
    const created=Date.parse(String(value||'')),instant=Number(new Date(now).getTime());
    if(!Number.isFinite(created)||!Number.isFinite(instant))return false;
    const age=instant-created;
    return age>=0&&age<Number(hours)*3600000;
  }
  function dateOrdinal(value){
    const key=validDateOnly(value)||dateKey(value);
    if(!key)return NaN;
    const [y,m,d]=key.split('-').map(Number);
    return Math.floor(Date.UTC(y,m-1,d)/86400000);
  }
  function zonedLocalToIso(value){
    const match=LOCAL_RE.exec(String(value||'').trim());
    if(!match)return '';
    const desired=[match[1],match[2],match[3],match[4],match[5],match[6]||'00'];
    if(!validDateOnly(desired.slice(0,3).join('-')))return '';
    const nums=desired.map(Number),ms=Number(String(match[7]||'0').padEnd(3,'0'));
    let instant=Date.UTC(nums[0],nums[1]-1,nums[2],nums[3],nums[4],nums[5],ms);
    const desiredUtc=instant;
    for(let i=0;i<4;i++){
      const p=parts(dateTimeFormatter,instant);
      const seen=Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day),Number(p.hour),Number(p.minute),Number(p.second),ms);
      instant+=desiredUtc-seen;
    }
    const final=parts(dateTimeFormatter,instant);
    const actual=[final.year,final.month,final.day,final.hour,final.minute,final.second];
    if(actual.some((part,index)=>part!==desired[index]))return '';
    return new Date(instant).toISOString();
  }
  function formatDateTimeLocal(value){
    const date=new Date(value);
    if(!Number.isFinite(date.getTime()))return '';
    const p=parts(dateTimeFormatter,date);
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  }
  function midnightIso(value){
    const key=validDateOnly(value);
    return key?zonedLocalToIso(`${key}T00:00:00`):'';
  }
  function dateReferenceIso(value){
    const key=validDateOnly(value);
    return key?zonedLocalToIso(`${key}T12:00:00`):'';
  }
  function periodActiveOnDate(start,end,value){
    const instant=dateReferenceIso(value);
    return !!instant&&periodActive(start,end,instant);
  }
  return {TIME_ZONE,validDateOnly,dateKey,bound,periodState,periodActive,periodActiveOnDate,withinElapsedHours,dateOrdinal,zonedLocalToIso,formatDateTimeLocal,midnightIso,dateReferenceIso};
});
