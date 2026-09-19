import dailyCore from './lib/daily-core.js';

const {ensureDailyCore}=dailyCore;

export default async function(){
  const region=String(process.env.APP_REGION||'dallas').toLowerCase();
  try{
    const result=await ensureDailyCore(region,{force:false});
    return new Response(JSON.stringify(result),{
      status:200,
      headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, no-cache, must-revalidate'}
    });
  }catch(error){
    console.error('[daily-core-scheduled]',JSON.stringify({
      event:'scheduled_invocation_failed',
      stage:error?.dailyCoreStage||'handler',
      message:error?.message||String(error)
    }));
    return new Response(JSON.stringify({ok:false,error:'Daily Core scheduled refresh failed.'}),{
      status:500,
      headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, no-cache, must-revalidate'}
    });
  }
}

export const config={schedule:'15 11 * * *'};
