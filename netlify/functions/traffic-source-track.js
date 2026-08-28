function json(status, body){
  return {statusCode:status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},body:JSON.stringify(body)};
}
function env(){
  const base=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
  const service=String(process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_KEY||'').trim();
  if(!base||!service) throw new Error('Supabase server environment variables are missing.');
  return {base,service};
}
async function rest(path,opt={}){
  const {base,service}=env();
  const r=await fetch(`${base}/rest/v1/${path}`,{...opt,headers:{apikey:service,Authorization:`Bearer ${service}`,'Content-Type':'application/json',...(opt.headers||{})}});
  const t=await r.text();
  if(!r.ok) throw new Error(t||`Supabase HTTP ${r.status}`);
  return t?JSON.parse(t):null;
}
function clean(v,max){return String(v||'').trim().toLowerCase().replace(/[^a-z0-9._-]/g,'-').replace(/-+/g,'-').slice(0,max||80)}
async function verifyAdmin(event){
  const auth=String(event.headers?.authorization||event.headers?.Authorization||'');
  const token=auth.replace(/^Bearer\s+/i,'').trim();
  if(!token) throw new Error('관리자 로그인 토큰이 없습니다.');
  const {base,service}=env();
  const ures=await fetch(`${base}/auth/v1/user`,{headers:{apikey:service,Authorization:`Bearer ${token}`}});
  const user=await ures.json().catch(()=>null);
  if(!ures.ok||!user?.id) throw new Error('관리자 로그인을 확인할 수 없습니다.');
  const rows=await rest(`profiles?select=role&user_id=eq.${encodeURIComponent(user.id)}&limit=1`);
  const p=Array.isArray(rows)?rows[0]:null;
  if(!p||!['super_admin','regional_editor','regional_admin','admin'].includes(String(p.role||''))) throw new Error('관리자 권한이 없습니다.');
  return user;
}
function countBy(rows,key,filter){
  const m=new Map();
  for(const row of rows){
    if(filter&&!filter(row)) continue;
    const v=String(row[key]||'').trim(); if(!v) continue;
    m.set(v,(m.get(v)||0)+1);
  }
  return [...m.entries()].map(([k,count])=>({[key]:k,count})).sort((a,b)=>b.count-a.count);
}
exports.handler=async(event)=>{
  if(event.httpMethod==='OPTIONS') return json(200,{ok:true});
  try{
    if(event.httpMethod==='POST'){
      const b=JSON.parse(event.body||'{}');
      const source=clean(b.source,40);
      if(!source) return json(400,{ok:false,error:'source가 필요합니다.'});
      const place=clean(b.place,80)||null;
      const campaign=clean(b.campaign,80)||null;
      const path=String(b.path||'/').slice(0,300);
      let referrer=String(b.referrer||'').slice(0,500);
      try{ if(referrer){const u=new URL(referrer); referrer=`${u.origin}${u.pathname}`.slice(0,500);} }catch(_e){referrer='';}
      await rest('traffic_source_visits',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({source,place,campaign,path,referrer:referrer||null})});
      return json(200,{ok:true});
    }
    if(event.httpMethod==='GET'){
      await verifyAdmin(event);
      const raw=String(event.queryStringParameters?.days||'30').toLowerCase();
      let since='';
      if(raw!=='all'){
        const days=Math.max(1,Math.min(3650,Number(raw)||30));
        since=new Date(Date.now()-days*86400000).toISOString();
      }
      const filter=since?`&created_at=gte.${encodeURIComponent(since)}`:'';
      const rows=await rest(`traffic_source_visits?select=source,place,campaign,created_at${filter}&order=created_at.desc&limit=10000`);
      const arr=Array.isArray(rows)?rows:[];
      const todayStart=new Date();todayStart.setHours(0,0,0,0);
      const today=arr.filter(x=>new Date(x.created_at)>=todayStart).length;
      return json(200,{ok:true,total:arr.length,today,sources:countBy(arr,'source'),places:countBy(arr,'place',r=>String(r.source||'')==='flyer'),campaigns:countBy(arr,'campaign')});
    }
    return json(405,{ok:false,error:'GET/POST only'});
  }catch(e){
    console.error('[traffic-source-track]',e);
    return json(500,{ok:false,error:e.message||String(e)});
  }
};
