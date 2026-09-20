/* Restaurant Specials authority: Dallas calendar/time, discovery, sorting and counts. */
(function(root,factory){
  const time=root.DtmDallasTime||(typeof module!=='undefined'&&module.exports?require('./dallas-time.js'):null);
  const active=root.DtmActiveState||(typeof module!=='undefined'&&module.exports?require('./active-state.js'):null);
  const api=factory(time,active);
  root.DtmRestaurantSpecials=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis,function(time,active){
  'use strict';
  if(!time||!active)throw new Error('DtmDallasTime and DtmActiveState must load first');
  const TYPES=new Set(['lunch_special','happy_hour']);
  const TYPE_LABELS={lunch_special:'점심특선',happy_hour:'해피아워'};
  const TYPE_ORDER=['lunch_special','happy_hour'];
  const VISIBLE_BATCH_SIZE=20;
  const TIME_RE=/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;
  const formatter=new Intl.DateTimeFormat('en-US',{timeZone:time.TIME_ZONE,weekday:'short',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  const WEEKDAY={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};
  function parts(now=Date.now()){
    const date=new Date(now);if(!Number.isFinite(date.getTime()))return null;
    const out=formatter.formatToParts(date).reduce((a,p)=>(a[p.type]=p.value,a),{});
    return {dateKey:`${out.year}-${out.month}-${out.day}`,weekday:WEEKDAY[out.weekday],minutes:Number(out.hour)*60+Number(out.minute),seconds:Number(out.second)};
  }
  function days(row={}){
    const raw=Array.isArray(row.days_of_week)?row.days_of_week:typeof row.days_of_week==='string'?row.days_of_week.split(','):[];
    const values=[...new Set(raw.map(Number).filter(v=>Number.isInteger(v)&&v>=0&&v<=6))];
    return values.sort((a,b)=>a-b);
  }
  function minutes(value){
    const raw=String(value||'').trim();if(!TIME_RE.test(raw))return null;
    const [h,m,s='0']=raw.split(':').map(Number);return h*60+m+s/60;
  }
  function validation(row={}){
    if(!TYPES.has(String(row.type||'')))return {valid:false,reason:'invalid_type'};
    const start=String(row.start_date||'').trim(),end=String(row.end_date||'').trim();
    if(start&&!time.validDateOnly(start))return {valid:false,reason:'invalid_start_date'};
    if(end&&!time.validDateOnly(end))return {valid:false,reason:'invalid_end_date'};
    if(start&&end&&start>end)return {valid:false,reason:'invalid_date_range'};
    const rawDays=row.days_of_week;
    if(rawDays!==null&&rawDays!==undefined&&String(rawDays)!==''&&!days(row).length)return {valid:false,reason:'invalid_days'};
    const hasStart=String(row.start_time||'').trim()!=='';
    const hasEnd=String(row.end_time||'').trim()!=='';
    if(hasStart!==hasEnd)return {valid:false,reason:'incomplete_time_range'};
    if(hasStart&&(minutes(row.start_time)===null||minutes(row.end_time)===null))return {valid:false,reason:'invalid_time'};
    return {valid:true,reason:''};
  }
  function enabled(row){return validation(row).valid&&active.explicitlyEnabled(row,'benefit');}
  function calendarState(row,now=Date.now()){
    if(!enabled(row))return 'invalid';
    return time.periodState(row.start_date||'',row.end_date||'',now);
  }
  function scheduleState(row,now=Date.now()){
    const p=parts(now);if(!p)return {key:'invalid'};
    const allowed=days(row);const start=minutes(row.start_time),end=minutes(row.end_time);
    const calendar=calendarState(row,now);
    if(calendar!=='active'){
      if(calendar==='ended'&&start!==null&&end!==null&&start>end&&p.minutes<end){
        const [y,m,d]=p.dateKey.split('-').map(Number),previousKey=new Date(Date.UTC(y,m-1,d-1)).toISOString().slice(0,10),previous=(p.weekday+6)%7;
        if(time.periodActiveOnDate(row.start_date||'',row.end_date||'',previousKey)&&(!allowed.length||allowed.includes(previous)))return {key:'now',day:p.weekday,overnight:true};
      }
      return {key:calendar};
    }
    if(start===null&&end===null)return {key:!allowed.length||allowed.includes(p.weekday)?'now':'upcoming',day:p.weekday};
    const todayAllowed=!allowed.length||allowed.includes(p.weekday);
    if(start===end)return {key:todayAllowed?'now':'upcoming',day:p.weekday};
    if(start<end){
      if(todayAllowed&&p.minutes>=start&&p.minutes<end)return {key:'now',day:p.weekday};
      return {key:todayAllowed&&p.minutes<start?'today':'upcoming',day:p.weekday};
    }
    const previous=(p.weekday+6)%7,previousAllowed=!allowed.length||allowed.includes(previous);
    if((todayAllowed&&p.minutes>=start)||(previousAllowed&&p.minutes<end))return {key:'now',day:p.weekday,overnight:true};
    return {key:todayAllowed&&p.minutes<start?'today':'upcoming',day:p.weekday,overnight:true};
  }
  function isActive(row,now=Date.now()){return scheduleState(row,now).key==='now';}
  function isDiscoverable(row,now=Date.now()){
    if(!enabled(row))return false;
    if(isActive(row,now))return true;
    return time.periodState('',row.end_date||'',now)!=='ended';
  }
  function discoverable(rows,now=Date.now()){return (Array.isArray(rows)?rows:[]).filter(row=>isDiscoverable(row,now));}
  function activeRecords(rows,now=Date.now()){return (Array.isArray(rows)?rows:[]).filter(row=>isActive(row,now));}
  function forBusiness(rows,businessId,now=Date.now(),{discoverableOnly=true}={}){
    const id=String(businessId||'');const source=discoverableOnly?discoverable(rows,now):(Array.isArray(rows)?rows:[]);
    return source.filter(row=>String(row.business_id||'')===id).sort((a,b)=>Number(a.sort_order||0)-Number(b.sort_order||0)||String(a.id).localeCompare(String(b.id)));
  }
  function filter(rows,type='all',now=Date.now()){
    const list=discoverable(rows,now);return type==='all'?list:list.filter(row=>row.type===type);
  }
  function rank(row,now){return ({now:0,today:1,upcoming:2,scheduled:3})[scheduleState(row,now).key]??9;}
  function sort(rows,now=Date.now()){return [...rows].sort((a,b)=>rank(a,now)-rank(b,now)||Number(a.sort_order||0)-Number(b.sort_order||0)||String(a.title||'').localeCompare(String(b.title||''),'ko'));}
  function visibleBatch(rows,visibleCount=VISIBLE_BATCH_SIZE){
    const source=Array.isArray(rows)?rows:[],count=Math.max(0,Math.min(source.length,Number(visibleCount)||VISIBLE_BATCH_SIZE));
    return {rows:source.slice(0,count),total:source.length,visibleCount:count,hasMore:count<source.length,nextCount:Math.min(source.length,count+VISIBLE_BATCH_SIZE)};
  }
  function recordCount(rows,now=Date.now()){return discoverable(rows,now).length;}
  function uniqueBusinessIds(rows,now=Date.now()){return [...new Set(discoverable(rows,now).map(row=>String(row.business_id||'')).filter(Boolean))];}
  function uniqueBusinessCount(rows,now=Date.now()){return uniqueBusinessIds(rows,now).length;}
  function activeKindsForBusiness(rows,businessId,now=Date.now()){
    const found=new Set(activeRecords(forBusiness(rows,businessId,now),now).map(row=>row.type));
    return TYPE_ORDER.filter(type=>found.has(type));
  }
  function discoverableKindsForBusiness(rows,businessId,now=Date.now()){
    const found=new Set(forBusiness(rows,businessId,now).map(row=>row.type));
    return TYPE_ORDER.filter(type=>found.has(type));
  }
  function statusLabel(row,now=Date.now()){
    const state=scheduleState(row,now).key;
    if(state==='now')return '지금 이용 가능';
    if(state==='today'&&row.start_time)return `오늘 ${formatTime(row.start_time)} 시작`;
    return state==='scheduled'?'이후 이용 가능':'이용 가능 일정 확인';
  }
  function formatTime(value){
    const total=minutes(value);if(total===null)return '';
    const hour=Math.floor(total/60)%24,minute=Math.floor(total%60),period=hour<12?'AM':'PM',shown=hour%12||12;
    return `${shown}:${String(minute).padStart(2,'0')} ${period}`;
  }
  return {TYPES,TYPE_LABELS,VISIBLE_BATCH_SIZE,parts,days,minutes,validation,calendarState,scheduleState,isActive,isDiscoverable,discoverable,activeRecords,forBusiness,filter,sort,visibleBatch,recordCount,uniqueBusinessIds,uniqueBusinessCount,activeKindsForBusiness,discoverableKindsForBusiness,statusLabel,formatTime};
});
