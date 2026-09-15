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

// V269: one current published flyer per business; never let edits to an old
// flyer or its missing main image create a second home carousel entry.
function currentFlyers(rows,today){
  const selected=new Map();
  const date=value=>String(value||'');
  const hasMain=row=>[row.market_main_image_url,row.market_main_image_url_2]
    .some(value=>/^https?:\/\//i.test(String(value||'').trim()));
  const compare=(a,b)=>date(a.start_date).localeCompare(date(b.start_date))
    ||date(a.created_at).localeCompare(date(b.created_at))
    ||Number(hasMain(a))-Number(hasMain(b))
    ||Number(a.id||0)-Number(b.id||0);
  for(const row of Array.isArray(rows)?rows:[]){
    if(!isPublicFlyer(row,today))continue;
    const key=String(row.business_id||row.featured_business_id||`flyer-${row.id}`);
    const previous=selected.get(key);
    if(!previous||compare(row,previous)>0)selected.set(key,row);
  }
  return [...selected.values()];
}

exports.handler=async(event)=>{
  if(event.httpMethod==='OPTIONS') return json(200,{ok:true});
  if(event.httpMethod!=='GET') return json(405,{ok:false,error:'GET only'});
  try{
    const region=String(event.queryStringParameters?.region||'dallas').trim().toLowerCase();
    if(!/^[a-z-]{2,24}$/.test(region)) return json(400,{ok:false,error:'Invalid region'});
    const today=dallasDateKey();
    const rows=await rest(`weekly_flyers?select=*&region=eq.${encodeURIComponent(region)}&show_on_home=eq.true&order=updated_at.desc&limit=100`);
    const flyers=currentFlyers(rows,today);
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

exports._test={dallasDateKey,isPublicFlyer,currentFlyers};
