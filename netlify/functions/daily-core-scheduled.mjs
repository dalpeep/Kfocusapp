import dailyCore from './lib/daily-core.js';
import dallasTime from '../../assets/dallas-time.js';

const {ensureDailyCore}=dailyCore;
const headers={
  'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store, no-cache, must-revalidate'
};

function audit(event,details={}){
  console.info('[daily-core-scheduled]',JSON.stringify({
    event,
    dallas_date:dallasTime.dateKey(),
    ...details
  }));
}

export default async function(){
  const region=String(process.env.APP_REGION||'dallas').toLowerCase();
  try{
    audit('scheduled_invocation_received',{region});
    const result=await ensureDailyCore(region,{force:false});
    audit('generation_check_completed',{
      region,
      generated:Boolean(result?.generated),
      locked:Boolean(result?.locked),
      missing:Array.isArray(result?.missing)?result.missing:[],
      saved:Array.isArray(result?.saved)?result.saved.map(row=>({category:row.category,id:row.id,action:row.action})):[]
    });
    return new Response(JSON.stringify(result),{status:200,headers});
  }catch(error){
    console.error('[daily-core-scheduled]',JSON.stringify({
      event:'scheduled_invocation_failed',
      dallas_date:dallasTime.dateKey(),
      stage:error?.dailyCoreStage||'handler',
      message:error?.message||String(error)
    }));
    return new Response(JSON.stringify({ok:false,error:'Daily Core scheduled refresh failed.'}),{status:500,headers});
  }
}

// With the modern Netlify Function signature, `schedule` is enforced by the
// platform router and this function does not accept incoming web requests.
export const config={schedule:'15 11 * * *'};
