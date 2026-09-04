const {rest}=require('./coupon-campaign-lib');

const HEADERS={
  'Content-Type':'application/json; charset=utf-8',
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Methods':'GET, OPTIONS',
  'Cache-Control':'no-store, max-age=0'
};
const json=(statusCode,body)=>({statusCode,headers:HEADERS,body:JSON.stringify(body)});

function dallasDateKey(now=new Date()){
  const parts=new Intl.DateTimeFormat('en-US',{
    timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(now);
  const values={};
  for(const part of parts) values[part.type]=part.value;
  return `${values.year}-${values.month}-${values.day}`;
}

function isPublicFlyer(row,today){
  const status=String(row?.status||'').toLowerCase();
  const explicitlyPublished=row?.show_on_home===true||row?.show_on_home==='true';
  if(!explicitlyPublished||!['active','draft'].includes(status)) return false;
  const start=String(row?.start_date||'').slice(0,10);
  const end=String(row?.end_date||'').slice(0,10);
  return (!start||start<=today)&&(!end||end>=today);
}

exports.handler=async(event)=>{
  if(event.httpMethod==='OPTIONS') return json(200,{ok:true});
  if(event.httpMethod!=='GET') return json(405,{ok:false,error:'GET only'});
  try{
    const region=String(event.queryStringParameters?.region||'dallas').trim().toLowerCase();
    if(!/^[a-z-]{2,24}$/.test(region)) return json(400,{ok:false,error:'Invalid region'});
    const today=dallasDateKey();
    const rows=await rest(`weekly_flyers?select=*&region=eq.${encodeURIComponent(region)}&show_on_home=eq.true&order=updated_at.desc&limit=100`);
    const flyers=(Array.isArray(rows)?rows:[]).filter(row=>isPublicFlyer(row,today));
    const ids=flyers.map(row=>String(row.id||'')).filter(Boolean);
    const items=ids.length
      ? await rest(`weekly_flyer_items?select=*&flyer_id=in.(${ids.map(encodeURIComponent).join(',')})&order=id.asc`)
      : [];
    const byFlyer=new Map();
    for(const item of Array.isArray(items)?items:[]){
      const key=String(item.flyer_id||'');
      if(!byFlyer.has(key)) byFlyer.set(key,[]);
      byFlyer.get(key).push(item);
    }
    return json(200,{ok:true,today,flyers:flyers.map(row=>({
      ...row,weekly_flyer_items:byFlyer.get(String(row.id||''))||[]
    }))});
  }catch(error){
    console.error('[smart-flyer-public]',error);
    return json(500,{ok:false,error:'스마트 전단을 불러오지 못했습니다.'});
  }
};

exports._test={dallasDateKey,isPublicFlyer};
