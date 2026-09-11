/* Shared public home selection. Extracted unchanged from production V312.
 * No DOM, network, storage or analytics. Both public and admin use this implementation.
 * Fixed placement means an active paid group with rotation_enabled=false.
 * Free records, including legacy unpaid group flags, retain the public 168-hour rule.
 */
(function(root){
'use strict';
function create(options={}){
 const NativeDate=globalThis.Date;
 const instant=options.now ?? NativeDate.now();
 class Date extends NativeDate { constructor(...args){super(...(args.length?args:[instant]));} static now(){return instant;} }
 const currentLocationPosition=options.origin || null;
 const v295WeeklyClickCounts=options.clickCounts || new Map();
function todayKey(){
  // V232: 관리자 로테이션 미리보기와 실제 앱이 같은 Dallas 날짜를 사용합니다.
  try{
    return new Intl.DateTimeFormat('en-CA',{
      timeZone:'America/Chicago',
      year:'numeric',month:'2-digit',day:'2-digit'
    }).format(new Date());
  }catch(_){
    return new Date().toISOString().slice(0,10);
  }
}
function businessGroupRank(b, section){
  if(section === 'featured') return Number(b.featured_rank ?? 1000);
  if(section === 'new') return Number(b.new_rank ?? 1000);
  if(section === 'popular') return Number(b.popular_rank ?? 1000);
  return 1000;
}
function rotationDateKey(dateValue){
  return String(dateValue || new Date().toISOString().slice(0,10)).slice(0,10);
}
function rotationHash(seed){
  let h = 2166136261;
  for(let i=0;i<seed.length;i++){
    h ^= seed.charCodeAt(i);
    h += (h<<1)+(h<<4)+(h<<7)+(h<<8)+(h<<24);
  }
  return Math.abs(h>>>0);
}
function paidAdActiveOnDate(b, dateValue){
  const dateKey=rotationDateKey(dateValue);
  if(b.is_active===false || b.list_visible===false || b.paid_active!==true) return false;
  if(b.paid_start_at && String(b.paid_start_at).slice(0,10)>dateKey) return false;
  if(b.paid_end_at && String(b.paid_end_at).slice(0,10)<dateKey) return false;
  return true;
}
function sectionAssigned(b, section){
  if(section==='featured') return b.is_featured===true;
  if(section==='new') return b.is_new===true;
  if(section==='popular') return b.is_popular===true;
  return false;
}
function v293DistanceOrigin(){
  const p = currentLocationPosition;
  if(!p) return null;
  const lat = Number(p.lat), lng = Number(p.lng);
  if(!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if(lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return {lat,lng};
}
function v292ValidBusinessCoords(latValue, lngValue){
  if(latValue === null || latValue === undefined || lngValue === null || lngValue === undefined) return false;
  if(String(latValue).trim() === '' || String(lngValue).trim() === '') return false;
  const lat = Number(latValue);
  const lng = Number(lngValue);
  if(!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if(lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  if(Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001) return false;
  return true;
}
function haversineMiles(lat1,lng1,lat2,lng2){ const toRad=v=>v*Math.PI/180; const R=3958.8; const dLat=toRad(lat2-lat1); const dLng=toRad(lng2-lng1); const a=Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2; return 2*R*Math.asin(Math.sqrt(a)); }
function v295PublicActiveBusiness(b){
  return !!b &&
    b.is_active!==false &&
    b.status!=='hidden' &&
    b.list_visible!==false &&
    b.listing_visible!==false;
}
function v295PaidPool(allRows,dateValue,section){
  const dateKey=rotationDateKey(dateValue);
  return (allRows||[]).filter(b=>
    v295PublicActiveBusiness(b) &&
    paidAdActiveOnDate(b,dateKey) &&
    (!section || sectionAssigned(b,section))
  );
}
function v295FreePool(allRows,dateValue){
  const dateKey=rotationDateKey(dateValue);
  return (allRows||[]).filter(b=>
    v295PublicActiveBusiness(b) && !paidAdActiveOnDate(b,dateKey)
  );
}
function v295PaidOrder(rows,section,dateValue){
  const dateKey=rotationDateKey(dateValue);
  const fixed=(rows||[]).filter(b=>b.rotation_enabled===false)
    .sort((a,b)=>
      businessGroupRank(a,section)-businessGroupRank(b,section) ||
      String(b.created_at||'').localeCompare(String(a.created_at||''))
    );
  const rotating=(rows||[]).filter(b=>b.rotation_enabled!==false)
    .sort((a,b)=>{
      const aw=Math.max(1,Number(a.paid_weight||1));
      const bw=Math.max(1,Number(b.paid_weight||1));
      return rotationHash(`${dateKey}|v295-paid|${section}|${a.id}`)/aw -
             rotationHash(`${dateKey}|v295-paid|${section}|${b.id}`)/bw;
    });
  return [...fixed,...rotating];
}
function v295CalendarDayNumber(dateKey){
  const [y,m,d]=String(dateKey||todayKey()).split('-').map(Number);
  return Math.floor(Date.UTC(y||1970,(m||1)-1,d||1)/86400000);
}
function v295RotateChunk(rows,dateValue,limit,seed='default'){
  const list=[...(rows||[])];
  if(list.length<=limit) return list;
  const dateKey=rotationDateKey(dateValue);
  // 날짜가 바뀔 때 다음 묶음으로 넘어가 전체 후보가 순차적으로 노출됩니다.
  const day=v295CalendarDayNumber(dateKey);
  const base=rotationHash(`v295|${seed}`)%list.length;
  const offset=(base + (day*limit)) % list.length;
  const out=[];
  for(let i=0;i<Math.min(limit,list.length);i++) out.push(list[(offset+i)%list.length]);
  return out;
}
function v295DistanceOrderedFree(rows,dateValue){
  const dateKey=rotationDateKey(dateValue);
  const fallback=[...(rows||[])].sort((a,b)=>
    rotationHash(`${dateKey}|v295-featured|${a.id}`)-rotationHash(`${dateKey}|v295-featured|${b.id}`)
  );
  const origin=v293DistanceOrigin();
  if(!origin) return fallback;
  return [...(rows||[])].sort((a,b)=>{
    const av=v292ValidBusinessCoords(a.lat,a.lng), bv=v292ValidBusinessCoords(b.lat,b.lng);
    if(av&&!bv) return -1;
    if(!av&&bv) return 1;
    if(av&&bv){
      const da=haversineMiles(origin.lat,origin.lng,Number(a.lat),Number(a.lng));
      const db=haversineMiles(origin.lat,origin.lng,Number(b.lat),Number(b.lng));
      if(Math.abs(da-db)>0.01) return da-db;
    }
    return rotationHash(`${dateKey}|v295-featured-tie|${a.id}`)-rotationHash(`${dateKey}|v295-featured-tie|${b.id}`);
  });
}
function v295CreatedAtMs(b){
  const t=new Date(b?.created_at||0).getTime();
  return Number.isFinite(t)?t:0;
}
function v295IsNewWithin7Days(b){
  const t=v295CreatedAtMs(b);
  if(!t) return false;
  const age=Date.now()-t;
  return age>=0 && age < 7*24*60*60*1000;
}
function v295WeekStartDateKey(dateValue=todayKey()){
  const [y,m,d]=rotationDateKey(dateValue).split('-').map(Number);
  const dt=new Date(Date.UTC(y,m-1,d));
  const dow=dt.getUTCDay(); // Sun=0
  const subtract=(dow+6)%7; // Monday=0
  dt.setUTCDate(dt.getUTCDate()-subtract);
  return dt.toISOString().slice(0,10);
}
function v295ChicagoMidnightUtcIso(dateKey){
  try{
    const [y,m,d]=String(dateKey).split('-').map(Number);
    const desired=Date.UTC(y,m-1,d,0,0,0);
    const probe=new Date(desired);
    const parts=new Intl.DateTimeFormat('en-US',{
      timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit',
      hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'
    }).formatToParts(probe).reduce((o,p)=>(o[p.type]=p.value,o),{});
    const seenAsUtc=Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day),Number(parts.hour),Number(parts.minute),Number(parts.second));
    const offset=seenAsUtc-desired;
    return new Date(desired-offset).toISOString();
  }catch(_){
    return `${dateKey}T00:00:00.000Z`;
  }
}
function v295PopularFreeOrder(rows,dateValue){
  const dateKey=rotationDateKey(dateValue);
  return [...(rows||[])].sort((a,b)=>{
    const ac=Number(v295WeeklyClickCounts.get(String(a.id))||0);
    const bc=Number(v295WeeklyClickCounts.get(String(b.id))||0);
    if(ac!==bc) return bc-ac;
    return rotationHash(`${dateKey}|v295-popular-tie|${a.id}`)-rotationHash(`${dateKey}|v295-popular-tie|${b.id}`);
  });
}
function v296NormText(v){
  return String(v||'').toLowerCase().replace(/\s+/g,' ').trim();
}
function v296BusinessDedupeKey(b){
  const id=v296NormText(b?.id);
  const name=v296NormText(b?.name);
  const address=v296NormText(b?.address);
  const phone=v296NormText(b?.phone).replace(/\D/g,'');
  // 같은 지점 판별은 이름+주소를 우선. 주소가 없으면 이름+전화번호를 사용합니다.
  if(name && address) return `na:${name}|${address}`;
  if(name && phone) return `np:${name}|${phone}`;
  return id ? `id:${id}` : `fallback:${name}|${address}|${phone}`;
}
function v296DedupeBusinesses(rows){
  const out=[];
  const seen=new Set();
  for(const b of (rows||[])){
    const key=v296BusinessDedupeKey(b);
    if(seen.has(key)) continue;
    seen.add(key);
    out.push(b);
  }
  return out;
}
function v296BuildGroup(section,dateValue,allRows,limit){
  const cleanRows=v296DedupeBusinesses(allRows||[]);
  const paidOrdered=v295PaidOrder(v295PaidPool(cleanRows,dateValue,section),section,dateValue);
  const paidShown=v296DedupeBusinesses(paidOrdered).slice(0,limit);
  const paidKeys=new Set(paidShown.map(v296BusinessDedupeKey));
  const need=Math.max(0,limit-paidShown.length);
  if(!need) return {rows:paidShown,paid:paidShown.length,free:0};

  // 유료로 이미 노출된 동일 업소는 무료 후보에서 다시 나오지 않게 합니다.
  const free=v295FreePool(cleanRows,dateValue).filter(b=>!paidKeys.has(v296BusinessDedupeKey(b)));
  let freeShown=[];
  if(section==='featured'){
    const ordered=v295DistanceOrderedFree(free,dateValue);
    if(v293DistanceOrigin()){
      // 실제 GPS가 있으면 반드시 가까운 순서부터 노출합니다.
      // 같은 거리권의 동률만 V295의 날짜 해시가 tie-breaker로 순환시킵니다.
      freeShown=ordered.slice(0,need);
    }else{
      // 위치 권한이 없을 때만 기존 전체 로테이션을 사용합니다.
      freeShown=v295RotateChunk(ordered,dateValue,need,'featured');
    }
  }else if(section==='new'){
    const fresh=free.filter(v295IsNewWithin7Days).sort((a,b)=>
      v295CreatedAtMs(b)-v295CreatedAtMs(a) ||
      rotationHash(`${rotationDateKey(dateValue)}|v296-new|${a.id}`)-rotationHash(`${rotationDateKey(dateValue)}|v296-new|${b.id}`)
    );
    freeShown=fresh.slice(0,need);
  }else if(section==='popular'){
    freeShown=v295PopularFreeOrder(free,dateValue).slice(0,need);
  }
  freeShown=v296DedupeBusinesses(freeShown).slice(0,need);
  return {rows:v296DedupeBusinesses([...paidShown,...freeShown]).slice(0,limit),paid:paidShown.length,free:freeShown.length};
}
function canonicalHomeGroups(dateValue=todayKey(),allRows=businesses,limit=6){
  const featured=v296BuildGroup('featured',dateValue,allRows||[],limit);
  const fresh=v296BuildGroup('new',dateValue,allRows||[],limit);
  const popular=v296BuildGroup('popular',dateValue,allRows||[],limit);
  return {
    featured:featured.rows,
    new:fresh.rows,
    popular:popular.rows,
    meta:{
      featured:{paid:featured.paid,free:featured.free},
      new:{paid:fresh.paid,free:fresh.free},
      popular:{paid:popular.paid,free:popular.free}
    }
  };
}
 return {select:canonicalHomeGroups,day:todayKey,weekStart:v295WeekStartDateKey,midnight:v295ChicagoMidnightUtcIso,paid:paidAdActiveOnDate};
}
// Matches the fields and initial dedupe used by public loadRealData(). Input order is created_at DESC NULLS LAST.
function prepareRows(rows,region){
 const seen=new Set();
 return rows.filter(r=>r.is_active===true && r.list_visible!==false && String(r.region||'dallas').toLowerCase()===region).map(r=>({...r,
 name:r.name_ko||r.name_en||r.name||'이름 없음',address:r.address||'',phone:r.phone||'',
 lat:r.lat==null||String(r.lat).trim()===''?null:Number(r.lat),lng:r.lng==null||String(r.lng).trim()===''?null:Number(r.lng),
 paid_active:!!r.paid_active,rotation_enabled:r.rotation_enabled!==false,
 featured_rank:r.featured_rank==null?1000:Number(r.featured_rank),new_rank:r.new_rank==null?1000:Number(r.new_rank),popular_rank:r.popular_rank==null?1000:Number(r.popular_rank)
 })).filter(b=>{const key=[b.name.trim().toLowerCase(),b.address.trim().toLowerCase(),b.lat==null?'':b.lat.toFixed(4),b.lng==null?'':b.lng.toFixed(4)].join('|');if(seen.has(key))return false;seen.add(key);return true;});
}
root.DtmHomeSelection={create,prepareRows};
if(typeof module!=='undefined' && module.exports) module.exports=root.DtmHomeSelection;
})(globalThis);
